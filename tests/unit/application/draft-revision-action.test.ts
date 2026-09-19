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

import { createDraftRevisionAction } from "@/features/admin/draft-actions";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const commissionId = "40000000-0000-4000-8000-000000000001";
const draftId = "40000000-0000-4000-8000-000000000002";
const revisionId = "40000000-0000-4000-8000-000000000003";
const idempotencyKey = "40000000-0000-4000-8000-000000000004";
const newDraftId = "40000000-0000-4000-8000-000000000005";

function draftFormData(): FormData {
  const formData = new FormData();
  formData.set("commissionId", commissionId);
  formData.set("draftId", draftId);
  formData.set("stage", "refinement");
  formData.set("title", "Refined gallery");
  formData.set("notes", "The prong profile is now lower.");
  formData.set("idempotencyKey", idempotencyKey);
  formData.set("newDraftId", newDraftId);
  return formData;
}

function commissionQuery() {
  const query = {
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id: commissionId, status: "revision_requested" },
      error: null,
    }),
  };
  query.eq.mockReturnValue(query);
  return query;
}

describe("createDraftRevisionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({
      id: "40000000-0000-4000-8000-000000000010",
      email: "admin@veyra.example",
      displayName: "Atelier Admin",
      role: "admin",
    });
  });

  it("creates an existing-series revision only through the atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          draft_revision_id: revisionId,
          revision_number: 2,
          status: "working",
          created: true,
        },
      ],
      error: null,
    });
    const from = vi.fn();
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from,
      rpc,
    } as never);

    const result = await createDraftRevisionAction(draftFormData());

    expect(result).toEqual({
      ok: true,
      message: "Draft revision saved privately.",
      data: { revisionId },
    });
    expect(rpc).toHaveBeenCalledWith("create_draft_revision", {
      p_commission_id: commissionId,
      p_design_draft_id: draftId,
      p_title: "Refined gallery",
      p_notes: "The prong profile is now lower.",
      p_idempotency_key: idempotencyKey,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("lets the RPC replay the original revision after workflow state advances", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          draft_revision_id: revisionId,
          revision_number: 2,
          status: "shared",
          created: false,
        },
      ],
      error: null,
    });
    const from = vi.fn();
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from,
      rpc,
    } as never);

    const result = await createDraftRevisionAction(draftFormData());

    expect(result).toEqual({
      ok: true,
      message: "Draft revision was already saved.",
      data: { revisionId },
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("creates a stable new parent ID before delegating its first revision to the RPC", async () => {
    const formData = draftFormData();
    formData.set("draftId", "");
    const sequenceQuery = {
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { sequence_number: 3 },
        error: null,
      }),
    };
    sequenceQuery.eq.mockReturnValue(sequenceQuery);
    sequenceQuery.order.mockReturnValue(sequenceQuery);
    sequenceQuery.limit.mockReturnValue(sequenceQuery);
    const existingParentQuery = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    };
    existingParentQuery.eq.mockReturnValue(existingParentQuery);
    const parentInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: { id: newDraftId },
          error: null,
        }),
      })),
    }));
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          draft_revision_id: revisionId,
          revision_number: 1,
          status: "working",
          created: true,
        },
      ],
      error: null,
    });
    const from = vi.fn((table: string) => {
      if (table === "commissions") {
        return { select: vi.fn(() => commissionQuery()) };
      }
      if (table === "design_drafts") {
        return {
          select: vi.fn((columns: string) =>
            columns === "id" ? existingParentQuery : sequenceQuery,
          ),
          insert: parentInsert,
          delete: vi.fn(),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from,
      rpc,
    } as never);

    const result = await createDraftRevisionAction(formData);

    expect(result).toMatchObject({
      ok: true,
      data: { revisionId },
    });
    expect(parentInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: newDraftId,
        commission_id: commissionId,
        sequence_number: 4,
        status: "working",
      }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "create_draft_revision",
      expect.objectContaining({
        p_design_draft_id: newDraftId,
        p_idempotency_key: idempotencyKey,
      }),
    );
    expect(from).not.toHaveBeenCalledWith("draft_revisions");
  });

  it("returns an explicit stale result when the parent is no longer eligible", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "55000",
        message:
          "historical or published design draft cannot receive a new revision",
      },
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from: vi.fn(),
      rpc,
    } as never);

    const result = await createDraftRevisionAction(draftFormData());

    expect(result).toMatchObject({
      ok: false,
      code: "DRAFT_REVISION_STALE",
      message:
        "The draft series changed while you were working. Refresh and try again.",
    });
  });
});
