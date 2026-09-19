import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createCheckoutPostHandler,
  createSupabaseCheckoutRepository,
  type CheckoutReservation,
  type CheckoutRepository,
} from "@/app/api/stripe/checkout/route";
import { ProtocolError } from "@/app/api/uploads/_lib/protocol";
import type { AuthenticatedUserDto } from "@/lib/auth/dal";
import { createPaymentIdempotencyKey } from "@/lib/domain/notifications";
import type { VeyraSupabaseClient } from "@/lib/supabase/types";
import type { Database } from "@/types/database.generated";

type CommissionRow = Database["public"]["Tables"]["commissions"]["Row"];

const ids = {
  user: "10000000-0000-4000-8000-000000000001",
  otherUser: "10000000-0000-4000-8000-000000000002",
  commission: "20000000-0000-4000-8000-000000000001",
  payment: "30000000-0000-4000-8000-000000000001",
  request: "60000000-0000-4000-8000-000000000001",
};

const user: AuthenticatedUserDto = {
  id: ids.user,
  email: "customer@example.com",
  displayName: "Customer",
  role: "client",
};

function commission(overrides: Partial<CommissionRow> = {}): CommissionRow {
  return {
    id: ids.commission,
    reference_code: "VYR-0123456789ABCDEF0123456789ABCDEF",
    quote_acceptance_id: "40000000-0000-4000-8000-000000000001",
    design_request_id: "50000000-0000-4000-8000-000000000001",
    customer_id: ids.user,
    status: "final_payment_due",
    accepted_quote_version: 7,
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
    ...overrides,
  };
}

function request(body: Record<string, unknown>): Request {
  return new Request("https://atelier.example/api/stripe/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://atelier.example",
    },
    body: JSON.stringify(body),
  });
}

function formRequest(body: string): Request {
  return new Request("https://atelier.example/api/stripe/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://atelier.example",
    },
    body,
  });
}

function checkoutReservation(
  overrides: Partial<CheckoutReservation> = {},
): CheckoutReservation {
  return {
    id: ids.payment,
    commissionId: ids.commission,
    customerId: ids.user,
    provider: "stripe",
    kind: "final",
    status: "not_started",
    providerIdempotencyKey:
      "payment|20000000-0000-4000-8000-000000000001|final|7|1",
    quoteVersion: 7,
    currency: "USD",
    amountMinor: 250_000,
    checkoutSessionId: null,
    checkoutExpiresAt: null,
    attemptNumber: 1,
    resumed: false,
    created: true,
    ...overrides,
  };
}

function successfulRoute(
  checkoutUrl = "https://checkout.stripe.com/c/pay/cs_test_safe",
) {
  const trustedCommission = commission();
  const reservation = checkoutReservation({
    providerIdempotencyKey: createPaymentIdempotencyKey({
      commissionId: ids.commission,
      kind: "final",
      quoteVersion: 7,
    }),
  });
  const repository: CheckoutRepository = {
    assertOwnership: vi.fn().mockResolvedValue(undefined),
    loadCommission: vi.fn().mockResolvedValue(trustedCommission),
    reserveCheckout: vi.fn().mockResolvedValue(reservation),
    attachProviderSession: vi.fn().mockResolvedValue(undefined),
  };
  const createCheckout = vi.fn().mockResolvedValue({
    id: "cs_test_safe",
    url: checkoutUrl,
    createdAt: "2026-09-17T00:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
    paymentIntentId: "pi_safe",
  });
  return {
    repository,
    createCheckout,
    handler: createCheckoutPostHandler({
      assertOrigin: vi.fn(),
      requireUser: vi.fn().mockResolvedValue(user),
      enforceRateLimit: vi.fn(),
      createRepository: vi.fn().mockResolvedValue(repository),
      createRequestId: () => ids.request,
      createCheckout,
      retrieveCheckout: vi.fn(),
    }),
  };
}

describe("POST /api/stripe/checkout", () => {
  it("redirects a same-origin native form directly to hosted Checkout", async () => {
    const route = successfulRoute();

    const response = await route.handler(
      formRequest(`commissionId=${encodeURIComponent(ids.commission)}`),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://checkout.stripe.com/c/pay/cs_test_safe",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.text()).toBe("");
  });

  it("resumes a valid pending Checkout Session without creating another", async () => {
    const checkoutExpiresAt = "2027-01-01T00:00:00.000Z";
    const repository: CheckoutRepository = {
      assertOwnership: vi.fn().mockResolvedValue(undefined),
      loadCommission: vi.fn().mockResolvedValue(commission()),
      reserveCheckout: vi.fn().mockResolvedValue(
        checkoutReservation({
          status: "pending",
          checkoutSessionId: "cs_test_existing",
          checkoutExpiresAt,
          resumed: true,
          created: false,
        }),
      ),
      attachProviderSession: vi.fn(),
    };
    const createCheckout = vi.fn();
    const retrieveCheckout = vi.fn().mockResolvedValue({
      id: "cs_test_existing",
      url: "https://checkout.stripe.com/c/pay/cs_test_existing",
      status: "open",
      mode: "payment",
      createdAt: "2026-09-17T00:00:00.000Z",
      expiresAt: checkoutExpiresAt,
      paymentIntentId: null,
    });
    const handler = createCheckoutPostHandler({
      assertOrigin: vi.fn(),
      requireUser: vi.fn().mockResolvedValue(user),
      enforceRateLimit: vi.fn(),
      createRepository: vi.fn().mockResolvedValue(repository),
      createRequestId: () => ids.request,
      createCheckout,
      retrieveCheckout,
    });

    const response = await handler(
      formRequest(`commissionId=${ids.commission}`),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://checkout.stripe.com/c/pay/cs_test_existing",
    );
    expect(retrieveCheckout).toHaveBeenCalledWith("cs_test_existing");
    expect(createCheckout).not.toHaveBeenCalled();
    expect(repository.attachProviderSession).not.toHaveBeenCalled();
  });

  it("never resumes an inactive or URL-less Checkout Session", async () => {
    const checkoutExpiresAt = "2027-01-01T00:00:00.000Z";
    const repository: CheckoutRepository = {
      assertOwnership: vi.fn().mockResolvedValue(undefined),
      loadCommission: vi.fn().mockResolvedValue(commission()),
      reserveCheckout: vi.fn().mockResolvedValue(
        checkoutReservation({
          status: "processing",
          checkoutSessionId: "cs_test_existing",
          checkoutExpiresAt,
          resumed: true,
          created: false,
        }),
      ),
      attachProviderSession: vi.fn(),
    };
    const handler = createCheckoutPostHandler({
      assertOrigin: vi.fn(),
      requireUser: vi.fn().mockResolvedValue(user),
      enforceRateLimit: vi.fn(),
      createRepository: vi.fn().mockResolvedValue(repository),
      createRequestId: () => ids.request,
      createCheckout: vi.fn(),
      retrieveCheckout: vi.fn().mockResolvedValue({
        id: "cs_test_existing",
        url: null,
        status: "complete",
        mode: "payment",
        createdAt: "2026-09-17T00:00:00.000Z",
        expiresAt: checkoutExpiresAt,
        paymentIntentId: "pi_existing",
      }),
    });

    const response = await handler(
      formRequest(`commissionId=${ids.commission}`),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("location")).toBeNull();
  });

  it.each([
    [
      "unsupported content",
      new Request("https://atelier.example/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          Origin: "https://atelier.example",
        },
        body: `commissionId=${ids.commission}`,
      }),
      415,
    ],
    [
      "duplicate form fields",
      formRequest(
        `commissionId=${ids.commission}&commissionId=${ids.otherUser}`,
      ),
      400,
    ],
  ])("rejects %s without provider access", async (_, input, status) => {
    const route = successfulRoute();

    const response = await route.handler(input);

    expect(response.status).toBe(status);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(route.createCheckout).not.toHaveBeenCalled();
  });

  it("rejects an untrusted provider URL without creating an open redirect", async () => {
    const route = successfulRoute(
      "https://evil.example/checkout?token=never-reflect",
    );

    const response = await route.handler(
      formRequest(`commissionId=${ids.commission}`),
    );
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
    expect(route.repository.attachProviderSession).not.toHaveBeenCalled();
    expect(body).not.toContain("evil.example");
    expect(body).not.toContain("never-reflect");
  });

  it("uses the DB-issued key for a new attempt after a terminal checkout", async () => {
    const nextAttempt = checkoutReservation({
      providerIdempotencyKey:
        "payment|20000000-0000-4000-8000-000000000001|final|7|2",
      attemptNumber: 2,
    });
    const repository: CheckoutRepository = {
      assertOwnership: vi.fn().mockResolvedValue(undefined),
      loadCommission: vi.fn().mockResolvedValue(commission()),
      reserveCheckout: vi.fn().mockResolvedValue(nextAttempt),
      attachProviderSession: vi.fn().mockResolvedValue(undefined),
    };
    const createCheckout = vi.fn().mockResolvedValue({
      id: "cs_test_attempt_2",
      url: "https://checkout.stripe.com/c/pay/cs_test_attempt_2",
      createdAt: "2026-09-17T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
      paymentIntentId: null,
    });
    const handler = createCheckoutPostHandler({
      assertOrigin: vi.fn(),
      requireUser: vi.fn().mockResolvedValue(user),
      enforceRateLimit: vi.fn(),
      createRepository: vi.fn().mockResolvedValue(repository),
      createRequestId: () => ids.request,
      createCheckout,
      retrieveCheckout: vi.fn(),
    });

    const response = await handler(request({ commissionId: ids.commission }));

    expect(response.status).toBe(201);
    expect(createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        providerIdempotencyKey:
          "payment|20000000-0000-4000-8000-000000000001|final|7|2",
      }),
    );
  });

  it("uses one provider identity under concurrent clicks", async () => {
    const providerIdempotencyKey =
      "payment|20000000-0000-4000-8000-000000000001|final|7|1";
    const reserveCheckout = vi
      .fn<CheckoutRepository["reserveCheckout"]>()
      .mockResolvedValueOnce(checkoutReservation({ providerIdempotencyKey }))
      .mockResolvedValueOnce(
        checkoutReservation({
          providerIdempotencyKey,
          resumed: true,
          created: false,
        }),
      );
    const repository: CheckoutRepository = {
      assertOwnership: vi.fn().mockResolvedValue(undefined),
      loadCommission: vi.fn().mockResolvedValue(commission()),
      reserveCheckout,
      attachProviderSession: vi.fn().mockResolvedValue(undefined),
    };
    const createCheckout = vi.fn().mockResolvedValue({
      id: "cs_test_shared",
      url: "https://checkout.stripe.com/c/pay/cs_test_shared",
      createdAt: "2026-09-17T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
      paymentIntentId: null,
    });
    const requestIds = [ids.request, ids.otherUser];
    const handler = createCheckoutPostHandler({
      assertOrigin: vi.fn(),
      requireUser: vi.fn().mockResolvedValue(user),
      enforceRateLimit: vi.fn(),
      createRepository: vi.fn().mockResolvedValue(repository),
      createRequestId: () => requestIds.shift() ?? ids.request,
      createCheckout,
      retrieveCheckout: vi.fn(),
    });

    const responses = await Promise.all([
      handler(request({ commissionId: ids.commission })),
      handler(request({ commissionId: ids.commission })),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(createCheckout).toHaveBeenCalledTimes(2);
    for (const [input] of createCheckout.mock.calls) {
      expect(input.providerIdempotencyKey).toBe(providerIdempotencyKey);
    }
    expect(repository.attachProviderSession).toHaveBeenCalledTimes(2);
  });

  it("reserves trusted DB money and tolerates a webhook winning attachment", async () => {
    const trustedCommission = commission();
    const userRpc = vi.fn().mockResolvedValue({
      data: [
        {
          payment_id: ids.payment,
          status: "not_started",
          currency: "USD",
          amount_minor: 250_000,
          provider_idempotency_key: "payment:trusted",
          provider_checkout_session_id: null,
          checkout_expires_at: null,
          attempt_number: 1,
          resumed: false,
          created: true,
        },
      ],
      error: null,
    });
    const serviceRpc = vi.fn().mockResolvedValue({
      data: [
        {
          payment_id: ids.payment,
          status: "succeeded",
          attached: true,
        },
      ],
      error: null,
    });
    const repository = createSupabaseCheckoutRepository(
      { rpc: userRpc } as unknown as VeyraSupabaseClient,
      { rpc: serviceRpc } as unknown as VeyraSupabaseClient,
    );

    const reservation = await repository.reserveCheckout({
      commission: trustedCommission,
      requestId: ids.request,
    });
    await repository.attachProviderSession(reservation, {
      id: "cs_test_safe",
      url: "https://checkout.stripe.com/c/pay/cs_test_safe",
      createdAt: "2026-09-17T00:00:00.000Z",
      expiresAt: "2026-09-17T01:00:00.000Z",
      paymentIntentId: null,
    });

    expect(userRpc).toHaveBeenCalledWith("begin_payment_checkout", {
      p_commission_id: ids.commission,
      p_request_id: ids.request,
    });
    expect(serviceRpc).toHaveBeenCalledWith("attach_stripe_checkout_session", {
      p_payment_id: ids.payment,
      p_provider_idempotency_key: "payment:trusted",
      p_checkout_session_id: "cs_test_safe",
      p_checkout_created_at: "2026-09-17T00:00:00.000Z",
      p_checkout_expires_at: "2026-09-17T01:00:00.000Z",
    });
  });

  it("ignores browser price, owner, and status tampering", async () => {
    const trustedCommission = commission();
    const assertOwnership = vi.fn().mockResolvedValue(undefined);
    const reserveCheckout = vi
      .fn<CheckoutRepository["reserveCheckout"]>()
      .mockImplementation(async (input) => ({
        id: ids.payment,
        commissionId: input.commission.id,
        customerId: input.commission.customer_id,
        provider: "stripe",
        kind: "final",
        status: "not_started",
        providerIdempotencyKey:
          "payment|20000000-0000-4000-8000-000000000001|final|7|1",
        quoteVersion: input.commission.accepted_quote_version,
        currency: input.commission.accepted_currency,
        amountMinor: input.commission.accepted_total_minor,
        checkoutSessionId: null,
        checkoutExpiresAt: null,
        attemptNumber: 1,
        resumed: false,
        created: true,
      }));
    const attachProviderSession = vi.fn().mockResolvedValue(undefined);
    const repository: CheckoutRepository = {
      assertOwnership,
      loadCommission: vi.fn().mockResolvedValue(trustedCommission),
      reserveCheckout,
      attachProviderSession,
    };
    const createCheckout = vi.fn().mockResolvedValue({
      id: "cs_test_safe",
      url: "https://checkout.stripe.com/c/pay/cs_test_safe",
      createdAt: "2026-09-17T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
      paymentIntentId: "pi_safe",
    });
    const handler = createCheckoutPostHandler({
      assertOrigin: vi.fn(),
      requireUser: vi.fn().mockResolvedValue(user),
      enforceRateLimit: vi.fn(),
      createRepository: vi.fn().mockResolvedValue(repository),
      createRequestId: () => ids.request,
      createCheckout,
      retrieveCheckout: vi.fn(),
    });

    const response = await handler(
      request({
        commissionId: ids.commission,
        amountMinor: 1,
        currency: "EUR",
        customerId: ids.otherUser,
        status: "paid",
        successUrl: "https://evil.example/steal",
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      url: "https://checkout.stripe.com/c/pay/cs_test_safe",
    });
    expect(assertOwnership).toHaveBeenCalledWith(ids.commission, ids.user);
    expect(reserveCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        commission: trustedCommission,
      }),
    );
    expect(createCheckout).toHaveBeenCalledWith({
      paymentId: ids.payment,
      commissionId: ids.commission,
      quoteVersion: 7,
      kind: "final",
      providerIdempotencyKey:
        "payment|20000000-0000-4000-8000-000000000001|final|7|1",
      customerEmail: user.email,
      amount: { amountMinor: 250_000, currency: "USD" },
    });
    expect(reserveCheckout.mock.invocationCallOrder[0]).toBeLessThan(
      createCheckout.mock.invocationCallOrder[0] ?? Infinity,
    );
    expect(attachProviderSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: ids.payment }),
      expect.objectContaining({
        id: "cs_test_safe",
        paymentIntentId: "pi_safe",
      }),
    );
  });

  it("rejects an ineligible commission before provider access", async () => {
    const createCheckout = vi.fn();
    const repository: CheckoutRepository = {
      assertOwnership: vi.fn().mockResolvedValue(undefined),
      loadCommission: vi.fn().mockResolvedValue(commission({ status: "paid" })),
      reserveCheckout: vi.fn(),
      attachProviderSession: vi.fn(),
    };
    const handler = createCheckoutPostHandler({
      assertOrigin: vi.fn(),
      requireUser: vi.fn().mockResolvedValue(user),
      enforceRateLimit: vi.fn(),
      createRepository: vi.fn().mockResolvedValue(repository),
      createRequestId: () => ids.request,
      createCheckout,
      retrieveCheckout: vi.fn(),
    });

    const response = await handler(request({ commissionId: ids.commission }));

    expect(response.status).toBe(409);
    expect(createCheckout).not.toHaveBeenCalled();
    expect(repository.reserveCheckout).not.toHaveBeenCalled();
  });

  it.each(["active", "settled"] as const)(
    "surfaces a DB-rejected %s attempt without provider access",
    async () => {
      const createCheckout = vi.fn();
      const repository: CheckoutRepository = {
        assertOwnership: vi.fn().mockResolvedValue(undefined),
        loadCommission: vi.fn().mockResolvedValue(commission()),
        reserveCheckout: vi
          .fn()
          .mockRejectedValue(new ProtocolError("CONFLICT")),
        attachProviderSession: vi.fn(),
      };
      const handler = createCheckoutPostHandler({
        assertOrigin: vi.fn(),
        requireUser: vi.fn().mockResolvedValue(user),
        enforceRateLimit: vi.fn(),
        createRepository: vi.fn().mockResolvedValue(repository),
        createRequestId: () => ids.request,
        createCheckout,
        retrieveCheckout: vi.fn(),
      });

      const response = await handler(request({ commissionId: ids.commission }));

      expect(response.status).toBe(409);
      expect(createCheckout).not.toHaveBeenCalled();
    },
  );
});
