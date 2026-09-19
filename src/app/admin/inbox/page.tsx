import type { Metadata } from "next";

import { AdminInboxFilters } from "@/components/admin/inbox-filters";
import { AdminLiveInboxList } from "@/components/admin/live-inbox-list";
import { PageHeader } from "@/components/application/page-header";
import {
  firstParameter,
  type SearchParameters,
} from "@/features/application/query";
import { listAdminConversations } from "@/lib/data/admin";

export const metadata: Metadata = { title: "Unified inbox" };

export default async function AdminInboxPage({
  searchParams,
}: {
  searchParams: Promise<SearchParameters>;
}) {
  const parameters = await searchParams;
  const query = firstParameter(parameters, "query");
  const status = firstParameter(parameters, "status");
  const cursor = firstParameter(parameters, "cursor");
  const unreadOnly = firstParameter(parameters, "unread") === "true";
  const conversations = await listAdminConversations({
    ...(query ? { query } : {}),
    ...(status ? { status } : {}),
    ...(cursor ? { cursor } : {}),
    unreadOnly,
    pageSize: 25,
  });
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="All customer correspondence"
        title="Unified inbox"
        description="One authorized view of durable conversations, unread state, and attached request context."
      />
      <AdminInboxFilters
        {...(query ? { query } : {})}
        {...(status ? { status } : {})}
        unreadOnly={unreadOnly}
      />
      <AdminLiveInboxList
        key={`${conversations.items
          .map(
            (item) =>
              `${item.id}:${item.latestMessageId ?? "none"}:${item.unreadCount}:${item.status}`,
          )
          .join("|")}:${cursor ?? "first"}`}
        initialPage={conversations}
        adminId={conversations.viewerId}
        query={query ?? null}
        status={
          status === "open" || status === "archived" || status === "closed"
            ? status
            : null
        }
        unreadOnly={unreadOnly}
      />
    </div>
  );
}
