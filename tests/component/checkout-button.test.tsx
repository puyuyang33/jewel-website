import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CheckoutButton } from "@/components/customer/checkout-button";

describe("CheckoutButton", () => {
  it("posts JSON, exposes pending state, and navigates to the trusted response URL", async () => {
    const user = userEvent.setup();
    let resolveRequest: ((response: Response) => void) | undefined;
    const request = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const navigate = vi.fn();
    render(
      <CheckoutButton
        commissionId="00000000-0000-4000-8000-000000000601"
        request={request as typeof fetch}
        navigate={navigate}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /continue to secure checkout/i }),
    );
    expect(
      screen.getByRole("button", { name: /opening secure checkout/i }),
    ).toBeDisabled();
    expect(request).toHaveBeenCalledWith("/api/stripe/checkout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commissionId: "00000000-0000-4000-8000-000000000601",
      }),
    });
    resolveRequest?.(
      Response.json(
        { url: "https://checkout.stripe.com/c/pay/test" },
        { status: 201 },
      ),
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        "https://checkout.stripe.com/c/pay/test",
      ),
    );
  });

  it("renders a safe retryable error", async () => {
    const user = userEvent.setup();
    const request = vi.fn(async () =>
      Response.json(
        { error: { message: "Checkout is already active." } },
        { status: 409 },
      ),
    );
    render(
      <CheckoutButton
        commissionId="00000000-0000-4000-8000-000000000602"
        request={request as typeof fetch}
        navigate={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /continue to secure checkout/i }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Checkout is already active.",
    );
    expect(
      screen.getByRole("button", { name: /continue to secure checkout/i }),
    ).toBeEnabled();
  });
});
