import "server-only";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/dal";
import { AuthenticationError } from "@/lib/auth/errors";
import {
  decodeMessageCursor,
  encodeMessageCursor,
} from "@/lib/domain/messages";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { VeyraSupabaseClient } from "@/lib/supabase/types";
import type { Database, Json, Tables } from "@/types/database.generated";
import {
  createRankedInboxRpcCommand,
  decodeRankedInboxCursor,
  mapRankedInboxPage,
} from "@/features/application/inbox-model";
import { unreadMessagesAfterFilter } from "@/features/application/message-position";

import {
  assertDatabaseResult,
  jsonObject,
  jsonString,
  normalizeListQuery,
  safeSearchPattern,
  toPageResult,
} from "./shared";
import { readPublishedQuoteValidityDays } from "./site-settings";
import type {
  AdminCustomerDetailDto,
  AdminCustomerDto,
  AdminDashboardDto,
  AuditEntryDto,
  CommissionDetailDto,
  CommissionListItemDto,
  ConversationDetailDto,
  ConversationListItemDto,
  CounterofferDto,
  DeliverableDto,
  DesignRequestDetailDto,
  DesignRequestListItemDto,
  DraftRevisionDto,
  ListQuery,
  PageResult,
  PaymentDto,
  PortfolioProjectDto,
  QuoteDetailDto,
  QuoteOptionDto,
  RankedInboxPage,
  AdminPublicSiteSettingsDto,
} from "./types";

type RequestRow = Tables<"design_requests">;
type CommissionRow = Tables<"commissions">;
type QuoteRow = Database["public"]["Views"]["quote_lifecycle"]["Row"];
type QuoteOptionRow = Tables<"quote_options">;
type PaymentRow = Tables<"payments">;
type DeliverableRow = Tables<"deliverables">;

async function requireAdminDataUser() {
  try {
    return await requireAdmin();
  } catch (error) {
    if (error instanceof AuthenticationError && error.code === "forbidden") {
      redirect("/app");
    }
    redirect("/sign-in?next=/admin");
  }
}

const COMMISSION_STATUSES = [
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
] as const;

function requestDto(row: RequestRow): DesignRequestListItemDto {
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

function commissionDto(row: CommissionRow): CommissionListItemDto {
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

function parseLineItems(value: Json): QuoteOptionDto["lineItems"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((candidate) => {
    const item = jsonObject(candidate);
    const description =
      typeof item.description === "string" ? item.description : null;
    const amountValue =
      typeof item.amountMinor === "number"
        ? item.amountMinor
        : jsonObject(item.amount).amountMinor;
    return description && typeof amountValue === "number"
      ? [{ description, amountMinor: amountValue }]
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
    materials: jsonString(scope, "materials", "Specified with the customer"),
    stoneAssumptions: jsonString(
      scope,
      "stoneAssumptions",
      "Specified with the customer",
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

async function profileName(
  supabase: VeyraSupabaseClient,
  profileId: string,
): Promise<string> {
  const result = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", profileId)
    .maybeSingle();
  assertDatabaseResult(result.error, "admin.profile_name.read", { profileId });
  return result.data?.display_name?.trim() || "Customer";
}

async function conversationItem(
  supabase: VeyraSupabaseClient,
  conversation: Tables<"conversations">,
  adminId: string,
): Promise<ConversationListItemDto> {
  const [messageResult, markerResult, customerName] = await Promise.all([
    supabase
      .from("messages")
      .select("body,sent_at")
      .eq("conversation_id", conversation.id)
      .order("sent_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("conversation_read_markers")
      .select("last_read_at,last_read_message_id")
      .eq("conversation_id", conversation.id)
      .eq("user_id", adminId)
      .maybeSingle(),
    profileName(supabase, conversation.customer_id),
  ]);
  assertDatabaseResult(messageResult.error, "admin.inbox_latest.read", {
    conversationId: conversation.id,
  });
  assertDatabaseResult(markerResult.error, "admin.inbox_marker.read", {
    conversationId: conversation.id,
  });
  let unreadBuilder = supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversation.id)
    .eq("sender_kind", "customer");
  if (markerResult.data?.last_read_at) {
    unreadBuilder = unreadBuilder.or(
      unreadMessagesAfterFilter({
        sentAt: markerResult.data.last_read_at,
        messageId: markerResult.data.last_read_message_id,
      }),
    );
  }
  const unreadResult = await unreadBuilder;
  assertDatabaseResult(unreadResult.error, "admin.inbox_unread.read", {
    conversationId: conversation.id,
  });
  return {
    id: conversation.id,
    customerId: conversation.customer_id,
    customerName,
    subject: conversation.subject,
    status: conversation.status,
    updatedAt: conversation.updated_at,
    latestMessage: messageResult.data?.body || "No messages yet",
    latestMessageAt: messageResult.data?.sent_at ?? null,
    unreadCount: unreadResult.count ?? 0,
  };
}

async function quoteDetail(
  supabase: VeyraSupabaseClient,
  quote: QuoteRow,
  latestVersion: number,
): Promise<QuoteDetailDto> {
  const [optionsResult, counterofferResult] = await Promise.all([
    supabase
      .from("quote_options")
      .select("*")
      .eq("quote_version_id", quote.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("quote_counteroffers")
      .select("*")
      .eq("quote_version_id", quote.id)
      .order("version_number", { ascending: false }),
  ]);
  assertDatabaseResult(optionsResult.error, "admin.quote_options.read", {
    quoteId: quote.id,
  });
  assertDatabaseResult(
    counterofferResult.error,
    "admin.quote_counteroffers.read",
    { quoteId: quote.id },
  );
  const counteroffers: CounterofferDto[] = await Promise.all(
    (counterofferResult.data ?? []).map(async (counteroffer) => {
      const decisionResult = await supabase
        .from("quote_counteroffer_decisions")
        .select("decision,response_note,decided_at")
        .eq("counteroffer_id", counteroffer.id)
        .maybeSingle();
      assertDatabaseResult(
        decisionResult.error,
        "admin.counteroffer_decision.read",
        { counterofferId: counteroffer.id },
      );
      const option = (optionsResult.data ?? []).find(
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
        ...(decisionResult.data
          ? {
              decision: {
                decision: decisionResult.data.decision,
                note: decisionResult.data.response_note,
                decidedAt: decisionResult.data.decided_at,
              },
            }
          : {}),
      };
    }),
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
    options: (optionsResult.data ?? []).map(quoteOptionDto),
    counteroffers,
    isLatest: quote.version_number === latestVersion,
  };
}

export async function getAdminDashboard(): Promise<AdminDashboardDto> {
  await requireAdminDataUser();
  const supabase = await createServerSupabaseClient();
  const [
    requestCount,
    commissionCount,
    attentionCount,
    dueCount,
    conversationCount,
    requests,
    commissions,
  ] = await Promise.all([
    supabase
      .from("design_requests")
      .select("*", { count: "exact", head: true })
      .in("status", ["open", "quoted", "negotiating"]),
    supabase
      .from("commissions")
      .select("*", { count: "exact", head: true })
      .not("status", "in", '("completed","cancelled")'),
    supabase
      .from("commissions")
      .select("*", { count: "exact", head: true })
      .in("status", [
        "awaiting_admin_confirmation",
        "revision_requested",
        "disputed",
      ]),
    supabase
      .from("commissions")
      .select("*", { count: "exact", head: true })
      .eq("status", "final_payment_due"),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("status", "open"),
    supabase
      .from("design_requests")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(3),
    supabase
      .from("commissions")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(3),
  ]);
  for (const [event, result] of [
    ["admin.dashboard.requests", requestCount],
    ["admin.dashboard.commissions", commissionCount],
    ["admin.dashboard.attention", attentionCount],
    ["admin.dashboard.due", dueCount],
    ["admin.dashboard.conversations", conversationCount],
    ["admin.dashboard.recent_requests", requests],
    ["admin.dashboard.recent_commissions", commissions],
  ] as const) {
    assertDatabaseResult(result.error, event);
  }
  const recent = [
    ...(requests.data ?? []).map((request) => ({
      id: request.id,
      href: `/admin/requests/${request.id}`,
      title: request.title,
      description: request.reference_code,
      status: request.status,
      occurredAt: request.updated_at,
    })),
    ...(commissions.data ?? []).map((commission) => ({
      id: commission.id,
      href: `/admin/commissions/${commission.id}`,
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
    openRequestCount: requestCount.count ?? 0,
    activeCommissionCount: commissionCount.count ?? 0,
    attentionCommissionCount: attentionCount.count ?? 0,
    paymentDueCount: dueCount.count ?? 0,
    openConversationCount: conversationCount.count ?? 0,
    recent,
  };
}

export async function listAdminConversations(
  input: ListQuery = {},
): Promise<RankedInboxPage> {
  const admin = await requireAdminDataUser();
  const supabase = await createServerSupabaseClient();
  const { pageSize, query, status } = normalizeListQuery(input, 25);
  const parsedStatus =
    status && ["open", "archived", "closed"].includes(status)
      ? (status as "open" | "archived" | "closed")
      : null;
  const command = createRankedInboxRpcCommand({
    limit: pageSize,
    cursor: decodeRankedInboxCursor(input.cursor),
    query: query ?? null,
    status: parsedStatus,
    unreadOnly: input.unreadOnly ?? false,
  });
  const result = await supabase.rpc(command.name, command.args);
  assertDatabaseResult(result.error, "admin.inbox.list");
  return mapRankedInboxPage(result.data ?? [], admin.id);
}

export async function getAdminConversation(
  conversationId: string,
  cursor?: string,
): Promise<ConversationDetailDto | null> {
  const admin = await requireAdminDataUser();
  const supabase = await createServerSupabaseClient();
  const conversationResult = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();
  assertDatabaseResult(conversationResult.error, "admin.inbox_detail.read", {
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
  const [messageResult, customerName] = await Promise.all([
    messageBuilder,
    profileName(supabase, conversation.customer_id),
  ]);
  assertDatabaseResult(messageResult.error, "admin.inbox_messages.read", {
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
  assertDatabaseResult(attachmentResult.error, "admin.inbox_attachments.read", {
    conversationId,
  });
  const attachments = new Map<
    string,
    {
      id: string;
      fileName: string;
      mimeType: string;
      byteSize: number;
    }[]
  >();
  for (const attachment of attachmentResult.data ?? []) {
    if (!attachment.message_id) {
      continue;
    }
    const list = attachments.get(attachment.message_id) ?? [];
    list.push({
      id: attachment.id,
      fileName: attachment.file_name,
      mimeType: attachment.mime_type,
      byteSize: attachment.byte_size,
    });
    attachments.set(attachment.message_id, list);
  }
  const oldestMessage = pageRows.at(-1);
  return {
    id: conversation.id,
    customerId: conversation.customer_id,
    customerName,
    designRequestId: conversation.design_request_id,
    subject: conversation.subject,
    status: conversation.status,
    messages: [...pageRows].reverse().map((message) => ({
      id: message.id,
      senderId: message.sender_id,
      senderName:
        message.sender_kind === "admin"
          ? (admin.displayName ?? "Atelier")
          : message.sender_kind === "customer"
            ? customerName
            : "Atelier update",
      senderRole: message.sender_kind,
      text: message.body,
      sentAt: message.sent_at,
      isOwn: message.sender_id === admin.id,
      attachments: attachments.get(message.id) ?? [],
    })),
    nextCursor:
      hasMore && oldestMessage
        ? encodeMessageCursor({
            createdAt: oldestMessage.sent_at,
            id: oldestMessage.id,
          })
        : null,
  };
}

export async function listAdminCustomers(
  input: ListQuery = {},
): Promise<PageResult<AdminCustomerDto>> {
  await requireAdminDataUser();
  const supabase = await createServerSupabaseClient();
  const { page, pageSize, query } = normalizeListQuery(input);
  const from = (page - 1) * pageSize;
  let builder = supabase
    .from("profiles")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (query) {
    builder = builder.ilike("display_name", safeSearchPattern(query));
  }
  const result = await builder;
  assertDatabaseResult(result.error, "admin.customers.list");
  const items = await Promise.all(
    (result.data ?? []).map(async (profile) => {
      const [requestCount, commissionCount] = await Promise.all([
        supabase
          .from("design_requests")
          .select("*", { count: "exact", head: true })
          .eq("customer_id", profile.id),
        supabase
          .from("commissions")
          .select("*", { count: "exact", head: true })
          .eq("customer_id", profile.id),
      ]);
      assertDatabaseResult(
        requestCount.error,
        "admin.customer_requests.count",
        {
          profileId: profile.id,
        },
      );
      assertDatabaseResult(
        commissionCount.error,
        "admin.customer_commissions.count",
        { profileId: profile.id },
      );
      return {
        id: profile.id,
        displayName: profile.display_name?.trim() || "Unnamed customer",
        phone: profile.phone_e164,
        timeZone: profile.preferred_timezone,
        marketingConsent: profile.marketing_consent,
        createdAt: profile.created_at,
        requestCount: requestCount.count ?? 0,
        commissionCount: commissionCount.count ?? 0,
      };
    }),
  );
  return toPageResult(items, result.count, page, pageSize);
}

export async function getAdminCustomer(
  customerId: string,
): Promise<AdminCustomerDetailDto | null> {
  await requireAdminDataUser();
  const supabase = await createServerSupabaseClient();
  const profileResult = await supabase
    .from("profiles")
    .select("*")
    .eq("id", customerId)
    .maybeSingle();
  assertDatabaseResult(profileResult.error, "admin.customer.read", {
    customerId,
  });
  const profile = profileResult.data;
  if (!profile) {
    return null;
  }
  const [requestResult, commissionResult, conversationResult, noteResult] =
    await Promise.all([
      supabase
        .from("design_requests")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false }),
      supabase
        .from("commissions")
        .select("*")
        .eq("customer_id", customerId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("conversations")
        .select("*")
        .eq("customer_id", customerId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("admin_notes")
        .select("*")
        .eq("profile_id", customerId)
        .order("created_at", { ascending: false }),
    ]);
  for (const [event, result] of [
    ["admin.customer_requests.read", requestResult],
    ["admin.customer_commissions.read", commissionResult],
    ["admin.customer_conversations.read", conversationResult],
    ["admin.customer_notes.read", noteResult],
  ] as const) {
    assertDatabaseResult(result.error, event, { customerId });
  }
  const conversations = await Promise.all(
    (conversationResult.data ?? []).map(async (conversation) => {
      const item = await conversationItem(
        supabase,
        conversation,
        (await requireAdminDataUser()).id,
      );
      return { ...item, customerName: profile.display_name ?? "Customer" };
    }),
  );
  return {
    id: profile.id,
    displayName: profile.display_name?.trim() || "Unnamed customer",
    phone: profile.phone_e164,
    timeZone: profile.preferred_timezone,
    marketingConsent: profile.marketing_consent,
    createdAt: profile.created_at,
    requestCount: requestResult.data?.length ?? 0,
    commissionCount: commissionResult.data?.length ?? 0,
    requests: (requestResult.data ?? []).map(requestDto),
    commissions: (commissionResult.data ?? []).map(commissionDto),
    conversations,
    notes: (noteResult.data ?? []).map((note) => ({
      id: note.id,
      body: note.body,
      authorId: note.author_id,
      createdAt: note.created_at,
    })),
  };
}

export async function listAdminDesignRequests(
  input: ListQuery = {},
): Promise<PageResult<DesignRequestListItemDto>> {
  await requireAdminDataUser();
  const supabase = await createServerSupabaseClient();
  const { page, pageSize, query, status } = normalizeListQuery(input);
  const from = (page - 1) * pageSize;
  let builder = supabase
    .from("design_requests")
    .select("*", { count: "exact" })
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
    builder = builder.eq("status", status as RequestRow["status"]);
  }
  const result = await builder;
  assertDatabaseResult(result.error, "admin.requests.list");
  const items = await Promise.all(
    (result.data ?? []).map(async (request) => ({
      ...requestDto(request),
      customerName: await profileName(supabase, request.customer_id),
    })),
  );
  return toPageResult(items, result.count, page, pageSize);
}

export async function getAdminDesignRequest(
  requestId: string,
): Promise<DesignRequestDetailDto | null> {
  await requireAdminDataUser();
  const supabase = await createServerSupabaseClient();
  const requestResult = await supabase
    .from("design_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  assertDatabaseResult(requestResult.error, "admin.request.read", {
    requestId,
  });
  const request = requestResult.data;
  if (!request) {
    return null;
  }
  const [attachmentsResult, conversationResult, quotesResult, customerName] =
    await Promise.all([
      supabase
        .from("design_request_attachments")
        .select("*")
        .eq("design_request_id", request.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("conversations")
        .select("id")
        .eq("design_request_id", request.id)
        .maybeSingle(),
      supabase
        .from("quote_lifecycle")
        .select("*")
        .eq("design_request_id", request.id)
        .order("version_number", { ascending: false }),
      profileName(supabase, request.customer_id),
    ]);
  assertDatabaseResult(
    attachmentsResult.error,
    "admin.request_attachments.read",
    { requestId },
  );
  assertDatabaseResult(
    conversationResult.error,
    "admin.request_conversation.read",
    { requestId },
  );
  assertDatabaseResult(quotesResult.error, "admin.request_quotes.read", {
    requestId,
  });
  const quoteRows = quotesResult.data ?? [];
  const latestVersion = quoteRows[0]?.version_number ?? 0;
  const quotes = await Promise.all(
    quoteRows.map((quote) => quoteDetail(supabase, quote, latestVersion)),
  );
  return {
    ...requestDto(request),
    customerName,
    occasion: request.occasion,
    description: request.description,
    metalPreferences: request.metal_preferences,
    stonePreferences: request.stone_preferences,
    ringSize: request.ring_size,
    inspirationNotes: request.inspiration_notes,
    submittedAt: request.submitted_at,
    attachments: (attachmentsResult.data ?? []).map((attachment) => ({
      id: attachment.id,
      fileName: attachment.file_name,
      mimeType: attachment.mime_type,
      byteSize: attachment.byte_size,
    })),
    conversationId: conversationResult.data?.id ?? null,
    quotes,
  };
}

export async function getAdminQuote(
  quoteId: string,
): Promise<QuoteDetailDto | null> {
  await requireAdminDataUser();
  const supabase = await createServerSupabaseClient();
  const quoteResult = await supabase
    .from("quote_lifecycle")
    .select("*")
    .eq("id", quoteId)
    .maybeSingle();
  assertDatabaseResult(quoteResult.error, "admin.quote.read", { quoteId });
  if (!quoteResult.data) {
    return null;
  }
  const latestResult = await supabase
    .from("quote_lifecycle")
    .select("version_number")
    .eq("design_request_id", quoteResult.data.design_request_id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  assertDatabaseResult(latestResult.error, "admin.quote_latest.read", {
    quoteId,
  });
  return quoteDetail(
    supabase,
    quoteResult.data,
    latestResult.data?.version_number ?? quoteResult.data.version_number,
  );
}

export async function listAdminCommissions(
  input: ListQuery = {},
): Promise<PageResult<CommissionListItemDto>> {
  await requireAdminDataUser();
  const supabase = await createServerSupabaseClient();
  const { page, pageSize, query, status } = normalizeListQuery(input);
  const from = (page - 1) * pageSize;
  let builder = supabase
    .from("commissions")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (query) {
    builder = builder.ilike("accepted_title", safeSearchPattern(query));
  }
  if (status && COMMISSION_STATUSES.includes(status as never)) {
    builder = builder.eq("status", status as CommissionRow["status"]);
  }
  const result = await builder;
  assertDatabaseResult(result.error, "admin.commissions.list");
  const items = await Promise.all(
    (result.data ?? []).map(async (commission) => ({
      ...commissionDto(commission),
      customerName: await profileName(supabase, commission.customer_id),
    })),
  );
  return toPageResult(items, result.count, page, pageSize);
}

async function adminDrafts(
  supabase: VeyraSupabaseClient,
  commissionId: string,
): Promise<DraftRevisionDto[]> {
  const draftResult = await supabase
    .from("design_drafts")
    .select("*")
    .eq("commission_id", commissionId)
    .order("sequence_number", { ascending: true });
  assertDatabaseResult(draftResult.error, "admin.drafts.read", {
    commissionId,
  });
  const output: DraftRevisionDto[] = [];
  for (const draft of draftResult.data ?? []) {
    const revisionsResult = await supabase
      .from("draft_revisions")
      .select("*")
      .eq("design_draft_id", draft.id)
      .order("revision_number", { ascending: true });
    assertDatabaseResult(revisionsResult.error, "admin.draft_revisions.read", {
      draftId: draft.id,
    });
    for (const revision of revisionsResult.data ?? []) {
      const [assetsResult, feedbackResult] = await Promise.all([
        supabase
          .from("draft_revision_assets")
          .select("*")
          .eq("draft_revision_id", revision.id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("draft_feedback")
          .select("*")
          .eq("draft_revision_id", revision.id)
          .order("created_at", { ascending: true }),
      ]);
      assertDatabaseResult(assetsResult.error, "admin.draft_assets.read", {
        revisionId: revision.id,
      });
      assertDatabaseResult(feedbackResult.error, "admin.draft_feedback.read", {
        revisionId: revision.id,
      });
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
        assets: (assetsResult.data ?? []).map((asset) => ({
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

function includedRevisions(snapshot: Json | null): number {
  const value = jsonObject(snapshot).includedRevisionRounds;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

export async function getAdminCommission(
  commissionId: string,
): Promise<CommissionDetailDto | null> {
  await requireAdminDataUser();
  const supabase = await createServerSupabaseClient();
  const commissionResult = await supabase
    .from("commissions")
    .select("*")
    .eq("id", commissionId)
    .maybeSingle();
  assertDatabaseResult(commissionResult.error, "admin.commission.read", {
    commissionId,
  });
  const commission = commissionResult.data;
  if (!commission) {
    return null;
  }
  const [
    historyResult,
    paymentResult,
    deliverableResult,
    aftercareResult,
    drafts,
    customerName,
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
      .order("updated_at", { ascending: false }),
    supabase
      .from("deliverables")
      .select("*")
      .eq("commission_id", commission.id)
      .order("version_number", { ascending: false }),
    supabase
      .from("aftercare_cases")
      .select("*")
      .eq("commission_id", commission.id)
      .order("opened_at", { ascending: false }),
    adminDrafts(supabase, commission.id),
    profileName(supabase, commission.customer_id),
  ]);
  assertDatabaseResult(historyResult.error, "admin.commission_history.read", {
    commissionId,
  });
  assertDatabaseResult(paymentResult.error, "admin.commission_payments.read", {
    commissionId,
  });
  assertDatabaseResult(
    deliverableResult.error,
    "admin.commission_deliverables.read",
    { commissionId },
  );
  assertDatabaseResult(aftercareResult.error, "admin.aftercare_cases.read", {
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
    "admin.aftercare_completions.read",
    { commissionId },
  );
  const resolutionByCase = new Map(
    (completionResult.data ?? []).map((completion) => [
      completion.aftercare_case_id,
      completion.resolution_summary,
    ]),
  );
  const usedRevisionRounds = drafts.reduce(
    (total, draft) =>
      total +
      draft.feedback.filter((feedback) => feedback.kind === "changes_requested")
        .length,
    0,
  );
  return {
    ...commissionDto(commission),
    customerName,
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
    includedRevisionRounds: includedRevisions(
      commission.accepted_option_snapshot,
    ),
    usedRevisionRounds,
  };
}

export async function listAdminPayments(
  input: ListQuery = {},
): Promise<PageResult<PaymentDto>> {
  await requireAdminDataUser();
  const supabase = await createServerSupabaseClient();
  const { page, pageSize, status, query, sort } = normalizeListQuery(input);
  const from = (page - 1) * pageSize;
  let matchingCommissionIds: string[] | null = null;
  if (query) {
    const commissionResult = await supabase
      .from("commissions")
      .select("id")
      .ilike("accepted_title", safeSearchPattern(query));
    assertDatabaseResult(
      commissionResult.error,
      "admin.payments.search_commissions",
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
  assertDatabaseResult(result.error, "admin.payments.list");
  const items = await Promise.all(
    (result.data ?? []).map(async (payment) => {
      const [commissionResult, customerName] = await Promise.all([
        supabase
          .from("commissions")
          .select("reference_code")
          .eq("id", payment.commission_id)
          .maybeSingle(),
        profileName(supabase, payment.customer_id),
      ]);
      assertDatabaseResult(
        commissionResult.error,
        "admin.payment_commission.read",
        { paymentId: payment.id },
      );
      return {
        ...paymentDto(payment),
        commissionReference:
          commissionResult.data?.reference_code ?? "Unknown commission",
        customerName,
      };
    }),
  );
  return toPageResult(items, result.count, page, pageSize);
}

export async function listAdminDeliverables(
  input: ListQuery = {},
): Promise<PageResult<DeliverableDto>> {
  await requireAdminDataUser();
  const supabase = await createServerSupabaseClient();
  const { page, pageSize, status, query, sort } = normalizeListQuery(input);
  const from = (page - 1) * pageSize;
  let builder = supabase
    .from("deliverables")
    .select("*", { count: "exact" })
    .order(sort === "title" ? "title" : "updated_at", {
      ascending: sort === "oldest" || sort === "title",
    })
    .range(from, from + pageSize - 1);
  if (query) {
    builder = builder.ilike("title", safeSearchPattern(query));
  }
  if (status && ["preparing", "released", "revoked"].includes(status)) {
    builder = builder.eq("status", status as DeliverableRow["status"]);
  }
  const result = await builder;
  assertDatabaseResult(result.error, "admin.deliverables.list");
  const items = await Promise.all(
    (result.data ?? []).map(async (deliverable) => {
      const [commissionResult, customerName] = await Promise.all([
        supabase
          .from("commissions")
          .select("reference_code")
          .eq("id", deliverable.commission_id)
          .maybeSingle(),
        profileName(supabase, deliverable.customer_id),
      ]);
      assertDatabaseResult(
        commissionResult.error,
        "admin.deliverable_commission.read",
        { deliverableId: deliverable.id },
      );
      return {
        ...deliverableDto(deliverable),
        commissionReference:
          commissionResult.data?.reference_code ?? "Unknown commission",
        customerName,
      };
    }),
  );
  return toPageResult(items, result.count, page, pageSize);
}

export async function listAdminPortfolio(
  input: ListQuery = {},
): Promise<PageResult<PortfolioProjectDto>> {
  await requireAdminDataUser();
  const supabase = await createServerSupabaseClient();
  const { page, pageSize, query, status, sort } = normalizeListQuery(input);
  const from = (page - 1) * pageSize;
  let builder = supabase
    .from("portfolio_projects")
    .select("*", { count: "exact" })
    .order(
      sort === "newest"
        ? "created_at"
        : sort === "title"
          ? "title"
          : "sort_order",
      { ascending: sort !== "newest" },
    )
    .range(from, from + pageSize - 1);
  if (query) {
    builder = builder.ilike("title", safeSearchPattern(query));
  }
  if (status && ["draft", "published", "archived"].includes(status)) {
    builder = builder.eq(
      "status",
      status as "draft" | "published" | "archived",
    );
  }
  const projectResult = await builder;
  assertDatabaseResult(projectResult.error, "admin.portfolio.list");
  const items = await Promise.all(
    (projectResult.data ?? []).map(async (project) => {
      const mediaResult = await supabase
        .from("portfolio_media")
        .select("*")
        .eq("portfolio_project_id", project.id)
        .order("sort_order", { ascending: true });
      assertDatabaseResult(mediaResult.error, "admin.portfolio_media.list", {
        projectId: project.id,
      });
      return {
        id: project.id,
        slug: project.slug,
        title: project.title,
        excerpt: project.excerpt,
        story: project.story,
        materials: project.materials,
        techniques: project.techniques,
        status: project.status,
        featured: project.is_featured,
        sortOrder: project.sort_order,
        completedOn: project.completed_on,
        publishedAt: project.published_at,
        media: (mediaResult.data ?? []).map((media) => ({
          id: media.id,
          mediaType: media.media_type,
          altText: media.alt_text,
          sortOrder: media.sort_order,
        })),
      };
    }),
  );
  return toPageResult(items, projectResult.count, page, pageSize);
}

export async function getAdminSiteSettings(): Promise<AdminPublicSiteSettingsDto> {
  const admin = await requireAdminDataUser();
  const supabase = await createServerSupabaseClient();
  const result = await supabase
    .from("site_settings")
    .select("*")
    .eq("settings_key", "public")
    .maybeSingle();
  assertDatabaseResult(result.error, "admin.site_settings.read");
  const row = result.data;
  return {
    exists: row !== null,
    settingsKey: "public",
    brandName: row?.brand_name ?? "Veyra Atelier",
    contactEmail: row?.contact_email ?? admin.email,
    contactPhone: row?.contact_phone ?? "",
    intakeOpen: row?.intake_open ?? false,
    quoteValidityDays: row?.quote_validity_days ?? 14,
    status: row?.status ?? null,
    publishedAt: row?.published_at ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function getAdminPublishedQuoteValidityDays(): Promise<
  number | null
> {
  await requireAdminDataUser();
  const supabase = await createServerSupabaseClient();
  return readPublishedQuoteValidityDays(supabase);
}

export async function getAdminAuditLog(
  input: ListQuery = {},
): Promise<PageResult<AuditEntryDto>> {
  await requireAdminDataUser();
  const supabase = await createServerSupabaseClient();
  const { page, pageSize, query, status } = normalizeListQuery(input, 20);
  const offset = (page - 1) * pageSize;
  const action =
    status && ["INSERT", "UPDATE", "DELETE"].includes(status.toUpperCase())
      ? status.toUpperCase()
      : null;
  const result = await supabase.rpc("admin_list_audit_logs", {
    p_limit: pageSize,
    p_offset: offset,
    p_search: query ?? null,
    p_action: action,
    p_schema_name: null,
    p_table_name: null,
    p_from: null,
    p_to: null,
  });
  assertDatabaseResult(result.error, "admin.audit_logs.read");
  const rows = result.data ?? [];
  const entries: AuditEntryDto[] = rows.map((row) => ({
    id: row.id,
    actor: row.actor_email_masked ?? row.actor_id ?? "System",
    action: row.action,
    resource: `${row.schema_name}.${row.table_name}`,
    resourceId: row.record_id,
    occurredAt: row.occurred_at,
    detail:
      row.changed_fields.length > 0
        ? `Changed: ${row.changed_fields.join(", ")}`
        : "No public field details",
  }));
  return toPageResult(entries, rows[0]?.total_count ?? 0, page, pageSize);
}
