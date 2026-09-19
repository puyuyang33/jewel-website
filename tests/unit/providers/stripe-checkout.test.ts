import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildHostedCheckoutRequest,
  createHostedCheckoutSession,
  getStripeClient,
  getStripeSecretKeyMode,
  retrieveHostedCheckoutSession,
  stripeModeForEnvironment,
  validateStripeApplicationOrigin,
  validateStripeSecretKey,
  validateStripeWebhookSecret,
  type StripeCheckoutClient,
} from "@/lib/payments";

const ids = {
  commission: "00000000-0000-4000-8000-000000000001",
  payment: "00000000-0000-4000-8000-000000000002",
};

const checkoutInput = {
  commissionId: ids.commission,
  paymentId: ids.payment,
  quoteVersion: 3,
  providerIdempotencyKey: `payment|${ids.commission}|final|3|1`,
  customerEmail: " Customer@Example.com ",
  amount: {
    amountMinor: 250_000,
    currency: "USD" as const,
  },
};

describe("Stripe configuration", () => {
  it("detects key mode and rejects malformed or cross-mode keys", () => {
    expect(getStripeSecretKeyMode("sk_test_example123")).toBe("test");
    expect(getStripeSecretKeyMode("sk_live_example123")).toBe("live");
    expect(validateStripeSecretKey("sk_test_example123", "test")).toBe(
      "sk_test_example123",
    );
    expect(() => validateStripeSecretKey("sk_test_example123", "live")).toThrow(
      /live mode/u,
    );
    expect(() => getStripeSecretKeyMode("pk_test_public")).toThrow(
      /configuration/u,
    );
    expect(() => getStripeSecretKeyMode(" sk_test_example123")).toThrow(
      /configuration/u,
    );
    expect(() => validateStripeSecretKey("sk_test_replace_me", "test")).toThrow(
      /invalid/u,
    );
    expect(() => validateStripeWebhookSecret("whsec_replace_me")).toThrow(
      /invalid/u,
    );
  });

  it("allows explicit test mode in optimized demo deployments", () => {
    expect(stripeModeForEnvironment("production", "test")).toBe("test");
    expect(stripeModeForEnvironment("production", "live")).toBe("live");
    expect(() => stripeModeForEnvironment("production", "invalid")).toThrow(
      /must be test or live/u,
    );
  });

  it("retains environment-based mode when no explicit mode is configured", () => {
    const previousMode = process.env.STRIPE_MODE;
    delete process.env.STRIPE_MODE;
    try {
      expect(stripeModeForEnvironment("production")).toBe("live");
      expect(stripeModeForEnvironment("development")).toBe("test");
    } finally {
      if (previousMode === undefined) {
        delete process.env.STRIPE_MODE;
      } else {
        process.env.STRIPE_MODE = previousMode;
      }
    }
  });

  it("validates an origin without accepting paths, credentials, or remote HTTP", () => {
    expect(validateStripeApplicationOrigin("https://example.com")).toBe(
      "https://example.com",
    );
    expect(validateStripeApplicationOrigin("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
    expect(() =>
      validateStripeApplicationOrigin("https://example.com/base"),
    ).toThrow(/origin/u);
    expect(() =>
      validateStripeApplicationOrigin("https://user@example.com"),
    ).toThrow(/origin/u);
    expect(() => validateStripeApplicationOrigin("http://example.com")).toThrow(
      /origin/u,
    );
  });

  it("returns no default client when optional configuration is absent", async () => {
    const previousKey = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      await expect(getStripeClient()).resolves.toBeNull();
    } finally {
      if (previousKey === undefined) {
        delete process.env.STRIPE_SECRET_KEY;
      } else {
        process.env.STRIPE_SECRET_KEY = previousKey;
      }
    }
  });
});

describe("hosted Stripe Checkout", () => {
  it("builds a deterministic request from immutable payment fields", () => {
    const first = buildHostedCheckoutRequest(
      checkoutInput,
      "https://atelier.example",
    );
    const second = buildHostedCheckoutRequest(
      { ...checkoutInput },
      "https://atelier.example",
    );

    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(first.params).toMatchObject({
      mode: "payment",
      ui_mode: "hosted_page",
      locale: "en",
      client_reference_id: ids.payment,
      customer_email: "customer@example.com",
      success_url: `https://atelier.example/app/commissions/${ids.commission}?payment=processing`,
      cancel_url: `https://atelier.example/app/commissions/${ids.commission}?payment=cancelled`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: 250_000,
            product_data: {
              name: "Custom jewelry commission — final payment",
            },
          },
        },
      ],
    });
    expect(first.params.metadata).toEqual({
      commission_id: ids.commission,
      payment_id: ids.payment,
      payment_kind: "final",
      provider_idempotency_key: checkoutInput.providerIdempotencyKey,
      quote_version: "3",
    });
    expect(first.params.payment_intent_data?.metadata).toEqual(
      first.params.metadata,
    );
    expect(first.params.metadata).not.toHaveProperty("customer_email");
    expect(first.params.metadata).not.toHaveProperty("amount");
    expect(first.params.metadata).not.toHaveProperty("currency");
  });

  it("uses the trusted attempt-specific provider idempotency key unchanged", () => {
    const first = buildHostedCheckoutRequest(
      checkoutInput,
      "https://atelier.example",
    );
    const nextAttempt = buildHostedCheckoutRequest(
      {
        ...checkoutInput,
        providerIdempotencyKey: `payment|${ids.commission}|final|3|2`,
      },
      "https://atelier.example",
    );
    expect(first.idempotencyKey).toBe(`payment|${ids.commission}|final|3|1`);
    expect(nextAttempt.idempotencyKey).toBe(
      `payment|${ids.commission}|final|3|2`,
    );
    expect(nextAttempt.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("returns only to the authenticated commission route with safe state markers", () => {
    const { params } = buildHostedCheckoutRequest(
      checkoutInput,
      "https://atelier.example",
    );
    const successUrl = new URL(params.success_url ?? "");
    const cancelUrl = new URL(params.cancel_url ?? "");

    expect(successUrl.pathname).toBe(`/app/commissions/${ids.commission}`);
    expect(successUrl.searchParams.get("payment")).toBe("processing");
    expect(cancelUrl.pathname).toBe(`/app/commissions/${ids.commission}`);
    expect(cancelUrl.searchParams.get("payment")).toBe("cancelled");
    expect(successUrl.searchParams.has("session_id")).toBe(false);
    expect(successUrl.pathname).not.toBe(`/commissions/${ids.commission}`);
    expect(successUrl.searchParams.has("checkout")).toBe(false);
  });

  it("rejects untrusted or unsupported checkout fields", () => {
    expect(() =>
      buildHostedCheckoutRequest(
        {
          ...checkoutInput,
          amount: { amountMinor: 0, currency: "USD" },
        },
        "https://atelier.example",
      ),
    ).toThrow();
    expect(() =>
      buildHostedCheckoutRequest(
        {
          ...checkoutInput,
          amount: { amountMinor: 100_000_000, currency: "USD" },
        },
        "https://atelier.example",
      ),
    ).toThrow(/limit/u);
    expect(() =>
      buildHostedCheckoutRequest(
        {
          ...checkoutInput,
          providerIdempotencyKey: "payment\nmalformed",
        },
        "https://atelier.example",
      ),
    ).toThrow();
    expect(() =>
      buildHostedCheckoutRequest(
        {
          ...checkoutInput,
          successUrl: "https://evil.example",
        } as typeof checkoutInput,
        "https://atelier.example",
      ),
    ).toThrow();
  });

  it("uses the deterministic key and returns only safe hosted-session fields", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
      created: 1_700_000_000,
      expires_at: 1_800_000_000,
      payment_intent: { id: "pi_123" },
      livemode: false,
      mode: "payment",
      status: "open",
      ui_mode: "hosted_page",
    });
    const client = {
      checkout: { sessions: { create } },
    } as unknown as StripeCheckoutClient;

    const result = await createHostedCheckoutSession(checkoutInput, {
      client,
      applicationOrigin: "https://atelier.example",
      mode: "test",
    });
    const built = buildHostedCheckoutRequest(
      checkoutInput,
      "https://atelier.example",
    );

    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(built.params, {
      idempotencyKey: built.idempotencyKey,
    });
    expect(result).toEqual({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
      createdAt: "2023-11-14T22:13:20.000Z",
      expiresAt: "2027-01-15T08:00:00.000Z",
      paymentIntentId: "pi_123",
    });
    expect(result).not.toHaveProperty("customer_details");
    expect(result).not.toHaveProperty("payment_method");
  });

  it("rejects wrong-mode and non-Stripe Checkout responses", async () => {
    const create = vi.fn();
    const client = {
      checkout: { sessions: { create } },
    } as unknown as StripeCheckoutClient;

    create.mockResolvedValueOnce({
      id: "cs_live_123",
      url: "https://checkout.stripe.com/c/pay/cs_live_123",
      created: 1_700_000_000,
      expires_at: 1_800_000_000,
      payment_intent: null,
      livemode: true,
      mode: "payment",
      status: "open",
      ui_mode: "hosted_page",
    });
    await expect(
      createHostedCheckoutSession(checkoutInput, {
        client,
        applicationOrigin: "https://atelier.example",
        mode: "test",
      }),
    ).rejects.toThrow(/wrong mode/u);

    create.mockResolvedValueOnce({
      id: "cs_test_123",
      url: "https://evil.example/checkout",
      created: 1_700_000_000,
      expires_at: 1_800_000_000,
      payment_intent: null,
      livemode: false,
      mode: "payment",
      status: "open",
      ui_mode: "hosted_page",
    });
    await expect(
      createHostedCheckoutSession(checkoutInput, {
        client,
        applicationOrigin: "https://atelier.example",
        mode: "test",
      }),
    ).rejects.toThrow(/invalid hosted Checkout URL/u);
  });

  it("retrieves and reduces a hosted payment session to canonical fields", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
      created: 1_700_000_000,
      expires_at: 1_800_000_000,
      payment_intent: { id: "pi_123" },
      livemode: false,
      mode: "payment",
      status: "open",
      ui_mode: "hosted_page",
      customer_details: { email: "must-not-escape@example.com" },
    });
    const client = {
      checkout: { sessions: { retrieve } },
    } as unknown as StripeCheckoutClient;

    const result = await retrieveHostedCheckoutSession("cs_test_123", {
      client,
      mode: "test",
    });

    expect(retrieve).toHaveBeenCalledWith("cs_test_123");
    expect(result).toEqual({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
      status: "open",
      mode: "payment",
      createdAt: "2023-11-14T22:13:20.000Z",
      expiresAt: "2027-01-15T08:00:00.000Z",
      paymentIntentId: "pi_123",
    });
    expect(result).not.toHaveProperty("customer_details");
  });

  it("returns null URL and PaymentIntent for an expired hosted session", async () => {
    const client = {
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            id: "cs_test_expired",
            url: null,
            created: 1_700_000_000,
            expires_at: 1_800_000_000,
            payment_intent: null,
            livemode: false,
            mode: "payment",
            status: "expired",
            ui_mode: "hosted_page",
          }),
        },
      },
    } as unknown as StripeCheckoutClient;

    await expect(
      retrieveHostedCheckoutSession("cs_test_expired", {
        client,
        mode: "test",
      }),
    ).resolves.toEqual({
      id: "cs_test_expired",
      url: null,
      status: "expired",
      mode: "payment",
      createdAt: "2023-11-14T22:13:20.000Z",
      expiresAt: "2027-01-15T08:00:00.000Z",
      paymentIntentId: null,
    });
  });

  it("rejects invalid, cross-mode, mismatched, or non-hosted retrievals", async () => {
    const retrieve = vi.fn();
    const client = {
      checkout: { sessions: { retrieve } },
    } as unknown as StripeCheckoutClient;

    await expect(
      retrieveHostedCheckoutSession("cs_live_123", {
        client,
        mode: "test",
      }),
    ).rejects.toThrow(/wrong mode/u);
    expect(retrieve).not.toHaveBeenCalled();

    retrieve.mockResolvedValueOnce({
      id: "cs_test_other",
      url: "https://checkout.stripe.com/c/pay/cs_test_other",
      created: 1_700_000_000,
      expires_at: 1_800_000_000,
      payment_intent: null,
      livemode: false,
      mode: "payment",
      status: "open",
      ui_mode: "hosted_page",
    });
    await expect(
      retrieveHostedCheckoutSession("cs_test_123", {
        client,
        mode: "test",
      }),
    ).rejects.toThrow(/wrong Checkout Session/u);

    retrieve.mockResolvedValueOnce({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
      created: 1_700_000_000,
      expires_at: 1_800_000_000,
      payment_intent: null,
      livemode: false,
      mode: "subscription",
      status: "open",
      ui_mode: "hosted_page",
    });
    await expect(
      retrieveHostedCheckoutSession("cs_test_123", {
        client,
        mode: "test",
      }),
    ).rejects.toThrow(/non-hosted payment/u);
  });
});
