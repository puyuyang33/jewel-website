import { describe, expect, it } from "vitest";

import {
  createOAuthCallbackUrl,
  createSignInPath,
  DEFAULT_AUTH_REDIRECT,
  isProtectedAuthPath,
  safeInternalRedirect,
} from "@/lib/auth/redirects";

describe("safeInternalRedirect", () => {
  it("preserves a customer deep link and allowed query string", () => {
    const target =
      "/app/commissions/7d255b26-1cf2-4d1d-b2cf-ec65027cfd42?payment=pending";

    expect(safeInternalRedirect(target)).toBe(target);
    expect(
      new URL(
        createSignInPath(target),
        "https://veyra.invalid",
      ).searchParams.get("next"),
    ).toBe(target);
    expect(
      createOAuthCallbackUrl(
        "https://atelier.example",
        target,
      ).searchParams.get("next"),
    ).toBe(target);
  });

  it("preserves admin routes and their query string", () => {
    expect(safeInternalRedirect("/admin/commissions/active?tab=payment")).toBe(
      "/admin/commissions/active?tab=payment",
    );
  });

  it.each([
    "https://attacker.example/app",
    "//attacker.example/app",
    "///attacker.example/app",
    "/app\\attacker",
    "/app%2fattacker",
    "/app%2Fattacker",
    "/app%5cattacker",
    "/app%255cattacker",
    "/app/../sign-in",
    "/app/./commissions",
    "/app#fragment",
    "app",
    "",
  ])("rejects unsafe redirect %s", (value) => {
    expect(safeInternalRedirect(value)).toBe(DEFAULT_AUTH_REDIRECT);
  });

  it.each([
    "/",
    "/about",
    "/portfolio",
    "/sign-in",
    "/auth/callback",
    "/api/health",
    "/portal",
    "/projects",
    "/messages",
    "/account",
    "/application",
  ])("rejects public or obsolete route %s", (value) => {
    expect(safeInternalRedirect(value)).toBe(DEFAULT_AUTH_REDIRECT);
    expect(isProtectedAuthPath(value)).toBe(false);
  });

  it.each(["/app", "/app/commissions/active", "/admin", "/admin/inbox"])(
    "marks private route %s as protected",
    (value) => {
      expect(isProtectedAuthPath(value)).toBe(true);
    },
  );

  it("keeps encoded separators inside query values without treating them as path separators", () => {
    const target = "/app/commissions/active?return=%2Fapp%2Fpayments";
    expect(safeInternalRedirect(target)).toBe(target);
  });

  it("never returns an unsafe caller-provided fallback", () => {
    expect(safeInternalRedirect("/public", "https://attacker.example")).toBe(
      DEFAULT_AUTH_REDIRECT,
    );
  });
});
