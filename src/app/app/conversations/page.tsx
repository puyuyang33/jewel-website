import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";

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
import { listCustomerConversations } from "@/lib/data/customer";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Conversations" };

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParameters>;
}) {
  const parameters = await searchParams;
  const query = firstParameter(parameters, "query");
  const status = firstParameter(parameters, "status");
  const page = positivePage(firstParameter(parameters, "page"));
  const conversations = await listCustomerConversations({
    ...(query ? { query } : {}),
    ...(status ? { status } : {}),
    page,
  });

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Private correspondence"
        title="Conversations"
        description="Durable messages, reference records, and atelier decisions for each brief."
      />
      <FilterBar
        {...(query ? { query } : {})}
        {...(status ? { filter: status } : {})}
        placeholder="Search conversation subjects"
        filterOptions={[
          { value: "", label: "All conversations" },
          { value: "open", label: "Open" },
          { value: "archived", label: "Archived" },
          { value: "closed", label: "Closed" },
        ]}
      />
      {conversations.items.length > 0 ? (
        <RecordList
          label="Customer conversations"
          items={conversations.items.map((conversation) => ({
            id: conversation.id,
            href: `/app/conversations/${conversation.id}`,
            title: conversation.subject,
            description: conversation.latestMessage,
            meta: conversation.latestMessageAt
              ? `Last message ${formatDate(conversation.latestMessageAt)}`
              : `Opened ${formatDate(conversation.updatedAt)}`,
            leading:
              conversation.unreadCount > 0 ? (
                <span className="bg-garnet grid size-9 place-items-center rounded-full text-xs font-bold text-white">
                  {conversation.unreadCount}
                </span>
              ) : (
                <span className="bg-parchment text-stone grid size-9 place-items-center rounded-full">
                  <MessageCircle aria-hidden="true" size={16} />
                </span>
              ),
            status: (
              <StatusPill tone={statusTone(conversation.status)}>
                {humanizeStatus(conversation.status)}
              </StatusPill>
            ),
          }))}
        />
      ) : (
        <EmptyState
          icon={MessageCircle}
          title="No conversations found"
          description={
            query || status
              ? "Adjust the search or filter to see another part of your correspondence."
              : "A private conversation opens with each submitted design request."
          }
        />
      )}
      <Pagination
        page={conversations.page}
        pageCount={conversations.pageCount}
        path="/app/conversations"
        query={{ query, status }}
      />
    </div>
  );
}
