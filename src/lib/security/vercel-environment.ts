import { Buffer } from "node:buffer";
import { z } from "zod";

import {
  deploymentTracks,
  type DeploymentTrack,
} from "../../config/deployment";
import {
  emailFromSchema,
  resendApiKeySchema,
  stripeModeSchema,
  stripeSecretKeySchema,
  stripeWebhookSecretSchema,
} from "../providers/configuration-schemas";

export const vercelDeploymentTargets = ["preview", "production"] as const;
export type VercelDeploymentTarget = (typeof vercelDeploymentTargets)[number];

const originSchema = z
  .url()
  .transform((value) => new URL(value))
  .refine(
    (url) =>
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      (url.pathname === "/" || url.pathname === "") &&
      url.search === "" &&
      url.hash === "" &&
      isDnsHostname(url.hostname),
    "must be an exact HTTPS origin without credentials, path, query, or hash",
  );
const supabaseUrlSchema = z
  .url()
  .transform((value) => new URL(value))
  .refine(
    (url) =>
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      (url.pathname === "/" || url.pathname === "") &&
      url.search === "" &&
      url.hash === "",
    "must be an HTTPS Supabase origin",
  );
const emailSchema = z.email();
const currencySchema = z.string().regex(/^[A-Z]{3}$/u);
const deploymentTrackSchema = z.enum(deploymentTracks);
const vercelTargetSchema = z.enum(vercelDeploymentTargets);

export interface VercelEnvironmentSummary {
  target: VercelDeploymentTarget;
  deploymentTrack: DeploymentTrack;
  applicationOrigin: string;
  supabaseOrigin: string;
  stripeMode: "test" | "live";
  emailEnabled: boolean;
}

export type DeploymentEnvironment = Readonly<
  Record<string, string | undefined>
>;

export class VercelEnvironmentError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid Vercel environment:\n- ${issues.join("\n- ")}`);
    this.name = "VercelEnvironmentError";
    this.issues = issues;
  }
}

export function validateVercelEnvironment(
  environment: DeploymentEnvironment,
  target: VercelDeploymentTarget,
): VercelEnvironmentSummary {
  const issues: string[] = [];
  const applicationOrigin = readParsed(
    "NEXT_PUBLIC_APP_URL",
    environment.NEXT_PUBLIC_APP_URL,
    originSchema,
    issues,
  );
  const supabaseOrigin = readParsed(
    "NEXT_PUBLIC_SUPABASE_URL",
    environment.NEXT_PUBLIC_SUPABASE_URL,
    supabaseUrlSchema,
    issues,
  );
  const deploymentTrack = readParsed(
    "NEXT_PUBLIC_DEPLOYMENT_TRACK",
    environment.NEXT_PUBLIC_DEPLOYMENT_TRACK,
    deploymentTrackSchema,
    issues,
  );
  const declaredVercelTarget = readParsed(
    "VEYRA_VERCEL_ENV",
    environment.VEYRA_VERCEL_ENV,
    vercelTargetSchema,
    issues,
  );
  const stripeMode = readParsed(
    "STRIPE_MODE",
    environment.STRIPE_MODE,
    stripeModeSchema,
    issues,
  );
  const stripeSecretKey = readParsed(
    "STRIPE_SECRET_KEY",
    environment.STRIPE_SECRET_KEY,
    stripeSecretKeySchema,
    issues,
  );

  requireSecret(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    20,
    issues,
  );
  requireSecret(
    "SUPABASE_SERVICE_ROLE_KEY",
    environment.SUPABASE_SERVICE_ROLE_KEY,
    20,
    issues,
  );
  if (
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ===
    environment.SUPABASE_SERVICE_ROLE_KEY?.trim()
  ) {
    issues.push(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be different",
    );
  }

  const adminEmail = readParsed(
    "ADMIN_GOOGLE_EMAIL",
    environment.ADMIN_GOOGLE_EMAIL,
    emailSchema,
    issues,
  );
  if (adminEmail && /(?:^|@)example\.(?:com|org|net)$/iu.test(adminEmail)) {
    issues.push(
      "ADMIN_GOOGLE_EMAIL must not use an example-domain placeholder",
    );
  }

  readParsed(
    "STRIPE_WEBHOOK_SECRET",
    environment.STRIPE_WEBHOOK_SECRET,
    stripeWebhookSecretSchema,
    issues,
  );
  if (stripeMode && stripeSecretKey) {
    const keyMode = stripeSecretKey.startsWith("sk_live_") ? "live" : "test";
    if (keyMode !== stripeMode) {
      issues.push(
        `STRIPE_MODE=${stripeMode} requires an sk_${stripeMode}_ key`,
      );
    }
  }

  if (target === "preview" && stripeMode && stripeMode !== "test") {
    issues.push("Vercel Preview must use STRIPE_MODE=test");
  }
  if (
    target === "production" &&
    deploymentTrack &&
    stripeMode &&
    ((deploymentTrack === "free-demo" && stripeMode !== "test") ||
      (deploymentTrack === "production" && stripeMode !== "live"))
  ) {
    issues.push(
      deploymentTrack === "free-demo"
        ? "A Vercel Hobby/free-demo deployment must use Stripe test mode"
        : "A production deployment track must use Stripe live mode",
    );
  }

  if (
    environment.VERCEL_ENV &&
    environment.VERCEL_ENV !== target &&
    environment.VERCEL_ENV !== "development"
  ) {
    issues.push(
      `VERCEL_ENV=${environment.VERCEL_ENV} does not match expected target ${target}`,
    );
  }
  if (declaredVercelTarget && declaredVercelTarget !== target) {
    issues.push(
      `VEYRA_VERCEL_ENV=${declaredVercelTarget} does not match expected target ${target}`,
    );
  }
  if (
    target === "preview" &&
    applicationOrigin &&
    environment.VERCEL_URL &&
    applicationOrigin.hostname ===
      normalizeVercelHostname(environment.VERCEL_URL)
  ) {
    issues.push(
      "NEXT_PUBLIC_APP_URL must use a stable Preview alias, not the immutable VERCEL_URL",
    );
  }

  validateServerActionsEncryptionKey(
    environment.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,
    issues,
  );
  requireNonPlaceholder(
    "BUSINESS_TIMEZONE",
    environment.BUSINESS_TIMEZONE,
    issues,
  );
  if (environment.BUSINESS_TIMEZONE) {
    try {
      new Intl.DateTimeFormat("en", {
        timeZone: environment.BUSINESS_TIMEZONE,
      }).format();
    } catch {
      issues.push("BUSINESS_TIMEZONE must be a valid IANA timezone");
    }
  }
  readParsed(
    "DEFAULT_CURRENCY",
    environment.DEFAULT_CURRENCY,
    currencySchema,
    issues,
  );
  validateAllowedHosts(environment.DELIVERABLE_ALLOWED_HOSTS, issues);

  const resendKey = environment.RESEND_API_KEY;
  const emailEnabled = Boolean(resendKey?.trim());
  if (emailEnabled && resendKey) {
    if (
      isPlaceholder(resendKey) ||
      !resendApiKeySchema.safeParse(resendKey).success
    ) {
      issues.push("RESEND_API_KEY must be a non-placeholder re_ key");
    }
    readParsed("EMAIL_FROM", environment.EMAIL_FROM, emailFromSchema, issues);
    readParsed(
      "ADMIN_NOTIFICATION_EMAIL",
      environment.ADMIN_NOTIFICATION_EMAIL,
      emailSchema,
      issues,
    );
  }

  if (issues.length > 0) {
    throw new VercelEnvironmentError(issues);
  }

  return {
    target,
    deploymentTrack: deploymentTrack!,
    applicationOrigin: applicationOrigin!.origin,
    supabaseOrigin: supabaseOrigin!.origin,
    stripeMode: stripeMode!,
    emailEnabled,
  };
}

function readParsed<T>(
  name: string,
  value: string | undefined,
  schema: z.ZodType<T>,
  issues: string[],
): T | null {
  if (!value || isPlaceholder(value)) {
    issues.push(`${name} is required and must not be a placeholder`);
    return null;
  }
  if (value !== value.trim()) {
    issues.push(`${name} must not contain surrounding whitespace`);
    return null;
  }
  const result = schema.safeParse(value.trim());
  if (!result.success) {
    issues.push(`${name} ${result.error.issues[0]?.message ?? "is invalid"}`);
    return null;
  }
  return result.data;
}

function requireSecret(
  name: string,
  value: string | undefined,
  minimumLength: number,
  issues: string[],
) {
  if (!value || value.trim().length < minimumLength || isPlaceholder(value)) {
    issues.push(
      `${name} is required, must be at least ${minimumLength} characters, and must not be a placeholder`,
    );
  } else if (value !== value.trim()) {
    issues.push(`${name} must not contain surrounding whitespace`);
  }
}

function requireNonPlaceholder(
  name: string,
  value: string | undefined,
  issues: string[],
) {
  if (!value?.trim() || isPlaceholder(value)) {
    issues.push(`${name} is required and must not be a placeholder`);
  } else if (value !== value.trim()) {
    issues.push(`${name} must not contain surrounding whitespace`);
  }
}

function isPlaceholder(value: string) {
  return /(?:replace[_-]?me|replace-with|your[_-]|stable[_-]?preview|candidate|placeholder|(?:^|[./@])example(?:\.(?:com|org|net))?(?:$|[/:]))/iu.test(
    value,
  );
}

function validateServerActionsEncryptionKey(
  value: string | undefined,
  issues: string[],
) {
  if (!value || isPlaceholder(value)) {
    issues.push(
      "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY is required for Vercel and must not be a placeholder",
    );
    return;
  }
  const normalized = value.trim();
  if (value !== normalized) {
    issues.push(
      "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY must not contain surrounding whitespace",
    );
    return;
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(normalized)) {
    issues.push("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY must be standard Base64");
    return;
  }
  const decoded = Buffer.from(normalized, "base64");
  if (decoded.byteLength !== 32 || decoded.toString("base64") !== normalized) {
    issues.push(
      "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY must decode to exactly 32 bytes",
    );
  }
}

function normalizeVercelHostname(value: string) {
  try {
    const candidate = value.includes("://") ? value : `https://${value}`;
    return new URL(candidate).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isDnsHostname(hostname: string) {
  return (
    hostname.length <= 253 &&
    hostname.includes(".") &&
    hostname
      .split(".")
      .every((label) =>
        /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/iu.test(label),
      )
  );
}

function validateAllowedHosts(value: string | undefined, issues: string[]) {
  if (!value?.trim() || isPlaceholder(value)) {
    issues.push(
      "DELIVERABLE_ALLOWED_HOSTS requires at least one approved hostname",
    );
    return;
  }
  const hosts = value
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (
    hosts.length === 0 ||
    hosts.some(
      (host) =>
        host.includes("://") ||
        host.includes("/") ||
        !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(host),
    )
  ) {
    issues.push(
      "DELIVERABLE_ALLOWED_HOSTS must be a comma-separated list of hostnames",
    );
  }
}
