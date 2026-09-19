import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  mapVerifiedStripeEventToCommand,
  verifyAndMapStripeWebhook,
  type StripeWebhookClient,
} from "@/lib/payments";

const ids = {
  commission: "00000000-0000-4000-8000-000000000001",
  payment: "00000000-0000-4000-8000-000000000002",
};

const safeMetadata = {
  commission_id: ids.commission,
  payment_id: ids.payment,
  payment_kind: "final",
  provider_idempotency_key: `payment|${ids.commission}|final|3|1`,
  quote_version: "3",
  amount_minor: "1",
  customer_email: "do-not-copy@example.com",
};

function stripeEvent(
  type: Stripe.Event.Type,
  object: Record<string, unknown>,
  overrides: Partial<Stripe.Event> = {},
): Stripe.Event {
  return {
    id: "evt_123",
    object: "event",
    api_version: null,
    created: 1_700_000_000,
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
    ...overrides,
  } as unknown as Stripe.Event;
}

function paymentIntent(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "pi_123",
    object: "payment_intent",
    amount: 250_000,
    amount_received: 250_000,
    currency: "usd",
    livemode: false,
    metadata: safeMetadata,
    ...overrides,
  };
}

describe("Stripe webhook command mapping", () => {
  it.each([
    ["payment_intent.processing", "payment_processing"],
    ["payment_intent.succeeded", "payment_succeeded"],
    ["payment_intent.payment_failed", "payment_failed"],
    ["payment_intent.canceled", "payment_cancelled"],
  ] as const)("maps %s to %s using provider money", (type, paymentEvent) => {
    const command = mapVerifiedStripeEventToCommand(
      stripeEvent(type, paymentIntent()),
      "test",
    );

    expect(command).toMatchObject({
      kind: "payment_status",
      paymentEvent,
      providerPaymentIntentId: "pi_123",
      amount: { amountMinor: 250_000, currency: "USD" },
      amountReceivedMinor: 250_000,
      reference: {
        commissionId: ids.commission,
        paymentId: ids.payment,
        paymentKind: "final",
        providerIdempotencyKey: `payment|${ids.commission}|final|3|1`,
        quoteVersion: 3,
      },
    });
    expect(command).not.toHaveProperty("metadata");
    expect(command).not.toHaveProperty("customer_email");
  });

  it("does not use metadata as monetary truth", () => {
    const command = mapVerifiedStripeEventToCommand(
      stripeEvent(
        "payment_intent.succeeded",
        paymentIntent({
          amount: 42_500,
          currency: "eur",
          metadata: {
            ...safeMetadata,
            amount_minor: "99999999",
            currency: "usd",
          },
        }),
      ),
      "test",
    );

    expect(command).toMatchObject({
      amount: { amountMinor: 42_500, currency: "EUR" },
    });
  });

  it("drops invalid metadata while retaining provider identifiers", () => {
    const command = mapVerifiedStripeEventToCommand(
      stripeEvent(
        "payment_intent.succeeded",
        paymentIntent({
          metadata: {
            commission_id: ids.commission,
            payment_id: ids.payment,
            payment_kind: "final",
            provider_idempotency_key: "payment\nmalformed",
            quote_version: "3",
          },
        }),
      ),
      "test",
    );

    expect(command).toMatchObject({
      providerPaymentIntentId: "pi_123",
      reference: null,
    });
  });

  it("maps paid, delayed, failed, and expired Checkout events", () => {
    const checkout = {
      id: "cs_test_123",
      object: "checkout.session",
      amount_total: 250_000,
      currency: "usd",
      livemode: false,
      metadata: safeMetadata,
      mode: "payment",
      payment_intent: "pi_123",
      payment_status: "paid",
    };

    expect(
      mapVerifiedStripeEventToCommand(
        stripeEvent("checkout.session.completed", checkout),
        "test",
      ),
    ).toMatchObject({
      paymentEvent: "payment_succeeded",
      amountReceivedMinor: 250_000,
    });
    expect(
      mapVerifiedStripeEventToCommand(
        stripeEvent("checkout.session.completed", {
          ...checkout,
          payment_status: "unpaid",
        }),
        "test",
      ),
    ).toMatchObject({
      paymentEvent: "payment_processing",
      amountReceivedMinor: null,
    });
    expect(
      mapVerifiedStripeEventToCommand(
        stripeEvent("checkout.session.async_payment_failed", checkout),
        "test",
      ),
    ).toMatchObject({ paymentEvent: "payment_failed" });
    expect(
      mapVerifiedStripeEventToCommand(
        stripeEvent("checkout.session.expired", checkout),
        "test",
      ),
    ).toMatchObject({ paymentEvent: "payment_cancelled" });
    expect(
      mapVerifiedStripeEventToCommand(
        stripeEvent("checkout.session.completed", {
          ...checkout,
          mode: "subscription",
        }),
        "test",
      ),
    ).toBeNull();
  });

  it("maps individual refund status and classifies expanded charge totals", () => {
    const partial = mapVerifiedStripeEventToCommand(
      stripeEvent("refund.updated", {
        id: "re_123",
        object: "refund",
        amount: 50_000,
        currency: "usd",
        status: "succeeded",
        payment_intent: "pi_123",
        metadata: safeMetadata,
        charge: {
          id: "ch_123",
          amount: 250_000,
          amount_refunded: 50_000,
          currency: "usd",
        },
      }),
      "test",
    );
    const full = mapVerifiedStripeEventToCommand(
      stripeEvent(
        "refund.updated",
        {
          id: "re_124",
          object: "refund",
          amount: 200_000,
          currency: "usd",
          status: "succeeded",
          payment_intent: "pi_123",
          metadata: {},
          charge: {
            id: "ch_123",
            amount: 250_000,
            amount_refunded: 250_000,
            currency: "usd",
          },
        },
        { id: "evt_124" },
      ),
      "test",
    );

    expect(partial).toMatchObject({
      kind: "refund",
      status: "succeeded",
      amount: { amountMinor: 50_000, currency: "USD" },
      paymentAmount: { amountMinor: 250_000, currency: "USD" },
      paymentEvent: "partial_refund_succeeded",
    });
    expect(full).toMatchObject({
      paymentEvent: "refund_succeeded",
      reference: null,
    });
  });

  it("maps aggregate charge refunds without exposing charge details", () => {
    const command = mapVerifiedStripeEventToCommand(
      stripeEvent("charge.refunded", {
        id: "ch_123",
        object: "charge",
        amount: 250_000,
        amount_refunded: 250_000,
        currency: "usd",
        livemode: false,
        metadata: safeMetadata,
        payment_intent: "pi_123",
        refunded: true,
      }),
      "test",
    );

    expect(command).toMatchObject({
      kind: "refund",
      providerObjectId: "ch_123",
      providerRefundId: null,
      paymentEvent: "refund_succeeded",
      amount: { amountMinor: 250_000, currency: "USD" },
    });
  });

  it.each([
    ["charge.dispute.created", "opened"],
    ["charge.dispute.updated", "updated"],
    ["charge.dispute.closed", "closed"],
    ["charge.dispute.funds_withdrawn", "funds_withdrawn"],
    ["charge.dispute.funds_reinstated", "funds_reinstated"],
  ] as const)("maps %s to a typed %s command", (type, action) => {
    const command = mapVerifiedStripeEventToCommand(
      stripeEvent(type, {
        id: "dp_123",
        object: "dispute",
        amount: 25_000,
        currency: "usd",
        charge: "ch_123",
        payment_intent: "pi_123",
        status: type === "charge.dispute.closed" ? "won" : "under_review",
        livemode: false,
        metadata: safeMetadata,
      }),
      "test",
    );

    expect(command).toMatchObject({
      kind: "dispute",
      action,
      providerDisputeId: "dp_123",
      providerChargeId: "ch_123",
      amount: { amountMinor: 25_000, currency: "USD" },
    });
  });

  it("uses deterministic event command IDs for duplicate and ordered delivery", () => {
    const duplicate = stripeEvent("payment_intent.succeeded", paymentIntent());
    const first = mapVerifiedStripeEventToCommand(duplicate, "test");
    const retried = mapVerifiedStripeEventToCommand(duplicate, "test");
    const olderDifferentEvent = mapVerifiedStripeEventToCommand(
      stripeEvent("payment_intent.processing", paymentIntent(), {
        id: "evt_older",
        created: 1_699_999_000,
      }),
      "test",
    );

    expect(retried?.commandId).toBe(first?.commandId);
    expect(olderDifferentEvent?.commandId).not.toBe(first?.commandId);
    expect(olderDifferentEvent?.occurredAt).toBe("2023-11-14T21:56:40.000Z");
    expect(first?.occurredAt).toBe("2023-11-14T22:13:20.000Z");
  });

  it("ignores unrelated events and rejects cross-mode events", () => {
    expect(
      mapVerifiedStripeEventToCommand(
        stripeEvent("customer.created", { id: "cus_123" }),
        "test",
      ),
    ).toBeNull();
    expect(() =>
      mapVerifiedStripeEventToCommand(
        stripeEvent(
          "payment_intent.succeeded",
          paymentIntent({ livemode: true }),
          { livemode: true },
        ),
        "test",
      ),
    ).toThrow(/configured Stripe mode/u);
  });
});

describe("Stripe raw webhook verification", () => {
  it("passes the untouched body to signature verification before mapping", async () => {
    const rawBody = new TextEncoder().encode('{"id":"evt_123"}');
    const event = stripeEvent("payment_intent.succeeded", paymentIntent());
    const constructEventAsync = vi.fn().mockResolvedValue(event);
    const client = {
      webhooks: { constructEventAsync },
    } as unknown as StripeWebhookClient;

    const command = await verifyAndMapStripeWebhook(
      {
        rawBody,
        signature: "t=1700000000,v1=signed",
      },
      {
        client,
        webhookSecret: "whsec_example123",
        mode: "test",
        toleranceSeconds: 120,
      },
    );

    expect(constructEventAsync).toHaveBeenCalledWith(
      rawBody,
      "t=1700000000,v1=signed",
      "whsec_example123",
      120,
    );
    expect(command).toMatchObject({ paymentEvent: "payment_succeeded" });
  });

  it("rejects empty, oversized, unsigned, and unconfigured requests", async () => {
    const client = {
      webhooks: { constructEventAsync: vi.fn() },
    } as unknown as StripeWebhookClient;

    await expect(
      verifyAndMapStripeWebhook(
        { rawBody: "", signature: "signature" },
        { client, webhookSecret: "whsec_example123", mode: "test" },
      ),
    ).rejects.toThrow(/body size/u);
    await expect(
      verifyAndMapStripeWebhook(
        {
          rawBody: new Uint8Array(1_048_577),
          signature: "signature",
        },
        { client, webhookSecret: "whsec_example123", mode: "test" },
      ),
    ).rejects.toThrow(/body size/u);
    await expect(
      verifyAndMapStripeWebhook(
        { rawBody: "{}", signature: "" },
        { client, webhookSecret: "whsec_example123", mode: "test" },
      ),
    ).rejects.toThrow();
    await expect(
      verifyAndMapStripeWebhook(
        { rawBody: "{}", signature: "signature" },
        { client, webhookSecret: "", mode: "test" },
      ),
    ).rejects.toThrow(/not configured/u);
    expect(client.webhooks.constructEventAsync).not.toHaveBeenCalled();
  });

  it("propagates signature failure without parsing or logging the payload", async () => {
    const verificationError = new Error("signature mismatch");
    const constructEventAsync = vi.fn().mockRejectedValue(verificationError);
    const client = {
      webhooks: { constructEventAsync },
    } as unknown as StripeWebhookClient;
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      verifyAndMapStripeWebhook(
        {
          rawBody: '{"card":"never-log-this"}',
          signature: "invalid",
        },
        {
          client,
          webhookSecret: "whsec_example123",
          mode: "test",
        },
      ),
    ).rejects.toBe(verificationError);
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
