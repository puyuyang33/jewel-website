export function createPublishDraftRpcCommand(input: {
  commissionId: string;
  designDraftId: string;
  revisionId: string;
  expectedVersion: number;
  idempotencyKey: string;
}) {
  return {
    name: "publish_latest_draft_revision" as const,
    args: {
      p_commission_id: input.commissionId,
      p_design_draft_id: input.designDraftId,
      p_draft_revision_id: input.revisionId,
      p_expected_revision_number: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
    },
  };
}
