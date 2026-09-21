import "server-only";

import {
  LOCAL_APPLICATION_ORIGIN,
  normalizeOrigin,
} from "@/lib/security/origin";
import {
  stripeModeSchema,
  stripeSecretKeySchema,
  stripeWebhookSecretSchema,
} from "@/lib/providers/configuration-schemas";

export { stripeModeSchema } from "@/lib/providers/configuration-schemas";

export type StripeMode = "test" | "live";

export type StripeConfigurationErrorCode =
  | "INVALID_STRIPE_MODE"
  | "INVALID_SECRET_KEY"
  | "SECRET_KEY_MODE_MISMATCH"
  | "EVENT_MODE_MISMATCH"
  | "INVALID_WEBHOOK_SECRET"
  | "INVALID_APPLICATION_ORIGIN"
  | "STRIPE_NOT_CONFIGURED"
  | "WEBHOOK_NOT_CONFIGURED";

export class StripeConfigurationError extends Error {
  readonly code: StripeConfigurationErrorCode;

  constructor(code: StripeConfigurationErrorCode, message: string) {
    super(message);
    this.name = "StripeConfigurationError";
    this.code = code;
  }
}

export function stripeModeForEnvironment(
  nodeEnvironment = process.env.NODE_ENV,
  configuredMode = process.env.STRIPE_MODE,
): StripeMode {
  if (configuredMode !== undefined) {
    const parsed = stripeModeSchema.safeParse(configuredMode);
    if (!parsed.success) {
      throw new StripeConfigurationError(
        "INVALID_STRIPE_MODE",
        "Stripe mode configuration must be test or live.",
      );
    }
    return parsed.data;
  }
  return nodeEnvironment === "production" ? "live" : "test";
}

export function getStripeSecretKeyMode(secretKeyValue: unknown): StripeMode {
  const parsed = stripeSecretKeySchema.safeParse(secretKeyValue);
  if (!parsed.success) {
    throw new StripeConfigurationError(
      "INVALID_SECRET_KEY",
      "Stripe secret key configuration is invalid.",
    );
  }

  return parsed.data.startsWith("sk_live_") ? "live" : "test";
}

export function validateStripeSecretKey(
  secretKeyValue: unknown,
  expectedModeValue: StripeMode,
): string {
  const expectedMode = stripeModeSchema.parse(expectedModeValue);
  const parsed = stripeSecretKeySchema.safeParse(secretKeyValue);
  if (!parsed.success) {
    throw new StripeConfigurationError(
      "INVALID_SECRET_KEY",
      "Stripe secret key configuration is invalid.",
    );
  }

  if (getStripeSecretKeyMode(parsed.data) !== expectedMode) {
    throw new StripeConfigurationError(
      "SECRET_KEY_MODE_MISMATCH",
      `Stripe ${expectedMode} mode requires a matching secret key.`,
    );
  }

  return parsed.data;
}

export function validateStripeWebhookSecret(secretValue: unknown): string {
  const parsed = stripeWebhookSecretSchema.safeParse(secretValue);
  if (!parsed.success) {
    throw new StripeConfigurationError(
      "INVALID_WEBHOOK_SECRET",
      "Stripe webhook secret configuration is invalid.",
    );
  }
  return parsed.data;
}

export function validateStripeApplicationOrigin(originValue: unknown): string {
  if (typeof originValue !== "string") {
    throw new StripeConfigurationError(
      "INVALID_APPLICATION_ORIGIN",
      "The application origin is not configured.",
    );
  }

  const origin = normalizeOrigin(originValue);
  if (!origin) {
    throw new StripeConfigurationError(
      "INVALID_APPLICATION_ORIGIN",
      "The application origin is invalid.",
    );
  }
  return origin;
}

export function getStripeApplicationOrigin(
  configuredOrigin = process.env.NEXT_PUBLIC_APP_URL,
  nodeEnvironment = process.env.NODE_ENV,
): string {
  const origin =
    normalizeOrigin(configuredOrigin) ??
    (nodeEnvironment === "production" ? null : LOCAL_APPLICATION_ORIGIN);

  if (!origin) {
    throw new StripeConfigurationError(
      "INVALID_APPLICATION_ORIGIN",
      "The application origin is not configured.",
    );
  }
  return origin;
}
