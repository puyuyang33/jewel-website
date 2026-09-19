import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/auth/dal", () => ({
  requireUser: vi.fn(),
}));
vi.mock("@/lib/security/logger", () => ({
  securityLogger: {
    error: vi.fn(),
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { submitCounterofferAction } from "@/features/customer/actions";
import { requireUser } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { initialActionResult } from "@/types/actions";

describe("submitCounterofferAction payment range", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({
      id: "20000000-0000-4000-8000-000000000001",
      email: "customer@veyra.example",
      displayName: "Mara",
      role: "client",
    });
  });

  it("rejects an amount above the provider maximum before calling Supabase", async () => {
    const formData = new FormData();
    formData.set("quoteId", "20000000-0000-4000-8000-000000000002");
    formData.set("optionId", "20000000-0000-4000-8000-000000000003");
    formData.set("amount", "1000000.00");
    formData.set("explanation", "Preserve the stone and simplify the setting.");
    formData.set("idempotencyKey", "20000000-0000-4000-8000-000000000004");

    const result = await submitCounterofferAction(
      initialActionResult,
      formData,
    );

    expect(result).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Proposed amount must be between 0.01 and 999,999.99",
    });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
});
