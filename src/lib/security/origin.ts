import { SafeApplicationError } from "./safe-error";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const LOCAL_APPLICATION_ORIGIN = "http://localhost:3000";

export class RequestOriginError extends SafeApplicationError<"UNTRUSTED_ORIGIN"> {
  constructor() {
    super({
      code: "UNTRUSTED_ORIGIN",
      message: "This request could not be verified.",
      status: 403,
    });
    this.name = "RequestOriginError";
  }
}

export function normalizeOrigin(
  value: string | null | undefined,
): string | null {
  if (!value || value.length > 2_048 || value.includes(",")) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    const isLocalHttp =
      url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname.toLowerCase());

    if (
      (url.protocol !== "https:" && !isLocalHttp) ||
      url.username ||
      url.password ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function getApplicationOrigin(
  configuredOrigin = process.env.NEXT_PUBLIC_APP_URL,
): string | null {
  const normalized = normalizeOrigin(configuredOrigin);
  if (normalized) {
    return normalized;
  }

  return process.env.NODE_ENV === "production"
    ? null
    : LOCAL_APPLICATION_ORIGIN;
}

export function requireApplicationOrigin(
  configuredOrigin = process.env.NEXT_PUBLIC_APP_URL,
): string {
  const origin = getApplicationOrigin(configuredOrigin);
  if (!origin) {
    throw new RequestOriginError();
  }
  return origin;
}

export function isAllowedOrigin(
  candidate: string | null | undefined,
  allowedOrigins: readonly string[],
): boolean {
  const normalizedCandidate = normalizeOrigin(candidate);
  if (!normalizedCandidate) {
    return false;
  }

  return allowedOrigins.some(
    (allowedOrigin) => normalizeOrigin(allowedOrigin) === normalizedCandidate,
  );
}

export interface RequestOriginOptions {
  allowedOrigins?: readonly string[];
  allowSafeMethods?: boolean;
}

export function isRequestOriginAllowed(
  request: Pick<Request, "headers" | "method">,
  options: RequestOriginOptions = {},
): boolean {
  if (
    options.allowSafeMethods !== false &&
    SAFE_METHODS.has(request.method.toUpperCase())
  ) {
    return true;
  }

  const defaultOrigin = getApplicationOrigin();
  const allowedOrigins =
    options.allowedOrigins ?? (defaultOrigin === null ? [] : [defaultOrigin]);

  return isAllowedOrigin(request.headers.get("origin"), allowedOrigins);
}

export function assertRequestOrigin(
  request: Pick<Request, "headers" | "method">,
  options: RequestOriginOptions = {},
): void {
  if (!isRequestOriginAllowed(request, options)) {
    throw new RequestOriginError();
  }
}
