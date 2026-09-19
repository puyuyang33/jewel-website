"use client";

import { useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  acceptRealtimeEvent,
  createDebouncedInboxRefresh,
  shouldRefreshAfterSubscription,
} from "@/features/application/inbox-model";
import { getApplicationRealtimeClient } from "@/features/messaging/realtime-client";
import type { ActionResult } from "@/types/actions";

export function ConversationLiveRefresh({
  conversationId,
  latestReadTarget,
  markReadAction,
  realtimeEnabled = true,
}: {
  conversationId: string;
  latestReadTarget: { id: string; sentAt: string } | null;
  markReadAction: (formData: FormData) => Promise<ActionResult>;
  realtimeEnabled?: boolean;
}) {
  const router = useRouter();
  const [readError, setReadError] = useState<string | null>(null);
  const seenEvents = useRef(new Set<string>());
  const markedRead = useRef<string | null>(null);
  const scheduler = useRef<ReturnType<
    typeof createDebouncedInboxRefresh
  > | null>(null);
  const refresh = useCallback(() => {
    scheduler.current ??= createDebouncedInboxRefresh(() => {
      startTransition(() => router.refresh());
    }, 140);
    scheduler.current.schedule();
  }, [router]);

  const markVisibleRead = useCallback(async () => {
    if (
      !latestReadTarget ||
      document.visibilityState !== "visible" ||
      !document.hasFocus()
    ) {
      return;
    }
    const markerKey = `${latestReadTarget.id}:${latestReadTarget.sentAt}`;
    if (markedRead.current === markerKey) {
      return;
    }
    const formData = new FormData();
    formData.set("conversationId", conversationId);
    formData.set("lastMessageId", latestReadTarget.id);
    formData.set("lastReadAt", latestReadTarget.sentAt);
    const result = await markReadAction(formData);
    if (result.ok) {
      markedRead.current = markerKey;
      setReadError(null);
    } else {
      setReadError(result.message);
      refresh();
    }
  }, [conversationId, latestReadTarget, markReadAction, refresh]);

  useEffect(() => {
    const initialMark = setTimeout(() => void markVisibleRead(), 0);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void markVisibleRead();
      }
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(initialMark);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [markVisibleRead]);

  useEffect(() => {
    if (!realtimeEnabled) {
      return () => scheduler.current?.cancel();
    }
    const client = getApplicationRealtimeClient();
    let previousStatus: string | null = null;
    const channel = client
      .channel(`customer-conversation:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const event = payload.new as Record<string, unknown>;
          const id = typeof event.id === "string" ? event.id : "";
          if (acceptRealtimeEvent(seenEvents.current, id)) {
            refresh();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `id=eq.${conversationId}`,
        },
        (payload) => {
          const event = payload.new as Record<string, unknown>;
          const updatedAt =
            typeof event.updated_at === "string" ? event.updated_at : "unknown";
          if (
            acceptRealtimeEvent(
              seenEvents.current,
              `conversation:${conversationId}:${updatedAt}`,
            )
          ) {
            refresh();
          }
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
      scheduler.current?.cancel();
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void client.removeChannel(channel);
    };
  }, [conversationId, realtimeEnabled, refresh]);

  return readError ? (
    <p
      className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
      role="status"
    >
      {readError}
    </p>
  ) : null;
}
