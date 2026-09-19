import { z } from "zod";

import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_STATUSES,
  type NotificationStatus,
  type PaymentKind,
} from "@/types/domain";

import { normalizeEmail } from "./admin";
import { assertNever, DomainError } from "./errors";
import { paymentKindSchema } from "./payments";
import {
  entityIdSchema,
  nonNegativeCountSchema,
  positiveVersionSchema,
} from "./validation";

const IDEMPOTENCY_KEY_MAX_LENGTH = 255;
const idempotencyNamespaceSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9._-]{0,63}$/u);
const idempotencyComponentSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), {
    message: "Idempotency components must not contain control characters",
  })
  .transform((value) => value.normalize("NFC"));

export const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(IDEMPOTENCY_KEY_MAX_LENGTH)
  .regex(/^[\x21-\x7e]+$/u);

export function createIdempotencyKey(
  namespaceValue: string,
  componentValues: readonly string[],
): string {
  const namespace = idempotencyNamespaceSchema.parse(namespaceValue);
  const components = z
    .array(idempotencyComponentSchema)
    .min(1)
    .parse(componentValues);

  let encodedParts: string[];
  try {
    encodedParts = components.map((component) => {
      const encoded = encodeURIComponent(component);
      return `${encoded.length}:${encoded}`;
    });
  } catch (error: unknown) {
    throw new DomainError(
      "INVALID_IDEMPOTENCY_COMPONENT",
      "Idempotency component contains invalid Unicode",
      { cause: error },
    );
  }

  const key = `${namespace}|${encodedParts.join("|")}`;
  const parsed = idempotencyKeySchema.safeParse(key);
  if (!parsed.success) {
    throw new DomainError(
      "IDEMPOTENCY_KEY_TOO_LONG",
      `Idempotency key must not exceed ${IDEMPOTENCY_KEY_MAX_LENGTH} characters`,
    );
  }
  return parsed.data;
}

export const notificationEventSchema = z.enum(NOTIFICATION_EVENTS);
export const notificationStatusSchema = z.enum(NOTIFICATION_STATUSES);

export const notificationIdempotencyInputSchema = z
  .object({
    event: notificationEventSchema,
    entityId: entityIdSchema,
    eventVersion: nonNegativeCountSchema,
    recipientEmail: z.string(),
  })
  .strict();

export function createNotificationIdempotencyKey(value: unknown): string {
  const input = notificationIdempotencyInputSchema.parse(value);
  return createIdempotencyKey("notification", [
    input.event,
    input.entityId.toLowerCase(),
    String(input.eventVersion),
    normalizeEmail(input.recipientEmail),
  ]);
}

export interface PaymentIdempotencyInput {
  readonly commissionId: string;
  readonly kind: PaymentKind;
  readonly quoteVersion: number;
}

export function createPaymentIdempotencyKey(
  value: PaymentIdempotencyInput,
): string {
  const commissionId = entityIdSchema.parse(value.commissionId);
  const kind = paymentKindSchema.parse(value.kind);
  const quoteVersion = positiveVersionSchema.parse(value.quoteVersion);
  return createIdempotencyKey("payment", [
    commissionId.toLowerCase(),
    kind,
    String(quoteVersion),
  ]);
}

export interface QuoteAcceptanceIdempotencyInput {
  readonly customerId: string;
  readonly designRequestId: string;
  readonly quoteId: string;
  readonly quoteVersion: number;
  readonly optionId: string;
}

export function createQuoteAcceptanceIdempotencyKey(
  value: QuoteAcceptanceIdempotencyInput,
): string {
  const customerId = entityIdSchema.parse(value.customerId);
  const designRequestId = entityIdSchema.parse(value.designRequestId);
  const quoteId = entityIdSchema.parse(value.quoteId);
  const quoteVersion = positiveVersionSchema.parse(value.quoteVersion);
  const optionId = entityIdSchema.parse(value.optionId);

  return createIdempotencyKey("quote-acceptance", [
    customerId.toLowerCase(),
    designRequestId.toLowerCase(),
    quoteId.toLowerCase(),
    String(quoteVersion),
    optionId.toLowerCase(),
  ]);
}

export interface MessageIdempotencyInput {
  readonly conversationId: string;
  readonly senderId: string;
  readonly clientMessageId: string;
}

export function createMessageIdempotencyKey(
  value: MessageIdempotencyInput,
): string {
  const conversationId = entityIdSchema.parse(value.conversationId);
  const senderId = entityIdSchema.parse(value.senderId);
  const clientMessageId = entityIdSchema.parse(value.clientMessageId);

  return createIdempotencyKey("message", [
    conversationId.toLowerCase(),
    senderId.toLowerCase(),
    clientMessageId.toLowerCase(),
  ]);
}

export type NotificationAttemptBlockReason =
  "ALREADY_PROCESSING" | "ALREADY_SENT" | "SUPPRESSED" | "MAX_ATTEMPTS_REACHED";

export type NotificationAttemptDecision =
  | { readonly shouldAttempt: true }
  | {
      readonly shouldAttempt: false;
      readonly reason: NotificationAttemptBlockReason;
    };

export function evaluateNotificationAttempt(
  statusValue: NotificationStatus,
  attemptCountValue: number,
  maximumAttemptsValue: number,
): NotificationAttemptDecision {
  const status = notificationStatusSchema.parse(statusValue);
  const attemptCount = nonNegativeCountSchema.parse(attemptCountValue);
  const maximumAttempts = positiveVersionSchema.parse(maximumAttemptsValue);

  switch (status) {
    case "pending":
      return attemptCount < maximumAttempts
        ? { shouldAttempt: true }
        : { shouldAttempt: false, reason: "MAX_ATTEMPTS_REACHED" };
    case "failed":
      return attemptCount < maximumAttempts
        ? { shouldAttempt: true }
        : { shouldAttempt: false, reason: "MAX_ATTEMPTS_REACHED" };
    case "processing":
      return { shouldAttempt: false, reason: "ALREADY_PROCESSING" };
    case "sent":
      return { shouldAttempt: false, reason: "ALREADY_SENT" };
    case "suppressed":
      return { shouldAttempt: false, reason: "SUPPRESSED" };
    default:
      return assertNever(status, "notification status");
  }
}

export function shouldAttemptNotification(
  status: NotificationStatus,
  attemptCount: number,
  maximumAttempts: number,
): boolean {
  return evaluateNotificationAttempt(status, attemptCount, maximumAttempts)
    .shouldAttempt;
}
