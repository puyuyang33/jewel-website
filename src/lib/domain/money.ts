import { z } from "zod";

import {
  ISO_CURRENCY_CODES,
  type IsoCurrencyCode,
  type Money,
} from "@/types/domain";

import { DomainError } from "./errors";

export const isoCurrencySchema = z.enum(ISO_CURRENCY_CODES);

export const minorUnitAmountSchema = z
  .number()
  .int()
  .nonnegative()
  .refine(Number.isSafeInteger, "Amount must be a safe integer");

export const moneySchema = z
  .object({
    amountMinor: minorUnitAmountSchema,
    currency: isoCurrencySchema,
  })
  .strict();

export const positiveMoneySchema = moneySchema.refine(
  ({ amountMinor }) => amountMinor > 0,
  {
    message: "Amount must be greater than zero",
    path: ["amountMinor"],
  },
);

export function isIsoCurrencyCode(value: string): value is IsoCurrencyCode {
  return isoCurrencySchema.safeParse(value).success;
}

export function parseMoney(value: unknown): Money {
  return moneySchema.parse(value);
}

export function addMoney(left: Money, right: Money): Money {
  const parsedLeft = moneySchema.parse(left);
  const parsedRight = moneySchema.parse(right);

  if (parsedLeft.currency !== parsedRight.currency) {
    throw new DomainError(
      "CURRENCY_MISMATCH",
      `Cannot add ${parsedLeft.currency} and ${parsedRight.currency}`,
    );
  }

  const amountMinor = parsedLeft.amountMinor + parsedRight.amountMinor;
  if (!Number.isSafeInteger(amountMinor)) {
    throw new DomainError(
      "MONEY_OVERFLOW",
      "Money addition exceeded safe integer range",
    );
  }

  return Object.freeze({
    amountMinor,
    currency: parsedLeft.currency,
  });
}

export function subtractMoney(left: Money, right: Money): Money {
  const parsedLeft = moneySchema.parse(left);
  const parsedRight = moneySchema.parse(right);

  if (parsedLeft.currency !== parsedRight.currency) {
    throw new DomainError(
      "CURRENCY_MISMATCH",
      `Cannot subtract ${parsedRight.currency} from ${parsedLeft.currency}`,
    );
  }

  const amountMinor = parsedLeft.amountMinor - parsedRight.amountMinor;
  if (amountMinor < 0) {
    throw new DomainError(
      "NEGATIVE_MONEY",
      "Money subtraction cannot produce a negative amount",
    );
  }

  return Object.freeze({
    amountMinor,
    currency: parsedLeft.currency,
  });
}
