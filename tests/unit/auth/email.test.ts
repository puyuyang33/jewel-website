import { describe, expect, it } from "vitest";

import { normalizeEmail, parseNormalizedEmail } from "@/lib/auth/email";
import { deriveTrustedRole, isConfiguredAdminEmail } from "@/lib/auth/roles";

describe("email normalization", () => {
  it("normalizes case, surrounding whitespace, and compatibility characters", () => {
    expect(normalizeEmail("  Ａdmin@Example.COM  ")).toBe("admin@example.com");
  });

  it("returns null for malformed or non-string input", () => {
    expect(parseNormalizedEmail("not-an-email")).toBeNull();
    expect(parseNormalizedEmail(null)).toBeNull();
  });

  it("compares the configured sync email after normalization", () => {
    expect(
      isConfiguredAdminEmail(" Admin@Example.com ", "admin@example.com"),
    ).toBe(true);
    expect(
      isConfiguredAdminEmail("client@example.com", "admin@example.com"),
    ).toBe(false);
  });

  it("derives the role only from a trusted active-allowlist decision", () => {
    expect(deriveTrustedRole(true)).toBe("admin");
    expect(deriveTrustedRole(false)).toBe("client");
  });
});
