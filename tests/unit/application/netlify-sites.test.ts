import { describe, expect, it } from "vitest";

import { validateDistinctNetlifySiteIds } from "@/lib/security/netlify-sites";

describe("Netlify site isolation", () => {
  it("accepts distinct site IDs", () => {
    expect(validateDistinctNetlifySiteIds("preview-id", "demo-id")).toEqual({
      demo: "demo-id",
      preview: "preview-id",
    });
  });

  it("rejects missing or identical site IDs", () => {
    expect(() => validateDistinctNetlifySiteIds("", "demo-id")).toThrow(
      /PREVIEW_SITE_ID is required/u,
    );
    expect(() => validateDistinctNetlifySiteIds("same-id", "SAME-ID")).toThrow(
      /must identify different/u,
    );
  });
});
