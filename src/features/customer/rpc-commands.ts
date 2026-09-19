export function createCounterofferRpcCommand(input: {
  quoteId: string;
  optionId: string;
  proposedTotalMinor: number;
  explanation: string;
  idempotencyKey: string;
}) {
  return {
    name: "submit_counteroffer" as const,
    args: {
      p_quote_version_id: input.quoteId,
      p_quote_option_id: input.optionId,
      p_proposed_total_minor: input.proposedTotalMinor,
      p_explanation: input.explanation,
      p_idempotency_key: input.idempotencyKey,
    },
  };
}

export function createDraftApprovalRpcCommand(input: {
  commissionId: string;
  revisionId: string;
  expectedVersion: number;
  clientFeedbackId: string;
}) {
  return {
    name: "approve_latest_draft_revision" as const,
    args: {
      p_commission_id: input.commissionId,
      p_draft_revision_id: input.revisionId,
      p_expected_revision_number: input.expectedVersion,
      p_client_feedback_id: input.clientFeedbackId,
      p_note: null,
    },
  };
}

export function createDraftRevisionRequestRpcCommand(input: {
  commissionId: string;
  revisionId: string;
  expectedVersion: number;
  reason: string;
  clientFeedbackId: string;
}) {
  return {
    name: "request_latest_draft_revision" as const,
    args: {
      p_commission_id: input.commissionId,
      p_draft_revision_id: input.revisionId,
      p_expected_revision_number: input.expectedVersion,
      p_reason: input.reason,
      p_client_feedback_id: input.clientFeedbackId,
      p_complimentary_override_reason: null,
    },
  };
}

export function createOpenAftercareRpcCommand(input: {
  commissionId: string;
  clientRequestId: string;
  category: string;
  subject: string;
  description: string;
  idempotencyKey: string;
}) {
  return {
    name: "open_aftercare_case" as const,
    args: {
      p_commission_id: input.commissionId,
      p_client_request_id: input.clientRequestId,
      p_category: input.category,
      p_subject: input.subject,
      p_description: input.description,
      p_idempotency_key: input.idempotencyKey,
    },
  };
}
