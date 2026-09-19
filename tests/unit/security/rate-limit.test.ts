import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  consumeRateLimit,
  consumeRateLimitForSubject,
  createRateLimitKey,
} from "@/lib/security/rate-limit";
import type { VeyraSupabaseClient } from "@/lib/supabase/types";

function mockClient(result: {
  data: unknown;
  error: unknown;
}): VeyraSupabaseClient {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  } as unknown as VeyraSupabaseClient;
}

describe("database rate limiting", () => {
  it("creates an opaque deterministic SHA-256 key", () => {
    const first = createRateLimitKey("message_send", "user@example.com");
    const second = createRateLimitKey("message_send", "user@example.com");

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain("user");
  });

  it("uses the authenticated RPC and validates its decision", async () => {
    const client = mockClient({
      data: {
        allowed: true,
        remaining: 4,
        reset_at: "2026-09-17T06:00:00.000Z",
      },
      error: null,
    });

    const result = await consumeRateLimit(
      client,
      { action: "message_send" },
      () => Date.parse("2026-09-17T05:59:48.000Z"),
    );

    expect(client.rpc).toHaveBeenCalledWith("consume_rate_limit", {
      p_action: "message_send",
      p_cost: 1,
    });
    expect(result).toEqual({
      allowed: true,
      remaining: 4,
      resetAt: "2026-09-17T06:00:00.000Z",
      retryAfterSeconds: 12,
      source: "database",
    });
  });

  it("uses the service-role RPC for an external opaque subject", async () => {
    const client = mockClient({
      data: {
        allowed: false,
        remaining: 0,
        reset_at: "2026-09-17T06:00:00.000Z",
      },
      error: null,
    });

    await consumeRateLimitForSubject(
      client,
      {
        action: "deliverable_access",
        subject: "request-ip",
      },
      () => Date.parse("2026-09-17T05:59:30.000Z"),
    );

    expect(client.rpc).toHaveBeenCalledWith("consume_rate_limit_for_subject", {
      p_action: "deliverable_access",
      p_cost: 1,
      p_subject_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it.each([
    { data: null, error: { code: "database_error" } },
    { data: { allowed: "yes" }, error: null },
  ])(
    "fails closed for unavailable or malformed RPC results",
    async (rpcResult) => {
      const result = await consumeRateLimit(mockClient(rpcResult), {
        action: "message_send",
      });

      expect(result).toMatchObject({
        allowed: false,
        remaining: 0,
        source: "fail-closed",
      });
    },
  );
});
