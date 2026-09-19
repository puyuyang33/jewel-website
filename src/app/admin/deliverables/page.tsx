import type { Metadata } from "next";

import { DeliverableManager } from "@/components/admin/deliverable-manager";
import { PageHeader } from "@/components/application/page-header";
import { registerDeliverableAction } from "@/features/admin/actions";
import {
  firstParameter,
  positivePage,
  type SearchParameters,
} from "@/features/application/query";
import { Pagination } from "@/features/application/pagination";
import { ListControls } from "@/features/application/list-controls";
import { listAdminDeliverables } from "@/lib/data/admin";

export const metadata: Metadata = { title: "Deliverables" };

export default async function AdminDeliverablesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParameters>;
}) {
  const parameters = await searchParams;
  const query = firstParameter(parameters, "query");
  const status = firstParameter(parameters, "status");
  const sort = firstParameter(parameters, "sort");
  const page = positivePage(firstParameter(parameters, "page"));
  const deliverables = await listAdminDeliverables({
    page,
    ...(status ? { status } : {}),
    ...(query ? { query } : {}),
    ...(sort ? { sort } : {}),
  });
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Private files"
        title="Deliverables"
        description="Register raw storage object paths under administrator authorization, then release only after verified final-payment readiness."
      />
      <ListControls
        {...(query ? { query } : {})}
        {...(status ? { status } : {})}
        {...(sort ? { sort } : {})}
        searchLabel="Search deliverable title"
        statusOptions={[
          { value: "", label: "All statuses" },
          { value: "preparing", label: "Preparing" },
          { value: "released", label: "Released" },
          { value: "revoked", label: "Revoked" },
        ]}
        sortOptions={[
          { value: "newest", label: "Newest first" },
          { value: "oldest", label: "Oldest first" },
          { value: "title", label: "Title A–Z" },
        ]}
      />
      <DeliverableManager
        deliverables={deliverables.items}
        registrationIdempotencyKey={randomUUID()}
        registerAction={registerDeliverableAction}
      />
      <Pagination
        page={deliverables.page}
        pageCount={deliverables.pageCount}
        path="/admin/deliverables"
        query={{ query, status, sort }}
      />
    </div>
  );
}
import { randomUUID } from "node:crypto";
