import { type NextRequest, NextResponse } from "next/server";

import {
  createSignInPath,
  isProtectedAuthPath,
  safeInternalRedirect,
} from "@/lib/auth/redirects";
import { getApplicationOrigin } from "@/lib/security/origin";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";

function copyRefreshedCookies(
  source: NextResponse,
  destination: NextResponse,
): NextResponse {
  for (const cookie of source.cookies.getAll()) {
    destination.cookies.set(cookie);
  }
  return destination;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const refreshed = await refreshSupabaseSession(request);

  if (
    isProtectedAuthPath(request.nextUrl.pathname) &&
    refreshed.subject === null
  ) {
    const applicationOrigin = getApplicationOrigin();
    if (!applicationOrigin) {
      return copyRefreshedCookies(
        refreshed.response,
        new NextResponse("Authentication is not configured.", {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        }),
      );
    }

    const requestedNext = safeInternalRedirect(
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    const destination = new URL(
      createSignInPath(requestedNext),
      applicationOrigin,
    );

    const redirectResponse = NextResponse.redirect(destination);
    redirectResponse.headers.set("Cache-Control", "no-store");
    return copyRefreshedCookies(refreshed.response, redirectResponse);
  }

  return refreshed.response;
}

export const config = {
  matcher: [
    "/((?!api(?:/|$)|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
