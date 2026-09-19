"use client";

import { ImagePlus, Send } from "lucide-react";
import { useActionState, useId } from "react";

import { ActionMessage } from "@/components/forms/action-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Textarea } from "@/components/ui/field";
import { limits } from "@/config/limits";
import { initialActionResult, type ActionResult } from "@/types/actions";

interface MessageComposerProps {
  action: (
    previousState: ActionResult,
    formData: FormData,
  ) => Promise<ActionResult>;
  conversationId: string;
  clientMessageId: string;
}

export function MessageComposer({
  action,
  conversationId,
  clientMessageId,
}: MessageComposerProps) {
  const [state, formAction] = useActionState(action, initialActionResult);
  const messageId = useId();
  const attachmentId = useId();

  return (
    <form
      action={formAction}
      className="border-ink/10 bg-porcelain border-t p-4"
    >
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="clientMessageId" value={clientMessageId} />
      <ActionMessage result={state} />
      <label className="sr-only" htmlFor={messageId}>
        Message
      </label>
      <Textarea
        className="mt-3 min-h-24 bg-white"
        id={messageId}
        name="text"
        maxLength={limits.messageTextCharacters}
        placeholder="Write a message about the design..."
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label
          htmlFor={attachmentId}
          className="text-stone hover:bg-parchment hover:text-ink focus-within:outline-garnet inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-semibold transition focus-within:outline-2 focus-within:outline-offset-2"
        >
          <ImagePlus aria-hidden="true" size={18} />
          Add references
          <input
            className="sr-only"
            id={attachmentId}
            name="images"
            type="file"
            accept={limits.allowedImageMimeTypes.join(",")}
            multiple
          />
        </label>
        <SubmitButton pendingLabel="Sending...">
          <Send aria-hidden="true" size={17} />
          Send message
        </SubmitButton>
      </div>
    </form>
  );
}
