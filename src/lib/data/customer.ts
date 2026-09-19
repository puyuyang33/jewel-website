import "server-only";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/dal";
import {
  decodeMessageCursor,
  encodeMessageCursor,
} from "@/lib/domain/messages";
import {
  createCustomerHistoryRpcCommand,
  decodeCustomerHistoryCursor,
  historyTypesForFilter,
  mapCustomerHistoryPage,
} from "@/features/application/history-model";
import { unreadMessagesAfterFilter } from "@/features/application/message-position";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { VeyraSupabaseClient } from "@/lib/supabase/types";
import type { Database, Tables } from "@/types/database.generated";

import {
  assertDatabaseResult,
  jsonObject,
  jsonString,
  normalizeListQuery,
  safeSearchPattern,
  toPageResult,
} from "./shared";
import type {
  AttachmentDto,
  CommissionDetailDto,
  CommissionListItemDto,
  ConversationDetailDto,
  ConversationListItemDto,
  CounterofferDto,
  CustomerDashboardDto,
  DeliverableDto,
  DesignRequestDetailDto,
  DesignRequestListItemDto,
  DraftRevisionDto,
  CustomerHistoryPage,
  ListQuery,
  MessageDto,
  PageResult,
  PaymentDto,
  ProfileDto,
  QuoteDetailDto,
  QuoteOptionDto,
} from "./types";

type DesignRequestRow = Tables<"design_requests">;
type QuoteVersionRow = Database["public"]["Views"]["quote_lifecycle"]["Row"];
type QuoteOptionRow = Tables<"quote_options">;
type CounterofferRow = Tables<"quote_counteroffers">;
type CommissionRow = Tables<"commissions">;
type PaymentRow = Tables<"payments">;
type DeliverableRow = Tables<"deliverables">;

async function requireCustomerDataUser() {
  try {
    return await requireUser();
  } catch {
    redirect("/sign-in?next=/app");
  }
}

const ACTIVE_COMMISSION_STATUSES = [
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
  "disputed",
] as const;

function requestListDto(row: DesignRequestRow): DesignRequestListItemDto {
  return {
    id: row.id,
    customerId: row.customer_id,
    referenceCode: row.reference_code,
    title: row.title,
    requestType: row.request_type,
    status: row.status,
    budgetMinMinor: row.budget_min_minor,
    budgetMaxMinor: row.budget_max_minor,
    currency: row.currency,
    desiredBy: row.desired_by,
    createdAt: row.created_at,
  };
}

function commissionListDto(row: CommissionRow): CommissionListItemDto {
  return {
    id: row.id,
    customerId: row.customer_id,
    referenceCode: row.reference_code,
    title: row.accepted_title,
    status: row.status,
    currency: row.accepted_currency,
    totalMinor: row.accepted_total_minor,
    depositMinor: row.accepted_deposit_minor,
    targetCompletionAt: row.target_completion_at,
    updatedAt: row.updated_at,
  };
}

function parseLineItems(value: unknown): QuoteOptionDto["lineItems"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((candidate) => {
    const item = jsonObject(candidate);
    const description =
      typeof item.description === "string" ? item.description : null;
    const directAmount =
      typeof item.amountMinor === "number" ? item.amountMinor : null;
    const nestedAmount = jsonObject(item.amount).amountMinor;
    const amountMinor =
      directAmount ?? (typeof nestedAmount === "number" ? nestedAmount : null);
    return description && amountMinor !== null
      ? [{ description, amountMinor }]
      : [];
  });
}

function quoteOptionDto(row: QuoteOptionRow): QuoteOptionDto {
  const scope = jsonObject(row.scope_snapshot);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    scope: jsonString(scope, "scope", row.description),
    materials: jsonString(scope, "materials", "As described in the option"),
    stoneAssumptions: jsonString(
      scope,
      "stoneAssumptions",
      "As described in the option",
    ),
    deliverables: jsonString(
      scope,
      "deliverables",
      "Final atelier design package",
    ),
    includedRevisionRounds: row.included_revision_rounds,
    estimatedCompletionDays: row.estimated_completion_days,
    currency: row.currency,
    totalMinor: row.total_minor,
    depositMinor: row.deposit_minor,
    lineItems: parseLineItems(row.line_items),
  };
}

function paymentDto(row: PaymentRow): PaymentDto {
  return {
    id: row.id,
    commissionId: row.commission_id,
    customerId: row.customer_id,
    status: row.status,
    kind: row.kind,
    provider: row.provider,
    currency: row.currency,
    amountMinor: row.amount_minor,
    refundedMinor: row.refunded_minor,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function deliverableDto(row: DeliverableRow): DeliverableDto {
  return {
    id: row.id,
    commissionId: row.commission_id,
    customerId: row.customer_id,
    kind: row.kind,
    status: row.status,
    version: row.version_number,
    title: row.title,
    description: row.description,
    fileName: row.file_name,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    releasedAt: row.released_at,
    updatedAt: row.updated_at,
  };
}

async function loadQuote(
  supabase: VeyraSupabaseClient,
  quote: QuoteVersionRow,
  customerId: string,
  latestVersion: number,
): Promise<QuoteDetailDto> {
  const [optionResult, counterofferResult] = await Promise.all([
    supabase
      .from("quote_options")
      .select("*")
      .eq("quote_version_id", quote.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("quote_counteroffers")
      .select("*")
      .eq("quote_version_id", quote.id)
      .eq("customer_id", customerId)
      .order("version_number", { ascending: false }),
  ]);
  assertDatabaseResult(optionResult.error, "customer.quote_options.read", {
    quoteId: quote.id,
  });
  assertDatabaseResult(
    counterofferResult.error,
    "customer.counteroffers.read",
    { quoteId: quote.id },
  );

  const counteroffers: CounterofferDto[] = await Promise.all(
    (counterofferResult.data ?? []).map(
      async (counteroffer: CounterofferRow) => {
        const decisionResult = await supabase
          .from("quote_counteroffer_decisions")
          .select("decision,response_note,decided_at")
          .eq("counteroffer_id", counteroffer.id)
          .maybeSingle();
        assertDatabaseResult(
          decisionResult.error,
          "customer.counteroffer_decision.read",
          { counterofferId: counteroffer.id },
        );
        const decision = decisionResult.data;
        const option = (optionResult.data ?? []).find(
          (candidate) => candidate.id === counteroffer.quote_option_id,
        );
        const originalTotalMinor =
          option?.total_minor ?? counteroffer.proposed_total_minor;
        const originalDepositMinor =
          option?.deposit_minor ?? counteroffer.proposed_deposit_minor;
        return {
          id: counteroffer.id,
          optionId: counteroffer.quote_option_id,
          optionTitle: option?.title ?? "Quote option",
          version: counteroffer.version_number,
          status: counteroffer.status,
          proposedTotalMinor: counteroffer.proposed_total_minor,
          proposedDepositMinor: counteroffer.proposed_deposit_minor,
          originalTotalMinor,
          originalDepositMinor,
          totalDifferenceMinor:
            counteroffer.proposed_total_minor - originalTotalMinor,
          depositDifferenceMinor:
            counteroffer.proposed_deposit_minor - originalDepositMinor,
          proposedScope: counteroffer.proposed_scope,
          currency: counteroffer.currency,
          note: counteroffer.customer_note,
          submittedAt: counteroffer.submitted_at,
          ...(decision
            ? {
                decision: {
                  decision: decision.decision,
                  note: decision.response_note,
                  decidedAt: decision.decided_at,
                },
              }
            : {}),
        };
      },
    ),
  );

  return {
    id: quote.id,
    designRequestId: quote.design_request_id,
    version: quote.version_number,
    status: quote.status,
    title: quote.title,
    introduction: quote.introduction,
    terms: quote.terms,
    currency: quote.currency,
    productionWeeks: quote.production_weeks,
    validUntil: quote.valid_until,
    sentAt: quote.sent_at,
    createdAt: quote.created_at,
    options: (optionResult.data ?? []).map(quoteOptionDto),
    counteroffers,
    isLatest: quote.version_number === latestVersion,
  };
}

async function assertOwnedRequest(
  supabase: VeyraSupabaseClient,
  requestId: string,
  customerId: string,
): Promise<DesignRequestRow | null> {
  const result = await supabase
    .from("design_requests")
    .select("*")
    .eq("id", requestId)
    .eq("customer_id", customerId)
    .maybeSingle();
  assertDatabaseResult(result.error, "customer.request.read", { requestId });
  return result.data;
}

async function assertOwnedCommission(
  supabase: VeyraSupabaseClient,
  commissionId: string,
  customerId: string,
): Promise<CommissionRow | null> {
  const result = await supabase
    .from("commissions")
    .select("*")
    .eq("id", commissionId)
    .eq("customer_id", customerId)
    .maybeSingle();
  assertDatabaseResult(result.error, "customer.commission.read", {
    commissionId,
  });
  return result.data;
}

async function countCustomerUnreadMessages(
  supabase: VeyraSupabaseClient,
  customerId: string,
): Promise<number> {
  const conversationResult = await supabase
    .from("conversations")
    .select("id")
    .eq("customer_id", customerId);
  assertDatabaseResult(
    conversationResult.error,
    "customer.dashboard.conversations",
  );
  const conversationIds = (conversationResult.data ?? []).map(
    (conversation) => conversation.id,
  );
  if (conversationIds.length === 0) {
    return 0;
  }
  const markerResult = await supabase
    .from("conversation_read_markers")
    .select("conversation_id,last_read_at,last_read_message_id")
    .eq("user_id", customerId)
    .in("conversation_id", conversationIds);
  assertDatabaseResult(markerResult.error, "customer.dashboard.read_markers");
  const markers = new Map(
    (markerResult.data ?? []).map((marker) => [marker.conversation_id, marker]),
  );
  const counts = await Promise.all(
    conversationIds.map(async (conversationId) => {
      const marker = markers.get(conversationId);
      let builder = supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .in("sender_kind", ["admin", "system"]);
      if (marker) {
        builder = builder.or(
          unreadMessagesAfterFilter({
            sentAt: marker.last_read_at,
            messageId: marker.last_read_message_id,
          }),
        );
      }
      const result = await builder;
      assertDatabaseResult(result.error, "customer.dashboard.unread_messages", {
        conversationId,
      });
      return result.count ?? 0;
    }),
  );
  return counts.reduce((total, count) => total + count, 0);
}

export async function getCustomerDashboard(): Promise<CustomerDashboardDto> {
  const user = await requireCustomerDataUser();
  const supabase = await createServerSupabaseClient();
  const [
    requestCount,
    commissionCount,
    unreadMessageTotal,
    paymentDueCount,
    recentRequests,
    recentCommissions,
  ] = await Promise.all([
    supabase
      .from("design_requests")
      .select("*", { count: "exact", head: true })
      .eq("customer_id", user.id)
      .in("status", ["draft", "open", "quoted", "negotiating"]),
    supabase
      .from("commissions")
      .select("*", { count: "exact", head: true })
      .eq("customer_id", user.id)
      .in("status", [...ACTIVE_COMMISSION_STATUSES]),
    countCustomerUnreadMessages(supabase, user.id),
    supabase
      .from("commissions")
      .select("*", { count: "exact", head: true })
      .eq("customer_id", user.id)
      .eq("status", "final_payment_due"),
    supabase
      .from("design_requests")
      .select("*")
      .eq("customer_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(3),
    supabase
      .from("commissions")
      .select("*")
      .eq("customer_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(3),
  ]);
  for (const [event, result] of [
    ["customer.dashboard.requests", requestCount],
    ["customer.dashboard.commissions", commissionCount],
    ["customer.dashboard.payments", paymentDueCount],
    ["customer.dashboard.recent_requests", recentRequests],
    ["customer.dashboard.recent_commissions", recentCommissions],
  ] as const) {
    assertDatabaseResult(result.error, event);
  }

  const recent = [
    ...(recentRequests.data ?? []).map((request) => ({
      id: request.id,
      href: `/app/requests/${request.id}`,
      title: request.title,
      description: request.reference_code,
      status: request.status,
      occurredAt: request.updated_at,
    })),
    ...(recentCommissions.data ?? []).map((commission) => ({
      id: commission.id,
      href: `/app/commissions/${commission.id}`,
      title: commission.accepted_title,
      description: commission.reference_code,
      status: commission.status,
      occurredAt: commission.updated_at,
    })),
  ]
    .sort(
      (left, right) =>
        Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
    )
    .slice(0, 5);

  return {
    displayName: user.displayName ?? "Collector",
    activeRequestCount: requestCount.count ?? 0,
    activeCommissionCount: commissionCount.count ?? 0,
    unreadMessageCount: unreadMessageTotal,
    outstandingPaymentCount: paymentDueCount.count ?? 0,
    recent,
  };
}

export async function listCustomerDesignRequests(
  input: ListQuery = {},
): Promise<PageResult<DesignRequestListItemDto>> {
  const user = await requireCustomerDataUser();
  const supabase = await createServerSupabaseClient();
  const { page, pageSize, query, status } = normalizeListQuery(input);
  const from = (page - 1) * pageSize;
  let builder = supabase
    .from("design_requests")
    .select("*", { count: "exact" })
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (query) {
    builder = builder.ilike("title", safeSearchPattern(query));
  }
  if (
    status &&
    [
      "draft",
      "open",
      "quoted",
      "negotiating",
      "accepted",
      "declined",
      "closed",
    ].includes(status)
  ) {
    builder = builder.eq("status", status as DesignRequestRow["status"]);
  }
  const result = await builder;
  assertDatabaseResult(result.error, "customer.requests.list");
  return toPageResult(
    (result.data ?? []).map(requestListDto),
    result.count,
    page,
    pageSize,
  );
}

export async function getCustomerDesignRequest(
  requestId: string,
): Promise<DesignRequestDetailDto | null> {
  const user = await requireCustomerDataUser();
  const supabase = await createServerSupabaseClient();
  const request = await assertOwnedRequest(supabase, requestId, user.id);
  if (!request) {
    return null;
  }
  const [attachmentResult, conversationResult, quoteResult] = await Promise.all(
    [
      supabase
        .from("design_request_attachments")
        .select("*")
        .eq("design_request_id", request.id)
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("conversations")
        .select("id")
        .eq("design_request_id", request.id)
        .eq("customer_id", user.id)
        .maybeSingle(),
      supabase
        .from("quote_lifecycle")
        .select("*")
        .eq("design_request_id", request.id)
        .neq("status", "draft")
        .order("version_number", { ascending: false }),
    ],
  );
  assertDatabaseResult(
    attachmentResult.error,
    "customer.request_attachments.read",
    { requestId },
  );
  assertDatabaseResult(
    conversationResult.error,
    "customer.request_conversation.read",
    { requestId },
  );
  assertDatabaseResult(quoteResult.error, "customer.request_quotes.read", {
    requestId,
  });
  const quoteRows = quoteResult.data ?? [];
  const latestVersion = quoteRows[0]?.version_number ?? 0;
  const quotes = await Promise.all(
    quoteRows.map((quote) =>
      loadQuote(supabase, quote, user.id, latestVersion),
    ),
  );
  return {
    ...requestListDto(request),
    occasion: request.occasion,
    description: request.description,
    metalPreferences: request.metal_preferences,
    stonePreferences: request.stone_preferences,
    ringSize: request.ring_size,
    inspirationNotes: request.inspiration_notes,
    submittedAt: request.submitted_at,
    attachments: (attachmentResult.data ?? []).map((attachment) => ({
      id: attachment.id,
      fileName: attachment.file_name,
      mimeType: attachment.mime_type,
      byteSize: attachment.byte_size,
    })),
    conversationId: conversationResult.data?.id ?? null,
    quotes,
  };
}

export async function getCustomerQuote(
  quoteId: string,
): Promise<QuoteDetailDto | null> {
  const user = await requireCustomerDataUser();
  const supabase = await createServerSupabaseClient();
  const quoteResult = await supabase
    .from("quote_lifecycle")
    .select("*")
    .eq("id", quoteId)
    .neq("status", "draft")
    .maybeSingle();
  assertDatabaseResult(quoteResult.error, "customer.quote.read", { quoteId });
  if (!quoteResult.data) {
    return null;
  }
  const request = await assertOwnedRequest(
    supabase,
    quoteResult.data.design_request_id,
    user.id,
  );
  if (!request) {
    return null;
  }
  const latestResult = await supabase
    .from("quote_lifecycle")
    .select("version_number")
    .eq("design_request_id", request.id)
    .neq("status", "draft")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  assertDatabaseResult(latestResult.error, "customer.quote_latest.read", {
    quoteId,
  });
  return loadQuote(
    supabase,
    quoteResult.data,
    user.id,
    latestResult.data?.version_number ?? quoteResult.data.version_number,
  );
}

async function conversationListItem(
  supabase: VeyraSupabaseClient,
  conversation: Tables<"conversations">,
  viewerId: string,
  unreadSender: "customer" | "admin",
): Promise<ConversationListItemDto> {
  const [latestResult, markerResult] = await Promise.all([
    supabase
      .from("messages")
      .select("id,body,sent_at")
      .eq("conversation_id", conversation.id)
      .order("sent_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("conversation_read_markers")
      .select("last_read_at,last_read_message_id")
      .eq("conversation_id", conversation.id)
      .eq("user_id", viewerId)
      .maybeSingle(),
  ]);
  assertDatabaseResult(latestResult.error, "conversation.latest_message.read", {
    conversationId: conversation.id,
  });
  assertDatabaseResult(markerResult.error, "conversation.marker.read", {
    conversationId: conversation.id,
  });
  let unreadBuilder = supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversation.id)
    .eq("sender_kind", unreadSender);
  if (markerResult.data?.last_read_at) {
    unreadBuilder = unreadBuilder.or(
      unreadMessagesAfterFilter({
        sentAt: markerResult.data.last_read_at,
        messageId: markerResult.data.last_read_message_id,
      }),
    );
  }
  const unreadResult = await unreadBuilder;
  assertDatabaseResult(unreadResult.error, "conversation.unread.read", {
    conversationId: conversation.id,
  });
  return {
    id: conversation.id,
    customerId: conversation.customer_id,
    subject: conversation.subject,
    status: conversation.status,
    updatedAt: conversation.updated_at,
    latestMessage: latestResult.data?.body || "No messages yet",
    latestMessageAt: latestResult.data?.sent_at ?? null,
    unreadCount: unreadResult.count ?? 0,
  };
}

export async function listCustomerConversations(
  input: ListQuery = {},
): Promise<PageResult<ConversationListItemDto>> {
  const user = await requireCustomerDataUser();
  const supabase = await createServerSupabaseClient();
  const { page, pageSize, query, status } = normalizeListQuery(input);
  const from = (page - 1) * pageSize;
  let builder = supabase
    .from("conversations")
    .select("*", { count: "exact" })
    .eq("customer_id", user.id)
    .order("updated_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (query) {
    builder = builder.ilike("subject", safeSearchPattern(query));
  }
  if (status && ["open", "archived", "closed"].includes(status)) {
    builder = builder.eq("status", status as Tables<"conversations">["status"]);
  }
  const result = await builder;
  assertDatabaseResult(result.error, "customer.conversations.list");
  const items = await Promise.all(
    (result.data ?? []).map((conversation) =>
      conversationListItem(supabase, conversation, user.id, "admin"),
    ),
  );
  return toPageResult(items, result.count, page, pageSize);
}

export async function getCustomerConversation(
  conversationId: string,
  cursor?: string,
): Promise<ConversationDetailDto | null> {
  const user = await requireCustomerDataUser();
  const supabase = await createServerSupabaseClient();
  const conversationResult = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("customer_id", user.id)
    .maybeSingle();
  assertDatabaseResult(conversationResult.error, "customer.conversation.read", {
    conversationId,
  });
  const conversation = conversationResult.data;
  if (!conversation) {
    return null;
  }

  let messageBuilder = supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversation.id)
    .order("sent_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(41);
  if (cursor) {
    const parsed = decodeMessageCursor(cursor);
    messageBuilder = messageBuilder.or(
      `sent_at.lt.${parsed.createdAt},and(sent_at.eq.${parsed.createdAt},id.lt.${parsed.id})`,
    );
  }
  const messageResult = await messageBuilder;
  assertDatabaseResult(messageResult.error, "customer.messages.read", {
    conversationId,
  });
  const rows = messageResult.data ?? [];
  const hasMore = rows.length > 40;
  const pageRows = rows.slice(0, 40);
  const messageIds = pageRows.map((message) => message.id);
  const attachmentResult =
    messageIds.length > 0
      ? await supabase
          .from("message_attachments")
          .select("*")
          .in("message_id", messageIds)
      : { data: [], error: null };
  assertDatabaseResult(attachmentResult.error, "customer.attachments.read", {
    conversationId,
  });
  const attachmentsByMessage = new Map<string, AttachmentDto[]>();
  for (const attachment of attachmentResult.data ?? []) {
    if (!attachment.message_id) {
      continue;
    }
    const existing = attachmentsByMessage.get(attachment.message_id) ?? [];
    existing.push({
      id: attachment.id,
      fileName: attachment.file_name,
      mimeType: attachment.mime_type,
      byteSize: attachment.byte_size,
    });
    attachmentsByMessage.set(attachment.message_id, existing);
  }
  const messages: MessageDto[] = [...pageRows].reverse().map((message) => ({
    id: message.id,
    senderId: message.sender_id,
    senderName:
      message.sender_kind === "customer"
        ? (user.displayName ?? "You")
        : message.sender_kind === "admin"
          ? "Veyra Atelier"
          : "Atelier update",
    senderRole: message.sender_kind,
    text: message.body,
    sentAt: message.sent_at,
    isOwn: message.sender_id === user.id,
    attachments: attachmentsByMessage.get(message.id) ?? [],
  }));
  const oldest = pageRows.at(-1);
  return {
    id: conversation.id,
    customerId: conversation.customer_id,
    customerName: user.displayName ?? "Collector",
    designRequestId: conversation.design_request_id,
    subject: conversation.subject,
    status: conversation.status,
    messages,
    nextCursor:
      hasMore && oldest
        ? encodeMessageCursor({ createdAt: oldest.sent_at, id: oldest.id })
        : null,
  };
}

export async function listCustomerCommissions(
  input: ListQuery = {},
): Promise<PageResult<CommissionListItemDto>> {
  const user = await requireCustomerDataUser();
  const supabase = await createServerSupabaseClient();
  const { page, pageSize, query, status } = normalizeListQuery(input);
  const from = (page - 1) * pageSize;
  let builder = supabase
    .from("commissions")
    .select("*", { count: "exact" })
    .eq("customer_id", user.id)
    .order("updated_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (query) {
    builder = builder.ilike("accepted_title", safeSearchPattern(query));
  }
  if (
    status &&
    [...ACTIVE_COMMISSION_STATUSES, "completed", "cancelled"].includes(
      status as (typeof ACTIVE_COMMISSION_STATUSES)[number],
    )
  ) {
    builder = builder.eq("status", status as CommissionRow["status"]);
  }
  const result = await builder;
  assertDatabaseResult(result.error, "customer.commissions.list");
  return toPageResult(
    (result.data ?? []).map(commissionListDto),
    result.count,
    page,
    pageSize,
  );
}

async function loadDrafts(
  supabase: VeyraSupabaseClient,
  commissionId: string,
  customerId: string,
): Promise<DraftRevisionDto[]> {
  const draftResult = await supabase
    .from("design_drafts")
    .select("*")
    .eq("commission_id", commissionId)
    .order("sequence_number", { ascending: true });
  assertDatabaseResult(draftResult.error, "customer.drafts.read", {
    commissionId,
  });
  const output: DraftRevisionDto[] = [];
  for (const draft of draftResult.data ?? []) {
    const revisionResult = await supabase
      .from("draft_revisions")
      .select("*")
      .eq("design_draft_id", draft.id)
      .order("revision_number", { ascending: true });
    assertDatabaseResult(
      revisionResult.error,
      "customer.draft_revisions.read",
      {
        draftId: draft.id,
      },
    );
    for (const revision of revisionResult.data ?? []) {
      const [assetResult, feedbackResult] = await Promise.all([
        supabase
          .from("draft_revision_assets")
          .select("*")
          .eq("draft_revision_id", revision.id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("draft_feedback")
          .select("*")
          .eq("draft_revision_id", revision.id)
          .eq("customer_id", customerId)
          .order("created_at", { ascending: true }),
      ]);
      assertDatabaseResult(assetResult.error, "customer.draft_assets.read", {
        revisionId: revision.id,
      });
      assertDatabaseResult(
        feedbackResult.error,
        "customer.draft_feedback.read",
        { revisionId: revision.id },
      );
      output.push({
        id: revision.id,
        draftId: draft.id,
        draftSequence: draft.sequence_number,
        revisionNumber: revision.revision_number,
        parentStatus: draft.status,
        parentPublishedAt: draft.published_at,
        stage: draft.stage,
        title: draft.title,
        status: revision.status,
        summary: revision.summary,
        specifications: revision.specifications,
        customerMessage: revision.customer_message,
        publishedAt: revision.published_at,
        assets: (assetResult.data ?? []).map((asset) => ({
          id: asset.id,
          fileName: asset.file_name,
          mimeType: asset.mime_type,
          byteSize: asset.byte_size,
          sortOrder: asset.sort_order,
        })),
        feedback: (feedbackResult.data ?? []).map((feedback) => ({
          id: feedback.id,
          kind: feedback.kind,
          body: feedback.body,
          createdAt: feedback.created_at,
        })),
      });
    }
  }
  return output;
}

function includedRevisionRounds(snapshot: unknown): number {
  const value = jsonObject(snapshot).includedRevisionRounds;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

export async function getCustomerCommission(
  commissionId: string,
): Promise<CommissionDetailDto | null> {
  const user = await requireCustomerDataUser();
  const supabase = await createServerSupabaseClient();
  const commission = await assertOwnedCommission(
    supabase,
    commissionId,
    user.id,
  );
  if (!commission) {
    return null;
  }
  const [
    historyResult,
    paymentResult,
    deliverableResult,
    aftercareResult,
    drafts,
  ] = await Promise.all([
    supabase
      .from("commission_status_history")
      .select("*")
      .eq("commission_id", commission.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("payments")
      .select("*")
      .eq("commission_id", commission.id)
      .eq("customer_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("deliverables")
      .select("*")
      .eq("commission_id", commission.id)
      .eq("customer_id", user.id)
      .order("version_number", { ascending: false }),
    supabase
      .from("aftercare_cases")
      .select("*")
      .eq("commission_id", commission.id)
      .eq("customer_id", user.id)
      .order("opened_at", { ascending: false }),
    loadDrafts(supabase, commission.id, user.id),
  ]);
  assertDatabaseResult(
    historyResult.error,
    "customer.commission_history.read",
    {
      commissionId,
    },
  );
  assertDatabaseResult(paymentResult.error, "customer.payments.read", {
    commissionId,
  });
  assertDatabaseResult(deliverableResult.error, "customer.deliverables.read", {
    commissionId,
  });
  assertDatabaseResult(aftercareResult.error, "customer.aftercare_cases.read", {
    commissionId,
  });
  const aftercareCaseIds = (aftercareResult.data ?? []).map(
    (aftercareCase) => aftercareCase.id,
  );
  const completionResult =
    aftercareCaseIds.length > 0
      ? await supabase
          .from("aftercare_completions")
          .select("aftercare_case_id,resolution_summary")
          .in("aftercare_case_id", aftercareCaseIds)
      : { data: [], error: null };
  assertDatabaseResult(
    completionResult.error,
    "customer.aftercare_completions.read",
    { commissionId },
  );
  const resolutionByCase = new Map(
    (completionResult.data ?? []).map((completion) => [
      completion.aftercare_case_id,
      completion.resolution_summary,
    ]),
  );
  const usedRevisionRounds = drafts.reduce(
    (count, revision) =>
      count +
      revision.feedback.filter(
        (feedback) => feedback.kind === "changes_requested",
      ).length,
    0,
  );
  return {
    ...commissionListDto(commission),
    acceptedQuoteVersion: commission.accepted_quote_version,
    acceptedScope: commission.accepted_scope,
    acceptedTerms: commission.accepted_terms,
    acceptedProductionWeeks: commission.accepted_production_weeks,
    acceptedOptionSnapshot: commission.accepted_option_snapshot,
    acceptedAt: commission.accepted_at,
    startedAt: commission.started_at,
    deliveredAt: commission.delivered_at,
    timeline: (historyResult.data ?? []).map((event) => ({
      id: event.id,
      fromStatus: event.from_status,
      toStatus: event.to_status,
      actor: event.actor,
      reason: event.reason,
      occurredAt: event.created_at,
    })),
    drafts,
    payments: (paymentResult.data ?? []).map(paymentDto),
    deliverables: (deliverableResult.data ?? []).map(deliverableDto),
    aftercareCases: (aftercareResult.data ?? []).map((aftercareCase) => ({
      id: aftercareCase.id,
      commissionId: aftercareCase.commission_id,
      status: aftercareCase.status,
      category: aftercareCase.category,
      subject: aftercareCase.subject,
      description: aftercareCase.description,
      openedAt: aftercareCase.opened_at,
      completedAt: aftercareCase.completed_at,
      resolution: resolutionByCase.get(aftercareCase.id) ?? null,
    })),
    includedRevisionRounds: includedRevisionRounds(
      commission.accepted_option_snapshot,
    ),
    usedRevisionRounds,
  };
}

export async function listCustomerPayments(
  input: ListQuery = {},
): Promise<PageResult<PaymentDto>> {
  const user = await requireCustomerDataUser();
  const supabase = await createServerSupabaseClient();
  const { page, pageSize, status, query, sort } = normalizeListQuery(input);
  const from = (page - 1) * pageSize;
  let matchingCommissionIds: string[] | null = null;
  if (query) {
    const commissionResult = await supabase
      .from("commissions")
      .select("id")
      .eq("customer_id", user.id)
      .ilike("accepted_title", safeSearchPattern(query));
    assertDatabaseResult(
      commissionResult.error,
      "customer.payments.search_commissions",
    );
    matchingCommissionIds = (commissionResult.data ?? []).map(
      (commission) => commission.id,
    );
    if (matchingCommissionIds.length === 0) {
      return toPageResult([], 0, page, pageSize);
    }
  }
  let builder = supabase
    .from("payments")
    .select("*", { count: "exact" })
    .eq("customer_id", user.id)
    .order(sort === "amount_high" ? "amount_minor" : "updated_at", {
      ascending: sort === "oldest" || sort === "amount_low",
    })
    .range(from, from + pageSize - 1);
  if (matchingCommissionIds) {
    builder = builder.in("commission_id", matchingCommissionIds);
  }
  if (
    status &&
    [
      "not_started",
      "pending",
      "processing",
      "succeeded",
      "failed",
      "cancelled",
      "partially_refunded",
      "refunded",
    ].includes(status)
  ) {
    builder = builder.eq("status", status as PaymentRow["status"]);
  }
  const result = await builder;
  assertDatabaseResult(result.error, "customer.payments.list");
  const items = await Promise.all(
    (result.data ?? []).map(async (payment) => {
      const commissionResult = await supabase
        .from("commissions")
        .select("reference_code,accepted_title")
        .eq("id", payment.commission_id)
        .eq("customer_id", user.id)
        .maybeSingle();
      assertDatabaseResult(
        commissionResult.error,
        "customer.payment_commission.read",
        { paymentId: payment.id },
      );
      return {
        ...paymentDto(payment),
        commissionReference: commissionResult.data
          ? `${commissionResult.data.reference_code} · ${commissionResult.data.accepted_title}`
          : "Commission",
      };
    }),
  );
  return toPageResult(items, result.count, page, pageSize);
}

export async function listCustomerDeliverables(
  input: ListQuery = {},
): Promise<PageResult<DeliverableDto>> {
  const user = await requireCustomerDataUser();
  const supabase = await createServerSupabaseClient();
  const { page, pageSize, query, sort } = normalizeListQuery(input);
  const from = (page - 1) * pageSize;
  let builder = supabase
    .from("deliverables")
    .select("*", { count: "exact" })
    .eq("customer_id", user.id)
    .eq("status", "released")
    .order(sort === "title" ? "title" : "released_at", {
      ascending: sort === "oldest" || sort === "title",
    })
    .range(from, from + pageSize - 1);
  if (query) {
    builder = builder.ilike("title", safeSearchPattern(query));
  }
  const result = await builder;
  assertDatabaseResult(result.error, "customer.deliverables.list");
  return toPageResult(
    (result.data ?? []).map(deliverableDto),
    result.count,
    page,
    pageSize,
  );
}

export async function getCustomerHistory(
  input: ListQuery = {},
): Promise<CustomerHistoryPage> {
  await requireCustomerDataUser();
  const supabase = await createServerSupabaseClient();
  const { pageSize, query, status } = normalizeListQuery(input, 25);
  const command = createCustomerHistoryRpcCommand({
    limit: pageSize,
    cursor: decodeCustomerHistoryCursor(input.cursor),
    query: query ?? null,
    types: historyTypesForFilter(status),
  });
  const result = await supabase.rpc(command.name, command.args);
  assertDatabaseResult(result.error, "customer.history.read");
  return mapCustomerHistoryPage(result.data ?? []);
}

export async function getCustomerProfile(): Promise<ProfileDto> {
  const user = await requireCustomerDataUser();
  const supabase = await createServerSupabaseClient();
  const [profileResult, preferenceResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("notification_preferences")
      .select("*")
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);
  assertDatabaseResult(profileResult.error, "customer.profile.read");
  assertDatabaseResult(
    preferenceResult.error,
    "customer.notification_preferences.read",
  );
  const profile = profileResult.data;
  const preferences = preferenceResult.data;
  return {
    id: user.id,
    email: user.email,
    displayName: profile.display_name,
    phone: profile.phone_e164,
    timeZone: profile.preferred_timezone,
    marketingConsent: profile.marketing_consent,
    notifications: {
      emailEnabled: preferences?.email_enabled ?? true,
      smsEnabled: preferences?.sms_enabled ?? false,
      inAppEnabled: preferences?.in_app_enabled ?? true,
      commissionUpdates: preferences?.commission_updates ?? true,
      messageUpdates: preferences?.message_updates ?? true,
      quoteUpdates: preferences?.quote_updates ?? true,
      paymentUpdates: preferences?.payment_updates ?? true,
      marketingUpdates: preferences?.marketing_updates ?? false,
      quietHoursStart: preferences?.quiet_hours_start ?? null,
      quietHoursEnd: preferences?.quiet_hours_end ?? null,
    },
  };
}
