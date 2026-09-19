"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database.generated";

import { requireSupabaseConfiguration } from "./config";

export function createBrowserSupabaseClient() {
  const { url, anonKey } = requireSupabaseConfiguration();

  return createBrowserClient<Database>(url, anonKey);
}

export const createClient = createBrowserSupabaseClient;
