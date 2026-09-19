import {
  SupabaseConfigurationError,
  SUPABASE_CONFIGURATION_MESSAGE,
} from "@/lib/supabase/config";
import { SafeApplicationError } from "@/lib/security/safe-error";

export const authErrorCodes = [
  "configuration",
  "unauthenticated",
  "access_denied",
  "forbidden",
  "invalid_callback",
  "oauth_failed",
  "profile_unavailable",
  "rate_limited",
  "unexpected",
] as const;

export type AuthErrorCode = (typeof authErrorCodes)[number];

const authErrorDetails: Record<
  AuthErrorCode,
  { message: string; status: number }
> = {
  configuration: {
    message: SUPABASE_CONFIGURATION_MESSAGE,
    status: 503,
  },
  unauthenticated: {
    message: "Please sign in to continue.",
    status: 401,
  },
  access_denied: {
    message: "This account does not have access to Veyra Atelier.",
    status: 403,
  },
  forbidden: {
    message: "You do not have permission to perform this action.",
    status: 403,
  },
  invalid_callback: {
    message: "The sign-in response was invalid. Please try again.",
    status: 400,
  },
  oauth_failed: {
    message: "Google sign-in could not be completed. Please try again.",
    status: 401,
  },
  profile_unavailable: {
    message: "Your account could not be verified. Please try again.",
    status: 503,
  },
  rate_limited: {
    message: "Too many attempts. Please wait and try again.",
    status: 429,
  },
  unexpected: {
    message: "Something went wrong. Please try again.",
    status: 500,
  },
};

export class AuthenticationError extends SafeApplicationError<AuthErrorCode> {
  constructor(code: AuthErrorCode) {
    const details = authErrorDetails[code];
    super({ code, ...details });
    this.name = "AuthenticationError";
  }
}

interface ErrorLike {
  code?: unknown;
  name?: unknown;
  status?: unknown;
}

function readErrorLike(error: unknown): ErrorLike {
  return typeof error === "object" && error !== null ? error : {};
}

export function toAuthenticationError(error: unknown): AuthenticationError {
  if (error instanceof AuthenticationError) {
    return error;
  }
  if (error instanceof SupabaseConfigurationError) {
    return new AuthenticationError("configuration");
  }

  const candidate = readErrorLike(error);
  const providerCode =
    typeof candidate.code === "string" ? candidate.code.toLowerCase() : "";
  const providerStatus =
    typeof candidate.status === "number" ? candidate.status : null;

  if (
    providerCode === "over_request_rate_limit" ||
    providerCode === "over_email_send_rate_limit" ||
    providerStatus === 429
  ) {
    return new AuthenticationError("rate_limited");
  }

  if (
    providerCode === "access_denied" ||
    providerCode === "email_not_confirmed" ||
    providerCode === "user_banned"
  ) {
    return new AuthenticationError("access_denied");
  }

  if (
    providerCode === "invalid_credentials" ||
    providerCode === "bad_jwt" ||
    providerCode === "session_not_found" ||
    providerCode === "refresh_token_not_found" ||
    providerCode === "refresh_token_already_used"
  ) {
    return new AuthenticationError("unauthenticated");
  }

  if (
    providerCode === "bad_oauth_callback" ||
    providerCode === "validation_failed"
  ) {
    return new AuthenticationError("invalid_callback");
  }

  if (
    providerCode === "oauth_provider_not_supported" ||
    providerCode === "unexpected_failure"
  ) {
    return new AuthenticationError("oauth_failed");
  }

  return new AuthenticationError("unexpected");
}

export function getSignInErrorMessage(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const code = authErrorCodes.find((candidate) => candidate === value);
  return code
    ? authErrorDetails[code].message
    : authErrorDetails.unexpected.message;
}

export function getSafeAuthErrorPayload(error: unknown) {
  const safeError = toAuthenticationError(error);
  return {
    error: {
      code: safeError.code,
      message: safeError.publicMessage,
    },
  };
}
