import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AdminQuoteDetail } from "@/components/admin/quote-detail";
import {
  decideCounterofferAction,
  sendQuoteAction,
} from "@/features/admin/actions";
import {
  getAdminPublishedQuoteValidityDays,
  getAdminQuote,
} from "@/lib/data/admin";

export const metadata: Metadata = { title: "Quote detail" };

export default async function AdminQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [quote, quoteValidityDays] = await Promise.all([
    getAdminQuote(id),
    getAdminPublishedQuoteValidityDays(),
  ]);
  if (!quote) {
    notFound();
  }
  return (
    <AdminQuoteDetail
      quote={quote}
      sendAction={sendQuoteAction}
      sendIdempotencyKey={randomUUID()}
      quoteValidityDays={quoteValidityDays}
      decisionIdempotencyKeys={Object.fromEntries(
        quote.counteroffers.map((counteroffer) => [
          counteroffer.id,
          randomUUID(),
        ]),
      )}
      decisionAction={decideCounterofferAction}
    />
  );
}
import { randomUUID } from "node:crypto";
