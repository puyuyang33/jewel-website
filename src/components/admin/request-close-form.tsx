"use client";

import { ArchiveX } from "lucide-react";
import { useActionState } from "react";

import { ActionMessage } from "@/components/forms/action-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/field";
import { initialActionResult, type ActionResult } from "@/types/actions";

export function RequestCloseForm({
  requestId,
  action,
}: {
  requestId: string;
  action: (
    previousState: ActionResult,
    formData: FormData,
  ) => Promise<ActionResult>;
}) {
  const [state, formAction] = useActionState(action, initialActionResult);
  return (
    <Card className="p-5">
      <h2 className="font-display text-3xl">Close request</h2>
      <p className="text-stone mt-2 text-sm leading-6">
        Closing is final for this request. Record an operational reason in the
        private audit trail.
      </p>
      <form action={formAction} className="mt-4 grid gap-3">
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="intent" value="close" />
        <ActionMessage result={state} />
        <div className="grid gap-2">
          <Label htmlFor={`close-reason-${requestId}`}>Reason</Label>
          <Textarea
            id={`close-reason-${requestId}`}
            name="reason"
            required
            maxLength={500}
          />
        </div>
        <SubmitButton variant="danger" pendingLabel="Closing…">
          <ArchiveX aria-hidden="true" size={16} />
          Close request
        </SubmitButton>
      </form>
    </Card>
  );
}
