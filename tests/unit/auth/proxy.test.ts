import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getApplicationOrigin } from "@/lib/security/origin";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";
import { config, proxy } from "@/proxy";

vi.mock("@/lib/security/origin", () => ({
  getApplicationOrigin: vi.fn(),
}));

vi.mock("@/lib/supabase/proxy", () => ({
  refreshSupabaseSession: vi.fn(),
}));

const mockedApplicationOrigin = vi.mocked(getApplicationOrigin);
const mockedRefreshSession = vi.mocked(refreshSupabaseSession);

beforeEach(() => {
  vi.resetAllMocks();
  mockedApplicationOrigin.mockReturnValue("https://atelier.example");
  mockedRefreshSession.mockResolvedValue({
    response: NextResponse.next(),
    subject: null,
    configured: true,
  });
});

describe("authentication proxy routing", () => {
  it("keeps API routes outside Proxy so Vercel upload and webhook body limits are not double-applied", () => {
    expect(config.matcher).toEqual([expect.stringContaining("api(?:/|$)")]);
    const matcher = new RegExp(`^${config.matcher[0]!}$`);
    expect(matcher.test("/api/uploads")).toBe(false);
    expect(matcher.test("/api/webhooks/stripe")).toBe(false);
    expect(matcher.test("/app/requests")).toBe(true);
  });

  it.each([
    "/app",
    "/app/commissions/7d255b26-1cf2-4d1d-b2cf-ec65027cfd42?payment=pending",
    "/admin",
    "/admin/inbox/message-id?view=compact",
  ])(
    "redirects signed-out private route %s and preserves its target",
    async (path) => {
      const response = await proxy(
        new NextRequest(`https://atelier.example${path}`),
      );
      const location = new URL(response.headers.get("location") ?? "");

      expect(response.status).toBe(307);
      expect(location.pathname).toBe("/sign-in");
      expect(location.searchParams.get("next")).toBe(path);
    },
  );

  it.each([
    "/",
    "/about",
    "/portfolio?category=rings",
    "/sign-in",
    "/auth/callback",
    "/api/health",
    "/portal",
  ])("does not redirect public route %s", async (path) => {
    const response = await proxy(
      new NextRequest(`https://atelier.example${path}`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not redirect an authenticated private request", async () => {
    mockedRefreshSession.mockResolvedValue({
      response: NextResponse.next(),
      subject: "7d255b26-1cf2-4d1d-b2cf-ec65027cfd42",
      configured: true,
    });

    const response = await proxy(
      new NextRequest("https://atelier.example/app/payments"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("fails clearly when authentication is disabled for a private route", async () => {
    mockedApplicationOrigin.mockReturnValue(null);

    const response = await proxy(
      new NextRequest("https://atelier.example/app"),
    );

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe(
      "Authentication is not configured.",
    );
  });
});
