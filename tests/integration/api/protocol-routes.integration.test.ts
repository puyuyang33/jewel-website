import { describe, expect, it } from "vitest";

const baseUrl = process.env.API_TEST_BASE_URL;
const integrationEnabled =
  process.env.RUN_API_INTEGRATION_TESTS === "1" && Boolean(baseUrl);

describe.skipIf(!integrationEnabled)("protocol route integration", () => {
  it("rejects an unsigned Stripe webhook without touching trusted state", async () => {
    const response = await fetch(new URL("/api/webhooks/stripe", baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"id":"unsigned-integration-probe"}',
      redirect: "manual",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_WEBHOOK",
        message: "The webhook could not be verified.",
      },
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
