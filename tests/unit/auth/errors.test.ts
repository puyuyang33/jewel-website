import { describe, expect, it } from "vitest";

import {
  AuthenticationError,
  getSafeAuthErrorPayload,
  getSignInErrorMessage,
  toAuthenticationError,
} from "@/lib/auth/errors";
import { getSafeErrorDetails } from "@/lib/security/safe-error";
import { SupabaseConfigurationError } from "@/lib/supabase/config";

describe("safe authentication errors", () => {
  it("maps provider rate limits without exposing provider details", () => {
    const error = toAuthenticationError({
      code: "over_request_rate_limit",
      message: "secret provider detail",
      status: 429,
    });

    expect(error.code).toBe("rate_limited");
    expect(error.publicMessage).not.toContain("secret");
  });

  it("maps configuration failures to a clear safe state", () => {
    const error = toAuthenticationError(new SupabaseConfigurationError());
    expect(error.code).toBe("configuration");
    expect(error.status).toBe(503);
  });

  it("uses a generic response for unknown errors", () => {
    const payload = getSafeAuthErrorPayload(
      new Error("postgres://user:password@private-host/database"),
    );

    expect(payload.error.code).toBe("unexpected");
    expect(JSON.stringify(payload)).not.toContain("password");
    expect(JSON.stringify(payload)).not.toContain("private-host");
  });

  it("only renders messages selected from the fixed error catalog", () => {
    expect(getSignInErrorMessage("access_denied")).toBe(
      new AuthenticationError("access_denied").publicMessage,
    );
    expect(getSignInErrorMessage("raw provider error")).toBe(
      new AuthenticationError("unexpected").publicMessage,
    );
  });

  it("integrates with the application-wide safe error serializer", () => {
    expect(getSafeErrorDetails(new AuthenticationError("forbidden"))).toEqual({
      code: "forbidden",
      message: "You do not have permission to perform this action.",
      status: 403,
    });
  });
});
