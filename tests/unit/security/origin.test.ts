import { describe, expect, it } from "vitest";

import {
  assertRequestOrigin,
  isAllowedOrigin,
  isRequestOriginAllowed,
  normalizeOrigin,
  RequestOriginError,
} from "@/lib/security/origin";

describe("request origin validation", () => {
  it("normalizes secure origins and standard ports", () => {
    expect(normalizeOrigin("https://atelier.example:443")).toBe(
      "https://atelier.example",
    );
    expect(normalizeOrigin("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
  });

  it.each([
    "http://atelier.example",
    "https://user:password@atelier.example",
    "https://atelier.example/path",
    "null",
    "https://atelier.example, https://attacker.example",
  ])("rejects invalid origin %s", (origin) => {
    expect(normalizeOrigin(origin)).toBeNull();
  });

  it("compares normalized origins exactly", () => {
    expect(
      isAllowedOrigin("https://atelier.example:443", [
        "https://atelier.example",
      ]),
    ).toBe(true);
    expect(
      isAllowedOrigin("https://evilatelier.example", [
        "https://atelier.example",
      ]),
    ).toBe(false);
  });

  it("requires an allowlisted Origin for state-changing requests", () => {
    const accepted = new Request("https://atelier.example/action", {
      method: "POST",
      headers: { origin: "https://atelier.example" },
    });
    const missing = new Request("https://atelier.example/action", {
      method: "POST",
    });

    expect(
      isRequestOriginAllowed(accepted, {
        allowedOrigins: ["https://atelier.example"],
      }),
    ).toBe(true);
    expect(
      isRequestOriginAllowed(missing, {
        allowedOrigins: ["https://atelier.example"],
      }),
    ).toBe(false);
    expect(() =>
      assertRequestOrigin(missing, {
        allowedOrigins: ["https://atelier.example"],
      }),
    ).toThrow(RequestOriginError);
  });

  it("allows safe methods without requiring an Origin header", () => {
    const request = new Request("https://atelier.example/resource");
    expect(
      isRequestOriginAllowed(request, {
        allowedOrigins: ["https://atelier.example"],
      }),
    ).toBe(true);
  });
});
