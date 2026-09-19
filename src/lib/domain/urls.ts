import { z } from "zod";

import { DomainError } from "./errors";

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const ENCODED_PATH_SEPARATOR_PATTERN = /%(?:2f|5c)/iu;
const HOST_LABEL_PATTERN =
  /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?!-)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/u;

export const allowedExternalHostSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => !value.endsWith("."), "Host must not end with a dot")
  .refine((value) => {
    const hostname = value.startsWith("*.") ? value.slice(2) : value;
    return HOST_LABEL_PATTERN.test(hostname);
  }, "Host is invalid")
  .refine(
    (value) => !value.startsWith("*.") || value.slice(2).includes("."),
    "Wildcard hosts must not target a top-level domain",
  );

export function normalizeAllowedExternalHosts(
  hosts: readonly string[],
): readonly string[] {
  const normalized = hosts.map((host) => allowedExternalHostSchema.parse(host));
  return Object.freeze([...new Set(normalized)]);
}

export function isExternalHostAllowed(
  hostnameValue: string,
  allowedHosts: readonly string[],
): boolean {
  const hostnameResult = allowedExternalHostSchema.safeParse(hostnameValue);
  if (!hostnameResult.success || hostnameResult.data.startsWith("*.")) {
    return false;
  }
  const hostname = hostnameResult.data;
  const normalizedHosts = normalizeAllowedExternalHosts(allowedHosts);

  return normalizedHosts.some((allowedHost) => {
    if (!allowedHost.startsWith("*.")) {
      return hostname === allowedHost;
    }
    const suffix = allowedHost.slice(1);
    return hostname.endsWith(suffix) && hostname.length > suffix.length;
  });
}

export function externalHttpsUrlSchema(allowedHosts: readonly string[]) {
  const normalizedHosts = normalizeAllowedExternalHosts(allowedHosts);

  return z
    .url()
    .max(2_048)
    .superRefine((value, context) => {
      const url = new URL(value);
      if (url.protocol !== "https:") {
        context.addIssue({
          code: "custom",
          message: "External URL must use HTTPS",
        });
      }
      if (url.username !== "" || url.password !== "") {
        context.addIssue({
          code: "custom",
          message: "External URL must not contain credentials",
        });
      }
      if (url.port !== "") {
        context.addIssue({
          code: "custom",
          message: "External URL must not use a custom port",
        });
      }
      if (url.hostname.endsWith(".")) {
        context.addIssue({
          code: "custom",
          message: "External URL host must not end with a dot",
        });
      }
      if (!isExternalHostAllowed(url.hostname, normalizedHosts)) {
        context.addIssue({
          code: "custom",
          message: "External URL host is not allowed",
        });
      }
    })
    .transform((value) => new URL(value).toString());
}

export function parseExternalHttpsUrl(
  value: unknown,
  allowedHosts: readonly string[],
): string {
  return externalHttpsUrlSchema(allowedHosts).parse(value);
}

function hasValidPercentEncoding(value: string): boolean {
  try {
    decodeURIComponent(value);
    return true;
  } catch {
    return false;
  }
}

export const internalRedirectSchema = z
  .string()
  .min(1)
  .max(2_048)
  .refine(
    (value) => value === value.trim(),
    "Redirect must not contain outer whitespace",
  )
  .refine((value) => !CONTROL_CHARACTER_PATTERN.test(value), {
    message: "Redirect must not contain control characters",
  })
  .refine((value) => value.startsWith("/") && !value.startsWith("//"), {
    message: "Redirect must be an absolute internal path",
  })
  .refine((value) => !value.includes("\\"), {
    message: "Redirect must not contain backslashes",
  })
  .refine((value) => !ENCODED_PATH_SEPARATOR_PATTERN.test(value), {
    message: "Redirect must not contain encoded path separators",
  })
  .refine(hasValidPercentEncoding, {
    message: "Redirect contains invalid percent encoding",
  })
  .refine((value) => {
    try {
      return (
        new URL(value, "https://internal.invalid").origin ===
        "https://internal.invalid"
      );
    } catch {
      return false;
    }
  }, "Redirect must stay on the application origin")
  .transform((value) => {
    const url = new URL(value, "https://internal.invalid");
    return `${url.pathname}${url.search}${url.hash}`;
  });

export function isSafeInternalRedirect(value: unknown): value is string {
  return internalRedirectSchema.safeParse(value).success;
}

export function safeInternalRedirect(value: unknown, fallback = "/"): string {
  const parsedFallback = internalRedirectSchema.safeParse(fallback);
  if (!parsedFallback.success) {
    throw new DomainError(
      "UNSAFE_REDIRECT_FALLBACK",
      "Internal redirect fallback is unsafe",
    );
  }

  const parsed = internalRedirectSchema.safeParse(value);
  return parsed.success ? parsed.data : parsedFallback.data;
}
