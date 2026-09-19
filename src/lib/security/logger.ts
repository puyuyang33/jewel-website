import "server-only";

const REDACTED = "[REDACTED]";
const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s]+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const SENSITIVE_KEY =
  /(?:authorization|cookie|token|secret|password|passcode|api[-_]?key|service[-_]?role|email|url|uri|oauth|redirect|avatar|signed)/i;

type LogPrimitive = boolean | number | string | null;
export type LogContext = Record<string, unknown>;

function redactString(value: string): string {
  return value
    .replace(URL_PATTERN, "[REDACTED_URL]")
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(BEARER_PATTERN, "[REDACTED_TOKEN]")
    .replace(JWT_PATTERN, "[REDACTED_TOKEN]")
    .slice(0, 500);
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 3) {
    return REDACTED;
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value as LogPrimitive;
  }
  if (typeof value === "string") {
    return redactString(value);
  }
  if (value instanceof Error) {
    return { name: value.name };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const output: LogContext = {};
    for (const [key, nestedValue] of Object.entries(value).slice(0, 40)) {
      output[key] = SENSITIVE_KEY.test(key)
        ? REDACTED
        : sanitizeValue(nestedValue, depth + 1);
    }
    return output;
  }
  return String(typeof value);
}

function write(
  level: "error" | "info" | "warn",
  event: string,
  context: LogContext,
): void {
  const safeEvent = /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(event)
    ? event
    : "application.event";
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event: safeEvent,
    context: sanitizeValue(context, 0),
  });

  if (level === "error") {
    console.error(entry);
  } else if (level === "warn") {
    console.warn(entry);
  } else {
    console.info(entry);
  }
}

export const securityLogger = {
  info(event: string, context: LogContext = {}) {
    write("info", event, context);
  },
  warn(event: string, context: LogContext = {}) {
    write("warn", event, context);
  },
  error(event: string, context: LogContext = {}) {
    write("error", event, context);
  },
};
