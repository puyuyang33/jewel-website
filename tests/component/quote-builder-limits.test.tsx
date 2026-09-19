import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuoteBuilder } from "@/components/admin/quote-builder";
import type { ActionResult } from "@/types/actions";

describe("QuoteBuilder payment limits", () => {
  it("constrains descriptions and amounts to the database/provider contract", () => {
    const action = vi.fn(
      async (): Promise<ActionResult<{ quoteId: string }>> => ({
        ok: true,
        message: "",
        data: { quoteId: "00000000-0000-4000-8000-000000000501" },
      }),
    );

    render(
      <QuoteBuilder
        requestId="00000000-0000-4000-8000-000000000502"
        action={action}
      />,
    );

    expect(screen.getByLabelText("Option 1 line description")).toHaveAttribute(
      "maxlength",
      "120",
    );
    expect(screen.getByLabelText("Option 1 line amount")).toHaveAttribute(
      "type",
      "number",
    );
    expect(screen.getByLabelText("Option 1 line amount")).toHaveAttribute(
      "min",
      "0.01",
    );
    expect(screen.getByLabelText("Option 1 line amount")).toHaveAttribute(
      "max",
      "999999.99",
    );
    expect(
      screen.getByText(/option total must stay between 0.01 and 999,999.99/i),
    ).toBeVisible();
  });
});
