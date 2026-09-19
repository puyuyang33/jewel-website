import type { Metadata } from "next";
import { CopyPlus, MessageCircle, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminNoteForm } from "@/components/admin/note-form";
import { RequestCloseForm } from "@/components/admin/request-close-form";
import { PageHeader } from "@/components/application/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { AttachmentLink } from "@/features/application/attachment-link";
import {
  addAdminNoteAction,
  closeDesignRequestAction,
} from "@/features/admin/actions";
import { humanizeStatus, statusTone } from "@/features/application/status";
import { getAdminDesignRequest } from "@/lib/data/admin";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Request detail" };

export default async function AdminRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const request = await getAdminDesignRequest(id);
  if (!request) {
    notFound();
  }
  const closable = !["accepted", "declined", "closed"].includes(request.status);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={request.referenceCode}
        title={request.title}
        description={`${request.customerName} · ${humanizeStatus(request.requestType)} · opened ${formatDate(request.createdAt)}`}
        action={
          <StatusPill tone={statusTone(request.status)}>
            {humanizeStatus(request.status)}
          </StatusPill>
        }
      />
      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-6">
          <h2 className="font-display text-3xl">Customer brief</h2>
          <p className="text-stone mt-4 leading-7 whitespace-pre-wrap">
            {request.description}
          </p>
          <dl className="border-ink/10 mt-6 grid gap-5 border-t pt-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold">Budget</dt>
              <dd className="text-stone mt-1">
                {request.budgetMinMinor !== null
                  ? formatMoney(request.budgetMinMinor, request.currency)
                  : "Open"}
                {" — "}
                {request.budgetMaxMinor !== null
                  ? formatMoney(request.budgetMaxMinor, request.currency)
                  : "to discuss"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Desired by</dt>
              <dd className="text-stone mt-1">
                {request.desiredBy
                  ? formatDate(request.desiredBy)
                  : "No fixed date"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Metals</dt>
              <dd className="text-stone mt-1">
                {request.metalPreferences.join(", ") || "Open"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Stones</dt>
              <dd className="text-stone mt-1">
                {request.stonePreferences.join(", ") || "Open"}
              </dd>
            </div>
          </dl>
        </Card>
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="font-display text-3xl">Working links</h2>
            <div className="mt-4 flex flex-col gap-3">
              {request.conversationId ? (
                <Button asChild variant="secondary">
                  <Link href={`/admin/inbox/${request.conversationId}`}>
                    <MessageCircle aria-hidden="true" size={17} />
                    Open conversation
                  </Link>
                </Button>
              ) : (
                <Button
                  disabled
                  variant="secondary"
                  title="No conversation record"
                >
                  Conversation unavailable
                </Button>
              )}
              {["open", "quoted", "negotiating"].includes(request.status) ? (
                <Button asChild>
                  <Link href={`/admin/requests/${request.id}/quotes/new`}>
                    <Plus aria-hidden="true" size={17} />
                    Build quote version
                  </Link>
                </Button>
              ) : (
                <Button disabled title="Request is not in a quotable state">
                  Quote builder unavailable
                </Button>
              )}
            </div>
          </Card>
          <AdminNoteForm
            subjectType="design_request"
            subjectId={request.id}
            action={addAdminNoteAction}
          />
          {closable ? (
            <RequestCloseForm
              requestId={request.id}
              action={closeDesignRequestAction}
            />
          ) : null}
        </div>
      </section>

      {request.attachments.length > 0 ? (
        <section>
          <p className="eyebrow">Authorized references</p>
          <h2 className="font-display mt-2 text-4xl">Request attachments</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {request.attachments.map((attachment) => (
              <AttachmentLink key={attachment.id} {...attachment} />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <p className="eyebrow">Immutable versions</p>
        <h2 className="font-display mt-2 text-4xl">Quote history</h2>
        {request.quotes.length > 0 ? (
          <div className="mt-5 grid gap-4">
            {request.quotes.map((quote) => (
              <Card
                key={quote.id}
                className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-semibold">{quote.title}</h3>
                    <StatusPill tone={statusTone(quote.status)}>
                      {humanizeStatus(quote.status)}
                    </StatusPill>
                  </div>
                  <p className="text-stone mt-1 text-sm">
                    Version {quote.version} · {quote.options.length} options ·{" "}
                    {quote.sentAt ? formatDate(quote.sentAt) : "draft"}
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/admin/quotes/${quote.id}`}>Open</Link>
                  </Button>
                  {quote.status !== "draft" ? (
                    <Button asChild size="sm" variant="ghost">
                      <Link
                        href={`/admin/requests/${request.id}/quotes/new?source=${quote.id}`}
                      >
                        <CopyPlus aria-hidden="true" size={15} />
                        Revise
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="text-stone mt-5 border-dashed p-7 text-center">
            No quote versions.
          </Card>
        )}
      </section>
    </div>
  );
}
