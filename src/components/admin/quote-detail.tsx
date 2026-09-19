"use client";

import { CopyPlus, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { ActionMessage } from "@/components/forms/action-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { humanizeStatus, statusTone } from "@/features/application/status";
import type { CounterofferDto, QuoteDetailDto } from "@/lib/data/types";
import { formatDate, formatMoney } from "@/lib/utils";
import { initialActionResult, type ActionResult } from "@/types/actions";

type Action = (
  previousState: ActionResult,
  formData: FormData,
) => Promise<ActionResult>;

function CounterofferDecision({
  counteroffer,
  idempotencyKey,
  action,
}: {
  counteroffer: CounterofferDto;
  idempotencyKey: string;
  action: Action;
}) {
  const [state, formAction] = useActionState(action, initialActionResult);
  return (
    <form action={formAction} className="mt-4 grid gap-3">
      <input type="hidden" name="counterofferId" value={counteroffer.id} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <ActionMessage result={state} />
      <div className="grid gap-2">
        <Label htmlFor={`response-${counteroffer.id}`}>Response note</Label>
        <Textarea
          id={`response-${counteroffer.id}`}
          name="responseNote"
          maxLength={5_000}
        />
      </div>
      <div className="flex gap-3">
        <SubmitButton name="decision" value="accepted" pendingLabel="Saving…">
          Accept proposal
        </SubmitButton>
        <SubmitButton
          name="decision"
          value="declined"
          variant="danger"
          pendingLabel="Saving…"
        >
          Decline proposal
        </SubmitButton>
      </div>
    </form>
  );
}

export function AdminQuoteDetail({
  quote,
  sendAction,
  sendIdempotencyKey,
  quoteValidityDays,
  decisionIdempotencyKeys,
  decisionAction,
}: {
  quote: QuoteDetailDto;
  sendAction: Action;
  sendIdempotencyKey: string;
  quoteValidityDays: number | null;
  decisionIdempotencyKeys: Record<string, string>;
  decisionAction: Action;
}) {
  const [state, formAction] = useActionState(sendAction, initialActionResult);
  const unsupportedDeposit =
    quote.options.some((option) => option.depositMinor !== 0) ||
    quote.counteroffers.some(
      (counteroffer) => counteroffer.proposedDepositMinor !== 0,
    );
  return (
    <div className="space-y-7">
      {unsupportedDeposit ? (
        <Card className="border-red-300 bg-red-50 p-5" role="alert">
          <h2 className="font-display text-3xl text-red-950">
            Historical deposit requires correction
          </h2>
          <p className="mt-2 text-sm leading-6 text-red-900">
            This record contains a nonzero deposit. It cannot be sent, accepted,
            or treated as a reduced final payment in the final-payment-only
            workflow.
          </p>
        </Card>
      ) : null}
      <Card className="overflow-hidden">
        <div className="bg-ink text-porcelain flex flex-col gap-5 p-7 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Badge className="border-brass/40 text-brass bg-transparent">
              Version {quote.version}
            </Badge>
            <h1 className="font-display mt-4 text-5xl">{quote.title}</h1>
            <p className="text-porcelain/65 mt-3">
              {quote.options.length} option
              {quote.options.length === 1 ? "" : "s"} · {quote.productionWeeks}{" "}
              weeks
            </p>
          </div>
          <StatusPill tone={statusTone(quote.status)}>
            {humanizeStatus(quote.status)}
          </StatusPill>
        </div>
        <div className="p-6">
          {quote.status === "draft" ? (
            unsupportedDeposit ? (
              <p className="rounded-xl bg-red-50 p-4 text-sm text-red-900">
                Sending is disabled until this quote is replaced with a
                zero-deposit version.
              </p>
            ) : quoteValidityDays === null ? (
              <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                Publish a valid quote validity setting before sending.
              </p>
            ) : (
              <form action={formAction} className="grid gap-4 sm:max-w-md">
                <input type="hidden" name="quoteId" value={quote.id} />
                <input
                  type="hidden"
                  name="idempotencyKey"
                  value={sendIdempotencyKey}
                />
                <ActionMessage result={state} />
                <p className="text-stone text-sm">
                  This quote will remain valid for {quoteValidityDays} day
                  {quoteValidityDays === 1 ? "" : "s"}.
                </p>
                <SubmitButton pendingLabel="Sending quote…">
                  <Send aria-hidden="true" size={17} />
                  Send immutable version
                </SubmitButton>
              </form>
            )
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-stone flex items-center gap-2 text-sm">
                <ShieldCheck aria-hidden="true" size={17} />
                Sent versions are immutable
                {quote.sentAt ? ` · ${formatDate(quote.sentAt)}` : ""}
              </p>
              <Button asChild variant="secondary">
                <Link
                  href={`/admin/requests/${quote.designRequestId}/quotes/new?source=${quote.id}`}
                >
                  <CopyPlus aria-hidden="true" size={17} />
                  Create revision
                </Link>
              </Button>
            </div>
          )}
        </div>
      </Card>

      <section className="grid gap-5 lg:grid-cols-2">
        {quote.options.map((option) => (
          <Card key={option.id} className="p-6">
            <h2 className="font-display text-3xl">{option.title}</h2>
            <p className="text-stone mt-3 leading-7">{option.description}</p>
            <p className="font-display mt-5 text-4xl">
              {formatMoney(option.totalMinor, option.currency)}
            </p>
            <p className="text-stone mt-1 text-sm">
              Final payment · deposit disabled
            </p>
            <ul className="divide-ink/10 border-ink/10 mt-5 divide-y border-y">
              {option.lineItems.map((line, index) => (
                <li
                  key={`${option.id}-${index}`}
                  className="flex justify-between gap-4 py-3 text-sm"
                >
                  <span>{line.description}</span>
                  <span className="font-semibold">
                    {formatMoney(line.amountMinor, option.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </section>

      {quote.counteroffers.length > 0 ? (
        <section>
          <p className="eyebrow">Negotiation ledger</p>
          <h2 className="font-display mt-2 text-4xl">Counteroffers</h2>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {quote.counteroffers.map((counteroffer) => (
              <Card key={counteroffer.id} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-display text-3xl">
                      {formatMoney(
                        counteroffer.proposedTotalMinor,
                        counteroffer.currency,
                      )}
                    </p>
                    <p className="text-stone mt-1 text-xs">
                      {counteroffer.optionTitle} · proposal version{" "}
                      {counteroffer.version} ·{" "}
                      {formatDate(counteroffer.submittedAt)}
                    </p>
                    <p className="text-stone mt-2 text-sm leading-6">
                      {counteroffer.note}
                    </p>
                  </div>
                  <StatusPill tone={statusTone(counteroffer.status)}>
                    {humanizeStatus(counteroffer.status)}
                  </StatusPill>
                </div>
                <dl className="border-ink/10 mt-4 grid gap-3 border-y py-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold">Original total</dt>
                    <dd className="text-stone mt-1">
                      {formatMoney(
                        counteroffer.originalTotalMinor,
                        counteroffer.currency,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Total difference</dt>
                    <dd className="text-stone mt-1">
                      {formatMoney(
                        counteroffer.totalDifferenceMinor,
                        counteroffer.currency,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Derived deposit</dt>
                    <dd className="text-stone mt-1">
                      {formatMoney(
                        counteroffer.proposedDepositMinor,
                        counteroffer.currency,
                      )}
                      <span className="mt-1 block text-xs">
                        Original{" "}
                        {formatMoney(
                          counteroffer.originalDepositMinor,
                          counteroffer.currency,
                        )}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Deposit difference</dt>
                    <dd className="text-stone mt-1">
                      {formatMoney(
                        counteroffer.depositDifferenceMinor,
                        counteroffer.currency,
                      )}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="font-semibold">Server-derived scope</dt>
                    <dd className="bg-parchment/45 text-stone mt-2 overflow-x-auto rounded-xl p-3 font-mono text-xs whitespace-pre-wrap">
                      {JSON.stringify(counteroffer.proposedScope, null, 2)}
                    </dd>
                  </div>
                </dl>
                {counteroffer.status === "pending" && !unsupportedDeposit ? (
                  <CounterofferDecision
                    counteroffer={counteroffer}
                    idempotencyKey={
                      decisionIdempotencyKeys[counteroffer.id] ?? ""
                    }
                    action={decisionAction}
                  />
                ) : (
                  <div className="mt-4 text-sm">
                    <p className="font-semibold">
                      Decision:{" "}
                      {counteroffer.decision
                        ? humanizeStatus(counteroffer.decision.decision)
                        : humanizeStatus(counteroffer.status)}
                    </p>
                    <p className="text-stone mt-1">
                      {counteroffer.decision?.note ??
                        "This proposal has been resolved."}
                    </p>
                    {counteroffer.decision ? (
                      <p className="text-stone mt-2 text-xs">
                        {formatDate(counteroffer.decision.decidedAt)}
                      </p>
                    ) : null}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <Card className="p-6">
        <h2 className="font-display text-3xl">Version terms</h2>
        <p className="text-stone mt-4 leading-7 whitespace-pre-wrap">
          {quote.terms}
        </p>
      </Card>
    </div>
  );
}
