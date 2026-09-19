import { z } from "zod";

import {
  PAYMENT_EVENTS,
  PAYMENT_KINDS,
  PAYMENT_STATUSES,
  type PaymentEvent,
  type PaymentStatus,
} from "@/types/domain";

import { commissionStatusSchema } from "./commissions";
import { assertNever, DomainError } from "./errors";
import { positiveMoneySchema } from "./money";

export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export const paymentKindSchema = z.enum(PAYMENT_KINDS);
export const paymentEventSchema = z.enum(PAYMENT_EVENTS);

export const paymentEligibilityInputSchema = z
  .object({
    commissionStatus: commissionStatusSchema,
    kind: paymentKindSchema,
    status: paymentStatusSchema,
    amount: positiveMoneySchema,
  })
  .strict();

export type PaymentIneligibilityReason =
  | "PAYMENT_IN_PROGRESS"
  | "PAYMENT_ALREADY_SUCCEEDED"
  | "PAYMENT_WAS_REFUNDED"
  | "PAYMENT_KIND_NOT_PAYABLE"
  | "COMMISSION_NOT_ELIGIBLE_FOR_PAYMENT";

export type PaymentEligibility =
  | { readonly eligible: true }
  | {
      readonly eligible: false;
      readonly reason: PaymentIneligibilityReason;
    };

export function evaluatePaymentEligibility(value: unknown): PaymentEligibility {
  const input = paymentEligibilityInputSchema.parse(value);

  switch (input.status) {
    case "pending":
    case "processing":
      return { eligible: false, reason: "PAYMENT_IN_PROGRESS" };
    case "succeeded":
      return { eligible: false, reason: "PAYMENT_ALREADY_SUCCEEDED" };
    case "partially_refunded":
    case "refunded":
      return { eligible: false, reason: "PAYMENT_WAS_REFUNDED" };
    case "not_started":
    case "failed":
    case "cancelled":
      break;
    default:
      return assertNever(input.status, "payment status");
  }

  if (input.kind !== "final") {
    return { eligible: false, reason: "PAYMENT_KIND_NOT_PAYABLE" };
  }
  return input.commissionStatus === "final_payment_due"
    ? { eligible: true }
    : { eligible: false, reason: "COMMISSION_NOT_ELIGIBLE_FOR_PAYMENT" };
}

export class PaymentEligibilityError extends DomainError<PaymentIneligibilityReason> {
  constructor(reason: PaymentIneligibilityReason) {
    super(reason, `Payment cannot be initiated: ${reason}`);
    this.name = "PaymentEligibilityError";
  }
}

export function assertPaymentEligible(value: unknown): void {
  const decision = evaluatePaymentEligibility(value);
  if (!decision.eligible) {
    throw new PaymentEligibilityError(decision.reason);
  }
}

export class PaymentTransitionError extends DomainError<"INVALID_PAYMENT_STATUS_TRANSITION"> {
  readonly status: PaymentStatus;
  readonly event: PaymentEvent;

  constructor(status: PaymentStatus, event: PaymentEvent) {
    super(
      "INVALID_PAYMENT_STATUS_TRANSITION",
      `Payment event ${event} is invalid while payment is ${status}`,
    );
    this.name = "PaymentTransitionError";
    this.status = status;
    this.event = event;
  }
}

export interface PaymentStatusTransition {
  readonly previousStatus: PaymentStatus;
  readonly status: PaymentStatus;
  readonly event: PaymentEvent;
  readonly changed: boolean;
}

function transitionResult(
  previousStatus: PaymentStatus,
  status: PaymentStatus,
  event: PaymentEvent,
): PaymentStatusTransition {
  return Object.freeze({
    previousStatus,
    status,
    event,
    changed: previousStatus !== status,
  });
}

function onCheckoutStarted(status: PaymentStatus): PaymentStatus {
  switch (status) {
    case "not_started":
    case "failed":
    case "cancelled":
      return "pending";
    case "pending":
    case "processing":
    case "succeeded":
    case "partially_refunded":
    case "refunded":
      return status;
    default:
      return assertNever(status, "payment status");
  }
}

function onPaymentProcessing(status: PaymentStatus): PaymentStatus {
  switch (status) {
    case "not_started":
    case "pending":
      return "processing";
    case "processing":
    case "failed":
    case "cancelled":
    case "succeeded":
    case "partially_refunded":
    case "refunded":
      return status;
    default:
      return assertNever(status, "payment status");
  }
}

function onPaymentSucceeded(status: PaymentStatus): PaymentStatus {
  switch (status) {
    case "not_started":
    case "pending":
    case "processing":
    case "failed":
    case "cancelled":
      return "succeeded";
    case "succeeded":
    case "partially_refunded":
    case "refunded":
      return status;
    default:
      return assertNever(status, "payment status");
  }
}

function onPaymentFailed(status: PaymentStatus): PaymentStatus {
  switch (status) {
    case "not_started":
    case "pending":
    case "processing":
      return "failed";
    case "failed":
    case "cancelled":
    case "succeeded":
    case "partially_refunded":
    case "refunded":
      return status;
    default:
      return assertNever(status, "payment status");
  }
}

function onPaymentCancelled(status: PaymentStatus): PaymentStatus {
  switch (status) {
    case "not_started":
    case "pending":
    case "processing":
      return "cancelled";
    case "failed":
    case "cancelled":
    case "succeeded":
    case "partially_refunded":
    case "refunded":
      return status;
    default:
      return assertNever(status, "payment status");
  }
}

function onPartialRefund(status: PaymentStatus): PaymentStatus {
  switch (status) {
    case "succeeded":
      return "partially_refunded";
    case "partially_refunded":
    case "refunded":
      return status;
    case "not_started":
    case "pending":
    case "processing":
    case "failed":
    case "cancelled":
      throw new PaymentTransitionError(status, "partial_refund_succeeded");
    default:
      return assertNever(status, "payment status");
  }
}

function onRefund(status: PaymentStatus): PaymentStatus {
  switch (status) {
    case "succeeded":
    case "partially_refunded":
      return "refunded";
    case "refunded":
      return status;
    case "not_started":
    case "pending":
    case "processing":
    case "failed":
    case "cancelled":
      throw new PaymentTransitionError(status, "refund_succeeded");
    default:
      return assertNever(status, "payment status");
  }
}

export function applyPaymentEvent(
  currentStatusValue: PaymentStatus,
  eventValue: PaymentEvent,
): PaymentStatusTransition {
  const currentStatus = paymentStatusSchema.parse(currentStatusValue);
  const event = paymentEventSchema.parse(eventValue);

  switch (event) {
    case "checkout_started":
      return transitionResult(
        currentStatus,
        onCheckoutStarted(currentStatus),
        event,
      );
    case "payment_processing":
      return transitionResult(
        currentStatus,
        onPaymentProcessing(currentStatus),
        event,
      );
    case "payment_succeeded":
      return transitionResult(
        currentStatus,
        onPaymentSucceeded(currentStatus),
        event,
      );
    case "payment_failed":
      return transitionResult(
        currentStatus,
        onPaymentFailed(currentStatus),
        event,
      );
    case "payment_cancelled":
      return transitionResult(
        currentStatus,
        onPaymentCancelled(currentStatus),
        event,
      );
    case "partial_refund_succeeded":
      return transitionResult(
        currentStatus,
        onPartialRefund(currentStatus),
        event,
      );
    case "refund_succeeded":
      return transitionResult(currentStatus, onRefund(currentStatus), event);
    default:
      return assertNever(event, "payment event");
  }
}

export function isPaymentSettled(statusValue: PaymentStatus): boolean {
  const status = paymentStatusSchema.parse(statusValue);
  switch (status) {
    case "succeeded":
      return true;
    case "not_started":
    case "pending":
    case "processing":
    case "failed":
    case "cancelled":
    case "partially_refunded":
    case "refunded":
      return false;
    default:
      return assertNever(status, "payment status");
  }
}
