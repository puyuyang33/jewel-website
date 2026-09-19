import { CheckCircle2, MessageSquareText, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface DraftReviewPanelProps {
  draft: {
    id: string;
    version: number;
    title: string;
    notes: string;
    imageCount: number;
    status: "shared" | "approved" | "superseded";
  };
  revisionAllowance: {
    included: number;
    used: number;
    remaining: number;
  };
  approveAction?: (formData: FormData) => void | Promise<void>;
  requestRevisionHref?: string;
}

export function DraftReviewPanel({
  draft,
  revisionAllowance,
  approveAction,
  requestRevisionHref,
}: DraftReviewPanelProps) {
  const exhausted = revisionAllowance.remaining <= 0;

  return (
    <Card className="overflow-hidden">
      <div className="border-ink/10 bg-parchment/55 flex flex-col gap-5 border-b p-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Badge>Draft {draft.version}</Badge>
          <h2 className="font-display mt-4 text-3xl">{draft.title}</h2>
          <p className="text-stone mt-2 max-w-2xl leading-7">{draft.notes}</p>
        </div>
        <Badge
          className={
            draft.status === "approved"
              ? "border-emerald-400 bg-emerald-50 text-emerald-900"
              : undefined
          }
        >
          {draft.status}
        </Badge>
      </div>
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-ink flex items-center gap-2 text-sm font-semibold">
            <RotateCcw aria-hidden="true" size={16} />
            Revision allowance
          </p>
          <p className="text-stone mt-2 text-sm leading-6">
            {revisionAllowance.used} used of {revisionAllowance.included};{" "}
            {revisionAllowance.remaining} remaining.
          </p>
          {exhausted ? (
            <p className="mt-2 text-sm font-medium text-amber-900">
              Further changes require a revised quote or a complimentary
              administrator override.
            </p>
          ) : null}
        </div>
        {draft.status === "shared" ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            {requestRevisionHref ? (
              exhausted ? (
                <Button variant="secondary" disabled>
                  <MessageSquareText aria-hidden="true" size={17} />
                  Request revision
                </Button>
              ) : (
                <Button asChild variant="secondary">
                  <a href={requestRevisionHref}>
                    <MessageSquareText aria-hidden="true" size={17} />
                    Request revision
                  </a>
                </Button>
              )
            ) : null}
            {approveAction ? (
              <form action={approveAction}>
                <input type="hidden" name="draftId" value={draft.id} />
                <input
                  type="hidden"
                  name="expectedVersion"
                  value={draft.version}
                />
                <Button type="submit">
                  <CheckCircle2 aria-hidden="true" size={17} />
                  Approve draft
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
