import { describe, expect, it } from "vitest";

import { validateRealtimeLoadTarget } from "@/lib/security/load-test-target";

describe("Realtime load-test target validation", () => {
  it("accepts the exact approved non-production Supabase project", () => {
    expect(
      validateRealtimeLoadTarget({
        expectedProjectRef: "preview1234",
        productionProjectRef: "production9876",
        supabaseUrl: "https://preview1234.supabase.co",
      }),
    ).toBe("https://preview1234.supabase.co");
  });

  it("rejects production and mismatched projects", () => {
    expect(() =>
      validateRealtimeLoadTarget({
        expectedProjectRef: "production9876",
        productionProjectRef: "production9876",
        supabaseUrl: "https://production9876.supabase.co",
      }),
    ).toThrow(/differ from the production/u);
    expect(() =>
      validateRealtimeLoadTarget({
        expectedProjectRef: "preview1234",
        productionProjectRef: "production9876",
        supabaseUrl: "https://another1234.supabase.co",
      }),
    ).toThrow(/exactly match/u);
  });
});
