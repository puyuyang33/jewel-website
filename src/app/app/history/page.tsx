import type { Metadata } from "next";
import { Clock3 } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/application/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { ListControls } from "@/features/application/list-controls";
import {
  firstParameter,
  type SearchParameters,
} from "@/features/application/query";
import { getCustomerHistory } from "@/lib/data/customer";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "History" };

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParameters>;
}) {
  const parameters = await searchParams;
  const query = firstParameter(parameters, "query");
  const status = firstParameter(parameters, "status");
  const cursor = firstParameter(parameters, "cursor");
  const history = await getCustomerHistory({
    ...(query ? { query } : {}),
    ...(status ? { status } : {}),
    ...(cursor ? { cursor } : {}),
    pageSize: 25,
  });
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Durable ledger"
        title="History"
        description="A chronological view of request, commission, message, quote, payment, and delivery activity."
      />
      <ListControls
        {...(query ? { query } : {})}
        {...(status ? { status } : {})}
        searchLabel="Search history"
        statusOptions={[
          { value: "", label: "All activity" },
          { value: "requests", label: "Design requests" },
          { value: "quotes", label: "Quotes" },
          { value: "commissions", label: "Commissions" },
          { value: "payments", label: "Payments" },
          { value: "deliverables", label: "Deliverables" },
          { value: "aftercare", label: "Aftercare" },
          { value: "notifications", label: "Notifications" },
        ]}
        sortOptions={[]}
      />
      {history.items.length > 0 ? (
        <Card className="overflow-hidden">
          <ol className="divide-ink/10 divide-y">
            {history.items.map((entry) => (
              <li
                key={entry.id}
                className="grid gap-4 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-start"
              >
                <span className="bg-parchment text-garnet mt-1 grid size-9 place-items-center rounded-full">
                  <Clock3 aria-hidden="true" size={16} />
                </span>
                <div>
                  {entry.resourceHref ? (
                    <Link
                      href={entry.resourceHref}
                      className="hover:text-garnet font-semibold hover:underline"
                    >
                      {entry.title}
                    </Link>
                  ) : (
                    <p className="font-semibold">{entry.title}</p>
                  )}
                  <p className="text-stone mt-1 text-sm leading-6">
                    {entry.description}
                  </p>
                  <time className="text-stone mt-2 block text-xs">
                    {formatDate(entry.occurredAt)}
                  </time>
                </div>
                <StatusPill tone={entry.tone}>Recorded</StatusPill>
              </li>
            ))}
          </ol>
        </Card>
      ) : (
        <EmptyState
          icon={Clock3}
          title="No history yet"
          description="Your private ledger begins with your first design request."
        />
      )}
      {history.hasMore && history.nextCursor ? (
        <div className="text-center">
          <Link
            href={`/app/history?${new URLSearchParams({
              ...(query ? { query } : {}),
              ...(status ? { status } : {}),
              cursor: history.nextCursor,
            }).toString()}`}
            className="border-ink/15 hover:bg-parchment inline-flex min-h-11 items-center rounded-full border bg-white px-5 text-sm font-semibold"
          >
            Load older history
          </Link>
        </div>
      ) : null}
    </div>
  );
}
