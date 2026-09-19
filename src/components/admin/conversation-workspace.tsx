"use client";

import { Archive, Lock, LockOpen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { ActionMessage } from "@/components/forms/action-message";
import { ConversationThread } from "@/components/messaging/conversation-thread";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { AttachmentLink } from "@/features/application/attachment-link";
import { humanizeStatus, statusTone } from "@/features/application/status";
import {
  acceptRealtimeEvent,
  createDebouncedInboxRefresh,
  shouldRefreshAfterSubscription,
} from "@/features/application/inbox-model";
import { getApplicationRealtimeClient } from "@/features/messaging/realtime-client";
import { UploadedMessageComposer } from "@/features/uploads/uploaded-message-composer";
import type { ConversationDetailDto } from "@/lib/data/types";
import { initialActionResult, type ActionResult } from "@/types/actions";

type Action = (
  previousState: ActionResult,
  formData: FormData,
) => Promise<ActionResult>;

export function AdminConversationWorkspace({
  conversation,
  clientMessageId,
  sendAction,
  markReadAction,
  latestReadTarget,
  statusAction,
}: {
  conversation: ConversationDetailDto;
  clientMessageId: string;
  sendAction: (
    formData: FormData,
  ) => Promise<ActionResult<{ messageId: string }>>;
  markReadAction: (formData: FormData) => Promise<ActionResult>;
  latestReadTarget: { id: string; sentAt: string } | null;
  statusAction: Action;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(statusAction, initialActionResult);
  const [readError, setReadError] = useState<string | null>(null);
  const markedRead = useRef<string | null>(null);
  const seenEvents = useRef(new Set<string>());
  const refreshScheduler = useRef<ReturnType<
    typeof createDebouncedInboxRefresh
  > | null>(null);

  const refresh = useCallback(() => {
    refreshScheduler.current ??= createDebouncedInboxRefresh(() => {
      startTransition(() => router.refresh());
    }, 140);
    refreshScheduler.current.schedule();
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
    formData.set("conversationId", conversation.id);
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
  }, [conversation.id, latestReadTarget, markReadAction, refresh]);

  useEffect(() => {
    const initialMark = setTimeout(() => void markVisibleRead(), 0);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void markVisibleRead();
        refresh();
      }
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(initialMark);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [markVisibleRead, refresh]);

  useEffect(() => {
    const client = getApplicationRealtimeClient();
    let previousStatus: string | null = null;
    const channel = client
      .channel(`admin-conversation:${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const event = payload.new as Record<string, unknown>;
          const eventId = typeof event.id === "string" ? event.id : "";
          if (!acceptRealtimeEvent(seenEvents.current, eventId)) {
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
    const onOnline = () => refresh();
    window.addEventListener("online", onOnline);
    return () => {
      refreshScheduler.current?.cancel();
      window.removeEventListener("online", onOnline);
      void client.removeChannel(channel);
    };
  }, [conversation.id, refresh]);

  return (
    <Card className="overflow-hidden">
      <header className="border-ink/10 bg-parchment/45 flex flex-col gap-5 border-b p-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">{conversation.customerName}</p>
          <h1 className="font-display mt-2 text-4xl">{conversation.subject}</h1>
        </div>
        <StatusPill tone={statusTone(conversation.status)}>
          {humanizeStatus(conversation.status)}
        </StatusPill>
      </header>
      {readError ? (
        <p
          className="border-b border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-900"
          role="status"
        >
          {readError}
        </p>
      ) : null}
      {conversation.nextCursor ? (
        <div className="border-ink/10 border-b p-3 text-center">
          <Link
            href={`/admin/inbox/${conversation.id}?cursor=${encodeURIComponent(conversation.nextCursor)}`}
            className="text-garnet text-sm font-semibold hover:underline"
          >
            Load older messages
          </Link>
        </div>
      ) : null}
      <ConversationThread
        messages={conversation.messages.map((message) => ({
          id: message.id,
          senderName: message.senderName,
          senderRole:
            message.senderRole === "system" ? "admin" : message.senderRole,
          text: message.text,
          createdAt: message.sentAt,
          isOwn: message.isOwn,
          attachmentCount: message.attachments.length,
        }))}
      />
      {conversation.messages.some(
        (message) => message.attachments.length > 0,
      ) ? (
        <div className="border-ink/10 border-t bg-white/60 p-5">
          <h2 className="text-sm font-semibold">Authorized attachments</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {conversation.messages.flatMap((message) =>
              message.attachments.map((attachment) => (
                <AttachmentLink key={attachment.id} {...attachment} />
              )),
            )}
          </div>
        </div>
      ) : null}
      {conversation.status === "open" ? (
        <UploadedMessageComposer
          conversationId={conversation.id}
          initialClientMessageId={clientMessageId}
          sendAction={sendAction}
        />
      ) : (
        <p className="border-ink/10 bg-parchment/45 text-stone border-t p-5 text-sm">
          Sending and attachment uploads are disabled while this conversation is{" "}
          {conversation.status}.
        </p>
      )}
      <form action={formAction} className="border-ink/10 border-t bg-white p-5">
        <input type="hidden" name="conversationId" value={conversation.id} />
        <ActionMessage result={state} />
        <div className="mt-3 flex flex-wrap gap-3">
          {conversation.status !== "open" ? (
            <Button type="submit" name="intent" value="open">
              <LockOpen aria-hidden="true" size={16} />
              Reopen
            </Button>
          ) : (
            <>
              <Button
                type="submit"
                name="intent"
                value="archive"
                variant="secondary"
              >
                <Archive aria-hidden="true" size={16} />
                Archive
              </Button>
              <Button
                type="submit"
                name="intent"
                value="close"
                variant="danger"
              >
                <Lock aria-hidden="true" size={16} />
                Close
              </Button>
            </>
          )}
        </div>
      </form>
    </Card>
  );
}
