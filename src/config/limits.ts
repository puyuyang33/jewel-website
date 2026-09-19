import { deployment } from "@/config/deployment";

export const limits = {
  messageTextCharacters: 4_000,
  counterofferExplanationCharacters: 2_000,
  imagesPerMessage: 4,
  imagesPerRequest: 10,
  imageMegabytes: deployment.imageUploadMegabytes,
  imageBytes: deployment.imageUploadMegabytes * 1024 * 1024,
  allowedImageMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  signedUrlLifetimeSeconds: 300,
  messagePageSize: 40,
} as const;

export type AllowedImageMimeType =
  (typeof limits.allowedImageMimeTypes)[number];
