import {
  AlertCircle,
  ArrowRight,
  CreditCard,
  Gem,
  Inbox,
  PenLine,
} from "lucide-react";
import Link from "next/link";

import { MetricCard } from "@/components/application/metric-card";
import { StatusPill } from "@/components/ui/status-pill";
import { humanizeStatus, statusTone } from "@/features/application/status";
import type { AdminDashboardDto } from "@/lib/data/types";
import { formatDate } from "@/lib/utils";

export function AdminDashboardView({
  dashboard,
}: {
  dashboard: AdminDashboardDto;
}) {
  return (
    <div className="space-y-10">
      <section className="bg-garnet relative overflow-hidden rounded-[2rem] p-8 text-white sm:p-10">
        <div
          aria-hidden="true"
          className="absolute -top-24 -right-20 size-80 rounded-full border border-white/15"
        />
        <p className="text-parchment text-xs font-bold tracking-[0.2em] uppercase">
          Atelier operations
        </p>
        <h1 className="font-display mt-5 max-w-3xl text-5xl leading-[0.9] tracking-[-0.04em] sm:text-6xl">
          Decisions, not dashboards.
        </h1>
        <p className="mt-5 max-w-xl leading-7 text-white/70">
          Begin with the records that need judgment: incoming briefs, customer
          replies, draft decisions, and final-payment readiness.
        </p>
        <Link
          href="/admin/inbox"
          className="bg-porcelain text-ink mt-8 inline-flex min-h-12 items-center gap-2 rounded-full px-6 font-semibold"
        >
          Open unified inbox
          <ArrowRight aria-hidden="true" size={17} />
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Open requests"
          value={dashboard.openRequestCount}
          detail="Briefs in commercial review"
          icon={PenLine}
        />
        <MetricCard
          label="Active commissions"
          value={dashboard.activeCommissionCount}
          detail="Not completed or cancelled"
          icon={Gem}
        />
        <MetricCard
          label="Needs attention"
          value={dashboard.attentionCommissionCount}
          detail="Confirmation, revision, dispute"
          icon={AlertCircle}
        />
        <MetricCard
          label="Payment ready"
          value={dashboard.paymentDueCount}
          detail="Final balance may be collected"
          icon={CreditCard}
        />
        <MetricCard
          label="Open inbox"
          value={dashboard.openConversationCount}
          detail="Active customer threads"
          icon={Inbox}
        />
      </section>

      <section>
        <div>
          <p className="eyebrow">Operational ledger</p>
          <h2 className="font-display mt-2 text-4xl">Recent records</h2>
        </div>
        <ol className="divide-ink/10 border-ink/10 mt-5 divide-y overflow-hidden rounded-2xl border bg-white/75">
          {dashboard.recent.map((record) => (
            <li key={record.id}>
              <Link
                href={record.href}
                className="hover:bg-parchment/40 grid gap-3 p-5 transition sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div>
                  <p className="font-semibold">{record.title}</p>
                  <p className="text-stone mt-1 text-sm">
                    {record.description} · {formatDate(record.occurredAt)}
                  </p>
                </div>
                <StatusPill tone={statusTone(record.status)}>
                  {humanizeStatus(record.status)}
                </StatusPill>
              </Link>
            </li>
          ))}
          {dashboard.recent.length === 0 ? (
            <li className="text-stone p-8 text-center">
              No operational records yet.
            </li>
          ) : null}
        </ol>
      </section>
    </div>
  );
}
