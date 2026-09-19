import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import type { Database } from "@/types/database.generated";

import { getSupabaseConfiguration } from "./config";

export interface RefreshedSupabaseSession {
  response: NextResponse;
  subject: string | null;
  configured: boolean;
}

export async function refreshSupabaseSession(
  request: NextRequest,
): Promise<RefreshedSupabaseSession> {
  const configuration = getSupabaseConfiguration();
  let response = NextResponse.next({ request });

  if (!configuration.configured) {
    return { response, subject: null, configured: false };
  }

  const supabase = createServerClient<Database>(
    configuration.value.url,
    configuration.value.anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({ request });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  try {
    const { data, error } = await supabase.auth.getClaims();
    const subject =
      !error && typeof data?.claims?.sub === "string" ? data.claims.sub : null;

    return { response, subject, configured: true };
  } catch {
    return { response, subject: null, configured: true };
  }
}
