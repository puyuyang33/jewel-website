import type { Metadata } from "next";
import { Gem } from "lucide-react";

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
import { listCustomerCommissions } from "@/lib/data/customer";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Commissions" };

export default async function CommissionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParameters>;
}) {
  const parameters = await searchParams;
  const query = firstParameter(parameters, "query");
  const status = firstParameter(parameters, "status");
  const page = positivePage(firstParameter(parameters, "page"));
  const commissions = await listCustomerCommissions({
    ...(query ? { query } : {}),
    ...(status ? { status } : {}),
    page,
  });
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Accepted work"
        title="Commissions"
        description="Live atelier progress, exact draft versions, payment readiness, and final delivery."
      />
      <FilterBar
        {...(query ? { query } : {})}
        {...(status ? { filter: status } : {})}
        placeholder="Search commission titles"
        filterOptions={[
          { value: "", label: "All statuses" },
          {
            value: "awaiting_admin_confirmation",
            label: "Awaiting confirmation",
          },
          { value: "in_progress", label: "In progress" },
          { value: "draft_review", label: "Draft review" },
          { value: "revision_requested", label: "Revision requested" },
          { value: "final_payment_due", label: "Final payment due" },
          { value: "paid", label: "Paid" },
          { value: "delivered", label: "Delivered" },
          { value: "completed", label: "Completed" },
        ]}
      />
      {commissions.items.length > 0 ? (
        <RecordList
          label="Commissions"
          items={commissions.items.map((commission) => ({
            id: commission.id,
            href: `/app/commissions/${commission.id}`,
            title: commission.title,
            description: `${formatMoney(commission.totalMinor, commission.currency)} · ${
              commission.targetCompletionAt
                ? `estimated ${formatDate(commission.targetCompletionAt)}`
                : "completion date to confirm"
            }`,
            meta: `${commission.referenceCode} · updated ${formatDate(commission.updatedAt)}`,
            leading: (
              <span className="bg-parchment text-garnet grid size-10 place-items-center rounded-full">
                <Gem aria-hidden="true" size={18} />
              </span>
            ),
            status: (
              <StatusPill tone={statusTone(commission.status)}>
                {humanizeStatus(commission.status)}
              </StatusPill>
            ),
          }))}
        />
      ) : (
        <EmptyState
          icon={Gem}
          title="No commissions found"
          description={
            query || status
              ? "Adjust the search or status filter."
              : "A commission is created atomically when you accept an active quote."
          }
        />
      )}
      <Pagination
        page={commissions.page}
        pageCount={commissions.pageCount}
        path="/app/commissions"
        query={{ query, status }}
      />
    </div>
  );
}
