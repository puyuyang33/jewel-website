"use client";

import { ImageIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { StatusPill } from "@/components/ui/status-pill";
import {
  acceptRealtimeEvent,
  compareInboxActivity,
  createDebouncedInboxRefresh,
  decodeRankedInboxCursor,
  mapRankedInboxPage,
  relativeInboxTime,
  shouldRefreshAfterSubscription,
} from "@/features/application/inbox-model";
import { humanizeStatus, statusTone } from "@/features/application/status";
import { getApplicationRealtimeClient } from "@/features/messaging/realtime-client";
import type {
  ConversationListItemDto,
  RankedInboxPage,
} from "@/lib/data/types";

export function AdminLiveInboxList({
  initialPage,
  adminId,
  query,
  status,
  unreadOnly,
}: {
  initialPage: RankedInboxPage;
  adminId: string;
  query: string | null;
  status: "open" | "archived" | "closed" | null;
  unreadOnly: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialPage.items);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const seenEvents = useRef(new Set<string>());
  const refreshScheduler = useRef<ReturnType<
    typeof createDebouncedInboxRefresh
  > | null>(null);

  const refresh = useCallback(() => {
    refreshScheduler.current ??= createDebouncedInboxRefresh(() => {
      startTransition(() => router.refresh());
    });
    refreshScheduler.current.schedule();
  }, [router]);

  useEffect(() => {
    const initialClock = setTimeout(() => setNow(Date.now()), 0);
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    const client = getApplicationRealtimeClient();
    let previousStatus: string | null = null;
    const channel = client
      .channel("admin-ranked-inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const event = payload.new as Record<string, unknown>;
          const eventId = typeof event.id === "string" ? event.id : "";
          if (!acceptRealtimeEvent(seenEvents.current, eventId)) {
            return;
          }
          refresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        (payload) => {
          const event = payload.new as Record<string, unknown>;
          const id = typeof event.id === "string" ? event.id : "";
          const updatedAt =
            typeof event.updated_at === "string" ? event.updated_at : "unknown";
          if (
            !acceptRealtimeEvent(
              seenEvents.current,
              `conversation:${id}:${updatedAt}`,
            )
          ) {
            return;
          }
          refresh();
        },
      )
      .subscribe((nextStatus) => {
        if (shouldRefreshAfterSubscription(previousStatus, nextStatus)) {
          refresh();
        }
        previousStatus = nextStatus;
      });

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      clearInterval(clock);
      clearTimeout(initialClock);
      refreshScheduler.current?.cancel();
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void client.removeChannel(channel);
    };
  }, [refresh]);

  async function loadMore() {
    const cursor = decodeRankedInboxCursor(nextCursor ?? undefined);
    if (!cursor || loadingMore) {
      return;
    }
    setLoadingMore(true);
    setLoadError(null);
    try {
      const client = getApplicationRealtimeClient();
      const result = await client.rpc("admin_list_ranked_inbox", {
        p_limit: 25,
        p_before_activity_at: cursor.activityAt,
        p_before_conversation_id: cursor.conversationId,
        p_search: query,
        p_status: status,
        p_unread_only: unreadOnly,
      });
      if (result.error) {
        throw result.error;
      }
      const nextPage = mapRankedInboxPage(result.data ?? [], adminId);
      setItems((current) => {
        const byId = new Map(
          [...current, ...nextPage.items].map((item) => [item.id, item]),
        );
        return [...byId.values()].sort(compareInboxActivity);
      });
      setNextCursor(nextPage.nextCursor);
      setHasMore(nextPage.hasMore);
    } catch {
      setLoadError("Older conversations could not be loaded. Retry.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="border-ink/10 overflow-hidden rounded-2xl border bg-white/75">
      <ul
        aria-label="Unified customer inbox"
        className="divide-ink/10 divide-y"
      >
        {items.map((conversation) => (
          <InboxRow
            key={conversation.id}
            conversation={conversation}
            now={now}
          />
        ))}
        {items.length === 0 ? (
          <li className="px-6 py-16 text-center">
            <p className="font-display text-3xl">No conversations found</p>
            <p className="text-stone mx-auto mt-2 max-w-md text-sm leading-6">
              Adjust the search, status, or unread filter. This live list will
              refresh when authorized activity arrives.
            </p>
          </li>
        ) : null}
      </ul>
      {hasMore ? (
        <div className="border-ink/10 border-t p-4 text-center">
          {loadError ? (
            <p className="mb-3 text-sm text-red-700" role="alert">
              {loadError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="border-ink/15 min-h-11 rounded-full border px-5 text-sm font-semibold disabled:opacity-50"
          >
            {loadingMore
              ? "Loading conversations…"
              : "Load older conversations"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function InboxRow({
  conversation,
  now,
}: {
  conversation: ConversationListItemDto;
  now: number;
}) {
  const unread = conversation.unreadCount > 0;
  const senderPrefix =
    conversation.latestSenderRole === "admin"
      ? "You: "
      : conversation.latestSenderRole === "customer"
        ? `${conversation.customerName ?? "Customer"}: `
        : conversation.latestSenderRole === "system"
          ? "Atelier update: "
          : "";
  const attachmentPreview =
    conversation.latestMessage === "Attachment" ||
    /^\d+ attachments$/.test(conversation.latestMessage);
  return (
    <li>
      <Link
        href={`/admin/inbox/${conversation.id}`}
        className={`hover:bg-parchment/45 grid min-h-24 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-4 transition sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-4 sm:px-5 ${
          unread ? "bg-garnet/[0.06]" : ""
        }`}
      >
        <span
          className={`grid size-11 place-items-center rounded-full text-sm font-bold ${
            unread ? "bg-garnet text-white" : "bg-parchment text-stone"
          }`}
          aria-hidden="true"
        >
          {(conversation.customerName ?? "C").slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className={unread ? "text-ink font-bold" : "font-semibold"}>
              {conversation.customerName ?? "Customer"}
            </span>
            {unread ? (
              <span className="bg-garnet rounded-full px-2 py-0.5 text-[0.68rem] font-bold tracking-wider text-white uppercase">
                New <span className="sr-only">messages:</span>{" "}
                {conversation.unreadCount}
              </span>
            ) : null}
            <StatusPill tone={statusTone(conversation.status)}>
              {humanizeStatus(conversation.status)}
            </StatusPill>
          </span>
          <span className="text-ink mt-1 block truncate text-sm font-semibold">
            {conversation.subject}
          </span>
          <span
            className={`mt-1 block truncate text-sm ${
              unread ? "text-ink font-semibold" : "text-stone"
            }`}
          >
            {attachmentPreview ? (
              <>
                {senderPrefix}
                <ImageIcon
                  className="mr-1 inline"
                  aria-hidden="true"
                  size={14}
                />
                {conversation.latestMessage}
              </>
            ) : (
              `${senderPrefix}${conversation.latestMessage}`
            )}
          </span>
        </span>
        <time
          dateTime={conversation.latestMessageAt ?? conversation.updatedAt}
          className={`col-start-2 text-xs sm:col-start-3 sm:row-start-1 sm:self-start ${
            unread ? "text-garnet font-bold" : "text-stone"
          }`}
        >
          {relativeInboxTime(
            conversation.latestMessageAt ?? conversation.updatedAt,
            now,
          )}
        </time>
      </Link>
    </li>
  );
}
