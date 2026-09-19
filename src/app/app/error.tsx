"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function CustomerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("customer-workspace-render", error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-xl p-8 text-center" role="alert">
      <AlertTriangle className="text-garnet mx-auto" aria-hidden="true" />
      <h1 className="font-display mt-5 text-4xl">
        The private room could not be opened.
      </h1>
      <p className="text-stone mt-3 leading-7">
        No changes were made. Retry the secure request, or return later if the
        atelier service is temporarily unavailable.
      </p>
      <Button className="mt-6" onClick={reset}>
        <RotateCcw aria-hidden="true" size={17} />
        Try again
      </Button>
    </Card>
  );
}
