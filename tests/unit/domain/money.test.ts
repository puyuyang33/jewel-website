import { describe, expect, it } from "vitest";

import {
  addMoney,
  isIsoCurrencyCode,
  isoCurrencySchema,
  moneySchema,
  parseMoney,
  positiveMoneySchema,
  subtractMoney,
} from "@/lib/domain/money";

describe("money", () => {
  it("accepts assigned uppercase ISO 4217 codes", () => {
    expect(isoCurrencySchema.parse("USD")).toBe("USD");
    expect(isoCurrencySchema.parse("EUR")).toBe("EUR");
    expect(isoCurrencySchema.parse("XCG")).toBe("XCG");
    expect(isIsoCurrencyCode("JPY")).toBe(true);
  });

  it("rejects lowercase, malformed, and unassigned codes", () => {
    expect(isoCurrencySchema.safeParse("usd").success).toBe(false);
    expect(isoCurrencySchema.safeParse("US").success).toBe(false);
    expect(isoCurrencySchema.safeParse("ZZZ").success).toBe(false);
    expect(isIsoCurrencyCode("dollars")).toBe(false);
  });

  it("requires nonnegative safe integer minor units and strict fields", () => {
    expect(parseMoney({ amountMinor: 0, currency: "USD" })).toEqual({
      amountMinor: 0,
      currency: "USD",
    });
    expect(
      moneySchema.safeParse({ amountMinor: -1, currency: "USD" }).success,
    ).toBe(false);
    expect(
      moneySchema.safeParse({ amountMinor: 1.5, currency: "USD" }).success,
    ).toBe(false);
    expect(
      moneySchema.safeParse({
        amountMinor: Number.MAX_SAFE_INTEGER + 1,
        currency: "USD",
      }).success,
    ).toBe(false);
    expect(
      moneySchema.safeParse({
        amountMinor: 100,
        currency: "USD",
        floatingAmount: 1,
      }).success,
    ).toBe(false);
    expect(
      positiveMoneySchema.safeParse({ amountMinor: 0, currency: "USD" })
        .success,
    ).toBe(false);
  });

  it("adds and subtracts same-currency values immutably", () => {
    const sum = addMoney(
      { amountMinor: 125, currency: "USD" },
      { amountMinor: 75, currency: "USD" },
    );
    const difference = subtractMoney(sum, {
      amountMinor: 50,
      currency: "USD",
    });

    expect(sum).toEqual({ amountMinor: 200, currency: "USD" });
    expect(Object.isFrozen(sum)).toBe(true);
    expect(difference).toEqual({ amountMinor: 150, currency: "USD" });
  });

  it("blocks currency mixing, overflow, and negative subtraction", () => {
    expect(() =>
      addMoney(
        { amountMinor: 1, currency: "USD" },
        { amountMinor: 1, currency: "EUR" },
      ),
    ).toThrow(/Cannot add/u);
    expect(() =>
      subtractMoney(
        { amountMinor: 1, currency: "USD" },
        { amountMinor: 1, currency: "EUR" },
      ),
    ).toThrow(/Cannot subtract/u);
    expect(() =>
      addMoney(
        { amountMinor: Number.MAX_SAFE_INTEGER, currency: "USD" },
        { amountMinor: 1, currency: "USD" },
      ),
    ).toThrow(/safe integer/u);
    expect(() =>
      subtractMoney(
        { amountMinor: 1, currency: "USD" },
        { amountMinor: 2, currency: "USD" },
      ),
    ).toThrow(/negative/u);
  });
});
