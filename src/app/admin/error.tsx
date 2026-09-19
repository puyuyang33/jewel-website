"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("admin-workspace-render", error);
  }, [error]);
  return (
    <Card className="mx-auto max-w-xl p-8 text-center" role="alert">
      <AlertTriangle className="text-garnet mx-auto" aria-hidden="true" />
      <h1 className="font-display mt-5 text-4xl">
        Operations could not be loaded.
      </h1>
      <p className="text-stone mt-3 leading-7">
        The failed read was not replaced with demo data. Retry the authorized
        request after checking the data service.
      </p>
      <Button className="mt-6" onClick={reset}>
        <RotateCcw aria-hidden="true" size={17} />
        Retry authorized read
      </Button>
    </Card>
  );
}
