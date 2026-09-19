import type { Metadata } from "next";
import { Gem, LogIn, ShieldCheck } from "lucide-react";

import { signInWithGoogle } from "@/app/auth/actions";
import { Logo } from "@/components/brand/logo";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card } from "@/components/ui/card";
import { getSignInErrorMessage } from "@/lib/auth/errors";
import { safeInternalRedirect } from "@/lib/auth/redirects";
import { getApplicationOrigin } from "@/lib/security/origin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSupabaseServiceConfiguration } from "@/lib/supabase/service-role";

export const metadata: Metadata = {
  title: "Private sign in",
  description: "Secure access to the Veyra Atelier private workspace.",
  robots: {
    index: false,
    follow: false,
  },
};

interface SignInPageProps {
  searchParams: Promise<{
    error?: string | string[];
    next?: string | string[];
  }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const parameters = await searchParams;
  const errorCode = Array.isArray(parameters.error)
    ? parameters.error[0]
    : parameters.error;
  const requestedNext = Array.isArray(parameters.next)
    ? parameters.next[0]
    : parameters.next;
  const next = safeInternalRedirect(requestedNext);
  const errorMessage = getSignInErrorMessage(errorCode);
  const authenticationEnabled =
    isSupabaseConfigured() &&
    getSupabaseServiceConfiguration().configured &&
    getApplicationOrigin() !== null;

  return (
    <main className="bg-ink text-porcelain relative min-h-dvh overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(rgba(246,242,234,.22) 1px, transparent 1px), linear-gradient(90deg, rgba(246,242,234,.22) 1px, transparent 1px)",
          backgroundSize: "4rem 4rem",
        }}
      />
      <div
        className="border-brass/20 pointer-events-none absolute -top-48 right-[-12rem] size-[40rem] rounded-full border"
        aria-hidden="true"
      />
      <div
        className="border-brass/25 pointer-events-none absolute top-[-7rem] right-[-2rem] size-[20rem] rotate-45 border"
        aria-hidden="true"
      />

      <div className="relative mx-auto grid min-h-dvh w-full max-w-[90rem] lg:grid-cols-[1.2fr_0.8fr]">
        <section className="flex min-h-[42vh] flex-col justify-between px-6 py-8 sm:px-12 sm:py-12 lg:min-h-dvh lg:px-16 lg:py-14">
          <Logo className="text-porcelain w-fit" />

          <div className="max-w-3xl py-16 lg:py-24">
            <p className="eyebrow text-brass">Private atelier access</p>
            <h1 className="font-display mt-6 max-w-2xl text-[clamp(3.5rem,8vw,7.5rem)] leading-[0.84] tracking-[-0.055em]">
              Your story,
              <span className="text-parchment block pl-[0.42em] italic">
                held in detail.
              </span>
            </h1>
            <p className="text-porcelain/65 mt-9 max-w-lg text-lg leading-8">
              Enter the private workspace where sketches, materials, and
              decisions become a singular piece.
            </p>
          </div>

          <div className="text-porcelain/45 flex items-center gap-3 text-sm">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Encrypted session · access verified on every request</span>
          </div>
        </section>

        <section className="border-porcelain/10 bg-porcelain text-ink relative flex items-center border-t px-5 py-16 sm:px-12 lg:border-t-0 lg:border-l lg:px-14">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 flex items-center gap-4">
              <span className="border-brass/40 text-garnet grid size-12 place-items-center rounded-full border">
                <Gem size={20} strokeWidth={1.5} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Veyra private room</p>
                <p className="text-stone mt-1 text-sm">Secure client access</p>
              </div>
            </div>

            <Card className="rounded-[2rem] bg-white p-7 shadow-[0_32px_90px_rgba(33,31,27,0.13)] sm:p-9">
              <h2 className="font-display text-4xl leading-none">
                Welcome back.
              </h2>
              <p className="text-stone mt-4 leading-7">
                Continue with the Google account attached to your atelier
                invitation.
              </p>

              {errorMessage ? (
                <div
                  className="border-garnet/25 bg-garnet/5 text-garnet mt-6 rounded-2xl border px-4 py-3 text-sm leading-6"
                  role="alert"
                >
                  {errorMessage}
                </div>
              ) : null}

              {authenticationEnabled ? (
                <form action={signInWithGoogle} className="mt-8">
                  <input type="hidden" name="next" value={next} />
                  <SubmitButton
                    className="w-full"
                    size="lg"
                    pendingLabel="Opening Google…"
                  >
                    <LogIn size={18} aria-hidden="true" />
                    Continue with Google
                  </SubmitButton>
                </form>
              ) : (
                <div
                  className="border-brass/35 bg-parchment/55 mt-8 rounded-2xl border p-5"
                  role="status"
                >
                  <p className="font-semibold">
                    Authentication configuration is incomplete
                  </p>
                  <p className="text-stone mt-2 text-sm leading-6">
                    Sign-in is temporarily disabled. Configure the Supabase
                    public URL, public key, server credentials, and application
                    URL, then rebuild the application.
                  </p>
                </div>
              )}
            </Card>

            <p className="text-stone mt-6 text-center text-xs leading-5">
              Administrative privileges are checked against the active atelier
              allowlist. Veyra never asks for your Google password.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
