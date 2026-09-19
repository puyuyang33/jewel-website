import { randomUUID } from "node:crypto";

import { CalendarClock, CreditCard, FileCheck2, Gem } from "lucide-react";

import { CommissionTimeline } from "@/components/commission/commission-timeline";
import { DeliverablePanel } from "@/components/commission/deliverable-panel";
import {
  CompleteAftercareCaseForm,
  OpenAftercareCaseForm,
} from "@/components/customer/aftercare-form";
import { CheckoutButton } from "@/components/customer/checkout-button";
import { DraftDecisionForms } from "@/components/customer/draft-decision-forms";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { AttachmentLink } from "@/features/application/attachment-link";
import { humanizeStatus, statusTone } from "@/features/application/status";
import type { CommissionDetailDto } from "@/lib/data/types";
import { formatDate, formatMoney } from "@/lib/utils";
import type { ActionResult } from "@/types/actions";

type Action = (
  previousState: ActionResult,
  formData: FormData,
) => Promise<ActionResult>;

export function CommissionWorkspace({
  commission,
  paymentReturnState,
  approveAction,
  revisionAction,
  openAftercareAction,
  completeAftercareAction,
}: {
  commission: CommissionDetailDto;
  paymentReturnState: "processing" | "cancelled" | null;
  approveAction: Action;
  revisionAction: Action;
  openAftercareAction: Action;
  completeAftercareAction: Action;
}) {
  const latestDraft = commission.drafts.at(-1);
  const remainingRevisions = Math.max(
    commission.includedRevisionRounds - commission.usedRevisionRounds,
    0,
  );
  const payment = commission.payments[0];
  const paymentSucceeded = commission.payments.some(
    (item) => item.kind === "final" && item.status === "succeeded",
  );
  const unsupportedDeposit = commission.depositMinor !== 0;

  return (
    <div className="space-y-8">
      <section className="bg-ink text-porcelain relative overflow-hidden rounded-[2rem] p-7 sm:p-10">
        <Gem
          aria-hidden="true"
          className="text-brass/10 absolute -top-7 -right-8 size-52"
          strokeWidth={0.7}
        />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-brass text-xs font-bold tracking-[0.2em] uppercase">
              {commission.referenceCode}
            </p>
            <h1 className="font-display mt-4 text-5xl leading-none">
              {commission.title}
            </h1>
            <p className="text-porcelain/65 mt-4">
              Accepted quote version {commission.acceptedQuoteVersion} ·{" "}
              {formatMoney(commission.totalMinor, commission.currency)}
            </p>
          </div>
          <StatusPill tone={statusTone(commission.status)}>
            {humanizeStatus(commission.status)}
          </StatusPill>
        </div>
        <div className="border-porcelain/15 relative mt-8 grid gap-4 border-t pt-6 sm:grid-cols-3">
          <div className="flex gap-3">
            <CalendarClock
              className="text-brass"
              size={18}
              aria-hidden="true"
            />
            <div>
              <p className="text-porcelain/50 text-xs">Estimated completion</p>
              <p className="mt-1 text-sm font-semibold">
                {commission.targetCompletionAt
                  ? formatDate(commission.targetCompletionAt)
                  : "To be confirmed"}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <CreditCard className="text-brass" size={18} aria-hidden="true" />
            <div>
              <p className="text-porcelain/50 text-xs">Final payment</p>
              <p className="mt-1 text-sm font-semibold">
                {paymentSucceeded
                  ? "Verified"
                  : humanizeStatus(payment?.status ?? "not_started")}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <FileCheck2 className="text-brass" size={18} aria-hidden="true" />
            <div>
              <p className="text-porcelain/50 text-xs">Included revisions</p>
              <p className="mt-1 text-sm font-semibold">
                {commission.usedRevisionRounds} of{" "}
                {commission.includedRevisionRounds} used
              </p>
            </div>
          </div>
        </div>
      </section>

      {paymentReturnState ? (
        <Card
          className={
            paymentReturnState === "processing"
              ? "border-blue-300 bg-blue-50 p-5 text-blue-950"
              : "border-amber-300 bg-amber-50 p-5 text-amber-950"
          }
          role="status"
        >
          <p className="font-semibold">
            {paymentReturnState === "processing"
              ? "Payment is processing"
              : "Checkout was cancelled"}
          </p>
          <p className="mt-1 text-sm leading-6">
            {paymentReturnState === "processing"
              ? "Stripe is confirming your final payment. This page will reflect the verified webhook status."
              : "No new payment was completed. You may safely reopen checkout when ready."}
          </p>
        </Card>
      ) : null}

      {unsupportedDeposit ? (
        <Card className="border-red-300 bg-red-50 p-6" role="alert">
          <h2 className="font-display text-3xl text-red-950">
            Historical deposit requires correction
          </h2>
          <p className="mt-2 leading-7 text-red-900">
            This commission contains a nonzero deposit and cannot enter the
            final-payment-only checkout flow. Contact the atelier for a
            corrected immutable record.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="p-6">
          <p className="eyebrow">Progress</p>
          <h2 className="font-display mt-2 text-4xl">Atelier timeline</h2>
          <div className="mt-7">
            <CommissionTimeline
              events={commission.timeline.map((event, index) => ({
                id: event.id,
                title: humanizeStatus(event.toStatus),
                description:
                  event.reason ??
                  `Status recorded by ${humanizeStatus(event.actor)}.`,
                occurredAt: event.occurredAt,
                status:
                  index === commission.timeline.length - 1
                    ? "current"
                    : "completed",
              }))}
            />
          </div>
        </Card>

        <Card className="p-6">
          <p className="eyebrow">Accepted scope</p>
          <h2 className="font-display mt-2 text-4xl">The commission record</h2>
          <dl className="mt-6 grid gap-5 text-sm">
            <div>
              <dt className="font-semibold">Production window</dt>
              <dd className="text-stone mt-1">
                {commission.acceptedProductionWeeks} weeks
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Accepted on</dt>
              <dd className="text-stone mt-1">
                {formatDate(commission.acceptedAt)}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Terms</dt>
              <dd className="text-stone mt-2 leading-6 whitespace-pre-wrap">
                {commission.acceptedTerms}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <section>
        <p className="eyebrow">Design review</p>
        <h2 className="font-display mt-2 text-4xl">Versioned draft record</h2>
        {latestDraft ? (
          <Card className="mt-5 overflow-hidden">
            <div className="border-ink/10 bg-parchment/45 border-b p-6">
              <div className="flex flex-wrap items-center gap-3">
                <Badge>
                  Draft {latestDraft.draftSequence} · revision{" "}
                  {latestDraft.revisionNumber}
                </Badge>
                <StatusPill tone={statusTone(latestDraft.status)}>
                  {humanizeStatus(latestDraft.status)}
                </StatusPill>
              </div>
              <h3 className="font-display mt-4 text-4xl">
                {latestDraft.title}
              </h3>
              <p className="text-stone mt-3 leading-7">{latestDraft.summary}</p>
              {latestDraft.customerMessage ? (
                <blockquote className="border-garnet text-stone mt-5 border-l-2 pl-4 text-sm leading-6 italic">
                  {latestDraft.customerMessage}
                </blockquote>
              ) : null}
            </div>
            <div className="p-6">
              <h4 className="font-semibold">Review assets</h4>
              {latestDraft.assets.length > 0 ? (
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {latestDraft.assets.map((asset) => (
                    <li key={asset.id}>
                      <AttachmentLink {...asset} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-stone mt-2 text-sm">
                  This revision contains specifications and notes only.
                </p>
              )}
              {latestDraft.status === "shared" &&
              commission.status === "draft_review" ? (
                <div className="mt-6">
                  <DraftDecisionForms
                    commissionId={commission.id}
                    revisionId={latestDraft.id}
                    version={latestDraft.revisionNumber}
                    approveAction={approveAction}
                    revisionAction={revisionAction}
                    feedbackId={randomUUID()}
                    approvalFeedbackId={randomUUID()}
                    remainingRevisions={remainingRevisions}
                  />
                </div>
              ) : (
                <p className="bg-parchment/50 text-stone mt-5 rounded-xl p-4 text-sm">
                  {latestDraft.status === "approved"
                    ? "This exact revision is approved and immutable."
                    : "Decision controls appear when the atelier shares a revision for review."}
                </p>
              )}
            </div>
          </Card>
        ) : (
          <div className="border-ink/20 text-stone mt-5 rounded-2xl border border-dashed p-7">
            The atelier has not shared a draft yet.
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <p className="eyebrow">Payment</p>
          <h2 className="font-display mt-2 text-3xl">Verified final payment</h2>
          <p className="text-stone mt-3 text-sm leading-6">
            {unsupportedDeposit
              ? "Checkout is disabled because this historical record contains an unsupported deposit."
              : paymentSucceeded
                ? "The final payment is verified. Released deliverables are now available."
                : commission.status === "final_payment_due"
                  ? "Your commission is ready for final payment through Stripe Checkout."
                  : "Checkout becomes available only when the atelier marks the final payment ready."}
          </p>
          {commission.status === "final_payment_due" &&
          !paymentSucceeded &&
          !unsupportedDeposit ? (
            <div className="mt-5">
              <CheckoutButton commissionId={commission.id} />
              <p className="text-stone mt-3 text-xs">
                Stripe returns to /app/commissions/{commission.id}.
              </p>
            </div>
          ) : (
            <p className="text-stone mt-5 text-xs font-semibold tracking-[0.14em] uppercase">
              Checkout unavailable in the current status
            </p>
          )}
        </Card>

        {commission.deliverables.length > 0 ? (
          commission.deliverables.map((deliverable) => (
            <DeliverablePanel
              key={deliverable.id}
              locked={false}
              title={deliverable.title}
              description={
                deliverable.description ??
                `${deliverable.fileName} · version ${deliverable.version}`
              }
              openHref={`/api/deliverables/${deliverable.id}/open`}
            />
          ))
        ) : (
          <DeliverablePanel
            locked
            title="Final deliverables"
            description="Your final package will be released here after verified payment."
            reason={
              paymentSucceeded
                ? "Payment is verified; the atelier is preparing your final files."
                : "Final files remain locked until payment is verified and the atelier releases them."
            }
          />
        )}
      </section>

      {commission.status === "delivered" ||
      commission.status === "aftercare" ? (
        <section className="space-y-5">
          <div>
            <p className="eyebrow">Aftercare cases</p>
            <h2 className="font-display mt-2 text-4xl">
              {commission.status === "delivered"
                ? "Start aftercare"
                : "Complete the care record"}
            </h2>
          </div>
          {commission.status === "aftercare"
            ? commission.aftercareCases.map((aftercareCase) => (
                <Card key={aftercareCase.id} className="p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="font-display text-3xl">
                        {aftercareCase.subject}
                      </h3>
                      <p className="text-stone mt-2 text-sm leading-6">
                        {aftercareCase.description}
                      </p>
                      <p className="text-stone mt-2 text-xs">
                        Opened {formatDate(aftercareCase.openedAt)}
                      </p>
                    </div>
                    <StatusPill tone={statusTone(aftercareCase.status)}>
                      {humanizeStatus(aftercareCase.status)}
                    </StatusPill>
                  </div>
                  {aftercareCase.status === "open" ||
                  aftercareCase.status === "in_progress" ? (
                    <div className="mt-5">
                      <CompleteAftercareCaseForm
                        commissionId={commission.id}
                        caseId={aftercareCase.id}
                        idempotencyKey={randomUUID()}
                        action={completeAftercareAction}
                      />
                    </div>
                  ) : aftercareCase.resolution ? (
                    <p className="bg-parchment/45 text-stone mt-4 rounded-xl p-4 text-sm">
                      Resolution: {aftercareCase.resolution}
                    </p>
                  ) : null}
                </Card>
              ))
            : null}
          <OpenAftercareCaseForm
            commissionId={commission.id}
            clientRequestId={randomUUID()}
            idempotencyKey={randomUUID()}
            action={openAftercareAction}
          />
        </section>
      ) : null}
    </div>
  );
}
