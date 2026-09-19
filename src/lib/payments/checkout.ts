import "server-only";

import type Stripe from "stripe";
import { z } from "zod";

import { normalizeEmail } from "@/lib/domain/admin";
import { positiveMoneySchema } from "@/lib/domain/money";
import { idempotencyKeySchema } from "@/lib/domain/notifications";
import { entityIdSchema, positiveVersionSchema } from "@/lib/domain/validation";
import type { Money } from "@/types/domain";

import { requireStripeClient, type StripeProviderClient } from "./client";
import {
  getStripeApplicationOrigin,
  stripeModeSchema,
  stripeModeForEnvironment,
  type StripeMode,
  validateStripeApplicationOrigin,
} from "./config";

const STRIPE_MAX_UNIT_AMOUNT = 99_999_999;
const checkoutSessionIdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^cs_(?:test|live)_[A-Za-z0-9_]+$/u);
const paymentIntentIdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^pi_[A-Za-z0-9_]+$/u);
const checkoutStatusSchema = z.enum(["open", "complete", "expired"]);
const checkoutTimestampSchema = z
  .number()
  .int()
  .nonnegative()
  .max(253_402_300_799);

const normalizedEmailSchema = z
  .string()
  .transform((value) => normalizeEmail(value))
  .pipe(z.email().max(254));

export const trustedStripeCheckoutInputSchema = z
  .object({
    paymentId: entityIdSchema,
    commissionId: entityIdSchema,
    quoteVersion: positiveVersionSchema,
    kind: z.literal("final").default("final"),
    providerIdempotencyKey: idempotencyKeySchema,
    customerEmail: normalizedEmailSchema,
    amount: positiveMoneySchema.refine(
      ({ amountMinor }) => amountMinor <= STRIPE_MAX_UNIT_AMOUNT,
      "Amount exceeds Stripe's per-item limit",
    ),
  })
  .strict();

export interface TrustedStripeCheckoutInput {
  readonly paymentId: string;
  readonly commissionId: string;
  readonly quoteVersion: number;
  readonly kind?: "final";
  readonly providerIdempotencyKey: string;
  readonly customerEmail: string;
  readonly amount: Money;
}

export interface StripeCheckoutRequest {
  readonly params: Stripe.Checkout.SessionCreateParams;
  readonly idempotencyKey: string;
}

export interface HostedCheckoutSession {
  readonly id: string;
  readonly url: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly paymentIntentId: string | null;
}

export interface RetrievedHostedCheckoutSession {
  readonly id: string;
  readonly url: string | null;
  readonly status: "open" | "complete" | "expired";
  readonly mode: "payment";
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly paymentIntentId: string | null;
}

export type StripeCheckoutClient = Pick<StripeProviderClient, "checkout">;

function buildReturnUrl(
  applicationOrigin: string,
  commissionId: string,
  state: "processing" | "cancelled",
): string {
  const url = new URL(
    `/app/commissions/${encodeURIComponent(commissionId)}`,
    applicationOrigin,
  );
  url.searchParams.set("payment", state);
  return url.toString();
}

export function buildHostedCheckoutRequest(
  inputValue: TrustedStripeCheckoutInput,
  applicationOriginValue: string,
): StripeCheckoutRequest {
  const input = trustedStripeCheckoutInputSchema.parse(inputValue);
  const applicationOrigin = validateStripeApplicationOrigin(
    applicationOriginValue,
  );
  const metadata = Object.freeze({
    commission_id: input.commissionId,
    payment_id: input.paymentId,
    payment_kind: input.kind,
    provider_idempotency_key: input.providerIdempotencyKey,
    quote_version: String(input.quoteVersion),
  });

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    ui_mode: "hosted_page",
    locale: "en",
    client_reference_id: input.paymentId,
    customer_email: input.customerEmail,
    success_url: buildReturnUrl(
      applicationOrigin,
      input.commissionId,
      "processing",
    ),
    cancel_url: buildReturnUrl(
      applicationOrigin,
      input.commissionId,
      "cancelled",
    ),
    metadata,
    payment_intent_data: {
      metadata,
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.amount.currency.toLowerCase(),
          unit_amount: input.amount.amountMinor,
          product_data: {
            name: "Custom jewelry commission — final payment",
          },
        },
      },
    ],
  };

  return Object.freeze({
    params,
    idempotencyKey: input.providerIdempotencyKey,
  });
}

function parsePaymentIntentId(
  value: string | { readonly id: string } | null,
): string | null {
  const candidate = typeof value === "string" ? value : (value?.id ?? null);
  if (candidate === null) {
    return null;
  }

  const parsed = paymentIntentIdSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new TypeError("Stripe returned an invalid PaymentIntent ID.");
  }
  return parsed.data;
}

function parseHostedCheckoutUrl(value: string | null): string {
  if (!value) {
    throw new TypeError("Stripe did not return a hosted Checkout URL.");
  }

  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "checkout.stripe.com" ||
    url.username ||
    url.password
  ) {
    throw new TypeError("Stripe returned an invalid hosted Checkout URL.");
  }
  return url.toString();
}

function validateCheckoutSessionId(
  sessionIdValue: unknown,
  expectedMode: StripeMode,
): string {
  const sessionId = checkoutSessionIdSchema.safeParse(sessionIdValue);
  if (!sessionId.success) {
    throw new TypeError("Stripe returned an invalid Checkout Session ID.");
  }

  const liveSession = sessionId.data.startsWith("cs_live_");
  if (liveSession !== (expectedMode === "live")) {
    throw new TypeError(
      "Stripe Checkout returned a session from the wrong mode.",
    );
  }
  return sessionId.data;
}

interface CheckoutTimes {
  readonly createdAt: string;
  readonly expiresAt: string;
}

function parseCheckoutTimes(
  createdAtValue: number,
  expiresAtValue: number,
): CheckoutTimes {
  const createdAt = new Date(
    checkoutTimestampSchema.parse(createdAtValue) * 1_000,
  );
  const expiresAt = new Date(
    checkoutTimestampSchema.parse(expiresAtValue) * 1_000,
  );
  if (
    !Number.isFinite(createdAt.getTime()) ||
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt <= createdAt
  ) {
    throw new TypeError("Stripe Checkout returned invalid timestamps.");
  }
  return Object.freeze({
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
}

function validateHostedPaymentSession(
  session: Stripe.Checkout.Session,
  expectedMode: StripeMode,
): void {
  if (session.livemode !== (expectedMode === "live")) {
    throw new TypeError(
      "Stripe Checkout returned a session from the wrong mode.",
    );
  }
  if (session.mode !== "payment" || session.ui_mode !== "hosted_page") {
    throw new TypeError("Stripe returned a non-hosted payment session.");
  }
}

export interface CreateHostedCheckoutOptions {
  readonly client?: StripeCheckoutClient | undefined;
  readonly applicationOrigin?: string | undefined;
  readonly mode?: StripeMode | undefined;
}

export async function createHostedCheckoutSession(
  input: TrustedStripeCheckoutInput,
  options: CreateHostedCheckoutOptions = {},
): Promise<HostedCheckoutSession> {
  const mode = stripeModeSchema.parse(
    options.mode ?? stripeModeForEnvironment(process.env.NODE_ENV),
  );
  const applicationOrigin =
    options.applicationOrigin ?? getStripeApplicationOrigin();
  const request = buildHostedCheckoutRequest(input, applicationOrigin);
  const client =
    options.client ??
    (await requireStripeClient({
      expectedMode: mode,
    }));

  const session = await client.checkout.sessions.create(request.params, {
    idempotencyKey: request.idempotencyKey,
  });

  validateHostedPaymentSession(session, mode);
  const id = validateCheckoutSessionId(session.id, mode);
  const status = checkoutStatusSchema.safeParse(session.status);
  if (!status.success || status.data !== "open") {
    throw new TypeError("Stripe returned an inactive Checkout Session.");
  }
  const times = parseCheckoutTimes(session.created, session.expires_at);

  return Object.freeze({
    id,
    url: parseHostedCheckoutUrl(session.url),
    ...times,
    paymentIntentId: parsePaymentIntentId(session.payment_intent),
  });
}

export interface RetrieveHostedCheckoutOptions {
  readonly client?: StripeCheckoutClient | undefined;
  readonly mode?: StripeMode | undefined;
}

export async function retrieveHostedCheckoutSession(
  checkoutSessionIdValue: string,
  options: RetrieveHostedCheckoutOptions = {},
): Promise<RetrievedHostedCheckoutSession> {
  const mode = stripeModeSchema.parse(
    options.mode ?? stripeModeForEnvironment(process.env.NODE_ENV),
  );
  const checkoutSessionId = validateCheckoutSessionId(
    checkoutSessionIdValue,
    mode,
  );
  const client =
    options.client ??
    (await requireStripeClient({
      expectedMode: mode,
    }));
  const session = await client.checkout.sessions.retrieve(checkoutSessionId);

  validateHostedPaymentSession(session, mode);
  const id = validateCheckoutSessionId(session.id, mode);
  if (id !== checkoutSessionId) {
    throw new TypeError("Stripe returned the wrong Checkout Session.");
  }
  const status = checkoutStatusSchema.safeParse(session.status);
  if (!status.success) {
    throw new TypeError("Stripe returned an invalid Checkout Session status.");
  }
  const url = session.url === null ? null : parseHostedCheckoutUrl(session.url);
  if (status.data === "open" && url === null) {
    throw new TypeError("Stripe returned an active session without a URL.");
  }
  const times = parseCheckoutTimes(session.created, session.expires_at);

  return Object.freeze({
    id,
    url,
    status: status.data,
    mode: "payment",
    ...times,
    paymentIntentId: parsePaymentIntentId(session.payment_intent),
  });
}
