import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CustomerConversationWorkspace } from "@/components/customer/conversation-workspace";
import {
  firstParameter,
  type SearchParameters,
} from "@/features/application/query";
import {
  markCustomerConversationReadAction,
  sendCustomerMessageAction,
} from "@/features/customer/actions";
import { getCustomerConversation } from "@/lib/data/customer";

export const metadata: Metadata = { title: "Private conversation" };

export default async function ConversationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParameters>;
}) {
  const [{ id }, parameters] = await Promise.all([params, searchParams]);
  const cursor = firstParameter(parameters, "cursor");
  const conversation = await getCustomerConversation(id, cursor);
  if (!conversation) {
    notFound();
  }
  const latest = cursor ? null : conversation.messages.at(-1);
  return (
    <CustomerConversationWorkspace
      conversation={conversation}
      clientMessageId={randomUUID()}
      sendAction={sendCustomerMessageAction}
      markReadAction={markCustomerConversationReadAction}
      latestReadTarget={
        latest ? { id: latest.id, sentAt: latest.sentAt } : null
      }
    />
  );
}
