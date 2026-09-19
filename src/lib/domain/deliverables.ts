import { z } from "zod";

import type { CommissionStatus, PaymentStatus } from "@/types/domain";

import { commissionStatusSchema } from "./commissions";
import { assertNever } from "./errors";
import { paymentStatusSchema } from "./payments";

export const deliverableLockInputSchema = z
  .object({
    viewer: z.enum(["customer", "admin"]),
    hasDeliverable: z.boolean(),
    commissionStatus: commissionStatusSchema,
    paymentStatus: paymentStatusSchema,
  })
  .strict();

export type DeliverableLockReason =
  | "NOT_PUBLISHED"
  | "COMMISSION_NOT_COMPLETE"
  | "COMMISSION_CANCELLED"
  | "COMMISSION_DISPUTED"
  | "PAYMENT_REQUIRED"
  | "PAYMENT_PROCESSING"
  | "PAYMENT_REFUNDED";

export type DeliverableLockDecision =
  | { readonly locked: false; readonly reason: null }
  | { readonly locked: true; readonly reason: DeliverableLockReason };

function customerPaymentLock(status: PaymentStatus): DeliverableLockDecision {
  switch (status) {
    case "succeeded":
      return { locked: false, reason: null };
    case "pending":
    case "processing":
      return { locked: true, reason: "PAYMENT_PROCESSING" };
    case "not_started":
    case "failed":
    case "cancelled":
      return { locked: true, reason: "PAYMENT_REQUIRED" };
    case "partially_refunded":
    case "refunded":
      return { locked: true, reason: "PAYMENT_REFUNDED" };
    default:
      return assertNever(status, "payment status");
  }
}

function customerCommissionLock(
  status: CommissionStatus,
): DeliverableLockDecision | null {
  switch (status) {
    case "paid":
    case "delivered":
    case "aftercare":
    case "completed":
      return null;
    case "cancelled":
      return { locked: true, reason: "COMMISSION_CANCELLED" };
    case "disputed":
      return { locked: true, reason: "COMMISSION_DISPUTED" };
    case "awaiting_admin_confirmation":
    case "confirmed":
    case "in_progress":
    case "draft_review":
    case "revision_requested":
    case "draft_approved":
    case "final_payment_due":
      return { locked: true, reason: "COMMISSION_NOT_COMPLETE" };
    default:
      return assertNever(status, "commission status");
  }
}

export function decideDeliverableLock(value: unknown): DeliverableLockDecision {
  const input = deliverableLockInputSchema.parse(value);

  if (!input.hasDeliverable) {
    return { locked: true, reason: "NOT_PUBLISHED" };
  }
  if (input.viewer === "admin") {
    return { locked: false, reason: null };
  }

  const commissionLock = customerCommissionLock(input.commissionStatus);
  return commissionLock ?? customerPaymentLock(input.paymentStatus);
}
