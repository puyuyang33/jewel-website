import { cleanup, render, screen, within } from "@testing-library/react";
import { LayoutDashboard, PenLine } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplicationShell } from "@/components/application/application-shell";
import { WorkspaceMobileNav } from "@/features/application/workspace-mobile-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/requests/00000000-0000-4000-8000-000000000001",
}));

afterEach(cleanup);

const navigation = [
  {
    href: "/app",
    label: "Overview",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/app/requests",
    label: "Design requests",
    icon: PenLine,
  },
];

describe("responsive workspace navigation", () => {
  it("keeps one active destination in both desktop and compact navigation", () => {
    render(
      <ApplicationShell
        navigation={navigation}
        workspaceLabel="Private room"
        user={{ displayName: "Mara", email: "mara@example.com" }}
      >
        <WorkspaceMobileNav items={navigation} />
        <h1>Request detail</h1>
      </ApplicationShell>,
    );

    const navigationRegions = screen.getAllByRole("navigation");
    const desktopNavigation = navigationRegions.find(
      (navigationRegion) =>
        navigationRegion.getAttribute("aria-label") === "Workspace navigation",
    );
    const compactNavigation = navigationRegions.find(
      (navigationRegion) =>
        navigationRegion.getAttribute("aria-label") === "Workspace sections",
    );

    expect(desktopNavigation).toBeDefined();
    expect(compactNavigation).toBeDefined();
    expect(
      within(desktopNavigation!).getByRole("link", {
        name: "Design requests",
      }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(compactNavigation!).getByRole("link", {
        name: "Design requests",
      }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(compactNavigation!).getByRole("link", { name: "Overview" }),
    ).not.toHaveAttribute("aria-current");
    expect(compactNavigation).toHaveClass("horizontal-scroll");
  });
});
