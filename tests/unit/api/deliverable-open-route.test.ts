import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createDeliverableOpenHandler,
  createSupabaseDeliverableRepository,
  type DeliverableRepository,
} from "@/app/api/deliverables/[id]/open/route";
import type { AuthenticatedUserDto } from "@/lib/auth/dal";
import type { VeyraSupabaseClient } from "@/lib/supabase/types";
import type { Database } from "@/types/database.generated";

type CommissionRow = Database["public"]["Tables"]["commissions"]["Row"];
type DeliverableRow = Database["public"]["Tables"]["deliverables"]["Row"];
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

const ids = {
  customer: "10000000-0000-4000-8000-000000000001",
  otherCustomer: "10000000-0000-4000-8000-000000000002",
  admin: "10000000-0000-4000-8000-000000000003",
  commission: "20000000-0000-4000-8000-000000000001",
  deliverable: "30000000-0000-4000-8000-000000000001",
  payment: "40000000-0000-4000-8000-000000000001",
  request: "50000000-0000-4000-8000-000000000001",
};

const user: AuthenticatedUserDto = {
  id: ids.customer,
  email: "customer@example.com",
  displayName: "Customer",
  role: "client",
};

const admin: AuthenticatedUserDto = {
  id: ids.admin,
  email: "admin@example.com",
  displayName: "Admin",
  role: "admin",
};

function commission(overrides: Partial<CommissionRow> = {}): CommissionRow {
  return {
    id: ids.commission,
    reference_code: "VYR-0123456789ABCDEF0123456789ABCDEF",
    quote_acceptance_id: "60000000-0000-4000-8000-000000000001",
    design_request_id: "70000000-0000-4000-8000-000000000001",
    customer_id: ids.customer,
    status: "paid",
    accepted_quote_version: 1,
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
    started_at: "2026-09-02T00:00:00.000Z",
    target_completion_at: null,
    delivered_at: null,
    completed_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function deliverable(
  source: CommissionRow,
  overrides: Partial<DeliverableRow> = {},
): DeliverableRow {
  return {
    id: ids.deliverable,
    commission_id: source.id,
    customer_id: source.customer_id,
    kind: "design_package",
    status: "released",
    version_number: 1,
    title: "Design package",
    description: null,
    file_name: "design-package.pdf",
    mime_type: "application/pdf",
    byte_size: 1024,
    sha256_hex: "a".repeat(64),
    released_at: "2026-09-17T00:00:00.000Z",
    revoked_at: null,
    created_by: "80000000-0000-4000-8000-000000000001",
    created_at: "2026-09-17T00:00:00.000Z",
    updated_at: "2026-09-17T00:00:00.000Z",
    ...overrides,
  };
}

function payment(
  source: CommissionRow,
  overrides: Partial<PaymentRow> = {},
): PaymentRow {
  return {
    id: ids.payment,
    commission_id: source.id,
    customer_id: source.customer_id,
    provider: "stripe",
    provider_payment_id: "pi_123",
    provider_checkout_session_id: "cs_test_123",
    provider_idempotency_key: "payment:trusted",
    kind: "final",
    attempt_number: 1,
    status: "succeeded",
    currency: source.accepted_currency,
    amount_minor: source.accepted_total_minor,
    refunded_minor: 0,
    checkout_created_at: "2026-09-17T00:00:00.000Z",
    checkout_expires_at: "2026-09-17T01:00:00.000Z",
    provider_created_at: "2026-09-17T00:00:00.000Z",
    last_provider_event_at: "2026-09-17T00:00:00.000Z",
    captured_at: "2026-09-17T00:00:00.000Z",
    failure_code: null,
    created_at: "2026-09-17T00:00:00.000Z",
    updated_at: "2026-09-17T00:00:00.000Z",
    ...overrides,
  };
}

function createRepository(
  bundle: {
    deliverable: DeliverableRow;
    commission: CommissionRow;
    payment: PaymentRow | null;
  },
  rawTarget: string,
): DeliverableRepository {
  return {
    assertVisibleMetadata: vi.fn().mockResolvedValue(undefined),
    loadBundle: vi.fn().mockResolvedValue(bundle),
    authorizeAccessAndResolveTarget: vi.fn().mockResolvedValue(rawTarget),
    allowedTargetHosts: () => ["downloads.example.com"],
  };
}

function invoke(
  repository: DeliverableRepository,
  authenticatedUser: AuthenticatedUserDto = user,
) {
  const handler = createDeliverableOpenHandler({
    requireUser: vi.fn().mockResolvedValue(authenticatedUser),
    createRepository: vi.fn().mockResolvedValue(repository),
    createRequestId: () => ids.request,
  });
  return handler(
    new Request(
      `https://atelier.example/api/deliverables/${ids.deliverable}/open`,
      { headers: { "User-Agent": "route-test" } },
    ),
    { params: Promise.resolve({ id: ids.deliverable }) },
  );
}

describe("GET /api/deliverables/[id]/open", () => {
  it("uses the atomic database workflow for access and PAID to DELIVERED", async () => {
    const sourceCommission = commission();
    const bundle = {
      deliverable: deliverable(sourceCommission),
      commission: sourceCommission,
      payment: payment(sourceCommission),
    };
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          authorized: true,
          access_log_id: "90000000-0000-4000-8000-000000000001",
          resulting_commission_status: "delivered",
        },
      ],
      error: null,
    });
    const resolveRpc = vi.fn().mockResolvedValue({
      data: "https://downloads.example.com/private/design-package.pdf",
      error: null,
    });
    const userClient = { rpc } as unknown as VeyraSupabaseClient;
    const serviceClient = { rpc: resolveRpc } as unknown as VeyraSupabaseClient;
    const repository = createSupabaseDeliverableRepository(
      userClient,
      serviceClient,
    );

    await repository.authorizeAccessAndResolveTarget({
      bundle,
      user,
      requestId: ids.request,
      userAgent: "route-test",
    });

    expect(rpc).toHaveBeenCalledWith("authorize_deliverable_access", {
      p_deliverable_id: ids.deliverable,
      p_request_id: ids.request,
      p_ip_address: null,
      p_user_agent: "route-test",
    });
    expect(resolveRpc).toHaveBeenCalledWith("resolve_deliverable_secret_url", {
      p_access_log_id: "90000000-0000-4000-8000-000000000001",
      p_request_id: ids.request,
      p_actor_id: ids.customer,
    });
  });

  it("denies a locked deliverable without retrieving or exposing its URL", async () => {
    const sourceCommission = commission({ status: "final_payment_due" });
    const privateUrl =
      "https://downloads.example.com/private/locked-document.pdf?secret=never";
    const repository = createRepository(
      {
        deliverable: deliverable(sourceCommission),
        commission: sourceCommission,
        payment: null,
      },
      privateUrl,
    );

    const response = await invoke(repository);
    const body = await response.text();

    expect(response.status).toBe(423);
    expect(repository.authorizeAccessAndResolveTarget).not.toHaveBeenCalled();
    expect(body).not.toContain(privateUrl);
    expect(body).not.toContain("downloads.example.com");
    expect(body).not.toContain("secret=never");
  });

  it("redirects a paid customer only after durable access recording", async () => {
    const sourceCommission = commission();
    const privateUrl =
      "https://downloads.example.com/private/design-package.pdf?signature=safe";
    const repository = createRepository(
      {
        deliverable: deliverable(sourceCommission),
        commission: sourceCommission,
        payment: payment(sourceCommission),
      },
      privateUrl,
    );

    const response = await invoke(repository);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(privateUrl);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.text()).toBe("");
    expect(repository.authorizeAccessAndResolveTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        user,
        requestId: ids.request,
        userAgent: "route-test",
      }),
    );
  });

  it("allows an active admin through the same access-log-bound resolver", async () => {
    const sourceCommission = commission();
    const privateUrl =
      "https://downloads.example.com/private/admin-review.pdf?signature=safe";
    const repository = createRepository(
      {
        deliverable: deliverable(sourceCommission),
        commission: sourceCommission,
        payment: payment(sourceCommission),
      },
      privateUrl,
    );

    const response = await invoke(repository, admin);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(privateUrl);
    expect(repository.authorizeAccessAndResolveTarget).toHaveBeenCalledWith(
      expect.objectContaining({ user: admin }),
    );
  });

  it("denies a cross-customer request before reading the raw URL", async () => {
    const otherCommission = commission({
      customer_id: ids.otherCustomer,
    });
    const privateUrl =
      "https://downloads.example.com/private/other-customer.pdf?token=never";
    const repository = createRepository(
      {
        deliverable: deliverable(otherCommission),
        commission: otherCommission,
        payment: payment(otherCommission),
      },
      privateUrl,
    );

    const response = await invoke(repository);
    const body = await response.text();

    expect(response.status).toBe(423);
    expect(repository.authorizeAccessAndResolveTarget).not.toHaveBeenCalled();
    expect(body).not.toContain(privateUrl);
    expect(body).not.toContain("token=never");
  });

  it("fails closed on a lookalike target host without reflecting the URL", async () => {
    const sourceCommission = commission();
    const maliciousUrl =
      "https://downloads.example.com.evil.example/private?token=never";
    const repository = createRepository(
      {
        deliverable: deliverable(sourceCommission),
        commission: sourceCommission,
        payment: payment(sourceCommission),
      },
      maliciousUrl,
    );

    const response = await invoke(repository);
    const body = await response.text();

    expect(response.status).toBe(423);
    expect(repository.authorizeAccessAndResolveTarget).toHaveBeenCalledOnce();
    expect(body).not.toContain(maliciousUrl);
    expect(body).not.toContain("token=never");
  });
});
