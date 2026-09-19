import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/application/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { ListControls } from "@/features/application/list-controls";
import { Pagination } from "@/features/application/pagination";
import {
  firstParameter,
  positivePage,
  type SearchParameters,
} from "@/features/application/query";
import { humanizeStatus, statusTone } from "@/features/application/status";
import { listCustomerPayments } from "@/lib/data/customer";
import { formatDate, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParameters>;
}) {
  const parameters = await searchParams;
  const query = firstParameter(parameters, "query");
  const status = firstParameter(parameters, "status");
  const sort = firstParameter(parameters, "sort");
  const page = positivePage(firstParameter(parameters, "page"));
  const payments = await listCustomerPayments({
    ...(status ? { status } : {}),
    ...(query ? { query } : {}),
    ...(sort ? { sort } : {}),
    page,
  });
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Verified ledger"
        title="Payments"
        description="Provider-verified final payments and refund history. Checkout begins only from an eligible commission."
      />
      <ListControls
        {...(query ? { query } : {})}
        {...(status ? { status } : {})}
        {...(sort ? { sort } : {})}
        searchLabel="Search commission title"
        statusOptions={[
          { value: "", label: "All statuses" },
          { value: "pending", label: "Pending" },
          { value: "processing", label: "Processing" },
          { value: "succeeded", label: "Succeeded" },
          { value: "failed", label: "Failed" },
          { value: "cancelled", label: "Cancelled" },
          { value: "refunded", label: "Refunded" },
        ]}
        sortOptions={[
          { value: "newest", label: "Newest first" },
          { value: "oldest", label: "Oldest first" },
          { value: "amount_high", label: "Highest amount" },
          { value: "amount_low", label: "Lowest amount" },
        ]}
      />
      {payments.items.length > 0 ? (
        <div className="grid gap-4">
          {payments.items.map((payment) => (
            <Card
              key={payment.id}
              className="grid gap-5 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center"
            >
              <span className="bg-parchment text-garnet grid size-11 place-items-center rounded-full">
                <CreditCard aria-hidden="true" size={18} />
              </span>
              <div>
                <p className="font-semibold">
                  {formatMoney(payment.amountMinor, payment.currency)}
                </p>
                <p className="text-stone mt-1 text-sm">
                  {payment.commissionReference} · {humanizeStatus(payment.kind)}{" "}
                  · updated {formatDate(payment.updatedAt)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill tone={statusTone(payment.status)}>
                  {humanizeStatus(payment.status)}
                </StatusPill>
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/app/commissions/${payment.commissionId}`}>
                    Commission
                  </Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CreditCard}
          title="No payment records found"
          description="When a final balance is ready, secure checkout appears on the commission—not here—so ownership and pricing are rechecked."
        />
      )}
      <Pagination
        page={payments.page}
        pageCount={payments.pageCount}
        path="/app/payments"
        query={{ query, status, sort }}
      />
    </div>
  );
}
