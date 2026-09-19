export const ISO_CURRENCY_CODES = [
  "AED",
  "AFN",
  "ALL",
  "AMD",
  "ANG",
  "AOA",
  "ARS",
  "AUD",
  "AWG",
  "AZN",
  "BAM",
  "BBD",
  "BDT",
  "BGN",
  "BHD",
  "BIF",
  "BMD",
  "BND",
  "BOB",
  "BOV",
  "BRL",
  "BSD",
  "BTN",
  "BWP",
  "BYN",
  "BZD",
  "CAD",
  "CDF",
  "CHE",
  "CHF",
  "CHW",
  "CLF",
  "CLP",
  "CNY",
  "COP",
  "COU",
  "CRC",
  "CUP",
  "CVE",
  "CZK",
  "DJF",
  "DKK",
  "DOP",
  "DZD",
  "EGP",
  "ERN",
  "ETB",
  "EUR",
  "FJD",
  "FKP",
  "GBP",
  "GEL",
  "GHS",
  "GIP",
  "GMD",
  "GNF",
  "GTQ",
  "GYD",
  "HKD",
  "HNL",
  "HTG",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "IQD",
  "IRR",
  "ISK",
  "JMD",
  "JOD",
  "JPY",
  "KES",
  "KGS",
  "KHR",
  "KMF",
  "KPW",
  "KRW",
  "KWD",
  "KYD",
  "KZT",
  "LAK",
  "LBP",
  "LKR",
  "LRD",
  "LSL",
  "LYD",
  "MAD",
  "MDL",
  "MGA",
  "MKD",
  "MMK",
  "MNT",
  "MOP",
  "MRU",
  "MUR",
  "MVR",
  "MWK",
  "MXN",
  "MXV",
  "MYR",
  "MZN",
  "NAD",
  "NGN",
  "NIO",
  "NOK",
  "NPR",
  "NZD",
  "OMR",
  "PAB",
  "PEN",
  "PGK",
  "PHP",
  "PKR",
  "PLN",
  "PYG",
  "QAR",
  "RON",
  "RSD",
  "RUB",
  "RWF",
  "SAR",
  "SBD",
  "SCR",
  "SDG",
  "SEK",
  "SGD",
  "SHP",
  "SLE",
  "SOS",
  "SRD",
  "SSP",
  "STN",
  "SVC",
  "SYP",
  "SZL",
  "THB",
  "TJS",
  "TMT",
  "TND",
  "TOP",
  "TRY",
  "TTD",
  "TWD",
  "TZS",
  "UAH",
  "UGX",
  "USD",
  "USN",
  "UYI",
  "UYU",
  "UYW",
  "UZS",
  "VED",
  "VES",
  "VND",
  "VUV",
  "WST",
  "XAF",
  "XAG",
  "XAU",
  "XBA",
  "XBB",
  "XBC",
  "XBD",
  "XCD",
  "XCG",
  "XDR",
  "XOF",
  "XPD",
  "XPF",
  "XPT",
  "XSU",
  "XTS",
  "XUA",
  "XXX",
  "YER",
  "ZAR",
  "ZMW",
  "ZWG",
] as const;

export type IsoCurrencyCode = (typeof ISO_CURRENCY_CODES)[number];

export interface Money {
  readonly amountMinor: number;
  readonly currency: IsoCurrencyCode;
}

export const DOMAIN_ACTORS = ["customer", "admin", "system"] as const;
export type DomainActor = (typeof DOMAIN_ACTORS)[number];

export const QUOTE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "countered",
  "accepted",
  "declined",
  "cancelled",
  "superseded",
  "expired",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const COUNTEROFFER_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "withdrawn",
  "superseded",
] as const;
export type CounterofferStatus = (typeof COUNTEROFFER_STATUSES)[number];

export interface QuoteLineItem {
  readonly description: string;
  readonly amount: Money;
}

export interface QuoteOption {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly price: Money;
  readonly includedRevisionRounds: number;
  readonly estimatedCompletionDays: number;
  readonly lineItems: readonly QuoteLineItem[];
}

export interface Quote {
  readonly id: string;
  readonly designRequestId: string;
  readonly version: number;
  readonly status: QuoteStatus;
  readonly expiresAt: string | null;
  readonly createdAt: string;
  readonly terms: string;
  readonly options: readonly QuoteOption[];
}

export interface QuoteOptionAcceptance {
  readonly optionId: string;
  readonly acceptedAt: string | null;
}

export interface Counteroffer {
  readonly quoteId: string;
  readonly quoteVersion: number;
  readonly optionId: string;
  readonly proposedPrice: Money;
  readonly explanation: string;
}

export const DESIGN_REQUEST_STATUSES = [
  "draft",
  "open",
  "quoted",
  "negotiating",
  "accepted",
  "declined",
  "closed",
] as const;
export type DesignRequestStatus = (typeof DESIGN_REQUEST_STATUSES)[number];

export const COMMISSION_STATUSES = [
  "awaiting_admin_confirmation",
  "confirmed",
  "in_progress",
  "draft_review",
  "revision_requested",
  "draft_approved",
  "final_payment_due",
  "paid",
  "delivered",
  "aftercare",
  "completed",
  "cancelled",
  "disputed",
] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

export interface AcceptedQuoteOptionSnapshot {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly price: Money;
  readonly includedRevisionRounds: number;
  readonly estimatedCompletionDays: number;
  readonly lineItems: readonly QuoteLineItem[];
}

export interface AcceptedQuoteSnapshot {
  readonly schemaVersion: 1;
  readonly quoteId: string;
  readonly quoteVersion: number;
  readonly designRequestId: string;
  readonly acceptedAt: string;
  readonly terms: string;
  readonly option: AcceptedQuoteOptionSnapshot;
}

export const DRAFT_VERSION_STATUSES = [
  "working",
  "shared",
  "approved",
  "superseded",
] as const;
export type DraftVersionStatus = (typeof DRAFT_VERSION_STATUSES)[number];

export const PAYMENT_KINDS = ["final", "refund"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PAYMENT_STATUSES = [
  "not_started",
  "pending",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
  "partially_refunded",
  "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_EVENTS = [
  "checkout_started",
  "payment_processing",
  "payment_succeeded",
  "payment_failed",
  "payment_cancelled",
  "partial_refund_succeeded",
  "refund_succeeded",
] as const;
export type PaymentEvent = (typeof PAYMENT_EVENTS)[number];

export interface MessageCursor {
  readonly createdAt: string;
  readonly id: string;
}

export interface MessagePosition {
  readonly createdAt: string;
  readonly id: string;
}

export const MESSAGE_SENDER_ROLES = ["customer", "admin", "system"] as const;
export type MessageSenderRole = (typeof MESSAGE_SENDER_ROLES)[number];

export const NOTIFICATION_EVENTS = [
  "design_request_submitted",
  "quote_sent",
  "quote_expiring",
  "counteroffer_received",
  "commission_created",
  "payment_received",
  "draft_ready",
  "revision_requested",
  "draft_approved",
  "deliverable_ready",
  "message_received",
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const NOTIFICATION_STATUSES = [
  "pending",
  "processing",
  "sent",
  "failed",
  "suppressed",
] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];
