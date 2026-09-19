import "server-only";

import { z } from "zod";

import { normalizeEmail } from "@/lib/domain/admin";
import { notificationEventSchema } from "@/lib/domain/notifications";
import { internalRedirectSchema } from "@/lib/domain/urls";
import {
  entityIdSchema,
  nonNegativeCountSchema,
} from "@/lib/domain/validation";
import { normalizeOrigin } from "@/lib/security/origin";
import type { NotificationEvent } from "@/types/domain";

const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/u;
const AUTHENTICATED_PATH_PREFIXES = [
  "/account",
  "/admin",
  "/commissions",
  "/dashboard",
  "/design-requests",
  "/quotes",
] as const;

const normalizedEmailSchema = z
  .string()
  .transform((value) => normalizeEmail(value))
  .pipe(z.email().max(254));

const recipientNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => !CONTROL_CHARACTERS.test(value), {
    message: "Recipient name must not contain control characters",
  });

const authenticatedPathSchema = internalRedirectSchema.refine((value) => {
  const pathname = new URL(value, "https://internal.invalid").pathname;
  return AUTHENTICATED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}, "Email links must target an authenticated application path");

export const commissionEmailInputSchema = z
  .object({
    event: notificationEventSchema,
    entityId: entityIdSchema,
    eventVersion: nonNegativeCountSchema,
    recipientEmail: normalizedEmailSchema,
    recipientName: recipientNameSchema.optional(),
    authenticatedPath: authenticatedPathSchema,
  })
  .strict();

export interface CommissionEmailInput {
  readonly event: NotificationEvent;
  readonly entityId: string;
  readonly eventVersion: number;
  readonly recipientEmail: string;
  readonly recipientName?: string | undefined;
  readonly authenticatedPath: string;
}
export type ParsedCommissionEmailInput = z.output<
  typeof commissionEmailInputSchema
>;

interface TemplateCopy {
  readonly subject: string;
  readonly summary: string;
}

const TEMPLATE_COPY: Readonly<Record<NotificationEvent, TemplateCopy>> =
  Object.freeze({
    design_request_submitted: {
      subject: "Design request received",
      summary:
        "Your design request has been received and is ready for the next step.",
    },
    quote_sent: {
      subject: "Your quote is ready",
      summary: "A quote is ready for you to review securely in your account.",
    },
    quote_expiring: {
      subject: "Your quote will expire soon",
      summary: "A quote in your account is approaching its expiration date.",
    },
    counteroffer_received: {
      subject: "Counteroffer received",
      summary: "A counteroffer is ready for review in your account.",
    },
    commission_created: {
      subject: "Your commission is confirmed",
      summary: "Your commission has been created and added to your account.",
    },
    payment_received: {
      subject: "Payment received",
      summary: "Your commission payment has been received.",
    },
    draft_ready: {
      subject: "Your design draft is ready",
      summary: "A design draft is ready for you to review in your account.",
    },
    revision_requested: {
      subject: "Revision request received",
      summary: "A revision request has been recorded for your commission.",
    },
    draft_approved: {
      subject: "Design draft approved",
      summary: "The design draft for your commission has been approved.",
    },
    deliverable_ready: {
      subject: "Your commission is ready",
      summary:
        "An update for your completed commission is available securely in your account.",
    },
    message_received: {
      subject: "New commission message",
      summary: "You have a new message about your commission.",
    },
  });

export interface RenderedCommissionEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  readonly deepLink: string;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function validateApplicationOrigin(originValue: string): string {
  const origin = normalizeOrigin(originValue);
  if (!origin) {
    throw new TypeError("A valid application origin is required.");
  }
  return origin;
}

export function renderCommissionEmail(
  inputValue: CommissionEmailInput,
  applicationOriginValue: string,
): RenderedCommissionEmail {
  const input = commissionEmailInputSchema.parse(inputValue);
  const applicationOrigin = validateApplicationOrigin(applicationOriginValue);
  const copy = TEMPLATE_COPY[input.event];
  const deepLink = new URL(
    input.authenticatedPath,
    applicationOrigin,
  ).toString();
  const greeting = input.recipientName
    ? `Hello ${input.recipientName},`
    : "Hello,";
  const escapedGreeting = escapeHtml(greeting);
  const escapedSummary = escapeHtml(copy.summary);
  const escapedDeepLink = escapeHtml(deepLink);

  return Object.freeze({
    subject: copy.subject,
    text: `${greeting}\n\n${copy.summary}\n\nView this update securely in your account:\n${deepLink}\n\nVeyra Atelier`,
    html: `<!doctype html><html lang="en"><body><p>${escapedGreeting}</p><p>${escapedSummary}</p><p><a href="${escapedDeepLink}">View this update securely in your account</a></p><p>Veyra Atelier</p></body></html>`,
    deepLink,
  });
}

export function getCommissionEmailTemplateEvents(): readonly NotificationEvent[] {
  return Object.freeze(
    Object.keys(TEMPLATE_COPY) as readonly NotificationEvent[],
  );
}
