import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AdminQuoteDetail } from "@/components/admin/quote-detail";
import { QuoteComparison } from "@/components/customer/quote-comparison";
import type { QuoteDetailDto } from "@/lib/data/types";
import type { ActionResult } from "@/types/actions";

describe("admin counteroffer detail", () => {
  it("shows trusted derived terms and price differences", () => {
    const action = vi.fn(async (): Promise<ActionResult> => ({
      ok: true,
      message: "",
    }));
    const quote: QuoteDetailDto = {
      id: "00000000-0000-4000-8000-000000000401",
      designRequestId: "00000000-0000-4000-8000-000000000402",
      version: 2,
      status: "countered",
      title: "Orbit Ring",
      introduction: null,
      terms: "Atelier terms",
      currency: "USD",
      productionWeeks: 12,
      validUntil: "2026-10-01T00:00:00.000Z",
      sentAt: "2026-09-17T00:00:00.000Z",
      createdAt: "2026-09-16T00:00:00.000Z",
      isLatest: true,
      options: [
        {
          id: "00000000-0000-4000-8000-000000000403",
          title: "Platinum study",
          description: "Hand fabricated",
          scope: "Complete ring",
          materials: "Platinum",
          stoneAssumptions: "One sapphire",
          deliverables: "Ring and certificate",
          includedRevisionRounds: 2,
          estimatedCompletionDays: 84,
          currency: "USD",
          totalMinor: 800_000,
          depositMinor: 200_000,
          lineItems: [],
        },
      ],
      counteroffers: [
        {
          id: "00000000-0000-4000-8000-000000000404",
          optionId: "00000000-0000-4000-8000-000000000403",
          optionTitle: "Platinum study",
          version: 1,
          status: "accepted",
          proposedTotalMinor: 750_000,
          proposedDepositMinor: 187_500,
          originalTotalMinor: 800_000,
          originalDepositMinor: 200_000,
          totalDifferenceMinor: -50_000,
          depositDifferenceMinor: -12_500,
          proposedScope: { metal: "platinum", stone: "sapphire" },
          currency: "USD",
          note: "Keep the stone, simplify the gallery.",
          submittedAt: "2026-09-17T12:00:00.000Z",
          decision: {
            decision: "accepted",
            note: "Accepted with server-derived terms.",
            decidedAt: "2026-09-17T13:00:00.000Z",
          },
        },
      ],
    };

    render(
      <AdminQuoteDetail
        quote={quote}
        sendAction={action}
        sendIdempotencyKey="00000000-0000-4000-8000-000000000405"
        quoteValidityDays={14}
        decisionIdempotencyKeys={{
          "00000000-0000-4000-8000-000000000404":
            "00000000-0000-4000-8000-000000000409",
        }}
        decisionAction={action}
      />,
    );

    expect(screen.getByText("Original total")).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: /Historical deposit requires correction/i,
      }),
    ).toBeVisible();
    expect(screen.getAllByText("$8,000.00")).toHaveLength(2);
    expect(screen.getByText("-$500.00")).toBeVisible();
    expect(screen.getByText("Derived deposit")).toBeVisible();
    expect(screen.getByText("-$125.00")).toBeVisible();
    expect(screen.getByText(/"metal": "platinum"/)).toBeVisible();
    expect(
      screen.getByText("Accepted with server-derived terms."),
    ).toBeVisible();
  });

  it("accepts trusted negotiated terms with an empty original option selection", () => {
    const action = vi.fn(async (): Promise<ActionResult> => ({
      ok: true,
      message: "",
    }));
    const acceptAction = vi.fn(
      async (): Promise<ActionResult<{ commissionId: string }>> => ({
        ok: true,
        message: "",
        data: { commissionId: "00000000-0000-4000-8000-000000000406" },
      }),
    );
    const quote: QuoteDetailDto = {
      id: "00000000-0000-4000-8000-000000000411",
      designRequestId: "00000000-0000-4000-8000-000000000412",
      version: 1,
      status: "countered",
      title: "Negotiated ring",
      introduction: null,
      terms: "Final terms",
      currency: "USD",
      productionWeeks: 10,
      validUntil: "2099-10-01T00:00:00.000Z",
      sentAt: "2026-09-17T00:00:00.000Z",
      createdAt: "2026-09-16T00:00:00.000Z",
      isLatest: true,
      options: [
        {
          id: "00000000-0000-4000-8000-000000000413",
          title: "Original option",
          description: "Original scope",
          scope: "Ring",
          materials: "Gold",
          stoneAssumptions: "Sapphire",
          deliverables: "Ring",
          includedRevisionRounds: 1,
          estimatedCompletionDays: 70,
          currency: "USD",
          totalMinor: 500_000,
          depositMinor: 0,
          lineItems: [],
        },
      ],
      counteroffers: [
        {
          id: "00000000-0000-4000-8000-000000000414",
          optionId: "00000000-0000-4000-8000-000000000413",
          optionTitle: "Original option",
          version: 1,
          status: "accepted",
          proposedTotalMinor: 475_000,
          proposedDepositMinor: 0,
          originalTotalMinor: 500_000,
          originalDepositMinor: 0,
          totalDifferenceMinor: -25_000,
          depositDifferenceMinor: 0,
          proposedScope: { scope: "Ring" },
          currency: "USD",
          note: "Accepted proposal",
          submittedAt: "2026-09-17T12:00:00.000Z",
        },
      ],
    };
    render(
      <QuoteComparison
        quote={quote}
        idempotencyKeys={{
          "00000000-0000-4000-8000-000000000413":
            "00000000-0000-4000-8000-000000000415",
        }}
        counterofferIdempotencyKeys={{
          "00000000-0000-4000-8000-000000000413":
            "00000000-0000-4000-8000-000000000416",
        }}
        counterofferAcceptanceKeys={{
          "00000000-0000-4000-8000-000000000414":
            "00000000-0000-4000-8000-000000000417",
        }}
        acceptAction={acceptAction}
        counterofferAction={action}
        declineAction={action}
        declineIdempotencyKey="00000000-0000-4000-8000-000000000418"
      />,
    );
    const acceptButton = screen.getByRole("button", {
      name: /accept this negotiated offer/i,
    });
    const form = acceptButton.closest("form");
    expect(
      form?.querySelector<HTMLInputElement>('input[name="optionId"]'),
    ).toHaveValue("");
    expect(
      form?.querySelector<HTMLInputElement>('input[name="counterofferId"]'),
    ).toHaveValue("00000000-0000-4000-8000-000000000414");
    expect(
      screen.queryByRole("button", { name: /accept this option/i }),
    ).not.toBeInTheDocument();
  });

  it("constrains customer counteroffers to the supported payment range", () => {
    const action = vi.fn(async (): Promise<ActionResult> => ({
      ok: true,
      message: "",
    }));
    const acceptAction = vi.fn(
      async (): Promise<ActionResult<{ commissionId: string }>> => ({
        ok: true,
        message: "",
        data: { commissionId: "00000000-0000-4000-8000-000000000421" },
      }),
    );
    const quote: QuoteDetailDto = {
      id: "00000000-0000-4000-8000-000000000422",
      designRequestId: "00000000-0000-4000-8000-000000000423",
      version: 1,
      status: "sent",
      title: "Range-checked ring",
      introduction: null,
      terms: "Final terms",
      currency: "USD",
      productionWeeks: 10,
      validUntil: "2099-10-01T00:00:00.000Z",
      sentAt: "2026-09-17T00:00:00.000Z",
      createdAt: "2026-09-16T00:00:00.000Z",
      isLatest: true,
      options: [
        {
          id: "00000000-0000-4000-8000-000000000424",
          title: "Original option",
          description: "Original scope",
          scope: "Ring",
          materials: "Gold",
          stoneAssumptions: "Sapphire",
          deliverables: "Ring",
          includedRevisionRounds: 1,
          estimatedCompletionDays: 70,
          currency: "USD",
          totalMinor: 500_000,
          depositMinor: 0,
          lineItems: [],
        },
      ],
      counteroffers: [],
    };

    render(
      <QuoteComparison
        quote={quote}
        idempotencyKeys={{
          "00000000-0000-4000-8000-000000000424":
            "00000000-0000-4000-8000-000000000425",
        }}
        counterofferIdempotencyKeys={{
          "00000000-0000-4000-8000-000000000424":
            "00000000-0000-4000-8000-000000000426",
        }}
        counterofferAcceptanceKeys={{}}
        acceptAction={acceptAction}
        counterofferAction={action}
        declineAction={action}
        declineIdempotencyKey="00000000-0000-4000-8000-000000000427"
      />,
    );

    fireEvent.click(screen.getByText("Propose a counteroffer"));
    expect(screen.getByLabelText("Proposed amount (USD)")).toHaveAttribute(
      "min",
      "0.01",
    );
    expect(screen.getByLabelText("Proposed amount (USD)")).toHaveAttribute(
      "max",
      "999999.99",
    );
    expect(
      screen.getByText(/Enter an amount from 0.01 through 999,999.99/i),
    ).toBeVisible();
  });
});
