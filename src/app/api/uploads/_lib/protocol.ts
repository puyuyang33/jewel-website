import { SafeApplicationError } from "@/lib/security/safe-error";

export const protocolErrorCodes = [
  "BAD_REQUEST",
  "CONTENT_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "LOCKED",
  "RATE_LIMITED",
  "INVALID_WEBHOOK",
  "DEPENDENCY_UNAVAILABLE",
] as const;

export type ProtocolErrorCode = (typeof protocolErrorCodes)[number];

const protocolErrorDetails: Record<
  ProtocolErrorCode,
  { message: string; status: number }
> = {
  BAD_REQUEST: {
    message: "The request was invalid.",
    status: 400,
  },
  CONTENT_TOO_LARGE: {
    message: "The request is too large.",
    status: 413,
  },
  UNSUPPORTED_MEDIA_TYPE: {
    message: "The request content type is not supported.",
    status: 415,
  },
  FORBIDDEN: {
    message: "You do not have permission to perform this action.",
    status: 403,
  },
  NOT_FOUND: {
    message: "The requested resource was not found.",
    status: 404,
  },
  CONFLICT: {
    message: "The request conflicts with the current resource state.",
    status: 409,
  },
  LOCKED: {
    message: "This resource is not available.",
    status: 423,
  },
  RATE_LIMITED: {
    message: "Too many requests. Please wait and try again.",
    status: 429,
  },
  INVALID_WEBHOOK: {
    message: "The webhook could not be verified.",
    status: 400,
  },
  DEPENDENCY_UNAVAILABLE: {
    message: "The service is temporarily unavailable. Please try again.",
    status: 503,
  },
};

export class ProtocolError extends SafeApplicationError<ProtocolErrorCode> {
  constructor(code: ProtocolErrorCode) {
    super({ code, ...protocolErrorDetails[code] });
    this.name = "ProtocolError";
  }
}

export function safeProtocolErrorResponse(error: unknown): Response {
  const safeError =
    error instanceof SafeApplicationError
      ? error
      : new ProtocolError("DEPENDENCY_UNAVAILABLE");
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  });

  if (safeError.status === 429) {
    headers.set("Retry-After", "60");
  }

  return Response.json(
    {
      error: {
        code: safeError.code,
        message: safeError.publicMessage,
      },
    },
    {
      status: safeError.status,
      headers,
    },
  );
}

function parseContentLength(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) {
    throw new ProtocolError("BAD_REQUEST");
  }

  const length = Number(value);
  if (!Number.isSafeInteger(length)) {
    throw new ProtocolError("CONTENT_TOO_LARGE");
  }
  return length;
}

export async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError("maxBytes must be a positive safe integer");
  }

  const declaredLength = parseContentLength(
    request.headers.get("content-length"),
  );
  if (declaredLength !== null && declaredLength > maxBytes) {
    throw new ProtocolError("CONTENT_TOO_LARGE");
  }
  if (request.body === null) {
    throw new ProtocolError("BAD_REQUEST");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        throw new ProtocolError("CONTENT_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (byteLength === 0) {
    throw new ProtocolError("BAD_REQUEST");
  }
  if (declaredLength !== null && declaredLength !== byteLength) {
    throw new ProtocolError("BAD_REQUEST");
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function isJsonContentType(value: string | null): boolean {
  if (!value) {
    return false;
  }
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase();
  return (
    mediaType === "application/json" || mediaType?.endsWith("+json") === true
  );
}

export async function readBoundedJson(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  if (!isJsonContentType(request.headers.get("content-type"))) {
    throw new ProtocolError("UNSUPPORTED_MEDIA_TYPE");
  }

  try {
    const bytes = await readBoundedBody(request, maxBytes);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof SafeApplicationError) {
      throw error;
    }
    throw new ProtocolError("BAD_REQUEST");
  }
}

export async function readBoundedMultipartFormData(
  request: Request,
  maxBytes: number,
): Promise<FormData> {
  const contentType = request.headers.get("content-type");
  if (
    !contentType ||
    contentType.length > 1_000 ||
    !/^multipart\/form-data\s*;/iu.test(contentType) ||
    !/(?:^|;)\s*boundary=(?:"[^"\r\n]{1,200}"|[^;\s\r\n]{1,200})(?:;|$)/iu.test(
      contentType,
    )
  ) {
    throw new ProtocolError("UNSUPPORTED_MEDIA_TYPE");
  }

  const body = await readBoundedBody(request, maxBytes);
  const bodyBuffer = new ArrayBuffer(body.byteLength);
  new Uint8Array(bodyBuffer).set(body);
  try {
    return await new Response(bodyBuffer, {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    throw new ProtocolError("BAD_REQUEST");
  }
}

interface RateLimitWindow {
  count: number;
  resetAt: number;
}

const localRateLimits = new Map<string, RateLimitWindow>();
let nextRateLimitSweepAt = 0;

export function enforceLocalRateLimit(
  scope: string,
  subject: string,
  limit: number,
  windowMilliseconds: number,
  now: number = Date.now(),
): void {
  if (
    !/^[a-z][a-z0-9_-]{1,63}$/u.test(scope) ||
    subject.length === 0 ||
    subject.length > 1_024 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    !Number.isSafeInteger(windowMilliseconds) ||
    windowMilliseconds < 1
  ) {
    throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
  }

  if (now >= nextRateLimitSweepAt || localRateLimits.size > 10_000) {
    for (const [key, window] of localRateLimits) {
      if (window.resetAt <= now) {
        localRateLimits.delete(key);
      }
    }
    nextRateLimitSweepAt = now + 60_000;
  }

  const key = `${scope}\0${subject}`;
  const current = localRateLimits.get(key);
  if (!current || current.resetAt <= now) {
    localRateLimits.set(key, {
      count: 1,
      resetAt: now + windowMilliseconds,
    });
    return;
  }

  if (current.count >= limit) {
    throw new ProtocolError("RATE_LIMITED");
  }
  current.count += 1;
}

export function isDatabaseConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "23505" || error.code === "23514")
  );
}
