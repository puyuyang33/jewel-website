import { randomUUID } from "node:crypto";

import { CreditCard, FileCheck2, Gem } from "lucide-react";

import {
  CommissionEtaForm,
  CommissionTransitionForm,
  DraftRevisionForm,
  PublishDraftForm,
} from "@/components/admin/commission-actions";
import { AdminNoteForm } from "@/components/admin/note-form";
import { CommissionTimeline } from "@/components/commission/commission-timeline";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { AttachmentLink } from "@/features/application/attachment-link";
import { eligibleWorkingDraftRevisions } from "@/features/application/draft-series";
import { availableAdminTransitions } from "@/features/admin/transitions";
import { humanizeStatus, statusTone } from "@/features/application/status";
import type { CommissionDetailDto } from "@/lib/data/types";
import { formatDate, formatMoney } from "@/lib/utils";
import type { ActionResult } from "@/types/actions";

type Action = (
  previousState: ActionResult,
  formData: FormData,
) => Promise<ActionResult>;

export function AdminCommissionWorkspace({
  commission,
  transitionAction,
  etaAction,
  draftAction,
  draftFinalizeAction,
  publishAction,
  noteAction,
}: {
  commission: CommissionDetailDto;
  transitionAction: Action;
  etaAction: Action;
  draftAction: (
    formData: FormData,
  ) => Promise<ActionResult<{ revisionId: string }>>;
  draftFinalizeAction: (formData: FormData) => Promise<ActionResult>;
  publishAction: Action;
  noteAction: Action;
}) {
  const eligibleWorkingRevisions = eligibleWorkingDraftRevisions(
    commission.drafts,
  );
  const eligibleDraftSeries = eligibleWorkingRevisions.map((draft) => ({
    id: draft.draftId,
    title: draft.title,
  }));
  const eligibleRevisionIds = new Set(
    eligibleWorkingRevisions.map((draft) => draft.id),
  );
  const paymentSucceeded = commission.payments.some(
    (payment) => payment.kind === "final" && payment.status === "succeeded",
  );

  return (
    <div className="space-y-7">
      <section className="bg-ink text-porcelain relative overflow-hidden rounded-[2rem] p-8 sm:p-10">
        <Gem
          className="text-brass/10 absolute -top-10 -right-10 size-56"
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-brass text-xs font-bold tracking-[0.2em] uppercase">
              {commission.referenceCode}
            </p>
            <h1 className="font-display mt-4 text-5xl">{commission.title}</h1>
            <p className="text-porcelain/65 mt-3">
              {commission.customerName ?? "Customer"} ·{" "}
              {formatMoney(commission.totalMinor, commission.currency)}
            </p>
          </div>
          <StatusPill tone={statusTone(commission.status)}>
            {humanizeStatus(commission.status)}
          </StatusPill>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <CommissionTransitionForm
          commissionId={commission.id}
          status={commission.status}
          targets={availableAdminTransitions(commission.status)}
          idempotencyKey={randomUUID()}
          action={transitionAction}
        />
        <CommissionEtaForm
          commissionId={commission.id}
          currentEta={commission.targetCompletionAt}
          action={etaAction}
        />
        <Card className="p-5">
          <p className="eyebrow">Payment gate</p>
          <h2 className="font-display mt-2 text-3xl">Final readiness</h2>
          <p className="text-stone mt-4 text-sm leading-6">
            {paymentSucceeded
              ? "Verified final payment has succeeded."
              : commission.status === "draft_approved"
                ? "Use the centralized transition to mark final payment due. The API will calculate trusted pricing from the commission."
                : "Final payment readiness is controlled by commission status and verified provider events."}
          </p>
          <p className="mt-4 flex items-center gap-2 text-sm font-semibold">
            <CreditCard aria-hidden="true" size={16} />
            {paymentSucceeded ? "Satisfied" : "Not satisfied"}
          </p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="p-6">
          <p className="eyebrow">Immutable status history</p>
          <h2 className="font-display mt-2 text-4xl">Timeline</h2>
          <div className="mt-7">
            <CommissionTimeline
              events={commission.timeline.map((event, index) => ({
                id: event.id,
                title: humanizeStatus(event.toStatus),
                description:
                  event.reason ?? `Changed by ${humanizeStatus(event.actor)}.`,
                occurredAt: event.occurredAt,
                status:
                  index === commission.timeline.length - 1
                    ? "current"
                    : "completed",
              }))}
            />
          </div>
        </Card>
        <DraftRevisionForm
          commissionId={commission.id}
          drafts={eligibleDraftSeries}
          idempotencyKey={randomUUID()}
          newDraftId={randomUUID()}
          createAction={draftAction}
          finalizeAction={draftFinalizeAction}
        />
      </div>

      <section>
        <p className="eyebrow">Draft version ledger</p>
        <h2 className="font-display mt-2 text-4xl">Revisions & feedback</h2>
        {commission.drafts.length > 0 ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {commission.drafts.map((draft) => (
              <Card key={draft.id} className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>
                    Draft {draft.draftSequence} · revision{" "}
                    {draft.revisionNumber}
                  </Badge>
                  <StatusPill tone={statusTone(draft.status)}>
                    {humanizeStatus(draft.status)}
                  </StatusPill>
                </div>
                <h3 className="font-display mt-4 text-3xl">{draft.title}</h3>
                <p className="text-stone mt-2 text-sm leading-6">
                  {draft.summary}
                </p>
                <p className="text-stone mt-3 text-xs">
                  {draft.assets.length} asset
                  {draft.assets.length === 1 ? "" : "s"} ·{" "}
                  {draft.feedback.length} feedback record
                  {draft.feedback.length === 1 ? "" : "s"}
                </p>
                {draft.assets.length > 0 ? (
                  <div className="mt-3 grid gap-2">
                    {draft.assets.map((asset) => (
                      <AttachmentLink key={asset.id} {...asset} />
                    ))}
                  </div>
                ) : null}
                {eligibleRevisionIds.has(draft.id) &&
                ["in_progress", "revision_requested"].includes(
                  commission.status,
                ) ? (
                  <PublishDraftForm
                    commissionId={commission.id}
                    designDraftId={draft.draftId}
                    revisionId={draft.id}
                    version={draft.revisionNumber}
                    idempotencyKey={randomUUID()}
                    action={publishAction}
                  />
                ) : null}
              </Card>
            ))}
          </div>
        ) : (
          <Card className="text-stone mt-5 border-dashed p-7 text-center">
            No draft revisions recorded.
          </Card>
        )}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <p className="eyebrow">Payments</p>
          <h2 className="font-display mt-2 text-3xl">Provider records</h2>
          {commission.payments.length > 0 ? (
            <ul className="divide-ink/10 mt-5 divide-y">
              {commission.payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div>
                    <p className="font-semibold">
                      {formatMoney(payment.amountMinor, payment.currency)}
                    </p>
                    <p className="text-stone text-xs">
                      {formatDate(payment.updatedAt)}
                    </p>
                  </div>
                  <StatusPill tone={statusTone(payment.status)}>
                    {humanizeStatus(payment.status)}
                  </StatusPill>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-stone mt-4 text-sm">No payment events yet.</p>
          )}
        </Card>
        <Card className="p-6">
          <p className="eyebrow">Deliverables</p>
          <h2 className="font-display mt-2 text-3xl">Release status</h2>
          {commission.deliverables.length > 0 ? (
            <ul className="divide-ink/10 mt-5 divide-y">
              {commission.deliverables.map((deliverable) => (
                <li
                  key={deliverable.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <FileCheck2 aria-hidden="true" size={16} />
                    {deliverable.title}
                  </span>
                  <StatusPill tone={statusTone(deliverable.status)}>
                    {humanizeStatus(deliverable.status)}
                  </StatusPill>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-stone mt-4 text-sm">
              No deliverable metadata registered.
            </p>
          )}
        </Card>
      </section>

      <AdminNoteForm
        subjectType="commission"
        subjectId={commission.id}
        action={noteAction}
      />
    </div>
  );
}
