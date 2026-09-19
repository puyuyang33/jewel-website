import { z } from "zod";

import { limits } from "@/config/limits";
import type { AllowedImageMimeType } from "@/config/limits";

export const allowedImageMimeTypeSchema = z.enum(limits.allowedImageMimeTypes);

export const uploadFileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((name) => name !== "." && name !== "..", "File name is invalid")
  .refine((name) => !name.includes("/") && !name.includes("\\"), {
    message: "File name must not contain a path",
  })
  .refine((name) => !/[\u0000-\u001f\u007f]/u.test(name), {
    message: "File name must not contain control characters",
  });

export const uploadFileMetadataSchema = z
  .object({
    name: uploadFileNameSchema,
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(limits.imageBytes)
      .refine(Number.isSafeInteger, "File size must be a safe integer"),
    mimeType: z.string().trim().toLowerCase().pipe(allowedImageMimeTypeSchema),
  })
  .strict()
  .superRefine((file, context) => {
    if (!fileNameMatchesMimeType(file.name, file.mimeType)) {
      context.addIssue({
        code: "custom",
        message: "File extension does not match its MIME type",
        path: ["name"],
      });
    }
  });

export type UploadContext = "message" | "design_request";

export interface UploadFileMetadata {
  readonly name: string;
  readonly sizeBytes: number;
  readonly mimeType: AllowedImageMimeType;
}

function fileNameMatchesMimeType(
  name: string,
  mimeType: AllowedImageMimeType,
): boolean {
  const normalizedName = name.toLowerCase();
  switch (mimeType) {
    case "image/jpeg":
      return (
        normalizedName.endsWith(".jpg") || normalizedName.endsWith(".jpeg")
      );
    case "image/png":
      return normalizedName.endsWith(".png");
    case "image/webp":
      return normalizedName.endsWith(".webp");
  }
}

export function maximumFilesForContext(context: UploadContext): number {
  switch (context) {
    case "message":
      return limits.imagesPerMessage;
    case "design_request":
      return limits.imagesPerRequest;
  }
}

export function uploadFileBatchSchema(context: UploadContext) {
  return z
    .array(uploadFileMetadataSchema)
    .min(1)
    .max(maximumFilesForContext(context));
}

export function validateUploadFiles(
  files: readonly unknown[],
  context: UploadContext,
): readonly UploadFileMetadata[] {
  const parsed = uploadFileBatchSchema(context).parse(files);
  return Object.freeze(
    parsed.map((file) =>
      Object.freeze({
        name: file.name,
        sizeBytes: file.sizeBytes,
        mimeType: file.mimeType,
      }),
    ),
  );
}
