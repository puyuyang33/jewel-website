import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DesignRequestForm } from "@/components/customer/design-request-form";
import type { ActionResult } from "@/types/actions";

describe("DesignRequestForm", () => {
  it("submits FormData through the injected action and exposes the saved record", async () => {
    const user = userEvent.setup();
    const saveDraftAction = vi.fn(
      async (formData: FormData): Promise<ActionResult<{ id: string }>> => {
        expect(formData.get("title")).toBe("North Star Ring");
        expect(formData.get("requestType")).toBe("ring");
        return {
          ok: true,
          message: "Draft saved",
          data: { id: "00000000-0000-4000-8000-000000000010" },
        };
      },
    );
    const submitAction = vi.fn(
      async (formData: FormData): Promise<ActionResult<{ id: string }>> => {
        expect(formData.get("requestId")).toBe(
          "00000000-0000-4000-8000-000000000010",
        );
        expect(formData.get("attachmentIds")).toBe("[]");
        return {
          ok: true,
          message: "Submitted",
          data: { id: "00000000-0000-4000-8000-000000000010" },
        };
      },
    );

    render(
      <DesignRequestForm
        saveDraftAction={saveDraftAction}
        submitAction={submitAction}
      />,
    );
    await user.type(screen.getByLabelText("Working title"), "North Star Ring");
    await user.type(
      screen.getByLabelText("Story and direction"),
      "A private heirloom with a constellation-inspired engraving.",
    );
    fireEvent.submit(
      screen
        .getByRole("button", { name: /submit private request/i })
        .closest("form")!,
    );

    await waitFor(() => expect(saveDraftAction).toHaveBeenCalledTimes(1));
    expect(submitAction).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("link", { name: /open your request/i }),
    ).toHaveAttribute(
      "href",
      "/app/requests/00000000-0000-4000-8000-000000000010",
    );
  });
});
