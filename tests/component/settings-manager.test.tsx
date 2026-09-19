import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsManager } from "@/components/admin/settings-manager";
import type { AdminPublicSiteSettingsDto } from "@/lib/data/types";
import type { ActionResult } from "@/types/actions";

const settings: AdminPublicSiteSettingsDto = {
  exists: true,
  settingsKey: "public",
  brandName: "Veyra Atelier",
  contactEmail: "concierge@veyra.example",
  contactPhone: "+1 555 123 4567",
  intakeOpen: true,
  quoteValidityDays: 14,
  status: "published",
  publishedAt: "2026-09-17T12:00:00.000Z",
  updatedAt: "2026-09-17T12:00:00.000Z",
};

describe("SettingsManager", () => {
  afterEach(cleanup);

  it("renders typed controls and uses an injected action stub", async () => {
    const action = vi.fn(
      async (
        _state: ActionResult,
        formData: FormData,
      ): Promise<ActionResult> => ({
        ok: true,
        message: `Published ${String(formData.get("brandName"))}`,
      }),
    );
    render(<SettingsManager settings={settings} action={action} />);

    expect(screen.getByLabelText("Quote validity days")).toHaveAttribute(
      "type",
      "number",
    );
    expect(
      screen.getByRole("checkbox", { name: /new request intake open/i }),
    ).toBeChecked();
    expect(screen.getByLabelText("Brand name")).toHaveValue("Veyra Atelier");
    expect(screen.getByLabelText("Contact email")).toHaveValue(
      "concierge@veyra.example",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Published and publicly active",
    );

    const saveButton = screen.getByRole("button", {
      name: /publish public settings/i,
    });
    fireEvent.submit(saveButton.closest("form")!);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action.mock.calls[0]?.[1].get("quoteValidityDays")).toBe("14");
    expect(action.mock.calls[0]?.[1].get("intakeOpen")).toBe("on");
    expect(await screen.findByText("Published Veyra Atelier")).toBeVisible();
  });

  it("clearly identifies an unpublished or missing singleton", () => {
    const action = vi.fn(async (): Promise<ActionResult> => ({
      ok: true,
      message: "Published",
    }));
    render(
      <SettingsManager
        settings={{
          ...settings,
          exists: false,
          status: null,
          publishedAt: null,
        }}
        action={action}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Not published");
    expect(screen.getByRole("status")).toHaveTextContent(
      "The public settings RPC returns no row",
    );
  });
});
