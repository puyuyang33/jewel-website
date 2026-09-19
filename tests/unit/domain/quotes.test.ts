import { describe, expect, it } from "vitest";

import {
  assertExactlyOneAcceptedOption,
  assertExactlyOneOptionId,
  assertExactlyOneQuoteSelection,
  assertQuoteOptionAcceptanceEligible,
  assertQuoteTransition,
  buildAcceptedQuoteSnapshot,
  counterofferSchema,
  evaluateQuoteOptionAcceptance,
  evaluateQuoteTransition,
  isQuoteEffectivelyExpired,
  nextQuoteVersion,
  quoteCurrency,
  quoteSchema,
  resolveEffectiveQuoteStatus,
  validateCounterofferForQuote,
} from "@/lib/domain/quotes";
import { QUOTE_STATUSES, type Quote } from "@/types/domain";

import { ids, makeQuote, quoteOptionAt } from "./fixtures";

describe("quote validation and expiration", () => {
  it("validates a structured quote", () => {
    expect(quoteSchema.parse(makeQuote())).toEqual(makeQuote());
  });

  describe("quote state transitions", () => {
    it("permits the versioned negotiation workflow by the correct actors", () => {
      expect(
        evaluateQuoteTransition({
          quote: { status: "draft", expiresAt: null },
          to: "sent",
          actor: "admin",
          now: "2026-09-10T12:00:00.000Z",
        }),
      ).toEqual({ allowed: true });
      expect(
        evaluateQuoteTransition({
          quote: makeQuote(),
          to: "viewed",
          actor: "system",
          now: "2026-09-10T12:00:00.000Z",
        }),
      ).toEqual({ allowed: true });
      expect(
        evaluateQuoteTransition({
          quote: { ...makeQuote(), status: "viewed" },
          to: "countered",
          actor: "customer",
          now: "2026-09-10T12:00:00.000Z",
        }),
      ).toEqual({ allowed: true });
      expect(
        evaluateQuoteTransition({
          quote: { ...makeQuote(), status: "countered" },
          to: "superseded",
          actor: "admin",
          now: "2026-09-10T12:00:00.000Z",
        }),
      ).toEqual({ allowed: true });
    });

    it("distinguishes invalid, unauthorized, and effectively expired transitions", () => {
      expect(
        evaluateQuoteTransition({
          quote: makeQuote(),
          to: "superseded",
          actor: "customer",
          now: "2026-09-10T12:00:00.000Z",
        }),
      ).toEqual({
        allowed: false,
        reason: "QUOTE_TRANSITION_ACTOR_NOT_PERMITTED",
      });
      expect(
        evaluateQuoteTransition({
          quote: { ...makeQuote(), status: "accepted" },
          to: "declined",
          actor: "customer",
          now: "2026-09-10T12:00:00.000Z",
        }),
      ).toEqual({ allowed: false, reason: "INVALID_QUOTE_TRANSITION" });
      const expiredInput = {
        quote: makeQuote(),
        to: "accepted" as const,
        actor: "customer" as const,
        now: "2026-09-15T12:00:00.000Z",
      };
      expect(evaluateQuoteTransition(expiredInput)).toEqual({
        allowed: false,
        reason: "QUOTE_EXPIRED",
      });
      expect(() => assertQuoteTransition(expiredInput)).toThrow(/expired/u);
    });
  });

  it("requires sent quotes to expire and validates option consistency", () => {
    const noExpiration: Quote = { ...makeQuote(), expiresAt: null };
    expect(quoteSchema.safeParse(noExpiration).success).toBe(false);

    const mismatchedCurrency: Quote = {
      ...makeQuote(),
      options: [
        quoteOptionAt(makeQuote(), 0),
        {
          ...quoteOptionAt(makeQuote(), 1),
          price: { amountMinor: 650_000, currency: "EUR" },
        },
      ],
    };
    expect(quoteSchema.safeParse(mismatchedCurrency).success).toBe(false);

    const incorrectLineItemTotal: Quote = {
      ...makeQuote(),
      options: [
        {
          ...quoteOptionAt(makeQuote(), 0),
          lineItems: [
            {
              description: "Not enough",
              amount: { amountMinor: 1, currency: "USD" },
            },
          ],
        },
      ],
    };
    expect(quoteSchema.safeParse(incorrectLineItemTotal).success).toBe(false);
  });

  it("treats the expiration boundary as expired without rewriting stored state", () => {
    const quote = makeQuote();
    expect(resolveEffectiveQuoteStatus(quote, "2026-09-15T11:59:59.999Z")).toBe(
      "sent",
    );
    expect(resolveEffectiveQuoteStatus(quote, "2026-09-15T12:00:00.000Z")).toBe(
      "expired",
    );
    expect(isQuoteEffectivelyExpired(quote, "2026-09-16T00:00:00.000Z")).toBe(
      true,
    );

    const accepted: Quote = { ...quote, status: "accepted" };
    expect(
      resolveEffectiveQuoteStatus(accepted, "2027-01-01T00:00:00.000Z"),
    ).toBe("accepted");
  });

  it("resolves every persisted terminal status and exposes quote currency", () => {
    for (const status of QUOTE_STATUSES) {
      const quote: Quote = {
        ...makeQuote(),
        status,
        expiresAt: status === "draft" ? null : makeQuote().expiresAt,
      };
      const effective = resolveEffectiveQuoteStatus(
        quote,
        "2026-09-10T12:00:00.000Z",
      );
      expect(QUOTE_STATUSES).toContain(effective);
    }
    expect(quoteCurrency(makeQuote())).toBe("USD");
  });

  it("rejects duplicate options, bad dates, line currencies, and overflow totals", () => {
    const first = quoteOptionAt(makeQuote(), 0);
    const duplicateOptions: Quote = {
      ...makeQuote(),
      options: [first, first],
    };
    expect(quoteSchema.safeParse(duplicateOptions).success).toBe(false);

    const expirationBeforeCreation: Quote = {
      ...makeQuote(),
      expiresAt: "2026-08-01T12:00:00.000Z",
    };
    expect(quoteSchema.safeParse(expirationBeforeCreation).success).toBe(false);

    const wrongLineCurrency: Quote = {
      ...makeQuote(),
      options: [
        {
          ...first,
          price: { amountMinor: 1, currency: "USD" },
          lineItems: [
            {
              description: "Mismatch",
              amount: { amountMinor: 1, currency: "EUR" },
            },
          ],
        },
      ],
    };
    expect(quoteSchema.safeParse(wrongLineCurrency).success).toBe(false);

    const overflowingLines: Quote = {
      ...makeQuote(),
      options: [
        {
          ...first,
          price: { amountMinor: Number.MAX_SAFE_INTEGER, currency: "USD" },
          lineItems: [
            {
              description: "First",
              amount: {
                amountMinor: Number.MAX_SAFE_INTEGER,
                currency: "USD",
              },
            },
            {
              description: "Second",
              amount: { amountMinor: 1, currency: "USD" },
            },
          ],
        },
      ],
    };
    expect(quoteSchema.safeParse(overflowingLines).success).toBe(false);
  });
});

describe("quote option acceptance", () => {
  it("allows exactly one available option on an active quote", () => {
    const decision = evaluateQuoteOptionAcceptance({
      quote: makeQuote(),
      optionId: ids.optionOne,
      now: "2026-09-10T12:00:00.000Z",
    });
    expect(decision).toEqual({ eligible: true });
    expect(() =>
      assertQuoteOptionAcceptanceEligible({
        quote: makeQuote(),
        optionId: ids.optionOne,
        now: "2026-09-10T12:00:00.000Z",
      }),
    ).not.toThrow();

    for (const status of ["viewed", "countered"] as const) {
      const quote: Quote = { ...makeQuote(), status };
      expect(
        evaluateQuoteOptionAcceptance({
          quote,
          optionId: ids.optionOne,
          now: "2026-09-10T12:00:00.000Z",
        }),
      ).toEqual({ eligible: true });
    }
  });

  it.each([
    ["expired", "2026-09-15T12:00:00.000Z", "QUOTE_EXPIRED"],
    ["not sent", "2026-09-10T12:00:00.000Z", "QUOTE_NOT_SENT"],
    ["declined", "2026-09-10T12:00:00.000Z", "QUOTE_UNAVAILABLE"],
  ])("rejects an %s quote", (scenario, now, expectedReason) => {
    const base = makeQuote();
    const quote: Quote =
      scenario === "not sent"
        ? { ...base, status: "draft", expiresAt: null }
        : scenario === "declined"
          ? { ...base, status: "declined" }
          : base;
    expect(
      evaluateQuoteOptionAcceptance({
        quote,
        optionId: ids.optionOne,
        now,
      }),
    ).toEqual({ eligible: false, reason: expectedReason });
  });

  it("rejects missing options and existing or corrupt acceptance sets", () => {
    expect(
      evaluateQuoteOptionAcceptance({
        quote: makeQuote(),
        optionId: ids.messageOne,
        now: "2026-09-10T12:00:00.000Z",
      }),
    ).toEqual({ eligible: false, reason: "OPTION_NOT_FOUND" });
    expect(
      evaluateQuoteOptionAcceptance({
        quote: makeQuote(),
        optionId: ids.optionOne,
        acceptedOptionIds: [ids.optionTwo],
        now: "2026-09-10T12:00:00.000Z",
      }),
    ).toEqual({ eligible: false, reason: "QUOTE_ALREADY_ACCEPTED" });
    expect(
      evaluateQuoteOptionAcceptance({
        quote: makeQuote(),
        optionId: ids.optionOne,
        acceptedOptionIds: [ids.optionOne, ids.optionTwo],
        now: "2026-09-10T12:00:00.000Z",
      }),
    ).toEqual({ eligible: false, reason: "MULTIPLE_ACCEPTED_OPTIONS" });
  });

  it("guards exactly one persisted acceptance", () => {
    const selected = assertExactlyOneAcceptedOption([
      { optionId: ids.optionOne, acceptedAt: "2026-09-10T12:00:00.000Z" },
      { optionId: ids.optionTwo, acceptedAt: null },
    ]);
    expect(selected.optionId).toBe(ids.optionOne);
    expect(assertExactlyOneOptionId([ids.optionTwo])).toBe(ids.optionTwo);

    expect(() => assertExactlyOneAcceptedOption([])).toThrow(/exactly one/u);
    expect(() =>
      assertExactlyOneAcceptedOption([
        { optionId: ids.optionOne, acceptedAt: "2026-09-10T12:00:00.000Z" },
        { optionId: ids.optionTwo, acceptedAt: "2026-09-10T12:00:00.000Z" },
      ]),
    ).toThrow(/received 2/u);
    expect(() => assertExactlyOneOptionId([])).toThrow(/received 0/u);
  });

  it("guards option-versus-counteroffer acceptance atomically", () => {
    expect(
      assertExactlyOneQuoteSelection({
        optionId: ids.optionOne,
        counterofferId: null,
      }),
    ).toEqual({ kind: "option", id: ids.optionOne });
    expect(
      assertExactlyOneQuoteSelection({
        optionId: null,
        counterofferId: ids.optionTwo,
      }),
    ).toEqual({ kind: "counteroffer", id: ids.optionTwo });
    expect(() =>
      assertExactlyOneQuoteSelection({
        optionId: ids.optionOne,
        counterofferId: ids.optionTwo,
      }),
    ).toThrow(/Exactly one/u);
    expect(() =>
      assertExactlyOneQuoteSelection({
        optionId: null,
        counterofferId: null,
      }),
    ).toThrow(/Exactly one/u);
  });
});

describe("quote versioning and counteroffers", () => {
  it("increments only the expected current version", () => {
    expect(nextQuoteVersion(7, 7)).toBe(8);
    expect(() => nextQuoteVersion(7, 6)).toThrow(/current version is 7/u);
    expect(() =>
      nextQuoteVersion(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    ).toThrow(/safe integer/u);
  });

  it("validates a structured counteroffer against its quote", () => {
    const value = {
      quoteId: ids.quote,
      quoteVersion: 3,
      optionId: ids.optionOne,
      proposedPrice: { amountMinor: 475_000, currency: "USD" },
      explanation: "  Prefer a lab-grown center stone.  ",
    };
    expect(
      validateCounterofferForQuote(
        value,
        makeQuote(),
        "2026-09-10T12:00:00.000Z",
      ),
    ).toEqual({
      ...value,
      explanation: "Prefer a lab-grown center stone.",
    });
    expect(Object.isFrozen(counterofferSchema.parse(value))).toBe(false);
  });

  it("rejects free-form, stale, mismatched, and expired counteroffers", () => {
    expect(
      counterofferSchema.safeParse({
        quoteId: ids.quote,
        quoteVersion: 3,
        optionId: ids.optionOne,
        proposedPrice: "$4,750",
        explanation: "Please consider this.",
      }).success,
    ).toBe(false);

    const base = {
      quoteId: ids.quote,
      quoteVersion: 3,
      optionId: ids.optionOne,
      proposedPrice: { amountMinor: 475_000, currency: "USD" },
      explanation: "Please consider this.",
    };
    expect(() =>
      validateCounterofferForQuote(
        { ...base, quoteVersion: 2 },
        makeQuote(),
        "2026-09-10T12:00:00.000Z",
      ),
    ).toThrow(/version 2/u);
    expect(() =>
      validateCounterofferForQuote(
        { ...base, quoteId: ids.request },
        makeQuote(),
        "2026-09-10T12:00:00.000Z",
      ),
    ).toThrow(/does not belong/u);
    expect(() =>
      validateCounterofferForQuote(
        { ...base, proposedPrice: { amountMinor: 1, currency: "EUR" } },
        makeQuote(),
        "2026-09-10T12:00:00.000Z",
      ),
    ).toThrow(/currency/u);
    expect(() =>
      validateCounterofferForQuote(
        base,
        makeQuote(),
        "2026-09-15T12:00:00.000Z",
      ),
    ).toThrow(/QUOTE_EXPIRED/u);
  });
});

describe("accepted quote snapshots", () => {
  it("constructs a detached deeply immutable snapshot", () => {
    const source = makeQuote();
    const snapshot = buildAcceptedQuoteSnapshot({
      quote: source,
      acceptedOptionIds: [ids.optionOne],
      acceptedAt: "2026-09-10T12:00:00Z",
    });

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      quoteId: ids.quote,
      quoteVersion: 3,
      acceptedAt: "2026-09-10T12:00:00.000Z",
      option: {
        id: ids.optionOne,
        price: { amountMinor: 500_000, currency: "USD" },
      },
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.option)).toBe(true);
    expect(Object.isFrozen(snapshot.option.price)).toBe(true);
    expect(Object.isFrozen(snapshot.option.lineItems)).toBe(true);
    expect(Object.isFrozen(snapshot.option.lineItems[0])).toBe(true);
    expect(snapshot.option).not.toBe(source.options[0]);
  });

  it("rejects acceptance before creation, at expiration, or without one option", () => {
    expect(() =>
      buildAcceptedQuoteSnapshot({
        quote: makeQuote(),
        acceptedOptionIds: [ids.optionOne],
        acceptedAt: "2026-08-31T23:59:59.000Z",
      }),
    ).toThrow(/before/u);
    expect(() =>
      buildAcceptedQuoteSnapshot({
        quote: makeQuote(),
        acceptedOptionIds: [ids.optionOne],
        acceptedAt: "2026-09-15T12:00:00.000Z",
      }),
    ).toThrow(/expiration/u);
    expect(() =>
      buildAcceptedQuoteSnapshot({
        quote: makeQuote(),
        acceptedOptionIds: [ids.optionOne, ids.optionTwo],
        acceptedAt: "2026-09-10T12:00:00.000Z",
      }),
    ).toThrow(/exactly one/u);
  });

  it.each(["draft", "expired", "declined", "superseded", "cancelled"] as const)(
    "rejects snapshot construction from %s quotes",
    (status) => {
      const quote: Quote = {
        ...makeQuote(),
        status,
        expiresAt: status === "draft" ? null : makeQuote().expiresAt,
      };
      expect(() =>
        buildAcceptedQuoteSnapshot({
          quote,
          acceptedOptionIds: [ids.optionOne],
          acceptedAt: "2026-09-10T12:00:00.000Z",
        }),
      ).toThrow();
    },
  );
});
