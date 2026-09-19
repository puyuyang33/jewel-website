import { type NextRequest, NextResponse } from "next/server";

import { AuthenticationError, toAuthenticationError } from "@/lib/auth/errors";
import {
  hasOAuthAuthenticationMethod,
  isVerifiedGoogleUser,
  upsertAuthenticatedProfile,
} from "@/lib/auth/profiles";
import { createSignInPath, safeInternalRedirect } from "@/lib/auth/redirects";
import { getApplicationOrigin } from "@/lib/security/origin";
import { securityLogger } from "@/lib/security/logger";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { VeyraSupabaseClient } from "@/lib/supabase/types";

function errorRedirect(
  origin: string,
  code: string,
  next: string,
): NextResponse {
  const destination = new URL(createSignInPath(next, code), origin);
  const response = NextResponse.redirect(destination, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

async function clearLocalSession(supabase: VeyraSupabaseClient | null) {
  if (!supabase) {
    return;
  }

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // The callback still returns a safe failure when cleanup is unavailable.
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const applicationOrigin = getApplicationOrigin();
  if (!applicationOrigin) {
    return new Response("Authentication is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const next = safeInternalRedirect(request.nextUrl.searchParams.get("next"));
  const providerError = request.nextUrl.searchParams.get("error");
  if (providerError) {
    securityLogger.warn("auth.oauth_callback_rejected", {
      providerCode: providerError,
    });
    return errorRedirect(applicationOrigin, "oauth_failed", next);
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code || code.length > 4_096) {
    return errorRedirect(applicationOrigin, "invalid_callback", next);
  }

  let supabase: VeyraSupabaseClient | null = null;

  try {
    supabase = await createServerSupabaseClient();
    const exchange = await supabase.auth.exchangeCodeForSession(code);
    if (exchange.error) {
      throw new AuthenticationError("oauth_failed");
    }

    const claims = await supabase.auth.getClaims();
    const subject =
      !claims.error && typeof claims.data?.claims?.sub === "string"
        ? claims.data.claims.sub
        : null;
    const verifiedUser = await supabase.auth.getUser();
    const user = verifiedUser.data.user;

    if (
      verifiedUser.error ||
      !subject ||
      !user ||
      user.id !== subject ||
      !hasOAuthAuthenticationMethod(claims.data?.claims?.amr) ||
      !isVerifiedGoogleUser(user)
    ) {
      throw new AuthenticationError("unauthenticated");
    }

    await upsertAuthenticatedProfile(user);

    const response = NextResponse.redirect(
      new URL(next, applicationOrigin),
      303,
    );
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    await clearLocalSession(supabase);
    const safeError = toAuthenticationError(error);
    securityLogger.warn("auth.oauth_callback_failed", {
      errorCode: safeError.code,
    });
    return errorRedirect(applicationOrigin, safeError.code, next);
  }
}
