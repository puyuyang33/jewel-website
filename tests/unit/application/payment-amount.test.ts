import { describe, expect, it } from "vitest";

import {
  isProviderSupportedMinorAmount,
  PROVIDER_AMOUNT_MAX_MINOR,
  PROVIDER_AMOUNT_MIN_MINOR,
  sumProviderSupportedMinorAmounts,
} from "@/features/application/payment-amount";

describe("provider-supported application amounts", () => {
  it("accepts only the exact provider and database minor-unit range", () => {
    expect(isProviderSupportedMinorAmount(PROVIDER_AMOUNT_MIN_MINOR)).toBe(
      true,
    );
    expect(isProviderSupportedMinorAmount(PROVIDER_AMOUNT_MAX_MINOR)).toBe(
      true,
    );
    expect(isProviderSupportedMinorAmount(0)).toBe(false);
    expect(isProviderSupportedMinorAmount(100_000_000)).toBe(false);
    expect(isProviderSupportedMinorAmount(1.5)).toBe(false);
  });

  it("sums safely without crossing the provider maximum", () => {
    expect(sumProviderSupportedMinorAmounts([40_000_000, 59_999_999])).toBe(
      99_999_999,
    );
    expect(sumProviderSupportedMinorAmounts([40_000_000, 60_000_000])).toBe(
      null,
    );
    expect(sumProviderSupportedMinorAmounts([Number.MAX_SAFE_INTEGER, 1])).toBe(
      null,
    );
  });
});
