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

import { revalidatePath } from "next/cache";

import { savePortfolioProjectAction } from "@/features/admin/actions";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/actions";

const adminId = "50000000-0000-4000-8000-000000000001";
const projectId = "50000000-0000-4000-8000-000000000002";
const previousState: ActionResult<{ projectId: string }> = {
  ok: false,
  message: "",
};

function projectFormData(): FormData {
  const formData = new FormData();
  formData.set("projectId", projectId);
  formData.set("slug", "new-orbit-ring");
  formData.set("title", "New Orbit Ring");
  formData.set("excerpt", "A revised public excerpt.");
  formData.set("story", "The complete revised atelier story.");
  formData.set("materials", "platinum, sapphire");
  formData.set("techniques", "hand fabrication");
  formData.set("status", "archived");
  formData.set("featured", "false");
  formData.set("sortOrder", "4");
  formData.set("completedOn", "2026-08-15");
  return formData;
}

describe("savePortfolioProjectAction cache invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({
      id: adminId,
      email: "admin@veyra.example",
      displayName: "Atelier Admin",
      role: "admin",
    });
  });

  it("invalidates old, new, listing, home, and dynamic detail paths from database slugs", async () => {
    const existingQuery = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: projectId, slug: "old-orbit-ring" },
        error: null,
      }),
    };
    existingQuery.eq.mockReturnValue(existingQuery);
    const updateQuery = {
      eq: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: projectId, slug: "new-orbit-ring" },
        error: null,
      }),
    };
    updateQuery.eq.mockReturnValue(updateQuery);
    updateQuery.select.mockReturnValue(updateQuery);
    const update = vi.fn(() => updateQuery);
    const from = vi.fn((table: string) => {
      if (table !== "portfolio_projects") {
        throw new Error(`Unexpected table ${table}`);
      }
      return {
        select: vi.fn(() => existingQuery),
        update,
      };
    });
    vi.mocked(createServerSupabaseClient).mockResolvedValue({ from } as never);

    const result = await savePortfolioProjectAction(
      previousState,
      projectFormData(),
    );

    expect(result).toEqual({
      ok: true,
      message: "Portfolio project saved.",
      data: { projectId },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "new-orbit-ring",
        title: "New Orbit Ring",
        story: "The complete revised atelier story.",
        status: "archived",
        published_at: null,
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/portfolio");
    expect(revalidatePath).toHaveBeenCalledWith("/portfolio/old-orbit-ring");
    expect(revalidatePath).toHaveBeenCalledWith("/portfolio/new-orbit-ring");
    expect(revalidatePath).toHaveBeenCalledWith("/portfolio/[slug]", "page");
  });
});
