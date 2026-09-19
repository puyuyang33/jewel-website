import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  normalizeImageFile,
  validateImageFile,
} from "@/lib/security/image-validation";

async function solidImage(
  format: "jpeg" | "png" | "webp",
  width = 12,
  height = 8,
) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 127, g: 39, b: 54, alpha: 0.8 },
    },
  })
    .toFormat(format)
    .toBuffer();
}

describe("image file validation", () => {
  it("detects a valid image from magic bytes", async () => {
    const image = await validateImageFile(await solidImage("png"), {
      declaredMimeType: "image/png",
    });

    expect(image).toMatchObject({
      mimeType: "image/png",
      extension: "png",
      width: 12,
      height: 8,
    });
  });

  it("rejects unsupported bytes even when the declared type is allowed", async () => {
    await expect(
      validateImageFile(Buffer.from("not really a jpeg"), {
        declaredMimeType: "image/jpeg",
      }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_IMAGE",
    });
  });

  it("returns a safe validation error for a truncated recognized format", async () => {
    const truncatedPng = (await solidImage("png")).subarray(0, 32);

    await expect(validateImageFile(truncatedPng)).rejects.toMatchObject({
      code: "INVALID_IMAGE",
    });
  });

  it("rejects a declared type that does not match the magic bytes", async () => {
    await expect(
      validateImageFile(await solidImage("png"), {
        declaredMimeType: "image/jpeg",
      }),
    ).rejects.toMatchObject({
      code: "MIME_MISMATCH",
    });
  });

  it("fails before processing files over the configured byte limit", async () => {
    const image = await solidImage("webp");
    await expect(
      validateImageFile(image, { maxBytes: image.length - 1 }),
    ).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
    });
  });

  it("rejects images outside the configured dimensions", async () => {
    await expect(
      validateImageFile(await solidImage("jpeg", 20, 10), {
        maxWidth: 19,
      }),
    ).rejects.toMatchObject({
      code: "IMAGE_DIMENSIONS",
    });
  });

  it("normalizes accepted images to metadata-free WebP", async () => {
    const normalized = await normalizeImageFile(
      await solidImage("png", 32, 16),
      { outputMaxDimension: 10 },
    );
    const metadata = await sharp(normalized.bytes).metadata();

    expect(normalized.mimeType).toBe("image/webp");
    expect(normalized.extension).toBe("webp");
    expect(normalized.width).toBe(10);
    expect(normalized.height).toBe(5);
    expect(metadata.format).toBe("webp");
    expect(metadata.exif).toBeUndefined();
  });
});
