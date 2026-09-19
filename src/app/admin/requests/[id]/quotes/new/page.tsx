import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { QuoteBuilder } from "@/components/admin/quote-builder";
import { PageHeader } from "@/components/application/page-header";
import { createQuoteDraftAction } from "@/features/admin/quote-actions";
import {
  firstParameter,
  type SearchParameters,
} from "@/features/application/query";
import { getAdminDesignRequest, getAdminQuote } from "@/lib/data/admin";

export const metadata: Metadata = { title: "Quote builder" };

export default async function QuoteBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParameters>;
}) {
  const [{ id }, parameters] = await Promise.all([params, searchParams]);
  const request = await getAdminDesignRequest(id);
  if (!request) {
    notFound();
  }
  const sourceId = firstParameter(parameters, "source");
  const source = sourceId ? await getAdminQuote(sourceId) : null;
  const validSource =
    source?.designRequestId === request.id ? source : undefined;
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={request.referenceCode}
        title={validSource ? "Create a quote revision" : "Build a quote"}
        description="Multiple comparable options are validated and totaled server-side. Saving creates a private draft; sending later makes the version immutable."
      />
      <QuoteBuilder
        requestId={request.id}
        {...(validSource ? { source: validSource } : {})}
        action={createQuoteDraftAction}
      />
    </div>
  );
}
