"use server";

import { redirect } from "next/navigation";

import { AuthenticationError, toAuthenticationError } from "@/lib/auth/errors";
import {
  createOAuthCallbackUrl,
  createSignInPath,
  safeInternalRedirect,
} from "@/lib/auth/redirects";
import { getApplicationOrigin } from "@/lib/security/origin";
import { securityLogger } from "@/lib/security/logger";
import {
  isTrustedSupabaseAuthUrl,
  SupabaseConfigurationError,
} from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupabaseServiceConfiguration } from "@/lib/supabase/service-role";

export async function signInWithGoogle(formData: FormData): Promise<never> {
  const next = safeInternalRedirect(formData.get("next"));
  let authorizationUrl: string | null = null;
  let actionError: unknown = null;

  try {
    const applicationOrigin = getApplicationOrigin();
    if (!applicationOrigin || !getSupabaseServiceConfiguration().configured) {
      throw new SupabaseConfigurationError();
    }
    const callbackUrl = createOAuthCallbackUrl(applicationOrigin, next);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString(),
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error || !data.url || !isTrustedSupabaseAuthUrl(data.url)) {
      actionError = error ?? new AuthenticationError("oauth_failed");
    } else {
      authorizationUrl = data.url;
    }
  } catch (error) {
    actionError = error;
  }

  if (!authorizationUrl) {
    const safeError = toAuthenticationError(actionError);
    securityLogger.warn("auth.oauth_start_failed", {
      errorCode: safeError.code,
    });
    redirect(createSignInPath(next, safeError.code));
  }

  redirect(authorizationUrl);
}

export async function signOut(): Promise<never> {
  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      securityLogger.warn("auth.sign_out_failed", {
        providerCode: error.code,
      });
    }
  } catch (error) {
    const safeError = toAuthenticationError(error);
    securityLogger.warn("auth.sign_out_failed", {
      errorCode: safeError.code,
    });
  }

  redirect("/sign-in");
}

export const signOutAction = signOut;
