import { CheckCheck, ImageIcon } from "lucide-react";

import { MessageText } from "@/components/messaging/message-text";
import { cn, formatDate } from "@/lib/utils";

export interface ConversationMessageDto {
  id: string;
  senderName: string;
  senderRole: "customer" | "admin";
  text: string;
  createdAt: string;
  isOwn: boolean;
  attachmentCount: number;
  deliveryState?: "sent" | "failed";
}

export function ConversationThread({
  messages,
  timeZone = "UTC",
}: {
  messages: ConversationMessageDto[];
  timeZone?: string;
}) {
  if (messages.length === 0) {
    return (
      <div className="grid min-h-80 place-items-center px-6 text-center">
        <div className="max-w-sm">
          <p className="font-display text-3xl">The conversation starts here.</p>
          <p className="text-stone mt-3 leading-7">
            Share the story, references, and details that should shape this
            design.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ol
      className="space-y-5 px-2 py-5 sm:px-6 sm:py-6"
      aria-label="Conversation"
    >
      {messages.map((message) => (
        <li
          key={message.id}
          className={cn(
            "flex",
            message.isOwn ? "justify-end" : "justify-start",
          )}
        >
          <article
            className={cn(
              "max-w-[94%] rounded-3xl px-3.5 py-3 sm:max-w-[78%] sm:px-4 xl:max-w-[72%]",
              message.isOwn
                ? "bg-ink text-porcelain rounded-br-md"
                : "border-ink/10 text-ink rounded-bl-md border bg-white",
              message.deliveryState === "failed" &&
                "border-2 border-red-400 bg-red-50 text-red-950",
            )}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold opacity-70">
              <span>{message.senderName}</span>
              <span aria-hidden="true">/</span>
              <time dateTime={message.createdAt}>
                {formatDate(message.createdAt, timeZone, {
                  dateStyle: undefined,
                  timeStyle: "short",
                })}
              </time>
            </div>
            <div className="mt-2 text-[0.95rem] leading-6">
              <MessageText text={message.text} />
            </div>
            {message.attachmentCount > 0 ? (
              <p className="mt-3 flex items-center gap-2 text-xs font-semibold opacity-75">
                <ImageIcon aria-hidden="true" size={14} />
                {message.attachmentCount} reference{" "}
                {message.attachmentCount === 1 ? "image" : "images"}
              </p>
            ) : null}
            <div className="mt-2 flex justify-end text-xs opacity-60">
              {message.deliveryState === "failed" ? (
                <span role="alert">
                  Message failed - retry from the composer.
                </span>
              ) : message.isOwn ? (
                <CheckCheck aria-label="Sent" size={14} />
              ) : null}
            </div>
          </article>
        </li>
      ))}
    </ol>
  );
}
