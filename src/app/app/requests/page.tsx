import type { Metadata } from "next";
import { PenLine, Plus } from "lucide-react";
import Link from "next/link";

import { FilterBar } from "@/components/application/filter-bar";
import { PageHeader } from "@/components/application/page-header";
import { RecordList } from "@/components/application/record-list";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { Pagination } from "@/features/application/pagination";
import {
  firstParameter,
  positivePage,
  type SearchParameters,
} from "@/features/application/query";
import { humanizeStatus, statusTone } from "@/features/application/status";
import { listCustomerDesignRequests } from "@/lib/data/customer";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Design requests" };

export default async function DesignRequestsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParameters>;
}) {
  const parameters = await searchParams;
  const query = firstParameter(parameters, "query");
  const status = firstParameter(parameters, "status");
  const page = positivePage(firstParameter(parameters, "page"));
  const requests = await listCustomerDesignRequests({
    ...(query ? { query } : {}),
    ...(status ? { status } : {}),
    page,
  });

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Private briefs"
        title="Design requests"
        description="The source record for each idea, quote history, and atelier conversation."
        action={
          <Button asChild>
            <Link href="/app/requests/new">
              <Plus aria-hidden="true" size={17} />
              New request
            </Link>
          </Button>
        }
      />
      <FilterBar
        {...(query ? { query } : {})}
        {...(status ? { filter: status } : {})}
        placeholder="Search request titles"
        filterOptions={[
          { value: "", label: "All statuses" },
          { value: "draft", label: "Draft" },
          { value: "open", label: "Open" },
          { value: "quoted", label: "Quoted" },
          { value: "negotiating", label: "Negotiating" },
          { value: "accepted", label: "Accepted" },
          { value: "declined", label: "Declined" },
          { value: "closed", label: "Closed" },
        ]}
      />
      {requests.items.length > 0 ? (
        <RecordList
          label="Design requests"
          items={requests.items.map((request) => ({
            id: request.id,
            href: `/app/requests/${request.id}`,
            title: request.title,
            description: `${humanizeStatus(request.requestType)} · ${
              request.budgetMaxMinor !== null
                ? `up to ${formatMoney(request.budgetMaxMinor, request.currency)}`
                : "budget to discuss"
            }`,
            meta: `${request.referenceCode} · opened ${formatDate(request.createdAt)}`,
            status: (
              <StatusPill tone={statusTone(request.status)}>
                {humanizeStatus(request.status)}
              </StatusPill>
            ),
          }))}
        />
      ) : (
        <EmptyState
          icon={PenLine}
          title="No design requests found"
          description={
            query || status
              ? "Adjust the search or status filter."
              : "Begin with the story, parameters, and references for your piece."
          }
          action={
            !query && !status ? (
              <Button asChild>
                <Link href="/app/requests/new">Begin a request</Link>
              </Button>
            ) : null
          }
        />
      )}
      <Pagination
        page={requests.page}
        pageCount={requests.pageCount}
        path="/app/requests"
        query={{ query, status }}
      />
    </div>
  );
}
