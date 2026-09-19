"use client";

import { CalendarClock, FileUp, Send, Workflow } from "lucide-react";
import { type FormEvent, useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import { ActionMessage } from "@/components/forms/action-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/field";
import { limits } from "@/config/limits";
import { humanizeStatus } from "@/features/application/status";
import { UploadProgress } from "@/features/uploads/upload-progress";
import { useImageUploadQueue } from "@/features/uploads/use-image-upload-queue";
import type { CommissionStatus } from "@/types/domain";
import { initialActionResult, type ActionResult } from "@/types/actions";

type Action = (
  previousState: ActionResult,
  formData: FormData,
) => Promise<ActionResult>;

export function CommissionTransitionForm({
  commissionId,
  status,
  targets,
  idempotencyKey,
  action,
}: {
  commissionId: string;
  status: CommissionStatus;
  targets: CommissionStatus[];
  idempotencyKey: string;
  action: Action;
}) {
  const [state, formAction] = useActionState(action, initialActionResult);
  return (
    <Card className="p-5">
      <p className="eyebrow">Central transition</p>
      <h2 className="font-display mt-2 text-3xl">Advance the commission</h2>
      {targets.length > 0 ? (
        <form action={formAction} className="mt-5 grid gap-4">
          <input type="hidden" name="commissionId" value={commissionId} />
          <input type="hidden" name="expectedStatus" value={status} />
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <ActionMessage result={state} />
          <div className="grid gap-2">
            <Label htmlFor="commission-target">Next status</Label>
            <select
              id="commission-target"
              name="toStatus"
              className="border-ink/15 min-h-12 rounded-xl border bg-white px-4"
            >
              {targets.map((target) => (
                <option key={target} value={target}>
                  {humanizeStatus(target)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="transition-reason">Operational reason</Label>
            <Textarea
              id="transition-reason"
              name="reason"
              maxLength={2_000}
              placeholder="Required context for the immutable status ledger"
            />
          </div>
          <SubmitButton pendingLabel="Transitioning…">
            <Workflow aria-hidden="true" size={17} />
            Apply transition
          </SubmitButton>
        </form>
      ) : (
        <p className="bg-parchment/50 text-stone mt-4 rounded-xl p-4 text-sm">
          No administrator transition is valid from this status.
        </p>
      )}
    </Card>
  );
}

export function CommissionEtaForm({
  commissionId,
  currentEta,
  action,
}: {
  commissionId: string;
  currentEta: string | null;
  action: Action;
}) {
  const [state, formAction] = useActionState(action, initialActionResult);
  return (
    <Card className="p-5">
      <p className="eyebrow">Expectation</p>
      <h2 className="font-display mt-2 text-3xl">Completion estimate</h2>
      <form action={formAction} className="mt-5 grid gap-4">
        <input type="hidden" name="commissionId" value={commissionId} />
        <ActionMessage result={state} />
        <div className="grid gap-2">
          <Label htmlFor="target-completion">Target date and time</Label>
          <Input
            id="target-completion"
            name="targetCompletionAt"
            type="datetime-local"
            defaultValue={currentEta?.slice(0, 16) ?? ""}
            required
          />
        </div>
        <SubmitButton variant="secondary" pendingLabel="Saving estimate…">
          <CalendarClock aria-hidden="true" size={17} />
          Save estimate
        </SubmitButton>
      </form>
    </Card>
  );
}

export function DraftRevisionForm({
  commissionId,
  drafts,
  idempotencyKey,
  newDraftId,
  createAction,
  finalizeAction,
}: {
  commissionId: string;
  drafts: { id: string; title: string }[];
  idempotencyKey: string;
  newDraftId: string;
  createAction: (
    formData: FormData,
  ) => Promise<ActionResult<{ revisionId: string }>>;
  finalizeAction: (formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [state, setState] = useState<ActionResult>(initialActionResult);
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [complete, setComplete] = useState(false);
  const [pending, setPending] = useState(false);
  const uploads = useImageUploadQueue({ purpose: "draft", maximum: 20 });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || uploads.validationError) {
      if (uploads.validationError) {
        setState({
          ok: false,
          code: "VALIDATION_ERROR",
          message: uploads.validationError,
        });
      }
      return;
    }
    setPending(true);
    try {
      let targetRevisionId = revisionId;
      if (!targetRevisionId) {
        const createResult = await createAction(
          new FormData(event.currentTarget),
        );
        if (!createResult.ok || !createResult.data) {
          setState(
            createResult.ok
              ? { ok: true, message: createResult.message }
              : createResult,
          );
          return;
        }
        targetRevisionId = createResult.data.revisionId;
        setRevisionId(targetRevisionId);
      }
      setState({ ok: true, message: "Uploading verified draft images…" });
      const attachmentIds = await uploads.uploadAll(targetRevisionId);
      const finalizeData = new FormData();
      finalizeData.set("revisionId", targetRevisionId);
      finalizeData.set("attachmentIds", JSON.stringify(attachmentIds));
      const finalizeResult = await finalizeAction(finalizeData);
      setState(finalizeResult);
      if (finalizeResult.ok) {
        setComplete(true);
        router.refresh();
      }
    } catch (error) {
      setState({
        ok: false,
        code: "UPLOAD_FAILED",
        message:
          error instanceof Error
            ? `${error.message} Retry to finish the saved revision.`
            : "The upload failed. Retry to finish the saved revision.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="p-6">
      <p className="eyebrow">Private working file</p>
      <h2 className="font-display mt-2 text-4xl">Create draft revision</h2>
      <form onSubmit={handleSubmit} className="mt-6 grid gap-5 sm:grid-cols-2">
        <input type="hidden" name="commissionId" value={commissionId} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <input type="hidden" name="newDraftId" value={newDraftId} />
        <ActionMessage result={state} />
        <fieldset
          className="contents disabled:opacity-60"
          disabled={Boolean(revisionId)}
        >
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="draft-parent">Draft series</Label>
            <select
              id="draft-parent"
              name="draftId"
              value={selectedDraftId}
              onChange={(event) => setSelectedDraftId(event.target.value)}
              className="border-ink/15 min-h-12 rounded-xl border bg-white px-4"
            >
              <option value="">Create a new draft series</option>
              {drafts.map((draft) => (
                <option key={draft.id} value={draft.id}>
                  {draft.title}
                </option>
              ))}
            </select>
            <p className="text-stone text-xs">
              Only the latest working, unpublished series can receive another
              revision. Historical series remain visible in the ledger below.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="draft-stage">Stage</Label>
            <select
              id="draft-stage"
              name="stage"
              className="border-ink/15 min-h-12 rounded-xl border bg-white px-4"
            >
              <option value="concept">Concept</option>
              <option value="refinement">Refinement</option>
              <option value="final_design">Final design</option>
            </select>
            <p className="text-stone text-xs">
              Stage is used only when creating a new series.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="draft-title">Revision title</Label>
            <Input id="draft-title" name="title" required maxLength={200} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="draft-notes">Notes for customer</Label>
            <Textarea id="draft-notes" name="notes" maxLength={5_000} />
          </div>
        </fieldset>
        <label className="border-brass/50 bg-parchment/25 text-stone hover:bg-parchment/50 col-span-full flex min-h-20 cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed px-5 text-sm font-semibold">
          <FileUp aria-hidden="true" size={18} />
          Choose draft images (up to {limits.imageMegabytes} MB each)
          <input
            className="sr-only"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            disabled={
              complete || (Boolean(revisionId) && uploads.completedCount > 0)
            }
            onChange={(event) => uploads.selectFiles(event.target.files)}
          />
        </label>
        <div className="col-span-full">
          <UploadProgress
            queue={uploads.queue}
            validationError={uploads.validationError}
          />
        </div>
        <Button
          type="submit"
          disabled={pending || complete || Boolean(uploads.validationError)}
        >
          <FileUp aria-hidden="true" size={17} />
          {pending
            ? `Uploading ${uploads.completedCount} of ${uploads.queue.length}…`
            : complete
              ? "Draft assets verified"
              : uploads.hasFailures || revisionId
                ? "Retry draft uploads"
                : "Save revision and upload"}
        </Button>
      </form>
    </Card>
  );
}

export function PublishDraftForm({
  commissionId,
  designDraftId,
  revisionId,
  version,
  idempotencyKey,
  action,
}: {
  commissionId: string;
  designDraftId: string;
  revisionId: string;
  version: number;
  idempotencyKey: string;
  action: Action;
}) {
  const [state, formAction] = useActionState(action, initialActionResult);
  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="commissionId" value={commissionId} />
      <input type="hidden" name="designDraftId" value={designDraftId} />
      <input type="hidden" name="revisionId" value={revisionId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <ActionMessage result={state} />
      <SubmitButton className="mt-3" pendingLabel="Sharing revision…">
        <Send aria-hidden="true" size={16} />
        Share exact revision
      </SubmitButton>
    </form>
  );
}
