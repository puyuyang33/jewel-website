"use client";

import { CopyPlus, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { ActionMessage } from "@/components/forms/action-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/field";
import { PROVIDER_AMOUNT_MAX_MAJOR } from "@/features/application/payment-amount";
import type { QuoteDetailDto } from "@/lib/data/types";
import { initialActionResult, type ActionResult } from "@/types/actions";

interface BuilderLineItem {
  description: string;
  amount: string;
}

interface BuilderOption {
  key: string;
  title: string;
  description: string;
  scope: string;
  materials: string;
  stoneAssumptions: string;
  deliverables: string;
  includedRevisionRounds: string;
  estimatedCompletionDays: string;
  lineItems: BuilderLineItem[];
}

function blankOption(index: number): BuilderOption {
  return {
    key: `new-option-${index}`,
    title: `Option ${index + 1}`,
    description: "",
    scope: "",
    materials: "",
    stoneAssumptions: "",
    deliverables: "Final design package and care guide",
    includedRevisionRounds: "2",
    estimatedCompletionDays: "84",
    lineItems: [{ description: "Design and fabrication", amount: "" }],
  };
}

function sourceOptions(source?: QuoteDetailDto): BuilderOption[] {
  if (!source || source.options.length === 0) {
    return [blankOption(0)];
  }
  return source.options.map((option, index) => ({
    key: `${option.id}-${index}`,
    title: option.title,
    description: option.description,
    scope: option.scope,
    materials: option.materials,
    stoneAssumptions: option.stoneAssumptions,
    deliverables: option.deliverables,
    includedRevisionRounds: String(option.includedRevisionRounds),
    estimatedCompletionDays: String(option.estimatedCompletionDays),
    lineItems:
      option.lineItems.length > 0
        ? option.lineItems.map((lineItem) => ({
            description: lineItem.description,
            amount: (lineItem.amountMinor / 100).toFixed(2),
          }))
        : [
            {
              description: "Design and fabrication",
              amount: (option.totalMinor / 100).toFixed(2),
            },
          ],
  }));
}

export function QuoteBuilder({
  requestId,
  source,
  action,
}: {
  requestId: string;
  source?: QuoteDetailDto;
  action: (
    previousState: ActionResult<{ quoteId: string }>,
    formData: FormData,
  ) => Promise<ActionResult<{ quoteId: string }>>;
}) {
  const unsupportedSourceDeposit = source?.options.some(
    (option) => option.depositMinor !== 0,
  );
  const [state, formAction] = useActionState(action, {
    ...initialActionResult,
  } as ActionResult<{ quoteId: string }>);
  const [options, setOptions] = useState<BuilderOption[]>(() =>
    sourceOptions(source),
  );

  if (unsupportedSourceDeposit) {
    return (
      <Card className="border-red-300 bg-red-50 p-6" role="alert">
        <h2 className="font-display text-3xl text-red-950">
          Historical deposit is unsupported
        </h2>
        <p className="mt-3 leading-7 text-red-900">
          This quote contains a nonzero deposit and cannot be revised in the
          zero-deposit workflow. Create a fresh quote from the request instead.
        </p>
      </Card>
    );
  }

  function updateOption(
    optionIndex: number,
    field: keyof Omit<BuilderOption, "key" | "lineItems">,
    value: string,
  ) {
    setOptions((current) =>
      current.map((option, index) =>
        index === optionIndex ? { ...option, [field]: value } : option,
      ),
    );
  }

  function updateLine(
    optionIndex: number,
    lineIndex: number,
    field: keyof BuilderLineItem,
    value: string,
  ) {
    setOptions((current) =>
      current.map((option, index) =>
        index === optionIndex
          ? {
              ...option,
              lineItems: option.lineItems.map((line, nestedIndex) =>
                nestedIndex === lineIndex ? { ...line, [field]: value } : line,
              ),
            }
          : option,
      ),
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="sourceQuoteId" value={source?.id ?? ""} />
      <input
        type="hidden"
        name="options"
        value={JSON.stringify(
          options.map((option) => ({
            title: option.title,
            description: option.description,
            scope: option.scope,
            materials: option.materials,
            stoneAssumptions: option.stoneAssumptions,
            deliverables: option.deliverables,
            includedRevisionRounds: option.includedRevisionRounds,
            estimatedCompletionDays: option.estimatedCompletionDays,
            lineItems: option.lineItems,
          })),
        )}
      />
      <ActionMessage
        result={state.ok ? { ok: true, message: state.message } : state}
      />
      {state.ok && state.data ? (
        <Link
          href={`/admin/quotes/${state.data.quoteId}`}
          className="text-garnet inline-flex items-center gap-2 font-semibold hover:underline"
        >
          Open the saved quote draft
        </Link>
      ) : null}

      <Card className="grid gap-5 p-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="eyebrow">
            {source ? `Revision of version ${source.version}` : "New quote"}
          </p>
          <h2 className="font-display mt-2 text-4xl">Commercial frame</h2>
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="quote-title">Quote title</Label>
          <Input
            id="quote-title"
            name="title"
            defaultValue={source?.title ?? ""}
            required
            maxLength={200}
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="quote-introduction">Introduction</Label>
          <Textarea
            id="quote-introduction"
            name="introduction"
            defaultValue={source?.introduction ?? ""}
            maxLength={5_000}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="quote-currency">Currency</Label>
          <select
            id="quote-currency"
            name="currency"
            defaultValue={source?.currency ?? "USD"}
            className="border-ink/15 min-h-12 rounded-xl border bg-white px-4"
          >
            <option value="USD">USD</option>
            <option value="CAD">CAD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="production-weeks">Production weeks</Label>
          <Input
            id="production-weeks"
            name="productionWeeks"
            type="number"
            min={1}
            max={104}
            defaultValue={source?.productionWeeks ?? 12}
            required
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="quote-terms">Terms</Label>
          <Textarea
            id="quote-terms"
            name="terms"
            defaultValue={source?.terms ?? ""}
            required
            maxLength={10_000}
          />
        </div>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Comparative options</p>
          <h2 className="font-display mt-2 text-4xl">Scope & line items</h2>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            setOptions((current) => [...current, blankOption(current.length)])
          }
        >
          <CopyPlus aria-hidden="true" size={17} />
          Add option
        </Button>
      </div>

      {options.map((option, optionIndex) => (
        <Card key={option.key} className="p-6">
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-display text-3xl">Option {optionIndex + 1}</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={options.length === 1}
              onClick={() =>
                setOptions((current) =>
                  current.filter((_, index) => index !== optionIndex),
                )
              }
            >
              <Trash2 aria-hidden="true" size={16} />
              Remove
            </Button>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {[
              ["title", "Option title"],
              ["description", "Short description"],
              ["scope", "Scope"],
              ["materials", "Materials"],
              ["stoneAssumptions", "Stone assumptions"],
              ["deliverables", "Deliverables"],
            ].map(([field, label]) => (
              <div
                className={`grid gap-2 ${
                  ["description", "scope"].includes(field ?? "")
                    ? "sm:col-span-2"
                    : ""
                }`}
                key={field}
              >
                <Label htmlFor={`${field}-${option.key}`}>{label}</Label>
                {["description", "scope"].includes(field ?? "") ? (
                  <Textarea
                    id={`${field}-${option.key}`}
                    value={option[field as keyof BuilderOption] as string}
                    onChange={(event) =>
                      updateOption(
                        optionIndex,
                        field as keyof Omit<BuilderOption, "key" | "lineItems">,
                        event.target.value,
                      )
                    }
                    required
                  />
                ) : (
                  <Input
                    id={`${field}-${option.key}`}
                    value={option[field as keyof BuilderOption] as string}
                    onChange={(event) =>
                      updateOption(
                        optionIndex,
                        field as keyof Omit<BuilderOption, "key" | "lineItems">,
                        event.target.value,
                      )
                    }
                    required
                  />
                )}
              </div>
            ))}
            <div className="grid gap-2">
              <Label htmlFor={`revisions-${option.key}`}>
                Included revisions
              </Label>
              <Input
                id={`revisions-${option.key}`}
                type="number"
                min={0}
                max={100}
                value={option.includedRevisionRounds}
                onChange={(event) =>
                  updateOption(
                    optionIndex,
                    "includedRevisionRounds",
                    event.target.value,
                  )
                }
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`duration-${option.key}`}>Estimated days</Label>
              <Input
                id={`duration-${option.key}`}
                type="number"
                min={1}
                max={3650}
                value={option.estimatedCompletionDays}
                onChange={(event) =>
                  updateOption(
                    optionIndex,
                    "estimatedCompletionDays",
                    event.target.value,
                  )
                }
                required
              />
            </div>
          </div>

          <div className="border-ink/10 mt-6 border-t pt-5">
            <div className="flex items-center justify-between gap-4">
              <h4 className="font-semibold">Line items</h4>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  setOptions((current) =>
                    current.map((candidate, index) =>
                      index === optionIndex
                        ? {
                            ...candidate,
                            lineItems: [
                              ...candidate.lineItems,
                              { description: "", amount: "" },
                            ],
                          }
                        : candidate,
                    ),
                  )
                }
              >
                <Plus aria-hidden="true" size={16} />
                Add line
              </Button>
            </div>
            <div className="mt-3 space-y-3">
              {option.lineItems.map((line, lineIndex) => (
                <div
                  key={`${option.key}-line-${lineIndex}`}
                  className="grid gap-3 sm:grid-cols-[1fr_12rem_auto]"
                >
                  <Input
                    aria-label={`Option ${optionIndex + 1} line description`}
                    value={line.description}
                    onChange={(event) =>
                      updateLine(
                        optionIndex,
                        lineIndex,
                        "description",
                        event.target.value,
                      )
                    }
                    required
                    maxLength={120}
                    placeholder="Design, stones, fabrication"
                  />
                  <Input
                    aria-label={`Option ${optionIndex + 1} line amount`}
                    value={line.amount}
                    onChange={(event) =>
                      updateLine(
                        optionIndex,
                        lineIndex,
                        "amount",
                        event.target.value,
                      )
                    }
                    type="number"
                    required
                    min="0.01"
                    max={PROVIDER_AMOUNT_MAX_MAJOR}
                    step="0.01"
                    placeholder="0.00"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Remove line item"
                    disabled={option.lineItems.length === 1}
                    onClick={() =>
                      setOptions((current) =>
                        current.map((candidate, index) =>
                          index === optionIndex
                            ? {
                                ...candidate,
                                lineItems: candidate.lineItems.filter(
                                  (_, nestedIndex) => nestedIndex !== lineIndex,
                                ),
                              }
                            : candidate,
                        ),
                      )
                    }
                  >
                    <Trash2 aria-hidden="true" size={16} />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-stone mt-4 text-xs">
              Final payment is recomputed server-side from line items. Deposits
              are not supported. Each line and the option total must stay
              between 0.01 and 999,999.99.
            </p>
          </div>
        </Card>
      ))}

      <div className="sticky bottom-4 flex justify-end">
        <SubmitButton
          size="lg"
          className="shadow-2xl"
          pendingLabel="Saving immutable inputs…"
        >
          <Save aria-hidden="true" size={17} />
          Save quote draft
        </SubmitButton>
      </div>
    </form>
  );
}
