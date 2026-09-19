import type { Metadata } from "next";
import { PenLine } from "lucide-react";

import { FilterBar } from "@/components/application/filter-bar";
import { PageHeader } from "@/components/application/page-header";
import { RecordList } from "@/components/application/record-list";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { Pagination } from "@/features/application/pagination";
import {
  firstParameter,
  positivePage,
  type SearchParameters,
} from "@/features/application/query";
import { humanizeStatus, statusTone } from "@/features/application/status";
import { listAdminDesignRequests } from "@/lib/data/admin";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Design requests" };

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParameters>;
}) {
  const parameters = await searchParams;
  const query = firstParameter(parameters, "query");
  const status = firstParameter(parameters, "status");
  const page = positivePage(firstParameter(parameters, "page"));
  const requests = await listAdminDesignRequests({
    ...(query ? { query } : {}),
    ...(status ? { status } : {}),
    page,
  });
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Commercial intake"
        title="Design requests"
        description="Searchable briefs with customer identity, quote versions, and linked conversations."
      />
      <FilterBar
        {...(query ? { query } : {})}
        {...(status ? { filter: status } : {})}
        placeholder="Search request title"
        filterOptions={[
          { value: "", label: "All statuses" },
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
          label="Administrator design requests"
          items={requests.items.map((request) => ({
            id: request.id,
            href: `/admin/requests/${request.id}`,
            title: request.title,
            description: `${request.customerName} · ${
              request.budgetMaxMinor !== null
                ? `up to ${formatMoney(request.budgetMaxMinor, request.currency)}`
                : "budget open"
            }`,
            meta: `${request.referenceCode} · ${formatDate(request.createdAt)}`,
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
          title="No requests found"
          description="Adjust the search or status filter."
        />
      )}
      <Pagination
        page={requests.page}
        pageCount={requests.pageCount}
        path="/admin/requests"
        query={{ query, status }}
      />
    </div>
  );
}
