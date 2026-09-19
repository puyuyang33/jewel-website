"use client";

import { ArrowRight, ImagePlus } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { ActionMessage } from "@/components/forms/action-message";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/field";
import { UploadProgress } from "@/features/uploads/upload-progress";
import { useImageUploadQueue } from "@/features/uploads/use-image-upload-queue";
import { initialActionResult, type ActionResult } from "@/types/actions";

interface DesignRequestFormProps {
  saveDraftAction: (
    formData: FormData,
  ) => Promise<ActionResult<{ id: string }>>;
  submitAction: (formData: FormData) => Promise<ActionResult<{ id: string }>>;
}

export function DesignRequestForm({
  saveDraftAction,
  submitAction,
}: DesignRequestFormProps) {
  const [state, setState] = useState<ActionResult<{ id: string }>>(
    initialActionResult as ActionResult<{ id: string }>,
  );
  const [draftId, setDraftId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const uploads = useImageUploadQueue({ purpose: "request", maximum: 10 });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    setPending(true);
    setState({ ok: true, message: "Saving your private draft…" });
    const formData = new FormData(event.currentTarget);
    formData.set("requestId", draftId ?? "");
    try {
      const draftResult = await saveDraftAction(formData);
      if (!draftResult.ok || !draftResult.data) {
        setState(draftResult);
        return;
      }
      setDraftId(draftResult.data.id);
      setState({ ok: true, message: "Uploading verified references…" });
      const attachmentIds = await uploads.uploadAll(draftResult.data.id);
      const submitData = new FormData();
      submitData.set("requestId", draftResult.data.id);
      submitData.set("attachmentIds", JSON.stringify(attachmentIds));
      const submitResult = await submitAction(submitData);
      setState(submitResult);
    } catch (error) {
      setState({
        ok: false,
        code: "UPLOAD_FAILED",
        message:
          error instanceof Error
            ? `${error.message} Retry to continue with the saved draft.`
            : "The upload failed. Retry to continue with the saved draft.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-ink/10 bg-parchment/45 border-b px-6 py-5">
        <p className="text-stone text-sm leading-6">
          Fields marked required become part of your private atelier brief.
          Amounts are entered in major units and stored securely in minor units.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="grid gap-7 p-6 sm:p-8">
        <ActionMessage
          result={state.ok ? { ok: true, message: state.message } : state}
        />
        {state.ok && state.data ? (
          <Link
            href={`/app/requests/${state.data.id}`}
            className="text-garnet inline-flex items-center gap-2 font-semibold hover:underline"
          >
            Open your request
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        ) : null}

        <fieldset className="grid gap-5 sm:grid-cols-2">
          <legend className="font-display col-span-full text-3xl">
            The intention
          </legend>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="request-title">Working title</Label>
            <Input
              id="request-title"
              name="title"
              required
              maxLength={160}
              placeholder="A celestial heirloom ring"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="request-type">Piece type</Label>
            <select
              id="request-type"
              name="requestType"
              required
              defaultValue="ring"
              className="border-ink/15 min-h-12 rounded-xl border bg-white px-4"
            >
              <option value="ring">Ring</option>
              <option value="necklace">Necklace</option>
              <option value="earrings">Earrings</option>
              <option value="bracelet">Bracelet</option>
              <option value="brooch">Brooch</option>
              <option value="object">Art object</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="request-occasion">Occasion</Label>
            <Input
              id="request-occasion"
              name="occasion"
              maxLength={160}
              placeholder="Anniversary, ceremony, legacy"
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="request-description">Story and direction</Label>
            <Textarea
              id="request-description"
              name="description"
              required
              minLength={20}
              maxLength={12_000}
              placeholder="Tell us who this is for, what it should carry, and what must feel unmistakably yours."
            />
          </div>
        </fieldset>

        <fieldset className="grid gap-5 sm:grid-cols-3">
          <legend className="font-display col-span-full text-3xl">
            Parameters
          </legend>
          <div className="grid gap-2">
            <Label htmlFor="budget-min">Budget from (USD)</Label>
            <Input
              id="budget-min"
              name="budgetMin"
              inputMode="decimal"
              placeholder="5000"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="budget-max">Budget to (USD)</Label>
            <Input
              id="budget-max"
              name="budgetMax"
              inputMode="decimal"
              placeholder="12000"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="desired-by">Desired by</Label>
            <Input id="desired-by" name="desiredBy" type="date" />
          </div>
          <input type="hidden" name="currency" value="USD" />
          <div className="grid gap-2">
            <Label htmlFor="metal-preferences">Metals</Label>
            <Input
              id="metal-preferences"
              name="metalPreferences"
              placeholder="18k yellow gold, platinum"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="stone-preferences">Stones</Label>
            <Input
              id="stone-preferences"
              name="stonePreferences"
              placeholder="Sapphire, antique diamond"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ring-size">Ring size</Label>
            <Input id="ring-size" name="ringSize" placeholder="US 6.5" />
          </div>
          <div className="grid gap-2 sm:col-span-3">
            <Label htmlFor="inspiration-notes">Reference notes</Label>
            <Textarea
              id="inspiration-notes"
              name="inspirationNotes"
              maxLength={4_000}
              placeholder="What should we notice in your references?"
            />
          </div>
          <label className="border-brass/50 bg-parchment/25 text-stone hover:bg-parchment/50 col-span-full flex min-h-24 cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed px-5 text-sm font-semibold transition">
            <ImagePlus aria-hidden="true" size={20} />
            Add up to 10 inspiration images
            <input
              className="sr-only"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              disabled={uploads.completedCount > 0}
              onChange={(event) => uploads.selectFiles(event.target.files)}
            />
          </label>
          <div className="col-span-full">
            <UploadProgress
              queue={uploads.queue}
              validationError={uploads.validationError}
            />
          </div>
        </fieldset>

        <div className="border-ink/10 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-stone max-w-xl text-xs leading-5">
            Submitting opens a durable private request and conversation. The
            atelier will respond with questions or a versioned quote.
          </p>
          <Button
            className="w-full sm:w-auto"
            type="submit"
            disabled={pending || (state.ok && Boolean(state.data))}
          >
            {pending
              ? `Processing ${uploads.completedCount} of ${uploads.queue.length} images…`
              : uploads.hasFailures
                ? "Retry upload and submit"
                : "Submit private request"}
            <ArrowRight aria-hidden="true" size={17} />
          </Button>
        </div>
      </form>
    </Card>
  );
}
