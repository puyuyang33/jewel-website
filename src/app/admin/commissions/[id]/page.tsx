import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AdminCommissionWorkspace } from "@/components/admin/commission-workspace";
import {
  addAdminNoteAction,
  finalizeAdminDraftUploadsAction,
  publishDraftRevisionAction,
  transitionCommissionAction,
  updateCommissionEtaAction,
} from "@/features/admin/actions";
import { createDraftRevisionAction } from "@/features/admin/draft-actions";
import { getAdminCommission } from "@/lib/data/admin";

export const metadata: Metadata = { title: "Commission operations" };

export default async function AdminCommissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const commission = await getAdminCommission(id);
  if (!commission) {
    notFound();
  }
  return (
    <AdminCommissionWorkspace
      commission={commission}
      transitionAction={transitionCommissionAction}
      etaAction={updateCommissionEtaAction}
      draftAction={createDraftRevisionAction}
      draftFinalizeAction={finalizeAdminDraftUploadsAction}
      publishAction={publishDraftRevisionAction}
      noteAction={addAdminNoteAction}
    />
  );
}
