import { z } from "zod";

import { limits } from "@/config/limits";
import {
  COUNTEROFFER_STATUSES,
  QUOTE_STATUSES,
  type AcceptedQuoteOptionSnapshot,
  type AcceptedQuoteSnapshot,
  type Counteroffer,
  type DomainActor,
  type Quote,
  type QuoteOptionAcceptance,
  type QuoteStatus,
} from "@/types/domain";

import { assertNever, DomainError } from "./errors";
import { isoCurrencySchema, moneySchema, positiveMoneySchema } from "./money";
import {
  entityIdSchema,
  isoInstantSchema,
  normalizeInstant,
  positiveVersionSchema,
  type InstantInput,
} from "./validation";

const shortLabelSchema = z.string().trim().min(1).max(120);
const descriptionSchema = z.string().trim().min(1).max(4_000);

export const quoteStatusSchema = z.enum(QUOTE_STATUSES);
export const counterofferStatusSchema = z.enum(COUNTEROFFER_STATUSES);
export const INITIAL_QUOTE_VERSION = 1;

export const quoteLineItemSchema = z
  .object({
    description: shortLabelSchema,
    amount: moneySchema,
  })
  .strict();

export const quoteOptionSchema = z
  .object({
    id: entityIdSchema,
    title: shortLabelSchema,
    description: descriptionSchema,
    price: positiveMoneySchema,
    includedRevisionRounds: z.number().int().nonnegative().max(100),
    estimatedCompletionDays: z.number().int().positive().max(3_650),
    lineItems: z.array(quoteLineItemSchema).max(50).default([]),
  })
  .strict()
  .superRefine((option, context) => {
    if (option.lineItems.length === 0) {
      return;
    }

    let lineItemTotal = 0;
    for (const [index, lineItem] of option.lineItems.entries()) {
      if (lineItem.amount.currency !== option.price.currency) {
        context.addIssue({
          code: "custom",
          message: "Line item currency must match the option currency",
          path: ["lineItems", index, "amount", "currency"],
        });
      }
      lineItemTotal += lineItem.amount.amountMinor;
    }

    if (!Number.isSafeInteger(lineItemTotal)) {
      context.addIssue({
        code: "custom",
        message: "Line item total exceeds the safe integer range",
        path: ["lineItems"],
      });
    } else if (lineItemTotal !== option.price.amountMinor) {
      context.addIssue({
        code: "custom",
        message: "Line items must total the option price",
        path: ["lineItems"],
      });
    }
  });

export const quoteSchema = z
  .object({
    id: entityIdSchema,
    designRequestId: entityIdSchema,
    version: positiveVersionSchema,
    status: quoteStatusSchema,
    expiresAt: isoInstantSchema.nullable(),
    createdAt: isoInstantSchema,
    terms: z.string().trim().min(1).max(10_000),
    options: z.array(quoteOptionSchema).min(1).max(10),
  })
  .strict()
  .superRefine((quote, context) => {
    const optionIds = new Set<string>();
    let currency: string | undefined;

    for (const [index, option] of quote.options.entries()) {
      if (optionIds.has(option.id)) {
        context.addIssue({
          code: "custom",
          message: "Quote option IDs must be unique",
          path: ["options", index, "id"],
        });
      }
      optionIds.add(option.id);

      currency ??= option.price.currency;
      if (option.price.currency !== currency) {
        context.addIssue({
          code: "custom",
          message: "All quote options must use the same currency",
          path: ["options", index, "price", "currency"],
        });
      }
    }

    if (
      (quote.status === "sent" ||
        quote.status === "viewed" ||
        quote.status === "countered") &&
      quote.expiresAt === null
    ) {
      context.addIssue({
        code: "custom",
        message: "A sent quote must have an expiration",
        path: ["expiresAt"],
      });
    }

    if (
      quote.expiresAt !== null &&
      Date.parse(quote.expiresAt) <= Date.parse(quote.createdAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "Quote expiration must be after quote creation",
        path: ["expiresAt"],
      });
    }
  });

export type QuoteAcceptanceErrorCode =
  | "QUOTE_NOT_SENT"
  | "QUOTE_EXPIRED"
  | "QUOTE_ALREADY_ACCEPTED"
  | "QUOTE_UNAVAILABLE"
  | "OPTION_NOT_FOUND"
  | "MULTIPLE_ACCEPTED_OPTIONS"
  | "ACCEPTANCE_REQUIRES_EXACTLY_ONE_OPTION"
  | "ACCEPTANCE_REQUIRES_EXACTLY_ONE_SELECTION";

export class QuoteAcceptanceError extends DomainError<QuoteAcceptanceErrorCode> {
  constructor(code: QuoteAcceptanceErrorCode, message: string) {
    super(code, message);
    this.name = "QuoteAcceptanceError";
  }
}

export function resolveEffectiveQuoteStatus(
  quote: Pick<Quote, "status" | "expiresAt">,
  now: InstantInput,
): QuoteStatus {
  const status = quoteStatusSchema.parse(quote.status);

  switch (status) {
    case "sent":
    case "viewed":
    case "countered": {
      if (quote.expiresAt === null) {
        return status;
      }
      const expiration = Date.parse(isoInstantSchema.parse(quote.expiresAt));
      return expiration <= Date.parse(normalizeInstant(now))
        ? "expired"
        : status;
    }
    case "draft":
    case "accepted":
    case "declined":
    case "expired":
    case "cancelled":
    case "superseded":
      return status;
    default:
      return assertNever(status, "quote status");
  }
}

export function isQuoteEffectivelyExpired(
  quote: Pick<Quote, "status" | "expiresAt">,
  now: InstantInput,
): boolean {
  return resolveEffectiveQuoteStatus(quote, now) === "expired";
}

export type QuoteTransitionErrorCode =
  | "INVALID_QUOTE_TRANSITION"
  | "QUOTE_TRANSITION_ACTOR_NOT_PERMITTED"
  | "QUOTE_EXPIRED";

export class QuoteTransitionError extends DomainError<QuoteTransitionErrorCode> {
  readonly from: QuoteStatus;
  readonly to: QuoteStatus;
  readonly actor: DomainActor;

  constructor(
    code: QuoteTransitionErrorCode,
    from: QuoteStatus,
    to: QuoteStatus,
    actor: DomainActor,
  ) {
    super(
      code,
      code === "QUOTE_EXPIRED"
        ? "An expired quote cannot transition"
        : code === "INVALID_QUOTE_TRANSITION"
          ? `Quote cannot transition from ${from} to ${to}`
          : `${actor} cannot transition a quote from ${from} to ${to}`,
    );
    this.name = "QuoteTransitionError";
    this.from = from;
    this.to = to;
    this.actor = actor;
  }
}

function actorsForQuoteTransition(
  from: QuoteStatus,
  to: QuoteStatus,
): readonly DomainActor[] | null {
  switch (from) {
    case "draft":
      switch (to) {
        case "sent":
        case "cancelled":
          return ["admin"];
        case "draft":
        case "viewed":
        case "countered":
        case "accepted":
        case "declined":
        case "expired":
        case "superseded":
          return null;
        default:
          return assertNever(to, "quote target status");
      }
    case "sent":
      switch (to) {
        case "viewed":
          return ["system"];
        case "countered":
        case "accepted":
        case "declined":
          return ["customer"];
        case "cancelled":
        case "superseded":
          return ["admin"];
        case "draft":
        case "sent":
        case "expired":
          return null;
        default:
          return assertNever(to, "quote target status");
      }
    case "viewed":
      switch (to) {
        case "countered":
        case "accepted":
        case "declined":
          return ["customer"];
        case "cancelled":
        case "superseded":
          return ["admin"];
        case "draft":
        case "sent":
        case "viewed":
        case "expired":
          return null;
        default:
          return assertNever(to, "quote target status");
      }
    case "countered":
      switch (to) {
        case "accepted":
        case "declined":
          return ["customer"];
        case "cancelled":
        case "superseded":
          return ["admin"];
        case "draft":
        case "sent":
        case "viewed":
        case "countered":
        case "expired":
          return null;
        default:
          return assertNever(to, "quote target status");
      }
    case "accepted":
    case "declined":
    case "expired":
    case "cancelled":
    case "superseded":
      return null;
    default:
      return assertNever(from, "quote source status");
  }
}

export type QuoteTransitionDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: QuoteTransitionErrorCode;
    };

export interface EvaluateQuoteTransitionInput {
  readonly quote: Pick<Quote, "status" | "expiresAt">;
  readonly to: QuoteStatus;
  readonly actor: DomainActor;
  readonly now: InstantInput;
}

export function evaluateQuoteTransition(
  input: EvaluateQuoteTransitionInput,
): QuoteTransitionDecision {
  const storedStatus = quoteStatusSchema.parse(input.quote.status);
  const to = quoteStatusSchema.parse(input.to);
  const actor = z.enum(["customer", "admin", "system"]).parse(input.actor);
  const effectiveStatus = resolveEffectiveQuoteStatus(input.quote, input.now);

  if (effectiveStatus === "expired" && storedStatus !== "expired") {
    return { allowed: false, reason: "QUOTE_EXPIRED" };
  }

  const actors = actorsForQuoteTransition(effectiveStatus, to);
  if (actors === null) {
    return { allowed: false, reason: "INVALID_QUOTE_TRANSITION" };
  }
  return actors.includes(actor)
    ? { allowed: true }
    : { allowed: false, reason: "QUOTE_TRANSITION_ACTOR_NOT_PERMITTED" };
}

export function assertQuoteTransition(
  input: EvaluateQuoteTransitionInput,
): void {
  const decision = evaluateQuoteTransition(input);
  if (!decision.allowed) {
    throw new QuoteTransitionError(
      decision.reason,
      input.quote.status,
      input.to,
      input.actor,
    );
  }
}

export type QuoteAcceptanceIneligibilityReason =
  | "QUOTE_NOT_SENT"
  | "QUOTE_EXPIRED"
  | "QUOTE_ALREADY_ACCEPTED"
  | "QUOTE_UNAVAILABLE"
  | "OPTION_NOT_FOUND"
  | "MULTIPLE_ACCEPTED_OPTIONS";

export type QuoteAcceptanceEligibility =
  | { readonly eligible: true }
  | {
      readonly eligible: false;
      readonly reason: QuoteAcceptanceIneligibilityReason;
    };

export interface QuoteAcceptanceEligibilityInput {
  readonly quote: Pick<Quote, "status" | "expiresAt" | "options">;
  readonly optionId: string;
  readonly acceptedOptionIds?: readonly string[];
  readonly now: InstantInput;
}

export function evaluateQuoteOptionAcceptance(
  input: QuoteAcceptanceEligibilityInput,
): QuoteAcceptanceEligibility {
  const optionId = entityIdSchema.parse(input.optionId);
  const acceptedOptionIds = z
    .array(entityIdSchema)
    .parse(input.acceptedOptionIds ?? []);

  if (acceptedOptionIds.length > 1) {
    return { eligible: false, reason: "MULTIPLE_ACCEPTED_OPTIONS" };
  }
  if (acceptedOptionIds.length === 1) {
    return { eligible: false, reason: "QUOTE_ALREADY_ACCEPTED" };
  }

  const effectiveStatus = resolveEffectiveQuoteStatus(input.quote, input.now);
  switch (effectiveStatus) {
    case "sent":
    case "viewed":
    case "countered":
      break;
    case "draft":
      return { eligible: false, reason: "QUOTE_NOT_SENT" };
    case "expired":
      return { eligible: false, reason: "QUOTE_EXPIRED" };
    case "accepted":
      return { eligible: false, reason: "QUOTE_ALREADY_ACCEPTED" };
    case "declined":
    case "cancelled":
    case "superseded":
      return { eligible: false, reason: "QUOTE_UNAVAILABLE" };
    default:
      return assertNever(effectiveStatus, "effective quote status");
  }

  return input.quote.options.some((option) => option.id === optionId)
    ? { eligible: true }
    : { eligible: false, reason: "OPTION_NOT_FOUND" };
}

export function assertQuoteOptionAcceptanceEligible(
  input: QuoteAcceptanceEligibilityInput,
): void {
  const decision = evaluateQuoteOptionAcceptance(input);
  if (!decision.eligible) {
    throw new QuoteAcceptanceError(
      decision.reason,
      `Quote option cannot be accepted: ${decision.reason}`,
    );
  }
}

export const quoteOptionAcceptanceSchema = z
  .object({
    optionId: entityIdSchema,
    acceptedAt: isoInstantSchema.nullable(),
  })
  .strict();

export function assertExactlyOneAcceptedOption(
  acceptances: readonly QuoteOptionAcceptance[],
): QuoteOptionAcceptance {
  const parsed = z.array(quoteOptionAcceptanceSchema).parse(acceptances);
  const accepted = parsed.filter(
    (acceptance) => acceptance.acceptedAt !== null,
  );

  if (accepted.length !== 1) {
    throw new QuoteAcceptanceError(
      "ACCEPTANCE_REQUIRES_EXACTLY_ONE_OPTION",
      `Expected exactly one accepted option, received ${accepted.length}`,
    );
  }

  const selected = accepted[0];
  if (selected === undefined) {
    throw new QuoteAcceptanceError(
      "ACCEPTANCE_REQUIRES_EXACTLY_ONE_OPTION",
      "Expected exactly one accepted option",
    );
  }
  return selected;
}

export function assertExactlyOneOptionId(optionIds: readonly string[]): string {
  const parsed = z.array(entityIdSchema).parse(optionIds);
  if (parsed.length !== 1) {
    throw new QuoteAcceptanceError(
      "ACCEPTANCE_REQUIRES_EXACTLY_ONE_OPTION",
      `Expected exactly one option ID, received ${parsed.length}`,
    );
  }

  const optionId = parsed[0];
  if (optionId === undefined) {
    throw new QuoteAcceptanceError(
      "ACCEPTANCE_REQUIRES_EXACTLY_ONE_OPTION",
      "Expected exactly one option ID",
    );
  }
  return optionId;
}

export const quoteAcceptanceSelectionInputSchema = z
  .object({
    optionId: entityIdSchema.nullable(),
    counterofferId: entityIdSchema.nullable(),
  })
  .strict()
  .superRefine((selection, context) => {
    const selectionCount =
      Number(selection.optionId !== null) +
      Number(selection.counterofferId !== null);
    if (selectionCount !== 1) {
      context.addIssue({
        code: "custom",
        message: "Exactly one quote option or counteroffer must be selected",
      });
    }
  });

export type QuoteAcceptanceSelection =
  | { readonly kind: "option"; readonly id: string }
  | { readonly kind: "counteroffer"; readonly id: string };

export function assertExactlyOneQuoteSelection(
  value: unknown,
): QuoteAcceptanceSelection {
  const selection = quoteAcceptanceSelectionInputSchema.safeParse(value);
  if (!selection.success) {
    throw new QuoteAcceptanceError(
      "ACCEPTANCE_REQUIRES_EXACTLY_ONE_SELECTION",
      "Exactly one quote option or counteroffer must be selected",
    );
  }

  if (selection.data.optionId !== null) {
    return Object.freeze({ kind: "option", id: selection.data.optionId });
  }
  if (selection.data.counterofferId !== null) {
    return Object.freeze({
      kind: "counteroffer",
      id: selection.data.counterofferId,
    });
  }

  throw new QuoteAcceptanceError(
    "ACCEPTANCE_REQUIRES_EXACTLY_ONE_SELECTION",
    "Exactly one quote option or counteroffer must be selected",
  );
}

export type QuoteVersionErrorCode =
  "QUOTE_VERSION_CONFLICT" | "QUOTE_VERSION_OVERFLOW";

export class QuoteVersionError extends DomainError<QuoteVersionErrorCode> {
  constructor(code: QuoteVersionErrorCode, message: string) {
    super(code, message);
    this.name = "QuoteVersionError";
  }
}

export function nextQuoteVersion(
  currentVersion: number,
  expectedCurrentVersion: number,
): number {
  const current = positiveVersionSchema.parse(currentVersion);
  const expected = positiveVersionSchema.parse(expectedCurrentVersion);

  if (current !== expected) {
    throw new QuoteVersionError(
      "QUOTE_VERSION_CONFLICT",
      `Expected quote version ${expected}, but current version is ${current}`,
    );
  }
  if (current === Number.MAX_SAFE_INTEGER) {
    throw new QuoteVersionError(
      "QUOTE_VERSION_OVERFLOW",
      "Quote version cannot exceed the safe integer range",
    );
  }
  return current + 1;
}

export const counterofferSchema = z
  .object({
    quoteId: entityIdSchema,
    quoteVersion: positiveVersionSchema,
    optionId: entityIdSchema,
    proposedPrice: positiveMoneySchema,
    explanation: z
      .string()
      .trim()
      .min(1)
      .max(limits.counterofferExplanationCharacters),
  })
  .strict();

export type CounterofferValidationErrorCode =
  | QuoteAcceptanceIneligibilityReason
  | "QUOTE_ID_MISMATCH"
  | "QUOTE_VERSION_CONFLICT"
  | "COUNTEROFFER_CURRENCY_MISMATCH";

export class CounterofferValidationError extends DomainError<CounterofferValidationErrorCode> {
  constructor(code: CounterofferValidationErrorCode, message: string) {
    super(code, message);
    this.name = "CounterofferValidationError";
  }
}

export function validateCounterofferForQuote(
  value: unknown,
  quoteValue: Quote,
  now: InstantInput,
): Counteroffer {
  const counteroffer = counterofferSchema.parse(value);
  const quote: Quote = quoteSchema.parse(quoteValue);

  if (counteroffer.quoteId !== quote.id) {
    throw new CounterofferValidationError(
      "QUOTE_ID_MISMATCH",
      "Counteroffer does not belong to this quote",
    );
  }
  if (counteroffer.quoteVersion !== quote.version) {
    throw new CounterofferValidationError(
      "QUOTE_VERSION_CONFLICT",
      `Counteroffer targets quote version ${counteroffer.quoteVersion}, not ${quote.version}`,
    );
  }

  const eligibility = evaluateQuoteOptionAcceptance({
    quote,
    optionId: counteroffer.optionId,
    now,
  });
  if (!eligibility.eligible) {
    throw new CounterofferValidationError(
      eligibility.reason,
      `Counteroffer is not eligible: ${eligibility.reason}`,
    );
  }

  const option = quote.options.find(
    (candidate) => candidate.id === counteroffer.optionId,
  );
  if (option === undefined) {
    throw new CounterofferValidationError(
      "OPTION_NOT_FOUND",
      "Counteroffer option was not found",
    );
  }
  if (counteroffer.proposedPrice.currency !== option.price.currency) {
    throw new CounterofferValidationError(
      "COUNTEROFFER_CURRENCY_MISMATCH",
      "Counteroffer currency must match the selected quote option",
    );
  }

  return Object.freeze(counteroffer);
}

export const acceptedQuoteSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    quoteId: entityIdSchema,
    quoteVersion: positiveVersionSchema,
    designRequestId: entityIdSchema,
    acceptedAt: isoInstantSchema,
    terms: z.string().trim().min(1).max(10_000),
    option: quoteOptionSchema,
  })
  .strict();

export interface BuildAcceptedQuoteSnapshotInput {
  readonly quote: Quote;
  readonly acceptedOptionIds: readonly string[];
  readonly acceptedAt: InstantInput;
}

export function buildAcceptedQuoteSnapshot(
  input: BuildAcceptedQuoteSnapshotInput,
): AcceptedQuoteSnapshot {
  const quote: Quote = quoteSchema.parse(input.quote);
  const optionId = assertExactlyOneOptionId(input.acceptedOptionIds);
  const acceptedAt = normalizeInstant(input.acceptedAt);
  const acceptedAtMilliseconds = Date.parse(acceptedAt);

  if (acceptedAtMilliseconds < Date.parse(quote.createdAt)) {
    throw new QuoteAcceptanceError(
      "QUOTE_UNAVAILABLE",
      "A quote cannot be accepted before it was created",
    );
  }
  if (
    quote.expiresAt !== null &&
    acceptedAtMilliseconds >= Date.parse(quote.expiresAt)
  ) {
    throw new QuoteAcceptanceError(
      "QUOTE_EXPIRED",
      "A quote cannot be accepted at or after its expiration",
    );
  }

  switch (quote.status) {
    case "sent":
    case "viewed":
    case "countered":
    case "accepted":
      break;
    case "draft":
      throw new QuoteAcceptanceError(
        "QUOTE_NOT_SENT",
        "Quote has not been sent",
      );
    case "expired":
      throw new QuoteAcceptanceError("QUOTE_EXPIRED", "Quote has expired");
    case "declined":
    case "cancelled":
    case "superseded":
      throw new QuoteAcceptanceError(
        "QUOTE_UNAVAILABLE",
        "Quote is unavailable",
      );
    default:
      return assertNever(quote.status, "quote status");
  }

  const selected = quote.options.find((option) => option.id === optionId);
  if (selected === undefined) {
    throw new QuoteAcceptanceError(
      "OPTION_NOT_FOUND",
      "Accepted quote option was not found",
    );
  }

  const lineItems = Object.freeze(
    selected.lineItems.map((lineItem) =>
      Object.freeze({
        description: lineItem.description,
        amount: Object.freeze({
          amountMinor: lineItem.amount.amountMinor,
          currency: lineItem.amount.currency,
        }),
      }),
    ),
  );
  const option: AcceptedQuoteOptionSnapshot = Object.freeze({
    id: selected.id,
    title: selected.title,
    description: selected.description,
    price: Object.freeze({
      amountMinor: selected.price.amountMinor,
      currency: selected.price.currency,
    }),
    includedRevisionRounds: selected.includedRevisionRounds,
    estimatedCompletionDays: selected.estimatedCompletionDays,
    lineItems,
  });
  const snapshot: AcceptedQuoteSnapshot = {
    schemaVersion: 1,
    quoteId: quote.id,
    quoteVersion: quote.version,
    designRequestId: quote.designRequestId,
    acceptedAt,
    terms: quote.terms,
    option,
  };

  return Object.freeze(snapshot);
}

export function quoteCurrency(quoteValue: Quote) {
  const quote: Quote = quoteSchema.parse(quoteValue);
  const firstOption = quote.options[0];
  if (firstOption === undefined) {
    throw new DomainError(
      "QUOTE_HAS_NO_OPTIONS",
      "Quote must contain an option",
    );
  }
  return isoCurrencySchema.parse(firstOption.price.currency);
}
