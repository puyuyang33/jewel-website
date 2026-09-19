import type { Metadata } from "next";
import { FileCheck2 } from "lucide-react";

import { PageHeader } from "@/components/application/page-header";
import { DeliverablePanel } from "@/components/commission/deliverable-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { ListControls } from "@/features/application/list-controls";
import { Pagination } from "@/features/application/pagination";
import {
  firstParameter,
  positivePage,
  type SearchParameters,
} from "@/features/application/query";
import { listCustomerDeliverables } from "@/lib/data/customer";

export const metadata: Metadata = { title: "Deliverables" };

export default async function DeliverablesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParameters>;
}) {
  const parameters = await searchParams;
  const query = firstParameter(parameters, "query");
  const sort = firstParameter(parameters, "sort");
  const page = positivePage(firstParameter(parameters, "page"));
  const deliverables = await listCustomerDeliverables({
    page,
    ...(query ? { query } : {}),
    ...(sort ? { sort } : {}),
  });
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Released files"
        title="Deliverables"
        description="Every open request is re-authorized. Raw storage paths never appear in this workspace."
      />
      <ListControls
        {...(query ? { query } : {})}
        {...(sort ? { sort } : {})}
        searchLabel="Search deliverable title"
        sortOptions={[
          { value: "newest", label: "Newest release" },
          { value: "oldest", label: "Oldest release" },
          { value: "title", label: "Title A–Z" },
        ]}
      />
      {deliverables.items.length > 0 ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {deliverables.items.map((deliverable) => (
            <DeliverablePanel
              key={deliverable.id}
              locked={false}
              title={deliverable.title}
              description={
                deliverable.description ??
                `${deliverable.fileName} · version ${deliverable.version}`
              }
              openHref={`/api/deliverables/${deliverable.id}/open`}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FileCheck2}
          title="No files have been released"
          description="Final packages remain invisible until the commission is eligible, payment is verified, and the atelier explicitly releases them."
        />
      )}
      <Pagination
        page={deliverables.page}
        pageCount={deliverables.pageCount}
        path="/app/deliverables"
        query={{ query, sort }}
      />
    </div>
  );
}
