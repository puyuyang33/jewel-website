"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  actionFailure,
  booleanField,
  success,
  validationFailure,
} from "@/features/application/action-utils";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/actions";

const publicSiteSettingsSchema = z.object({
  brandName: z.string().trim().min(1).max(120),
  contactEmail: z.string().trim().email().max(320),
  contactPhone: z
    .string()
    .trim()
    .max(40)
    .transform((value) => value || null),
  intakeOpen: booleanField,
  quoteValidityDays: z.coerce.number().int().min(1).max(90),
});

export async function savePublicSiteSettingsAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    return actionFailure("admin.public_site_settings_save.auth", error);
  }

  const parsed = publicSiteSettingsSchema.safeParse({
    brandName: formData.get("brandName"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone"),
    intakeOpen: formData.get("intakeOpen"),
    quoteValidityDays: formData.get("quoteValidityDays"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  try {
    const publishedAt = new Date().toISOString();
    const supabase = await createServerSupabaseClient();
    const result = await supabase
      .from("site_settings")
      .upsert(
        {
          settings_key: "public",
          brand_name: parsed.data.brandName,
          contact_email: parsed.data.contactEmail,
          contact_phone: parsed.data.contactPhone,
          intake_open: parsed.data.intakeOpen,
          quote_validity_days: parsed.data.quoteValidityDays,
          status: "published",
          published_at: publishedAt,
          created_by: admin.id,
        },
        { onConflict: "settings_key" },
      )
      .select("status,published_at")
      .single();
    if (result.error) {
      throw result.error;
    }
    if (
      result.data.status !== "published" ||
      result.data.published_at === null
    ) {
      throw new Error("Published settings were not persisted.");
    }

    revalidatePath("/admin/settings");
    revalidatePath("/admin/audit");
    revalidatePath("/");
    revalidatePath("/contact");
    revalidatePath("/start");
    return success("Public site settings published.");
  } catch (error) {
    return actionFailure("admin.public_site_settings_save.failed", error, {
      adminId: admin.id,
    });
  }
}
