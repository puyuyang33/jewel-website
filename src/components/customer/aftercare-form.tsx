"use client";

import { CircleCheckBig } from "lucide-react";
import { useActionState } from "react";

import { ActionMessage } from "@/components/forms/action-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/field";
import { initialActionResult, type ActionResult } from "@/types/actions";

type Action = (
  previousState: ActionResult,
  formData: FormData,
) => Promise<ActionResult>;

export function OpenAftercareCaseForm({
  commissionId,
  clientRequestId,
  idempotencyKey,
  action,
}: {
  commissionId: string;
  clientRequestId: string;
  idempotencyKey: string;
  action: Action;
}) {
  const [state, formAction] = useActionState(action, initialActionResult);
  return (
    <Card className="p-6">
      <p className="eyebrow">New care request</p>
      <h2 className="font-display mt-2 text-3xl">Open an aftercare case</h2>
      <p className="text-stone mt-2 text-sm leading-6">
        Start aftercare from a delivered commission or add another fit,
        maintenance, or documentation case to active aftercare.
      </p>
      <form action={formAction} className="mt-5 grid gap-4">
        <input type="hidden" name="commissionId" value={commissionId} />
        <input type="hidden" name="clientRequestId" value={clientRequestId} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <ActionMessage result={state} />
        <div className="grid gap-2">
          <Label htmlFor={`aftercare-category-${commissionId}`}>Category</Label>
          <select
            id={`aftercare-category-${commissionId}`}
            name="category"
            className="border-ink/15 min-h-12 rounded-xl border bg-white px-4"
          >
            <option value="care">Care guidance</option>
            <option value="fit">Fit or sizing</option>
            <option value="documentation">Documentation</option>
            <option value="repair">Repair assessment</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`aftercare-subject-${commissionId}`}>Subject</Label>
          <Input
            id={`aftercare-subject-${commissionId}`}
            name="subject"
            required
            maxLength={200}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`aftercare-description-${commissionId}`}>
            What should the atelier address?
          </Label>
          <Textarea
            id={`aftercare-description-${commissionId}`}
            name="description"
            required
            minLength={10}
            maxLength={5_000}
          />
        </div>
        <SubmitButton pendingLabel="Opening case…">
          Open aftercare case
        </SubmitButton>
      </form>
    </Card>
  );
}

export function CompleteAftercareCaseForm({
  commissionId,
  caseId,
  idempotencyKey,
  action,
}: {
  commissionId: string;
  caseId: string;
  idempotencyKey: string;
  action: Action;
}) {
  const [state, formAction] = useActionState(action, initialActionResult);
  return (
    <Card className="p-6">
      <p className="eyebrow">Aftercare</p>
      <h2 className="font-display mt-2 text-3xl">Complete aftercare</h2>
      <p className="text-stone mt-2 text-sm leading-6">
        The atelier has started aftercare. Confirm completion only when the
        current care work is resolved; this closes the commission and records an
        immutable history event.
      </p>
      <form action={formAction} className="mt-5 grid gap-4">
        <input type="hidden" name="commissionId" value={commissionId} />
        <input type="hidden" name="caseId" value={caseId} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <ActionMessage result={state} />
        <div className="grid gap-2">
          <Label htmlFor={`aftercare-resolution-${caseId}`}>
            Resolution summary
          </Label>
          <Textarea
            id={`aftercare-resolution-${caseId}`}
            name="resolution"
            required
            minLength={10}
            maxLength={5_000}
            placeholder="Confirm what was resolved before closing this case."
          />
        </div>
        <label className="border-ink/10 flex gap-3 rounded-xl border bg-white p-4 text-sm">
          <input
            className="accent-garnet mt-1 size-4"
            type="checkbox"
            name="confirmation"
            required
          />
          <span>
            <span className="block font-semibold">
              I confirm the aftercare work is complete
            </span>
            <span className="text-stone mt-1 block leading-5">
              This advances the commission from Aftercare to Completed.
            </span>
          </span>
        </label>
        <SubmitButton pendingLabel="Completing aftercare…">
          <CircleCheckBig aria-hidden="true" size={17} />
          Confirm aftercare completion
        </SubmitButton>
      </form>
    </Card>
  );
}
