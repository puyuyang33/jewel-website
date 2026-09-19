"use client";

import { CheckCircle2, RotateCcw } from "lucide-react";
import { useActionState } from "react";

import { ActionMessage } from "@/components/forms/action-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/field";
import { initialActionResult, type ActionResult } from "@/types/actions";

type Action = (
  previousState: ActionResult,
  formData: FormData,
) => Promise<ActionResult>;

export function DraftDecisionForms({
  commissionId,
  revisionId,
  version,
  approveAction,
  revisionAction,
  feedbackId,
  approvalFeedbackId,
  remainingRevisions,
}: {
  commissionId: string;
  revisionId: string;
  version: number;
  approveAction: Action;
  revisionAction: Action;
  feedbackId: string;
  approvalFeedbackId: string;
  remainingRevisions: number;
}) {
  const [approveState, approveFormAction] = useActionState(
    approveAction,
    initialActionResult,
  );
  const [revisionState, revisionFormAction] = useActionState(
    revisionAction,
    initialActionResult,
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h3 className="font-display text-3xl">Approve this exact version</h3>
        <p className="text-stone mt-2 text-sm leading-6">
          Approval is locked to revision {version}; a newer revision requires a
          fresh review.
        </p>
        <form action={approveFormAction} className="mt-5">
          <input type="hidden" name="commissionId" value={commissionId} />
          <input type="hidden" name="revisionId" value={revisionId} />
          <input type="hidden" name="expectedVersion" value={version} />
          <input
            type="hidden"
            name="clientFeedbackId"
            value={approvalFeedbackId}
          />
          <ActionMessage result={approveState} />
          <SubmitButton className="mt-3" pendingLabel="Approving…">
            <CheckCircle2 aria-hidden="true" size={17} />
            Approve revision {version}
          </SubmitButton>
        </form>
      </Card>

      <Card className="p-5">
        <h3 className="font-display text-3xl">Request a refinement</h3>
        <p className="text-stone mt-2 text-sm leading-6">
          {remainingRevisions > 0
            ? `${remainingRevisions} included revision round${remainingRevisions === 1 ? "" : "s"} remaining.`
            : "The included revision allowance has been used. Contact the atelier before requesting more."}
        </p>
        <form action={revisionFormAction} className="mt-5 grid gap-3">
          <input type="hidden" name="commissionId" value={commissionId} />
          <input type="hidden" name="revisionId" value={revisionId} />
          <input type="hidden" name="expectedVersion" value={version} />
          <input type="hidden" name="clientFeedbackId" value={feedbackId} />
          <ActionMessage result={revisionState} />
          <div className="grid gap-2">
            <Label htmlFor={`revision-reason-${revisionId}`}>
              What should change?
            </Label>
            <Textarea
              id={`revision-reason-${revisionId}`}
              name="reason"
              required
              maxLength={2_000}
              disabled={remainingRevisions <= 0}
            />
          </div>
          <SubmitButton
            variant="secondary"
            pendingLabel="Requesting…"
            disabled={remainingRevisions <= 0}
          >
            <RotateCcw aria-hidden="true" size={17} />
            Request revision
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
