import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { securityLogger } from "@/lib/security/logger";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("structured security logging", () => {
  it("redacts URLs, email addresses, credentials, and error messages", () => {
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    securityLogger.info("security.redaction_test", {
      email: "person@example.com",
      destination: "postgres://user:password@private.example/database",
      authorization: "Bearer secret-token",
      failure: new Error("private database details"),
    });

    const serialized = String(consoleSpy.mock.calls[0]?.[0]);
    const entry = JSON.parse(serialized) as {
      event: string;
      context: Record<string, unknown>;
    };

    expect(entry.event).toBe("security.redaction_test");
    expect(serialized).not.toContain("person@example.com");
    expect(serialized).not.toContain("private.example");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("private database details");
  });
});
