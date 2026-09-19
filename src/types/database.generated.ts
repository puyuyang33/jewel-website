/**
 * Hand-authored Supabase type snapshot.
 * Mirrors the API-exposed `public` schema; the intentionally unexposed `private`
 * schema is omitted just as it is from PostgREST.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
type InsertShape<Row, Required extends keyof Row> = Pick<Row, Required> &
  Partial<Omit<Row, Required>>;
type UpdateShape<Row> = Partial<Row>;
type Relation<
  Name extends string,
  Columns extends string[],
  OneToOne extends boolean,
  ReferencedRelation extends string,
  ReferencedColumns extends string[],
> = {
  foreignKeyName: Name;
  columns: Columns;
  isOneToOne: OneToOne;
  referencedRelation: ReferencedRelation;
  referencedColumns: ReferencedColumns;
};
type ContentStatus = "draft" | "published" | "archived";
type DesignRequestStatus =
  | "draft"
  | "open"
  | "quoted"
  | "negotiating"
  | "accepted"
  | "declined"
  | "closed";
type ConversationStatus = "open" | "archived" | "closed";
type MessageKind = "customer" | "admin" | "system";
type QuoteStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "countered"
  | "accepted"
  | "declined"
  | "cancelled"
  | "superseded"
  | "expired";
type CounterofferStatus =
  "pending" | "accepted" | "declined" | "withdrawn" | "superseded";
type CounterofferDecision = "accepted" | "declined";
type CommissionStatus =
  | "awaiting_admin_confirmation"
  | "confirmed"
  | "in_progress"
  | "draft_review"
  | "revision_requested"
  | "draft_approved"
  | "final_payment_due"
  | "paid"
  | "delivered"
  | "aftercare"
  | "completed"
  | "cancelled"
  | "disputed";
type DraftStatus = "working" | "shared" | "approved" | "superseded";
type DraftFeedbackKind = "comment" | "changes_requested" | "approved";
type PaymentProvider = "stripe" | "manual";
type PaymentKind = "final" | "refund";
type PaymentStatus =
  | "not_started"
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "partially_refunded"
  | "refunded";
type PaymentEvent =
  | "checkout_started"
  | "payment_processing"
  | "payment_succeeded"
  | "payment_failed"
  | "payment_cancelled"
  | "partial_refund_succeeded"
  | "refund_succeeded";
type DeliverableKind =
  | "design_package"
  | "invoice"
  | "care_guide"
  | "certificate"
  | "shipping_document"
  | "other";
type DeliverableStatus = "preparing" | "released" | "revoked";
type AftercareStatus = "open" | "in_progress" | "completed" | "cancelled";
type NotificationEvent =
  | "design_request_submitted"
  | "quote_sent"
  | "quote_expiring"
  | "counteroffer_received"
  | "commission_created"
  | "payment_received"
  | "draft_ready"
  | "revision_requested"
  | "draft_approved"
  | "deliverable_ready"
  | "message_received";
type NotificationChannel = "email" | "sms" | "in_app";
type NotificationStatus =
  "pending" | "processing" | "sent" | "failed" | "suppressed";
type RateLimitAction =
  | "design_request_submit"
  | "message_send"
  | "counteroffer_submit"
  | "quote_accept"
  | "aftercare_open"
  | "deliverable_access";
type ProfilesRow = {
  id: string;
  display_name: string | null;
  phone_e164: string | null;
  preferred_timezone: string;
  marketing_consent: boolean;
  created_at: string;
  updated_at: string;
};
type AdminAllowlistRow = {
  id: string;
  email: string;
  is_active: boolean;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  activated_at: string | null;
  deactivated_at: string | null;
  expires_at: string | null;
};
type NotificationPreferencesRow = {
  profile_id: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  in_app_enabled: boolean;
  commission_updates: boolean;
  message_updates: boolean;
  quote_updates: boolean;
  payment_updates: boolean;
  marketing_updates: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  updated_at: string;
};

type SiteSettingsRow = {
  id: string;
  settings_key: string;
  intake_open: boolean;
  quote_validity_days: number;
  brand_name: string;
  contact_email: string;
  contact_phone: string | null;
  status: ContentStatus;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type SiteContentRow = {
  id: string;
  slug: string;
  content_type: string;
  title: string;
  body: Json;
  status: ContentStatus;
  sort_order: number;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
type PortfolioProjectsRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  story: string;
  materials: string[];
  techniques: string[];
  status: ContentStatus;
  is_featured: boolean;
  sort_order: number;
  completed_on: string | null;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
type PortfolioMediaRow = {
  id: string;
  portfolio_project_id: string;
  bucket_id: string;
  object_path: string;
  media_type: string;
  alt_text: string;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  sort_order: number;
  created_at: string;
};
type DesignRequestsRow = {
  id: string;
  customer_id: string;
  reference_code: string;
  title: string;
  request_type: string;
  occasion: string | null;
  desired_by: string | null;
  budget_min_minor: number | null;
  budget_max_minor: number | null;
  currency: string;
  description: string;
  metal_preferences: string[];
  stone_preferences: string[];
  ring_size: string | null;
  inspiration_notes: string | null;
  status: DesignRequestStatus;
  submitted_at: string | null;
  lock_version: number;
  created_at: string;
  updated_at: string;
};
type ConversationsRow = {
  id: string;
  design_request_id: string;
  customer_id: string;
  subject: string;
  status: ConversationStatus;
  last_message_at: string | null;
  last_message_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};
type MessagesRow = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_kind: MessageKind;
  client_message_id: string;
  body: string;
  metadata: Json;
  sent_at: string;
};
type MessageAttachmentsRow = {
  id: string;
  message_id: string | null;
  owner_id: string;
  client_attachment_id: string;
  bucket_id: string;
  object_path: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  sha256_hex: string;
  verified_at: string;
  finalized_at: string | null;
  created_at: string;
};
type DesignRequestAttachmentsRow = {
  id: string;
  design_request_id: string;
  owner_id: string;
  client_attachment_id: string;
  bucket_id: string;
  object_path: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  sha256_hex: string;
  created_at: string;
};
type ConversationReadMarkersRow = {
  conversation_id: string;
  user_id: string;
  last_read_message_id: string | null;
  last_read_at: string;
};
type QuoteVersionsRow = {
  id: string;
  design_request_id: string;
  version_number: number;
  title: string;
  introduction: string | null;
  terms: string;
  currency: string;
  production_weeks: number;
  valid_until: string | null;
  created_by: string;
  created_at: string;
};
type QuoteOptionsRow = {
  id: string;
  quote_version_id: string;
  title: string;
  description: string;
  scope_snapshot: Json;
  included_revision_rounds: number;
  estimated_completion_days: number;
  line_items: Json;
  currency: string;
  total_minor: number;
  deposit_minor: number;
  sort_order: number;
  created_at: string;
};
type QuoteStatusEventsRow = {
  id: string;
  quote_version_id: string;
  status: QuoteStatus;
  actor: MessageKind;
  changed_by: string | null;
  idempotency_key: string;
  occurred_at: string;
  metadata: Json;
};
type QuoteLifecycleRow = {
  id: string;
  design_request_id: string;
  version_number: number;
  status: QuoteStatus;
  title: string;
  introduction: string | null;
  terms: string;
  currency: string;
  production_weeks: number;
  valid_until: string | null;
  sent_at: string | null;
  created_by: string;
  created_at: string;
};
type QuoteCounteroffersRow = {
  id: string;
  quote_version_id: string;
  quote_option_id: string;
  customer_id: string;
  idempotency_key: string;
  version_number: number;
  status: CounterofferStatus;
  currency: string;
  proposed_total_minor: number;
  proposed_deposit_minor: number;
  proposed_scope: Json;
  customer_note: string;
  submitted_at: string;
};
type QuoteCounterofferDecisionsRow = {
  id: string;
  counteroffer_id: string;
  idempotency_key: string;
  decision: CounterofferDecision;
  response_note: string | null;
  decided_by: string;
  decided_at: string;
};
type QuoteAcceptancesRow = {
  id: string;
  customer_id: string;
  design_request_id: string;
  quote_version_id: string;
  selected_quote_option_id: string | null;
  selected_counteroffer_id: string | null;
  idempotency_key: string;
  accepted_quote_version: number;
  accepted_title: string;
  accepted_currency: string;
  accepted_total_minor: number;
  accepted_deposit_minor: number;
  accepted_scope: Json;
  accepted_terms: string;
  accepted_production_weeks: number;
  accepted_option_snapshot: Json | null;
  accepted_counteroffer_snapshot: Json | null;
  accepted_quote_snapshot: Json;
  accepted_at: string;
};
type CommissionsRow = {
  id: string;
  reference_code: string;
  quote_acceptance_id: string;
  design_request_id: string;
  customer_id: string;
  status: CommissionStatus;
  accepted_quote_version: number;
  accepted_title: string;
  accepted_currency: string;
  accepted_total_minor: number;
  accepted_deposit_minor: number;
  accepted_scope: Json;
  accepted_terms: string;
  accepted_production_weeks: number;
  accepted_option_snapshot: Json | null;
  accepted_counteroffer_snapshot: Json | null;
  accepted_quote_snapshot: Json;
  accepted_at: string;
  started_at: string | null;
  target_completion_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
type CommissionStatusHistoryRow = {
  id: string;
  commission_id: string;
  from_status: CommissionStatus | null;
  to_status: CommissionStatus;
  actor: MessageKind;
  changed_by: string | null;
  reason: string | null;
  metadata: Json;
  idempotency_key: string;
  created_at: string;
};
type DesignDraftsRow = {
  id: string;
  commission_id: string;
  sequence_number: number;
  stage: string;
  title: string;
  status: DraftStatus;
  published_at: string | null;
  approved_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};
type DraftRevisionsRow = {
  id: string;
  design_draft_id: string;
  revision_number: number;
  idempotency_key: string | null;
  status: DraftStatus;
  summary: string;
  specifications: Json;
  customer_message: string | null;
  created_by: string;
  created_at: string;
  published_at: string | null;
};
type DraftRevisionAssetsRow = {
  id: string;
  draft_revision_id: string;
  bucket_id: string;
  object_path: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  sha256_hex: string;
  sort_order: number;
  created_at: string;
};
type DraftFeedbackRow = {
  id: string;
  draft_revision_id: string;
  customer_id: string;
  kind: DraftFeedbackKind;
  body: string | null;
  client_feedback_id: string;
  requested_by: MessageKind;
  consumes_included_revision: boolean;
  complimentary: boolean;
  override_reason: string | null;
  remaining_revision_rounds: number | null;
  created_at: string;
};
type PaymentsRow = {
  id: string;
  commission_id: string;
  customer_id: string;
  provider: PaymentProvider;
  provider_payment_id: string | null;
  provider_checkout_session_id: string | null;
  provider_idempotency_key: string;
  kind: PaymentKind;
  attempt_number: number | null;
  status: PaymentStatus;
  currency: string;
  amount_minor: number;
  refunded_minor: number;
  checkout_created_at: string | null;
  checkout_expires_at: string | null;
  provider_created_at: string | null;
  last_provider_event_at: string | null;
  captured_at: string | null;
  failure_code: string | null;
  created_at: string;
  updated_at: string;
};
type PaymentStatusHistoryRow = {
  id: string;
  payment_id: string;
  from_status: PaymentStatus | null;
  to_status: PaymentStatus;
  event: PaymentEvent;
  provider_event_id: string;
  occurred_at: string;
  created_at: string;
};
type DeliverablesRow = {
  id: string;
  commission_id: string;
  customer_id: string;
  kind: DeliverableKind;
  status: DeliverableStatus;
  version_number: number;
  title: string;
  description: string | null;
  file_name: string;
  mime_type: string;
  byte_size: number;
  sha256_hex: string;
  released_at: string | null;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};
type AftercareCasesRow = {
  id: string;
  commission_id: string;
  customer_id: string;
  client_request_id: string;
  idempotency_key: string | null;
  category: string;
  subject: string;
  description: string;
  status: AftercareStatus;
  opened_by: string;
  assigned_to: string | null;
  opened_at: string;
  completed_at: string | null;
  updated_at: string;
};
type AftercareCompletionsRow = {
  id: string;
  aftercare_case_id: string;
  idempotency_key: string;
  resolution_summary: string;
  completion_snapshot: Json;
  completed_by: string;
  completed_at: string;
};
type NotificationsRow = {
  id: string;
  recipient_id: string;
  event: NotificationEvent;
  title: string;
  body: string;
  resource_type: string | null;
  resource_id: string | null;
  dedupe_key: string;
  read_at: string | null;
  dismissed_at: string | null;
  expires_at: string | null;
  created_at: string;
};
type AdminNotesRow = {
  id: string;
  profile_id: string | null;
  design_request_id: string | null;
  conversation_id: string | null;
  commission_id: string | null;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
};
type PublicTables = {
  profiles: {
    Row: ProfilesRow;
    Insert: InsertShape<ProfilesRow, "id">;
    Update: UpdateShape<ProfilesRow>;
    Relationships: [];
  };
  admin_allowlist: {
    Row: AdminAllowlistRow;
    Insert: InsertShape<AdminAllowlistRow, "email">;
    Update: UpdateShape<AdminAllowlistRow>;
    Relationships: [];
  };
  notification_preferences: {
    Row: NotificationPreferencesRow;
    Insert: InsertShape<NotificationPreferencesRow, "profile_id">;
    Update: UpdateShape<NotificationPreferencesRow>;
    Relationships: [
      Relation<
        "notification_preferences_profile_id_fkey",
        ["profile_id"],
        true,
        "profiles",
        ["id"]
      >,
    ];
  };
  site_settings: {
    Row: SiteSettingsRow;
    Insert: InsertShape<SiteSettingsRow, "brand_name" | "contact_email">;
    Update: UpdateShape<SiteSettingsRow>;
    Relationships: [
      Relation<
        "site_settings_created_by_fkey",
        ["created_by"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
  site_content: {
    Row: SiteContentRow;
    Insert: InsertShape<SiteContentRow, "slug" | "content_type" | "title">;
    Update: UpdateShape<SiteContentRow>;
    Relationships: [
      Relation<
        "site_content_created_by_fkey",
        ["created_by"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
  portfolio_projects: {
    Row: PortfolioProjectsRow;
    Insert: InsertShape<
      PortfolioProjectsRow,
      "slug" | "title" | "excerpt" | "story"
    >;
    Update: UpdateShape<PortfolioProjectsRow>;
    Relationships: [
      Relation<
        "portfolio_projects_created_by_fkey",
        ["created_by"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
  portfolio_media: {
    Row: PortfolioMediaRow;
    Insert: InsertShape<
      PortfolioMediaRow,
      "portfolio_project_id" | "object_path" | "alt_text"
    >;
    Update: UpdateShape<PortfolioMediaRow>;
    Relationships: [
      Relation<
        "portfolio_media_portfolio_project_id_fkey",
        ["portfolio_project_id"],
        false,
        "portfolio_projects",
        ["id"]
      >,
    ];
  };
  design_requests: {
    Row: DesignRequestsRow;
    Insert: InsertShape<
      DesignRequestsRow,
      "customer_id" | "title" | "request_type" | "description"
    >;
    Update: UpdateShape<DesignRequestsRow>;
    Relationships: [
      Relation<
        "design_requests_customer_id_fkey",
        ["customer_id"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
  conversations: {
    Row: ConversationsRow;
    Insert: InsertShape<
      ConversationsRow,
      "design_request_id" | "customer_id" | "subject"
    >;
    Update: UpdateShape<ConversationsRow>;
    Relationships: [
      Relation<
        "conversations_design_request_id_fkey",
        ["design_request_id"],
        true,
        "design_requests",
        ["id"]
      >,
      Relation<
        "conversations_customer_id_fkey",
        ["customer_id"],
        false,
        "profiles",
        ["id"]
      >,
      Relation<
        "conversations_last_message_fk",
        ["last_message_id", "id"],
        false,
        "messages",
        ["id", "conversation_id"]
      >,
    ];
  };
  messages: {
    Row: MessagesRow;
    Insert: InsertShape<
      MessagesRow,
      "conversation_id" | "sender_kind" | "client_message_id" | "body"
    >;
    Update: UpdateShape<MessagesRow>;
    Relationships: [
      Relation<
        "messages_conversation_id_fkey",
        ["conversation_id"],
        false,
        "conversations",
        ["id"]
      >,
      Relation<
        "messages_sender_id_fkey",
        ["sender_id"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
  message_attachments: {
    Row: MessageAttachmentsRow;
    Insert: InsertShape<
      MessageAttachmentsRow,
      | "owner_id"
      | "client_attachment_id"
      | "object_path"
      | "file_name"
      | "mime_type"
      | "byte_size"
      | "sha256_hex"
      | "verified_at"
    >;
    Update: UpdateShape<MessageAttachmentsRow>;
    Relationships: [
      Relation<
        "message_attachments_message_id_fkey",
        ["message_id"],
        false,
        "messages",
        ["id"]
      >,
      Relation<
        "message_attachments_owner_id_fkey",
        ["owner_id"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
  design_request_attachments: {
    Row: DesignRequestAttachmentsRow;
    Insert: InsertShape<
      DesignRequestAttachmentsRow,
      | "design_request_id"
      | "owner_id"
      | "client_attachment_id"
      | "object_path"
      | "file_name"
      | "mime_type"
      | "byte_size"
      | "sha256_hex"
    >;
    Update: UpdateShape<DesignRequestAttachmentsRow>;
    Relationships: [
      Relation<
        "design_request_attachments_design_request_id_fkey",
        ["design_request_id"],
        false,
        "design_requests",
        ["id"]
      >,
      Relation<
        "design_request_attachments_owner_id_fkey",
        ["owner_id"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
  conversation_read_markers: {
    Row: ConversationReadMarkersRow;
    Insert: InsertShape<
      ConversationReadMarkersRow,
      "conversation_id" | "user_id"
    >;
    Update: UpdateShape<ConversationReadMarkersRow>;
    Relationships: [
      Relation<
        "conversation_read_markers_conversation_id_fkey",
        ["conversation_id"],
        false,
        "conversations",
        ["id"]
      >,
      Relation<
        "conversation_read_markers_user_id_fkey",
        ["user_id"],
        false,
        "profiles",
        ["id"]
      >,
      Relation<
        "conversation_read_marker_message_fk",
        ["last_read_message_id", "conversation_id"],
        false,
        "messages",
        ["id", "conversation_id"]
      >,
    ];
  };
  quote_versions: {
    Row: QuoteVersionsRow;
    Insert: InsertShape<
      QuoteVersionsRow,
      | "design_request_id"
      | "version_number"
      | "title"
      | "terms"
      | "production_weeks"
      | "created_by"
    >;
    Update: UpdateShape<QuoteVersionsRow>;
    Relationships: [
      Relation<
        "quote_versions_design_request_id_fkey",
        ["design_request_id"],
        false,
        "design_requests",
        ["id"]
      >,
      Relation<
        "quote_versions_created_by_fkey",
        ["created_by"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
  quote_options: {
    Row: QuoteOptionsRow;
    Insert: InsertShape<
      QuoteOptionsRow,
      | "quote_version_id"
      | "title"
      | "description"
      | "scope_snapshot"
      | "currency"
      | "total_minor"
      | "deposit_minor"
    >;
    Update: UpdateShape<QuoteOptionsRow>;
    Relationships: [
      Relation<
        "quote_options_quote_version_id_fkey",
        ["quote_version_id"],
        false,
        "quote_versions",
        ["id"]
      >,
    ];
  };
  quote_status_events: {
    Row: QuoteStatusEventsRow;
    Insert: InsertShape<
      QuoteStatusEventsRow,
      "quote_version_id" | "status" | "actor" | "idempotency_key"
    >;
    Update: UpdateShape<QuoteStatusEventsRow>;
    Relationships: [
      Relation<
        "quote_status_events_quote_version_id_fkey",
        ["quote_version_id"],
        false,
        "quote_versions",
        ["id"]
      >,
      Relation<
        "quote_status_events_changed_by_fkey",
        ["changed_by"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
  quote_counteroffers: {
    Row: QuoteCounteroffersRow;
    Insert: InsertShape<
      QuoteCounteroffersRow,
      | "quote_version_id"
      | "quote_option_id"
      | "customer_id"
      | "idempotency_key"
      | "version_number"
      | "currency"
      | "proposed_total_minor"
      | "proposed_deposit_minor"
      | "proposed_scope"
      | "customer_note"
    >;
    Update: UpdateShape<QuoteCounteroffersRow>;
    Relationships: [
      Relation<
        "quote_counteroffers_quote_version_id_fkey",
        ["quote_version_id"],
        false,
        "quote_versions",
        ["id"]
      >,
      Relation<
        "quote_counteroffers_option_fk",
        ["quote_option_id", "quote_version_id"],
        false,
        "quote_options",
        ["id", "quote_version_id"]
      >,
      Relation<
        "quote_counteroffers_customer_id_fkey",
        ["customer_id"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
  quote_counteroffer_decisions: {
    Row: QuoteCounterofferDecisionsRow;
    Insert: InsertShape<
      QuoteCounterofferDecisionsRow,
      "counteroffer_id" | "idempotency_key" | "decision" | "decided_by"
    >;
    Update: UpdateShape<QuoteCounterofferDecisionsRow>;
    Relationships: [
      Relation<
        "quote_counteroffer_decisions_counteroffer_id_fkey",
        ["counteroffer_id"],
        true,
        "quote_counteroffers",
        ["id"]
      >,
      Relation<
        "quote_counteroffer_decisions_decided_by_fkey",
        ["decided_by"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
  quote_acceptances: {
    Row: QuoteAcceptancesRow;
    Insert: InsertShape<
      QuoteAcceptancesRow,
      | "customer_id"
      | "design_request_id"
      | "quote_version_id"
      | "idempotency_key"
      | "accepted_quote_version"
      | "accepted_title"
      | "accepted_currency"
      | "accepted_total_minor"
      | "accepted_deposit_minor"
      | "accepted_scope"
      | "accepted_terms"
      | "accepted_production_weeks"
      | "accepted_quote_snapshot"
    >;
    Update: UpdateShape<QuoteAcceptancesRow>;
    Relationships: [
      Relation<
        "quote_acceptances_customer_id_fkey",
        ["customer_id"],
        false,
        "profiles",
        ["id"]
      >,
      Relation<
        "quote_acceptances_design_request_id_fkey",
        ["design_request_id"],
        true,
        "design_requests",
        ["id"]
      >,
      Relation<
        "quote_acceptances_quote_request_fk",
        ["quote_version_id", "design_request_id"],
        false,
        "quote_versions",
        ["id", "design_request_id"]
      >,
      Relation<
        "quote_acceptances_option_version_fk",
        ["selected_quote_option_id", "quote_version_id"],
        false,
        "quote_options",
        ["id", "quote_version_id"]
      >,
      Relation<
        "quote_acceptances_counteroffer_version_fk",
        ["selected_counteroffer_id", "quote_version_id"],
        false,
        "quote_counteroffers",
        ["id", "quote_version_id"]
      >,
    ];
  };
  commissions: {
    Row: CommissionsRow;
    Insert: InsertShape<
      CommissionsRow,
      | "reference_code"
      | "quote_acceptance_id"
      | "design_request_id"
      | "customer_id"
      | "accepted_quote_version"
      | "accepted_title"
      | "accepted_currency"
      | "accepted_total_minor"
      | "accepted_deposit_minor"
      | "accepted_scope"
      | "accepted_terms"
      | "accepted_production_weeks"
      | "accepted_quote_snapshot"
      | "accepted_at"
    >;
    Update: UpdateShape<CommissionsRow>;
    Relationships: [
      Relation<
        "commissions_quote_acceptance_id_fkey",
        ["quote_acceptance_id"],
        true,
        "quote_acceptances",
        ["id"]
      >,
      Relation<
        "commissions_design_request_id_fkey",
        ["design_request_id"],
        true,
        "design_requests",
        ["id"]
      >,
      Relation<
        "commissions_customer_id_fkey",
        ["customer_id"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
  commission_status_history: {
    Row: CommissionStatusHistoryRow;
    Insert: InsertShape<
      CommissionStatusHistoryRow,
      "commission_id" | "to_status" | "actor" | "idempotency_key"
    >;
    Update: UpdateShape<CommissionStatusHistoryRow>;
    Relationships: [
      Relation<
        "commission_status_history_commission_id_fkey",
        ["commission_id"],
        false,
        "commissions",
        ["id"]
      >,
      Relation<
        "commission_status_history_changed_by_fkey",
        ["changed_by"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
  design_drafts: {
    Row: DesignDraftsRow;
    Insert: InsertShape<
      DesignDraftsRow,
      "commission_id" | "sequence_number" | "stage" | "title" | "created_by"
    >;
    Update: UpdateShape<DesignDraftsRow>;
    Relationships: [
      Relation<
        "design_drafts_commission_id_fkey",
        ["commission_id"],
        false,
        "commissions",
        ["id"]
      >,
      Relation<
        "design_drafts_created_by_fkey",
        ["created_by"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
  draft_revisions: {
    Row: DraftRevisionsRow;
    Insert: InsertShape<
      DraftRevisionsRow,
      | "design_draft_id"
      | "revision_number"
      | "summary"
      | "specifications"
      | "created_by"
    >;
    Update: UpdateShape<DraftRevisionsRow>;
    Relationships: [
      Relation<
        "draft_revisions_design_draft_id_fkey",
        ["design_draft_id"],
        false,
        "design_drafts",
        ["id"]
      >,
      Relation<
        "draft_revisions_created_by_fkey",
        ["created_by"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
  draft_revision_assets: {
    Row: DraftRevisionAssetsRow;
    Insert: InsertShape<
      DraftRevisionAssetsRow,
      | "draft_revision_id"
      | "object_path"
      | "file_name"
      | "mime_type"
      | "byte_size"
      | "sha256_hex"
    >;
    Update: UpdateShape<DraftRevisionAssetsRow>;
    Relationships: [
      Relation<
        "draft_revision_assets_draft_revision_id_fkey",
        ["draft_revision_id"],
        false,
        "draft_revisions",
        ["id"]
      >,
    ];
  };
  draft_feedback: {
    Row: DraftFeedbackRow;
    Insert: InsertShape<
      DraftFeedbackRow,
      "draft_revision_id" | "customer_id" | "kind" | "client_feedback_id"
    >;
    Update: UpdateShape<DraftFeedbackRow>;
    Relationships: [
      Relation<
        "draft_feedback_draft_revision_id_fkey",
        ["draft_revision_id"],
        false,
        "draft_revisions",
        ["id"]
      >,
      Relation<
        "draft_feedback_customer_id_fkey",
        ["customer_id"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
  payments: {
    Row: PaymentsRow;
    Insert: InsertShape<
      PaymentsRow,
      | "commission_id"
      | "customer_id"
      | "provider"
      | "provider_idempotency_key"
      | "kind"
      | "status"
      | "currency"
      | "amount_minor"
    >;
    Update: UpdateShape<PaymentsRow>;
    Relationships: [
      Relation<
        "payments_commission_id_fkey",
        ["commission_id"],
        false,
        "commissions",
        ["id"]
      >,
      Relation<
        "payments_customer_id_fkey",
        ["customer_id"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
  payment_status_history: {
    Row: PaymentStatusHistoryRow;
    Insert: InsertShape<
      PaymentStatusHistoryRow,
      "payment_id" | "to_status" | "event" | "provider_event_id" | "occurred_at"
    >;
    Update: UpdateShape<PaymentStatusHistoryRow>;
    Relationships: [
      Relation<
        "payment_status_history_payment_id_fkey",
        ["payment_id"],
        false,
        "payments",
        ["id"]
      >,
    ];
  };
  deliverables: {
    Row: DeliverablesRow;
    Insert: InsertShape<
      DeliverablesRow,
      | "commission_id"
      | "customer_id"
      | "kind"
      | "title"
      | "file_name"
      | "mime_type"
      | "byte_size"
      | "sha256_hex"
      | "created_by"
    >;
    Update: UpdateShape<DeliverablesRow>;
    Relationships: [
      Relation<
        "deliverables_commission_id_fkey",
        ["commission_id"],
        false,
        "commissions",
        ["id"]
      >,
      Relation<
        "deliverables_customer_id_fkey",
        ["customer_id"],
        false,
        "profiles",
        ["id"]
      >,
      Relation<
        "deliverables_created_by_fkey",
        ["created_by"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
  aftercare_cases: {
    Row: AftercareCasesRow;
    Insert: InsertShape<
      AftercareCasesRow,
      | "commission_id"
      | "customer_id"
      | "client_request_id"
      | "category"
      | "subject"
      | "description"
      | "opened_by"
    >;
    Update: UpdateShape<AftercareCasesRow>;
    Relationships: [
      Relation<
        "aftercare_cases_commission_id_fkey",
        ["commission_id"],
        false,
        "commissions",
        ["id"]
      >,
      Relation<
        "aftercare_cases_customer_id_fkey",
        ["customer_id"],
        false,
        "profiles",
        ["id"]
      >,
      Relation<
        "aftercare_cases_opened_by_fkey",
        ["opened_by"],
        false,
        "profiles",
        ["id"]
      >,
      Relation<
        "aftercare_cases_assigned_to_fkey",
        ["assigned_to"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
  aftercare_completions: {
    Row: AftercareCompletionsRow;
    Insert: InsertShape<
      AftercareCompletionsRow,
      | "aftercare_case_id"
      | "idempotency_key"
      | "resolution_summary"
      | "completion_snapshot"
      | "completed_by"
    >;
    Update: UpdateShape<AftercareCompletionsRow>;
    Relationships: [
      Relation<
        "aftercare_completions_aftercare_case_id_fkey",
        ["aftercare_case_id"],
        true,
        "aftercare_cases",
        ["id"]
      >,
      Relation<
        "aftercare_completions_completed_by_fkey",
        ["completed_by"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
  notifications: {
    Row: NotificationsRow;
    Insert: InsertShape<
      NotificationsRow,
      "recipient_id" | "event" | "title" | "body" | "dedupe_key"
    >;
    Update: UpdateShape<NotificationsRow>;
    Relationships: [
      Relation<
        "notifications_recipient_id_fkey",
        ["recipient_id"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
  admin_notes: {
    Row: AdminNotesRow;
    Insert: InsertShape<AdminNotesRow, "author_id" | "body">;
    Update: UpdateShape<AdminNotesRow>;
    Relationships: [
      Relation<
        "admin_notes_profile_id_fkey",
        ["profile_id"],
        false,
        "profiles",
        ["id"]
      >,
      Relation<
        "admin_notes_design_request_id_fkey",
        ["design_request_id"],
        false,
        "design_requests",
        ["id"]
      >,
      Relation<
        "admin_notes_conversation_id_fkey",
        ["conversation_id"],
        false,
        "conversations",
        ["id"]
      >,
      Relation<
        "admin_notes_commission_id_fkey",
        ["commission_id"],
        false,
        "commissions",
        ["id"]
      >,
      Relation<
        "admin_notes_author_id_fkey",
        ["author_id"],
        false,
        "profiles",
        ["id"]
      >,
    ];
  };
};
export type Database = {
  public: {
    Tables: PublicTables;
    Views: {
      quote_lifecycle: {
        Row: QuoteLifecycleRow;
        Insert: { [_ in never]: never };
        Update: { [_ in never]: never };
        Relationships: [
          Relation<
            "quote_versions_design_request_id_fkey",
            ["design_request_id"],
            false,
            "design_requests",
            ["id"]
          >,
          Relation<
            "quote_versions_created_by_fkey",
            ["created_by"],
            false,
            "profiles",
            ["id"]
          >,
        ];
      };
    };
    Functions: {
      accept_quote: {
        Args: {
          p_quote_version_id: string;
          p_idempotency_key: string;
          p_quote_option_id?: string | null;
          p_counteroffer_id?: string | null;
        };
        Returns: {
          quote_acceptance_id: string;
          commission_id: string;
          created: boolean;
        }[];
      };
      advance_conversation_read_marker: {
        Args: {
          p_conversation_id: string;
          p_message_id: string;
        };
        Returns: {
          conversation_id: string;
          user_id: string;
          last_read_message_id: string;
          last_read_at: string;
          advanced: boolean;
        }[];
      };
      approve_latest_draft_revision: {
        Args: {
          p_commission_id: string;
          p_draft_revision_id: string;
          p_expected_revision_number: number;
          p_client_feedback_id: string;
          p_note?: string | null;
        };
        Returns: {
          feedback_id: string;
          draft_revision_id: string;
          resulting_commission_status: CommissionStatus;
          approved_at: string;
          created: boolean;
        }[];
      };
      publish_latest_draft_revision: {
        Args: {
          p_commission_id: string;
          p_design_draft_id: string;
          p_draft_revision_id: string;
          p_expected_revision_number: number;
          p_idempotency_key: string;
        };
        Returns: {
          design_draft_id: string;
          draft_revision_id: string;
          resulting_commission_status: CommissionStatus;
          published_at: string;
          created: boolean;
        }[];
      };
      admin_list_audit_logs: {
        Args: {
          p_limit?: number;
          p_offset?: number;
          p_search?: string | null;
          p_schema_name?: string | null;
          p_table_name?: string | null;
          p_action?: string | null;
          p_from?: string | null;
          p_to?: string | null;
        };
        Returns: {
          id: string;
          actor_id: string | null;
          actor_email_masked: string | null;
          action: string;
          schema_name: string;
          table_name: string;
          record_id: string | null;
          changed_fields: string[];
          request_id_fingerprint: string | null;
          occurred_at: string;
          total_count: number;
        }[];
      };
      admin_list_ranked_inbox: {
        Args: {
          p_limit?: number;
          p_before_activity_at?: string | null;
          p_before_conversation_id?: string | null;
          p_search?: string | null;
          p_status?: ConversationStatus | null;
          p_unread_only?: boolean;
        };
        Returns: {
          conversation_id: string;
          design_request_id: string;
          customer_id: string;
          customer_display_name: string;
          subject: string;
          status: ConversationStatus;
          latest_message_id: string | null;
          latest_sender_kind: MessageKind | null;
          latest_preview: string | null;
          activity_at: string;
          unread_count: number;
          has_more: boolean;
          next_activity_at: string | null;
          next_conversation_id: string | null;
        }[];
      };
      admin_upsert_deliverable: {
        Args: {
          p_commission_id: string;
          p_kind: DeliverableKind;
          p_version_number: number;
          p_title: string;
          p_description: string | null;
          p_file_name: string;
          p_mime_type: string;
          p_byte_size: number;
          p_sha256_hex: string;
          p_bucket_id: string;
          p_object_path: string;
          p_secret_url: string;
          p_release: boolean;
          p_idempotency_key: string;
          p_expected_status?: DeliverableStatus | null;
        };
        Returns: {
          deliverable_id: string;
          status: DeliverableStatus;
          operation: string;
          replayed: boolean;
        }[];
      };
      authorize_deliverable_access: {
        Args: {
          p_deliverable_id: string;
          p_request_id: string;
          p_ip_address?: string | null;
          p_user_agent?: string | null;
        };
        Returns: {
          authorized: boolean;
          access_log_id: string;
          resulting_commission_status: CommissionStatus;
        }[];
      };
      attach_stripe_checkout_session: {
        Args: {
          p_payment_id: string;
          p_provider_idempotency_key: string;
          p_checkout_session_id: string;
          p_checkout_created_at: string;
          p_checkout_expires_at: string;
        };
        Returns: {
          payment_id: string;
          status: PaymentStatus;
          attached: boolean;
        }[];
      };
      begin_payment_checkout: {
        Args: { p_commission_id: string; p_request_id: string };
        Returns: {
          payment_id: string;
          status: PaymentStatus;
          currency: string;
          amount_minor: number;
          provider_idempotency_key: string;
          provider_checkout_session_id: string | null;
          checkout_expires_at: string | null;
          attempt_number: number;
          resumed: boolean;
          created: boolean;
        }[];
      };
      complete_aftercare_case: {
        Args: {
          p_aftercare_case_id: string;
          p_resolution_summary: string;
          p_idempotency_key: string;
        };
        Returns: {
          completion_id: string;
          commission_id: string;
          completed: boolean;
        }[];
      };
      can_delete_own_commission_object: {
        Args: { p_bucket_id: string; p_object_path: string };
        Returns: boolean;
      };
      can_read_quote: {
        Args: { p_quote_version_id: string };
        Returns: boolean;
      };
      commission_payment_is_clear: {
        Args: { p_commission_id: string; p_customer_id: string };
        Returns: boolean;
      };
      create_draft_revision: {
        Args: {
          p_commission_id: string;
          p_design_draft_id: string;
          p_title: string;
          p_notes: string | null;
          p_idempotency_key: string;
        };
        Returns: {
          draft_revision_id: string;
          revision_number: number;
          status: DraftStatus;
          created: boolean;
        }[];
      };
      customer_list_history: {
        Args: {
          p_limit?: number;
          p_before_occurred_at?: string | null;
          p_before_id?: string | null;
          p_before_type?: string | null;
          p_search?: string | null;
          p_types?: string[] | null;
        };
        Returns: {
          event_id: string;
          event_type: string;
          title: string;
          description: string;
          resource_type: string;
          resource_id: string;
          occurred_at: string;
          has_more: boolean;
          next_occurred_at: string | null;
          next_id: string | null;
          next_type: string | null;
        }[];
      };
      current_application_user_id: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      decide_counteroffer: {
        Args: {
          p_counteroffer_id: string;
          p_decision: CounterofferDecision;
          p_response_note: string | null;
          p_idempotency_key: string;
        };
        Returns: {
          decision_id: string;
          decision: CounterofferDecision;
          created: boolean;
        }[];
      };
      get_public_site_settings: {
        Args: Record<PropertyKey, never>;
        Returns: {
          intake_open: boolean;
          quote_validity_days: number;
          brand_name: string;
          contact_email: string;
          contact_phone: string | null;
        }[];
      };
      consume_rate_limit: {
        Args: { p_action: RateLimitAction; p_cost?: number };
        Returns: { allowed: boolean; remaining: number; reset_at: string }[];
      };
      consume_rate_limit_for_subject: {
        Args: {
          p_action: RateLimitAction;
          p_subject_hash: string;
          p_cost?: number;
        };
        Returns: { allowed: boolean; remaining: number; reset_at: string }[];
      };
      handle_new_user: { Args: Record<PropertyKey, never>; Returns: unknown };
      is_active_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      sync_admin_allowlist: {
        Args: { p_normalized_email: string };
        Returns: {
          target_user_id: string;
          normalized_email: string;
          changed: boolean;
        }[];
      };
      record_verified_payment: {
        Args: {
          p_provider: PaymentProvider;
          p_provider_event_id: string;
          p_event_type: string;
          p_payload_sha256: string;
          p_sanitized_payload: Json;
          p_commission_id: string;
          p_provider_payment_id: string;
          p_provider_idempotency_key: string;
          p_kind: PaymentKind;
          p_currency: string;
          p_amount_minor: number;
          p_status: PaymentStatus;
          p_provider_created_at: string;
          p_failure_code?: string | null;
          p_refunded_minor?: number;
        };
        Returns: {
          payment_id: string;
          payment_created: boolean;
          duplicate_event: boolean;
        }[];
      };
      record_stripe_refund_event: {
        Args: {
          p_provider_event_id: string;
          p_event_type: string;
          p_payload_sha256: string;
          p_payment_id: string;
          p_provider_payment_id: string;
          p_provider_refund_id: string;
          p_refund_status: string;
          p_currency: string;
          p_amount_minor: number;
          p_provider_created_at: string;
          p_safe_payload?: Json;
        };
        Returns: {
          refund_event_id: string;
          payment_id: string;
          cumulative_refunded_minor: number;
          resulting_payment_status: PaymentStatus;
          resulting_commission_status: CommissionStatus;
          created: boolean;
        }[];
      };
      record_stripe_charge_refunded_event: {
        Args: {
          p_provider_event_id: string;
          p_event_type: string;
          p_payload_sha256: string;
          p_payment_id: string;
          p_provider_payment_id: string;
          p_provider_charge_id: string;
          p_currency: string;
          p_cumulative_refunded_minor: number;
          p_provider_created_at: string;
          p_safe_payload?: Json;
        };
        Returns: {
          charge_refund_event_id: string;
          payment_id: string;
          cumulative_refunded_minor: number;
          resulting_payment_status: PaymentStatus;
          resulting_commission_status: CommissionStatus;
          created: boolean;
        }[];
      };
      record_stripe_checkout_event: {
        Args: {
          p_provider_event_id: string;
          p_event_type: string;
          p_payload_sha256: string;
          p_provider_checkout_session_id: string;
          p_provider_created_at: string;
          p_safe_payload?: Json;
        };
        Returns: {
          checkout_event_id: string;
          payment_id: string;
          resulting_payment_status: PaymentStatus;
          created: boolean;
        }[];
      };
      record_stripe_dispute_event: {
        Args: {
          p_provider_event_id: string;
          p_event_type: string;
          p_payload_sha256: string;
          p_payment_id: string;
          p_provider_payment_id: string;
          p_provider_dispute_id: string;
          p_dispute_status: string;
          p_currency: string;
          p_amount_minor: number;
          p_reason: string | null;
          p_provider_created_at: string;
          p_safe_payload?: Json;
        };
        Returns: {
          dispute_event_id: string;
          payment_id: string;
          effective_dispute_status: string;
          resulting_commission_status: CommissionStatus;
          created: boolean;
        }[];
      };
      resolve_deliverable_secret_url: {
        Args: {
          p_access_log_id: string;
          p_request_id: string;
          p_actor_id: string;
        };
        Returns: string;
      };
      register_message_attachment_upload: {
        Args: {
          p_owner_id: string;
          p_client_attachment_id: string;
          p_object_path: string;
          p_file_name: string;
          p_mime_type: string;
          p_byte_size: number;
          p_sha256_hex: string;
        };
        Returns: { attachment_id: string; created: boolean }[];
      };
      request_latest_draft_revision: {
        Args: {
          p_commission_id: string;
          p_draft_revision_id: string;
          p_expected_revision_number: number;
          p_reason: string;
          p_client_feedback_id: string;
          p_complimentary_override_reason?: string | null;
        };
        Returns: {
          feedback_id: string;
          draft_revision_id: string;
          resulting_commission_status: CommissionStatus;
          remaining_revision_rounds: number;
          complimentary: boolean;
          created: boolean;
        }[];
      };
      open_aftercare_case: {
        Args: {
          p_commission_id: string;
          p_client_request_id: string;
          p_category: string;
          p_subject: string;
          p_description: string;
          p_idempotency_key: string;
        };
        Returns: {
          aftercare_case_id: string;
          case_status: AftercareStatus;
          resulting_commission_status: CommissionStatus;
          created: boolean;
        }[];
      };
      send_message: {
        Args: {
          p_conversation_id: string;
          p_client_message_id: string;
          p_body?: string;
          p_attachment_ids?: string[];
        };
        Returns: { message_id: string; sent_at: string; created: boolean }[];
      };
      submit_counteroffer: {
        Args: {
          p_quote_version_id: string;
          p_quote_option_id: string;
          p_proposed_total_minor: number;
          p_explanation: string;
          p_idempotency_key: string;
        };
        Returns: {
          counteroffer_id: string;
          version_number: number;
          status: CounterofferStatus;
          created: boolean;
        }[];
      };
      transition_quote_status: {
        Args: {
          p_quote_version_id: string;
          p_expected_status: QuoteStatus;
          p_to_status: QuoteStatus;
          p_idempotency_key: string;
        };
        Returns: {
          quote_status_event_id: string;
          effective_status: QuoteStatus;
          created: boolean;
        }[];
      };
      transition_commission_status: {
        Args: {
          p_commission_id: string;
          p_expected_status: CommissionStatus;
          p_to_status: CommissionStatus;
          p_reason: string | null;
          p_idempotency_key: string;
        };
        Returns: {
          history_id: string;
          resulting_status: CommissionStatus;
          changed: boolean;
        }[];
      };
    };
    Enums: {
      aftercare_status: AftercareStatus;
      commission_status: CommissionStatus;
      content_status: ContentStatus;
      conversation_status: ConversationStatus;
      counteroffer_decision: CounterofferDecision;
      counteroffer_status: CounterofferStatus;
      deliverable_kind: DeliverableKind;
      deliverable_status: DeliverableStatus;
      notification_status: NotificationStatus;
      draft_feedback_kind: DraftFeedbackKind;
      draft_status: DraftStatus;
      message_kind: MessageKind;
      notification_channel: NotificationChannel;
      notification_event: NotificationEvent;
      payment_event: PaymentEvent;
      payment_kind: PaymentKind;
      payment_provider: PaymentProvider;
      payment_status: PaymentStatus;
      quote_status: QuoteStatus;
      rate_limit_action: RateLimitAction;
      design_request_status: DesignRequestStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
type PublicSchema = Database["public"];
type PublicTablesAndViews = PublicSchema["Tables"] & PublicSchema["Views"];
export type Tables<
  PublicTableNameOrOptions extends
    keyof PublicTablesAndViews | { schema: keyof Database },
  TableName extends (PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer Row;
    }
    ? Row
    : never
  : PublicTableNameOrOptions extends keyof PublicTablesAndViews
    ? PublicTablesAndViews[PublicTableNameOrOptions] extends { Row: infer Row }
      ? Row
      : never
    : never;
export type TablesInsert<
  PublicTableNameOrOptions extends
    keyof PublicSchema["Tables"] | { schema: keyof Database },
  TableName extends (PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer Insert;
    }
    ? Insert
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer Insert;
      }
      ? Insert
      : never
    : never;
export type TablesUpdate<
  PublicTableNameOrOptions extends
    keyof PublicSchema["Tables"] | { schema: keyof Database },
  TableName extends (PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer Update;
    }
    ? Update
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer Update;
      }
      ? Update
      : never
    : never;
export type Enums<
  PublicEnumNameOrOptions extends
    keyof PublicSchema["Enums"] | { schema: keyof Database },
  EnumName extends (PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never;
export const Constants = {
  public: {
    Enums: {
      aftercare_status: ["open", "in_progress", "completed", "cancelled"],
      commission_status: [
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
      ],
      content_status: ["draft", "published", "archived"],
      conversation_status: ["open", "archived", "closed"],
      counteroffer_decision: ["accepted", "declined"],
      counteroffer_status: [
        "pending",
        "accepted",
        "declined",
        "withdrawn",
        "superseded",
      ],
      deliverable_kind: [
        "design_package",
        "invoice",
        "care_guide",
        "certificate",
        "shipping_document",
        "other",
      ],
      deliverable_status: ["preparing", "released", "revoked"],
      notification_status: [
        "pending",
        "processing",
        "sent",
        "failed",
        "suppressed",
      ],
      design_request_status: [
        "draft",
        "open",
        "quoted",
        "negotiating",
        "accepted",
        "declined",
        "closed",
      ],
      draft_feedback_kind: ["comment", "changes_requested", "approved"],
      draft_status: ["working", "shared", "approved", "superseded"],
      message_kind: ["customer", "admin", "system"],
      notification_channel: ["email", "sms", "in_app"],
      notification_event: [
        "design_request_submitted",
        "quote_sent",
        "quote_expiring",
        "counteroffer_received",
        "commission_created",
        "payment_received",
        "draft_ready",
        "revision_requested",
        "draft_approved",
        "deliverable_ready",
        "message_received",
      ],
      payment_event: [
        "checkout_started",
        "payment_processing",
        "payment_succeeded",
        "payment_failed",
        "payment_cancelled",
        "partial_refund_succeeded",
        "refund_succeeded",
      ],
      payment_kind: ["final", "refund"],
      payment_provider: ["stripe", "manual"],
      payment_status: [
        "not_started",
        "pending",
        "processing",
        "succeeded",
        "failed",
        "cancelled",
        "partially_refunded",
        "refunded",
      ],
      quote_status: [
        "draft",
        "sent",
        "viewed",
        "countered",
        "accepted",
        "declined",
        "cancelled",
        "superseded",
        "expired",
      ],
      rate_limit_action: [
        "design_request_submit",
        "message_send",
        "counteroffer_submit",
        "quote_accept",
        "aftercare_open",
        "deliverable_access",
      ],
    },
  },
} as const;
