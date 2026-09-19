"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page rendering failed", { digest: error.digest });
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="max-w-lg text-center">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="section-title mt-4">
          The atelier hit an unexpected snag.
        </h1>
        <p className="text-stone mt-5 text-lg leading-8">
          Your work has not been marked complete. Please retry, or return later
          if the issue continues.
        </p>
        <Button className="mt-8" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
