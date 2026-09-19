"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

let realtimeClient: ReturnType<typeof createBrowserSupabaseClient> | null =
  null;

export function getApplicationRealtimeClient() {
  realtimeClient ??= createBrowserSupabaseClient();
  return realtimeClient;
}
