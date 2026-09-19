"use client";

import { ImagePlus, Send } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";

import { ActionMessage } from "@/components/forms/action-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { limits } from "@/config/limits";
import { initialActionResult, type ActionResult } from "@/types/actions";

import { UploadProgress } from "./upload-progress";
import {
  type UploadTransport,
  useImageUploadQueue,
} from "./use-image-upload-queue";

type SendAction = (
  formData: FormData,
) => Promise<ActionResult<{ messageId: string }>>;

export function UploadedMessageComposer({
  conversationId,
  initialClientMessageId,
  sendAction,
  uploadTransport,
}: {
  conversationId: string;
  initialClientMessageId: string;
  sendAction: SendAction;
  uploadTransport?: UploadTransport;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [clientMessageId, setClientMessageId] = useState(
    initialClientMessageId,
  );
  const [lockedBody, setLockedBody] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ActionResult>(initialActionResult);
  const uploads = useImageUploadQueue({
    purpose: "message",
    maximum: 4,
    ...(uploadTransport ? { transport: uploadTransport } : {}),
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || uploads.validationError) {
      if (uploads.validationError) {
        setState({
          ok: false,
          code: "VALIDATION_ERROR",
          message: uploads.validationError,
        });
      }
      return;
    }
    const form = event.currentTarget;
    const enteredBody = String(new FormData(form).get("text") ?? "").trim();
    if (!enteredBody && uploads.queue.length === 0) {
      setState({
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Write a message or attach at least one image.",
      });
      return;
    }
    setPending(true);
    try {
      const body = lockedBody ?? enteredBody;
      setLockedBody(body);
      setState({ ok: true, message: "Verifying reference images…" });
      const attachmentIds = await uploads.uploadAll(conversationId);
      const messageData = new FormData();
      messageData.set("conversationId", conversationId);
      messageData.set("clientMessageId", clientMessageId);
      messageData.set("text", body);
      messageData.set("attachmentIds", JSON.stringify(attachmentIds));
      const sendResult = await sendAction(messageData);
      if (sendResult.ok && !sendResult.data) {
        setState({
          ok: false,
          code: "MESSAGE_RESULT_INVALID",
          message: "The message result was incomplete. Retry safely.",
        });
        return;
      }
      setState(
        sendResult.ok ? { ok: true, message: sendResult.message } : sendResult,
      );
      if (sendResult.ok) {
        setLockedBody(null);
        setClientMessageId(crypto.randomUUID());
        uploads.reset();
        formRef.current?.reset();
      }
    } catch (error) {
      setState({
        ok: false,
        code: "UPLOAD_FAILED",
        message:
          error instanceof Error
            ? `${error.message} Retry to send with the same verified inputs.`
            : "The message failed. Retry with the same verified inputs.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="border-ink/10 bg-porcelain border-t p-3 sm:p-4"
    >
      <ActionMessage result={state} />
      <label className="sr-only" htmlFor={`message-${conversationId}`}>
        Message
      </label>
      <Textarea
        className="mt-3 min-h-24 bg-white"
        id={`message-${conversationId}`}
        name="text"
        maxLength={limits.messageTextCharacters}
        placeholder="Write a message about the design…"
        disabled={lockedBody !== null}
      />
      <p className="text-stone mt-2 text-xs">
        A message may contain text, up to four verified images, or both.
      </p>
      <div className="mt-3">
        <UploadProgress
          queue={uploads.queue}
          validationError={uploads.validationError}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="text-stone hover:bg-parchment hover:text-ink inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition sm:w-auto sm:justify-start">
          <ImagePlus aria-hidden="true" size={18} />
          Add references
          <input
            className="sr-only"
            type="file"
            accept={limits.allowedImageMimeTypes.join(",")}
            multiple
            disabled={uploads.completedCount > 0}
            onChange={(event) => uploads.selectFiles(event.target.files)}
          />
        </label>
        <Button
          className="w-full sm:w-auto"
          type="submit"
          disabled={pending || Boolean(uploads.validationError)}
        >
          <Send aria-hidden="true" size={17} />
          {pending
            ? `Uploading ${uploads.completedCount} of ${uploads.queue.length}…`
            : uploads.hasFailures || lockedBody !== null
              ? "Retry message"
              : "Send message"}
        </Button>
      </div>
    </form>
  );
}
