import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getSupabaseConfiguration,
  isTrustedSupabaseAuthUrl,
  SupabaseConfigurationError,
  requireSupabaseConfiguration,
} from "@/lib/supabase/config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Supabase configuration", () => {
  it("reports missing public settings without invoking the SDK", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const result = getSupabaseConfiguration();
    expect(result.configured).toBe(false);
    expect(() => requireSupabaseConfiguration()).toThrow(
      SupabaseConfigurationError,
    );
  });

  it("accepts HTTPS and local development endpoints", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "local-anon-key-that-is-long-enough",
    );

    expect(getSupabaseConfiguration()).toMatchObject({ configured: true });
  });

  it("rejects insecure remote endpoints", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://database.example");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "public-anon-key-that-is-long-enough",
    );

    expect(getSupabaseConfiguration()).toMatchObject({ configured: false });
  });

  it("only accepts authorization URLs on the configured Supabase origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "public-anon-key-that-is-long-enough",
    );

    expect(
      isTrustedSupabaseAuthUrl(
        "https://project.supabase.co/auth/v1/authorize?provider=google",
      ),
    ).toBe(true);
    expect(
      isTrustedSupabaseAuthUrl(
        "https://attacker.example/auth/v1/authorize?provider=google",
      ),
    ).toBe(false);
  });
});
