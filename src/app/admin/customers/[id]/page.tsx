import type { Metadata } from "next";
import { Gem, MessageCircle, PenLine } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminNoteForm } from "@/components/admin/note-form";
import { PageHeader } from "@/components/application/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { addAdminNoteAction } from "@/features/admin/actions";
import { humanizeStatus, statusTone } from "@/features/application/status";
import { getAdminCustomer } from "@/lib/data/admin";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Customer record" };

export default async function AdminCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await getAdminCustomer(id);
  if (!customer) {
    notFound();
  }
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Customer record"
        title={customer.displayName}
        description={`${customer.timeZone} · ${customer.phone ?? "No phone on profile"} · joined ${formatDate(customer.createdAt)}`}
        action={
          <Badge>
            {customer.marketingConsent ? "Marketing consent" : "Service only"}
          </Badge>
        }
      />
      <section className="grid gap-5 xl:grid-cols-3">
        <Card className="p-5">
          <PenLine className="text-garnet" aria-hidden="true" />
          <p className="font-display mt-4 text-4xl">{customer.requestCount}</p>
          <p className="text-stone text-sm">Design requests</p>
        </Card>
        <Card className="p-5">
          <Gem className="text-garnet" aria-hidden="true" />
          <p className="font-display mt-4 text-4xl">
            {customer.commissionCount}
          </p>
          <p className="text-stone text-sm">Commissions</p>
        </Card>
        <Card className="p-5">
          <MessageCircle className="text-garnet" aria-hidden="true" />
          <p className="font-display mt-4 text-4xl">
            {customer.conversations.length}
          </p>
          <p className="text-stone text-sm">Conversations</p>
        </Card>
      </section>

      <section>
        <h2 className="font-display text-4xl">Request history</h2>
        {customer.requests.length > 0 ? (
          <div className="mt-5 grid gap-3">
            {customer.requests.map((request) => (
              <Link
                key={request.id}
                href={`/admin/requests/${request.id}`}
                className="border-ink/10 hover:bg-parchment/35 flex items-center justify-between gap-4 rounded-2xl border bg-white p-5"
              >
                <div>
                  <p className="font-semibold">{request.title}</p>
                  <p className="text-stone mt-1 text-xs">
                    {request.referenceCode} · {formatDate(request.createdAt)}
                  </p>
                </div>
                <StatusPill tone={statusTone(request.status)}>
                  {humanizeStatus(request.status)}
                </StatusPill>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={PenLine}
            title="No requests"
            description="This customer has not submitted a design brief."
          />
        )}
      </section>

      {customer.commissions.length > 0 ? (
        <section>
          <h2 className="font-display text-4xl">Commission history</h2>
          <div className="mt-5 grid gap-3">
            {customer.commissions.map((commission) => (
              <Link
                key={commission.id}
                href={`/admin/commissions/${commission.id}`}
                className="border-ink/10 hover:bg-parchment/35 flex items-center justify-between gap-4 rounded-2xl border bg-white p-5"
              >
                <div>
                  <p className="font-semibold">{commission.title}</p>
                  <p className="text-stone mt-1 text-xs">
                    {commission.referenceCode} ·{" "}
                    {formatMoney(commission.totalMinor, commission.currency)}
                  </p>
                </div>
                <StatusPill tone={statusTone(commission.status)}>
                  {humanizeStatus(commission.status)}
                </StatusPill>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {customer.conversations.length > 0 ? (
        <section>
          <h2 className="font-display text-4xl">Conversations</h2>
          <div className="mt-5 grid gap-3">
            {customer.conversations.map((conversation) => (
              <Link
                key={conversation.id}
                href={`/admin/inbox/${conversation.id}`}
                className="border-ink/10 hover:bg-parchment/35 rounded-2xl border bg-white p-5"
              >
                <p className="font-semibold">{conversation.subject}</p>
                <p className="text-stone mt-1 truncate text-sm">
                  {conversation.latestMessage}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <Card className="p-6">
          <h2 className="font-display text-3xl">Private note history</h2>
          {customer.notes.length > 0 ? (
            <ol className="divide-ink/10 mt-4 divide-y">
              {customer.notes.map((note) => (
                <li key={note.id} className="py-4">
                  <p className="text-sm leading-6 whitespace-pre-wrap">
                    {note.body}
                  </p>
                  <p className="text-stone mt-2 text-xs">
                    {formatDate(note.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-stone mt-3 text-sm">No private notes.</p>
          )}
        </Card>
        <AdminNoteForm
          subjectType="profile"
          subjectId={customer.id}
          action={addAdminNoteAction}
        />
      </section>
    </div>
  );
}
