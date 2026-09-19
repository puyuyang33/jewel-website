import "server-only";

import type Stripe from "stripe";

import {
  StripeConfigurationError,
  stripeModeForEnvironment,
  type StripeMode,
  validateStripeSecretKey,
} from "./config";

export type StripeProviderClient = Pick<Stripe, "checkout" | "webhooks">;

let stripeClientPromise: Promise<StripeProviderClient> | undefined;

async function instantiateStripeClient(
  secretKey: string,
): Promise<StripeProviderClient> {
  const { default: StripeClient } = await import("stripe");
  return new StripeClient(secretKey, {
    appInfo: {
      name: "Veyra Atelier",
      version: "0.1.0",
    },
    maxNetworkRetries: 2,
  });
}

export interface GetStripeClientOptions {
  readonly secretKey?: string | undefined;
  readonly expectedMode?: StripeMode | undefined;
}

export async function getStripeClient(
  options: GetStripeClientOptions = {},
): Promise<StripeProviderClient | null> {
  const secretKeyValue = options.secretKey ?? process.env.STRIPE_SECRET_KEY;
  if (!secretKeyValue) {
    return null;
  }

  const mode =
    options.expectedMode ?? stripeModeForEnvironment(process.env.NODE_ENV);
  const secretKey = validateStripeSecretKey(secretKeyValue, mode);

  if (options.secretKey !== undefined) {
    return instantiateStripeClient(secretKey);
  }

  stripeClientPromise ??= instantiateStripeClient(secretKey);
  return stripeClientPromise;
}

export async function requireStripeClient(
  options: GetStripeClientOptions = {},
): Promise<StripeProviderClient> {
  const client = await getStripeClient(options);
  if (!client) {
    throw new StripeConfigurationError(
      "STRIPE_NOT_CONFIGURED",
      "Stripe is not configured.",
    );
  }
  return client;
}
