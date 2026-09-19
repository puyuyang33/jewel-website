import {
  ArrowRight,
  CreditCard,
  Gem,
  MessageCircle,
  PenLine,
} from "lucide-react";
import Link from "next/link";

import { MetricCard } from "@/components/application/metric-card";
import { StatusPill } from "@/components/ui/status-pill";
import { formatDate } from "@/lib/utils";
import type { CustomerDashboardDto } from "@/lib/data/types";

import { humanizeStatus, statusTone } from "@/features/application/status";

export function CustomerDashboardView({
  dashboard,
}: {
  dashboard: CustomerDashboardDto;
}) {
  return (
    <div className="space-y-10">
      <section className="bg-ink text-porcelain relative overflow-hidden rounded-[2rem] p-7 shadow-[0_28px_80px_rgba(33,31,27,.18)] sm:p-10">
        <div
          aria-hidden="true"
          className="border-brass/30 absolute -top-20 -right-16 size-72 rounded-full border"
        />
        <p className="text-brass text-xs font-bold tracking-[0.2em] uppercase">
          Private atelier room
        </p>
        <h1 className="workspace-title mt-5 max-w-3xl">
          Welcome back,{" "}
          <span className="text-parchment italic">
            {dashboard.displayName}.
          </span>
        </h1>
        <p className="text-porcelain/65 mt-5 max-w-xl leading-7">
          Every conversation, decision, and final file for your piece lives
          here—held securely from first brief to delivery.
        </p>
        <Link
          href="/app/requests/new"
          className="bg-porcelain text-ink hover:bg-parchment mt-8 inline-flex min-h-12 items-center gap-2 rounded-full px-6 font-semibold transition"
        >
          Begin a new request
          <ArrowRight aria-hidden="true" size={17} />
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active requests"
          value={dashboard.activeRequestCount}
          detail="Briefs still in conversation"
          icon={PenLine}
        />
        <MetricCard
          label="In the atelier"
          value={dashboard.activeCommissionCount}
          detail="Accepted commissions in progress"
          icon={Gem}
        />
        <MetricCard
          label="Unread messages"
          value={dashboard.unreadMessageCount}
          detail="Updates awaiting your attention"
          icon={MessageCircle}
        />
        <MetricCard
          label="Payment due"
          value={dashboard.outstandingPaymentCount}
          detail="Verified checkout actions"
          icon={CreditCard}
        />
      </section>

      <section>
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end sm:gap-4">
          <div>
            <p className="eyebrow">Atelier ledger</p>
            <h2 className="font-display mt-2 text-4xl">Recent movement</h2>
          </div>
          <Link
            href="/app/history"
            className="text-garnet text-sm font-semibold hover:underline"
          >
            View full history
          </Link>
        </div>
        {dashboard.recent.length > 0 ? (
          <ol className="divide-ink/10 border-ink/10 mt-5 divide-y overflow-hidden rounded-2xl border bg-white/75">
            {dashboard.recent.map((record) => (
              <li key={record.id}>
                <Link
                  href={record.href}
                  className="hover:bg-parchment/40 grid gap-3 px-5 py-5 transition sm:grid-cols-[1fr_auto] sm:items-center"
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
          </ol>
        ) : (
          <div className="border-ink/20 mt-5 rounded-2xl border border-dashed bg-white/50 p-8 text-center">
            <p className="font-display text-3xl">Your ledger is waiting.</p>
            <p className="text-stone mt-2">
              Start a design request and its progress will appear here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
