import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

import { limits } from "@/config/limits";

import { SafeApplicationError } from "./safe-error";

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ValidatedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export const imageValidationDefaults = {
  maxBytes: limits.imageBytes,
  maxWidth: 8_000,
  maxHeight: 8_000,
  maxPixels: 40_000_000,
  outputMaxDimension: 3_200,
} as const;

export type ImageValidationCode =
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_IMAGE"
  | "MIME_MISMATCH"
  | "INVALID_IMAGE"
  | "IMAGE_DIMENSIONS"
  | "ANIMATED_IMAGE";

const imageValidationMessages: Record<ImageValidationCode, string> = {
  EMPTY_FILE: "Choose an image to upload.",
  FILE_TOO_LARGE: "The image is too large.",
  UNSUPPORTED_IMAGE: "Only JPEG, PNG, and WebP images are accepted.",
  MIME_MISMATCH: "The image contents do not match its file type.",
  INVALID_IMAGE: "The image could not be read.",
  IMAGE_DIMENSIONS: "The image dimensions are not supported.",
  ANIMATED_IMAGE: "Animated images are not supported.",
};

export class ImageValidationError extends SafeApplicationError<ImageValidationCode> {
  constructor(code: ImageValidationCode) {
    super({
      code,
      message: imageValidationMessages[code],
      status: 400,
    });
    this.name = "ImageValidationError";
  }
}

export type ImageBinary =
  | ArrayBuffer
  | ArrayBufferView
  | Blob
  | {
      arrayBuffer(): Promise<ArrayBuffer>;
      size: number;
      type?: string;
    };

export interface ImageValidationOptions {
  declaredMimeType?: string | null;
  maxBytes?: number;
  maxWidth?: number;
  maxHeight?: number;
  maxPixels?: number;
}

export interface ValidatedImage {
  bytes: Buffer;
  mimeType: ValidatedImageMimeType;
  extension: "jpg" | "png" | "webp";
  width: number;
  height: number;
}

export interface NormalizedImage {
  bytes: Buffer;
  mimeType: "image/webp";
  extension: "webp";
  width: number;
  height: number;
}

function isAllowedMimeType(value: string): value is ValidatedImageMimeType {
  return ALLOWED_IMAGE_MIME_TYPES.some((mimeType) => mimeType === value);
}

function resolvePositiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0
    ? (value as number)
    : fallback;
}

async function readImageBytes(
  input: ImageBinary,
  maxBytes: number,
): Promise<Buffer> {
  if (
    typeof input === "object" &&
    input !== null &&
    "size" in input &&
    typeof input.size === "number" &&
    input.size > maxBytes
  ) {
    throw new ImageValidationError("FILE_TOO_LARGE");
  }

  let bytes: Buffer;
  if (input instanceof ArrayBuffer) {
    bytes = Buffer.from(input);
  } else if (ArrayBuffer.isView(input)) {
    bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  } else if (
    typeof input === "object" &&
    input !== null &&
    "arrayBuffer" in input &&
    typeof input.arrayBuffer === "function"
  ) {
    bytes = Buffer.from(await input.arrayBuffer());
  } else {
    throw new ImageValidationError("INVALID_IMAGE");
  }

  if (bytes.length === 0) {
    throw new ImageValidationError("EMPTY_FILE");
  }
  if (bytes.length > maxBytes) {
    throw new ImageValidationError("FILE_TOO_LARGE");
  }

  return bytes;
}

function extensionForMime(
  mimeType: ValidatedImageMimeType,
): ValidatedImage["extension"] {
  if (mimeType === "image/jpeg") {
    return "jpg";
  }
  return mimeType === "image/png" ? "png" : "webp";
}

export async function validateImageFile(
  input: ImageBinary,
  options: ImageValidationOptions = {},
): Promise<ValidatedImage> {
  const maxBytes = resolvePositiveInteger(
    options.maxBytes,
    imageValidationDefaults.maxBytes,
  );
  const maxWidth = resolvePositiveInteger(
    options.maxWidth,
    imageValidationDefaults.maxWidth,
  );
  const maxHeight = resolvePositiveInteger(
    options.maxHeight,
    imageValidationDefaults.maxHeight,
  );
  const maxPixels = resolvePositiveInteger(
    options.maxPixels,
    imageValidationDefaults.maxPixels,
  );
  const bytes = await readImageBytes(input, maxBytes);
  let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>;

  try {
    detected = await fileTypeFromBuffer(Uint8Array.from(bytes));
  } catch {
    throw new ImageValidationError("INVALID_IMAGE");
  }

  if (!detected || !isAllowedMimeType(detected.mime)) {
    throw new ImageValidationError("UNSUPPORTED_IMAGE");
  }

  const declaredMimeType = options.declaredMimeType
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (declaredMimeType && declaredMimeType !== detected.mime) {
    throw new ImageValidationError("MIME_MISMATCH");
  }

  try {
    const metadata = await sharp(bytes, {
      failOn: "error",
      limitInputPixels: maxPixels,
      sequentialRead: true,
    }).metadata();
    const width = metadata.width;
    const height = metadata.height;

    if (!width || !height) {
      throw new ImageValidationError("INVALID_IMAGE");
    }
    if (width > maxWidth || height > maxHeight || width * height > maxPixels) {
      throw new ImageValidationError("IMAGE_DIMENSIONS");
    }
    if ((metadata.pages ?? 1) !== 1) {
      throw new ImageValidationError("ANIMATED_IMAGE");
    }
    const expectedFormat =
      detected.mime === "image/jpeg"
        ? "jpeg"
        : detected.mime === "image/png"
          ? "png"
          : "webp";
    if (metadata.format !== expectedFormat) {
      throw new ImageValidationError("MIME_MISMATCH");
    }

    return {
      bytes,
      mimeType: detected.mime,
      extension: extensionForMime(detected.mime),
      width,
      height,
    };
  } catch (error) {
    if (error instanceof ImageValidationError) {
      throw error;
    }
    throw new ImageValidationError("INVALID_IMAGE");
  }
}

export async function normalizeImageFile(
  input: ImageBinary,
  options: ImageValidationOptions & { outputMaxDimension?: number } = {},
): Promise<NormalizedImage> {
  const validated = await validateImageFile(input, options);
  const outputMaxDimension = resolvePositiveInteger(
    options.outputMaxDimension,
    imageValidationDefaults.outputMaxDimension,
  );
  const maxBytes = resolvePositiveInteger(
    options.maxBytes,
    imageValidationDefaults.maxBytes,
  );
  const maxPixels = resolvePositiveInteger(
    options.maxPixels,
    imageValidationDefaults.maxPixels,
  );

  try {
    const { data, info } = await sharp(validated.bytes, {
      failOn: "error",
      limitInputPixels: maxPixels,
      sequentialRead: true,
    })
      .rotate()
      .resize({
        width: outputMaxDimension,
        height: outputMaxDimension,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ effort: 4, quality: 88 })
      .toBuffer({ resolveWithObject: true });

    if (data.length > maxBytes) {
      throw new ImageValidationError("FILE_TOO_LARGE");
    }

    return {
      bytes: data,
      mimeType: "image/webp",
      extension: "webp",
      width: info.width,
      height: info.height,
    };
  } catch (error) {
    if (error instanceof ImageValidationError) {
      throw error;
    }
    throw new ImageValidationError("INVALID_IMAGE");
  }
}

export const inspectImageFile = validateImageFile;
export const normalizeUploadedImage = normalizeImageFile;
