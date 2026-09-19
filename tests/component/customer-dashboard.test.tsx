import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CustomerDashboardView } from "@/components/customer/dashboard-view";
import type { CustomerDashboardDto } from "@/lib/data/types";

const dashboard: CustomerDashboardDto = {
  displayName: "Mara",
  activeRequestCount: 2,
  activeCommissionCount: 1,
  unreadMessageCount: 3,
  outstandingPaymentCount: 1,
  recent: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      href: "/app/requests/00000000-0000-4000-8000-000000000001",
      title: "Orbit Signet",
      description: "DR-ORBIT",
      status: "quoted",
      occurredAt: "2026-09-17T12:00:00.000Z",
    },
  ],
};

describe("CustomerDashboardView", () => {
  it("renders injected private-workspace metrics and links", () => {
    render(<CustomerDashboardView dashboard={dashboard} />);

    expect(
      screen.getByRole("heading", { name: /welcome back, mara/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Unread messages")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /orbit signet/i })).toHaveAttribute(
      "href",
      dashboard.recent[0]?.href,
    );
    expect(screen.getByText("Quoted")).toBeInTheDocument();
  });
});
