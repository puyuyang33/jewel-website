import type { Database } from "@/types/database.generated";
import type { CustomerHistoryPage, HistoryEntryDto } from "@/lib/data/types";

type HistoryRow =
  Database["public"]["Functions"]["customer_list_history"]["Returns"][number];

export interface CustomerHistoryCursor {
  occurredAt: string;
  id: string;
  type: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function encodeCustomerHistoryCursor(
  cursor: CustomerHistoryCursor,
): string {
  if (
    !UUID_PATTERN.test(cursor.id) ||
    !Number.isFinite(Date.parse(cursor.occurredAt)) ||
    !cursor.type ||
    cursor.type.length > 100
  ) {
    throw new TypeError("Invalid customer history cursor");
  }
  return [
    encodeURIComponent(cursor.occurredAt),
    cursor.id,
    encodeURIComponent(cursor.type),
  ].join("~");
}

export function decodeCustomerHistoryCursor(
  value: string | undefined,
): CustomerHistoryCursor | null {
  if (!value) {
    return null;
  }
  const [occurredAt, id, type, extra] = value.split("~");
  if (!occurredAt || !id || !type || extra !== undefined) {
    return null;
  }
  try {
    const decodedAt = decodeURIComponent(occurredAt);
    const decodedType = decodeURIComponent(type);
    return UUID_PATTERN.test(id) &&
      Number.isFinite(Date.parse(decodedAt)) &&
      decodedType.length <= 100
      ? { occurredAt: decodedAt, id, type: decodedType }
      : null;
  } catch {
    return null;
  }
}

function historyHref(resourceType: string, resourceId: string): string | null {
  switch (resourceType) {
    case "design_request":
      return `/app/requests/${resourceId}`;
    case "quote":
      return `/app/quotes/${resourceId}`;
    case "commission":
      return `/app/commissions/${resourceId}`;
    case "payment":
      return "/app/payments";
    case "deliverable":
      return "/app/deliverables";
    default:
      return null;
  }
}

function historyTone(
  eventType: string,
  title: string,
): HistoryEntryDto["tone"] {
  const value = `${eventType} ${title}`.toLowerCase();
  if (
    value.includes("cancel") ||
    value.includes("declined") ||
    value.includes("disputed") ||
    value.includes("failed")
  ) {
    return "critical";
  }
  if (
    value.includes("accepted") ||
    value.includes("approved") ||
    value.includes("completed") ||
    value.includes("succeeded") ||
    value.includes("released")
  ) {
    return "positive";
  }
  return value.includes("revision") || value.includes("due")
    ? "attention"
    : "neutral";
}

export function mapCustomerHistoryPage(
  rows: HistoryRow[],
): CustomerHistoryPage {
  const metadata = rows.at(-1);
  const nextCursor =
    metadata?.has_more &&
    metadata.next_occurred_at &&
    metadata.next_id &&
    metadata.next_type
      ? encodeCustomerHistoryCursor({
          occurredAt: metadata.next_occurred_at,
          id: metadata.next_id,
          type: metadata.next_type,
        })
      : null;
  return {
    items: rows.map((row) => ({
      id: `${row.event_type}:${row.event_id}`,
      eventType: row.event_type,
      title: row.title,
      description: row.description,
      resourceHref: historyHref(row.resource_type, row.resource_id),
      occurredAt: row.occurred_at,
      tone: historyTone(row.event_type, row.title),
    })),
    hasMore: metadata?.has_more ?? false,
    nextCursor,
  };
}

const HISTORY_TYPES: Record<string, string[]> = {
  requests: ["design_request_created"],
  quotes: [
    "quote_sent",
    "quote_viewed",
    "quote_countered",
    "quote_declined",
    "quote_cancelled",
    "quote_accepted",
  ],
  commissions: ["commission_created", "commission_status"],
  payments: ["payment_status"],
  deliverables: ["deliverable_released"],
  aftercare: ["aftercare_opened", "aftercare_completed"],
  notifications: [
    "notification_design_request_submitted",
    "notification_quote_sent",
    "notification_quote_expiring",
    "notification_counteroffer_received",
    "notification_commission_created",
    "notification_payment_received",
    "notification_draft_ready",
    "notification_revision_requested",
    "notification_draft_approved",
    "notification_deliverable_ready",
    "notification_message_received",
  ],
};

export function historyTypesForFilter(filter: string | undefined) {
  return filter ? (HISTORY_TYPES[filter] ?? null) : null;
}

export function createCustomerHistoryRpcCommand(input: {
  limit: number;
  cursor: CustomerHistoryCursor | null;
  query: string | null;
  types: string[] | null;
}) {
  return {
    name: "customer_list_history" as const,
    args: {
      p_limit: input.limit,
      p_before_occurred_at: input.cursor?.occurredAt ?? null,
      p_before_id: input.cursor?.id ?? null,
      p_before_type: input.cursor?.type ?? null,
      p_search: input.query,
      p_types: input.types,
    },
  };
}
