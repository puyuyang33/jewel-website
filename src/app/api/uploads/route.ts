import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import {
  requireAdmin,
  requireUser,
  type AuthenticatedUserDto,
} from "@/lib/auth/dal";
import { limits } from "@/config/limits";
import { uploadFileNameSchema } from "@/lib/domain/files";
import { assertRequestOrigin } from "@/lib/security/origin";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  normalizeImageFile,
  type NormalizedImage,
} from "@/lib/security/image-validation";
import { securityLogger } from "@/lib/security/logger";
import { createUnpredictableImagePath } from "@/lib/security/uploads";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { VeyraSupabaseClient } from "@/lib/supabase/types";

import {
  enforceLocalRateLimit,
  isDatabaseConflict,
  ProtocolError,
  readBoundedMultipartFormData,
  safeProtocolErrorResponse,
} from "./_lib/protocol";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const MAX_MULTIPART_BYTES = limits.imageBytes + MULTIPART_OVERHEAD_BYTES;

export const imageUploadPurposes = [
  "request",
  "message",
  "draft",
  "portfolio",
] as const;
export type ImageUploadPurpose = (typeof imageUploadPurposes)[number];

const purposeSchema = z.enum(imageUploadPurposes);
const entityIdSchema = z.uuid();
const altTextSchema = z.string().trim().min(1).max(300);

type UploadInput =
  | {
      purpose: "request" | "message";
      targetId: string;
      clientId: string;
      altText: null;
    }
  | {
      purpose: "draft";
      targetId: string;
      clientId: string;
      altText: null;
    }
  | {
      purpose: "portfolio";
      targetId: string;
      clientId: string;
      altText: string;
    };

interface MultipartImage {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface UploadAuthorization {
  readonly pathOwnerId: string;
  readonly currentAssetCount: number;
  readonly existingMetadataId: string | null;
}

interface StoredImage {
  readonly bucket: "commission-private" | "portfolio-public";
  readonly path: string;
  readonly bytes: Buffer;
  readonly mimeType: "image/webp";
  readonly sha256Hex: string;
  readonly width: number;
  readonly height: number;
}

interface PersistUploadInput {
  readonly request: UploadInput;
  readonly user: AuthenticatedUserDto;
  readonly authorization: UploadAuthorization;
  readonly image: StoredImage;
  readonly fileName: string;
}

export interface UploadStore {
  authorize(
    request: UploadInput,
    user: AuthenticatedUserDto,
  ): Promise<UploadAuthorization>;
  findExistingByPath(
    request: UploadInput,
    path: string,
  ): Promise<{ id: string; targetMatches: boolean } | null>;
  upload(image: StoredImage): Promise<void>;
  verifyMessageObject(input: PersistUploadInput): Promise<boolean>;
  registerMessage(
    input: PersistUploadInput,
  ): Promise<{ id: string; created: boolean }>;
  persist(input: PersistUploadInput): Promise<string>;
  remove(bucket: StoredImage["bucket"], path: string): Promise<void>;
}

export interface UploadRouteDependencies {
  readonly assertOrigin: (request: Request) => void;
  readonly requireUser: () => Promise<AuthenticatedUserDto>;
  readonly requireAdmin: () => Promise<AuthenticatedUserDto>;
  readonly enforceRateLimit: (userId: string) => void | Promise<void>;
  readonly createStore: () => Promise<UploadStore>;
  readonly normalize: (
    file: MultipartImage,
    options: {
      declaredMimeType: string;
      maxBytes: number;
    },
  ) => Promise<NormalizedImage>;
}

function isMultipartImage(value: FormDataEntryValue): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    typeof value.size === "number" &&
    typeof value.type === "string" &&
    typeof value.arrayBuffer === "function"
  );
}

function singleString(
  formData: FormData,
  key: string,
  required: boolean,
): string | null {
  const values = formData.getAll(key);
  if (values.length === 0 && !required) {
    return null;
  }
  if (
    values.length !== 1 ||
    typeof values[0] !== "string" ||
    values[0].length > 1_000
  ) {
    throw new ProtocolError("BAD_REQUEST");
  }
  return values[0];
}

function parseUploadForm(formData: FormData): {
  request: UploadInput;
  file: MultipartImage;
} {
  const allowedFields = new Set([
    "purpose",
    "targetId",
    "clientId",
    "altText",
    "file",
  ]);
  for (const key of formData.keys()) {
    if (!allowedFields.has(key)) {
      throw new ProtocolError("BAD_REQUEST");
    }
  }

  const purpose = purposeSchema.safeParse(
    singleString(formData, "purpose", true),
  );
  const targetId = entityIdSchema.safeParse(
    singleString(formData, "targetId", true),
  );
  const files = formData.getAll("file");
  const firstFile = files[0];
  if (
    !purpose.success ||
    !targetId.success ||
    files.length !== 1 ||
    firstFile === undefined ||
    !isMultipartImage(firstFile)
  ) {
    throw new ProtocolError("BAD_REQUEST");
  }

  const file = firstFile;
  if (
    file.size < 1 ||
    file.size > limits.imageBytes ||
    file.name.length > 255 ||
    !ALLOWED_IMAGE_MIME_TYPES.some((mimeType) => mimeType === file.type)
  ) {
    throw new ProtocolError(
      file.size > limits.imageBytes ? "CONTENT_TOO_LARGE" : "BAD_REQUEST",
    );
  }

  const clientId = entityIdSchema.safeParse(
    singleString(formData, "clientId", true),
  );
  const altText = singleString(
    formData,
    "altText",
    purpose.data === "portfolio",
  );

  switch (purpose.data) {
    case "request":
    case "message": {
      if (!clientId.success || altText !== null) {
        throw new ProtocolError("BAD_REQUEST");
      }
      return {
        request: {
          purpose: purpose.data,
          targetId: targetId.data,
          clientId: clientId.data,
          altText: null,
        },
        file,
      };
    }
    case "draft":
      if (!clientId.success || altText !== null) {
        throw new ProtocolError("BAD_REQUEST");
      }
      return {
        request: {
          purpose: "draft",
          targetId: targetId.data,
          clientId: clientId.data,
          altText: null,
        },
        file,
      };
    case "portfolio": {
      const parsedAltText = altTextSchema.safeParse(altText);
      if (!clientId.success || !parsedAltText.success) {
        throw new ProtocolError("BAD_REQUEST");
      }
      return {
        request: {
          purpose: "portfolio",
          targetId: targetId.data,
          clientId: clientId.data,
          altText: parsedAltText.data,
        },
        file,
      };
    }
  }
}

function normalizedFileName(originalName: string): string {
  const parsedName = uploadFileNameSchema.safeParse(originalName);
  if (!parsedName.success) {
    throw new ProtocolError("BAD_REQUEST");
  }

  const extensionIndex = parsedName.data.lastIndexOf(".");
  const baseName = (
    extensionIndex > 0
      ? parsedName.data.slice(0, extensionIndex)
      : parsedName.data
  )
    .trim()
    .slice(0, 250);
  return `${baseName || "image"}.webp`;
}

function storagePurpose(
  purpose: ImageUploadPurpose,
): "project" | "message" | "portfolio" {
  switch (purpose) {
    case "request":
    case "draft":
      return "project";
    case "message":
      return "message";
    case "portfolio":
      return "portfolio";
  }
}

function bucketForPurpose(purpose: ImageUploadPurpose): StoredImage["bucket"] {
  return purpose === "portfolio" ? "portfolio-public" : "commission-private";
}

function createImagePath(request: UploadInput, ownerId: string): string {
  const purpose = storagePurpose(request.purpose);
  return request.purpose === "message" ||
    request.purpose === "draft" ||
    request.purpose === "portfolio"
    ? createUnpredictableImagePath(ownerId, purpose, () => request.clientId)
    : createUnpredictableImagePath(ownerId, purpose);
}

async function rowCount(
  query: PromiseLike<{
    count: number | null;
    error: { code?: string; message?: string } | null;
  }>,
): Promise<number> {
  const { count, error } = await query;
  if (error || count === null || !Number.isSafeInteger(count) || count < 0) {
    throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
  }
  return count;
}

function requireRow<T>(
  result: { data: T; error: unknown },
  missingCode: "FORBIDDEN" | "NOT_FOUND" = "FORBIDDEN",
): NonNullable<T> {
  if (result.error) {
    throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
  }
  if (!result.data) {
    throw new ProtocolError(missingCode);
  }
  return result.data as NonNullable<T>;
}

function assertBelowLimit(count: number, limit: number): void {
  if (count >= limit) {
    throw new ProtocolError("CONFLICT");
  }
}

export function createSupabaseUploadStore(
  userClient: VeyraSupabaseClient,
  serviceClient: VeyraSupabaseClient,
): UploadStore {
  return {
    async authorize(request, user) {
      switch (request.purpose) {
        case "request": {
          const target = requireRow(
            await userClient
              .from("design_requests")
              .select("id, customer_id, status")
              .eq("id", request.targetId)
              .maybeSingle(),
          );
          if (target.customer_id !== user.id || target.status !== "draft") {
            throw new ProtocolError("FORBIDDEN");
          }

          const existing = await userClient
            .from("design_request_attachments")
            .select("id, design_request_id")
            .eq("owner_id", user.id)
            .eq("client_attachment_id", request.clientId)
            .maybeSingle();
          if (existing.error) {
            throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
          }
          if (
            existing.data &&
            existing.data.design_request_id !== request.targetId
          ) {
            throw new ProtocolError("CONFLICT");
          }

          const count = await rowCount(
            userClient
              .from("design_request_attachments")
              .select("id", { count: "exact", head: true })
              .eq("design_request_id", request.targetId),
          );
          if (!existing.data) {
            assertBelowLimit(count, 10);
          }
          return {
            pathOwnerId: user.id,
            currentAssetCount: count,
            existingMetadataId: existing.data?.id ?? null,
          };
        }
        case "message": {
          const conversation = requireRow(
            await userClient
              .from("conversations")
              .select("id, customer_id, status")
              .eq("id", request.targetId)
              .maybeSingle(),
          );
          if (
            conversation.status !== "open" ||
            (conversation.customer_id !== user.id && user.role !== "admin")
          ) {
            throw new ProtocolError("FORBIDDEN");
          }
          return {
            pathOwnerId: user.id,
            currentAssetCount: 0,
            existingMetadataId: null,
          };
        }
        case "draft": {
          const revision = requireRow(
            await userClient
              .from("draft_revisions")
              .select("id, design_draft_id, status, published_at")
              .eq("id", request.targetId)
              .maybeSingle(),
          );
          if (revision.status !== "working" || revision.published_at !== null) {
            throw new ProtocolError("CONFLICT");
          }
          const draft = requireRow(
            await userClient
              .from("design_drafts")
              .select("commission_id, status, published_at")
              .eq("id", revision.design_draft_id)
              .maybeSingle(),
          );
          if (draft.status !== "working" || draft.published_at !== null) {
            throw new ProtocolError("CONFLICT");
          }
          const commission = requireRow(
            await userClient
              .from("commissions")
              .select("customer_id")
              .eq("id", draft.commission_id)
              .maybeSingle(),
          );
          const count = await rowCount(
            userClient
              .from("draft_revision_assets")
              .select("id", { count: "exact", head: true })
              .eq("draft_revision_id", request.targetId),
          );
          return {
            pathOwnerId: commission.customer_id,
            currentAssetCount: count,
            existingMetadataId: null,
          };
        }
        case "portfolio": {
          requireRow(
            await userClient
              .from("portfolio_projects")
              .select("id")
              .eq("id", request.targetId)
              .maybeSingle(),
            "NOT_FOUND",
          );
          const count = await rowCount(
            userClient
              .from("portfolio_media")
              .select("id", { count: "exact", head: true })
              .eq("portfolio_project_id", request.targetId),
          );
          return {
            pathOwnerId: user.id,
            currentAssetCount: count,
            existingMetadataId: null,
          };
        }
      }
    },

    async findExistingByPath(request, path) {
      if (request.purpose === "draft") {
        const { data, error } = await userClient
          .from("draft_revision_assets")
          .select("id, draft_revision_id")
          .eq("object_path", path)
          .maybeSingle();
        if (error) {
          throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
        }
        return data
          ? {
              id: data.id,
              targetMatches: data.draft_revision_id === request.targetId,
            }
          : null;
      }
      if (request.purpose === "portfolio") {
        const { data, error } = await userClient
          .from("portfolio_media")
          .select("id, portfolio_project_id")
          .eq("object_path", path)
          .maybeSingle();
        if (error) {
          throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
        }
        return data
          ? {
              id: data.id,
              targetMatches: data.portfolio_project_id === request.targetId,
            }
          : null;
      }
      return null;
    },

    async upload(image) {
      const { error } = await serviceClient.storage
        .from(image.bucket)
        .upload(image.path, image.bytes, {
          cacheControl: "31536000",
          contentType: image.mimeType,
          upsert: false,
        });
      if (error) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
    },

    async verifyMessageObject(input) {
      if (input.request.purpose !== "message") {
        return false;
      }
      const { data, error } = await serviceClient.storage
        .from(input.image.bucket)
        .download(input.image.path);
      if (error || !data || data.size !== input.image.bytes.length) {
        return false;
      }
      const bytes = Buffer.from(await data.arrayBuffer());
      return (
        bytes.length === input.image.bytes.length &&
        createHash("sha256").update(bytes).digest("hex") ===
          input.image.sha256Hex
      );
    },

    async registerMessage(input) {
      if (input.request.purpose !== "message") {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
      const { data, error } = await serviceClient.rpc(
        "register_message_attachment_upload",
        {
          p_owner_id: input.user.id,
          p_client_attachment_id: input.request.clientId,
          p_object_path: input.image.path,
          p_file_name: input.fileName,
          p_mime_type: input.image.mimeType,
          p_byte_size: input.image.bytes.length,
          p_sha256_hex: input.image.sha256Hex,
        },
      );
      const row = Array.isArray(data) ? data[0] : null;
      if (
        error ||
        !row ||
        !entityIdSchema.safeParse(row.attachment_id).success
      ) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
      return {
        id: row.attachment_id,
        created: row.created,
      };
    },

    async persist(input) {
      const common = {
        bucket_id: input.image.bucket,
        object_path: input.image.path,
        file_name: input.fileName,
        mime_type: input.image.mimeType,
        byte_size: input.image.bytes.length,
        sha256_hex: input.image.sha256Hex,
      };

      let result: {
        data: { id: string } | null;
        error: unknown;
      };
      switch (input.request.purpose) {
        case "request":
          result = await serviceClient
            .from("design_request_attachments")
            .insert({
              ...common,
              design_request_id: input.request.targetId,
              owner_id: input.user.id,
              client_attachment_id: input.request.clientId,
            })
            .select("id")
            .single();
          break;
        case "message":
          throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
        case "draft":
          result = await serviceClient
            .from("draft_revision_assets")
            .insert({
              ...common,
              draft_revision_id: input.request.targetId,
              sort_order: input.authorization.currentAssetCount,
            })
            .select("id")
            .single();
          break;
        case "portfolio":
          result = await serviceClient
            .from("portfolio_media")
            .insert({
              portfolio_project_id: input.request.targetId,
              bucket_id: input.image.bucket,
              object_path: input.image.path,
              media_type: "image",
              alt_text: input.request.altText,
              width: input.image.width,
              height: input.image.height,
              sort_order: input.authorization.currentAssetCount,
            })
            .select("id")
            .single();
          break;
      }

      if (result.error || !result.data) {
        throw new ProtocolError(
          isDatabaseConflict(result.error)
            ? "CONFLICT"
            : "DEPENDENCY_UNAVAILABLE",
        );
      }
      return result.data.id;
    },

    async remove(bucket, path) {
      const { error } = await serviceClient.storage.from(bucket).remove([path]);
      if (error) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
    },
  };
}

function reusedUploadResponse(
  id: string,
  purpose: ImageUploadPurpose,
): Response {
  return Response.json(
    {
      upload: {
        id,
        purpose,
        reused: true,
      },
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function createdUploadResponse(
  id: string,
  purpose: ImageUploadPurpose,
  image: StoredImage,
): Response {
  return Response.json(
    {
      upload: {
        id,
        purpose,
        mimeType: image.mimeType,
        byteSize: image.bytes.length,
        width: image.width,
        height: image.height,
        reused: false,
      },
    },
    {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

const defaultDependencies: UploadRouteDependencies = {
  assertOrigin: assertRequestOrigin,
  requireUser,
  requireAdmin,
  enforceRateLimit(userId) {
    enforceLocalRateLimit("image_upload", userId, 20, 60_000);
  },
  async createStore() {
    return createSupabaseUploadStore(
      await createServerSupabaseClient(),
      createServiceRoleClient(),
    );
  },
  normalize: normalizeImageFile,
};

export function createUploadPostHandler(
  dependencies: Partial<UploadRouteDependencies> = {},
): (request: Request) => Promise<Response> {
  const deps = { ...defaultDependencies, ...dependencies };

  return async function uploadPostHandler(request: Request): Promise<Response> {
    try {
      deps.assertOrigin(request);
      const user = await deps.requireUser();
      await deps.enforceRateLimit(user.id);
      const formData = await readBoundedMultipartFormData(
        request,
        MAX_MULTIPART_BYTES,
      );
      const parsed = parseUploadForm(formData);
      if (
        parsed.request.purpose === "draft" ||
        parsed.request.purpose === "portfolio"
      ) {
        const admin = await deps.requireAdmin();
        if (admin.id !== user.id) {
          throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
        }
      }

      const store = await deps.createStore();
      const authorization = await store.authorize(parsed.request, user);
      if (authorization.existingMetadataId) {
        return reusedUploadResponse(
          authorization.existingMetadataId,
          parsed.request.purpose,
        );
      }

      const imagePath = createImagePath(
        parsed.request,
        authorization.pathOwnerId,
      );
      if (
        parsed.request.purpose === "draft" ||
        parsed.request.purpose === "portfolio"
      ) {
        const existing = await store.findExistingByPath(
          parsed.request,
          imagePath,
        );
        if (existing) {
          if (!existing.targetMatches) {
            throw new ProtocolError("CONFLICT");
          }
          return reusedUploadResponse(existing.id, parsed.request.purpose);
        }
        assertBelowLimit(
          authorization.currentAssetCount,
          parsed.request.purpose === "draft" ? 20 : 30,
        );
      }

      const normalized = await deps.normalize(parsed.file, {
        declaredMimeType: parsed.file.type,
        maxBytes: limits.imageBytes,
      });
      const image: StoredImage = {
        bucket: bucketForPurpose(parsed.request.purpose),
        path: imagePath,
        bytes: normalized.bytes,
        mimeType: normalized.mimeType,
        sha256Hex: createHash("sha256").update(normalized.bytes).digest("hex"),
        width: normalized.width,
        height: normalized.height,
      };
      const persistenceInput: PersistUploadInput = {
        request: parsed.request,
        user,
        authorization,
        image,
        fileName: normalizedFileName(parsed.file.name),
      };

      let objectCreated = false;
      try {
        try {
          await store.upload(image);
          objectCreated = true;
        } catch (uploadError) {
          if (parsed.request.purpose !== "message") {
            throw uploadError;
          }
          try {
            if (!(await store.verifyMessageObject(persistenceInput))) {
              throw uploadError;
            }
            const registration = await store.registerMessage(persistenceInput);
            return registration.created
              ? createdUploadResponse(
                  registration.id,
                  parsed.request.purpose,
                  image,
                )
              : reusedUploadResponse(registration.id, parsed.request.purpose);
          } catch {
            throw uploadError;
          }
        }

        if (parsed.request.purpose === "message") {
          const registration = await store.registerMessage(persistenceInput);
          return registration.created
            ? createdUploadResponse(
                registration.id,
                parsed.request.purpose,
                image,
              )
            : reusedUploadResponse(registration.id, parsed.request.purpose);
        }

        const metadataId = await store.persist(persistenceInput);
        return createdUploadResponse(metadataId, parsed.request.purpose, image);
      } catch (error) {
        if (objectCreated) {
          try {
            await store.remove(image.bucket, image.path);
          } catch {
            securityLogger.warn("upload.cleanup_failed", {
              purpose: parsed.request.purpose,
            });
          }
        }
        throw error;
      }
    } catch (error) {
      return safeProtocolErrorResponse(error);
    }
  };
}

export const POST = createUploadPostHandler();
