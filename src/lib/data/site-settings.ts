import "server-only";

import type { VeyraSupabaseClient } from "@/lib/supabase/types";

import { assertDatabaseResult } from "./shared";

async function readPublishedSettings(supabase: VeyraSupabaseClient) {
  const result = await supabase.rpc("get_public_site_settings");
  assertDatabaseResult(result.error, "site_setting.published.read");
  return result.data[0] ?? null;
}

export async function readPublishedIntakeOpen(
  supabase: VeyraSupabaseClient,
): Promise<boolean | null> {
  return (await readPublishedSettings(supabase))?.intake_open ?? null;
}

export async function readPublishedQuoteValidityDays(
  supabase: VeyraSupabaseClient,
): Promise<number | null> {
  const value = (await readPublishedSettings(supabase))?.quote_validity_days;
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= 90
    ? value
    : null;
}
