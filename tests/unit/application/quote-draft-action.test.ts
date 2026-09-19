import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/auth/dal", () => ({
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/security/logger", () => ({
  securityLogger: {
    error: vi.fn(),
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { createQuoteDraftAction } from "@/features/admin/quote-actions";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/actions";

const adminId = "10000000-0000-4000-8000-000000000001";
const requestId = "10000000-0000-4000-8000-000000000002";
const quoteId = "10000000-0000-4000-8000-000000000003";
const previousState: ActionResult<{ quoteId: string }> = {
  ok: false,
  message: "",
};

function quoteFormData(
  lineItems: { description: string; amount: string }[],
): FormData {
  const formData = new FormData();
  formData.set("requestId", requestId);
  formData.set("sourceQuoteId", "");
  formData.set("title", "Orbit ring");
  formData.set("introduction", "Two considered approaches.");
  formData.set("terms", "Final payment is due before release.");
  formData.set("currency", "USD");
  formData.set("productionWeeks", "12");
  formData.set(
    "options",
    JSON.stringify([
      {
        title: "Hand-fabricated",
        description: "A singular platinum setting.",
        scope: "Design and fabricate one ring.",
        materials: "Platinum",
        stoneAssumptions: "Client-provided sapphire",
        deliverables: "Finished ring and care guide",
        includedRevisionRounds: "2",
        estimatedCompletionDays: "84",
        lineItems,
      },
    ]),
  );
  return formData;
}

function configureSuccessfulClient() {
  const requestQuery = {
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id: requestId, status: "open" },
      error: null,
    }),
  };
  requestQuery.eq.mockReturnValue(requestQuery);

  const versionQuery = {
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  versionQuery.eq.mockReturnValue(versionQuery);
  versionQuery.order.mockReturnValue(versionQuery);
  versionQuery.limit.mockReturnValue(versionQuery);

  const quoteSingle = vi.fn().mockResolvedValue({
    data: { id: quoteId },
    error: null,
  });
  const quoteInsert = vi.fn(() => ({
    select: vi.fn(() => ({ single: quoteSingle })),
  }));
  const quoteDeleteQuery = {
    eq: vi.fn().mockResolvedValue({ error: null }),
  };
  const optionInsert = vi.fn().mockResolvedValue({ error: null });

  const from = vi.fn((table: string) => {
    if (table === "design_requests") {
      return { select: vi.fn(() => requestQuery) };
    }
    if (table === "quote_versions") {
      return {
        select: vi.fn(() => versionQuery),
        insert: quoteInsert,
        delete: vi.fn(() => quoteDeleteQuery),
      };
    }
    if (table === "quote_options") {
      return { insert: optionInsert };
    }
    throw new Error(`Unexpected table ${table}`);
  });
  vi.mocked(createServerSupabaseClient).mockResolvedValue({ from } as never);
  return { optionInsert };
}

describe("createQuoteDraftAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({
      id: adminId,
      email: "admin@veyra.example",
      displayName: "Atelier Admin",
      role: "admin",
    });
  });

  it("serializes line item money in the exact guarded database shape", async () => {
    const { optionInsert } = configureSuccessfulClient();

    const result = await createQuoteDraftAction(
      previousState,
      quoteFormData([
        { description: "Design", amount: "1250.00" },
        { description: "Fabrication", amount: "2750.00" },
      ]),
    );

    expect(result).toEqual({
      ok: true,
      message: "Quote version 1 saved as a draft.",
      data: { quoteId },
    });
    expect(optionInsert).toHaveBeenCalledWith([
      {
        quote_version_id: quoteId,
        title: "Hand-fabricated",
        description: "A singular platinum setting.",
        scope_snapshot: {
          scope: "Design and fabricate one ring.",
          materials: "Platinum",
          stoneAssumptions: "Client-provided sapphire",
          deliverables: "Finished ring and care guide",
        },
        included_revision_rounds: 2,
        estimated_completion_days: 84,
        line_items: [
          {
            description: "Design",
            amount: { amountMinor: 125_000, currency: "USD" },
          },
          {
            description: "Fabrication",
            amount: { amountMinor: 275_000, currency: "USD" },
          },
        ],
        currency: "USD",
        total_minor: 400_000,
        deposit_minor: 0,
        sort_order: 0,
      },
    ]);
  });

  it("rejects an overflowing option total before opening a database client", async () => {
    const result = await createQuoteDraftAction(
      previousState,
      quoteFormData([
        { description: "Design", amount: "600000.00" },
        { description: "Fabrication", amount: "500000.00" },
      ]),
    );

    expect(result).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Option total must be between 0.01 and 999,999.99",
    });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("rejects line descriptions beyond the database limit", async () => {
    const result = await createQuoteDraftAction(
      previousState,
      quoteFormData([{ description: "x".repeat(121), amount: "100.00" }]),
    );

    expect(result).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
    });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
});
