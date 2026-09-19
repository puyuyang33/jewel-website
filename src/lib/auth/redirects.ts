export const DEFAULT_AUTH_REDIRECT = "/app";

export const AUTH_REDIRECT_ALLOWLIST = ["/app", "/admin"] as const;

const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;
const ENCODED_PATH_SEPARATOR = /%(?:25)*(?:2f|5c)/i;

export function isProtectedAuthPath(
  pathname: string,
  allowlist: readonly string[] = AUTH_REDIRECT_ALLOWLIST,
): boolean {
  return allowlist.some(
    (allowedPath) =>
      pathname === allowedPath || pathname.startsWith(`${allowedPath}/`),
  );
}

function parseSafePath(
  value: unknown,
  allowlist: readonly string[],
): string | null {
  const rawPathname =
    typeof value === "string" ? (value.split(/[?#]/, 1)[0] ?? "") : "";

  if (
    typeof value !== "string" ||
    value.length > 2_048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    CONTROL_OR_BACKSLASH.test(value) ||
    ENCODED_PATH_SEPARATOR.test(rawPathname)
  ) {
    return null;
  }

  try {
    const candidate = new URL(value, "https://veyra.invalid");
    if (
      candidate.origin !== "https://veyra.invalid" ||
      candidate.username ||
      candidate.password ||
      candidate.hash ||
      candidate.pathname !== rawPathname ||
      !isProtectedAuthPath(candidate.pathname, allowlist)
    ) {
      return null;
    }

    return `${candidate.pathname}${candidate.search}`;
  } catch {
    return null;
  }
}

export function safeInternalRedirect(
  value: unknown,
  fallback = DEFAULT_AUTH_REDIRECT,
  allowlist: readonly string[] = AUTH_REDIRECT_ALLOWLIST,
): string {
  const safeFallback =
    parseSafePath(fallback, allowlist) ?? DEFAULT_AUTH_REDIRECT;
  return parseSafePath(value, allowlist) ?? safeFallback;
}

export function createSignInPath(next: unknown, errorCode?: string): string {
  const parameters = new URLSearchParams({
    next: safeInternalRedirect(next),
  });

  if (errorCode) {
    parameters.set("error", errorCode);
  }

  return `/sign-in?${parameters.toString()}`;
}

export function createOAuthCallbackUrl(
  applicationOrigin: string,
  next: unknown,
): URL {
  const callbackUrl = new URL("/auth/callback", applicationOrigin);
  callbackUrl.searchParams.set("next", safeInternalRedirect(next));
  return callbackUrl;
}

export const safeRedirectPath = safeInternalRedirect;
export const getSafeRedirect = safeInternalRedirect;
