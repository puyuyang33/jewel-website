import { describe, expect, it } from "vitest";

import {
  resolveDeploymentTrack,
  resolveImageUploadLimitMegabytes,
} from "@/config/deployment";

describe("deployment tracks", () => {
  it("keeps production behavior by default", () => {
    expect(resolveDeploymentTrack(undefined)).toBe("production");
    expect(resolveDeploymentTrack("unexpected")).toBe("production");
    expect(resolveImageUploadLimitMegabytes("production")).toBe(4);
  });

  it("uses the Netlify-safe upload limit for free demos", () => {
    expect(resolveDeploymentTrack("free-demo")).toBe("free-demo");
    expect(resolveImageUploadLimitMegabytes("free-demo")).toBe(4);
  });
});
