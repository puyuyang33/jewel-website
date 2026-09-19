import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CompleteAftercareCaseForm } from "@/components/customer/aftercare-form";
import { DeliverableManager } from "@/components/admin/deliverable-manager";
import { PortfolioManager } from "@/components/admin/portfolio-manager";
import { AttachmentLink } from "@/features/application/attachment-link";
import type { ActionResult } from "@/types/actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("follow-up workflow controls", () => {
  it("opens portfolio media only through the controlled endpoint", () => {
    const projectAction = vi.fn(
      async (): Promise<ActionResult<{ projectId: string }>> => ({
        ok: true,
        message: "",
        data: { projectId: "00000000-0000-4000-8000-000000000047" },
      }),
    );
    const mediaAction = vi.fn(async (): Promise<ActionResult> => ({
      ok: true,
      message: "",
    }));
    render(
      <PortfolioManager
        projects={[
          {
            id: "00000000-0000-4000-8000-000000000047",
            slug: "orbit-ring",
            title: "Orbit Ring",
            excerpt: "A study in balance.",
            story: "A private commission.",
            materials: ["Gold"],
            techniques: ["Hand fabrication"],
            status: "published",
            featured: true,
            sortOrder: 1,
            completedOn: "2026-01-01",
            publishedAt: "2026-01-02T00:00:00.000Z",
            media: [
              {
                id: "00000000-0000-4000-8000-000000000048",
                mediaType: "image",
                altText: "Orbit Ring profile",
                sortOrder: 1,
              },
            ],
          },
        ]}
        projectAction={projectAction}
        mediaAction={mediaAction}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Orbit Ring profile" }),
    ).toHaveAttribute(
      "href",
      "/api/portfolio-media/00000000-0000-4000-8000-000000000048/open",
    );
  });

  it("disables unpublished portfolio previews instead of linking to a 404", () => {
    const projectAction = vi.fn(
      async (): Promise<ActionResult<{ projectId: string }>> => ({
        ok: true,
        message: "",
        data: { projectId: "00000000-0000-4000-8000-000000000045" },
      }),
    );
    const mediaAction = vi.fn(async (): Promise<ActionResult> => ({
      ok: true,
      message: "",
    }));
    render(
      <PortfolioManager
        projects={[
          {
            id: "00000000-0000-4000-8000-000000000045",
            slug: "private-study",
            title: "Private Study",
            excerpt: "Not published.",
            story: "Working draft.",
            materials: [],
            techniques: [],
            status: "draft",
            featured: false,
            sortOrder: 2,
            completedOn: null,
            publishedAt: null,
            media: [
              {
                id: "00000000-0000-4000-8000-000000000046",
                mediaType: "image",
                altText: "Private study image",
                sortOrder: 1,
              },
            ],
          },
        ]}
        projectAction={projectAction}
        mediaAction={mediaAction}
      />,
    );
    expect(
      screen.queryByRole("link", { name: "Private study image" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /Preview becomes available after the project is published/i,
      ),
    ).toBeVisible();
  });

  it("collects an external deliverable URL without exposing a private path field", () => {
    const action = vi.fn(async (): Promise<ActionResult> => ({
      ok: true,
      message: "Saved",
    }));
    render(
      <DeliverableManager
        deliverables={[]}
        registrationIdempotencyKey="00000000-0000-4000-8000-000000000049"
        registerAction={action}
      />,
    );
    expect(screen.getByLabelText("External HTTPS link")).toHaveAttribute(
      "name",
      "externalUrl",
    );
    expect(
      screen.queryByLabelText(/private object path/i),
    ).not.toBeInTheDocument();
  });

  it("opens attachments only through the authorized API route", () => {
    render(
      <AttachmentLink
        id="00000000-0000-4000-8000-000000000050"
        fileName="sketch.webp"
        mimeType="image/webp"
        byteSize={1024}
      />,
    );
    expect(screen.getByRole("link", { name: /sketch.webp/i })).toHaveAttribute(
      "href",
      "/api/attachments/00000000-0000-4000-8000-000000000050/open",
    );
  });

  it("requires customer confirmation before completing aftercare", async () => {
    const user = userEvent.setup();
    const action = vi.fn(
      async (
        _state: ActionResult,
        formData: FormData,
      ): Promise<ActionResult> => {
        expect(formData.get("confirmation")).toBe("on");
        expect(formData.get("commissionId")).toBe(
          "00000000-0000-4000-8000-000000000051",
        );
        return { ok: true, message: "Aftercare completed" };
      },
    );
    render(
      <CompleteAftercareCaseForm
        commissionId="00000000-0000-4000-8000-000000000051"
        caseId="00000000-0000-4000-8000-000000000053"
        idempotencyKey="00000000-0000-4000-8000-000000000052"
        action={action}
      />,
    );
    await user.type(
      screen.getByLabelText("Resolution summary"),
      "Sizing adjustment is complete.",
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /I confirm the aftercare work is complete/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /confirm aftercare completion/i,
      }),
    );
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Aftercare completed")).toBeVisible();
  });
});
