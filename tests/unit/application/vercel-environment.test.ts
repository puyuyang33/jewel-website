import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  type DeploymentEnvironment,
  validateVercelEnvironment,
  VercelEnvironmentError,
} from "@/lib/security/vercel-environment";

const actionKey = Buffer.alloc(32, 7).toString("base64");

function environment(
  overrides: DeploymentEnvironment = {},
): DeploymentEnvironment {
  return {
    NEXT_PUBLIC_APP_URL: "https://preview.veyra.test",
    NEXT_PUBLIC_DEPLOYMENT_TRACK: "production",
    VERCEL_ENV: "preview",
    VEYRA_VERCEL_ENV: "preview",
    NEXT_PUBLIC_SUPABASE_URL: "https://preview-project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_preview_public_key_value",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_preview_service_role_key_value",
    ADMIN_GOOGLE_EMAIL: "admin@veyra.test",
    STRIPE_MODE: "test",
    STRIPE_SECRET_KEY: "sk_test_previewvalue123",
    STRIPE_WEBHOOK_SECRET: "whsec_previewvalue123",
    BUSINESS_TIMEZONE: "America/Chicago",
    DEFAULT_CURRENCY: "USD",
    DELIVERABLE_ALLOWED_HOSTS: "dropbox.com,www.dropbox.com",
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: actionKey,
    ...overrides,
  };
}

describe("Vercel environment validation", () => {
  it("accepts an isolated Preview environment with Stripe test mode", () => {
    expect(validateVercelEnvironment(environment(), "preview")).toEqual({
      applicationOrigin: "https://preview.veyra.test",
      deploymentTrack: "production",
      emailEnabled: false,
      stripeMode: "test",
      supabaseOrigin: "https://preview-project.supabase.co",
      target: "preview",
    });
  });

  it("accepts a non-commercial Hobby demo in the Production environment", () => {
    expect(
      validateVercelEnvironment(
        environment({
          NEXT_PUBLIC_APP_URL: "https://veyra-demo.vercel.app",
          NEXT_PUBLIC_DEPLOYMENT_TRACK: "free-demo",
          VERCEL_ENV: "production",
          VEYRA_VERCEL_ENV: "production",
          STRIPE_MODE: "test",
        }),
        "production",
      ).deploymentTrack,
    ).toBe("free-demo");
  });

  it("requires live Stripe configuration for the production track", () => {
    expect(() =>
      validateVercelEnvironment(environment(), "production"),
    ).toThrow(/production deployment track must use Stripe live mode/u);

    expect(
      validateVercelEnvironment(
        environment({
          NEXT_PUBLIC_APP_URL: "https://veyraatelier.com",
          VERCEL_ENV: "production",
          VEYRA_VERCEL_ENV: "production",
          STRIPE_MODE: "live",
          STRIPE_SECRET_KEY: "sk_live_productionvalue123",
          STRIPE_WEBHOOK_SECRET: "whsec_productionvalue123",
        }),
        "production",
      ).stripeMode,
    ).toBe("live");
  });

  it("rejects missing secrets, shared Supabase keys, and invalid action keys", () => {
    try {
      validateVercelEnvironment(
        environment({
          ADMIN_GOOGLE_EMAIL: "designer@example.com",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "shared-key-with-enough-characters",
          SUPABASE_SERVICE_ROLE_KEY: "shared-key-with-enough-characters",
          NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: "not-base64",
        }),
        "preview",
      );
      throw new Error("Expected environment validation to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(VercelEnvironmentError);
      expect((error as VercelEnvironmentError).issues).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/must be different/u),
          expect.stringMatching(/ADMIN_GOOGLE_EMAIL/u),
          expect.stringMatching(/standard Base64/u),
        ]),
      );
    }
  });

  it("requires complete optional email configuration when enabled", () => {
    expect(() =>
      validateVercelEnvironment(
        environment({ RESEND_API_KEY: "re_enabled123" }),
        "preview",
      ),
    ).toThrow(/EMAIL_FROM/u);
    expect(() =>
      validateVercelEnvironment(
        environment({
          RESEND_API_KEY: "re_enabled123",
          EMAIL_FROM: "not-an-email",
          ADMIN_NOTIFICATION_EMAIL: "admin@veyra.test",
        }),
        "preview",
      ),
    ).toThrow(/EMAIL_FROM/u);
  });

  it("rejects whitespace-padded Stripe values and immutable Preview origins", () => {
    expect(() =>
      validateVercelEnvironment(
        environment({
          STRIPE_MODE: " test ",
          STRIPE_SECRET_KEY: " sk_test_previewvalue123 ",
          STRIPE_WEBHOOK_SECRET: " whsec_previewvalue123 ",
        }),
        "preview",
      ),
    ).toThrow(/surrounding whitespace/u);
    expect(() =>
      validateVercelEnvironment(
        environment({ STRIPE_SECRET_KEY: "sk_test_x" }),
        "preview",
      ),
    ).toThrow(/STRIPE_SECRET_KEY/u);

    expect(() =>
      validateVercelEnvironment(
        environment({
          NEXT_PUBLIC_APP_URL: "https://veyra-git-main-owner.vercel.app",
          VERCEL_URL: "veyra-git-main-owner.vercel.app",
        }),
        "preview",
      ),
    ).toThrow(/stable Preview alias/u);
    expect(() =>
      validateVercelEnvironment(
        environment({
          NEXT_PUBLIC_APP_URL: "https://STABLE_PREVIEW_ALIAS",
        }),
        "preview",
      ),
    ).toThrow(/NEXT_PUBLIC_APP_URL/u);
    expect(() =>
      validateVercelEnvironment(
        environment({ VEYRA_VERCEL_ENV: "production" }),
        "preview",
      ),
    ).toThrow(/VEYRA_VERCEL_ENV=production/u);
  });
});
