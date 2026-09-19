import type { Metadata } from "next";
import { UsersRound } from "lucide-react";

import { FilterBar } from "@/components/application/filter-bar";
import { PageHeader } from "@/components/application/page-header";
import { RecordList } from "@/components/application/record-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/features/application/pagination";
import {
  firstParameter,
  positivePage,
  type SearchParameters,
} from "@/features/application/query";
import { listAdminCustomers } from "@/lib/data/admin";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Customers" };

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParameters>;
}) {
  const parameters = await searchParams;
  const query = firstParameter(parameters, "query");
  const page = positivePage(firstParameter(parameters, "page"));
  const customers = await listAdminCustomers({
    ...(query ? { query } : {}),
    page,
  });
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Authorized profiles"
        title="Customers"
        description="Minimal customer identity plus linked request, commission, conversation, and private-note counts."
      />
      <FilterBar
        {...(query ? { query } : {})}
        placeholder="Search display name"
        filterOptions={[{ value: "", label: "All customer profiles" }]}
      />
      {customers.items.length > 0 ? (
        <RecordList
          label="Customer profiles"
          items={customers.items.map((customer) => ({
            id: customer.id,
            href: `/admin/customers/${customer.id}`,
            title: customer.displayName,
            description: `${customer.requestCount} requests · ${customer.commissionCount} commissions`,
            meta: `Profile opened ${formatDate(customer.createdAt)} · ${customer.timeZone}`,
          }))}
        />
      ) : (
        <EmptyState
          icon={UsersRound}
          title="No customer profiles found"
          description="Adjust the search. Authentication profiles are never replaced with demo identities."
        />
      )}
      <Pagination
        page={customers.page}
        pageCount={customers.pageCount}
        path="/admin/customers"
        query={{ query }}
      />
    </div>
  );
}
