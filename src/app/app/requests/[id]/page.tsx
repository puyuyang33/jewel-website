import type { Metadata } from "next";
import {
  CalendarDays,
  Gem,
  ImageIcon,
  MessageCircle,
  Ruler,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/application/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { AttachmentLink } from "@/features/application/attachment-link";
import { humanizeStatus, statusTone } from "@/features/application/status";
import { getCustomerDesignRequest } from "@/lib/data/customer";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Design request" };

export default async function DesignRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const request = await getCustomerDesignRequest(id);
  if (!request) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={request.referenceCode}
        title={request.title}
        description={request.description}
        action={
          <StatusPill tone={statusTone(request.status)}>
            {humanizeStatus(request.status)}
          </StatusPill>
        }
      />

      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-6">
          <h2 className="font-display text-3xl">Brief parameters</h2>
          <dl className="mt-6 grid gap-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold">Piece type</dt>
              <dd className="text-stone mt-1">
                {humanizeStatus(request.requestType)}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Occasion</dt>
              <dd className="text-stone mt-1">
                {request.occasion ?? "Not specified"}
              </dd>
            </div>
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
              <dt className="flex items-center gap-2 font-semibold">
                <CalendarDays aria-hidden="true" size={15} />
                Desired by
              </dt>
              <dd className="text-stone mt-1">
                {request.desiredBy
                  ? formatDate(request.desiredBy)
                  : "No fixed date"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Metal direction</dt>
              <dd className="text-stone mt-1">
                {request.metalPreferences.join(", ") || "Open to guidance"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Stone direction</dt>
              <dd className="text-stone mt-1">
                {request.stonePreferences.join(", ") || "Open to guidance"}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-2 font-semibold">
                <Ruler aria-hidden="true" size={15} />
                Ring size
              </dt>
              <dd className="text-stone mt-1">
                {request.ringSize ?? "Not applicable / to confirm"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Submitted</dt>
              <dd className="text-stone mt-1">
                {request.submittedAt
                  ? formatDate(request.submittedAt)
                  : "Draft"}
              </dd>
            </div>
          </dl>
          {request.inspirationNotes ? (
            <div className="border-ink/10 mt-6 border-t pt-5">
              <h3 className="font-semibold">Reference notes</h3>
              <p className="text-stone mt-2 leading-7 whitespace-pre-wrap">
                {request.inspirationNotes}
              </p>
            </div>
          ) : null}
        </Card>

        <div className="space-y-5">
          <Card className="p-6">
            <MessageCircle className="text-garnet" aria-hidden="true" />
            <h2 className="font-display mt-4 text-3xl">Atelier conversation</h2>
            <p className="text-stone mt-2 text-sm leading-6">
              Questions, references, and decisions remain attached to this
              brief.
            </p>
            {request.conversationId ? (
              <Button asChild className="mt-5">
                <Link href={`/app/conversations/${request.conversationId}`}>
                  Open conversation
                </Link>
              </Button>
            ) : (
              <p className="bg-parchment/50 text-stone mt-5 rounded-xl p-3 text-sm">
                The atelier is preparing this request’s conversation.
              </p>
            )}
          </Card>
          <Card className="p-6">
            <ImageIcon className="text-garnet" aria-hidden="true" />
            <h2 className="font-display mt-4 text-3xl">Reference record</h2>
            {request.attachments.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {request.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <AttachmentLink {...attachment} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-stone mt-2 text-sm">
                No inspiration files were attached.
              </p>
            )}
          </Card>
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Version ledger</p>
            <h2 className="font-display mt-2 text-4xl">Quote history</h2>
          </div>
        </div>
        {request.quotes.length > 0 ? (
          <div className="mt-5 grid gap-4">
            {request.quotes.map((quote) => (
              <Card
                key={quote.id}
                className="grid gap-5 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center"
              >
                <span className="bg-parchment text-garnet grid size-12 place-items-center rounded-full">
                  <Gem aria-hidden="true" size={20} />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{quote.title}</h3>
                    <Badge>Version {quote.version}</Badge>
                    {quote.isLatest ? <Badge>Latest</Badge> : null}
                  </div>
                  <p className="text-stone mt-1 text-sm">
                    {quote.options.length} option
                    {quote.options.length === 1 ? "" : "s"} ·{" "}
                    {quote.sentAt
                      ? `sent ${formatDate(quote.sentAt)}`
                      : "not sent"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill tone={statusTone(quote.status)}>
                    {humanizeStatus(quote.status)}
                  </StatusPill>
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/app/quotes/${quote.id}`}>Review</Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="mt-5 border-dashed p-7 text-center">
            <p className="font-display text-3xl">No quote has been sent yet.</p>
            <p className="text-stone mt-2">
              Versioned options will appear here when the atelier is ready.
            </p>
          </Card>
        )}
      </section>
    </div>
  );
}
