import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const originalEnvironment = {
  track: process.env.NEXT_PUBLIC_DEPLOYMENT_TRACK,
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  stripeMode: process.env.STRIPE_MODE,
  stripeKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  resendApiKey: process.env.RESEND_API_KEY,
  emailFrom: process.env.EMAIL_FROM,
};

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.STRIPE_MODE;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  vi.resetModules();
});

afterEach(() => {
  restore("NEXT_PUBLIC_DEPLOYMENT_TRACK", originalEnvironment.track);
  restore("NEXT_PUBLIC_APP_URL", originalEnvironment.appUrl);
  restore("NEXT_PUBLIC_SUPABASE_URL", originalEnvironment.supabaseUrl);
  restore("NEXT_PUBLIC_SUPABASE_ANON_KEY", originalEnvironment.supabaseAnonKey);
  restore(
    "SUPABASE_SERVICE_ROLE_KEY",
    originalEnvironment.supabaseServiceRoleKey,
  );
  restore("STRIPE_MODE", originalEnvironment.stripeMode);
  restore("STRIPE_SECRET_KEY", originalEnvironment.stripeKey);
  restore("STRIPE_WEBHOOK_SECRET", originalEnvironment.stripeWebhookSecret);
  restore("RESEND_API_KEY", originalEnvironment.resendApiKey);
  restore("EMAIL_FROM", originalEnvironment.emailFrom);
  vi.resetModules();
});

describe("health route integration status", () => {
  it("recognizes test-mode Stripe in an optimized free demo", async () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_TRACK = "free-demo";
    process.env.NEXT_PUBLIC_APP_URL = "https://demo.example.com";
    process.env.STRIPE_MODE = "test";
    process.env.STRIPE_SECRET_KEY = "sk_test_example123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_example123";
    vi.resetModules();

    const { GET } = await import("@/app/api/health/route");
    const payload = (await GET().json()) as {
      deploymentTrack: string;
      integrations: { stripe: boolean };
    };

    expect(payload.deploymentTrack).toBe("free-demo");
    expect(payload.integrations.stripe).toBe(true);
  }, 15_000);

  it("reports a Stripe mode/key mismatch as unconfigured", async () => {
    process.env.STRIPE_MODE = "live";
    process.env.STRIPE_SECRET_KEY = "sk_test_example123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_example123";
    process.env.NEXT_PUBLIC_APP_URL = "https://atelier.example.com";
    vi.resetModules();

    const { GET } = await import("@/app/api/health/route");
    const payload = (await GET().json()) as {
      integrations: { stripe: boolean };
    };

    expect(payload.integrations.stripe).toBe(false);
  }, 15_000);

  it("requires complete validated provider configuration", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://atelier.example.com";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exampleproject.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
      "public-anon-key-with-enough-characters";
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      "service-role-key-with-enough-characters";
    process.env.RESEND_API_KEY = "re_validexample123";
    process.env.EMAIL_FROM = "Veyra Atelier <projects@example.com>";
    vi.resetModules();

    const { GET } = await import("@/app/api/health/route");
    const configured = (await GET().json()) as {
      integrations: { supabase: boolean; email: boolean };
    };

    expect(configured.integrations).toMatchObject({
      supabase: true,
      email: true,
    });

    process.env.SUPABASE_SERVICE_ROLE_KEY = "replace-with-service-role-key";
    process.env.EMAIL_FROM = "invalid sender";

    const incomplete = (await GET().json()) as {
      integrations: { supabase: boolean; email: boolean };
    };
    expect(incomplete.integrations).toMatchObject({
      supabase: false,
      email: false,
    });
  }, 15_000);

  it("rejects checked-in Stripe placeholder values", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://atelier.example.com";
    process.env.STRIPE_MODE = "test";
    process.env.STRIPE_SECRET_KEY = "sk_test_replace_me";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_replace_me";
    vi.resetModules();

    const { GET } = await import("@/app/api/health/route");
    const payload = (await GET().json()) as {
      integrations: { stripe: boolean };
    };
    expect(payload.integrations.stripe).toBe(false);
  }, 15_000);
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
