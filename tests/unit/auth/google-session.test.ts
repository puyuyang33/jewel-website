import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  hasLinkedGoogleIdentity,
  hasOAuthAuthenticationMethod,
  isVerifiedGoogleUser,
} from "@/lib/auth/profiles";

describe("Google OAuth session enforcement", () => {
  it("accepts Supabase object and RFC string OAuth AMR entries", () => {
    expect(
      hasOAuthAuthenticationMethod([
        { method: "oauth", timestamp: 1_725_000_000 },
      ]),
    ).toBe(true);
    expect(hasOAuthAuthenticationMethod(["oauth"])).toBe(true);
  });

  it("rejects password, missing, and malformed AMR claims", () => {
    expect(
      hasOAuthAuthenticationMethod([
        { method: "password", timestamp: 1_725_000_000 },
      ]),
    ).toBe(false);
    expect(hasOAuthAuthenticationMethod(undefined)).toBe(false);
    expect(hasOAuthAuthenticationMethod([{ method: 42 }])).toBe(false);
  });

  it("requires an actual linked Google identity, not provider metadata", () => {
    expect(hasLinkedGoogleIdentity([{ provider: "google" }])).toBe(true);
    expect(hasLinkedGoogleIdentity([])).toBe(false);
    expect(hasLinkedGoogleIdentity(undefined)).toBe(false);
    expect(hasLinkedGoogleIdentity([{ provider: "email" }])).toBe(false);
    expect(
      isVerifiedGoogleUser({
        app_metadata: { provider: "google", providers: ["google"] },
        email_confirmed_at: "2026-09-18T12:00:00.000Z",
        identities: [],
      }),
    ).toBe(false);
  });
});
