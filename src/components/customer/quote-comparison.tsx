"use client";

import { Check, Clock3, Scale, X } from "lucide-react";
import { useActionState } from "react";

import { ActionMessage } from "@/components/forms/action-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { humanizeStatus, statusTone } from "@/features/application/status";
import { PROVIDER_AMOUNT_MAX_MAJOR } from "@/features/application/payment-amount";
import type { QuoteDetailDto } from "@/lib/data/types";
import { formatDate, formatMoney } from "@/lib/utils";
import { initialActionResult, type ActionResult } from "@/types/actions";

type Action = (
  previousState: ActionResult,
  formData: FormData,
) => Promise<ActionResult>;
type AcceptAction = (
  previousState: ActionResult<{ commissionId: string }>,
  formData: FormData,
) => Promise<ActionResult<{ commissionId: string }>>;

function OptionActions({
  quote,
  optionId,
  idempotencyKey,
  counterofferIdempotencyKey,
  acceptAction,
  counterofferAction,
  disabledReason,
}: {
  quote: QuoteDetailDto;
  optionId: string;
  idempotencyKey: string;
  counterofferIdempotencyKey: string;
  acceptAction: AcceptAction;
  counterofferAction: Action;
  disabledReason: string | null;
}) {
  const [acceptState, acceptFormAction] = useActionState(acceptAction, {
    ...initialActionResult,
  } as ActionResult<{ commissionId: string }>);
  const [counterState, counterFormAction] = useActionState(
    counterofferAction,
    initialActionResult,
  );

  if (disabledReason) {
    return (
      <p className="border-ink/10 bg-parchment/45 text-stone rounded-xl border p-4 text-sm leading-6">
        {disabledReason}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <form action={acceptFormAction}>
        <input type="hidden" name="quoteId" value={quote.id} />
        <input type="hidden" name="optionId" value={optionId} />
        <input type="hidden" name="counterofferId" value="" />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <ActionMessage
          result={
            acceptState.ok
              ? { ok: true, message: acceptState.message }
              : acceptState
          }
        />
        <SubmitButton className="mt-3 w-full" pendingLabel="Accepting…">
          <Check aria-hidden="true" size={17} />
          Accept this option
        </SubmitButton>
      </form>
      <details className="border-ink/10 bg-parchment/25 rounded-xl border p-4">
        <summary className="text-garnet cursor-pointer text-sm font-semibold">
          Propose a counteroffer
        </summary>
        <form action={counterFormAction} className="mt-5 grid gap-4">
          <input type="hidden" name="quoteId" value={quote.id} />
          <input type="hidden" name="optionId" value={optionId} />
          <input
            type="hidden"
            name="idempotencyKey"
            value={counterofferIdempotencyKey}
          />
          <ActionMessage result={counterState} />
          <div className="grid gap-2">
            <Label htmlFor={`amount-${optionId}`}>
              Proposed amount ({quote.currency})
            </Label>
            <Input
              id={`amount-${optionId}`}
              name="amount"
              type="number"
              min="0.01"
              max={PROVIDER_AMOUNT_MAX_MAJOR}
              step="0.01"
              required
            />
            <p className="text-stone text-xs">
              Enter an amount from 0.01 through 999,999.99.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`explanation-${optionId}`}>
              Priorities behind the proposal
            </Label>
            <Textarea
              id={`explanation-${optionId}`}
              name="explanation"
              required
              maxLength={2_000}
            />
          </div>
          <SubmitButton pendingLabel="Sending…">
            <Scale aria-hidden="true" size={17} />
            Send proposal
          </SubmitButton>
        </form>
      </details>
    </div>
  );
}

function AcceptedCounterofferAction({
  quoteId,
  counterofferId,
  idempotencyKey,
  action,
  disabledReason,
}: {
  quoteId: string;
  counterofferId: string;
  idempotencyKey: string;
  action: AcceptAction;
  disabledReason: string | null;
}) {
  const [state, formAction] = useActionState(action, {
    ...initialActionResult,
  } as ActionResult<{ commissionId: string }>);
  if (disabledReason) {
    return (
      <p className="border-ink/10 bg-parchment/45 text-stone mt-4 rounded-xl border p-4 text-sm">
        {disabledReason}
      </p>
    );
  }
  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="optionId" value="" />
      <input type="hidden" name="counterofferId" value={counterofferId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <ActionMessage
        result={state.ok ? { ok: true, message: state.message } : state}
      />
      <SubmitButton className="mt-3" pendingLabel="Accepting negotiated terms…">
        <Check aria-hidden="true" size={17} />
        Accept this negotiated offer
      </SubmitButton>
    </form>
  );
}

export function QuoteComparison({
  quote,
  idempotencyKeys,
  counterofferIdempotencyKeys,
  counterofferAcceptanceKeys,
  acceptAction,
  counterofferAction,
  declineAction,
  declineIdempotencyKey,
}: {
  quote: QuoteDetailDto;
  idempotencyKeys: Record<string, string>;
  counterofferIdempotencyKeys: Record<string, string>;
  counterofferAcceptanceKeys: Record<string, string>;
  acceptAction: AcceptAction;
  counterofferAction: Action;
  declineAction: Action;
  declineIdempotencyKey: string;
}) {
  const [declineState, declineFormAction] = useActionState(
    declineAction,
    initialActionResult,
  );
  const active =
    quote.isLatest &&
    ["sent", "viewed", "countered"].includes(quote.status) &&
    Boolean(quote.validUntil);
  const unsupportedDeposit =
    quote.options.some((option) => option.depositMinor !== 0) ||
    quote.counteroffers.some(
      (counteroffer) => counteroffer.proposedDepositMinor !== 0,
    );
  const disabledReason = unsupportedDeposit
    ? "This historical quote contains a nonzero deposit and cannot be accepted in the final-payment-only workflow. Contact the atelier for a corrected quote."
    : !quote.isLatest
      ? "A newer quote version supersedes this one."
      : !active
        ? "This quote is no longer available for a decision."
        : null;

  return (
    <div className="space-y-8">
      <Card className="bg-ink text-porcelain relative overflow-hidden p-7 sm:p-9">
        <div
          aria-hidden="true"
          className="border-brass/30 absolute -top-16 -right-12 size-60 rotate-12 border"
        />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Badge className="border-brass/40 text-brass bg-transparent">
              Quote version {quote.version}
            </Badge>
            <h1 className="workspace-title mt-5">{quote.title}</h1>
            {quote.introduction ? (
              <p className="text-porcelain/70 mt-4 max-w-2xl leading-7">
                {quote.introduction}
              </p>
            ) : null}
          </div>
          <StatusPill tone={statusTone(quote.status)}>
            {humanizeStatus(quote.status)}
          </StatusPill>
        </div>
        <div className="text-porcelain/65 relative mt-7 flex flex-wrap gap-5 text-sm">
          <span className="flex items-center gap-2">
            <Clock3 aria-hidden="true" size={16} />
            {quote.productionWeeks} production weeks
          </span>
          <span>
            {quote.validUntil
              ? `Valid through ${formatDate(quote.validUntil)}`
              : "Not yet sent"}
          </span>
        </div>
      </Card>

      <section>
        <p className="eyebrow">Choose the expression</p>
        <h2 className="font-display mt-2 text-4xl">Options in this version</h2>
        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          {quote.options.map((option, index) => (
            <Card
              key={option.id}
              className={
                index === 0
                  ? "border-garnet/35 ring-garnet/10 relative p-6 ring-1"
                  : "p-6"
              }
            >
              {index === 0 ? (
                <Badge className="bg-garnet absolute -top-3 left-6 text-white">
                  Atelier recommendation
                </Badge>
              ) : null}
              <h3 className="font-display text-3xl">{option.title}</h3>
              <p className="text-stone mt-3 leading-7">{option.description}</p>
              <p className="font-display mt-6 text-4xl">
                {formatMoney(option.totalMinor, option.currency)}
              </p>
              <p className="text-stone mt-1 text-sm">
                Final payment · deposits are not supported
              </p>
              <dl className="border-ink/10 mt-6 grid gap-4 border-y py-5 text-sm">
                <div>
                  <dt className="font-semibold">Scope</dt>
                  <dd className="text-stone mt-1">{option.scope}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Materials</dt>
                  <dd className="text-stone mt-1">{option.materials}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Stones</dt>
                  <dd className="text-stone mt-1">{option.stoneAssumptions}</dd>
                </div>
              </dl>
              <p className="text-stone mt-4 text-sm">
                {option.includedRevisionRounds} included revisions ·{" "}
                {option.estimatedCompletionDays} estimated days
              </p>
              <div className="mt-6">
                <OptionActions
                  quote={quote}
                  optionId={option.id}
                  idempotencyKey={idempotencyKeys[option.id] ?? ""}
                  counterofferIdempotencyKey={
                    counterofferIdempotencyKeys[option.id] ?? ""
                  }
                  acceptAction={acceptAction}
                  counterofferAction={counterofferAction}
                  disabledReason={
                    disabledReason ??
                    (quote.counteroffers.some(
                      (counteroffer) => counteroffer.status === "accepted",
                    )
                      ? "An accepted counteroffer supersedes the original quote options. Accept the negotiated offer below."
                      : null)
                  }
                />
              </div>
            </Card>
          ))}
        </div>
      </section>

      {quote.counteroffers.length > 0 ? (
        <section>
          <h2 className="font-display text-4xl">Counteroffer history</h2>
          <div className="mt-5 space-y-3">
            {quote.counteroffers.map((counteroffer) => (
              <Card
                key={counteroffer.id}
                className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div>
                  <p className="font-semibold">
                    {formatMoney(
                      counteroffer.proposedTotalMinor,
                      counteroffer.currency,
                    )}
                  </p>
                  <p className="text-stone mt-1 text-xs">
                    Negotiated final payment
                  </p>
                  <p className="text-stone mt-1 text-sm">{counteroffer.note}</p>
                  <p className="text-stone mt-2 text-xs">
                    Sent {formatDate(counteroffer.submittedAt)}
                  </p>
                </div>
                <StatusPill tone={statusTone(counteroffer.status)}>
                  {humanizeStatus(counteroffer.status)}
                </StatusPill>
                {counteroffer.status === "accepted" ? (
                  <div className="sm:col-span-2">
                    <AcceptedCounterofferAction
                      quoteId={quote.id}
                      counterofferId={counteroffer.id}
                      idempotencyKey={
                        counterofferAcceptanceKeys[counteroffer.id] ?? ""
                      }
                      action={acceptAction}
                      disabledReason={disabledReason}
                    />
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <Card className="p-6">
        <h2 className="font-display text-3xl">Terms held with this version</h2>
        <p className="text-stone mt-4 leading-7 whitespace-pre-wrap">
          {quote.terms}
        </p>
        {active ? (
          <form
            action={declineFormAction}
            className="border-ink/10 mt-7 border-t pt-5"
          >
            <input type="hidden" name="quoteId" value={quote.id} />
            <input
              type="hidden"
              name="idempotencyKey"
              value={declineIdempotencyKey}
            />
            <ActionMessage result={declineState} />
            <p className="text-stone mt-3 text-sm leading-6">
              Declining this quote does not close your design inquiry. The
              atelier may prepare a corrected or revised quote.
            </p>
            <Button className="mt-3" type="submit" variant="danger">
              <X aria-hidden="true" size={17} />
              Decline this quote
            </Button>
          </form>
        ) : (
          <p className="bg-parchment/50 text-stone mt-6 rounded-xl p-4 text-sm">
            {disabledReason}
          </p>
        )}
      </Card>
    </div>
  );
}
