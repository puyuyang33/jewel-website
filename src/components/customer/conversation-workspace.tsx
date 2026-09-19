import { ArrowLeft, Paperclip } from "lucide-react";
import Link from "next/link";

import { ConversationThread } from "@/components/messaging/conversation-thread";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { AttachmentLink } from "@/features/application/attachment-link";
import { humanizeStatus, statusTone } from "@/features/application/status";
import { ConversationLiveRefresh } from "@/features/messaging/conversation-live-refresh";
import { UploadedMessageComposer } from "@/features/uploads/uploaded-message-composer";
import type { ConversationDetailDto } from "@/lib/data/types";
import type { ActionResult } from "@/types/actions";

export function CustomerConversationWorkspace({
  conversation,
  clientMessageId,
  sendAction,
  markReadAction,
  latestReadTarget,
}: {
  conversation: ConversationDetailDto;
  clientMessageId: string;
  sendAction: (
    formData: FormData,
  ) => Promise<ActionResult<{ messageId: string }>>;
  markReadAction: (formData: FormData) => Promise<ActionResult>;
  latestReadTarget: { id: string; sentAt: string } | null;
}) {
  return (
    <div>
      <ConversationLiveRefresh
        conversationId={conversation.id}
        latestReadTarget={latestReadTarget}
        markReadAction={markReadAction}
        realtimeEnabled={conversation.status === "open"}
      />
      <Link
        href="/app/conversations"
        className="text-stone hover:text-garnet inline-flex items-center gap-2 text-sm font-semibold"
      >
        <ArrowLeft aria-hidden="true" size={16} />
        All conversations
      </Link>
      <Card className="mt-5 overflow-hidden">
        <header className="border-ink/10 bg-parchment/45 flex flex-col gap-4 border-b p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="eyebrow">Private conversation</p>
            <h1 className="font-display mt-2 text-4xl">
              {conversation.subject}
            </h1>
          </div>
          <StatusPill tone={statusTone(conversation.status)}>
            {humanizeStatus(conversation.status)}
          </StatusPill>
        </header>
        {conversation.nextCursor ? (
          <div className="border-ink/10 border-b bg-white p-3 text-center">
            <Link
              href={`/app/conversations/${conversation.id}?cursor=${encodeURIComponent(conversation.nextCursor)}`}
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
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Paperclip aria-hidden="true" size={16} />
              Attachment record
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {conversation.messages.flatMap((message) =>
                message.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <AttachmentLink {...attachment} />
                  </li>
                )),
              )}
            </ul>
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
            This conversation is {conversation.status}; sending is disabled.
          </p>
        )}
      </Card>
    </div>
  );
}
