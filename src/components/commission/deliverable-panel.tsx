import { ExternalLink, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface DeliverablePanelProps {
  locked: boolean;
  reason?: string;
  openHref?: string;
  title: string;
  description: string;
}

export function DeliverablePanel({
  locked,
  reason,
  openHref,
  title,
  description,
}: DeliverablePanelProps) {
  return (
    <Card className="overflow-hidden">
      <div className="border-ink/10 bg-parchment/65 border-b p-6">
        <span className="bg-porcelain text-garnet grid size-11 place-items-center rounded-full">
          {locked ? (
            <LockKeyhole aria-hidden="true" size={20} />
          ) : (
            <ShieldCheck aria-hidden="true" size={20} />
          )}
        </span>
        <h2 className="font-display mt-5 text-3xl">{title}</h2>
        <p className="text-stone mt-2 leading-7">{description}</p>
      </div>
      <div className="p-6">
        {locked ? (
          <p className="border-brass/25 rounded-xl border bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            {reason ?? "This deliverable is not available yet."}
          </p>
        ) : openHref ? (
          <Button asChild>
            <Link href={openHref} target="_blank" rel="noopener noreferrer">
              Open final deliverable
              <ExternalLink aria-hidden="true" size={17} />
            </Link>
          </Button>
        ) : (
          <p className="text-stone text-sm">
            The deliverable is approved but has not been published.
          </p>
        )}
        <p className="text-stone mt-5 text-xs leading-5">
          Access is checked on every request. Once a third-party link is shown,
          the application cannot prevent it from being shared.
        </p>
      </div>
    </Card>
  );
}
