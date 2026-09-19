import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { QuoteComparison } from "@/components/customer/quote-comparison";
import {
  acceptQuoteAction,
  declineQuoteAction,
  submitCounterofferAction,
} from "@/features/customer/actions";
import { getCustomerQuote } from "@/lib/data/customer";

export const metadata: Metadata = { title: "Quote review" };

export default async function QuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const quote = await getCustomerQuote(id);
  if (!quote) {
    notFound();
  }
  return (
    <QuoteComparison
      quote={quote}
      idempotencyKeys={Object.fromEntries(
        quote.options.map((option) => [option.id, randomUUID()]),
      )}
      counterofferIdempotencyKeys={Object.fromEntries(
        quote.options.map((option) => [option.id, randomUUID()]),
      )}
      counterofferAcceptanceKeys={Object.fromEntries(
        quote.counteroffers.map((counteroffer) => [
          counteroffer.id,
          randomUUID(),
        ]),
      )}
      acceptAction={acceptQuoteAction}
      counterofferAction={submitCounterofferAction}
      declineAction={declineQuoteAction}
      declineIdempotencyKey={randomUUID()}
    />
  );
}
