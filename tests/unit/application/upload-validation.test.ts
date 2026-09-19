import { describe, expect, it } from "vitest";

import { validateQueuedImages } from "@/features/uploads/use-image-upload-queue";
import { limits } from "@/config/limits";

function image(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("image upload queue validation", () => {
  it("accepts supported images and rejects count, type, and size violations", () => {
    expect(validateQueuedImages([image("ring.jpg", "image/jpeg", 12)], 4)).toBe(
      null,
    );
    expect(
      validateQueuedImages(
        [image("one.jpg", "image/jpeg", 1), image("two.jpg", "image/jpeg", 1)],
        1,
      ),
    ).toMatch(/no more than 1 image/i);
    expect(
      validateQueuedImages([image("notes.txt", "text/plain", 12)], 4),
    ).toMatch(/not a JPEG/i);
    expect(
      validateQueuedImages(
        [image("large.png", "image/png", limits.imageBytes + 1)],
        4,
      ),
    ).toMatch(new RegExp(`${limits.imageMegabytes} MB`, "i"));
  });
});
