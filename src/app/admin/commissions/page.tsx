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
import { listAdminCommissions } from "@/lib/data/admin";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Commissions" };

export default async function AdminCommissionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParameters>;
}) {
  const parameters = await searchParams;
  const query = firstParameter(parameters, "query");
  const status = firstParameter(parameters, "status");
  const page = positivePage(firstParameter(parameters, "page"));
  const commissions = await listAdminCommissions({
    ...(query ? { query } : {}),
    ...(status ? { status } : {}),
    page,
  });
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Production ledger"
        title="Commissions"
        description="Centralized transitions, exact draft revisions, completion estimates, payment readiness, and release state."
      />
      <FilterBar
        {...(query ? { query } : {})}
        {...(status ? { filter: status } : {})}
        placeholder="Search commission title"
        filterOptions={[
          { value: "", label: "All statuses" },
          {
            value: "awaiting_admin_confirmation",
            label: "Awaiting confirmation",
          },
          { value: "confirmed", label: "Confirmed" },
          { value: "in_progress", label: "In progress" },
          { value: "draft_review", label: "Draft review" },
          { value: "revision_requested", label: "Revision requested" },
          { value: "draft_approved", label: "Draft approved" },
          { value: "final_payment_due", label: "Final payment due" },
          { value: "paid", label: "Paid" },
          { value: "delivered", label: "Delivered" },
          { value: "completed", label: "Completed" },
          { value: "disputed", label: "Disputed" },
        ]}
      />
      {commissions.items.length > 0 ? (
        <RecordList
          label="Administrator commissions"
          items={commissions.items.map((commission) => ({
            id: commission.id,
            href: `/admin/commissions/${commission.id}`,
            title: commission.title,
            description: `${commission.customerName} · ${formatMoney(commission.totalMinor, commission.currency)}`,
            meta: `${commission.referenceCode} · ${
              commission.targetCompletionAt
                ? `ETA ${formatDate(commission.targetCompletionAt)}`
                : "ETA not set"
            }`,
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
          description="Adjust the search or status filter."
        />
      )}
      <Pagination
        page={commissions.page}
        pageCount={commissions.pageCount}
        path="/admin/commissions"
        query={{ query, status }}
      />
    </div>
  );
}
