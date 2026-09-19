import type {
  ConversationListItemDto,
  RankedInboxPage,
} from "@/lib/data/types";

const DEFAULT_REALTIME_DEDUPE_LIMIT = 500;

export interface RankedInboxRow {
  conversation_id: string;
  design_request_id: string;
  customer_id: string;
  customer_display_name: string;
  subject: string;
  status: "open" | "archived" | "closed";
  latest_message_id: string | null;
  latest_sender_kind: "customer" | "admin" | "system" | null;
  latest_preview: string | null;
  activity_at: string;
  unread_count: number;
  has_more: boolean;
  next_activity_at: string | null;
  next_conversation_id: string | null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RankedInboxCursor {
  activityAt: string;
  conversationId: string;
}

export function encodeRankedInboxCursor(cursor: RankedInboxCursor): string {
  if (
    !UUID_PATTERN.test(cursor.conversationId) ||
    !Number.isFinite(Date.parse(cursor.activityAt))
  ) {
    throw new TypeError("Invalid ranked inbox cursor");
  }
  return `${encodeURIComponent(cursor.activityAt)}~${cursor.conversationId}`;
}

export function decodeRankedInboxCursor(
  value: string | undefined,
): RankedInboxCursor | null {
  if (!value) {
    return null;
  }
  const [activityAt, conversationId, extra] = value.split("~");
  if (!activityAt || !conversationId || extra !== undefined) {
    return null;
  }
  try {
    const decodedActivityAt = decodeURIComponent(activityAt);
    return UUID_PATTERN.test(conversationId) &&
      Number.isFinite(Date.parse(decodedActivityAt))
      ? { activityAt: decodedActivityAt, conversationId }
      : null;
  } catch {
    return null;
  }
}

export function mapRankedInboxRow(
  row: RankedInboxRow,
): ConversationListItemDto {
  return {
    id: row.conversation_id,
    customerId: row.customer_id,
    designRequestId: row.design_request_id,
    customerName: row.customer_display_name,
    subject: row.subject,
    status: row.status,
    updatedAt: row.activity_at,
    activityAt: row.activity_at,
    latestMessageId: row.latest_message_id,
    latestSenderRole: row.latest_sender_kind,
    latestMessage:
      row.latest_preview ??
      (row.latest_message_id ? "Attachment" : "No messages yet"),
    latestMessageAt: row.latest_message_id ? row.activity_at : null,
    unreadCount: row.unread_count,
  };
}

export function mapRankedInboxPage(
  rows: RankedInboxRow[],
  viewerId = "",
): RankedInboxPage {
  const metadata = rows.at(-1);
  const nextCursor =
    metadata?.has_more &&
    metadata.next_activity_at &&
    metadata.next_conversation_id
      ? encodeRankedInboxCursor({
          activityAt: metadata.next_activity_at,
          conversationId: metadata.next_conversation_id,
        })
      : null;
  return {
    viewerId,
    items: rows.map(mapRankedInboxRow),
    hasMore: metadata?.has_more ?? false,
    nextCursor,
  };
}

export function compareInboxActivity(
  left: ConversationListItemDto,
  right: ConversationListItemDto,
): number {
  const leftAt = left.activityAt ?? left.updatedAt;
  const rightAt = right.activityAt ?? right.updatedAt;
  const timeDifference = Date.parse(rightAt) - Date.parse(leftAt);
  if (timeDifference !== 0) {
    return timeDifference;
  }
  return right.id.localeCompare(left.id);
}

export function acceptRealtimeEvent(
  seen: Set<string>,
  eventId: string,
  maximum = DEFAULT_REALTIME_DEDUPE_LIMIT,
): boolean {
  if (!eventId || seen.has(eventId)) {
    return false;
  }
  seen.add(eventId);
  if (seen.size > maximum) {
    const oldest = seen.values().next().value;
    if (oldest) {
      seen.delete(oldest);
    }
  }
  return true;
}

export function relativeInboxTime(
  occurredAt: string,
  nowMilliseconds: number,
): string {
  if (nowMilliseconds <= 0) {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
    }).format(new Date(occurredAt));
  }
  const difference = Math.max(0, nowMilliseconds - Date.parse(occurredAt));
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) {
    return "Now";
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return days < 7
    ? `${days}d`
    : new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
      }).format(new Date(occurredAt));
}

export function createDebouncedInboxRefresh(
  action: () => void,
  delayMilliseconds = 180,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule() {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        action();
      }, delayMilliseconds);
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

export function shouldRefreshAfterSubscription(
  previous: string | null,
  next: string,
): boolean {
  return (
    next === "SUBSCRIBED" && previous !== null && previous !== "SUBSCRIBED"
  );
}

export function createRankedInboxRpcCommand(input: {
  limit: number;
  cursor: RankedInboxCursor | null;
  query: string | null;
  status: "open" | "archived" | "closed" | null;
  unreadOnly: boolean;
}) {
  return {
    name: "admin_list_ranked_inbox" as const,
    args: {
      p_limit: input.limit,
      p_before_activity_at: input.cursor?.activityAt ?? null,
      p_before_conversation_id: input.cursor?.conversationId ?? null,
      p_search: input.query,
      p_status: input.status,
      p_unread_only: input.unreadOnly,
    },
  };
}
