import "server-only";

import { z } from "zod";

import {
  requireAdmin,
  requireUser,
  type AuthenticatedUserDto,
} from "@/lib/auth/dal";
import { limits } from "@/config/limits";
import { requireSupabaseConfiguration } from "@/lib/supabase/config";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { VeyraSupabaseClient } from "@/lib/supabase/types";

import {
  enforceLocalRateLimit,
  ProtocolError,
  safeProtocolErrorResponse,
} from "../../../uploads/_lib/protocol";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const entityIdSchema = z.uuid();
const privateImagePathSchema =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(?:project|message)\/[0-9a-f-]{36}\.webp$/iu;

export type PrivateAttachmentKind = "message" | "request" | "draft";

export interface PrivateAttachmentAccessRecord {
  readonly id: string;
  readonly kind: PrivateAttachmentKind;
  readonly bucket: string;
  readonly objectPath: string;
  readonly customerId: string;
  readonly ownerId: string | null;
  readonly published: boolean;
}

export interface AttachmentRepository {
  findById(id: string): Promise<PrivateAttachmentAccessRecord | null>;
  createSignedUrl(record: PrivateAttachmentAccessRecord): Promise<string>;
}

export interface AttachmentRouteDependencies {
  readonly requireUser: () => Promise<AuthenticatedUserDto>;
  readonly requireAdmin: () => Promise<AuthenticatedUserDto>;
  readonly enforceRateLimit: (userId: string) => void | Promise<void>;
  readonly createRepository: () => Promise<AttachmentRepository>;
  readonly storageOrigin: () => string;
}

function requireData<T>(result: {
  data: T;
  error: unknown;
}): NonNullable<T> | null {
  if (result.error) {
    throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
  }
  return result.data as NonNullable<T> | null;
}

function storageObjectIsValid(record: PrivateAttachmentAccessRecord): boolean {
  const purpose = record.objectPath.split("/")[1];
  return (
    record.bucket === "commission-private" &&
    record.objectPath.length <= 1_024 &&
    privateImagePathSchema.test(record.objectPath) &&
    (record.kind === "message" ? purpose === "message" : purpose === "project")
  );
}

function canOpenAttachment(
  user: AuthenticatedUserDto,
  record: PrivateAttachmentAccessRecord,
): boolean {
  if (!storageObjectIsValid(record)) {
    return false;
  }
  if (record.kind === "draft" && !record.published) {
    return false;
  }
  if (user.role === "admin") {
    return true;
  }
  if (record.customerId !== user.id) {
    return false;
  }

  switch (record.kind) {
    case "message":
      return true;
    case "request":
      return record.ownerId === user.id;
    case "draft":
      return true;
  }
}

function requireTrustedSignedUrl(
  value: string,
  storageOriginValue: string,
): string {
  if (value.length < 1 || value.length > 8_192) {
    throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
  }

  let expected: URL;
  let candidate: URL;
  try {
    expected = new URL(storageOriginValue);
    candidate = new URL(value, expected);
  } catch {
    throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
  }

  if (
    candidate.origin !== expected.origin ||
    candidate.username ||
    candidate.password ||
    !candidate.pathname.startsWith(
      "/storage/v1/object/sign/commission-private/",
    )
  ) {
    throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
  }
  return candidate.toString();
}

export function createSupabaseAttachmentRepository(
  userClient: VeyraSupabaseClient,
  serviceClient: VeyraSupabaseClient,
): AttachmentRepository {
  return {
    async findById(id) {
      const [
        messageAttachmentResult,
        requestAttachmentResult,
        draftAssetResult,
      ] = await Promise.all([
        userClient
          .from("message_attachments")
          .select("id, message_id, owner_id, bucket_id, object_path")
          .eq("id", id)
          .maybeSingle(),
        userClient
          .from("design_request_attachments")
          .select("id, design_request_id, owner_id, bucket_id, object_path")
          .eq("id", id)
          .maybeSingle(),
        userClient
          .from("draft_revision_assets")
          .select("id, draft_revision_id, bucket_id, object_path")
          .eq("id", id)
          .maybeSingle(),
      ]);
      const messageAttachment = requireData(messageAttachmentResult);
      const requestAttachment = requireData(requestAttachmentResult);
      const draftAsset = requireData(draftAssetResult);
      const matches = [messageAttachment, requestAttachment, draftAsset].filter(
        Boolean,
      ).length;
      if (matches > 1) {
        throw new ProtocolError("CONFLICT");
      }

      if (messageAttachment) {
        if (messageAttachment.message_id === null) {
          return null;
        }
        const message = requireData(
          await userClient
            .from("messages")
            .select("conversation_id")
            .eq("id", messageAttachment.message_id)
            .maybeSingle(),
        );
        if (!message) {
          throw new ProtocolError("NOT_FOUND");
        }
        const conversation = requireData(
          await userClient
            .from("conversations")
            .select("customer_id")
            .eq("id", message.conversation_id)
            .maybeSingle(),
        );
        if (!conversation) {
          throw new ProtocolError("NOT_FOUND");
        }
        return {
          id: messageAttachment.id,
          kind: "message",
          bucket: messageAttachment.bucket_id,
          objectPath: messageAttachment.object_path,
          customerId: conversation.customer_id,
          ownerId: messageAttachment.owner_id,
          published: true,
        };
      }

      if (requestAttachment) {
        const designRequest = requireData(
          await userClient
            .from("design_requests")
            .select("customer_id")
            .eq("id", requestAttachment.design_request_id)
            .maybeSingle(),
        );
        if (!designRequest) {
          throw new ProtocolError("NOT_FOUND");
        }
        return {
          id: requestAttachment.id,
          kind: "request",
          bucket: requestAttachment.bucket_id,
          objectPath: requestAttachment.object_path,
          customerId: designRequest.customer_id,
          ownerId: requestAttachment.owner_id,
          published: true,
        };
      }

      if (!draftAsset) {
        return null;
      }
      const revision = requireData(
        await userClient
          .from("draft_revisions")
          .select("design_draft_id, published_at")
          .eq("id", draftAsset.draft_revision_id)
          .maybeSingle(),
      );
      if (!revision) {
        throw new ProtocolError("NOT_FOUND");
      }
      const draft = requireData(
        await userClient
          .from("design_drafts")
          .select("commission_id, published_at")
          .eq("id", revision.design_draft_id)
          .maybeSingle(),
      );
      if (!draft) {
        throw new ProtocolError("NOT_FOUND");
      }
      const commission = requireData(
        await userClient
          .from("commissions")
          .select("customer_id")
          .eq("id", draft.commission_id)
          .maybeSingle(),
      );
      if (!commission) {
        throw new ProtocolError("NOT_FOUND");
      }
      return {
        id: draftAsset.id,
        kind: "draft",
        bucket: draftAsset.bucket_id,
        objectPath: draftAsset.object_path,
        customerId: commission.customer_id,
        ownerId: null,
        published:
          revision.published_at !== null && draft.published_at !== null,
      };
    },

    async createSignedUrl(record) {
      const { data, error } = await serviceClient.storage
        .from(record.bucket)
        .createSignedUrl(record.objectPath, limits.signedUrlLifetimeSeconds);
      if (error || !data?.signedUrl) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
      return data.signedUrl;
    },
  };
}

const defaultDependencies: AttachmentRouteDependencies = {
  requireUser,
  requireAdmin,
  enforceRateLimit(userId) {
    enforceLocalRateLimit("attachment_open", userId, 60, 60_000);
  },
  async createRepository() {
    return createSupabaseAttachmentRepository(
      await createServerSupabaseClient(),
      createServiceRoleClient(),
    );
  },
  storageOrigin() {
    return requireSupabaseConfiguration().url;
  },
};

export function createAttachmentOpenHandler(
  dependencies: Partial<AttachmentRouteDependencies> = {},
): (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response> {
  const deps = { ...defaultDependencies, ...dependencies };

  return async function attachmentOpenHandler(
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    try {
      const user = await deps.requireUser();
      if (user.role === "admin") {
        const admin = await deps.requireAdmin();
        if (admin.id !== user.id) {
          throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
        }
      }
      await deps.enforceRateLimit(user.id);

      const id = entityIdSchema.safeParse((await context.params).id);
      if (!id.success) {
        throw new ProtocolError("NOT_FOUND");
      }
      const repository = await deps.createRepository();
      const record = await repository.findById(id.data);
      if (!record || !canOpenAttachment(user, record)) {
        throw new ProtocolError("NOT_FOUND");
      }

      const signedUrl = requireTrustedSignedUrl(
        await repository.createSignedUrl(record),
        deps.storageOrigin(),
      );
      return new Response(null, {
        status: 303,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          Location: signedUrl,
          Pragma: "no-cache",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      const response = safeProtocolErrorResponse(error);
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    }
  };
}

export const GET = createAttachmentOpenHandler();
