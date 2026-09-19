"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/dal";
import { isoCurrencySchema } from "@/lib/domain/money";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { readPublishedIntakeOpen } from "@/lib/data/site-settings";
import type { ActionResult } from "@/types/actions";

import {
  actionFailure,
  booleanField,
  decimalMinorSchema,
  optionalDecimalMinorSchema,
  optionalText,
  parseCommaList,
  success,
  uuidSchema,
  validationFailure,
} from "@/features/application/action-utils";
import { createMessageRpcCommand } from "@/features/application/rpc-commands";
import { isProviderSupportedMinorAmount } from "@/features/application/payment-amount";
import {
  createCounterofferRpcCommand,
  createDraftApprovalRpcCommand,
  createDraftRevisionRequestRpcCommand,
  createOpenAftercareRpcCommand,
} from "@/features/customer/rpc-commands";

const designRequestSchema = z
  .object({
    requestId: z.union([uuidSchema, z.literal("")]),
    title: z.string().trim().min(3).max(160),
    requestType: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{1,49}$/),
    occasion: optionalText(160),
    desiredBy: z
      .union([z.iso.date(), z.literal("")])
      .transform((value) => (value === "" ? null : value)),
    budgetMin: optionalDecimalMinorSchema,
    budgetMax: optionalDecimalMinorSchema,
    currency: isoCurrencySchema,
    description: z.string().trim().min(20).max(12_000),
    metalPreferences: z.string().max(1_000),
    stonePreferences: z.string().max(1_000),
    ringSize: optionalText(50),
    inspirationNotes: optionalText(4_000),
  })
  .superRefine((value, context) => {
    if (
      value.budgetMin !== null &&
      value.budgetMax !== null &&
      value.budgetMax < value.budgetMin
    ) {
      context.addIssue({
        code: "custom",
        path: ["budgetMax"],
        message: "Maximum budget must be at least the minimum budget",
      });
    }
  });

function parseDesignRequest(formData: FormData) {
  return designRequestSchema.safeParse({
    requestId: formData.get("requestId") ?? "",
    title: formData.get("title"),
    requestType: formData.get("requestType"),
    occasion: formData.get("occasion"),
    desiredBy: formData.get("desiredBy"),
    budgetMin: formData.get("budgetMin"),
    budgetMax: formData.get("budgetMax"),
    currency: formData.get("currency"),
    description: formData.get("description"),
    metalPreferences: formData.get("metalPreferences"),
    stonePreferences: formData.get("stonePreferences"),
    ringSize: formData.get("ringSize"),
    inspirationNotes: formData.get("inspirationNotes"),
  });
}

export async function saveDesignRequestDraftAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return actionFailure("customer.request_create.auth", error);
  }
  const parsed = parseDesignRequest(formData);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  try {
    const supabase = await createServerSupabaseClient();
    if (!parsed.data.requestId) {
      const intakeOpen = await readPublishedIntakeOpen(supabase);
      if (intakeOpen === null) {
        return {
          ok: false,
          code: "INTAKE_SETTING_UNAVAILABLE",
          message:
            "New request intake is temporarily unavailable. Please contact the atelier.",
        };
      }
      if (!intakeOpen) {
        return {
          ok: false,
          code: "INTAKE_CLOSED",
          message:
            "The atelier is not accepting new design requests right now.",
        };
      }
    }
    const values = {
      title: parsed.data.title,
      request_type: parsed.data.requestType,
      occasion: parsed.data.occasion,
      desired_by: parsed.data.desiredBy,
      budget_min_minor: parsed.data.budgetMin,
      budget_max_minor: parsed.data.budgetMax,
      currency: parsed.data.currency,
      description: parsed.data.description,
      metal_preferences: parseCommaList(parsed.data.metalPreferences),
      stone_preferences: parseCommaList(parsed.data.stonePreferences),
      ring_size: parsed.data.ringSize,
      inspiration_notes: parsed.data.inspirationNotes,
    };
    const requestResult = parsed.data.requestId
      ? await supabase
          .from("design_requests")
          .update(values)
          .eq("id", parsed.data.requestId)
          .eq("customer_id", user.id)
          .eq("status", "draft")
          .select("id,title")
          .maybeSingle()
      : await supabase
          .from("design_requests")
          .insert({
            customer_id: user.id,
            ...values,
            status: "draft",
          })
          .select("id,title")
          .single();
    if (requestResult.error) {
      throw requestResult.error;
    }
    if (!requestResult.data) {
      return {
        ok: false,
        code: "REQUEST_CONFLICT",
        message: "This request can no longer be edited.",
      };
    }
    revalidatePath("/app/requests");
    return success("Private request draft saved.", {
      id: requestResult.data.id,
    });
  } catch (error) {
    return actionFailure("customer.request_draft.failed", error, {
      userId: user.id,
    });
  }
}

const attachmentIdListSchema = (maximum: number) =>
  z
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
    .pipe(z.array(uuidSchema).max(maximum))
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Uploaded attachment IDs must be unique",
    });

const submitRequestSchema = z.object({
  requestId: uuidSchema,
  attachmentIds: attachmentIdListSchema(10),
});

export async function submitDesignRequestAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return actionFailure("customer.request_submit.auth", error);
  }
  const parsed = submitRequestSchema.safeParse({
    requestId: formData.get("requestId"),
    attachmentIds: formData.get("attachmentIds") ?? "[]",
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const intakeOpen = await readPublishedIntakeOpen(supabase);
    if (intakeOpen !== true) {
      return {
        ok: false,
        code:
          intakeOpen === false ? "INTAKE_CLOSED" : "INTAKE_SETTING_UNAVAILABLE",
        message:
          intakeOpen === false
            ? "The atelier paused new request intake before submission. Your draft remains saved."
            : "Request intake configuration is unavailable. Your draft remains saved.",
      };
    }
    const requestResult = await supabase
      .from("design_requests")
      .select("id,title,status")
      .eq("id", parsed.data.requestId)
      .eq("customer_id", user.id)
      .maybeSingle();
    if (requestResult.error) {
      throw requestResult.error;
    }
    if (!requestResult.data || requestResult.data.status !== "draft") {
      return {
        ok: false,
        code: "REQUEST_CONFLICT",
        message: "This request is no longer an editable draft.",
      };
    }
    const attachmentResult = await supabase
      .from("design_request_attachments")
      .select("id")
      .eq("design_request_id", requestResult.data.id)
      .eq("owner_id", user.id);
    if (attachmentResult.error) {
      throw attachmentResult.error;
    }
    const storedIds = (attachmentResult.data ?? [])
      .map((attachment) => attachment.id)
      .sort();
    const submittedIds = [...parsed.data.attachmentIds].sort();
    if (
      storedIds.length !== submittedIds.length ||
      storedIds.some((id, index) => id !== submittedIds[index])
    ) {
      return {
        ok: false,
        code: "ATTACHMENT_CONFLICT",
        message: "Uploaded references changed. Retry the verified upload.",
      };
    }
    const existingConversation = await supabase
      .from("conversations")
      .select("id")
      .eq("design_request_id", requestResult.data.id)
      .eq("customer_id", user.id)
      .maybeSingle();
    if (existingConversation.error) {
      throw existingConversation.error;
    }
    if (!existingConversation.data) {
      const conversationResult = await supabase.from("conversations").insert({
        design_request_id: requestResult.data.id,
        customer_id: user.id,
        subject: requestResult.data.title,
        status: "open",
      });
      if (conversationResult.error) {
        throw conversationResult.error;
      }
    }
    const submitResult = await supabase
      .from("design_requests")
      .update({
        status: "open",
        submitted_at: new Date().toISOString(),
      })
      .eq("id", requestResult.data.id)
      .eq("customer_id", user.id)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();
    if (submitResult.error) {
      throw submitResult.error;
    }
    if (!submitResult.data) {
      throw new Error("Design request changed before submission");
    }
    revalidatePath("/app");
    revalidatePath("/app/requests");
    revalidatePath("/app/conversations");
    return success("Your request is now with the atelier.", {
      id: requestResult.data.id,
    });
  } catch (error) {
    return actionFailure("customer.request_submit.failed", error, {
      userId: user.id,
      requestId: parsed.data.requestId,
    });
  }
}

const messageSchema = z
  .object({
    conversationId: uuidSchema,
    clientMessageId: uuidSchema,
    text: z.string().trim().max(4_000),
    attachmentIds: attachmentIdListSchema(4),
  })
  .superRefine((value, context) => {
    if (!value.text && value.attachmentIds.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Write a message or attach at least one image",
      });
    }
  });

export async function sendCustomerMessageAction(
  formData: FormData,
): Promise<ActionResult<{ messageId: string }>> {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return actionFailure("customer.message_send.auth", error);
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
      .eq("customer_id", user.id)
      .maybeSingle();
    if (conversationResult.error) {
      throw conversationResult.error;
    }
    if (!conversationResult.data || conversationResult.data.status !== "open") {
      return {
        ok: false,
        code: "CONVERSATION_UNAVAILABLE",
        message: "This conversation is not open for new messages.",
      };
    }
    const command = createMessageRpcCommand({
      conversationId: parsed.data.conversationId,
      clientMessageId: parsed.data.clientMessageId,
      body: parsed.data.text,
      attachmentIds: parsed.data.attachmentIds,
    });
    const messageResult = await supabase.rpc(command.name, command.args);
    if (messageResult.error) {
      throw messageResult.error;
    }
    const message = messageResult.data[0];
    if (!message) {
      throw new Error("Message write did not return an identifier");
    }
    revalidatePath(`/app/conversations/${parsed.data.conversationId}`);
    revalidatePath("/app/conversations");
    return success("Message and verified attachments sent.", {
      messageId: message.message_id,
    });
  } catch (error) {
    return actionFailure("customer.message_send.failed", error, {
      userId: user.id,
      conversationId: parsed.data.conversationId,
    });
  }
}

const markConversationReadSchema = z.object({
  conversationId: uuidSchema,
  lastMessageId: uuidSchema,
});

export async function markCustomerConversationReadAction(
  formData: FormData,
): Promise<ActionResult> {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return actionFailure("customer.conversation_read.auth", error);
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
    revalidatePath("/app");
    revalidatePath("/app/conversations");
    return success(
      marker.advanced
        ? "Conversation marked read."
        : "Conversation was already marked read.",
    );
  } catch (error) {
    return actionFailure("customer.conversation_read.failed", error, {
      userId: user.id,
      conversationId: parsed.data.conversationId,
    });
  }
}

const counterofferSchema = z.object({
  quoteId: uuidSchema,
  optionId: uuidSchema,
  amount: decimalMinorSchema.refine(isProviderSupportedMinorAmount, {
    message: "Proposed amount must be between 0.01 and 999,999.99",
  }),
  explanation: z.string().trim().min(1).max(2_000),
  idempotencyKey: uuidSchema,
});

export async function submitCounterofferAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return actionFailure("customer.counteroffer.auth", error);
  }
  const parsed = counterofferSchema.safeParse({
    quoteId: formData.get("quoteId"),
    optionId: formData.get("optionId"),
    amount: formData.get("amount"),
    explanation: formData.get("explanation"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const command = createCounterofferRpcCommand({
      quoteId: parsed.data.quoteId,
      optionId: parsed.data.optionId,
      proposedTotalMinor: parsed.data.amount,
      explanation: parsed.data.explanation,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    const result = await supabase.rpc(command.name, command.args);
    if (result.error) {
      throw result.error;
    }
    revalidatePath(`/app/quotes/${parsed.data.quoteId}`);
    revalidatePath("/app/requests");
    return success("Your counteroffer has been sent to the atelier.");
  } catch (error) {
    return actionFailure("customer.counteroffer.failed", error, {
      userId: user.id,
      quoteId: parsed.data.quoteId,
    });
  }
}

const quoteIdSchema = z.object({
  quoteId: uuidSchema,
  idempotencyKey: uuidSchema,
});

export async function declineQuoteAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return actionFailure("customer.quote_decline.auth", error);
  }
  const parsed = quoteIdSchema.safeParse({
    quoteId: formData.get("quoteId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const quoteResult = await supabase
      .from("quote_lifecycle")
      .select("id,design_request_id,status")
      .eq("id", parsed.data.quoteId)
      .in("status", ["sent", "viewed", "countered"])
      .maybeSingle();
    if (quoteResult.error) {
      throw quoteResult.error;
    }
    if (!quoteResult.data) {
      return {
        ok: false,
        code: "QUOTE_UNAVAILABLE",
        message: "This quote can no longer be declined.",
      };
    }
    const requestResult = await supabase
      .from("design_requests")
      .select("id")
      .eq("id", quoteResult.data.design_request_id)
      .eq("customer_id", user.id)
      .maybeSingle();
    if (requestResult.error) {
      throw requestResult.error;
    }
    if (!requestResult.data) {
      return {
        ok: false,
        code: "QUOTE_FORBIDDEN",
        message: "This quote is unavailable.",
      };
    }
    const transitionResult = await supabase.rpc("transition_quote_status", {
      p_quote_version_id: quoteResult.data.id,
      p_expected_status: quoteResult.data.status,
      p_to_status: "declined",
      p_idempotency_key: parsed.data.idempotencyKey,
    });
    if (transitionResult.error) {
      throw transitionResult.error;
    }
    revalidatePath(`/app/quotes/${quoteResult.data.id}`);
    revalidatePath(`/app/requests/${quoteResult.data.design_request_id}`);
    return success(
      "Quote declined. Your design inquiry remains open for a revised quote.",
    );
  } catch (error) {
    return actionFailure("customer.quote_decline.failed", error, {
      userId: user.id,
      quoteId: parsed.data.quoteId,
    });
  }
}

const quoteAcceptanceSchema = z
  .object({
    quoteId: uuidSchema,
    optionId: z.union([uuidSchema, z.literal("")]),
    counterofferId: z.union([uuidSchema, z.literal("")]),
    idempotencyKey: uuidSchema,
  })
  .superRefine((value, context) => {
    if (
      Number(Boolean(value.optionId)) +
        Number(Boolean(value.counterofferId)) !==
      1
    ) {
      context.addIssue({
        code: "custom",
        message: "Select exactly one quote option or accepted counteroffer",
      });
    }
  });

export async function acceptQuoteAction(
  _previousState: ActionResult<{ commissionId: string }>,
  formData: FormData,
): Promise<ActionResult<{ commissionId: string }>> {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return actionFailure("customer.quote_accept.auth", error);
  }
  const parsed = quoteAcceptanceSchema.safeParse({
    quoteId: formData.get("quoteId"),
    optionId: formData.get("optionId") ?? "",
    counterofferId: formData.get("counterofferId") ?? "",
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const quoteResult = await supabase
      .from("quote_lifecycle")
      .select("id,design_request_id")
      .eq("id", parsed.data.quoteId)
      .maybeSingle();
    if (quoteResult.error) {
      throw quoteResult.error;
    }
    if (!quoteResult.data) {
      return {
        ok: false,
        code: "QUOTE_UNAVAILABLE",
        message: "This quote is unavailable.",
      };
    }
    const ownerResult = await supabase
      .from("design_requests")
      .select("id")
      .eq("id", quoteResult.data.design_request_id)
      .eq("customer_id", user.id)
      .maybeSingle();
    if (ownerResult.error) {
      throw ownerResult.error;
    }
    if (!ownerResult.data) {
      return {
        ok: false,
        code: "QUOTE_FORBIDDEN",
        message: "This quote is unavailable.",
      };
    }
    const depositResult = parsed.data.optionId
      ? await supabase
          .from("quote_options")
          .select("deposit_minor")
          .eq("id", parsed.data.optionId)
          .eq("quote_version_id", parsed.data.quoteId)
          .maybeSingle()
      : await supabase
          .from("quote_counteroffers")
          .select("proposed_deposit_minor")
          .eq("id", parsed.data.counterofferId)
          .eq("quote_version_id", parsed.data.quoteId)
          .eq("customer_id", user.id)
          .maybeSingle();
    if (depositResult.error) {
      throw depositResult.error;
    }
    const depositMinor =
      depositResult.data && "deposit_minor" in depositResult.data
        ? depositResult.data.deposit_minor
        : depositResult.data?.proposed_deposit_minor;
    if (depositMinor === undefined || depositMinor !== 0) {
      return {
        ok: false,
        code: "UNSUPPORTED_DEPOSIT",
        message:
          "This historical offer contains an unsupported deposit. Request a corrected final-payment-only quote.",
      };
    }
    const rpcResult = await supabase.rpc("accept_quote", {
      p_quote_version_id: parsed.data.quoteId,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_quote_option_id: parsed.data.optionId || null,
      p_counteroffer_id: parsed.data.counterofferId || null,
    });
    if (rpcResult.error) {
      throw rpcResult.error;
    }
    const acceptance = rpcResult.data[0];
    if (!acceptance) {
      throw new Error("Quote acceptance did not return a commission");
    }
    revalidatePath("/app");
    revalidatePath("/app/requests");
    revalidatePath("/app/commissions");
    revalidatePath(`/app/quotes/${parsed.data.quoteId}`);
    return success("Quote accepted. Your commission has been created.", {
      commissionId: acceptance.commission_id,
    });
  } catch (error) {
    return actionFailure("customer.quote_accept.failed", error, {
      userId: user.id,
      quoteId: parsed.data.quoteId,
    });
  }
}

const draftDecisionSchema = z.object({
  commissionId: uuidSchema,
  revisionId: uuidSchema,
  expectedVersion: z.coerce.number().int().positive(),
  clientFeedbackId: uuidSchema,
});

export async function approveDraftAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return actionFailure("customer.draft_approve.auth", error);
  }
  const parsed = draftDecisionSchema.safeParse({
    commissionId: formData.get("commissionId"),
    revisionId: formData.get("revisionId"),
    expectedVersion: formData.get("expectedVersion"),
    clientFeedbackId: formData.get("clientFeedbackId"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const command = createDraftApprovalRpcCommand({
      commissionId: parsed.data.commissionId,
      revisionId: parsed.data.revisionId,
      expectedVersion: parsed.data.expectedVersion,
      clientFeedbackId: parsed.data.clientFeedbackId,
    });
    const result = await supabase.rpc(command.name, command.args);
    if (result.error) {
      throw result.error;
    }
    if (!result.data[0]) {
      throw new Error("Draft approval RPC did not return a result");
    }
    revalidatePath(`/app/commissions/${parsed.data.commissionId}`);
    revalidatePath("/app/commissions");
    revalidatePath("/app/history");
    return success("Draft approved. The atelier has been notified.");
  } catch (error) {
    return actionFailure("customer.draft_approve.failed", error, {
      userId: user.id,
      revisionId: parsed.data.revisionId,
    });
  }
}

const revisionRequestSchema = draftDecisionSchema.extend({
  reason: z.string().trim().min(1).max(2_000),
});

export async function requestDraftRevisionAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return actionFailure("customer.draft_revision.auth", error);
  }
  const parsed = revisionRequestSchema.safeParse({
    commissionId: formData.get("commissionId"),
    revisionId: formData.get("revisionId"),
    expectedVersion: formData.get("expectedVersion"),
    reason: formData.get("reason"),
    clientFeedbackId: formData.get("clientFeedbackId"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const command = createDraftRevisionRequestRpcCommand({
      commissionId: parsed.data.commissionId,
      revisionId: parsed.data.revisionId,
      expectedVersion: parsed.data.expectedVersion,
      reason: parsed.data.reason,
      clientFeedbackId: parsed.data.clientFeedbackId,
    });
    const result = await supabase.rpc(command.name, command.args);
    if (result.error) {
      throw result.error;
    }
    const revision = result.data[0];
    if (!revision) {
      throw new Error("Draft revision RPC did not return a result");
    }
    revalidatePath(`/app/commissions/${parsed.data.commissionId}`);
    revalidatePath("/app/commissions");
    revalidatePath("/app/history");
    return success(
      revision.complimentary
        ? "Complimentary revision request sent to the atelier."
        : `Revision request sent. ${revision.remaining_revision_rounds} included round${revision.remaining_revision_rounds === 1 ? "" : "s"} remaining.`,
    );
  } catch (error) {
    return actionFailure("customer.draft_revision.failed", error, {
      userId: user.id,
      revisionId: parsed.data.revisionId,
    });
  }
}

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  phone: z.union([
    z.literal(""),
    z
      .string()
      .trim()
      .regex(/^\+[1-9][0-9]{7,14}$/),
  ]),
  timeZone: z.string().trim().min(1).max(64),
  marketingConsent: booleanField,
});

export async function updateProfileAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return actionFailure("customer.profile_update.auth", error);
  }
  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    phone: formData.get("phone"),
    timeZone: formData.get("timeZone"),
    marketingConsent: formData.get("marketingConsent"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const result = await supabase
      .from("profiles")
      .update({
        display_name: parsed.data.displayName,
        phone_e164: parsed.data.phone || null,
        preferred_timezone: parsed.data.timeZone,
        marketing_consent: parsed.data.marketingConsent,
      })
      .eq("id", user.id)
      .select("id")
      .maybeSingle();
    if (result.error) {
      throw result.error;
    }
    if (!result.data) {
      throw new Error("Profile ownership check failed");
    }
    revalidatePath("/app/profile");
    return success("Profile saved.");
  } catch (error) {
    return actionFailure("customer.profile_update.failed", error, {
      userId: user.id,
    });
  }
}

const preferenceSchema = z
  .object({
    emailEnabled: booleanField,
    smsEnabled: booleanField,
    inAppEnabled: booleanField,
    commissionUpdates: booleanField,
    messageUpdates: booleanField,
    quoteUpdates: booleanField,
    paymentUpdates: booleanField,
    marketingUpdates: booleanField,
    quietHoursStart: z.union([
      z.literal(""),
      z.string().regex(/^\d{2}:\d{2}$/),
    ]),
    quietHoursEnd: z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]),
  })
  .superRefine((value, context) => {
    if (Boolean(value.quietHoursStart) !== Boolean(value.quietHoursEnd)) {
      context.addIssue({
        code: "custom",
        message: "Choose both a quiet-hours start and end time",
      });
    }
  });

export async function updateNotificationPreferencesAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return actionFailure("customer.preferences_update.auth", error);
  }
  const parsed = preferenceSchema.safeParse({
    emailEnabled: formData.get("emailEnabled"),
    smsEnabled: formData.get("smsEnabled"),
    inAppEnabled: formData.get("inAppEnabled"),
    commissionUpdates: formData.get("commissionUpdates"),
    messageUpdates: formData.get("messageUpdates"),
    quoteUpdates: formData.get("quoteUpdates"),
    paymentUpdates: formData.get("paymentUpdates"),
    marketingUpdates: formData.get("marketingUpdates"),
    quietHoursStart: formData.get("quietHoursStart"),
    quietHoursEnd: formData.get("quietHoursEnd"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const result = await supabase.from("notification_preferences").upsert(
      {
        profile_id: user.id,
        email_enabled: parsed.data.emailEnabled,
        sms_enabled: parsed.data.smsEnabled,
        in_app_enabled: parsed.data.inAppEnabled,
        commission_updates: parsed.data.commissionUpdates,
        message_updates: parsed.data.messageUpdates,
        quote_updates: parsed.data.quoteUpdates,
        payment_updates: parsed.data.paymentUpdates,
        marketing_updates: parsed.data.marketingUpdates,
        quiet_hours_start: parsed.data.quietHoursStart || null,
        quiet_hours_end: parsed.data.quietHoursEnd || null,
      },
      { onConflict: "profile_id" },
    );
    if (result.error) {
      throw result.error;
    }
    revalidatePath("/app/profile");
    return success("Notification preferences saved.");
  } catch (error) {
    return actionFailure("customer.preferences_update.failed", error, {
      userId: user.id,
    });
  }
}

const openAftercareCaseSchema = z.object({
  commissionId: uuidSchema,
  clientRequestId: uuidSchema,
  idempotencyKey: uuidSchema,
  category: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,49}$/),
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().min(10).max(5_000),
});

export async function openCustomerAftercareCaseAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return actionFailure("customer.aftercare_open.auth", error);
  }
  const parsed = openAftercareCaseSchema.safeParse({
    commissionId: formData.get("commissionId"),
    clientRequestId: formData.get("clientRequestId"),
    idempotencyKey: formData.get("idempotencyKey"),
    category: formData.get("category"),
    subject: formData.get("subject"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const command = createOpenAftercareRpcCommand({
      commissionId: parsed.data.commissionId,
      clientRequestId: parsed.data.clientRequestId,
      category: parsed.data.category,
      subject: parsed.data.subject,
      description: parsed.data.description,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    const result = await supabase.rpc(command.name, command.args);
    if (result.error) {
      throw result.error;
    }
    if (!result.data[0]) {
      throw new Error("Aftercare open RPC did not return a result");
    }
    revalidatePath(`/app/commissions/${parsed.data.commissionId}`);
    revalidatePath("/app/history");
    return success(
      "Aftercare started and your care case was opened atomically.",
    );
  } catch (error) {
    return actionFailure("customer.aftercare_open.failed", error, {
      userId: user.id,
      commissionId: parsed.data.commissionId,
    });
  }
}

const completeAftercareSchema = z.object({
  commissionId: uuidSchema,
  caseId: uuidSchema,
  idempotencyKey: uuidSchema,
  resolution: z.string().trim().min(10).max(5_000),
  confirmation: z.literal("on"),
});

export async function completeCustomerAftercareCaseAction(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return actionFailure("customer.aftercare_complete.auth", error);
  }
  const parsed = completeAftercareSchema.safeParse({
    commissionId: formData.get("commissionId"),
    caseId: formData.get("caseId"),
    idempotencyKey: formData.get("idempotencyKey"),
    resolution: formData.get("resolution"),
    confirmation: formData.get("confirmation"),
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
      .eq("customer_id", user.id)
      .eq("status", "aftercare")
      .maybeSingle();
    if (commissionResult.error) {
      throw commissionResult.error;
    }
    if (!commissionResult.data) {
      return {
        ok: false,
        code: "AFTERCARE_UNAVAILABLE",
        message: "Only an active aftercare commission can be completed.",
      };
    }
    const caseResult = await supabase
      .from("aftercare_cases")
      .select("id,status")
      .eq("id", parsed.data.caseId)
      .eq("commission_id", commissionResult.data.id)
      .eq("customer_id", user.id)
      .in("status", ["open", "in_progress"])
      .maybeSingle();
    if (caseResult.error) {
      throw caseResult.error;
    }
    if (!caseResult.data) {
      return {
        ok: false,
        code: "AFTERCARE_CASE_UNAVAILABLE",
        message: "This aftercare case is no longer open.",
      };
    }
    const completionResult = await supabase.rpc("complete_aftercare_case", {
      p_aftercare_case_id: caseResult.data.id,
      p_resolution_summary: parsed.data.resolution,
      p_idempotency_key: parsed.data.idempotencyKey,
    });
    if (completionResult.error) {
      throw completionResult.error;
    }
    revalidatePath(`/app/commissions/${parsed.data.commissionId}`);
    revalidatePath("/app/commissions");
    revalidatePath("/app/history");
    return success("Aftercare case completed and added to your history.");
  } catch (error) {
    return actionFailure("customer.aftercare_complete.failed", error, {
      userId: user.id,
      commissionId: parsed.data.commissionId,
      caseId: parsed.data.caseId,
    });
  }
}
