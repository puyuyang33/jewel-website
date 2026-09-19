"use client";

import { LockKeyhole, Save } from "lucide-react";
import { useActionState } from "react";

import { ActionMessage } from "@/components/forms/action-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/field";
import { initialActionResult, type ActionResult } from "@/types/actions";

export function AdminNoteForm({
  subjectType,
  subjectId,
  action,
}: {
  subjectType: "profile" | "design_request" | "conversation" | "commission";
  subjectId: string;
  action: (
    previousState: ActionResult,
    formData: FormData,
  ) => Promise<ActionResult>;
}) {
  const [state, formAction] = useActionState(action, initialActionResult);
  return (
    <Card className="border-brass/35 p-5">
      <p className="text-garnet flex items-center gap-2 text-xs font-bold tracking-[0.16em] uppercase">
        <LockKeyhole aria-hidden="true" size={14} />
        Administrator-only note
      </p>
      <form action={formAction} className="mt-4 grid gap-3">
        <input type="hidden" name="subjectType" value={subjectType} />
        <input type="hidden" name="subjectId" value={subjectId} />
        <ActionMessage result={state} />
        <div className="grid gap-2">
          <Label htmlFor={`note-${subjectType}-${subjectId}`}>
            Private note
          </Label>
          <Textarea
            id={`note-${subjectType}-${subjectId}`}
            name="body"
            required
            maxLength={5_000}
            placeholder="Record context that must remain inside atelier operations."
          />
        </div>
        <SubmitButton pendingLabel="Recording note…">
          <Save aria-hidden="true" size={16} />
          Record private note
        </SubmitButton>
      </form>
    </Card>
  );
}
