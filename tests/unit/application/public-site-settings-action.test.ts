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

import { savePublicSiteSettingsAction } from "@/features/admin/site-settings-actions";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { initialActionResult } from "@/types/actions";

const adminId = "f6691cb0-55bc-43e0-ac58-83a4eb5a5ace";

function validFormData(): FormData {
  const formData = new FormData();
  formData.set("brandName", " Veyra Atelier ");
  formData.set("contactEmail", " concierge@veyra.example ");
  formData.set("contactPhone", " +1 555 123 4567 ");
  formData.set("intakeOpen", "on");
  formData.set("quoteValidityDays", "21");
  formData.set("seoTitle", "Must not be persisted");
  return formData;
}

describe("savePublicSiteSettingsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.mocked(requireAdmin).mockResolvedValue({
      id: adminId,
      email: "admin@veyra.example",
      displayName: "Atelier Admin",
      role: "admin",
    });
  });

  it("publishes only the five typed fields to the public singleton", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T18:00:00.000Z"));
    const single = vi.fn().mockResolvedValue({
      data: {
        status: "published",
        published_at: "2026-09-17T18:00:00.000Z",
      },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const upsert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ upsert }));
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from,
    } as never);

    const result = await savePublicSiteSettingsAction(
      initialActionResult,
      validFormData(),
    );

    expect(result).toEqual({
      ok: true,
      message: "Public site settings published.",
    });
    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith("site_settings");
    expect(upsert).toHaveBeenCalledWith(
      {
        settings_key: "public",
        brand_name: "Veyra Atelier",
        contact_email: "concierge@veyra.example",
        contact_phone: "+1 555 123 4567",
        intake_open: true,
        quote_validity_days: 21,
        status: "published",
        published_at: "2026-09-17T18:00:00.000Z",
        created_by: adminId,
      },
      { onConflict: "settings_key" },
    );
  });

  it("rejects invalid typed values before creating a database client", async () => {
    const formData = validFormData();
    formData.set("brandName", "");
    formData.set("quoteValidityDays", "91");
    formData.set("contactPhone", "x".repeat(41));

    const result = await savePublicSiteSettingsAction(
      initialActionResult,
      formData,
    );

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("fails explicitly when the database does not confirm publication", async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });
    const select = vi.fn(() => ({ single }));
    const upsert = vi.fn(() => ({ select }));
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from: vi.fn(() => ({ upsert })),
    } as never);

    const result = await savePublicSiteSettingsAction(
      initialActionResult,
      validFormData(),
    );

    expect(result.ok).toBe(false);
    expect(result).toHaveProperty("message");
  });
});
