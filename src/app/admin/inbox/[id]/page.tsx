import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminConversationWorkspace } from "@/components/admin/conversation-workspace";
import { AdminNoteForm } from "@/components/admin/note-form";
import { Button } from "@/components/ui/button";
import {
  addAdminNoteAction,
  markAdminConversationReadAction,
  sendAdminMessageAction,
  updateConversationStatusAction,
} from "@/features/admin/actions";
import {
  firstParameter,
  type SearchParameters,
} from "@/features/application/query";
import { getAdminConversation } from "@/lib/data/admin";

export const metadata: Metadata = { title: "Inbox conversation" };

export default async function AdminConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParameters>;
}) {
  const [{ id }, parameters] = await Promise.all([params, searchParams]);
  const cursor = firstParameter(parameters, "cursor");
  const conversation = await getAdminConversation(id, cursor);
  if (!conversation) {
    notFound();
  }
  const latest = cursor ? null : conversation.messages.at(-1);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-3">
        <Button asChild variant="secondary" size="sm">
          <Link href={`/admin/customers/${conversation.customerId}`}>
            Customer record
          </Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link href={`/admin/requests/${conversation.designRequestId}`}>
            Request record
          </Link>
        </Button>
      </div>
      <AdminConversationWorkspace
        conversation={conversation}
        clientMessageId={randomUUID()}
        sendAction={sendAdminMessageAction}
        markReadAction={markAdminConversationReadAction}
        latestReadTarget={
          latest ? { id: latest.id, sentAt: latest.sentAt } : null
        }
        statusAction={updateConversationStatusAction}
      />
      <AdminNoteForm
        subjectType="conversation"
        subjectId={conversation.id}
        action={addAdminNoteAction}
      />
    </div>
  );
}
