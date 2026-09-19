import type { Json } from "@/types/database.generated";
import type {
  CommissionStatus,
  CounterofferStatus,
  DesignRequestStatus,
  DraftVersionStatus,
  PaymentStatus,
  QuoteStatus,
} from "@/types/domain";

export interface ListQuery {
  query?: string;
  status?: string;
  sort?: string;
  cursor?: string;
  unreadOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export interface DashboardRecordDto {
  id: string;
  href: string;
  title: string;
  description: string;
  status: string;
  occurredAt: string;
}

export interface CustomerDashboardDto {
  displayName: string;
  activeRequestCount: number;
  activeCommissionCount: number;
  unreadMessageCount: number;
  outstandingPaymentCount: number;
  recent: DashboardRecordDto[];
}

export interface AdminDashboardDto {
  openRequestCount: number;
  activeCommissionCount: number;
  attentionCommissionCount: number;
  paymentDueCount: number;
  openConversationCount: number;
  recent: DashboardRecordDto[];
}

export interface ConversationListItemDto {
  id: string;
  customerId: string;
  designRequestId?: string;
  subject: string;
  status: "open" | "archived" | "closed";
  updatedAt: string;
  activityAt?: string;
  latestMessageId?: string | null;
  latestSenderRole?: "customer" | "admin" | "system" | null;
  latestMessage: string;
  latestMessageAt: string | null;
  unreadCount: number;
  customerName?: string;
}

export interface RankedInboxPage {
  viewerId: string;
  items: ConversationListItemDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AttachmentDto {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
}

export interface MessageDto {
  id: string;
  senderId: string | null;
  senderName: string;
  senderRole: "customer" | "admin" | "system";
  text: string;
  sentAt: string;
  isOwn: boolean;
  attachments: AttachmentDto[];
}

export interface ConversationDetailDto {
  id: string;
  customerId: string;
  customerName: string;
  designRequestId: string;
  subject: string;
  status: "open" | "archived" | "closed";
  messages: MessageDto[];
  nextCursor: string | null;
}

export interface DesignRequestListItemDto {
  id: string;
  customerId: string;
  referenceCode: string;
  title: string;
  requestType: string;
  status: DesignRequestStatus;
  budgetMinMinor: number | null;
  budgetMaxMinor: number | null;
  currency: string;
  desiredBy: string | null;
  createdAt: string;
  customerName?: string;
}

export interface QuoteOptionDto {
  id: string;
  title: string;
  description: string;
  scope: string;
  materials: string;
  stoneAssumptions: string;
  deliverables: string;
  includedRevisionRounds: number;
  estimatedCompletionDays: number;
  currency: string;
  totalMinor: number;
  depositMinor: number;
  lineItems: { description: string; amountMinor: number }[];
}

export interface CounterofferDto {
  id: string;
  optionId: string;
  optionTitle: string;
  version: number;
  status: CounterofferStatus;
  proposedTotalMinor: number;
  proposedDepositMinor: number;
  originalTotalMinor: number;
  originalDepositMinor: number;
  totalDifferenceMinor: number;
  depositDifferenceMinor: number;
  proposedScope: Json;
  currency: string;
  note: string;
  submittedAt: string;
  decision?: {
    decision: "accepted" | "declined";
    note: string | null;
    decidedAt: string;
  };
}

export interface QuoteDetailDto {
  id: string;
  designRequestId: string;
  version: number;
  status: QuoteStatus;
  title: string;
  introduction: string | null;
  terms: string;
  currency: string;
  productionWeeks: number;
  validUntil: string | null;
  sentAt: string | null;
  createdAt: string;
  options: QuoteOptionDto[];
  counteroffers: CounterofferDto[];
  isLatest: boolean;
}

export interface DesignRequestDetailDto extends DesignRequestListItemDto {
  occasion: string | null;
  description: string;
  metalPreferences: string[];
  stonePreferences: string[];
  ringSize: string | null;
  inspirationNotes: string | null;
  submittedAt: string | null;
  attachments: AttachmentDto[];
  conversationId: string | null;
  quotes: QuoteDetailDto[];
}

export interface CommissionListItemDto {
  id: string;
  customerId: string;
  referenceCode: string;
  title: string;
  status: CommissionStatus;
  currency: string;
  totalMinor: number;
  depositMinor: number;
  targetCompletionAt: string | null;
  updatedAt: string;
  customerName?: string;
}

export interface TimelineEntryDto {
  id: string;
  fromStatus: CommissionStatus | null;
  toStatus: CommissionStatus;
  actor: "customer" | "admin" | "system";
  reason: string | null;
  occurredAt: string;
}

export interface DraftAssetDto extends AttachmentDto {
  sortOrder: number;
}

export interface DraftRevisionDto {
  id: string;
  draftId: string;
  draftSequence: number;
  revisionNumber: number;
  parentStatus: DraftVersionStatus;
  parentPublishedAt: string | null;
  stage: string;
  title: string;
  status: DraftVersionStatus;
  summary: string;
  specifications: Json;
  customerMessage: string | null;
  publishedAt: string | null;
  assets: DraftAssetDto[];
  feedback: {
    id: string;
    kind: "comment" | "changes_requested" | "approved";
    body: string | null;
    createdAt: string;
  }[];
}

export interface PaymentDto {
  id: string;
  commissionId: string;
  customerId: string;
  status: PaymentStatus;
  kind: "final" | "refund";
  provider: "stripe" | "manual";
  currency: string;
  amountMinor: number;
  refundedMinor: number;
  createdAt: string;
  updatedAt: string;
  commissionReference?: string;
  customerName?: string;
}

export interface DeliverableDto {
  id: string;
  commissionId: string;
  customerId: string;
  kind:
    | "design_package"
    | "invoice"
    | "care_guide"
    | "certificate"
    | "shipping_document"
    | "other";
  status: "preparing" | "released" | "revoked";
  version: number;
  title: string;
  description: string | null;
  fileName: string;
  mimeType: string;
  byteSize: number;
  releasedAt: string | null;
  updatedAt: string;
  commissionReference?: string;
  customerName?: string;
}

export interface AftercareCaseDto {
  id: string;
  commissionId: string;
  status: "open" | "in_progress" | "completed" | "cancelled";
  category: string;
  subject: string;
  description: string;
  openedAt: string;
  completedAt: string | null;
  resolution: string | null;
}

export interface CommissionDetailDto extends CommissionListItemDto {
  acceptedQuoteVersion: number;
  acceptedScope: Json;
  acceptedTerms: string;
  acceptedProductionWeeks: number;
  acceptedOptionSnapshot: Json | null;
  acceptedAt: string;
  startedAt: string | null;
  deliveredAt: string | null;
  timeline: TimelineEntryDto[];
  drafts: DraftRevisionDto[];
  payments: PaymentDto[];
  deliverables: DeliverableDto[];
  aftercareCases: AftercareCaseDto[];
  includedRevisionRounds: number;
  usedRevisionRounds: number;
}

export interface ProfileDto {
  id: string;
  email: string;
  displayName: string | null;
  phone: string | null;
  timeZone: string;
  marketingConsent: boolean;
  notifications: {
    emailEnabled: boolean;
    smsEnabled: boolean;
    inAppEnabled: boolean;
    commissionUpdates: boolean;
    messageUpdates: boolean;
    quoteUpdates: boolean;
    paymentUpdates: boolean;
    marketingUpdates: boolean;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
  };
}

export interface HistoryEntryDto {
  id: string;
  eventType: string;
  title: string;
  description: string;
  resourceHref: string | null;
  occurredAt: string;
  tone: "neutral" | "attention" | "positive" | "critical" | "info";
}

export interface CustomerHistoryPage {
  items: HistoryEntryDto[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface AdminCustomerDto {
  id: string;
  displayName: string;
  phone: string | null;
  timeZone: string;
  marketingConsent: boolean;
  createdAt: string;
  requestCount: number;
  commissionCount: number;
}

export interface AdminNoteDto {
  id: string;
  body: string;
  authorId: string;
  createdAt: string;
}

export interface AdminCustomerDetailDto extends AdminCustomerDto {
  requests: DesignRequestListItemDto[];
  commissions: CommissionListItemDto[];
  conversations: ConversationListItemDto[];
  notes: AdminNoteDto[];
}

export interface PortfolioProjectDto {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  story: string;
  materials: string[];
  techniques: string[];
  status: "draft" | "published" | "archived";
  featured: boolean;
  sortOrder: number;
  completedOn: string | null;
  publishedAt: string | null;
  media: {
    id: string;
    mediaType: string;
    altText: string;
    sortOrder: number;
  }[];
}

export interface AdminPublicSiteSettingsDto {
  exists: boolean;
  settingsKey: "public";
  brandName: string;
  contactEmail: string;
  contactPhone: string;
  intakeOpen: boolean;
  quoteValidityDays: number;
  status: "draft" | "published" | "archived" | null;
  publishedAt: string | null;
  updatedAt: string | null;
}

export interface AuditEntryDto {
  id: string;
  actor: string;
  action: string;
  resource: string;
  resourceId: string | null;
  occurredAt: string;
  detail: string;
}
