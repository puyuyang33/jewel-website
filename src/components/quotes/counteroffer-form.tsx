"use client";

import { useActionState } from "react";

import { ActionMessage } from "@/components/forms/action-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input, Label, Textarea } from "@/components/ui/field";
import { initialActionResult, type ActionResult } from "@/types/actions";

interface CounterofferFormProps {
  action: (
    previousState: ActionResult,
    formData: FormData,
  ) => Promise<ActionResult>;
  quoteId: string;
  currency: string;
}

export function CounterofferForm({
  action,
  quoteId,
  currency,
}: CounterofferFormProps) {
  const [state, formAction] = useActionState(action, initialActionResult);

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="quoteId" value={quoteId} />
      <ActionMessage result={state} />
      <div className="grid gap-2">
        <Label htmlFor="counteroffer-amount">
          Proposed amount ({currency})
        </Label>
        <Input
          id="counteroffer-amount"
          name="amount"
          type="number"
          min="1"
          step="0.01"
          inputMode="decimal"
          required
        />
        <p className="text-stone text-xs leading-5">
          This is a proposal, not an official quote or automatic price change.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="counteroffer-explanation">
          What should we revisit?
        </Label>
        <Textarea
          id="counteroffer-explanation"
          name="explanation"
          maxLength={2_000}
          required
          placeholder="Share the priorities behind your proposal..."
        />
      </div>
      <SubmitButton
        className="w-full sm:w-fit"
        pendingLabel="Sending proposal..."
      >
        Send counteroffer
      </SubmitButton>
    </form>
  );
}
