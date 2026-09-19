import type { Metadata } from "next";
import { History } from "lucide-react";

import { PageHeader } from "@/components/application/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListControls } from "@/features/application/list-controls";
import { Pagination } from "@/features/application/pagination";
import {
  firstParameter,
  positivePage,
  type SearchParameters,
} from "@/features/application/query";
import { getAdminAuditLog } from "@/lib/data/admin";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit log" };

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParameters>;
}) {
  const parameters = await searchParams;
  const query = firstParameter(parameters, "query");
  const status = firstParameter(parameters, "status");
  const page = positivePage(firstParameter(parameters, "page"));
  const log = await getAdminAuditLog({
    page,
    pageSize: 20,
    ...(query ? { query } : {}),
    ...(status ? { status } : {}),
  });
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Immutable operations"
        title="Audit log"
        description="Sanitized administrator-visible change history. Secret values and raw record snapshots are never rendered."
      />
      <ListControls
        {...(query ? { query } : {})}
        {...(status ? { status } : {})}
        searchLabel="Search actor, table, record, or field"
        statusOptions={[
          { value: "", label: "All actions" },
          { value: "INSERT", label: "Insert" },
          { value: "UPDATE", label: "Update" },
          { value: "DELETE", label: "Delete" },
        ]}
        sortOptions={[]}
      />
      {log.items.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="bg-parchment/60 text-stone text-xs tracking-[0.14em] uppercase">
                <tr>
                  <th className="px-5 py-4">When</th>
                  <th className="px-5 py-4">Actor</th>
                  <th className="px-5 py-4">Action</th>
                  <th className="px-5 py-4">Resource</th>
                  <th className="px-5 py-4">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-ink/10 divide-y">
                {log.items.map((entry) => (
                  <tr key={entry.id}>
                    <td className="text-stone px-5 py-4 whitespace-nowrap">
                      {formatDate(entry.occurredAt)}
                    </td>
                    <td className="max-w-48 truncate px-5 py-4">
                      {entry.actor}
                    </td>
                    <td className="px-5 py-4 font-semibold">{entry.action}</td>
                    <td className="px-5 py-4">{entry.resource}</td>
                    <td className="text-stone max-w-md px-5 py-4">
                      {entry.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={History}
          title="No audit events found"
          description="Authorized mutations and immutable workflow events will appear here."
        />
      )}
      <Pagination
        page={log.page}
        pageCount={log.pageCount}
        path="/admin/audit"
        query={{ query, status }}
      />
    </div>
  );
}
