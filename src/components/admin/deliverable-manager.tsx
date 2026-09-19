"use client";

import { FileLock2 } from "lucide-react";
import { useActionState } from "react";

import { ActionMessage } from "@/components/forms/action-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { humanizeStatus, statusTone } from "@/features/application/status";
import type { DeliverableDto } from "@/lib/data/types";
import { initialActionResult, type ActionResult } from "@/types/actions";

type Action = (
  previousState: ActionResult,
  formData: FormData,
) => Promise<ActionResult>;

export function DeliverableManager({
  deliverables,
  registrationIdempotencyKey,
  registerAction,
}: {
  deliverables: DeliverableDto[];
  registrationIdempotencyKey: string;
  registerAction: Action;
}) {
  const [state, formAction] = useActionState(
    registerAction,
    initialActionResult,
  );
  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Card className="p-6">
        <p className="eyebrow">External delivery registration</p>
        <h2 className="font-display mt-2 text-4xl">New deliverable</h2>
        <p className="text-stone mt-3 text-sm leading-6">
          The external HTTPS link is written only through the administrator RPC
          and never returned in list data. Customer access still passes through
          the authorized open route.
        </p>
        <form action={formAction} className="mt-6 grid gap-4">
          <input
            type="hidden"
            name="idempotencyKey"
            value={registrationIdempotencyKey}
          />
          <ActionMessage result={state} />
          <div className="grid gap-2">
            <Label htmlFor="deliverable-commission">Commission ID</Label>
            <Input
              id="deliverable-commission"
              name="commissionId"
              required
              placeholder="UUID"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="deliverable-kind">Kind</Label>
            <select
              id="deliverable-kind"
              name="kind"
              className="border-ink/15 min-h-12 rounded-xl border bg-white px-4"
            >
              <option value="design_package">Design package</option>
              <option value="invoice">Invoice</option>
              <option value="care_guide">Care guide</option>
              <option value="certificate">Certificate</option>
              <option value="shipping_document">Shipping document</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="deliverable-title">Title</Label>
            <Input
              id="deliverable-title"
              name="title"
              required
              maxLength={200}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="deliverable-description">Description</Label>
            <Textarea
              id="deliverable-description"
              name="description"
              maxLength={5_000}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="deliverable-url">External HTTPS link</Label>
            <Input
              id="deliverable-url"
              name="externalUrl"
              type="url"
              required
              placeholder="https://secure-delivery.example/package"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="deliverable-file">File name</Label>
              <Input id="deliverable-file" name="fileName" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="deliverable-mime">MIME type</Label>
              <select
                id="deliverable-mime"
                name="mimeType"
                className="border-ink/15 min-h-12 rounded-xl border bg-white px-4"
              >
                <option value="application/pdf">PDF</option>
                <option value="application/zip">ZIP</option>
                <option value="image/jpeg">JPEG</option>
                <option value="image/png">PNG</option>
                <option value="image/webp">WebP</option>
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="deliverable-bytes">Byte size</Label>
              <Input
                id="deliverable-bytes"
                name="byteSize"
                type="number"
                min={1}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="deliverable-hash">SHA-256</Label>
              <Input
                id="deliverable-hash"
                name="sha256Hex"
                minLength={64}
                maxLength={64}
                required
              />
            </div>
          </div>
          <label className="border-ink/10 flex gap-3 rounded-xl border bg-white p-4 text-sm">
            <input
              type="checkbox"
              name="release"
              className="accent-garnet mt-1 size-4"
            />
            <span>
              <span className="block font-semibold">
                Release immediately when payment is verified
              </span>
              <span className="text-stone mt-1 block leading-5">
                Otherwise the new version remains Preparing.
              </span>
            </span>
          </label>
          <SubmitButton pendingLabel="Registering securely…">
            <FileLock2 aria-hidden="true" size={17} />
            Register external deliverable
          </SubmitButton>
        </form>
      </Card>

      <section>
        <p className="eyebrow">Release queue</p>
        <h2 className="font-display mt-2 text-4xl">Registered versions</h2>
        <div className="mt-5 space-y-4">
          {deliverables.map((deliverable) => (
            <Card key={deliverable.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">{deliverable.title}</p>
                  <p className="text-stone mt-1 text-sm">
                    {deliverable.commissionReference} ·{" "}
                    {deliverable.customerName} · version {deliverable.version}
                  </p>
                </div>
                <StatusPill tone={statusTone(deliverable.status)}>
                  {humanizeStatus(deliverable.status)}
                </StatusPill>
              </div>
              <p className="text-stone border-ink/10 mt-4 border-t pt-4 text-sm leading-6">
                {deliverable.status === "preparing"
                  ? "To release this version, resubmit its metadata and external URL with “Release immediately” checked. The RPC matches and updates the preparing version atomically."
                  : "This version is immutable through the application. Direct table mutation is not available."}
              </p>
            </Card>
          ))}
          {deliverables.length === 0 ? (
            <Card className="text-stone border-dashed p-7 text-center">
              No deliverables registered.
            </Card>
          ) : null}
        </div>
      </section>
    </div>
  );
}
