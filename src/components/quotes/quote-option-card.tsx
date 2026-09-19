import { Check, Gem, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";

export interface QuoteOptionDto {
  id: string;
  title: string;
  scope: string;
  materials: string;
  stoneAssumptions: string;
  deliverables: string;
  includedRevisionRounds: number;
  priceMinor: number;
  finalPaymentMinor: number;
  currency: string;
  estimatedDurationDays: number;
}

export function QuoteOptionCard({
  option,
  featured = false,
  action,
}: {
  option: QuoteOptionDto;
  featured?: boolean;
  action?: ReactNode;
}) {
  return (
    <Card
      className={
        featured
          ? "border-garnet/45 ring-garnet/10 relative bg-white p-6 ring-1"
          : "p-6"
      }
    >
      {featured ? (
        <Badge className="border-garnet/30 bg-garnet absolute -top-3 left-6 text-white">
          Atelier recommendation
        </Badge>
      ) : null}
      <Gem className="text-garnet" aria-hidden="true" size={24} />
      <h3 className="font-display mt-5 text-3xl">{option.title}</h3>
      <p className="text-stone mt-4 leading-7">{option.scope}</p>
      <p className="font-display mt-7 text-4xl">
        {formatMoney(option.priceMinor, option.currency)}
      </p>
      <p className="text-stone mt-1 text-sm">
        Final payment: {formatMoney(option.finalPaymentMinor, option.currency)}
      </p>
      <dl className="border-ink/10 mt-7 space-y-4 border-y py-6 text-sm">
        <div>
          <dt className="text-ink font-semibold">Materials</dt>
          <dd className="text-stone mt-1">{option.materials}</dd>
        </div>
        <div>
          <dt className="text-ink font-semibold">Stone assumptions</dt>
          <dd className="text-stone mt-1">{option.stoneAssumptions}</dd>
        </div>
        <div>
          <dt className="text-ink font-semibold">Deliverables</dt>
          <dd className="text-stone mt-1">{option.deliverables}</dd>
        </div>
      </dl>
      <div className="text-stone mt-5 flex flex-col items-start justify-between gap-2 text-sm sm:flex-row sm:items-center sm:gap-4">
        <span className="flex items-center gap-2">
          <RotateCcw aria-hidden="true" size={16} />
          {option.includedRevisionRounds} revisions
        </span>
        <span>{option.estimatedDurationDays} days estimated</span>
      </div>
      {action ? <div className="mt-6">{action}</div> : null}
    </Card>
  );
}

export function QuoteAcceptButton({
  optionId,
  action,
}: {
  optionId: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="optionId" value={optionId} />
      <Button className="w-full" type="submit">
        <Check aria-hidden="true" size={18} />
        Accept this option
      </Button>
    </form>
  );
}
