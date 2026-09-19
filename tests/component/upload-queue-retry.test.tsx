import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { UploadProgress } from "@/features/uploads/upload-progress";
import {
  type UploadTransport,
  useImageUploadQueue,
} from "@/features/uploads/use-image-upload-queue";

function Harness({ transport }: { transport: UploadTransport }) {
  const [message, setMessage] = useState("");
  const queue = useImageUploadQueue({
    purpose: "draft",
    maximum: 2,
    transport,
  });
  async function upload() {
    try {
      await queue.uploadAll("00000000-0000-4000-8000-000000000040");
      setMessage("Upload complete");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    }
  }
  return (
    <div>
      <label>
        Images
        <input
          type="file"
          accept="image/png"
          onChange={(event) => queue.selectFiles(event.target.files)}
        />
      </label>
      <UploadProgress
        queue={queue.queue}
        validationError={queue.validationError}
      />
      <button type="button" onClick={() => void upload()}>
        {queue.hasFailures ? "Retry" : "Upload"}
      </button>
      <p>{message}</p>
    </div>
  );
}

describe("image upload retry", () => {
  it("retains a failed file and retries without network dependencies", async () => {
    const user = userEvent.setup();
    const clientIds: string[] = [];
    const transport = vi
      .fn<UploadTransport>()
      .mockImplementationOnce(async (formData, onProgress) => {
        clientIds.push(String(formData.get("clientId")));
        onProgress(42);
        throw new Error("Temporary upload failure");
      })
      .mockImplementationOnce(async (formData, onProgress) => {
        clientIds.push(String(formData.get("clientId")));
        onProgress(80);
        return {
          upload: {
            id: "00000000-0000-4000-8000-000000000041",
            purpose: "draft",
          },
        };
      });
    render(<Harness transport={transport} />);

    await user.upload(
      screen.getByLabelText("Images"),
      new File([new Uint8Array([1, 2, 3])], "draft.png", {
        type: "image/png",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(
      (await screen.findAllByText("Temporary upload failure"))[0],
    ).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "42");
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    expect(clientIds[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(clientIds[1]).toBe(clientIds[0]);
    expect(await screen.findByText("Upload complete")).toBeVisible();
    expect(screen.getByText("complete")).toBeVisible();
  });
});
