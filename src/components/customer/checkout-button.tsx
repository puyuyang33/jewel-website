"use client";

import { CreditCard, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

interface CheckoutResponse {
  url?: unknown;
  error?: { message?: unknown };
}

export function CheckoutButton({
  commissionId,
  request = fetch,
  navigate = (url) => window.location.assign(url),
}: {
  commissionId: string;
  request?: typeof fetch;
  navigate?: (url: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function beginCheckout() {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await request("/api/stripe/checkout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionId }),
      });
      const payload = (await response.json()) as CheckoutResponse;
      if (!response.ok || typeof payload.url !== "string") {
        throw new Error(
          typeof payload.error?.message === "string"
            ? payload.error.message
            : "Secure checkout could not be opened.",
        );
      }
      navigate(payload.url);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Secure checkout could not be opened.",
      );
      setPending(false);
    }
  }

  return (
    <div>
      {error ? (
        <p
          className="mb-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        onClick={() => void beginCheckout()}
        disabled={pending}
      >
        {pending ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" size={17} />
        ) : (
          <CreditCard aria-hidden="true" size={17} />
        )}
        {pending ? "Opening secure checkout…" : "Continue to secure checkout"}
      </Button>
    </div>
  );
}
