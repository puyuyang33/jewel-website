import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database.generated";

import { isSafeSupabaseUrl, SupabaseConfigurationError } from "./config";

const serviceConfigurationSchema = z.object({
  url: z.string().refine(isSafeSupabaseUrl),
  serviceRoleKey: z.string().min(20),
});

export interface SupabaseServiceConfiguration {
  url: string;
  serviceRoleKey: string;
}

export function getSupabaseServiceConfiguration():
  | { configured: true; value: SupabaseServiceConfiguration }
  | { configured: false; value: null } {
  const parsed = serviceConfigurationSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  });

  if (!parsed.success || /^replace-with-/i.test(parsed.data.serviceRoleKey)) {
    return { configured: false, value: null };
  }

  return { configured: true, value: parsed.data };
}

export function createServiceRoleClient() {
  const configuration = getSupabaseServiceConfiguration();
  if (!configuration.configured) {
    throw new SupabaseConfigurationError();
  }

  const { url, serviceRoleKey } = configuration.value;

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export const createAdminClient = createServiceRoleClient;
export const createServiceRoleSupabaseClient = createServiceRoleClient;
