import type { Metadata } from "next";

import { PortfolioManager } from "@/components/admin/portfolio-manager";
import { PageHeader } from "@/components/application/page-header";
import {
  finalizePortfolioUploadAction,
  savePortfolioProjectAction,
} from "@/features/admin/actions";
import { ListControls } from "@/features/application/list-controls";
import { Pagination } from "@/features/application/pagination";
import {
  firstParameter,
  positivePage,
  type SearchParameters,
} from "@/features/application/query";
import { listAdminPortfolio } from "@/lib/data/admin";

export const metadata: Metadata = { title: "Portfolio management" };

export default async function AdminPortfolioPage({
  searchParams,
}: {
  searchParams: Promise<SearchParameters>;
}) {
  const parameters = await searchParams;
  const query = firstParameter(parameters, "query");
  const status = firstParameter(parameters, "status");
  const sort = firstParameter(parameters, "sort") ?? "manual";
  const page = positivePage(firstParameter(parameters, "page"));
  const projects = await listAdminPortfolio({
    page,
    ...(query ? { query } : {}),
    ...(status ? { status } : {}),
    sort,
  });
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Public editorial"
        title="Portfolio management"
        description="Draft, publish, archive, feature, and order public stories with authorized media metadata."
      />
      <ListControls
        {...(query ? { query } : {})}
        {...(status ? { status } : {})}
        sort={sort}
        searchLabel="Search portfolio title"
        statusOptions={[
          { value: "", label: "All statuses" },
          { value: "draft", label: "Draft" },
          { value: "published", label: "Published" },
          { value: "archived", label: "Archived" },
        ]}
        sortOptions={[
          { value: "manual", label: "Manual order" },
          { value: "newest", label: "Newest first" },
          { value: "title", label: "Title A–Z" },
        ]}
      />
      <PortfolioManager
        projects={projects.items}
        projectAction={savePortfolioProjectAction}
        mediaAction={finalizePortfolioUploadAction}
      />
      <Pagination
        page={projects.page}
        pageCount={projects.pageCount}
        path="/admin/portfolio"
        query={{ query, status, sort }}
      />
    </div>
  );
}
