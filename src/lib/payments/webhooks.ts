import "server-only";

import type Stripe from "stripe";
import { z } from "zod";

import { isoCurrencySchema, minorUnitAmountSchema } from "@/lib/domain/money";
import {
  createIdempotencyKey,
  idempotencyKeySchema,
} from "@/lib/domain/notifications";
import { entityIdSchema } from "@/lib/domain/validation";
import type { Money, PaymentEvent } from "@/types/domain";

import { requireStripeClient, type StripeProviderClient } from "./client";
import {
  StripeConfigurationError,
  stripeModeSchema,
  stripeModeForEnvironment,
  type StripeMode,
  validateStripeWebhookSecret,
} from "./config";

const MAX_WEBHOOK_BYTES = 1_048_576;

const providerIdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[\x21-\x7e]+$/u);
const eventCreatedSchema = z.number().int().nonnegative().max(253_402_300_799);
const metadataSchema = z.record(z.string(), z.string()).nullable().optional();
const metadataVersionSchema = z
  .string()
  .regex(/^[1-9]\d*$/u)
  .transform(Number)
  .pipe(z.number().int().positive().safe());

const internalReferenceSchema = z
  .object({
    commission_id: entityIdSchema,
    payment_id: entityIdSchema,
    payment_kind: z.literal("final"),
    provider_idempotency_key: idempotencyKeySchema,
    quote_version: metadataVersionSchema,
  })
  .passthrough();

const checkoutObjectSchema = z
  .object({
    id: providerIdSchema,
    object: z.literal("checkout.session"),
    amount_total: minorUnitAmountSchema.nullable(),
    currency: z.string().nullable(),
    livemode: z.boolean(),
    metadata: metadataSchema,
    mode: z.string().nullable(),
    payment_intent: z
      .union([
        providerIdSchema,
        z.object({ id: providerIdSchema }).passthrough(),
        z.null(),
      ])
      .optional()
      .default(null),
    payment_status: z.enum(["paid", "unpaid", "no_payment_required"]),
  })
  .passthrough();

const paymentIntentObjectSchema = z
  .object({
    id: providerIdSchema,
    object: z.literal("payment_intent"),
    amount: minorUnitAmountSchema,
    amount_received: minorUnitAmountSchema,
    currency: z.string(),
    livemode: z.boolean(),
    metadata: metadataSchema,
  })
  .passthrough();

const refundObjectSchema = z
  .object({
    id: providerIdSchema,
    object: z.literal("refund"),
    amount: minorUnitAmountSchema,
    charge: z
      .union([
        providerIdSchema,
        z
          .object({
            id: providerIdSchema,
            amount: minorUnitAmountSchema,
            amount_refunded: minorUnitAmountSchema,
            currency: z.string(),
          })
          .passthrough(),
        z.null(),
      ])
      .optional()
      .default(null),
    currency: z.string(),
    metadata: metadataSchema,
    payment_intent: z
      .union([
        providerIdSchema,
        z.object({ id: providerIdSchema }).passthrough(),
        z.null(),
      ])
      .optional()
      .default(null),
    status: z.string().nullable(),
  })
  .passthrough();

const chargeObjectSchema = z
  .object({
    id: providerIdSchema,
    object: z.literal("charge"),
    amount: minorUnitAmountSchema,
    amount_refunded: minorUnitAmountSchema,
    currency: z.string(),
    livemode: z.boolean(),
    metadata: metadataSchema,
    payment_intent: z
      .union([
        providerIdSchema,
        z.object({ id: providerIdSchema }).passthrough(),
        z.null(),
      ])
      .optional()
      .default(null),
    refunded: z.boolean(),
  })
  .passthrough();

const disputeObjectSchema = z
  .object({
    id: providerIdSchema,
    object: z.literal("dispute"),
    amount: minorUnitAmountSchema,
    charge: z.union([
      providerIdSchema,
      z.object({ id: providerIdSchema }).passthrough(),
    ]),
    currency: z.string(),
    livemode: z.boolean(),
    metadata: metadataSchema,
    payment_intent: z
      .union([
        providerIdSchema,
        z.object({ id: providerIdSchema }).passthrough(),
        z.null(),
      ])
      .optional()
      .default(null),
    status: z.string(),
  })
  .passthrough();

export interface StripeInternalPaymentReference {
  readonly commissionId: string;
  readonly paymentId: string;
  readonly paymentKind: "final";
  readonly providerIdempotencyKey: string;
  readonly quoteVersion: number;
}

interface StripeCommandBase {
  readonly commandId: string;
  readonly provider: "stripe";
  readonly providerEventId: string;
  readonly providerEventType: Stripe.Event.Type;
  readonly occurredAt: string;
}

export interface StripePaymentStatusCommand extends StripeCommandBase {
  readonly kind: "payment_status";
  readonly paymentEvent: Exclude<PaymentEvent, "checkout_started">;
  readonly providerObjectId: string;
  readonly providerCheckoutSessionId: string | null;
  readonly providerPaymentIntentId: string | null;
  readonly amount: Money | null;
  readonly amountReceivedMinor: number | null;
  readonly reference: StripeInternalPaymentReference | null;
}

export type StripeRefundStatus =
  | "pending"
  | "requires_action"
  | "succeeded"
  | "failed"
  | "canceled"
  | "unknown";

export interface StripeRefundCommand extends StripeCommandBase {
  readonly kind: "refund";
  readonly providerObjectId: string;
  readonly providerRefundId: string | null;
  readonly providerPaymentIntentId: string | null;
  readonly status: StripeRefundStatus;
  readonly amount: Money;
  readonly paymentAmount: Money | null;
  readonly paymentEvent: "partial_refund_succeeded" | "refund_succeeded" | null;
  readonly reference: StripeInternalPaymentReference | null;
}

export type StripeDisputeAction =
  "opened" | "updated" | "closed" | "funds_withdrawn" | "funds_reinstated";

export type StripeDisputeStatus =
  | "warning_needs_response"
  | "warning_under_review"
  | "warning_closed"
  | "needs_response"
  | "under_review"
  | "won"
  | "lost"
  | "prevented"
  | "unknown";

export interface StripeDisputeCommand extends StripeCommandBase {
  readonly kind: "dispute";
  readonly action: StripeDisputeAction;
  readonly providerDisputeId: string;
  readonly providerChargeId: string;
  readonly providerPaymentIntentId: string | null;
  readonly status: StripeDisputeStatus;
  readonly amount: Money;
  readonly reference: StripeInternalPaymentReference | null;
}

export type StripeWebhookCommand =
  StripePaymentStatusCommand | StripeRefundCommand | StripeDisputeCommand;

export type StripeWebhookClient = Pick<StripeProviderClient, "webhooks">;

function getExpandableId(
  value: string | { readonly id: string } | null,
): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
}

function toMoney(amountMinor: number, currencyValue: string): Money {
  const currency = isoCurrencySchema.parse(currencyValue.toUpperCase());
  return Object.freeze({
    amountMinor: minorUnitAmountSchema.parse(amountMinor),
    currency,
  });
}

function toOptionalMoney(
  amountMinor: number | null,
  currencyValue: string | null,
): Money | null {
  if (amountMinor === null || currencyValue === null) {
    return null;
  }
  return toMoney(amountMinor, currencyValue);
}

function getReference(
  metadata: Record<string, string> | null | undefined,
): StripeInternalPaymentReference | null {
  const parsed = internalReferenceSchema.safeParse(metadata);
  if (!parsed.success) {
    return null;
  }

  return Object.freeze({
    commissionId: parsed.data.commission_id,
    paymentId: parsed.data.payment_id,
    paymentKind: parsed.data.payment_kind,
    providerIdempotencyKey: parsed.data.provider_idempotency_key,
    quoteVersion: parsed.data.quote_version,
  });
}

function toOccurredAt(created: number): string {
  const parsed = eventCreatedSchema.parse(created);
  return new Date(parsed * 1_000).toISOString();
}

function commandBase(
  event: Stripe.Event,
  kind: StripeWebhookCommand["kind"],
): StripeCommandBase {
  const providerEventId = providerIdSchema.parse(event.id);
  return Object.freeze({
    commandId: createIdempotencyKey("stripe-command", [providerEventId, kind]),
    provider: "stripe",
    providerEventId,
    providerEventType: event.type,
    occurredAt: toOccurredAt(event.created),
  });
}

function assertMode(
  livemode: boolean,
  expectedMode: StripeMode,
  context: string,
): void {
  if (livemode !== (expectedMode === "live")) {
    throw new StripeConfigurationError(
      "EVENT_MODE_MISMATCH",
      `${context} does not match the configured Stripe mode.`,
    );
  }
}

function mapCheckoutEvent(
  event:
    | Stripe.CheckoutSessionCompletedEvent
    | Stripe.CheckoutSessionAsyncPaymentSucceededEvent
    | Stripe.CheckoutSessionAsyncPaymentFailedEvent
    | Stripe.CheckoutSessionExpiredEvent,
  expectedMode: StripeMode,
): StripePaymentStatusCommand | null {
  const checkout = checkoutObjectSchema.parse(event.data.object);
  assertMode(checkout.livemode, expectedMode, "Stripe Checkout event");
  if (checkout.mode !== "payment") {
    return null;
  }

  let paymentEvent: StripePaymentStatusCommand["paymentEvent"];
  switch (event.type) {
    case "checkout.session.completed":
      paymentEvent =
        checkout.payment_status === "unpaid"
          ? "payment_processing"
          : "payment_succeeded";
      break;
    case "checkout.session.async_payment_succeeded":
      paymentEvent = "payment_succeeded";
      break;
    case "checkout.session.async_payment_failed":
      paymentEvent = "payment_failed";
      break;
    case "checkout.session.expired":
      paymentEvent = "payment_cancelled";
      break;
  }

  return Object.freeze({
    ...commandBase(event, "payment_status"),
    kind: "payment_status",
    paymentEvent,
    providerObjectId: checkout.id,
    providerCheckoutSessionId: checkout.id,
    providerPaymentIntentId: getExpandableId(checkout.payment_intent),
    amount: toOptionalMoney(checkout.amount_total, checkout.currency),
    amountReceivedMinor:
      paymentEvent === "payment_succeeded" ? checkout.amount_total : null,
    reference: getReference(checkout.metadata),
  });
}

function mapPaymentIntentEvent(
  event:
    | Stripe.PaymentIntentProcessingEvent
    | Stripe.PaymentIntentSucceededEvent
    | Stripe.PaymentIntentPaymentFailedEvent
    | Stripe.PaymentIntentCanceledEvent,
  expectedMode: StripeMode,
): StripePaymentStatusCommand {
  const paymentIntent = paymentIntentObjectSchema.parse(event.data.object);
  assertMode(
    paymentIntent.livemode,
    expectedMode,
    "Stripe PaymentIntent event",
  );

  let paymentEvent: StripePaymentStatusCommand["paymentEvent"];
  switch (event.type) {
    case "payment_intent.processing":
      paymentEvent = "payment_processing";
      break;
    case "payment_intent.succeeded":
      paymentEvent = "payment_succeeded";
      break;
    case "payment_intent.payment_failed":
      paymentEvent = "payment_failed";
      break;
    case "payment_intent.canceled":
      paymentEvent = "payment_cancelled";
      break;
  }

  return Object.freeze({
    ...commandBase(event, "payment_status"),
    kind: "payment_status",
    paymentEvent,
    providerObjectId: paymentIntent.id,
    providerCheckoutSessionId: null,
    providerPaymentIntentId: paymentIntent.id,
    amount: toMoney(paymentIntent.amount, paymentIntent.currency),
    amountReceivedMinor: paymentIntent.amount_received,
    reference: getReference(paymentIntent.metadata),
  });
}

function normalizeRefundStatus(value: string | null): StripeRefundStatus {
  switch (value) {
    case "pending":
    case "requires_action":
    case "succeeded":
    case "failed":
    case "canceled":
      return value;
    default:
      return "unknown";
  }
}

function classifyRefundFromCharge(
  value:
    | string
    | {
        readonly id: string;
        readonly amount: number;
        readonly amount_refunded: number;
        readonly currency: string;
      }
    | null,
  status: StripeRefundStatus,
): {
  readonly paymentAmount: Money | null;
  readonly paymentEvent: "partial_refund_succeeded" | "refund_succeeded" | null;
} {
  if (status !== "succeeded" || typeof value === "string" || value === null) {
    return { paymentAmount: null, paymentEvent: null };
  }

  const paymentAmount = toMoney(value.amount, value.currency);
  return {
    paymentAmount,
    paymentEvent:
      value.amount_refunded >= value.amount
        ? "refund_succeeded"
        : "partial_refund_succeeded",
  };
}

function mapRefundEvent(
  event:
    | Stripe.RefundCreatedEvent
    | Stripe.RefundUpdatedEvent
    | Stripe.RefundFailedEvent,
): StripeRefundCommand {
  const refund = refundObjectSchema.parse(event.data.object);
  const status =
    event.type === "refund.failed"
      ? "failed"
      : normalizeRefundStatus(refund.status);
  const classification = classifyRefundFromCharge(refund.charge, status);

  return Object.freeze({
    ...commandBase(event, "refund"),
    kind: "refund",
    providerObjectId: refund.id,
    providerRefundId: refund.id,
    providerPaymentIntentId: getExpandableId(refund.payment_intent),
    status,
    amount: toMoney(refund.amount, refund.currency),
    paymentAmount: classification.paymentAmount,
    paymentEvent: classification.paymentEvent,
    reference: getReference(refund.metadata),
  });
}

function mapChargeRefundedEvent(
  event: Stripe.ChargeRefundedEvent,
  expectedMode: StripeMode,
): StripeRefundCommand {
  const charge = chargeObjectSchema.parse(event.data.object);
  assertMode(charge.livemode, expectedMode, "Stripe Charge event");
  const paymentAmount = toMoney(charge.amount, charge.currency);

  return Object.freeze({
    ...commandBase(event, "refund"),
    kind: "refund",
    providerObjectId: charge.id,
    providerRefundId: null,
    providerPaymentIntentId: getExpandableId(charge.payment_intent),
    status: "succeeded",
    amount: toMoney(charge.amount_refunded, charge.currency),
    paymentAmount,
    paymentEvent:
      charge.refunded || charge.amount_refunded >= charge.amount
        ? "refund_succeeded"
        : "partial_refund_succeeded",
    reference: getReference(charge.metadata),
  });
}

function normalizeDisputeStatus(value: string): StripeDisputeStatus {
  switch (value) {
    case "warning_needs_response":
    case "warning_under_review":
    case "warning_closed":
    case "needs_response":
    case "under_review":
    case "won":
    case "lost":
    case "prevented":
      return value;
    default:
      return "unknown";
  }
}

function disputeActionForEvent(
  type:
    | "charge.dispute.created"
    | "charge.dispute.updated"
    | "charge.dispute.closed"
    | "charge.dispute.funds_withdrawn"
    | "charge.dispute.funds_reinstated",
): StripeDisputeAction {
  switch (type) {
    case "charge.dispute.created":
      return "opened";
    case "charge.dispute.updated":
      return "updated";
    case "charge.dispute.closed":
      return "closed";
    case "charge.dispute.funds_withdrawn":
      return "funds_withdrawn";
    case "charge.dispute.funds_reinstated":
      return "funds_reinstated";
  }
}

function mapDisputeEvent(
  event:
    | Stripe.ChargeDisputeCreatedEvent
    | Stripe.ChargeDisputeUpdatedEvent
    | Stripe.ChargeDisputeClosedEvent
    | Stripe.ChargeDisputeFundsWithdrawnEvent
    | Stripe.ChargeDisputeFundsReinstatedEvent,
  expectedMode: StripeMode,
): StripeDisputeCommand {
  const dispute = disputeObjectSchema.parse(event.data.object);
  assertMode(dispute.livemode, expectedMode, "Stripe Dispute event");

  return Object.freeze({
    ...commandBase(event, "dispute"),
    kind: "dispute",
    action: disputeActionForEvent(event.type),
    providerDisputeId: dispute.id,
    providerChargeId:
      getExpandableId(dispute.charge) ??
      (() => {
        throw new TypeError("Stripe Dispute event is missing its charge.");
      })(),
    providerPaymentIntentId: getExpandableId(dispute.payment_intent),
    status: normalizeDisputeStatus(dispute.status),
    amount: toMoney(dispute.amount, dispute.currency),
    reference: getReference(dispute.metadata),
  });
}

export function mapVerifiedStripeEventToCommand(
  event: Stripe.Event,
  expectedModeValue: StripeMode,
): StripeWebhookCommand | null {
  const expectedMode = stripeModeSchema.parse(expectedModeValue);
  assertMode(event.livemode, expectedMode, "Stripe event");

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      return mapCheckoutEvent(event, expectedMode);
    case "payment_intent.processing":
    case "payment_intent.succeeded":
    case "payment_intent.payment_failed":
    case "payment_intent.canceled":
      return mapPaymentIntentEvent(event, expectedMode);
    case "refund.created":
    case "refund.updated":
    case "refund.failed":
      return mapRefundEvent(event);
    case "charge.refunded":
      return mapChargeRefundedEvent(event, expectedMode);
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed":
    case "charge.dispute.funds_withdrawn":
    case "charge.dispute.funds_reinstated":
      return mapDisputeEvent(event, expectedMode);
    default:
      return null;
  }
}

function validateRawBody(rawBody: string | Uint8Array): void {
  if (typeof rawBody !== "string" && !ArrayBuffer.isView(rawBody)) {
    throw new TypeError("Stripe webhook body must be raw bytes or text.");
  }

  const byteLength =
    typeof rawBody === "string"
      ? new TextEncoder().encode(rawBody).byteLength
      : rawBody.byteLength;

  if (byteLength === 0 || byteLength > MAX_WEBHOOK_BYTES) {
    throw new TypeError("Stripe webhook body size is invalid.");
  }
}

export interface VerifyStripeWebhookInput {
  readonly rawBody: string | Uint8Array;
  readonly signature: string;
}

export interface VerifyStripeWebhookOptions {
  readonly client?: StripeWebhookClient | undefined;
  readonly webhookSecret?: string | undefined;
  readonly mode?: StripeMode | undefined;
  readonly toleranceSeconds?: number | undefined;
}

export async function verifyAndMapStripeWebhook(
  input: VerifyStripeWebhookInput,
  options: VerifyStripeWebhookOptions = {},
): Promise<StripeWebhookCommand | null> {
  validateRawBody(input.rawBody);
  const signature = z.string().min(1).max(8_192).parse(input.signature);
  const mode = stripeModeSchema.parse(
    options.mode ?? stripeModeForEnvironment(process.env.NODE_ENV),
  );
  const webhookSecretValue =
    options.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecretValue) {
    throw new StripeConfigurationError(
      "WEBHOOK_NOT_CONFIGURED",
      "Stripe webhooks are not configured.",
    );
  }
  const webhookSecret = validateStripeWebhookSecret(webhookSecretValue);
  const toleranceSeconds = z
    .number()
    .int()
    .positive()
    .max(600)
    .parse(options.toleranceSeconds ?? 300);
  const client =
    options.client ??
    (await requireStripeClient({
      expectedMode: mode,
    }));

  const event = await client.webhooks.constructEventAsync(
    input.rawBody,
    signature,
    webhookSecret,
    toleranceSeconds,
  );
  return mapVerifiedStripeEventToCommand(event, mode);
}
