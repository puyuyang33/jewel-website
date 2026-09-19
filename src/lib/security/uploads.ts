import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

import { requireUser } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { VeyraSupabaseClient } from "@/lib/supabase/types";

import {
  type ImageBinary,
  type ImageValidationOptions,
  normalizeImageFile,
  validateImageFile,
} from "./image-validation";
import { SafeApplicationError } from "./safe-error";

export const uploadPurposes = [
  "project",
  "message",
  "portfolio",
  "avatar",
] as const;
export type UploadPurpose = (typeof uploadPurposes)[number];

const bucketByPurpose: Record<UploadPurpose, string> = {
  project: "commission-private",
  message: "commission-private",
  portfolio: "portfolio-public",
  avatar: "commission-private",
};

const ownerIdSchema = z.uuid();
const pathSchema =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(?:project|message|portfolio|avatar)\/[0-9a-f-]{36}\.webp$/i;

export interface AuthorizedImageUpload {
  ownerId: string;
  purpose: UploadPurpose;
  bucket: string;
  path: string;
  bytes: Buffer;
  mimeType: "image/webp";
  sha256Hex: string;
  width: number;
  height: number;
}

export interface FinalizedImageUpload {
  bucket: string;
  path: string;
  mimeType: "image/webp";
  sha256Hex: string;
  byteSize: number;
  width: number;
  height: number;
}

type ImageUploadErrorCode = "UPLOAD_FORBIDDEN" | "IMAGE_UPLOAD_FAILED";

const uploadErrorDetails: Record<
  ImageUploadErrorCode,
  { message: string; status: number }
> = {
  UPLOAD_FORBIDDEN: {
    message: "You do not have permission to upload this image.",
    status: 403,
  },
  IMAGE_UPLOAD_FAILED: {
    message: "The image could not be saved. Please try again.",
    status: 503,
  },
};

export class ImageUploadError extends SafeApplicationError<ImageUploadErrorCode> {
  constructor(code: ImageUploadErrorCode = "IMAGE_UPLOAD_FAILED") {
    const details = uploadErrorDetails[code];
    super({ code, ...details });
    this.name = "ImageUploadError";
  }
}

export function createUnpredictableImagePath(
  ownerId: string,
  purpose: UploadPurpose,
  idFactory: () => string = randomUUID,
): string {
  const parsedOwnerId = ownerIdSchema.safeParse(ownerId);
  if (!parsedOwnerId.success || !uploadPurposes.includes(purpose)) {
    throw new ImageUploadError("UPLOAD_FORBIDDEN");
  }

  const randomId = idFactory();
  if (!z.uuid().safeParse(randomId).success) {
    throw new ImageUploadError("UPLOAD_FORBIDDEN");
  }

  return `${parsedOwnerId.data}/${purpose}/${randomId}.webp`;
}

export async function authorizeImageUpload(
  input: ImageBinary,
  purpose: UploadPurpose,
  options: ImageValidationOptions & { outputMaxDimension?: number } = {},
): Promise<AuthorizedImageUpload> {
  const user = await requireUser();
  if (
    !uploadPurposes.includes(purpose) ||
    (purpose === "portfolio" && user.role !== "admin")
  ) {
    throw new ImageUploadError("UPLOAD_FORBIDDEN");
  }
  const image = await normalizeImageFile(input, options);
  const sha256Hex = createHash("sha256").update(image.bytes).digest("hex");

  return {
    ownerId: user.id,
    purpose,
    bucket: bucketByPurpose[purpose],
    path: createUnpredictableImagePath(user.id, purpose),
    bytes: image.bytes,
    mimeType: image.mimeType,
    sha256Hex,
    width: image.width,
    height: image.height,
  };
}

function isAuthorizedPath(
  upload: AuthorizedImageUpload,
  userId: string,
): boolean {
  return (
    upload.ownerId === userId &&
    upload.path.startsWith(`${userId}/${upload.purpose}/`) &&
    upload.bucket === bucketByPurpose[upload.purpose] &&
    pathSchema.test(upload.path)
  );
}

export async function finalizeImageUpload(
  upload: AuthorizedImageUpload,
  supabase?: VeyraSupabaseClient,
): Promise<FinalizedImageUpload> {
  const user = await requireUser();
  if (
    !isAuthorizedPath(upload, user.id) ||
    (upload.purpose === "portfolio" && user.role !== "admin")
  ) {
    throw new ImageUploadError("UPLOAD_FORBIDDEN");
  }

  const checkedImage = await validateImageFile(upload.bytes, {
    declaredMimeType: "image/webp",
  });
  if (
    checkedImage.width !== upload.width ||
    checkedImage.height !== upload.height ||
    createHash("sha256").update(upload.bytes).digest("hex") !== upload.sha256Hex
  ) {
    throw new ImageUploadError("UPLOAD_FORBIDDEN");
  }

  const storageClient = supabase ?? (await createServerSupabaseClient());
  const { error } = await storageClient.storage
    .from(upload.bucket)
    .upload(upload.path, upload.bytes, {
      cacheControl: "31536000",
      contentType: "image/webp",
      upsert: false,
    });

  if (error) {
    throw new ImageUploadError();
  }

  return {
    bucket: upload.bucket,
    path: upload.path,
    mimeType: upload.mimeType,
    sha256Hex: upload.sha256Hex,
    byteSize: upload.bytes.length,
    width: upload.width,
    height: upload.height,
  };
}

export async function authorizeAndFinalizeImageUpload(
  input: ImageBinary,
  purpose: UploadPurpose,
  options: ImageValidationOptions & { outputMaxDimension?: number } = {},
): Promise<FinalizedImageUpload> {
  const upload = await authorizeImageUpload(input, purpose, options);
  return finalizeImageUpload(upload);
}

export const prepareImageUpload = authorizeImageUpload;
export const finalizeAuthorizedImageUpload = finalizeImageUpload;
