import "server-only";

import { createHash } from "node:crypto";

import {
  verifyAndMapStripeWebhook,
  type StripeWebhookCommand,
} from "@/lib/payments";
import { securityLogger } from "@/lib/security/logger";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { VeyraSupabaseClient } from "@/lib/supabase/types";
import type { Database, Json } from "@/types/database.generated";

import {
  ProtocolError,
  readBoundedBody,
  safeProtocolErrorResponse,
} from "../../uploads/_lib/protocol";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_WEBHOOK_BYTES = 1_048_576;

type CommissionRow = Database["public"]["Tables"]["commissions"]["Row"];
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];
type PaymentStatus = PaymentRow["status"];
type StripePaymentStatusCommand = Extract<
  StripeWebhookCommand,
  { readonly kind: "payment_status" }
>;
type StripeRefundCommand = Extract<
  StripeWebhookCommand,
  { readonly kind: "refund" }
>;
type StripeDisputeCommand = Extract<
  StripeWebhookCommand,
  { readonly kind: "dispute" }
>;

interface VerifiedPaymentInput {
  readonly providerEventId: string;
  readonly eventType: string;
  readonly payloadSha256: string;
  readonly sanitizedPayload: Json;
  readonly commissionId: string;
  readonly providerPaymentId: string;
  readonly providerIdempotencyKey: string;
  readonly currency: string;
  readonly amountMinor: number;
  readonly status: PaymentStatus;
  readonly providerCreatedAt: string;
  readonly failureCode: string | null;
  readonly refundedMinor: number;
}

interface VerifiedCheckoutEventInput {
  readonly providerEventId: string;
  readonly eventType: "checkout.session.expired";
  readonly payloadSha256: string;
  readonly safePayload: Json;
  readonly providerCheckoutSessionId: string;
  readonly providerCreatedAt: string;
}

interface VerifiedRefundInput {
  readonly providerEventId: string;
  readonly eventType: string;
  readonly payloadSha256: string;
  readonly safePayload: Json;
  readonly paymentId: string;
  readonly providerPaymentId: string;
  readonly providerRefundId: string;
  readonly status: Exclude<StripeRefundCommand["status"], "unknown">;
  readonly currency: string;
  readonly amountMinor: number;
  readonly providerCreatedAt: string;
}

interface VerifiedChargeRefundInput {
  readonly providerEventId: string;
  readonly eventType: "charge.refunded";
  readonly payloadSha256: string;
  readonly safePayload: Json;
  readonly paymentId: string;
  readonly providerPaymentId: string;
  readonly providerChargeId: string;
  readonly currency: string;
  readonly cumulativeRefundedMinor: number;
  readonly providerCreatedAt: string;
}

interface VerifiedDisputeInput {
  readonly providerEventId: string;
  readonly eventType: string;
  readonly payloadSha256: string;
  readonly safePayload: Json;
  readonly paymentId: string;
  readonly providerPaymentId: string;
  readonly providerDisputeId: string;
  readonly status: Exclude<StripeDisputeCommand["status"], "unknown">;
  readonly currency: string;
  readonly amountMinor: number;
  readonly providerCreatedAt: string;
}

export interface StripeWebhookRepository {
  findPayment(command: StripeWebhookCommand): Promise<PaymentRow | null>;
  loadCommission(commissionId: string): Promise<CommissionRow | null>;
  recordVerifiedPayment(input: VerifiedPaymentInput): Promise<{
    readonly paymentId: string;
    readonly duplicateEvent: boolean;
  }>;
  transitionCommission(input: {
    readonly commissionId: string;
    readonly expectedStatus: CommissionRow["status"];
    readonly toStatus: CommissionRow["status"];
    readonly reason: string;
    readonly idempotencyKey: string;
  }): Promise<void>;
  recordCheckoutEvent(input: VerifiedCheckoutEventInput): Promise<void>;
  recordRefund(input: VerifiedRefundInput): Promise<void>;
  recordChargeRefund(input: VerifiedChargeRefundInput): Promise<void>;
  recordDispute(input: VerifiedDisputeInput): Promise<void>;
}

export interface StripeWebhookRouteDependencies {
  readonly verify: typeof verifyAndMapStripeWebhook;
  readonly createRepository: () => Promise<StripeWebhookRepository>;
}

function requireData<T>(result: {
  data: T;
  error: unknown;
}): NonNullable<T> | null {
  if (result.error) {
    throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
  }
  return result.data as NonNullable<T> | null;
}

function paymentLookupIds(command: StripeWebhookCommand): string[] {
  const candidates =
    command.kind === "payment_status"
      ? [
          command.providerPaymentIntentId,
          command.providerCheckoutSessionId,
          command.providerObjectId,
        ]
      : command.kind === "refund"
        ? [command.providerPaymentIntentId, command.providerObjectId]
        : [command.providerPaymentIntentId, command.providerChargeId];
  return [
    ...new Set(
      candidates.filter(
        (candidate): candidate is string => typeof candidate === "string",
      ),
    ),
  ];
}

export function createSupabaseStripeWebhookRepository(
  supabase: VeyraSupabaseClient,
): StripeWebhookRepository {
  return {
    async findPayment(command) {
      if (command.reference) {
        const byReference = requireData(
          await supabase
            .from("payments")
            .select("*")
            .eq("id", command.reference.paymentId)
            .maybeSingle(),
        );
        if (byReference) {
          return byReference;
        }
      }

      for (const providerId of paymentLookupIds(command)) {
        const byProvider = requireData(
          await supabase
            .from("payments")
            .select("*")
            .eq("provider", "stripe")
            .eq("provider_payment_id", providerId)
            .maybeSingle(),
        );
        if (byProvider) {
          return byProvider;
        }
      }
      return null;
    },

    async loadCommission(commissionId) {
      return requireData(
        await supabase
          .from("commissions")
          .select("*")
          .eq("id", commissionId)
          .maybeSingle(),
      );
    },

    async recordVerifiedPayment(input) {
      const { data, error } = await supabase.rpc("record_verified_payment", {
        p_provider: "stripe",
        p_provider_event_id: input.providerEventId,
        p_event_type: input.eventType,
        p_payload_sha256: input.payloadSha256,
        p_sanitized_payload: input.sanitizedPayload,
        p_commission_id: input.commissionId,
        p_provider_payment_id: input.providerPaymentId,
        p_provider_idempotency_key: input.providerIdempotencyKey,
        p_kind: "final",
        p_currency: input.currency,
        p_amount_minor: input.amountMinor,
        p_status: input.status,
        p_provider_created_at: input.providerCreatedAt,
        p_failure_code: input.failureCode,
        p_refunded_minor: input.refundedMinor,
      });
      const row = Array.isArray(data) ? data[0] : null;
      if (error || !row) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
      return {
        paymentId: row.payment_id,
        duplicateEvent: row.duplicate_event,
      };
    },

    async transitionCommission(input) {
      const { error } = await supabase.rpc("transition_commission_status", {
        p_commission_id: input.commissionId,
        p_expected_status: input.expectedStatus,
        p_to_status: input.toStatus,
        p_reason: input.reason,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
    },

    async recordCheckoutEvent(input) {
      const { data, error } = await supabase.rpc(
        "record_stripe_checkout_event",
        {
          p_provider_event_id: input.providerEventId,
          p_event_type: input.eventType,
          p_payload_sha256: input.payloadSha256,
          p_provider_checkout_session_id: input.providerCheckoutSessionId,
          p_provider_created_at: input.providerCreatedAt,
          p_safe_payload: input.safePayload,
        },
      );
      if (error || !Array.isArray(data) || data.length !== 1) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
    },

    async recordRefund(input) {
      const { data, error } = await supabase.rpc("record_stripe_refund_event", {
        p_provider_event_id: input.providerEventId,
        p_event_type: input.eventType,
        p_payload_sha256: input.payloadSha256,
        p_payment_id: input.paymentId,
        p_provider_payment_id: input.providerPaymentId,
        p_provider_refund_id: input.providerRefundId,
        p_refund_status: input.status,
        p_currency: input.currency,
        p_amount_minor: input.amountMinor,
        p_provider_created_at: input.providerCreatedAt,
        p_safe_payload: input.safePayload,
      });
      if (error || !Array.isArray(data) || data.length !== 1) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
    },

    async recordChargeRefund(input) {
      const { data, error } = await supabase.rpc(
        "record_stripe_charge_refunded_event",
        {
          p_provider_event_id: input.providerEventId,
          p_event_type: input.eventType,
          p_payload_sha256: input.payloadSha256,
          p_payment_id: input.paymentId,
          p_provider_payment_id: input.providerPaymentId,
          p_provider_charge_id: input.providerChargeId,
          p_currency: input.currency,
          p_cumulative_refunded_minor: input.cumulativeRefundedMinor,
          p_provider_created_at: input.providerCreatedAt,
          p_safe_payload: input.safePayload,
        },
      );
      if (error || !Array.isArray(data) || data.length !== 1) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
    },

    async recordDispute(input) {
      const { data, error } = await supabase.rpc(
        "record_stripe_dispute_event",
        {
          p_provider_event_id: input.providerEventId,
          p_event_type: input.eventType,
          p_payload_sha256: input.payloadSha256,
          p_payment_id: input.paymentId,
          p_provider_payment_id: input.providerPaymentId,
          p_provider_dispute_id: input.providerDisputeId,
          p_dispute_status: input.status,
          p_currency: input.currency,
          p_amount_minor: input.amountMinor,
          p_reason: null,
          p_provider_created_at: input.providerCreatedAt,
          p_safe_payload: input.safePayload,
        },
      );
      if (error || !Array.isArray(data) || data.length !== 1) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
    },
  };
}

function eventUuid(providerEventId: string, namespace: string): string {
  const hex = createHash("sha256")
    .update(namespace)
    .update("\0")
    .update(providerEventId)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(
    13,
    16,
  )}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function commandSanitizedPayload(
  command: StripePaymentStatusCommand,
  failureCode: string | null,
): Json {
  return {
    command_kind: command.kind,
    provider_object_id: command.providerObjectId,
    outcome: failureCode ?? "accepted",
    payment_event: command.paymentEvent,
  };
}

function refundSanitizedPayload(command: StripeRefundCommand): Json {
  return {
    command_kind: command.kind,
    provider_object_id: command.providerObjectId,
    refund_status: command.status,
    payment_event: command.paymentEvent,
  };
}

function disputeSanitizedPayload(command: StripeDisputeCommand): Json {
  return {
    command_kind: command.kind,
    provider_dispute_id: command.providerDisputeId,
    dispute_action: command.action,
    dispute_status: command.status,
  };
}

interface ReconciledEvent {
  readonly status: PaymentStatus;
  readonly refundedMinor: number;
  readonly failureCode: string | null;
}

function referenceMatches(
  command: StripeWebhookCommand,
  payment: PaymentRow,
  commission: CommissionRow,
): boolean {
  return (
    command.reference === null ||
    (command.reference.paymentId === payment.id &&
      command.reference.commissionId === commission.id &&
      command.reference.paymentKind === "final" &&
      command.reference.quoteVersion === commission.accepted_quote_version &&
      command.reference.providerIdempotencyKey ===
        payment.provider_idempotency_key)
  );
}

function hasValidReference(
  command: StripePaymentStatusCommand,
  payment: PaymentRow,
  commission: CommissionRow,
): boolean {
  if (
    command.reference === null ||
    !referenceMatches(command, payment, commission)
  ) {
    return false;
  }

  if (command.providerPaymentIntentId === null) {
    return false;
  }
  if (payment.provider_payment_id === null) {
    return command.reference !== null;
  }
  return (
    payment.provider_payment_id === command.providerPaymentIntentId &&
    payment.provider_payment_id.startsWith("pi_")
  );
}

function hasCanonicalProviderPayment(
  payment: PaymentRow,
  providerPaymentIntentId: string | null,
): providerPaymentIntentId is string {
  return (
    providerPaymentIntentId !== null &&
    providerPaymentIntentId.startsWith("pi_") &&
    payment.provider_payment_id === providerPaymentIntentId
  );
}

function checkoutExpirationIsValid(
  command: StripePaymentStatusCommand,
  payment: PaymentRow,
  commission: CommissionRow,
): command is StripePaymentStatusCommand & {
  readonly providerEventType: "checkout.session.expired";
  readonly providerCheckoutSessionId: string;
} {
  return (
    command.providerEventType === "checkout.session.expired" &&
    command.paymentEvent === "payment_cancelled" &&
    command.providerCheckoutSessionId !== null &&
    command.providerObjectId === command.providerCheckoutSessionId &&
    payment.provider_checkout_session_id ===
      command.providerCheckoutSessionId &&
    hasValidImmutableTruth(payment, commission) &&
    command.reference !== null &&
    referenceMatches(command, payment, commission) &&
    (command.amount === null ||
      (command.amount.currency === payment.currency &&
        command.amount.amountMinor === payment.amount_minor))
  );
}

function isCapturedFinalPayment(payment: PaymentRow): boolean {
  return (
    payment.captured_at !== null &&
    ["succeeded", "partially_refunded", "refunded"].includes(payment.status)
  );
}

function refundCommandIsValid(
  command: StripeRefundCommand,
  payment: PaymentRow,
  commission: CommissionRow,
): command is StripeRefundCommand & {
  readonly providerRefundId: string;
  readonly providerPaymentIntentId: string;
  readonly status: Exclude<StripeRefundCommand["status"], "unknown">;
} {
  return (
    command.providerRefundId !== null &&
    command.status !== "unknown" &&
    hasValidImmutableTruth(payment, commission) &&
    referenceMatches(command, payment, commission) &&
    hasCanonicalProviderPayment(payment, command.providerPaymentIntentId) &&
    isCapturedFinalPayment(payment) &&
    command.amount.currency === payment.currency &&
    command.amount.amountMinor <= payment.amount_minor &&
    (command.paymentAmount === null ||
      (command.paymentAmount.currency === payment.currency &&
        command.paymentAmount.amountMinor === payment.amount_minor))
  );
}

function chargeRefundCommandIsValid(
  command: StripeRefundCommand,
  payment: PaymentRow,
  commission: CommissionRow,
): command is StripeRefundCommand & {
  readonly providerRefundId: null;
  readonly providerPaymentIntentId: string;
  readonly providerEventType: "charge.refunded";
  readonly status: "succeeded";
} {
  return (
    command.providerEventType === "charge.refunded" &&
    command.providerRefundId === null &&
    command.status === "succeeded" &&
    hasValidImmutableTruth(payment, commission) &&
    referenceMatches(command, payment, commission) &&
    hasCanonicalProviderPayment(payment, command.providerPaymentIntentId) &&
    isCapturedFinalPayment(payment) &&
    command.amount.currency === payment.currency &&
    command.amount.amountMinor <= payment.amount_minor &&
    command.paymentAmount !== null &&
    command.paymentAmount.currency === payment.currency &&
    command.paymentAmount.amountMinor === payment.amount_minor
  );
}

function disputeCommandIsValid(
  command: StripeDisputeCommand,
  payment: PaymentRow,
  commission: CommissionRow,
): command is StripeDisputeCommand & {
  readonly providerPaymentIntentId: string;
  readonly status: Exclude<StripeDisputeCommand["status"], "unknown">;
} {
  return (
    command.status !== "unknown" &&
    hasValidImmutableTruth(payment, commission) &&
    referenceMatches(command, payment, commission) &&
    hasCanonicalProviderPayment(payment, command.providerPaymentIntentId) &&
    isCapturedFinalPayment(payment) &&
    command.amount.currency === payment.currency &&
    command.amount.amountMinor <= payment.amount_minor
  );
}

function hasValidImmutableTruth(
  payment: PaymentRow,
  commission: CommissionRow,
): boolean {
  return (
    payment.provider === "stripe" &&
    payment.kind === "final" &&
    payment.commission_id === commission.id &&
    payment.customer_id === commission.customer_id &&
    payment.currency === commission.accepted_currency &&
    payment.amount_minor === commission.accepted_total_minor
  );
}

function commandMoneyIsValid(
  command: StripePaymentStatusCommand,
  payment: PaymentRow,
): boolean {
  if (
    command.amount &&
    (command.amount.currency !== payment.currency ||
      command.amount.amountMinor !== payment.amount_minor)
  ) {
    return false;
  }
  return (
    command.paymentEvent !== "payment_succeeded" ||
    (command.amount !== null &&
      command.amountReceivedMinor !== null &&
      command.amountReceivedMinor >= payment.amount_minor)
  );
}

function reconcileCommand(
  command: StripePaymentStatusCommand,
  payment: PaymentRow,
  commission: CommissionRow,
): ReconciledEvent {
  if (!hasValidImmutableTruth(payment, commission)) {
    return {
      status: payment.status,
      refundedMinor: payment.refunded_minor,
      failureCode: "database_truth_mismatch",
    };
  }
  if (!hasValidReference(command, payment, commission)) {
    return {
      status: payment.status,
      refundedMinor: payment.refunded_minor,
      failureCode: "provider_reference_mismatch",
    };
  }
  if (!commandMoneyIsValid(command, payment)) {
    return {
      status: payment.status,
      refundedMinor: payment.refunded_minor,
      failureCode: "provider_amount_mismatch",
    };
  }

  const statusByEvent: Record<typeof command.paymentEvent, PaymentStatus> = {
    payment_processing: "processing",
    payment_succeeded: "succeeded",
    payment_failed: "failed",
    payment_cancelled: "cancelled",
    partial_refund_succeeded: "partially_refunded",
    refund_succeeded: "refunded",
  };
  return {
    status: statusByEvent[command.paymentEvent],
    refundedMinor: payment.refunded_minor,
    failureCode:
      command.paymentEvent === "payment_failed"
        ? "provider_payment_failed"
        : command.paymentEvent === "payment_cancelled"
          ? "provider_payment_cancelled"
          : null,
  };
}

function isCurrentProviderEvent(
  command: StripePaymentStatusCommand,
  payment: PaymentRow,
): boolean {
  const occurredAt = Date.parse(command.occurredAt);
  if (payment.last_provider_event_at === null) {
    return Number.isFinite(occurredAt);
  }
  const lastProviderEventAt = Date.parse(payment.last_provider_event_at);
  return (
    Number.isFinite(occurredAt) &&
    Number.isFinite(lastProviderEventAt) &&
    occurredAt >= lastProviderEventAt
  );
}

async function applyCommissionEffect(
  repository: StripeWebhookRepository,
  command: StripePaymentStatusCommand,
  commission: CommissionRow,
  reconciled: ReconciledEvent,
): Promise<void> {
  if (
    [
      "database_truth_mismatch",
      "provider_reference_mismatch",
      "provider_amount_mismatch",
    ].includes(reconciled.failureCode ?? "")
  ) {
    return;
  }

  if (
    reconciled.failureCode === null &&
    command.paymentEvent === "payment_succeeded" &&
    commission.status === "final_payment_due"
  ) {
    await repository.transitionCommission({
      commissionId: commission.id,
      expectedStatus: "final_payment_due",
      toStatus: "paid",
      reason: "Verified final payment received",
      idempotencyKey: eventUuid(command.providerEventId, "payment-paid"),
    });
  }
}

const defaultDependencies: StripeWebhookRouteDependencies = {
  verify: verifyAndMapStripeWebhook,
  async createRepository() {
    return createSupabaseStripeWebhookRepository(createServiceRoleClient());
  },
};

export function createStripeWebhookPostHandler(
  dependencies: Partial<StripeWebhookRouteDependencies> = {},
): (request: Request) => Promise<Response> {
  const deps = { ...defaultDependencies, ...dependencies };

  return async function stripeWebhookPostHandler(
    request: Request,
  ): Promise<Response> {
    let command: StripeWebhookCommand | null = null;

    try {
      const signature = request.headers.get("stripe-signature");
      if (!signature || signature.length > 8_192) {
        throw new ProtocolError("INVALID_WEBHOOK");
      }
      const rawBody = await readBoundedBody(request, MAX_WEBHOOK_BYTES);

      try {
        command = await deps.verify({ rawBody, signature });
      } catch {
        throw new ProtocolError("INVALID_WEBHOOK");
      }
      if (command === null) {
        return new Response(null, {
          status: 204,
          headers: { "Cache-Control": "no-store" },
        });
      }

      const repository = await deps.createRepository();
      const payment = await repository.findPayment(command);
      if (!payment) {
        securityLogger.warn("stripe_webhook.payment_not_found", {
          eventType: command.providerEventType,
        });
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
      const commission = await repository.loadCommission(payment.commission_id);
      if (!commission) {
        securityLogger.warn("stripe_webhook.commission_not_found", {
          eventType: command.providerEventType,
        });
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
      const payloadSha256 = createHash("sha256").update(rawBody).digest("hex");

      if (
        command.kind === "payment_status" &&
        command.providerEventType === "checkout.session.expired"
      ) {
        if (!checkoutExpirationIsValid(command, payment, commission)) {
          securityLogger.warn("stripe_webhook.checkout_rejected", {
            eventType: command.providerEventType,
          });
          throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
        }
        await repository.recordCheckoutEvent({
          providerEventId: command.providerEventId,
          eventType: command.providerEventType,
          payloadSha256,
          safePayload: commandSanitizedPayload(command, null),
          providerCheckoutSessionId: command.providerCheckoutSessionId,
          providerCreatedAt: command.occurredAt,
        });
        return new Response(null, {
          status: 204,
          headers: { "Cache-Control": "no-store" },
        });
      }

      if (command.kind === "refund") {
        if (chargeRefundCommandIsValid(command, payment, commission)) {
          await repository.recordChargeRefund({
            providerEventId: command.providerEventId,
            eventType: command.providerEventType,
            payloadSha256,
            safePayload: refundSanitizedPayload(command),
            paymentId: payment.id,
            providerPaymentId: command.providerPaymentIntentId,
            providerChargeId: command.providerObjectId,
            currency: command.amount.currency,
            cumulativeRefundedMinor: command.amount.amountMinor,
            providerCreatedAt: command.occurredAt,
          });
          return new Response(null, {
            status: 204,
            headers: { "Cache-Control": "no-store" },
          });
        }
        if (!refundCommandIsValid(command, payment, commission)) {
          securityLogger.warn("stripe_webhook.refund_rejected", {
            eventType: command.providerEventType,
          });
          throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
        }
        await repository.recordRefund({
          providerEventId: command.providerEventId,
          eventType: command.providerEventType,
          payloadSha256,
          safePayload: refundSanitizedPayload(command),
          paymentId: payment.id,
          providerPaymentId: command.providerPaymentIntentId,
          providerRefundId: command.providerRefundId,
          status: command.status,
          currency: command.amount.currency,
          amountMinor: command.amount.amountMinor,
          providerCreatedAt: command.occurredAt,
        });
        return new Response(null, {
          status: 204,
          headers: { "Cache-Control": "no-store" },
        });
      }

      if (command.kind === "dispute") {
        if (!disputeCommandIsValid(command, payment, commission)) {
          securityLogger.warn("stripe_webhook.dispute_rejected", {
            eventType: command.providerEventType,
          });
          throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
        }
        await repository.recordDispute({
          providerEventId: command.providerEventId,
          eventType: command.providerEventType,
          payloadSha256,
          safePayload: disputeSanitizedPayload(command),
          paymentId: payment.id,
          providerPaymentId: command.providerPaymentIntentId,
          providerDisputeId: command.providerDisputeId,
          status: command.status,
          currency: command.amount.currency,
          amountMinor: command.amount.amountMinor,
          providerCreatedAt: command.occurredAt,
        });
        return new Response(null, {
          status: 204,
          headers: { "Cache-Control": "no-store" },
        });
      }

      const providerPaymentIntentId = command.providerPaymentIntentId;
      if (!providerPaymentIntentId?.startsWith("pi_")) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }

      const reconciled = reconcileCommand(command, payment, commission);
      const shouldApplyCommissionEffect = isCurrentProviderEvent(
        command,
        payment,
      );
      await repository.recordVerifiedPayment({
        providerEventId: command.providerEventId,
        eventType: command.providerEventType,
        payloadSha256,
        sanitizedPayload: commandSanitizedPayload(
          command,
          reconciled.failureCode,
        ),
        commissionId: commission.id,
        providerPaymentId: providerPaymentIntentId,
        providerIdempotencyKey: payment.provider_idempotency_key,
        currency: payment.currency,
        amountMinor: payment.amount_minor,
        status: reconciled.status,
        providerCreatedAt: command.occurredAt,
        failureCode: reconciled.failureCode,
        refundedMinor: reconciled.refundedMinor,
      });

      if (shouldApplyCommissionEffect) {
        await applyCommissionEffect(
          repository,
          command,
          commission,
          reconciled,
        );
      }
      return new Response(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      if (
        command &&
        !(error instanceof ProtocolError && error.code === "INVALID_WEBHOOK")
      ) {
        securityLogger.error("stripe_webhook.processing_failed", {
          eventType: command.providerEventType,
          error,
        });
      }
      return safeProtocolErrorResponse(error);
    }
  };
}

export const POST = createStripeWebhookPostHandler();
