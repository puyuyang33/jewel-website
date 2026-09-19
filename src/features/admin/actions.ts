"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  actionFailure,
  booleanField,
  optionalText,
  parseCommaList,
  success,
  uuidSchema,
  validationFailure,
} from "@/features/application/action-utils";
import { createPublishDraftRpcCommand } from "@/features/admin/rpc-commands";
import { createMessageRpcCommand } from "@/features/application/rpc-commands";
import { isProviderSupportedMinorAmount } from "@/features/application/payment-amount";
import { requireAdmin } from "@/lib/auth/dal";
import { evaluateCommissionTransition } from "@/lib/domain/commissions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { readPublishedQuoteValidityDays } from "@/lib/data/site-settings";
import type { ActionResult } from "@/types/actions";

const adminAttachmentIdsSchema = z
  .string()
  .max(10_000)
  .transform((value, context) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      context.addIssue({
        code: "custom",
        message: "Uploaded attachment IDs are malformed",
      });
      return z.NEVER;
    }
  })
  .pipe(z.array(uuidSchema).max(4))
  .refine((ids) => new Set(ids).size === ids.length);

const messageSchema = z
  .object({
    conversationId: uuidSchema,
    clientMessageId: uuidSchema,
    text: z.string().trim().max(4_000),
    attachmentIds: adminAttachmentIdsSchema,
  })
  .superRefine((value, context) => {
    if (!value.text && value.attachmentIds.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Write a message or attach at least one image",
      });
    }
  });

export async function sendAdminMessageAction(
  formData: FormData,
): Promise<ActionResult<{ messageId: string }>> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    return actionFailure("admin.message_send.auth", error);
  }
  const parsed = messageSchema.safeParse({
    conversationId: formData.get("conversationId"),
    clientMessageId: formData.get("clientMessageId"),
    text: formData.get("text"),
    attachmentIds: formData.get("attachmentIds") ?? "[]",
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const conversationResult = await supabase
      .from("conversations")
      .select("id,status")
      .eq("id", parsed.data.conversationId)
      .maybeSingle();
    if (conversationResult.error) {
      throw conversationResult.error;
    }
    if (!conversationResult.data) {
      return {
        ok: false,
        code: "CONVERSATION_NOT_FOUND",
        message: "The conversation no longer exists.",
      };
    }
    const command = createMessageRpcCommand({
      conversationId: parsed.data.conversationId,
      clientMessageId: parsed.data.clientMessageId,
      body: parsed.data.text,
      attachmentIds: parsed.data.attachmentIds,
    });
    const result = await supabase.rpc(command.name, command.args);
    if (result.error) {
      throw result.error;
    }
    const message = result.data[0];
    if (!message) {
      throw new Error("Message write did not return an identifier");
    }
    revalidatePath(`/admin/inbox/${parsed.data.conversationId}`);
    revalidatePath("/admin/inbox");
    return success("Reply and verified attachments sent.", {
      messageId: message.message_id,
    });
  } catch (error) {
    return actionFailure("admin.message_send.failed", error, {
      adminId: admin.id,
      conversationId: parsed.data.conversationId,
    });
  }
}

const conversationStatusSchema = z.object({
  conversationId: uuidSchema,
  intent: z.enum(["open", "archive", "close"]),
});

export async function updateConversationStatusAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    return actionFailure("admin.conversation_status.auth", error);
  }
  const parsed = conversationStatusSchema.safeParse({
    conversationId: formData.get("conversationId"),
    intent: formData.get("intent"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const status =
      parsed.data.intent === "archive"
        ? "archived"
        : parsed.data.intent === "close"
          ? "closed"
          : "open";
    const result = await supabase
      .from("conversations")
      .update({
        status,
        closed_at: status === "closed" ? new Date().toISOString() : null,
      })
      .eq("id", parsed.data.conversationId)
      .select("id")
      .maybeSingle();
    if (result.error) {
      throw result.error;
    }
    if (!result.data) {
      return {
        ok: false,
        code: "CONVERSATION_NOT_FOUND",
        message: "The conversation no longer exists.",
      };
    }
    revalidatePath(`/admin/inbox/${parsed.data.conversationId}`);
    revalidatePath("/admin/inbox");
    return success(`Conversation ${status}.`);
  } catch (error) {
    return actionFailure("admin.conversation_status.failed", error, {
      adminId: admin.id,
      conversationId: parsed.data.conversationId,
    });
  }
}

const markConversationReadSchema = z.object({
  conversationId: uuidSchema,
  lastMessageId: uuidSchema,
});

export async function markAdminConversationReadAction(
  formData: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    return actionFailure("admin.conversation_read.auth", error);
  }
  const parsed = markConversationReadSchema.safeParse({
    conversationId: formData.get("conversationId"),
    lastMessageId: formData.get("lastMessageId"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const result = await supabase.rpc("advance_conversation_read_marker", {
      p_conversation_id: parsed.data.conversationId,
      p_message_id: parsed.data.lastMessageId,
    });
    if (result.error) {
      if (result.error.code === "P0002") {
        return {
          ok: false,
          code: "READ_MARKER_STALE",
          message: "The message changed. Refreshing the conversation.",
        };
      }
      throw result.error;
    }
    const marker = result.data[0];
    if (!marker) {
      return {
        ok: false,
        code: "READ_MARKER_FAILED",
        message: "The conversation could not be marked read.",
      };
    }
    revalidatePath("/admin/inbox");
    return success(
      marker.advanced
        ? "Conversation marked read."
        : "Conversation was already marked read.",
    );
  } catch (error) {
    return actionFailure("admin.conversation_read.failed", error, {
      adminId: admin.id,
      conversationId: parsed.data.conversationId,
    });
  }
}

const noteSchema = z
  .object({
    subjectType: z.enum([
      "profile",
      "design_request",
      "conversation",
      "commission",
    ]),
    subjectId: uuidSchema,
    body: z.string().trim().min(1).max(5_000),
  })
  .strict();

export async function addAdminNoteAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    return actionFailure("admin.note_create.auth", error);
  }
  const parsed = noteSchema.safeParse({
    subjectType: formData.get("subjectType"),
    subjectId: formData.get("subjectId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const existenceTable = {
      profile: "profiles",
      design_request: "design_requests",
      conversation: "conversations",
      commission: "commissions",
    } as const;
    const existenceResult = await supabase
      .from(existenceTable[parsed.data.subjectType])
      .select("id")
      .eq("id", parsed.data.subjectId)
      .maybeSingle();
    if (existenceResult.error) {
      throw existenceResult.error;
    }
    if (!existenceResult.data) {
      return {
        ok: false,
        code: "SUBJECT_NOT_FOUND",
        message: "The note subject no longer exists.",
      };
    }
    const result = await supabase.from("admin_notes").insert({
      author_id: admin.id,
      body: parsed.data.body,
      profile_id:
        parsed.data.subjectType === "profile" ? parsed.data.subjectId : null,
      design_request_id:
        parsed.data.subjectType === "design_request"
          ? parsed.data.subjectId
          : null,
      conversation_id:
        parsed.data.subjectType === "conversation"
          ? parsed.data.subjectId
          : null,
      commission_id:
        parsed.data.subjectType === "commission" ? parsed.data.subjectId : null,
    });
    if (result.error) {
      throw result.error;
    }
    revalidatePath("/admin/customers");
    revalidatePath("/admin/requests");
    revalidatePath("/admin/commissions");
    revalidatePath("/admin/audit");
    return success("Private note recorded.");
  } catch (error) {
    return actionFailure("admin.note_create.failed", error, {
      adminId: admin.id,
      subjectId: parsed.data.subjectId,
    });
  }
}

const requestStatusSchema = z.object({
  requestId: uuidSchema,
  intent: z.literal("close"),
  reason: z.string().trim().min(1).max(500),
});

export async function closeDesignRequestAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    return actionFailure("admin.request_close.auth", error);
  }
  const parsed = requestStatusSchema.safeParse({
    requestId: formData.get("requestId"),
    intent: formData.get("intent"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const requestResult = await supabase
      .from("design_requests")
      .select("id,status")
      .eq("id", parsed.data.requestId)
      .maybeSingle();
    if (requestResult.error) {
      throw requestResult.error;
    }
    if (
      !requestResult.data ||
      ["accepted", "declined", "closed"].includes(requestResult.data.status)
    ) {
      return {
        ok: false,
        code: "REQUEST_NOT_CLOSABLE",
        message: "This request cannot be closed from its current state.",
      };
    }
    const result = await supabase
      .from("design_requests")
      .update({ status: "closed" })
      .eq("id", requestResult.data.id)
      .eq("status", requestResult.data.status)
      .select("id")
      .maybeSingle();
    if (result.error) {
      throw result.error;
    }
    if (!result.data) {
      return {
        ok: false,
        code: "REQUEST_CONFLICT",
        message: "The request changed. Refresh and try again.",
      };
    }
    const noteResult = await supabase.from("admin_notes").insert({
      author_id: admin.id,
      design_request_id: requestResult.data.id,
      body: `Request closed: ${parsed.data.reason}`,
    });
    if (noteResult.error) {
      throw noteResult.error;
    }
    revalidatePath(`/admin/requests/${requestResult.data.id}`);
    revalidatePath("/admin/requests");
    revalidatePath("/admin/audit");
    return success("Request closed.");
  } catch (error) {
    return actionFailure("admin.request_close.failed", error, {
      adminId: admin.id,
      requestId: parsed.data.requestId,
    });
  }
}

const quoteSendSchema = z.object({
  quoteId: uuidSchema,
  idempotencyKey: uuidSchema,
});

export async function sendQuoteAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    return actionFailure("admin.quote_send.auth", error);
  }
  const parsed = quoteSendSchema.safeParse({
    quoteId: formData.get("quoteId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const [quoteResult, optionResult] = await Promise.all([
      supabase
        .from("quote_lifecycle")
        .select("id,design_request_id,status")
        .eq("id", parsed.data.quoteId)
        .maybeSingle(),
      supabase
        .from("quote_options")
        .select("deposit_minor,total_minor")
        .eq("quote_version_id", parsed.data.quoteId),
    ]);
    if (quoteResult.error || optionResult.error) {
      throw quoteResult.error ?? optionResult.error;
    }
    if (
      !quoteResult.data ||
      quoteResult.data.status !== "draft" ||
      (optionResult.data ?? []).length < 1
    ) {
      return {
        ok: false,
        code: "QUOTE_NOT_SENDABLE",
        message: "Only a complete draft quote can be sent.",
      };
    }
    if (
      (optionResult.data ?? []).some((option) => option.deposit_minor !== 0)
    ) {
      return {
        ok: false,
        code: "UNSUPPORTED_DEPOSIT",
        message:
          "This quote contains an unsupported deposit and must be replaced before sending.",
      };
    }
    if (
      (optionResult.data ?? []).some(
        (option) => !isProviderSupportedMinorAmount(option.total_minor),
      )
    ) {
      return {
        ok: false,
        code: "UNSUPPORTED_QUOTE_AMOUNT",
        message:
          "Every quote option total must be between 0.01 and 999,999.99 before this quote can be sent.",
      };
    }
    const validityDays = await readPublishedQuoteValidityDays(supabase);
    if (validityDays === null) {
      return {
        ok: false,
        code: "QUOTE_VALIDITY_SETTING_UNAVAILABLE",
        message:
          "Publish a valid quote_validity_days setting before sending quotes.",
      };
    }
    const sentAt = new Date();
    const validUntil = new Date(sentAt.getTime() + validityDays * 86_400_000);
    const result = await supabase
      .from("quote_versions")
      .update({
        valid_until: validUntil.toISOString(),
      })
      .eq("id", quoteResult.data.id)
      .select("id")
      .maybeSingle();
    if (result.error) {
      throw result.error;
    }
    if (!result.data) {
      return {
        ok: false,
        code: "QUOTE_CONFLICT",
        message: "The quote changed before it could be sent.",
      };
    }
    const transitionResult = await supabase.rpc("transition_quote_status", {
      p_quote_version_id: quoteResult.data.id,
      p_expected_status: "draft",
      p_to_status: "sent",
      p_idempotency_key: parsed.data.idempotencyKey,
    });
    if (transitionResult.error) {
      throw transitionResult.error;
    }
    revalidatePath(`/admin/quotes/${quoteResult.data.id}`);
    revalidatePath(`/admin/requests/${quoteResult.data.design_request_id}`);
    revalidatePath("/admin/audit");
    return success("Quote sent. This version is now immutable.");
  } catch (error) {
    return actionFailure("admin.quote_send.failed", error, {
      adminId: admin.id,
      quoteId: parsed.data.quoteId,
    });
  }
}

const counterofferDecisionSchema = z.object({
  counterofferId: uuidSchema,
  decision: z.enum(["accepted", "declined"]),
  responseNote: optionalText(5_000),
  idempotencyKey: uuidSchema,
});

export async function decideCounterofferAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    return actionFailure("admin.counteroffer_decision.auth", error);
  }
  const parsed = counterofferDecisionSchema.safeParse({
    counterofferId: formData.get("counterofferId"),
    decision: formData.get("decision"),
    responseNote: formData.get("responseNote"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const counterofferResult = await supabase
      .from("quote_counteroffers")
      .select("id,quote_version_id")
      .eq("id", parsed.data.counterofferId)
      .maybeSingle();
    if (counterofferResult.error) {
      throw counterofferResult.error;
    }
    if (!counterofferResult.data) {
      return {
        ok: false,
        code: "COUNTEROFFER_NOT_FOUND",
        message: "This counteroffer is unavailable.",
      };
    }
    const result = await supabase.rpc("decide_counteroffer", {
      p_counteroffer_id: counterofferResult.data.id,
      p_decision: parsed.data.decision,
      p_response_note: parsed.data.responseNote,
      p_idempotency_key: parsed.data.idempotencyKey,
    });
    if (result.error) {
      throw result.error;
    }
    revalidatePath(`/admin/quotes/${counterofferResult.data.quote_version_id}`);
    revalidatePath("/admin/audit");
    return success(`Counteroffer ${parsed.data.decision}.`);
  } catch (error) {
    return actionFailure("admin.counteroffer_decision.failed", error, {
      adminId: admin.id,
      counterofferId: parsed.data.counterofferId,
    });
  }
}

const transitionSchema = z.object({
  commissionId: uuidSchema,
  expectedStatus: z.enum([
    "awaiting_admin_confirmation",
    "confirmed",
    "in_progress",
    "draft_review",
    "revision_requested",
    "draft_approved",
    "final_payment_due",
    "paid",
    "delivered",
    "aftercare",
    "completed",
    "cancelled",
    "disputed",
  ]),
  toStatus: z.enum([
    "confirmed",
    "in_progress",
    "draft_approved",
    "final_payment_due",
    "delivered",
    "aftercare",
    "cancelled",
    "disputed",
    "paid",
  ]),
  reason: optionalText(2_000),
  idempotencyKey: uuidSchema,
});

export async function transitionCommissionAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    return actionFailure("admin.commission_transition.auth", error);
  }
  const parsed = transitionSchema.safeParse({
    commissionId: formData.get("commissionId"),
    expectedStatus: formData.get("expectedStatus"),
    toStatus: formData.get("toStatus"),
    reason: formData.get("reason"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const commissionResult = await supabase
      .from("commissions")
      .select("id,status")
      .eq("id", parsed.data.commissionId)
      .maybeSingle();
    if (commissionResult.error) {
      throw commissionResult.error;
    }
    if (!commissionResult.data) {
      return {
        ok: false,
        code: "COMMISSION_NOT_FOUND",
        message: "The commission no longer exists.",
      };
    }
    if (commissionResult.data.status !== parsed.data.expectedStatus) {
      return {
        ok: false,
        code: "COMMISSION_CONFLICT",
        message: "The commission status changed. Refresh and try again.",
      };
    }
    const decision = evaluateCommissionTransition(
      commissionResult.data.status,
      parsed.data.toStatus,
      "admin",
    );
    if (!decision.allowed) {
      return {
        ok: false,
        code: decision.reason,
        message: "That transition is not available from the current status.",
      };
    }
    const result = await supabase.rpc("transition_commission_status", {
      p_commission_id: commissionResult.data.id,
      p_expected_status: commissionResult.data.status,
      p_to_status: parsed.data.toStatus,
      p_reason: parsed.data.reason,
      p_idempotency_key: parsed.data.idempotencyKey,
    });
    if (result.error) {
      if (
        parsed.data.toStatus === "cancelled" &&
        (result.error.code === "55000" || result.error.code === "P0001")
      ) {
        return {
          ok: false,
          code: "ACTIVE_PAYMENT_BLOCKS_CANCELLATION",
          message:
            "Cancellation is blocked while final checkout is active or a final payment has succeeded.",
        };
      }
      throw result.error;
    }
    revalidatePath(`/admin/commissions/${commissionResult.data.id}`);
    revalidatePath("/admin/commissions");
    revalidatePath("/admin");
    revalidatePath("/admin/audit");
    return success(
      `Commission moved to ${parsed.data.toStatus.replaceAll("_", " ")}.`,
    );
  } catch (error) {
    return actionFailure("admin.commission_transition.failed", error, {
      adminId: admin.id,
      commissionId: parsed.data.commissionId,
    });
  }
}

const etaSchema = z.object({
  commissionId: uuidSchema,
  targetCompletionAt: z.iso.datetime({ offset: true }),
});

export async function updateCommissionEtaAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    return actionFailure("admin.commission_eta.auth", error);
  }
  const rawDate = formData.get("targetCompletionAt");
  const normalizedDate =
    typeof rawDate === "string" && rawDate
      ? new Date(rawDate).toISOString()
      : rawDate;
  const parsed = etaSchema.safeParse({
    commissionId: formData.get("commissionId"),
    targetCompletionAt: normalizedDate,
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const result = await supabase
      .from("commissions")
      .update({ target_completion_at: parsed.data.targetCompletionAt })
      .eq("id", parsed.data.commissionId)
      .select("id")
      .maybeSingle();
    if (result.error) {
      throw result.error;
    }
    if (!result.data) {
      return {
        ok: false,
        code: "COMMISSION_NOT_FOUND",
        message: "The commission no longer exists.",
      };
    }
    revalidatePath(`/admin/commissions/${parsed.data.commissionId}`);
    revalidatePath("/admin/commissions");
    return success("Estimated completion date updated.");
  } catch (error) {
    return actionFailure("admin.commission_eta.failed", error, {
      adminId: admin.id,
      commissionId: parsed.data.commissionId,
    });
  }
}

const finalizeDraftUploadsSchema = z.object({
  revisionId: uuidSchema,
  attachmentIds: z
    .string()
    .max(20_000)
    .transform((value, context) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        context.addIssue({
          code: "custom",
          message: "Uploaded attachment IDs are malformed",
        });
        return z.NEVER;
      }
    })
    .pipe(z.array(uuidSchema).max(20))
    .refine((ids) => new Set(ids).size === ids.length),
});

export async function finalizeAdminDraftUploadsAction(
  formData: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    return actionFailure("admin.draft_finalize.auth", error);
  }
  const parsed = finalizeDraftUploadsSchema.safeParse({
    revisionId: formData.get("revisionId"),
    attachmentIds: formData.get("attachmentIds") ?? "[]",
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const revisionResult = await supabase
      .from("draft_revisions")
      .select("id,design_draft_id")
      .eq("id", parsed.data.revisionId)
      .maybeSingle();
    if (revisionResult.error) {
      throw revisionResult.error;
    }
    if (!revisionResult.data) {
      return {
        ok: false,
        code: "DRAFT_NOT_FOUND",
        message: "The draft revision no longer exists.",
      };
    }
    const draftResult = await supabase
      .from("design_drafts")
      .select("commission_id")
      .eq("id", revisionResult.data.design_draft_id)
      .maybeSingle();
    if (draftResult.error) {
      throw draftResult.error;
    }
    if (!draftResult.data) {
      return {
        ok: false,
        code: "DRAFT_NOT_FOUND",
        message: "The draft series no longer exists.",
      };
    }
    const assetsResult = await supabase
      .from("draft_revision_assets")
      .select("id")
      .eq("draft_revision_id", revisionResult.data.id);
    if (assetsResult.error) {
      throw assetsResult.error;
    }
    const storedIds = (assetsResult.data ?? []).map((asset) => asset.id).sort();
    const submittedIds = [...parsed.data.attachmentIds].sort();
    if (
      storedIds.length !== submittedIds.length ||
      storedIds.some((id, index) => id !== submittedIds[index])
    ) {
      return {
        ok: false,
        code: "ATTACHMENT_CONFLICT",
        message: "The uploaded draft assets could not be verified.",
      };
    }
    revalidatePath(`/admin/commissions/${draftResult.data.commission_id}`);
    return success("Draft revision and uploaded assets are ready.");
  } catch (error) {
    return actionFailure("admin.draft_finalize.failed", error, {
      adminId: admin.id,
      revisionId: parsed.data.revisionId,
    });
  }
}

const publishDraftSchema = z.object({
  commissionId: uuidSchema,
  designDraftId: uuidSchema,
  revisionId: uuidSchema,
  expectedVersion: z.coerce.number().int().positive(),
  idempotencyKey: uuidSchema,
});

export async function publishDraftRevisionAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    return actionFailure("admin.draft_publish.auth", error);
  }
  const parsed = publishDraftSchema.safeParse({
    commissionId: formData.get("commissionId"),
    designDraftId: formData.get("designDraftId"),
    revisionId: formData.get("revisionId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const command = createPublishDraftRpcCommand({
      commissionId: parsed.data.commissionId,
      designDraftId: parsed.data.designDraftId,
      revisionId: parsed.data.revisionId,
      expectedVersion: parsed.data.expectedVersion,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    const result = await supabase.rpc(command.name, command.args);
    if (result.error) {
      throw result.error;
    }
    if (!result.data[0]) {
      throw new Error("Draft publish RPC did not return a result");
    }
    revalidatePath(`/admin/commissions/${parsed.data.commissionId}`);
    revalidatePath("/admin/commissions");
    revalidatePath("/admin/audit");
    return success("Exact draft revision shared with the customer.");
  } catch (error) {
    return actionFailure("admin.draft_publish.failed", error, {
      adminId: admin.id,
      revisionId: parsed.data.revisionId,
    });
  }
}

const deliverableSchema = z.object({
  commissionId: uuidSchema,
  kind: z.enum([
    "design_package",
    "invoice",
    "care_guide",
    "certificate",
    "shipping_document",
    "other",
  ]),
  title: z.string().trim().min(1).max(200),
  description: optionalText(5_000),
  externalUrl: z
    .url()
    .max(4_096)
    .refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        url.username === "" &&
        url.password === "" &&
        url.hash === ""
      );
    }, "Use an HTTPS URL without credentials or fragments"),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum([
    "application/pdf",
    "application/zip",
    "image/avif",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]),
  byteSize: z.coerce.number().int().positive().max(262_144_000),
  sha256Hex: z.string().regex(/^[0-9a-f]{64}$/),
  release: booleanField,
  idempotencyKey: uuidSchema,
});

export async function registerDeliverableAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    return actionFailure("admin.deliverable_register.auth", error);
  }
  const parsed = deliverableSchema.safeParse({
    commissionId: formData.get("commissionId"),
    kind: formData.get("kind"),
    title: formData.get("title"),
    description: formData.get("description"),
    externalUrl: formData.get("externalUrl"),
    fileName: formData.get("fileName"),
    mimeType: formData.get("mimeType"),
    byteSize: formData.get("byteSize"),
    sha256Hex: formData.get("sha256Hex"),
    release: formData.get("release"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const commissionResult = await supabase
      .from("commissions")
      .select("id,customer_id,status")
      .eq("id", parsed.data.commissionId)
      .maybeSingle();
    if (commissionResult.error) {
      throw commissionResult.error;
    }
    if (!commissionResult.data) {
      return {
        ok: false,
        code: "COMMISSION_NOT_FOUND",
        message: "The commission no longer exists.",
      };
    }
    const versionResult = await supabase
      .from("deliverables")
      .select(
        "version_number,status,title,description,file_name,mime_type,byte_size,sha256_hex",
      )
      .eq("commission_id", commissionResult.data.id)
      .eq("kind", parsed.data.kind)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (versionResult.error) {
      throw versionResult.error;
    }
    if (parsed.data.release) {
      const paymentResult = await supabase
        .from("payments")
        .select("*", { count: "exact", head: true })
        .eq("commission_id", commissionResult.data.id)
        .eq("customer_id", commissionResult.data.customer_id)
        .eq("kind", "final")
        .eq("status", "succeeded")
        .eq("refunded_minor", 0);
      if (paymentResult.error) {
        throw paymentResult.error;
      }
      if ((paymentResult.count ?? 0) < 1) {
        return {
          ok: false,
          code: "DELIVERABLE_LOCKED",
          message:
            "Release is disabled until verified final payment is complete.",
        };
      }
    }
    const latest = versionResult.data;
    const matchesLatest =
      latest?.status === "preparing" &&
      latest?.title === parsed.data.title &&
      latest.description === parsed.data.description &&
      latest.file_name === parsed.data.fileName &&
      latest.mime_type === parsed.data.mimeType &&
      latest.byte_size === parsed.data.byteSize &&
      latest.sha256_hex === parsed.data.sha256Hex;
    const versionNumber = matchesLatest
      ? latest.version_number
      : (latest?.version_number ?? 0) + 1;
    const writeResult = await supabase.rpc("admin_upsert_deliverable", {
      p_commission_id: commissionResult.data.id,
      p_kind: parsed.data.kind,
      p_version_number: versionNumber,
      p_title: parsed.data.title,
      p_description: parsed.data.description,
      p_file_name: parsed.data.fileName,
      p_mime_type: parsed.data.mimeType,
      p_byte_size: parsed.data.byteSize,
      p_sha256_hex: parsed.data.sha256Hex,
      p_bucket_id: "deliverables-private",
      p_object_path: `${commissionResult.data.customer_id}/external/${commissionResult.data.id}/${parsed.data.kind}-${versionNumber}-${parsed.data.sha256Hex}.link`,
      p_secret_url: parsed.data.externalUrl,
      p_release: parsed.data.release,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_expected_status: matchesLatest ? "preparing" : null,
    });
    if (writeResult.error) {
      throw writeResult.error;
    }
    if (!writeResult.data[0]) {
      throw new Error("Deliverable RPC did not return a result");
    }
    revalidatePath("/admin/deliverables");
    revalidatePath(`/admin/commissions/${commissionResult.data.id}`);
    revalidatePath("/admin/audit");
    return success(
      parsed.data.release
        ? "External deliverable registered and released."
        : "External deliverable registered as preparing.",
    );
  } catch (error) {
    return actionFailure("admin.deliverable_register.failed", error, {
      adminId: admin.id,
      commissionId: parsed.data.commissionId,
    });
  }
}

const portfolioSchema = z.object({
  projectId: z.union([uuidSchema, z.literal("")]),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100),
  title: z.string().trim().min(1).max(160),
  excerpt: z.string().trim().min(1).max(500),
  story: z.string().trim().min(1).max(12_000),
  materials: z.string().max(2_000),
  techniques: z.string().max(2_000),
  status: z.enum(["draft", "published", "archived"]),
  featured: booleanField,
  sortOrder: z.coerce.number().int().min(-1_000).max(1_000),
  completedOn: z.union([z.iso.date(), z.literal("")]),
});

export async function savePortfolioProjectAction(
  _previousState: ActionResult<{ projectId: string }>,
  formData: FormData,
): Promise<ActionResult<{ projectId: string }>> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    return actionFailure("admin.portfolio_save.auth", error);
  }
  const parsed = portfolioSchema.safeParse({
    projectId: formData.get("projectId") ?? "",
    slug: formData.get("slug"),
    title: formData.get("title"),
    excerpt: formData.get("excerpt"),
    story: formData.get("story"),
    materials: formData.get("materials"),
    techniques: formData.get("techniques"),
    status: formData.get("status"),
    featured: formData.get("featured"),
    sortOrder: formData.get("sortOrder"),
    completedOn: formData.get("completedOn"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    let oldSlug: string | null = null;
    if (parsed.data.projectId) {
      const existingResult = await supabase
        .from("portfolio_projects")
        .select("id,slug")
        .eq("id", parsed.data.projectId)
        .maybeSingle();
      if (existingResult.error) {
        throw existingResult.error;
      }
      if (!existingResult.data) {
        return {
          ok: false,
          code: "PORTFOLIO_NOT_FOUND",
          message: "The portfolio project no longer exists.",
        };
      }
      oldSlug = existingResult.data.slug;
    }
    const now = new Date().toISOString();
    const values = {
      slug: parsed.data.slug,
      title: parsed.data.title,
      excerpt: parsed.data.excerpt,
      story: parsed.data.story,
      materials: parseCommaList(parsed.data.materials),
      techniques: parseCommaList(parsed.data.techniques),
      status: parsed.data.status,
      is_featured: parsed.data.featured,
      sort_order: parsed.data.sortOrder,
      completed_on: parsed.data.completedOn || null,
      published_at: parsed.data.status === "published" ? now : null,
    };
    const result = parsed.data.projectId
      ? await supabase
          .from("portfolio_projects")
          .update(values)
          .eq("id", parsed.data.projectId)
          .select("id,slug")
          .maybeSingle()
      : await supabase
          .from("portfolio_projects")
          .insert({ ...values, created_by: admin.id })
          .select("id,slug")
          .single();
    if (result.error) {
      throw result.error;
    }
    if (!result.data) {
      return {
        ok: false,
        code: "PORTFOLIO_NOT_FOUND",
        message: "The portfolio project no longer exists.",
      };
    }
    revalidatePath("/admin/portfolio");
    revalidatePath("/");
    revalidatePath("/portfolio");
    if (oldSlug) {
      revalidatePath(`/portfolio/${oldSlug}`);
    }
    revalidatePath(`/portfolio/${result.data.slug}`);
    revalidatePath("/portfolio/[slug]", "page");
    revalidatePath("/admin/audit");
    return success("Portfolio project saved.", {
      projectId: result.data.id,
    });
  } catch (error) {
    return actionFailure("admin.portfolio_save.failed", error, {
      adminId: admin.id,
      projectId: parsed.data.projectId || null,
    });
  }
}

const portfolioMediaSchema = z.object({
  projectId: uuidSchema,
  uploadId: uuidSchema,
});

export async function finalizePortfolioUploadAction(
  formData: FormData,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    return actionFailure("admin.portfolio_media.auth", error);
  }
  const parsed = portfolioMediaSchema.safeParse({
    projectId: formData.get("projectId"),
    uploadId: formData.get("uploadId"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const projectResult = await supabase
      .from("portfolio_projects")
      .select("id,slug")
      .eq("id", parsed.data.projectId)
      .maybeSingle();
    if (projectResult.error) {
      throw projectResult.error;
    }
    if (!projectResult.data) {
      return {
        ok: false,
        code: "PORTFOLIO_NOT_FOUND",
        message: "The portfolio project no longer exists.",
      };
    }
    const mediaResult = await supabase
      .from("portfolio_media")
      .select("id")
      .eq("id", parsed.data.uploadId)
      .eq("portfolio_project_id", projectResult.data.id)
      .maybeSingle();
    if (mediaResult.error) {
      throw mediaResult.error;
    }
    if (!mediaResult.data) {
      return {
        ok: false,
        code: "UPLOAD_NOT_FOUND",
        message: "The uploaded portfolio image could not be verified.",
      };
    }
    revalidatePath("/admin/portfolio");
    revalidatePath("/");
    revalidatePath("/portfolio");
    revalidatePath(`/portfolio/${projectResult.data.slug}`);
    return success("Portfolio image uploaded and verified.");
  } catch (error) {
    return actionFailure("admin.portfolio_media.failed", error, {
      adminId: admin.id,
      projectId: parsed.data.projectId,
    });
  }
}
