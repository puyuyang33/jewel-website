import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UploadedMessageComposer } from "@/features/uploads/uploaded-message-composer";
import type { UploadTransport } from "@/features/uploads/use-image-upload-queue";
import type { ActionResult } from "@/types/actions";

afterEach(cleanup);

describe("UploadedMessageComposer", () => {
  it("sends text with the verified attachment ID set", async () => {
    const user = userEvent.setup();
    const sendAction = vi.fn(
      async (
        formData: FormData,
      ): Promise<ActionResult<{ messageId: string }>> => {
        expect(formData.get("text")).toBe("Please refine the shoulder.");
        expect(formData.get("attachmentIds")).toBe("[]");
        return {
          ok: true,
          message: "Ready",
          data: { messageId: "00000000-0000-4000-8000-000000000020" },
        };
      },
    );
    render(
      <UploadedMessageComposer
        conversationId="00000000-0000-4000-8000-000000000021"
        initialClientMessageId="00000000-0000-4000-8000-000000000022"
        sendAction={sendAction}
      />,
    );
    await user.type(
      screen.getByLabelText("Message"),
      "Please refine the shoulder.",
    );
    fireEvent.submit(
      screen.getByRole("button", { name: /send message/i }).closest("form")!,
    );

    await waitFor(() => expect(sendAction).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Ready")).toBeVisible();
  });

  it("stages an attachment before sending an attachment-only message", async () => {
    const user = userEvent.setup();
    const attachmentId = "00000000-0000-4000-8000-000000000023";
    const conversationId = "00000000-0000-4000-8000-000000000024";
    const transport = vi.fn<UploadTransport>(async (formData, onProgress) => {
      expect(formData.get("purpose")).toBe("message");
      expect(formData.get("targetId")).toBe(conversationId);
      expect(formData.get("clientId")).toEqual(expect.any(String));
      onProgress(100);
      return {
        upload: {
          id: attachmentId,
          purpose: "message",
        },
      };
    });
    const sendAction = vi.fn(
      async (
        formData: FormData,
      ): Promise<ActionResult<{ messageId: string }>> => {
        expect(formData.get("text")).toBe("");
        expect(formData.get("attachmentIds")).toBe(
          JSON.stringify([attachmentId]),
        );
        return {
          ok: true,
          message: "Attachment sent",
          data: { messageId: "00000000-0000-4000-8000-000000000025" },
        };
      },
    );
    render(
      <UploadedMessageComposer
        conversationId={conversationId}
        initialClientMessageId="00000000-0000-4000-8000-000000000026"
        sendAction={sendAction}
        uploadTransport={transport}
      />,
    );
    await user.upload(
      screen.getByLabelText("Add references"),
      new File([new Uint8Array([1, 2])], "reference.png", {
        type: "image/png",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(sendAction).toHaveBeenCalledTimes(1));
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Attachment sent")).toBeVisible();
  });
});
