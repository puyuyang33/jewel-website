import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createStripeWebhookPostHandler,
  type StripeWebhookRepository,
} from "@/app/api/webhooks/stripe/route";
import type { StripeWebhookCommand } from "@/lib/payments";
import type { Database } from "@/types/database.generated";

type CommissionRow = Database["public"]["Tables"]["commissions"]["Row"];
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

const ids = {
  customer: "10000000-0000-4000-8000-000000000001",
  commission: "20000000-0000-4000-8000-000000000001",
  payment: "30000000-0000-4000-8000-000000000001",
};
const providerIdempotencyKey = `payment|${ids.commission}|final|3|2`;

const commission: CommissionRow = {
  id: ids.commission,
  reference_code: "VYR-0123456789ABCDEF0123456789ABCDEF",
  quote_acceptance_id: "40000000-0000-4000-8000-000000000001",
  design_request_id: "50000000-0000-4000-8000-000000000001",
  customer_id: ids.customer,
  status: "final_payment_due",
  accepted_quote_version: 3,
  accepted_title: "Ring",
  accepted_currency: "USD",
  accepted_total_minor: 250_000,
  accepted_deposit_minor: 0,
  accepted_scope: {},
  accepted_terms: "Terms",
  accepted_production_weeks: 8,
  accepted_option_snapshot: {},
  accepted_counteroffer_snapshot: null,
  accepted_quote_snapshot: {},
  accepted_at: "2026-09-01T00:00:00.000Z",
  started_at: null,
  target_completion_at: null,
  delivered_at: null,
  completed_at: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};

const payment: PaymentRow = {
  id: ids.payment,
  commission_id: ids.commission,
  customer_id: ids.customer,
  provider: "stripe",
  provider_payment_id: "pi_123",
  provider_checkout_session_id: "cs_test_123",
  provider_idempotency_key: providerIdempotencyKey,
  kind: "final",
  attempt_number: 1,
  status: "pending",
  currency: "USD",
  amount_minor: 250_000,
  refunded_minor: 0,
  checkout_created_at: "2026-09-17T00:00:00.000Z",
  checkout_expires_at: "2026-09-17T01:00:00.000Z",
  provider_created_at: "1970-01-01T00:00:00.000Z",
  last_provider_event_at: "1970-01-01T00:00:00.000Z",
  captured_at: null,
  failure_code: null,
  created_at: "2026-09-17T00:00:00.000Z",
  updated_at: "2026-09-17T00:00:00.000Z",
};

const command: StripeWebhookCommand = {
  kind: "payment_status",
  commandId: "stripe-command:test",
  provider: "stripe",
  providerEventId: "evt_123",
  providerEventType: "payment_intent.succeeded",
  occurredAt: "2026-09-17T00:01:00.000Z",
  paymentEvent: "payment_succeeded",
  providerObjectId: "pi_123",
  providerCheckoutSessionId: null,
  providerPaymentIntentId: "pi_123",
  amount: { amountMinor: 250_000, currency: "USD" },
  amountReceivedMinor: 250_000,
  reference: {
    commissionId: ids.commission,
    paymentId: ids.payment,
    paymentKind: "final",
    quoteVersion: 3,
    providerIdempotencyKey,
  },
};

function webhookRequest(signature: string | null = "signed"): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (signature !== null) {
    headers.set("Stripe-Signature", signature);
  }
  return new Request("https://atelier.example/api/webhooks/stripe", {
    method: "POST",
    headers,
    body: '{"id":"evt_123","sensitive":"never-persist"}',
  });
}

function repository(
  overrides: Partial<StripeWebhookRepository> = {},
): StripeWebhookRepository {
  return {
    findPayment: vi.fn().mockResolvedValue(payment),
    loadCommission: vi.fn().mockResolvedValue(commission),
    recordVerifiedPayment: vi.fn().mockResolvedValue({
      paymentId: ids.payment,
      duplicateEvent: false,
    }),
    transitionCommission: vi.fn().mockResolvedValue(undefined),
    recordCheckoutEvent: vi.fn().mockResolvedValue(undefined),
    recordRefund: vi.fn().mockResolvedValue(undefined),
    recordChargeRefund: vi.fn().mockResolvedValue(undefined),
    recordDispute: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("POST /api/webhooks/stripe", () => {
  it("rejects unsigned requests before verification or service-role access", async () => {
    const verify = vi.fn();
    const createRepository = vi.fn();
    const handler = createStripeWebhookPostHandler({
      verify,
      createRepository,
    });

    const response = await handler(webhookRequest(null));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "INVALID_WEBHOOK",
        message: "The webhook could not be verified.",
      },
    });
    expect(verify).not.toHaveBeenCalled();
    expect(createRepository).not.toHaveBeenCalled();
  });

  it("does not create the service-role repository when signature verification fails", async () => {
    const verify = vi.fn().mockRejectedValue(new Error("bad signature"));
    const createRepository = vi.fn();
    const handler = createStripeWebhookPostHandler({
      verify,
      createRepository,
    });

    const response = await handler(webhookRequest("invalid"));

    expect(response.status).toBe(400);
    expect(createRepository).not.toHaveBeenCalled();
  });

  it("durably handles duplicate attempt-aware deliveries without changing trusted money", async () => {
    let calls = 0;
    const recordVerifiedPayment = vi
      .fn<StripeWebhookRepository["recordVerifiedPayment"]>()
      .mockImplementation(async () => ({
        paymentId: ids.payment,
        duplicateEvent: calls++ > 0,
      }));
    const transitionCommission = vi.fn().mockResolvedValue(undefined);
    const store = repository({
      recordVerifiedPayment,
      transitionCommission,
    });
    const verify = vi.fn().mockResolvedValue(command);
    const handler = createStripeWebhookPostHandler({
      verify,
      createRepository: vi.fn().mockResolvedValue(store),
    });

    const first = await handler(webhookRequest());
    const duplicate = await handler(webhookRequest());

    expect(first.status).toBe(204);
    expect(duplicate.status).toBe(204);
    expect(recordVerifiedPayment).toHaveBeenCalledTimes(2);
    for (const [input] of recordVerifiedPayment.mock.calls) {
      expect(input).toMatchObject({
        providerEventId: "evt_123",
        commissionId: ids.commission,
        providerPaymentId: "pi_123",
        providerIdempotencyKey,
        currency: "USD",
        amountMinor: 250_000,
        status: "succeeded",
      });
      expect(JSON.stringify(input.sanitizedPayload)).not.toContain(
        "never-persist",
      );
    }
    expect(transitionCommission).toHaveBeenCalledTimes(2);
    expect(transitionCommission.mock.calls[0]?.[0].idempotencyKey).toBe(
      transitionCommission.mock.calls[1]?.[0].idempotencyKey,
    );
  });

  it("rejects mismatched attempt metadata while preserving the DB key", async () => {
    const recordVerifiedPayment = vi.fn().mockResolvedValue({
      paymentId: ids.payment,
      duplicateEvent: false,
    });
    const transitionCommission = vi.fn();
    const store = repository({
      recordVerifiedPayment,
      transitionCommission,
    });
    const handler = createStripeWebhookPostHandler({
      verify: vi.fn().mockResolvedValue({
        ...command,
        reference: {
          ...command.reference!,
          providerIdempotencyKey: `payment|${ids.commission}|final|3|999`,
        },
      }),
      createRepository: vi.fn().mockResolvedValue(store),
    });

    const response = await handler(webhookRequest());

    expect(response.status).toBe(204);
    expect(recordVerifiedPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        providerIdempotencyKey,
        status: "pending",
        failureCode: "provider_reference_mismatch",
      }),
    );
    expect(transitionCommission).not.toHaveBeenCalled();
  });

  it("records a safe failure rather than trusting provider amount mismatch", async () => {
    const recordVerifiedPayment = vi.fn().mockResolvedValue({
      paymentId: ids.payment,
      duplicateEvent: false,
    });
    const store = repository({ recordVerifiedPayment });
    const handler = createStripeWebhookPostHandler({
      verify: vi.fn().mockResolvedValue({
        ...command,
        amount: { amountMinor: 1, currency: "USD" },
        amountReceivedMinor: 1,
      }),
      createRepository: vi.fn().mockResolvedValue(store),
    });

    const response = await handler(webhookRequest());

    expect(response.status).toBe(204);
    expect(recordVerifiedPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: 250_000,
        currency: "USD",
        status: "pending",
        failureCode: "provider_amount_mismatch",
      }),
    );
    expect(store.transitionCommission).not.toHaveBeenCalled();
  });

  it("binds a reserved payment only to the verified canonical PaymentIntent", async () => {
    const recordVerifiedPayment = vi.fn().mockResolvedValue({
      paymentId: ids.payment,
      duplicateEvent: false,
    });
    const store = repository({
      findPayment: vi.fn().mockResolvedValue({
        ...payment,
        provider_payment_id: null,
      }),
      recordVerifiedPayment,
    });
    const handler = createStripeWebhookPostHandler({
      verify: vi.fn().mockResolvedValue(command),
      createRepository: vi.fn().mockResolvedValue(store),
    });

    const response = await handler(webhookRequest());

    expect(response.status).toBe(204);
    expect(recordVerifiedPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        providerPaymentId: "pi_123",
      }),
    );
  });

  it("durably cancels an expired Checkout Session without inventing a PaymentIntent", async () => {
    const recordCheckoutEvent = vi.fn().mockResolvedValue(undefined);
    const recordVerifiedPayment = vi.fn();
    const store = repository({
      findPayment: vi.fn().mockResolvedValue({
        ...payment,
        provider_payment_id: null,
      }),
      recordCheckoutEvent,
      recordVerifiedPayment,
    });
    const expired: StripeWebhookCommand = {
      kind: "payment_status",
      commandId: "stripe-command:expired",
      provider: "stripe",
      providerEventId: "evt_expired",
      providerEventType: "checkout.session.expired",
      occurredAt: "2026-09-17T01:00:00.000Z",
      paymentEvent: "payment_cancelled",
      providerObjectId: "cs_test_123",
      providerCheckoutSessionId: "cs_test_123",
      providerPaymentIntentId: null,
      amount: { amountMinor: 250_000, currency: "USD" },
      amountReceivedMinor: null,
      reference: {
        commissionId: ids.commission,
        paymentId: ids.payment,
        paymentKind: "final",
        quoteVersion: 3,
        providerIdempotencyKey,
      },
    };
    const handler = createStripeWebhookPostHandler({
      verify: vi.fn().mockResolvedValue(expired),
      createRepository: vi.fn().mockResolvedValue(store),
    });

    const response = await handler(webhookRequest());

    expect(response.status).toBe(204);
    expect(recordCheckoutEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        providerEventId: "evt_expired",
        eventType: "checkout.session.expired",
        providerCheckoutSessionId: "cs_test_123",
      }),
    );
    expect(recordVerifiedPayment).not.toHaveBeenCalled();
  });

  it("passes individual refunds to the cumulative DB ledger", async () => {
    const recordRefund = vi.fn().mockResolvedValue(undefined);
    const store = repository({
      findPayment: vi.fn().mockResolvedValue({
        ...payment,
        status: "succeeded",
        captured_at: "2026-09-17T00:01:00.000Z",
      }),
      loadCommission: vi.fn().mockResolvedValue({
        ...commission,
        status: "paid",
      }),
      recordRefund,
    });
    const refund: StripeWebhookCommand = {
      kind: "refund",
      commandId: "stripe-command:refund",
      provider: "stripe",
      providerEventId: "evt_refund",
      providerEventType: "refund.updated",
      occurredAt: "2026-09-17T00:02:00.000Z",
      providerObjectId: "re_123",
      providerRefundId: "re_123",
      providerPaymentIntentId: "pi_123",
      status: "succeeded",
      amount: { amountMinor: 50_000, currency: "USD" },
      paymentAmount: { amountMinor: 250_000, currency: "USD" },
      paymentEvent: "partial_refund_succeeded",
      reference: null,
    };
    const handler = createStripeWebhookPostHandler({
      verify: vi.fn().mockResolvedValue(refund),
      createRepository: vi.fn().mockResolvedValue(store),
    });

    const response = await handler(webhookRequest());

    expect(response.status).toBe(204);
    expect(recordRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        providerEventId: "evt_refund",
        paymentId: ids.payment,
        providerPaymentId: "pi_123",
        providerRefundId: "re_123",
        status: "succeeded",
        currency: "USD",
        amountMinor: 50_000,
      }),
    );
    expect(
      JSON.stringify(recordRefund.mock.calls[0]?.[0].safePayload),
    ).not.toContain("never-persist");
  });

  it("durably records requires_action refunds as unresolved", async () => {
    const recordRefund = vi.fn().mockResolvedValue(undefined);
    const store = repository({
      findPayment: vi.fn().mockResolvedValue({
        ...payment,
        status: "succeeded",
        captured_at: "2026-09-17T00:01:00.000Z",
      }),
      loadCommission: vi.fn().mockResolvedValue({
        ...commission,
        status: "paid",
      }),
      recordRefund,
    });
    const refund: StripeWebhookCommand = {
      kind: "refund",
      commandId: "stripe-command:refund-action",
      provider: "stripe",
      providerEventId: "evt_refund_action",
      providerEventType: "refund.updated",
      occurredAt: "2026-09-17T00:02:00.000Z",
      providerObjectId: "re_action",
      providerRefundId: "re_action",
      providerPaymentIntentId: "pi_123",
      status: "requires_action",
      amount: { amountMinor: 50_000, currency: "USD" },
      paymentAmount: null,
      paymentEvent: null,
      reference: null,
    };
    const handler = createStripeWebhookPostHandler({
      verify: vi.fn().mockResolvedValue(refund),
      createRepository: vi.fn().mockResolvedValue(store),
    });

    const response = await handler(webhookRequest());

    expect(response.status).toBe(204);
    expect(recordRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        providerEventId: "evt_refund_action",
        providerRefundId: "re_action",
        status: "requires_action",
        amountMinor: 50_000,
      }),
    );
  });

  it("passes charge aggregates to the authoritative cumulative refund RPC", async () => {
    const recordChargeRefund = vi.fn().mockResolvedValue(undefined);
    const store = repository({
      findPayment: vi.fn().mockResolvedValue({
        ...payment,
        status: "succeeded",
        captured_at: "2026-09-17T00:01:00.000Z",
      }),
      loadCommission: vi.fn().mockResolvedValue({
        ...commission,
        status: "paid",
      }),
      recordChargeRefund,
    });
    const aggregate: StripeWebhookCommand = {
      kind: "refund",
      commandId: "stripe-command:charge-refund",
      provider: "stripe",
      providerEventId: "evt_charge_refund",
      providerEventType: "charge.refunded",
      occurredAt: "2026-09-17T00:02:00.000Z",
      providerObjectId: "ch_123",
      providerRefundId: null,
      providerPaymentIntentId: "pi_123",
      status: "succeeded",
      amount: { amountMinor: 50_000, currency: "USD" },
      paymentAmount: { amountMinor: 250_000, currency: "USD" },
      paymentEvent: "partial_refund_succeeded",
      reference: null,
    };
    const handler = createStripeWebhookPostHandler({
      verify: vi.fn().mockResolvedValue(aggregate),
      createRepository: vi.fn().mockResolvedValue(store),
    });

    const response = await handler(webhookRequest());

    expect(response.status).toBe(204);
    expect(recordChargeRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        providerEventId: "evt_charge_refund",
        eventType: "charge.refunded",
        paymentId: ids.payment,
        providerPaymentId: "pi_123",
        providerChargeId: "ch_123",
        currency: "USD",
        cumulativeRefundedMinor: 50_000,
      }),
    );
  });

  it("passes disputes to the dedicated transactional DB workflow", async () => {
    const recordDispute = vi.fn().mockResolvedValue(undefined);
    const store = repository({
      findPayment: vi.fn().mockResolvedValue({
        ...payment,
        status: "succeeded",
        captured_at: "2026-09-17T00:01:00.000Z",
      }),
      loadCommission: vi.fn().mockResolvedValue({
        ...commission,
        status: "paid",
      }),
      recordDispute,
    });
    const dispute: StripeWebhookCommand = {
      kind: "dispute",
      commandId: "stripe-command:dispute",
      provider: "stripe",
      providerEventId: "evt_dispute",
      providerEventType: "charge.dispute.created",
      occurredAt: "2026-09-17T00:02:00.000Z",
      action: "opened",
      providerDisputeId: "dp_123",
      providerChargeId: "ch_123",
      providerPaymentIntentId: "pi_123",
      status: "needs_response",
      amount: { amountMinor: 25_000, currency: "USD" },
      reference: null,
    };
    const handler = createStripeWebhookPostHandler({
      verify: vi.fn().mockResolvedValue(dispute),
      createRepository: vi.fn().mockResolvedValue(store),
    });

    const response = await handler(webhookRequest());

    expect(response.status).toBe(204);
    expect(recordDispute).toHaveBeenCalledWith(
      expect.objectContaining({
        providerEventId: "evt_dispute",
        paymentId: ids.payment,
        providerPaymentId: "pi_123",
        providerDisputeId: "dp_123",
        status: "needs_response",
        currency: "USD",
        amountMinor: 25_000,
      }),
    );
  });
});
