import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CommissionWorkspace } from "@/components/customer/commission-workspace";
import {
  approveDraftAction,
  completeCustomerAftercareCaseAction,
  openCustomerAftercareCaseAction,
  requestDraftRevisionAction,
} from "@/features/customer/actions";
import {
  firstParameter,
  type SearchParameters,
} from "@/features/application/query";
import { getCustomerCommission } from "@/lib/data/customer";

export const metadata: Metadata = { title: "Commission detail" };

export default async function CommissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParameters>;
}) {
  const [{ id }, parameters] = await Promise.all([params, searchParams]);
  const payment = firstParameter(parameters, "payment");
  const commission = await getCustomerCommission(id);
  if (!commission) {
    notFound();
  }
  return (
    <CommissionWorkspace
      commission={commission}
      paymentReturnState={
        payment === "processing" || payment === "cancelled" ? payment : null
      }
      approveAction={approveDraftAction}
      revisionAction={requestDraftRevisionAction}
      openAftercareAction={openCustomerAftercareCaseAction}
      completeAftercareAction={completeCustomerAftercareCaseAction}
    />
  );
}
