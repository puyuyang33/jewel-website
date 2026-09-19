import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createEmailProviderFromEnvironment } from "@/lib/email";
import { createHostedCheckoutSession } from "@/lib/payments";

const integrationEnabled = process.env.RUN_PROVIDER_INTEGRATION_TESTS === "1";
const testRecipient = process.env.PROVIDER_TEST_EMAIL;

const stripeEnabled =
  integrationEnabled &&
  process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") === true &&
  Boolean(process.env.NEXT_PUBLIC_APP_URL);
const resendEnabled =
  integrationEnabled &&
  process.env.RESEND_API_KEY?.startsWith("re_") === true &&
  Boolean(process.env.EMAIL_FROM) &&
  Boolean(process.env.NEXT_PUBLIC_APP_URL) &&
  Boolean(testRecipient);

describe.skipIf(!stripeEnabled)("Stripe provider integration", () => {
  it("creates a test-mode hosted Checkout Session", async () => {
    const result = await createHostedCheckoutSession(
      {
        commissionId: "00000000-0000-4000-8000-000000000001",
        paymentId: "00000000-0000-4000-8000-000000000002",
        quoteVersion: 1,
        providerIdempotencyKey:
          "payment|00000000-0000-4000-8000-000000000001|final|1|1",
        customerEmail: testRecipient ?? "delivered@resend.dev",
        amount: { amountMinor: 100, currency: "USD" },
      },
      { mode: "test" },
    );

    expect(result.id).toMatch(/^cs_test_/u);
    expect(new URL(result.url).hostname).toBe("checkout.stripe.com");
  });
});

describe.skipIf(!resendEnabled)("Resend provider integration", () => {
  it("submits an idempotent transactional email", async () => {
    const provider = createEmailProviderFromEnvironment(process.env);
    const result = await provider.send({
      event: "commission_created",
      entityId: "00000000-0000-4000-8000-000000000003",
      eventVersion: 1,
      recipientEmail: testRecipient ?? "delivered@resend.dev",
      authenticatedPath: "/commissions/00000000-0000-4000-8000-000000000003",
    });

    expect(result.status).toBe("sent");
  });
});
