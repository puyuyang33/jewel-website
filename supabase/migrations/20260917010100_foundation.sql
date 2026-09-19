-- Veyra Atelier data platform: core domains and invariants.
-- All monetary values are integer minor units and every timestamp is timezone-aware.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.content_status as enum ('draft', 'published', 'archived');
create type public.design_request_status as enum (
  'draft',
  'open',
  'quoted',
  'negotiating',
  'accepted',
  'declined',
  'closed'
);
create type public.conversation_status as enum ('open', 'archived', 'closed');
create type public.message_kind as enum ('customer', 'admin', 'system');
create type public.quote_status as enum (
  'draft',
  'sent',
  'viewed',
  'countered',
  'accepted',
  'declined',
  'cancelled',
  'superseded',
  'expired'
);
create type public.counteroffer_status as enum (
  'pending',
  'accepted',
  'declined',
  'withdrawn',
  'superseded'
);
create type public.counteroffer_decision as enum ('accepted', 'declined');
create type public.commission_status as enum (
  'awaiting_admin_confirmation',
  'confirmed',
  'in_progress',
  'draft_review',
  'revision_requested',
  'draft_approved',
  'final_payment_due',
  'paid',
  'delivered',
  'aftercare',
  'completed',
  'cancelled',
  'disputed'
);
create type public.draft_status as enum ('working', 'shared', 'approved', 'superseded');
create type public.draft_feedback_kind as enum ('comment', 'changes_requested', 'approved');
create type public.payment_provider as enum ('stripe', 'manual');
create type public.payment_kind as enum ('final', 'refund');
create type public.payment_status as enum (
  'not_started',
  'pending',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
  'partially_refunded',
  'refunded'
);
create type public.payment_event as enum (
  'checkout_started',
  'payment_processing',
  'payment_succeeded',
  'payment_failed',
  'payment_cancelled',
  'partial_refund_succeeded',
  'refund_succeeded'
);
create type public.deliverable_kind as enum (
  'design_package',
  'invoice',
  'care_guide',
  'certificate',
  'shipping_document',
  'other'
);
create type public.deliverable_status as enum ('preparing', 'released', 'revoked');
create type public.aftercare_status as enum ('open', 'in_progress', 'completed', 'cancelled');
create type public.notification_event as enum (
  'design_request_submitted',
  'quote_sent',
  'quote_expiring',
  'counteroffer_received',
  'commission_created',
  'payment_received',
  'draft_ready',
  'revision_requested',
  'draft_approved',
  'deliverable_ready',
  'message_received'
);
create type public.notification_channel as enum ('email', 'sms', 'in_app');
create type public.notification_status as enum ('pending', 'processing', 'sent', 'failed', 'suppressed');
create type public.rate_limit_action as enum (
  'design_request_submit',
  'message_send',
  'counteroffer_submit',
  'quote_accept',
  'aftercare_open',
  'deliverable_access'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  phone_e164 text,
  preferred_timezone text not null default 'UTC',
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (
    display_name is null or char_length(btrim(display_name)) between 1 and 120
  ),
  constraint profiles_phone_e164_format check (
    phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
  ),
  constraint profiles_timezone_length check (
    char_length(preferred_timezone) between 1 and 64
  )
);

create table public.admin_allowlist (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext not null unique,
  is_active boolean not null default true,
  reason text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  deactivated_at timestamptz,
  expires_at timestamptz,
  constraint admin_allowlist_email_shape check (
    email::text ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint admin_allowlist_reason_length check (
    reason is null or char_length(reason) <= 500
  ),
  constraint admin_allowlist_state_timestamps check (
    (is_active and deactivated_at is null)
    or (not is_active and deactivated_at is not null)
  ),
  constraint admin_allowlist_expiry_after_creation check (
    expires_at is null or expires_at > created_at
  )
);

create table public.notification_preferences (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  in_app_enabled boolean not null default true,
  commission_updates boolean not null default true,
  message_updates boolean not null default true,
  quote_updates boolean not null default true,
  payment_updates boolean not null default true,
  marketing_updates boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  updated_at timestamptz not null default now(),
  constraint notification_preferences_quiet_hours_pair check (
    (quiet_hours_start is null) = (quiet_hours_end is null)
  )
);

create table public.site_settings (
  id uuid primary key default gen_random_uuid(),
  settings_key text not null unique default 'public',
  intake_open boolean not null default true,
  quote_validity_days integer not null default 14,
  brand_name text not null,
  contact_email extensions.citext not null,
  contact_phone text,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_settings_singleton check (settings_key = 'public'),
  constraint site_settings_quote_validity check (
    quote_validity_days between 1 and 90
  ),
  constraint site_settings_brand_length check (
    char_length(btrim(brand_name)) between 1 and 120
  ),
  constraint site_settings_email_shape check (
    contact_email::text ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint site_settings_phone_length check (
    contact_phone is null or char_length(contact_phone) <= 40
  ),
  constraint site_settings_publication_state check (
    (status = 'published' and published_at is not null)
    or (status <> 'published')
  )
);

create table public.site_content (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  content_type text not null,
  title text not null,
  body jsonb not null default '{}'::jsonb,
  status public.content_status not null default 'draft',
  sort_order integer not null default 0,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_content_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint site_content_type_format check (content_type ~ '^[a-z][a-z0-9_]{1,49}$'),
  constraint site_content_title_length check (char_length(btrim(title)) between 1 and 160),
  constraint site_content_body_object check (jsonb_typeof(body) = 'object'),
  constraint site_content_publication_state check (
    (status = 'published' and published_at is not null)
    or (status <> 'published')
  )
);

create table public.portfolio_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text not null,
  story text not null,
  materials text[] not null default '{}',
  techniques text[] not null default '{}',
  status public.content_status not null default 'draft',
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  completed_on date,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_projects_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint portfolio_projects_title_length check (char_length(btrim(title)) between 1 and 160),
  constraint portfolio_projects_excerpt_length check (char_length(btrim(excerpt)) between 1 and 500),
  constraint portfolio_projects_story_length check (char_length(btrim(story)) between 1 and 12000),
  constraint portfolio_projects_publication_state check (
    (status = 'published' and published_at is not null)
    or (status <> 'published')
  )
);

create table public.portfolio_media (
  id uuid primary key default gen_random_uuid(),
  portfolio_project_id uuid not null references public.portfolio_projects (id) on delete cascade,
  bucket_id text not null default 'portfolio-public',
  object_path text not null,
  media_type text not null default 'image',
  alt_text text not null,
  width integer,
  height integer,
  blurhash text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint portfolio_media_object_unique unique (bucket_id, object_path),
  constraint portfolio_media_public_bucket check (bucket_id = 'portfolio-public'),
  constraint portfolio_media_path_safe check (
    object_path <> ''
    and object_path !~ '(^|/)\.\.?(/|$)'
  ),
  constraint portfolio_media_type check (media_type in ('image', 'video')),
  constraint portfolio_media_alt_length check (char_length(btrim(alt_text)) between 1 and 300),
  constraint portfolio_media_dimensions check (
    (width is null and height is null)
    or (
      width is not null
      and height is not null
      and width > 0
      and height > 0
    )
  )
);

create table public.design_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete restrict,
  reference_code text not null unique default (
    'DR-' || upper(replace(gen_random_uuid()::text, '-', ''))
  ),
  title text not null,
  request_type text not null,
  occasion text,
  desired_by date,
  budget_min_minor bigint,
  budget_max_minor bigint,
  currency text not null default 'USD',
  description text not null,
  metal_preferences text[] not null default '{}',
  stone_preferences text[] not null default '{}',
  ring_size text,
  inspiration_notes text,
  status public.design_request_status not null default 'draft',
  submitted_at timestamptz,
  lock_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint design_requests_title_length check (char_length(btrim(title)) between 1 and 160),
  constraint design_requests_type_format check (request_type ~ '^[a-z][a-z0-9_]{1,49}$'),
  constraint design_requests_description_length check (
    char_length(btrim(description)) between 20 and 12000
  ),
  constraint design_requests_budget_values check (
    (budget_min_minor is null or budget_min_minor >= 0)
    and (budget_max_minor is null or budget_max_minor >= 0)
    and (
      budget_min_minor is null
      or budget_max_minor is null
      or budget_max_minor >= budget_min_minor
    )
  ),
  constraint design_requests_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint design_requests_submission_state check (
    (status = 'draft' and submitted_at is null)
    or status = 'closed'
    or (status not in ('draft', 'closed') and submitted_at is not null)
  ),
  constraint design_requests_lock_version_nonnegative check (lock_version >= 0)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  design_request_id uuid not null unique references public.design_requests (id) on delete restrict,
  customer_id uuid not null references public.profiles (id) on delete restrict,
  subject text not null,
  status public.conversation_status not null default 'open',
  last_message_at timestamptz,
  last_message_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint conversations_subject_length check (char_length(btrim(subject)) between 1 and 200),
  constraint conversations_closed_state check (
    (status = 'closed' and closed_at is not null)
    or (status <> 'closed' and closed_at is null)
  ),
  constraint conversations_activity_pair check (
    (last_message_at is null) = (last_message_id is null)
  )
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete restrict,
  sender_id uuid references public.profiles (id) on delete restrict,
  sender_kind public.message_kind not null,
  client_message_id uuid not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now(),
  constraint messages_client_id_unique unique (conversation_id, client_message_id),
  constraint messages_id_conversation_unique unique (id, conversation_id),
  constraint messages_sender_shape check (
    (sender_kind = 'system' and sender_id is null)
    or (sender_kind <> 'system' and sender_id is not null)
  ),
  constraint messages_body_length check (char_length(body) <= 4000),
  constraint messages_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages (id) on delete restrict,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  client_attachment_id uuid not null,
  bucket_id text not null default 'commission-private',
  object_path text not null,
  file_name text not null,
  mime_type text not null,
  byte_size bigint not null,
  sha256_hex text not null,
  verified_at timestamptz not null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  constraint message_attachments_client_id_unique unique (owner_id, client_attachment_id),
  constraint message_attachments_object_unique unique (bucket_id, object_path),
  constraint message_attachments_private_bucket check (bucket_id = 'commission-private'),
  constraint message_attachments_owner_path check (
    object_path like owner_id::text || '/%'
    and object_path !~ '(^|/)\.\.?(/|$)'
  ),
  constraint message_attachments_file_name_length check (
    char_length(btrim(file_name)) between 1 and 255
    and btrim(file_name) not in ('.', '..')
    and position('/' in file_name) = 0
    and position(E'\\' in file_name) = 0
    and file_name !~ '[[:cntrl:]]'
  ),
  constraint message_attachments_mime_allowed check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  constraint message_attachments_size check (byte_size between 1 and 6291456),
  constraint message_attachments_file_extension check (
    (
      mime_type = 'image/jpeg'
      and lower(file_name) ~ '\.(jpe?g)$'
    )
    or (mime_type = 'image/png' and lower(file_name) ~ '\.png$')
    or (mime_type = 'image/webp' and lower(file_name) ~ '\.webp$')
  ),
  constraint message_attachments_sha256 check (sha256_hex ~ '^[0-9a-f]{64}$'),
  constraint message_attachments_binding_state check (
    (message_id is null and finalized_at is null)
    or (message_id is not null and finalized_at is not null)
  )
);

alter table public.conversations
  add constraint conversations_last_message_fk
  foreign key (last_message_id, id)
  references public.messages (id, conversation_id)
  on delete restrict;

create table public.design_request_attachments (
  id uuid primary key default gen_random_uuid(),
  design_request_id uuid not null references public.design_requests (id) on delete restrict,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  client_attachment_id uuid not null,
  bucket_id text not null default 'commission-private',
  object_path text not null,
  file_name text not null,
  mime_type text not null,
  byte_size bigint not null,
  sha256_hex text not null,
  created_at timestamptz not null default now(),
  constraint design_request_attachments_client_id_unique unique (owner_id, client_attachment_id),
  constraint design_request_attachments_object_unique unique (bucket_id, object_path),
  constraint design_request_attachments_private_bucket check (bucket_id = 'commission-private'),
  constraint design_request_attachments_owner_path check (
    object_path like owner_id::text || '/%'
    and object_path !~ '(^|/)\.\.?(/|$)'
  ),
  constraint design_request_attachments_file_name check (
    char_length(btrim(file_name)) between 1 and 255
    and btrim(file_name) not in ('.', '..')
    and position('/' in file_name) = 0
    and position(E'\\' in file_name) = 0
    and file_name !~ '[[:cntrl:]]'
  ),
  constraint design_request_attachments_mime_allowed check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  constraint design_request_attachments_size check (byte_size between 1 and 6291456),
  constraint design_request_attachments_file_extension check (
    (
      mime_type = 'image/jpeg'
      and lower(file_name) ~ '\.(jpe?g)$'
    )
    or (mime_type = 'image/png' and lower(file_name) ~ '\.png$')
    or (mime_type = 'image/webp' and lower(file_name) ~ '\.webp$')
  ),
  constraint design_request_attachments_sha256 check (sha256_hex ~ '^[0-9a-f]{64}$')
);

create table public.conversation_read_markers (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_message_id uuid,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id),
  constraint conversation_read_marker_message_fk
    foreign key (last_read_message_id, conversation_id)
    references public.messages (id, conversation_id)
    on delete restrict
);

create table public.quote_versions (
  id uuid primary key default gen_random_uuid(),
  design_request_id uuid not null references public.design_requests (id) on delete restrict,
  version_number smallint not null,
  title text not null,
  introduction text,
  terms text not null,
  currency text not null default 'USD',
  production_weeks integer not null,
  valid_until timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint quote_versions_request_version_unique unique (design_request_id, version_number),
  constraint quote_versions_id_request_unique unique (id, design_request_id),
  constraint quote_versions_version_positive check (version_number > 0),
  constraint quote_versions_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint quote_versions_terms_length check (char_length(btrim(terms)) between 1 and 10000),
  constraint quote_versions_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint quote_versions_production_weeks check (production_weeks between 1 and 104),
  constraint quote_versions_validity check (
    valid_until is null or valid_until > created_at
  )
);

create table public.quote_options (
  id uuid primary key default gen_random_uuid(),
  quote_version_id uuid not null references public.quote_versions (id) on delete restrict,
  title text not null,
  description text not null,
  scope_snapshot jsonb not null,
  included_revision_rounds integer not null default 1,
  estimated_completion_days integer not null default 84,
  line_items jsonb not null default '[]'::jsonb,
  currency text not null,
  total_minor bigint not null,
  deposit_minor bigint not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint quote_options_id_version_unique unique (id, quote_version_id),
  constraint quote_options_version_title_unique unique (quote_version_id, title),
  constraint quote_options_title_length check (char_length(btrim(title)) between 1 and 120),
  constraint quote_options_description_length check (
    char_length(btrim(description)) between 1 and 4000
  ),
  constraint quote_options_scope_object check (jsonb_typeof(scope_snapshot) = 'object'),
  constraint quote_options_revision_rounds check (included_revision_rounds between 0 and 100),
  constraint quote_options_completion_days check (estimated_completion_days between 1 and 3650),
  constraint quote_options_line_items_array check (jsonb_typeof(line_items) = 'array'),
  constraint quote_options_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint quote_options_amounts check (
    total_minor between 1 and 99999999
    and deposit_minor = 0
  )
);

create table public.quote_status_events (
  id uuid primary key default gen_random_uuid(),
  quote_version_id uuid not null references public.quote_versions (id) on delete restrict,
  status public.quote_status not null,
  actor public.message_kind not null,
  changed_by uuid references public.profiles (id) on delete restrict,
  idempotency_key text not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint quote_status_events_idempotency_unique
    unique (quote_version_id, idempotency_key),
  constraint quote_status_events_appendable_status check (
    status in ('sent', 'viewed', 'countered', 'declined', 'cancelled')
  ),
  constraint quote_status_events_actor_shape check (
    (actor = 'system')
    or (actor <> 'system' and changed_by is not null)
  ),
  constraint quote_status_events_metadata_object check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint quote_status_events_idempotency_format check (
    char_length(idempotency_key) between 1 and 255
    and idempotency_key ~ '^[!-~]+$'
  )
);

create table public.quote_counteroffers (
  id uuid primary key default gen_random_uuid(),
  quote_version_id uuid not null references public.quote_versions (id) on delete restrict,
  quote_option_id uuid not null,
  customer_id uuid not null references public.profiles (id) on delete restrict,
  idempotency_key text not null,
  version_number smallint not null,
  status public.counteroffer_status not null default 'pending',
  currency text not null,
  proposed_total_minor bigint not null,
  proposed_deposit_minor bigint not null,
  proposed_scope jsonb not null,
  customer_note text not null,
  submitted_at timestamptz not null default now(),
  constraint quote_counteroffers_option_fk
    foreign key (quote_option_id, quote_version_id)
    references public.quote_options (id, quote_version_id)
    on delete restrict,
  constraint quote_counteroffers_version_unique
    unique (quote_version_id, customer_id, version_number),
  constraint quote_counteroffers_customer_idempotency_unique
    unique (customer_id, idempotency_key),
  constraint quote_counteroffers_id_version_unique unique (id, quote_version_id),
  constraint quote_counteroffers_version_positive check (version_number > 0),
  constraint quote_counteroffers_idempotency_format check (
    char_length(idempotency_key) between 1 and 255
    and idempotency_key ~ '^[!-~]+$'
  ),
  constraint quote_counteroffers_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint quote_counteroffers_amounts check (
    proposed_total_minor between 1 and 99999999
    and proposed_deposit_minor = 0
  ),
  constraint quote_counteroffers_scope_object check (jsonb_typeof(proposed_scope) = 'object'),
  constraint quote_counteroffers_note_length check (
    char_length(btrim(customer_note)) between 1 and 2000
  )
);

create table public.quote_counteroffer_decisions (
  id uuid primary key default gen_random_uuid(),
  counteroffer_id uuid not null unique references public.quote_counteroffers (id) on delete restrict,
  idempotency_key text not null unique,
  decision public.counteroffer_decision not null,
  response_note text,
  decided_by uuid not null references public.profiles (id) on delete restrict,
  decided_at timestamptz not null default now(),
  constraint quote_counteroffer_decisions_idempotency_format check (
    char_length(idempotency_key) between 1 and 255
    and idempotency_key ~ '^[!-~]+$'
  ),
  constraint quote_counteroffer_decision_note_length check (
    response_note is null or char_length(response_note) <= 5000
  )
);

create table public.quote_acceptances (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete restrict,
  design_request_id uuid not null unique references public.design_requests (id) on delete restrict,
  quote_version_id uuid not null,
  selected_quote_option_id uuid,
  selected_counteroffer_id uuid,
  idempotency_key text not null,
  accepted_quote_version smallint not null,
  accepted_title text not null,
  accepted_currency text not null,
  accepted_total_minor bigint not null,
  accepted_deposit_minor bigint not null,
  accepted_scope jsonb not null,
  accepted_terms text not null,
  accepted_production_weeks integer not null,
  accepted_option_snapshot jsonb,
  accepted_counteroffer_snapshot jsonb,
  accepted_quote_snapshot jsonb not null,
  accepted_at timestamptz not null default now(),
  constraint quote_acceptances_customer_idempotency_unique unique (customer_id, idempotency_key),
  constraint quote_acceptances_idempotency_format check (
    char_length(idempotency_key) between 1 and 255
    and idempotency_key ~ '^[!-~]+$'
  ),
  constraint quote_acceptances_quote_request_fk
    foreign key (quote_version_id, design_request_id)
    references public.quote_versions (id, design_request_id)
    on delete restrict,
  constraint quote_acceptances_option_version_fk
    foreign key (selected_quote_option_id, quote_version_id)
    references public.quote_options (id, quote_version_id)
    on delete restrict,
  constraint quote_acceptances_counteroffer_version_fk
    foreign key (selected_counteroffer_id, quote_version_id)
    references public.quote_counteroffers (id, quote_version_id)
    on delete restrict,
  constraint quote_acceptances_selection check (
    num_nonnulls(selected_quote_option_id, selected_counteroffer_id) = 1
  ),
  constraint quote_acceptances_version_positive check (accepted_quote_version > 0),
  constraint quote_acceptances_currency_format check (accepted_currency ~ '^[A-Z]{3}$'),
  constraint quote_acceptances_amounts check (
    accepted_total_minor between 1 and 99999999
    and accepted_deposit_minor = 0
  ),
  constraint quote_acceptances_scope_object check (jsonb_typeof(accepted_scope) = 'object'),
  constraint quote_acceptances_quote_snapshot_object check (
    jsonb_typeof(accepted_quote_snapshot) = 'object'
  ),
  constraint quote_acceptances_production_weeks check (accepted_production_weeks between 1 and 104),
  constraint quote_acceptances_snapshot_shape check (
    (
      selected_quote_option_id is not null
      and accepted_option_snapshot is not null
      and accepted_counteroffer_snapshot is null
    )
    or (
      selected_counteroffer_id is not null
      and accepted_counteroffer_snapshot is not null
    )
  )
);

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique,
  quote_acceptance_id uuid not null unique references public.quote_acceptances (id) on delete restrict,
  design_request_id uuid not null unique references public.design_requests (id) on delete restrict,
  customer_id uuid not null references public.profiles (id) on delete restrict,
  status public.commission_status not null default 'awaiting_admin_confirmation',
  accepted_quote_version smallint not null,
  accepted_title text not null,
  accepted_currency text not null,
  accepted_total_minor bigint not null,
  accepted_deposit_minor bigint not null,
  accepted_scope jsonb not null,
  accepted_terms text not null,
  accepted_production_weeks integer not null,
  accepted_option_snapshot jsonb,
  accepted_counteroffer_snapshot jsonb,
  accepted_quote_snapshot jsonb not null,
  accepted_at timestamptz not null,
  started_at timestamptz,
  target_completion_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commissions_reference_format check (reference_code ~ '^VYR-[A-F0-9]{32}$'),
  constraint commissions_currency_format check (accepted_currency ~ '^[A-Z]{3}$'),
  constraint commissions_amounts check (
    accepted_total_minor between 1 and 99999999
    and accepted_deposit_minor = 0
  ),
  constraint commissions_scope_object check (jsonb_typeof(accepted_scope) = 'object'),
  constraint commissions_quote_snapshot_object check (
    jsonb_typeof(accepted_quote_snapshot) = 'object'
  ),
  constraint commissions_production_weeks check (accepted_production_weeks between 1 and 104),
  constraint commissions_acceptance_snapshot_present check (
    accepted_option_snapshot is not null
    or accepted_counteroffer_snapshot is not null
  ),
  constraint commissions_completed_state check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

create table public.commission_status_history (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references public.commissions (id) on delete restrict,
  from_status public.commission_status,
  to_status public.commission_status not null,
  actor public.message_kind not null,
  changed_by uuid references public.profiles (id) on delete restrict,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint commission_history_idempotency_unique unique (commission_id, idempotency_key),
  constraint commission_history_idempotency_format check (
    char_length(idempotency_key) between 1 and 255
    and idempotency_key ~ '^[!-~]+$'
  ),
  constraint commission_history_actual_change check (
    from_status is null or from_status <> to_status
  ),
  constraint commission_history_reason_length check (
    reason is null or char_length(reason) <= 2000
  ),
  constraint commission_history_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table public.design_drafts (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references public.commissions (id) on delete restrict,
  sequence_number smallint not null,
  stage text not null,
  title text not null,
  status public.draft_status not null default 'working',
  published_at timestamptz,
  approved_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint design_drafts_sequence_unique unique (commission_id, sequence_number),
  constraint design_drafts_sequence_positive check (sequence_number > 0),
  constraint design_drafts_stage_format check (stage ~ '^[a-z][a-z0-9_]{1,49}$'),
  constraint design_drafts_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint design_drafts_publication_state check (
    (status = 'working' and published_at is null)
    or (status <> 'working' and published_at is not null)
  ),
  constraint design_drafts_approval_state check (
    (status = 'approved' and approved_at is not null)
    or (status in ('working', 'shared') and approved_at is null)
    or status = 'superseded'
  )
);

create table public.draft_revisions (
  id uuid primary key default gen_random_uuid(),
  design_draft_id uuid not null references public.design_drafts (id) on delete restrict,
  revision_number smallint not null,
  idempotency_key text,
  status public.draft_status not null default 'working',
  summary text not null,
  specifications jsonb not null,
  customer_message text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint draft_revisions_version_unique unique (design_draft_id, revision_number),
  constraint draft_revisions_idempotency_unique unique (design_draft_id, idempotency_key),
  constraint draft_revisions_id_draft_unique unique (id, design_draft_id),
  constraint draft_revisions_version_positive check (revision_number > 0),
  constraint draft_revisions_idempotency_format check (
    idempotency_key is null
    or (
      char_length(idempotency_key) between 1 and 255
      and idempotency_key ~ '^[!-~]+$'
    )
  ),
  constraint draft_revisions_publication_state check (
    (status = 'working' and published_at is null)
    or (status <> 'working' and published_at is not null)
  ),
  constraint draft_revisions_summary_length check (char_length(btrim(summary)) between 1 and 5000),
  constraint draft_revisions_specifications_object check (jsonb_typeof(specifications) = 'object'),
  constraint draft_revisions_customer_message_length check (
    customer_message is null or char_length(customer_message) <= 5000
  )
);

create table public.draft_revision_assets (
  id uuid primary key default gen_random_uuid(),
  draft_revision_id uuid not null references public.draft_revisions (id) on delete restrict,
  bucket_id text not null default 'commission-private',
  object_path text not null,
  file_name text not null,
  mime_type text not null,
  byte_size bigint not null,
  sha256_hex text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint draft_revision_assets_object_unique unique (bucket_id, object_path),
  constraint draft_revision_assets_private_bucket check (bucket_id = 'commission-private'),
  constraint draft_revision_assets_path_safe check (
    object_path <> ''
    and object_path !~ '(^|/)\.\.?(/|$)'
  ),
  constraint draft_revision_assets_file_name_length check (
    char_length(btrim(file_name)) between 1 and 255
  ),
  constraint draft_revision_assets_size check (byte_size between 1 and 26214400),
  constraint draft_revision_assets_sha256 check (sha256_hex ~ '^[0-9a-f]{64}$')
);

create table public.draft_feedback (
  id uuid primary key default gen_random_uuid(),
  draft_revision_id uuid not null references public.draft_revisions (id) on delete restrict,
  customer_id uuid not null references public.profiles (id) on delete restrict,
  kind public.draft_feedback_kind not null,
  body text,
  client_feedback_id uuid not null,
  requested_by public.message_kind not null default 'customer',
  consumes_included_revision boolean not null default false,
  complimentary boolean not null default false,
  override_reason text,
  remaining_revision_rounds integer,
  created_at timestamptz not null default now(),
  constraint draft_feedback_client_id_unique unique (customer_id, client_feedback_id),
  constraint draft_feedback_body_required check (
    (kind = 'approved' and (body is null or char_length(body) <= 5000))
    or (
      kind <> 'approved'
      and coalesce(char_length(btrim(body)) between 1 and 5000, false)
    )
  ),
  constraint draft_feedback_revision_accounting check (
    not (consumes_included_revision and complimentary)
    and (
      (complimentary and requested_by = 'admin' and char_length(btrim(override_reason)) between 1 and 1000)
      or (not complimentary and override_reason is null)
    )
    and (
      (
        kind = 'changes_requested'
        and remaining_revision_rounds is not null
        and remaining_revision_rounds >= 0
      )
      or (kind <> 'changes_requested' and remaining_revision_rounds is null)
    )
  )
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references public.commissions (id) on delete restrict,
  customer_id uuid not null references public.profiles (id) on delete restrict,
  provider public.payment_provider not null,
  provider_payment_id text,
  provider_checkout_session_id text,
  provider_idempotency_key text not null,
  kind public.payment_kind not null,
  attempt_number integer,
  status public.payment_status not null,
  currency text not null,
  amount_minor bigint not null,
  refunded_minor bigint not null default 0,
  checkout_created_at timestamptz,
  checkout_expires_at timestamptz,
  provider_created_at timestamptz,
  last_provider_event_at timestamptz,
  captured_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_provider_payment_unique unique (provider, provider_payment_id),
  constraint payments_provider_checkout_unique unique (provider, provider_checkout_session_id),
  constraint payments_provider_idempotency_unique unique (provider, provider_idempotency_key),
  constraint payments_final_attempt_unique unique (commission_id, kind, attempt_number),
  constraint payments_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint payments_provider_identifier_lengths check (
    (provider_payment_id is null or char_length(provider_payment_id) between 1 and 255)
    and (
      provider_checkout_session_id is null
      or char_length(provider_checkout_session_id) between 1 and 255
    )
    and char_length(provider_idempotency_key) between 1 and 255
  ),
  constraint payments_amounts check (
    amount_minor between 1 and 99999999
    and refunded_minor >= 0
    and refunded_minor <= amount_minor
  ),
  constraint payments_attempt_shape check (
    (kind = 'final' and attempt_number is not null and attempt_number > 0)
    or (kind = 'refund' and attempt_number is null)
  ),
  constraint payments_capture_state check (
    status not in ('succeeded', 'partially_refunded', 'refunded') or captured_at is not null
  ),
  constraint payments_checkout_shape check (
    (
      provider_checkout_session_id is null
      and checkout_created_at is null
      and checkout_expires_at is null
    )
    or (
      provider_checkout_session_id is not null
      and checkout_created_at is not null
      and checkout_expires_at > checkout_created_at
    )
  ),
  constraint payments_provider_event_order check (
    last_provider_event_at is null
    or provider_created_at is null
    or last_provider_event_at >= provider_created_at
  ),
  constraint payments_failure_code_length check (
    failure_code is null or char_length(failure_code) <= 100
  )
);

create table public.payment_status_history (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete restrict,
  from_status public.payment_status,
  to_status public.payment_status not null,
  event public.payment_event not null,
  provider_event_id text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint payment_history_event_unique unique (payment_id, provider_event_id, to_status),
  constraint payment_history_actual_change check (
    from_status is null or from_status <> to_status
  )
);

create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references public.commissions (id) on delete restrict,
  customer_id uuid not null references public.profiles (id) on delete restrict,
  kind public.deliverable_kind not null,
  status public.deliverable_status not null default 'preparing',
  version_number smallint not null default 1,
  title text not null,
  description text,
  file_name text not null,
  mime_type text not null,
  byte_size bigint not null,
  sha256_hex text not null,
  released_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deliverables_version_unique unique (commission_id, kind, version_number),
  constraint deliverables_version_positive check (version_number > 0),
  constraint deliverables_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint deliverables_description_length check (
    description is null or char_length(description) <= 5000
  ),
  constraint deliverables_file_name_length check (
    char_length(btrim(file_name)) between 1 and 255
  ),
  constraint deliverables_size check (byte_size between 1 and 262144000),
  constraint deliverables_sha256 check (sha256_hex ~ '^[0-9a-f]{64}$'),
  constraint deliverables_release_state check (
    (status = 'preparing' and released_at is null and revoked_at is null)
    or (status = 'released' and released_at is not null and revoked_at is null)
    or (status = 'revoked' and released_at is not null and revoked_at is not null)
  )
);

create table public.aftercare_cases (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references public.commissions (id) on delete restrict,
  customer_id uuid not null references public.profiles (id) on delete restrict,
  client_request_id uuid not null,
  idempotency_key text,
  category text not null,
  subject text not null,
  description text not null,
  status public.aftercare_status not null default 'open',
  opened_by uuid not null references public.profiles (id) on delete restrict,
  assigned_to uuid references public.profiles (id) on delete restrict,
  opened_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint aftercare_cases_client_id_unique unique (customer_id, client_request_id),
  constraint aftercare_cases_idempotency_unique unique (customer_id, idempotency_key),
  constraint aftercare_cases_idempotency_format check (
    idempotency_key is null
    or (
      char_length(idempotency_key) between 1 and 255
      and idempotency_key ~ '^[!-~]+$'
    )
  ),
  constraint aftercare_cases_category_format check (category ~ '^[a-z][a-z0-9_]{1,49}$'),
  constraint aftercare_cases_subject_length check (char_length(btrim(subject)) between 1 and 200),
  constraint aftercare_cases_description_length check (
    char_length(btrim(description)) between 10 and 5000
  ),
  constraint aftercare_cases_completed_state check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

create table public.aftercare_completions (
  id uuid primary key default gen_random_uuid(),
  aftercare_case_id uuid not null unique references public.aftercare_cases (id) on delete restrict,
  idempotency_key text not null unique,
  resolution_summary text not null,
  completion_snapshot jsonb not null,
  completed_by uuid not null references public.profiles (id) on delete restrict,
  completed_at timestamptz not null default now(),
  constraint aftercare_completions_summary_length check (
    char_length(btrim(resolution_summary)) between 10 and 5000
  ),
  constraint aftercare_completions_snapshot_object check (
    jsonb_typeof(completion_snapshot) = 'object'
  ),
  constraint aftercare_completions_idempotency_format check (
    char_length(idempotency_key) between 1 and 255
    and idempotency_key ~ '^[!-~]+$'
  )
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  event public.notification_event not null,
  title text not null,
  body text not null,
  resource_type text,
  resource_id uuid,
  dedupe_key text not null,
  read_at timestamptz,
  dismissed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_recipient_dedupe_unique unique (recipient_id, dedupe_key),
  constraint notifications_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint notifications_body_length check (char_length(btrim(body)) between 1 and 5000),
  constraint notifications_resource_pair check (
    (resource_type is null) = (resource_id is null)
  ),
  constraint notifications_expiry check (expires_at is null or expires_at > created_at),
  constraint notifications_dismissal check (
    dismissed_at is null
    or (read_at is not null and dismissed_at >= read_at)
  )
);

create table public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete restrict,
  design_request_id uuid references public.design_requests (id) on delete restrict,
  conversation_id uuid references public.conversations (id) on delete restrict,
  commission_id uuid references public.commissions (id) on delete restrict,
  author_id uuid not null references public.profiles (id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_notes_one_subject check (
    num_nonnulls(profile_id, design_request_id, conversation_id, commission_id) = 1
  ),
  constraint admin_notes_body_length check (char_length(btrim(body)) between 1 and 10000)
);

create table private.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider public.payment_provider not null,
  provider_event_id text not null,
  event_type text not null,
  domain_event public.payment_event not null,
  payload_sha256 text not null,
  sanitized_payload jsonb not null default '{}'::jsonb,
  payment_id uuid not null references public.payments (id) on delete restrict,
  signature_verified_at timestamptz not null,
  provider_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint payment_webhook_provider_event_unique unique (provider, provider_event_id),
  constraint payment_webhook_event_type_length check (
    char_length(btrim(event_type)) between 1 and 200
  ),
  constraint payment_webhook_sha256 check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  constraint payment_webhook_payload_object check (jsonb_typeof(sanitized_payload) = 'object')
);

create table private.stripe_event_receipts (
  provider_event_id text primary key,
  event_family text not null,
  event_type text not null,
  payload_sha256 text not null,
  provider_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint stripe_event_receipts_family check (
    event_family in ('checkout', 'payment', 'refund', 'dispute')
  ),
  constraint stripe_event_receipts_event_id_length check (
    char_length(provider_event_id) between 1 and 255
  ),
  constraint stripe_event_receipts_event_type_length check (
    char_length(event_type) between 1 and 200
  ),
  constraint stripe_event_receipts_sha256 check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
  )
);

create table private.payment_checkout_requests (
  customer_id uuid not null references public.profiles (id) on delete restrict,
  request_key text not null,
  commission_id uuid not null references public.commissions (id) on delete restrict,
  payment_id uuid not null references public.payments (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (customer_id, request_key),
  constraint payment_checkout_requests_key_format check (
    char_length(request_key) between 1 and 255
    and request_key ~ '^[!-~]+$'
  )
);

create table private.stripe_refund_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique
    references private.stripe_event_receipts (provider_event_id) on delete restrict,
  payment_id uuid not null references public.payments (id) on delete restrict,
  provider_refund_id text not null,
  provider_payment_id text not null,
  refund_status text not null,
  currency text not null,
  amount_minor bigint not null,
  safe_payload jsonb not null default '{}'::jsonb,
  signature_verified_at timestamptz not null,
  provider_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint stripe_refund_events_refund_id_length check (
    char_length(provider_refund_id) between 1 and 255
  ),
  constraint stripe_refund_events_payment_id_length check (
    char_length(provider_payment_id) between 1 and 255
  ),
  constraint stripe_refund_events_status check (
    refund_status in (
      'pending',
      'requires_action',
      'succeeded',
      'failed',
      'canceled'
    )
  ),
  constraint stripe_refund_events_currency check (currency ~ '^[A-Z]{3}$'),
  constraint stripe_refund_events_amount check (amount_minor > 0),
  constraint stripe_refund_events_payload_object check (
    jsonb_typeof(safe_payload) = 'object'
  )
);

create table private.stripe_charge_refund_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique
    references private.stripe_event_receipts (provider_event_id) on delete restrict,
  payment_id uuid not null references public.payments (id) on delete restrict,
  provider_charge_id text not null,
  provider_payment_id text not null,
  currency text not null,
  cumulative_refunded_minor bigint not null,
  safe_payload jsonb not null default '{}'::jsonb,
  signature_verified_at timestamptz not null,
  provider_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint stripe_charge_refund_events_charge_id_length check (
    char_length(provider_charge_id) between 1 and 255
  ),
  constraint stripe_charge_refund_events_payment_id_length check (
    char_length(provider_payment_id) between 1 and 255
  ),
  constraint stripe_charge_refund_events_currency check (currency ~ '^[A-Z]{3}$'),
  constraint stripe_charge_refund_events_amount check (cumulative_refunded_minor > 0),
  constraint stripe_charge_refund_events_payload_object check (
    jsonb_typeof(safe_payload) = 'object'
  )
);

create table private.stripe_checkout_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique
    references private.stripe_event_receipts (provider_event_id) on delete restrict,
  payment_id uuid not null references public.payments (id) on delete restrict,
  provider_checkout_session_id text not null,
  event_type text not null,
  safe_payload jsonb not null default '{}'::jsonb,
  signature_verified_at timestamptz not null,
  provider_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint stripe_checkout_events_session_id_length check (
    char_length(provider_checkout_session_id) between 1 and 255
  ),
  constraint stripe_checkout_events_type check (
    event_type = 'checkout.session.expired'
  ),
  constraint stripe_checkout_events_payload_object check (
    jsonb_typeof(safe_payload) = 'object'
  )
);

create table private.stripe_dispute_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique
    references private.stripe_event_receipts (provider_event_id) on delete restrict,
  payment_id uuid not null references public.payments (id) on delete restrict,
  provider_dispute_id text not null,
  provider_payment_id text not null,
  dispute_status text not null,
  currency text not null,
  amount_minor bigint not null,
  reason text,
  safe_payload jsonb not null default '{}'::jsonb,
  signature_verified_at timestamptz not null,
  provider_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint stripe_dispute_events_dispute_id_length check (
    char_length(provider_dispute_id) between 1 and 255
  ),
  constraint stripe_dispute_events_payment_id_length check (
    char_length(provider_payment_id) between 1 and 255
  ),
  constraint stripe_dispute_events_status check (
    dispute_status in (
      'warning_needs_response',
      'warning_under_review',
      'warning_closed',
      'needs_response',
      'under_review',
      'won',
      'lost',
      'prevented'
    )
  ),
  constraint stripe_dispute_events_currency check (currency ~ '^[A-Z]{3}$'),
  constraint stripe_dispute_events_amount check (amount_minor > 0),
  constraint stripe_dispute_events_reason_length check (
    reason is null or char_length(reason) <= 100
  ),
  constraint stripe_dispute_events_payload_object check (
    jsonb_typeof(safe_payload) = 'object'
  )
);

create table private.deliverable_secrets (
  deliverable_id uuid primary key references public.deliverables (id) on delete cascade,
  bucket_id text not null default 'deliverables-private',
  object_path text not null,
  secret_url text not null,
  access_token_hash bytea,
  token_expires_at timestamptz,
  encryption_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  constraint deliverable_secrets_object_unique unique (bucket_id, object_path),
  constraint deliverable_secrets_private_bucket check (bucket_id = 'deliverables-private'),
  constraint deliverable_secrets_path_safe check (
    object_path <> ''
    and object_path !~ '(^|/)\.\.?(/|$)'
  ),
  constraint deliverable_secrets_https_url check (
    char_length(secret_url) between 9 and 4096
    and secret_url ~ '^https://[^[:space:][:cntrl:]]+$'
  ),
  constraint deliverable_secrets_token_pair check (
    (access_token_hash is null) = (token_expires_at is null)
  ),
  constraint deliverable_secrets_context_object check (
    jsonb_typeof(encryption_context) = 'object'
  )
);

create table private.deliverable_access_logs (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables (id) on delete restrict,
  request_id uuid not null unique,
  accessed_by uuid,
  token_fingerprint bytea,
  ip_address inet,
  user_agent text,
  outcome text not null,
  occurred_at timestamptz not null default now(),
  constraint deliverable_access_outcome check (
    outcome in ('allowed', 'denied', 'expired', 'revoked', 'not_found')
  ),
  constraint deliverable_access_user_agent_length check (
    user_agent is null or char_length(user_agent) <= 1000
  )
);

create table private.deliverable_write_requests (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  input_sha256 text not null,
  deliverable_id uuid not null references public.deliverables (id) on delete restrict,
  actor_id uuid not null references public.profiles (id) on delete restrict,
  operation text not null,
  result_status public.deliverable_status not null,
  created_at timestamptz not null default now(),
  constraint deliverable_write_requests_idempotency_format check (
    char_length(idempotency_key) between 1 and 255
    and idempotency_key ~ '^[!-~]+$'
  ),
  constraint deliverable_write_requests_sha256 check (
    input_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint deliverable_write_requests_operation check (
    operation in ('created', 'updated', 'released')
  )
);

create table private.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel public.notification_channel not null,
  attempt_number smallint not null,
  status public.notification_status not null default 'pending',
  destination_masked text not null,
  destination_ciphertext bytea,
  provider_message_id text,
  error_code text,
  error_detail text,
  next_attempt_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notification_attempt_number_unique
    unique (notification_id, channel, attempt_number),
  constraint notification_attempt_provider_message_unique unique (provider_message_id),
  constraint notification_attempt_number_positive check (attempt_number > 0),
  constraint notification_attempt_destination_length check (
    char_length(destination_masked) between 1 and 320
  ),
  constraint notification_attempt_error_lengths check (
    (error_code is null or char_length(error_code) <= 100)
    and (error_detail is null or char_length(error_detail) <= 2000)
  ),
  constraint notification_attempt_completion_order check (
    completed_at is null or started_at is null or completed_at >= started_at
  )
);

create table private.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text not null,
  schema_name text not null,
  table_name text not null,
  record_id uuid,
  old_record jsonb,
  new_record jsonb,
  request_id text,
  occurred_at timestamptz not null default now(),
  constraint audit_logs_action check (action in ('INSERT', 'UPDATE', 'DELETE')),
  constraint audit_logs_table_name_length check (
    char_length(schema_name) between 1 and 63
    and char_length(table_name) between 1 and 63
  )
);

create table private.rate_limit_rules (
  action public.rate_limit_action primary key,
  max_requests integer not null,
  window_seconds integer not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint rate_limit_rules_values check (
    max_requests between 1 and 100000
    and window_seconds between 1 and 2592000
  )
);

create table private.rate_limit_buckets (
  action public.rate_limit_action not null references private.rate_limit_rules (action) on delete restrict,
  subject_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null,
  updated_at timestamptz not null default now(),
  primary key (action, subject_hash, window_started_at),
  constraint rate_limit_buckets_subject_hash check (subject_hash ~ '^[0-9a-f]{64}$'),
  constraint rate_limit_buckets_count check (request_count > 0)
);

insert into private.rate_limit_rules (action, max_requests, window_seconds)
values
  ('design_request_submit', 3, 3600),
  ('message_send', 30, 60),
  ('counteroffer_submit', 10, 3600),
  ('quote_accept', 5, 3600),
  ('aftercare_open', 3, 86400),
  ('deliverable_access', 20, 60);

create index profiles_updated_at_idx on public.profiles (updated_at desc);
create unique index admin_allowlist_single_active_idx
  on public.admin_allowlist ((true))
  where is_active;
create index site_content_public_idx
  on public.site_content (content_type, sort_order, published_at desc)
  where status = 'published';
create unique index site_settings_published_idx
  on public.site_settings (settings_key)
  where status = 'published';
create index portfolio_projects_public_idx
  on public.portfolio_projects (is_featured desc, sort_order, published_at desc)
  where status = 'published';
create index portfolio_media_project_sort_idx
  on public.portfolio_media (portfolio_project_id, sort_order);
create index design_requests_customer_created_idx
  on public.design_requests (customer_id, created_at desc);
create index design_requests_status_created_idx
  on public.design_requests (status, created_at desc);
create index conversations_customer_updated_idx
  on public.conversations (customer_id, updated_at desc);
create index conversations_activity_idx
  on public.conversations (
    (coalesce(last_message_at, created_at)) desc,
    id desc
  );
create index messages_conversation_sent_idx
  on public.messages (conversation_id, sent_at desc, id desc);
create index message_attachments_message_idx on public.message_attachments (message_id);
create index design_request_attachments_request_idx
  on public.design_request_attachments (design_request_id, created_at);
create index conversation_read_markers_user_idx
  on public.conversation_read_markers (
    user_id,
    conversation_id,
    last_read_at,
    last_read_message_id
  );
create index quote_versions_request_created_idx
  on public.quote_versions (design_request_id, version_number desc);
create index quote_versions_sent_validity_idx
  on public.quote_versions (valid_until)
  where valid_until is not null;
create index quote_options_version_sort_idx
  on public.quote_options (quote_version_id, sort_order);
create index quote_status_events_quote_time_idx
  on public.quote_status_events (quote_version_id, occurred_at desc, id desc);
create index quote_status_events_sent_idx
  on public.quote_status_events (quote_version_id, occurred_at)
  where status = 'sent';
create index quote_counteroffers_customer_created_idx
  on public.quote_counteroffers (customer_id, submitted_at desc);
create index quote_counteroffers_quote_created_idx
  on public.quote_counteroffers (quote_version_id, submitted_at desc);
create unique index quote_counteroffers_one_accepted_idx
  on public.quote_counteroffers (quote_version_id)
  where status = 'accepted';
create index quote_acceptances_customer_created_idx
  on public.quote_acceptances (customer_id, accepted_at desc);
create index quote_acceptances_quote_idx
  on public.quote_acceptances (quote_version_id);
create index quote_acceptances_option_idx
  on public.quote_acceptances (selected_quote_option_id)
  where selected_quote_option_id is not null;
create index quote_acceptances_counteroffer_idx
  on public.quote_acceptances (selected_counteroffer_id)
  where selected_counteroffer_id is not null;
create index commissions_customer_created_idx
  on public.commissions (customer_id, created_at desc);
create index commissions_status_updated_idx
  on public.commissions (status, updated_at desc);
create index commission_history_commission_created_idx
  on public.commission_status_history (commission_id, created_at, id);
create index design_drafts_commission_sequence_idx
  on public.design_drafts (commission_id, sequence_number desc);
create index draft_revisions_draft_version_idx
  on public.draft_revisions (design_draft_id, revision_number desc);
create index draft_revision_assets_revision_sort_idx
  on public.draft_revision_assets (draft_revision_id, sort_order);
create index draft_feedback_revision_created_idx
  on public.draft_feedback (draft_revision_id, created_at);
create index payments_commission_created_idx
  on public.payments (commission_id, created_at desc);
create index payments_customer_created_idx
  on public.payments (customer_id, created_at desc);
create unique index payments_one_active_final_checkout_idx
  on public.payments (commission_id)
  where kind = 'final'
    and status in ('not_started', 'pending', 'processing');
create index payment_history_payment_occurred_idx
  on public.payment_status_history (payment_id, occurred_at, id);
create index deliverables_customer_release_idx
  on public.deliverables (customer_id, released_at desc)
  where status = 'released';
create index deliverables_commission_idx
  on public.deliverables (commission_id, kind, version_number desc);
create index aftercare_cases_customer_created_idx
  on public.aftercare_cases (customer_id, opened_at desc);
create index aftercare_cases_commission_status_idx
  on public.aftercare_cases (commission_id, status);
create index aftercare_completions_completed_idx
  on public.aftercare_completions (completed_at desc, id desc);
create index notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null and dismissed_at is null;
create index notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc, id desc);
create index admin_notes_profile_created_idx
  on public.admin_notes (profile_id, created_at desc)
  where profile_id is not null;
create index admin_notes_request_created_idx
  on public.admin_notes (design_request_id, created_at desc)
  where design_request_id is not null;
create index admin_notes_conversation_created_idx
  on public.admin_notes (conversation_id, created_at desc)
  where conversation_id is not null;
create index admin_notes_commission_created_idx
  on public.admin_notes (commission_id, created_at desc)
  where commission_id is not null;
create index payment_webhooks_payment_received_idx
  on private.payment_webhook_events (payment_id, received_at desc);
create index stripe_event_receipts_received_idx
  on private.stripe_event_receipts (received_at desc);
create index payment_checkout_requests_payment_idx
  on private.payment_checkout_requests (payment_id);
create index stripe_refund_events_payment_time_idx
  on private.stripe_refund_events (payment_id, provider_created_at desc, provider_event_id desc);
create index stripe_refund_events_refund_time_idx
  on private.stripe_refund_events (provider_refund_id, provider_created_at desc, provider_event_id desc);
create index stripe_charge_refund_events_payment_time_idx
  on private.stripe_charge_refund_events (payment_id, provider_created_at desc, provider_event_id desc);
create index stripe_charge_refund_events_charge_time_idx
  on private.stripe_charge_refund_events (provider_charge_id, provider_created_at desc, provider_event_id desc);
create index stripe_checkout_events_payment_time_idx
  on private.stripe_checkout_events (payment_id, provider_created_at desc, provider_event_id desc);
create index stripe_checkout_events_session_time_idx
  on private.stripe_checkout_events (provider_checkout_session_id, provider_created_at desc);
create index stripe_dispute_events_payment_time_idx
  on private.stripe_dispute_events (payment_id, provider_created_at desc, provider_event_id desc);
create index stripe_dispute_events_dispute_time_idx
  on private.stripe_dispute_events (provider_dispute_id, provider_created_at desc, provider_event_id desc);
create index deliverable_access_logs_deliverable_time_idx
  on private.deliverable_access_logs (deliverable_id, occurred_at desc);
create index deliverable_write_requests_deliverable_time_idx
  on private.deliverable_write_requests (deliverable_id, created_at desc);
create index notification_attempts_due_idx
  on private.notification_delivery_attempts (status, next_attempt_at)
  where status in ('pending', 'failed');
create index audit_logs_record_time_idx
  on private.audit_logs (schema_name, table_name, record_id, occurred_at desc);
create index audit_logs_actor_time_idx
  on private.audit_logs (actor_id, occurred_at desc);
create index rate_limit_buckets_updated_idx
  on private.rate_limit_buckets (updated_at);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.prevent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = coalesce(tg_argv[0], tg_table_name || ' rows are immutable');
end;
$$;

create or replace function private.validate_conversation_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  request_customer uuid;
begin
  select customer_id
  into request_customer
  from public.design_requests
  where id = new.design_request_id;

  if request_customer is distinct from new.customer_id then
    raise exception using
      errcode = '23514',
      message = 'conversation customer must own the design request';
  end if;

  return new;
end;
$$;

create or replace function private.validate_read_marker_boundary()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  message_sent_at timestamptz;
begin
  if new.last_read_message_id is null then
    return new;
  end if;

  select sent_at
  into message_sent_at
  from public.messages
  where id = new.last_read_message_id
    and conversation_id = new.conversation_id;

  if message_sent_at is null
    or new.last_read_at is distinct from message_sent_at
  then
    raise exception using
      errcode = '23514',
      message = 'read marker must use the exact message timestamp and ID boundary';
  end if;

  return new;
end;
$$;

create or replace function private.guard_design_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'open' then
      new.submitted_at := coalesce(new.submitted_at, now());
    end if;
    return new;
  end if;

  if old.status <> 'draft' and (
    new.id is distinct from old.id
    or new.customer_id is distinct from old.customer_id
    or new.reference_code is distinct from old.reference_code
    or new.title is distinct from old.title
    or new.request_type is distinct from old.request_type
    or new.occasion is distinct from old.occasion
    or new.desired_by is distinct from old.desired_by
    or new.budget_min_minor is distinct from old.budget_min_minor
    or new.budget_max_minor is distinct from old.budget_max_minor
    or new.currency is distinct from old.currency
    or new.description is distinct from old.description
    or new.metal_preferences is distinct from old.metal_preferences
    or new.stone_preferences is distinct from old.stone_preferences
    or new.ring_size is distinct from old.ring_size
    or new.inspiration_notes is distinct from old.inspiration_notes
    or new.submitted_at is distinct from old.submitted_at
    or new.created_at is distinct from old.created_at
  ) then
    raise exception using errcode = '55000', message = 'open design request payloads are immutable';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'draft' and new.status in ('open', 'closed'))
    or (old.status = 'open' and new.status in ('quoted', 'declined', 'closed'))
    or (old.status = 'quoted' and new.status in ('negotiating', 'accepted', 'declined', 'closed'))
    or (old.status = 'negotiating' and new.status in ('quoted', 'accepted', 'declined', 'closed'))
  ) then
    raise exception using errcode = '22023', message = 'invalid design request status transition';
  end if;

  if old.status = 'draft' and new.status = 'open' then
    new.submitted_at := coalesce(new.submitted_at, now());
  end if;
  if new.status is distinct from old.status then
    new.lock_version := old.lock_version + 1;
  end if;

  return new;
end;
$$;

create or replace function private.guard_message_attachment_binding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '55000',
      message = 'message attachment records cannot be deleted';
  end if;

  if old.message_id is not null
    or old.finalized_at is not null
    or new.message_id is null
    or new.finalized_at is null
    or new.id is distinct from old.id
    or new.owner_id is distinct from old.owner_id
    or new.client_attachment_id is distinct from old.client_attachment_id
    or new.bucket_id is distinct from old.bucket_id
    or new.object_path is distinct from old.object_path
    or new.file_name is distinct from old.file_name
    or new.mime_type is distinct from old.mime_type
    or new.byte_size is distinct from old.byte_size
    or new.sha256_hex is distinct from old.sha256_hex
    or new.verified_at is distinct from old.verified_at
    or new.created_at is distinct from old.created_at
  then
    raise exception using
      errcode = '55000',
      message = 'message attachment may only be finalized once';
  end if;

  return new;
end;
$$;

create or replace function private.require_message_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(btrim(new.body)) = 0
    and not exists (
      select 1
      from public.message_attachments
      where message_id = new.id
    )
  then
    raise exception using
      errcode = '23514',
      message = 'a message must contain text or an attachment';
  end if;
  return new;
end;
$$;

create or replace function private.validate_design_request_attachment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_customer uuid;
  request_status public.design_request_status;
begin
  select customer_id, status
  into request_customer, request_status
  from public.design_requests
  where id = new.design_request_id
  for update;

  if request_customer is distinct from new.owner_id
    or request_status <> 'draft'
  then
    raise exception using
      errcode = '23514',
      message = 'design request attachments must be uploaded by the owner while drafting';
  end if;

  if (
    select count(*)
    from public.design_request_attachments
    where design_request_id = new.design_request_id
  ) >= 10 then
    raise exception using
      errcode = '23514',
      message = 'a design request may contain at most ten attachments';
  end if;

  return new;
end;
$$;

create or replace function private.notify_message_recipient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sender_kind = 'customer' then
    insert into public.notifications (
      recipient_id,
      event,
      title,
      body,
      resource_type,
      resource_id,
      dedupe_key
    )
    select
      users.id,
      'message_received',
      'New customer message',
      'A customer sent a new commission message.',
      'message',
      new.id,
      'message-received:' || new.id::text
    from auth.users as users
    inner join public.admin_allowlist as allowlist
      on allowlist.email = users.email::extensions.citext
    where users.email_confirmed_at is not null
      and users.deleted_at is null
      and exists (
        select 1
        from auth.identities as identities
        where identities.user_id = users.id
          and identities.provider = 'google'
      )
      and allowlist.is_active
      and (allowlist.expires_at is null or allowlist.expires_at > now())
    on conflict (recipient_id, dedupe_key) do nothing;
  else
    insert into public.notifications (
      recipient_id,
      event,
      title,
      body,
      resource_type,
      resource_id,
      dedupe_key
    )
    select
      conversations.customer_id,
      'message_received',
      'New atelier message',
      'Veyra Atelier sent you a new message.',
      'message',
      new.id,
      'message-received:' || new.id::text
    from public.conversations
    where conversations.id = new.conversation_id
    on conflict (recipient_id, dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

create or replace function private.notify_design_request_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'open'
    and (tg_op = 'INSERT' or old.status = 'draft')
  then
    insert into public.notifications (
      recipient_id,
      event,
      title,
      body,
      resource_type,
      resource_id,
      dedupe_key
    )
    select
      users.id,
      'design_request_submitted',
      'New design request',
      'A customer submitted a new jewelry design request.',
      'design_request',
      new.id,
      'design-request-submitted:' || new.id::text
    from auth.users as users
    inner join public.admin_allowlist as allowlist
      on allowlist.email = users.email::extensions.citext
    where users.email_confirmed_at is not null
      and users.deleted_at is null
      and exists (
        select 1
        from auth.identities as identities
        where identities.user_id = users.id
          and identities.provider = 'google'
      )
      and allowlist.is_active
      and (allowlist.expires_at is null or allowlist.expires_at > now())
    on conflict (recipient_id, dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

create or replace function private.notify_deliverable_release()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'preparing' and new.status = 'released' then
    insert into public.notifications (
      recipient_id,
      event,
      title,
      body,
      resource_type,
      resource_id,
      dedupe_key
    )
    values (
      new.customer_id,
      'deliverable_ready',
      'A deliverable is ready',
      'A new commission deliverable is ready for secure access.',
      'deliverable',
      new.id,
      'deliverable-ready:' || new.id::text
    )
    on conflict (recipient_id, dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

create or replace function private.effective_quote_status(
  p_quote_version_id uuid,
  p_at timestamptz default now()
)
returns public.quote_status
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1
      from public.quote_acceptances
      where quote_version_id = quotes.id
    ) then 'accepted'::public.quote_status
    when exists (
      select 1
      from public.quote_versions as later_quotes
      where later_quotes.design_request_id = quotes.design_request_id
        and later_quotes.version_number > quotes.version_number
        and exists (
          select 1
          from public.quote_status_events
          where quote_version_id = later_quotes.id
            and status = 'sent'
        )
    ) then 'superseded'::public.quote_status
    when latest.status in ('declined', 'cancelled') then latest.status
    when sent.sent_at is null then 'draft'::public.quote_status
    when quotes.valid_until <= p_at then 'expired'::public.quote_status
    else coalesce(latest.status, 'sent'::public.quote_status)
  end
  from public.quote_versions as quotes
  left join lateral (
    select status
    from public.quote_status_events
    where quote_version_id = quotes.id
    order by occurred_at desc, id desc
    limit 1
  ) as latest on true
  left join lateral (
    select min(occurred_at) as sent_at
    from public.quote_status_events
    where quote_version_id = quotes.id
      and status = 'sent'
  ) as sent on true
  where quotes.id = p_quote_version_id;
$$;

create or replace function private.validate_quote_counteroffer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  quote_currency text;
  quote_request uuid;
  request_customer uuid;
  current_request_status public.design_request_status;
  quote_current_status public.quote_status;
  quote_expiry timestamptz;
begin
  select q.currency, q.design_request_id, q.valid_until
  into quote_currency, quote_request, quote_expiry
  from public.quote_versions as q
  where q.id = new.quote_version_id;

  quote_current_status := private.effective_quote_status(new.quote_version_id, now());

  select customer_id, status
  into request_customer, current_request_status
  from public.design_requests
  where id = quote_request
  for update;

  if quote_current_status not in ('sent', 'viewed', 'countered')
    or quote_expiry <= now()
    or request_customer is distinct from new.customer_id
    or new.status <> 'pending'
    or current_request_status not in ('open', 'quoted', 'negotiating')
    or quote_currency is distinct from new.currency
    or exists (
      select 1
      from public.quote_versions as later_quotes
      where later_quotes.design_request_id = quote_request
        and later_quotes.version_number > (
          select version_number
          from public.quote_versions
          where id = new.quote_version_id
        )
        and exists (
          select 1
          from public.quote_status_events
          where quote_version_id = later_quotes.id
            and status = 'sent'
        )
    )
    or exists (
      select 1
      from public.quote_acceptances
      where design_request_id = quote_request
    )
  then
    raise exception using
      errcode = '23514',
      message = 'counteroffer must target the customer''s active sent quote in the same currency';
  end if;

  return new;
end;
$$;

create or replace function private.guard_quote_version()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  has_lifecycle_event boolean;
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  select exists (
    select 1
    from public.quote_status_events
    where quote_version_id = old.id
  )
  into has_lifecycle_event;

  if tg_op = 'DELETE' then
    if has_lifecycle_event then
      raise exception using errcode = '55000', message = 'published or cancelled quote versions are immutable';
    end if;
    return old;
  end if;

  if has_lifecycle_event then
    raise exception using errcode = '55000', message = 'sent quote payloads are immutable';
  end if;

  return new;
end;
$$;

create or replace function private.guard_quote_status_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  quote_record public.quote_versions%rowtype;
  request_record public.design_requests%rowtype;
  current_status public.quote_status;
begin
  select *
  into quote_record
  from public.quote_versions
  where id = new.quote_version_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'quote version does not exist';
  end if;

  select *
  into request_record
  from public.design_requests
  where id = quote_record.design_request_id
  for update;

  current_status := private.effective_quote_status(new.quote_version_id, new.occurred_at);

  if new.occurred_at < quote_record.created_at then
    raise exception using errcode = '23514', message = 'quote event cannot predate the quote';
  end if;

  if new.status = 'sent' then
    if current_status <> 'draft'
      or quote_record.valid_until is null
      or quote_record.valid_until <= new.occurred_at
      or request_record.status not in ('open', 'quoted', 'negotiating')
      or not exists (
        select 1
        from public.quote_options
        where quote_version_id = quote_record.id
      )
    then
      raise exception using errcode = '55000', message = 'quote cannot be sent';
    end if;
  elsif new.status = 'viewed' and current_status <> 'sent' then
    raise exception using errcode = '22023', message = 'only a sent quote can be viewed';
  elsif new.status = 'countered' and current_status not in ('sent', 'viewed') then
    raise exception using errcode = '22023', message = 'quote cannot be countered in its current state';
  elsif new.status = 'declined' and current_status not in ('sent', 'viewed', 'countered') then
    raise exception using errcode = '22023', message = 'quote cannot be declined in its current state';
  elsif new.status = 'cancelled' and current_status not in ('draft', 'sent', 'viewed', 'countered') then
    raise exception using errcode = '22023', message = 'quote cannot be cancelled in its current state';
  end if;

  if new.status in ('sent', 'cancelled') then
    if new.actor <> 'admin'
      or new.changed_by is null
      or (
        current_user <> 'postgres'
        and auth.role() <> 'service_role'
        and not public.is_active_admin()
      )
    then
      raise exception using errcode = '42501', message = 'admin quote event required';
    end if;
  elsif new.status = 'viewed' then
    if new.actor <> 'system' then
      raise exception using errcode = '42501', message = 'system quote event required';
    end if;
  elsif new.status in ('countered', 'declined') then
    if new.actor <> 'customer'
      or new.changed_by is distinct from request_record.customer_id
    then
      raise exception using errcode = '42501', message = 'customer quote event required';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.apply_quote_status_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  quote_record public.quote_versions%rowtype;
begin
  select *
  into quote_record
  from public.quote_versions
  where id = new.quote_version_id;

  if new.status = 'sent' then
    update public.quote_counteroffers
    set status = 'superseded'
    where quote_version_id in (
      select older_quotes.id
      from public.quote_versions as older_quotes
      where older_quotes.design_request_id = quote_record.design_request_id
        and older_quotes.version_number < quote_record.version_number
    )
      and status = 'pending';

    update public.design_requests
    set status = 'quoted',
        lock_version = lock_version + 1
    where id = quote_record.design_request_id
      and status in ('open', 'negotiating');

    insert into public.notifications (
      recipient_id,
      event,
      title,
      body,
      resource_type,
      resource_id,
      dedupe_key
    )
    select
      requests.customer_id,
      'quote_sent',
      'A new quote is ready',
      'Your Veyra Atelier quote is ready to review.',
      'quote',
      quote_record.id,
      'quote-sent:' || quote_record.id::text
    from public.design_requests as requests
    where requests.id = quote_record.design_request_id
    on conflict (recipient_id, dedupe_key) do nothing;
  elsif new.status = 'countered' then
    update public.design_requests
    set status = 'negotiating',
        lock_version = lock_version + 1
    where id = quote_record.design_request_id
      and status = 'quoted';
  elsif new.status = 'cancelled'
    and exists (
      select 1
      from public.quote_status_events
      where quote_version_id = quote_record.id
        and status = 'sent'
    )
  then
    update public.design_requests
    set status = 'closed',
        lock_version = lock_version + 1
    where id = quote_record.design_request_id
      and status in ('quoted', 'negotiating')
      and not exists (
        select 1
        from public.quote_versions as later_quotes
        where later_quotes.design_request_id = quote_record.design_request_id
          and later_quotes.version_number > quote_record.version_number
          and exists (
            select 1
            from public.quote_status_events
            where quote_version_id = later_quotes.id
              and status = 'sent'
          )
      );
  end if;
  return new;
end;
$$;

create or replace function private.guard_quote_option()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_id uuid := case when tg_op = 'DELETE' then old.quote_version_id else new.quote_version_id end;
  parent_currency text;
  line_item jsonb;
  line_item_total numeric := 0;
begin
  select currency
  into parent_currency
  from public.quote_versions
  where id = parent_id;

  if exists (
    select 1
    from public.quote_status_events
    where quote_version_id = parent_id
  ) then
    raise exception using errcode = '55000', message = 'options on sent quote versions are immutable';
  end if;

  if tg_op <> 'DELETE' then
    if new.currency is distinct from parent_currency then
      raise exception using errcode = '23514', message = 'quote option currency must match its quote';
    end if;
    if jsonb_typeof(new.line_items) <> 'array' then
      raise exception using errcode = '23514', message = 'quote line items must be a JSON array';
    end if;
    if jsonb_array_length(new.line_items) > 50 then
      raise exception using errcode = '23514', message = 'quote line items must be an array of at most 50 items';
    end if;

    for line_item in
      select value from jsonb_array_elements(new.line_items)
    loop
      if jsonb_typeof(line_item) <> 'object'
        or coalesce(char_length(btrim(line_item ->> 'description')) between 1 and 120, false) is not true
        or jsonb_typeof(line_item -> 'amount') <> 'object'
        or jsonb_typeof(line_item -> 'amount' -> 'amountMinor') <> 'number'
        or (line_item -> 'amount' ->> 'amountMinor') !~ '^(0|[1-9][0-9]*)$'
        or line_item -> 'amount' ->> 'currency' is distinct from new.currency
      then
        raise exception using errcode = '23514', message = 'quote line item is invalid';
      end if;

      line_item_total := line_item_total + (line_item -> 'amount' ->> 'amountMinor')::numeric;
      if line_item_total > 99999999 then
        raise exception using errcode = '22003', message = 'quote line item total exceeds Checkout limit';
      end if;
    end loop;

    if jsonb_array_length(new.line_items) > 0
      and line_item_total is distinct from new.total_minor::numeric
    then
      raise exception using errcode = '23514', message = 'quote line items must total the option price';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.validate_quote_acceptance_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  quote_record public.quote_versions%rowtype;
  option_record public.quote_options%rowtype;
  counteroffer_record public.quote_counteroffers%rowtype;
  request_customer uuid;
  effective_status public.quote_status;
begin
  select quotes.*
  into quote_record
  from public.quote_versions as quotes
  where quotes.id = new.quote_version_id;

  effective_status := private.effective_quote_status(new.quote_version_id, new.accepted_at);

  select customer_id
  into request_customer
  from public.design_requests
  where id = new.design_request_id;

  if quote_record.id is null
    or quote_record.design_request_id is distinct from new.design_request_id
    or effective_status not in ('sent', 'viewed', 'countered')
    or quote_record.valid_until <= new.accepted_at
    or request_customer is distinct from new.customer_id
    or quote_record.version_number is distinct from new.accepted_quote_version
    or quote_record.title is distinct from new.accepted_title
    or quote_record.currency is distinct from new.accepted_currency
    or quote_record.terms is distinct from new.accepted_terms
    or quote_record.production_weeks is distinct from new.accepted_production_weeks
  then
    raise exception using
      errcode = '23514',
      message = 'quote acceptance snapshot does not match the active quote';
  end if;

  if new.selected_quote_option_id is not null then
    select options.*
    into option_record
    from public.quote_options as options
    where options.id = new.selected_quote_option_id
      and options.quote_version_id = new.quote_version_id;

    if option_record.id is null
      or option_record.total_minor is distinct from new.accepted_total_minor
      or option_record.deposit_minor is distinct from new.accepted_deposit_minor
      or option_record.scope_snapshot is distinct from new.accepted_scope
    then
      raise exception using
        errcode = '23514',
        message = 'quote acceptance snapshot does not match the selected option';
    end if;
  else
    select counteroffers.*
    into counteroffer_record
    from public.quote_counteroffers as counteroffers
    where counteroffers.id = new.selected_counteroffer_id
      and counteroffers.quote_version_id = new.quote_version_id
      and counteroffers.customer_id = new.customer_id;

    if counteroffer_record.id is null
      or counteroffer_record.proposed_total_minor is distinct from new.accepted_total_minor
      or counteroffer_record.proposed_deposit_minor is distinct from new.accepted_deposit_minor
      or counteroffer_record.proposed_scope is distinct from new.accepted_scope
      or not exists (
        select 1
        from public.quote_counteroffer_decisions
        where counteroffer_id = counteroffer_record.id
          and decision = 'accepted'
      )
    then
      raise exception using
        errcode = '23514',
        message = 'quote acceptance snapshot does not match an accepted counteroffer';
    end if;
  end if;

  if new.accepted_quote_snapshot is distinct from jsonb_build_object(
    'schemaVersion', 1,
    'quoteId', quote_record.id,
    'quoteVersion', quote_record.version_number,
    'designRequestId', quote_record.design_request_id,
    'acceptedAt', new.accepted_at,
    'terms', quote_record.terms,
    'option', new.accepted_option_snapshot
  ) then
    raise exception using
      errcode = '23514',
      message = 'accepted quote snapshot is not canonical';
  end if;

  return new;
end;
$$;

create or replace function private.validate_commission_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  acceptance_record public.quote_acceptances%rowtype;
begin
  select acceptances.*
  into acceptance_record
  from public.quote_acceptances as acceptances
  where acceptances.id = new.quote_acceptance_id;

  if acceptance_record.id is null
    or acceptance_record.design_request_id is distinct from new.design_request_id
    or acceptance_record.customer_id is distinct from new.customer_id
    or acceptance_record.accepted_quote_version is distinct from new.accepted_quote_version
    or acceptance_record.accepted_title is distinct from new.accepted_title
    or acceptance_record.accepted_currency is distinct from new.accepted_currency
    or acceptance_record.accepted_total_minor is distinct from new.accepted_total_minor
    or acceptance_record.accepted_deposit_minor is distinct from new.accepted_deposit_minor
    or acceptance_record.accepted_scope is distinct from new.accepted_scope
    or acceptance_record.accepted_terms is distinct from new.accepted_terms
    or acceptance_record.accepted_production_weeks is distinct from new.accepted_production_weeks
    or acceptance_record.accepted_option_snapshot is distinct from new.accepted_option_snapshot
    or acceptance_record.accepted_counteroffer_snapshot is distinct from new.accepted_counteroffer_snapshot
    or acceptance_record.accepted_quote_snapshot is distinct from new.accepted_quote_snapshot
    or acceptance_record.accepted_at is distinct from new.accepted_at
  then
    raise exception using
      errcode = '23514',
      message = 'commission snapshot must exactly match its quote acceptance';
  end if;

  return new;
end;
$$;

create or replace function private.guard_commission_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'commissions cannot be deleted';
  end if;

  if new.id is distinct from old.id
    or new.reference_code is distinct from old.reference_code
    or new.quote_acceptance_id is distinct from old.quote_acceptance_id
    or new.design_request_id is distinct from old.design_request_id
    or new.customer_id is distinct from old.customer_id
    or new.accepted_quote_version is distinct from old.accepted_quote_version
    or new.accepted_title is distinct from old.accepted_title
    or new.accepted_currency is distinct from old.accepted_currency
    or new.accepted_total_minor is distinct from old.accepted_total_minor
    or new.accepted_deposit_minor is distinct from old.accepted_deposit_minor
    or new.accepted_scope is distinct from old.accepted_scope
    or new.accepted_terms is distinct from old.accepted_terms
    or new.accepted_production_weeks is distinct from old.accepted_production_weeks
    or new.accepted_option_snapshot is distinct from old.accepted_option_snapshot
    or new.accepted_counteroffer_snapshot is distinct from old.accepted_counteroffer_snapshot
    or new.accepted_quote_snapshot is distinct from old.accepted_quote_snapshot
    or new.accepted_at is distinct from old.accepted_at
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '55000', message = 'accepted commission snapshot fields are immutable';
  end if;

  return new;
end;
$$;

create or replace function private.guard_counteroffer_payload()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'counteroffers cannot be deleted';
  end if;

  if new.id is distinct from old.id
    or new.quote_version_id is distinct from old.quote_version_id
    or new.quote_option_id is distinct from old.quote_option_id
    or new.customer_id is distinct from old.customer_id
    or new.version_number is distinct from old.version_number
    or new.currency is distinct from old.currency
    or new.proposed_total_minor is distinct from old.proposed_total_minor
    or new.proposed_deposit_minor is distinct from old.proposed_deposit_minor
    or new.proposed_scope is distinct from old.proposed_scope
    or new.customer_note is distinct from old.customer_note
    or new.submitted_at is distinct from old.submitted_at
  then
    raise exception using errcode = '55000', message = 'counteroffer payloads are immutable';
  end if;

  if old.status <> 'pending' or new.status not in (
    'pending',
    'accepted',
    'declined',
    'withdrawn',
    'superseded'
  ) then
    raise exception using errcode = '22023', message = 'invalid counteroffer lifecycle transition';
  end if;

  if new.status = 'withdrawn'
    and public.current_application_user_id() is distinct from old.customer_id
  then
    raise exception using errcode = '42501', message = 'customer counteroffer transition required';
  end if;
  if new.status in ('accepted', 'declined', 'superseded')
    and current_user <> 'postgres'
    and auth.role() <> 'service_role'
    and not public.is_active_admin()
  then
    raise exception using errcode = '42501', message = 'admin counteroffer transition required';
  end if;

  return new;
end;
$$;

create or replace function private.mark_counteroffer_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.quote_counteroffers
  set status = 'superseded'
  where quote_version_id = new.quote_version_id
    and customer_id = new.customer_id
    and id <> new.id
    and version_number < new.version_number
    and status = 'pending';

  if private.effective_quote_status(new.quote_version_id, new.submitted_at)
    in ('sent', 'viewed')
  then
    insert into public.quote_status_events (
      quote_version_id,
      status,
      actor,
      changed_by,
      idempotency_key,
      metadata
    )
    values (
      new.quote_version_id,
      'countered',
      'customer',
      new.customer_id,
      new.id,
      jsonb_build_object('counteroffer_id', new.id)
    );
  end if;

  insert into public.notifications (
    recipient_id,
    event,
    title,
    body,
    resource_type,
    resource_id,
    dedupe_key
  )
  select
    quotes.created_by,
    'counteroffer_received',
    'A counteroffer was received',
    'A customer submitted a counteroffer for review.',
    'counteroffer',
    new.id,
    'counteroffer-received:' || new.id::text
  from public.quote_versions as quotes
  where quotes.id = new.quote_version_id
  on conflict (recipient_id, dedupe_key) do nothing;

  return new;
end;
$$;

create or replace function private.apply_counteroffer_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  counteroffer_record public.quote_counteroffers%rowtype;
begin
  select *
  into counteroffer_record
  from public.quote_counteroffers
  where id = new.counteroffer_id
  for update;

  update public.quote_counteroffers
  set status = new.decision::text::public.counteroffer_status
  where id = new.counteroffer_id
    and status = 'pending';

  if not found then
    raise exception using
      errcode = '55000',
      message = 'counteroffer is no longer pending';
  end if;

  if new.decision = 'declined' then
    update public.design_requests
    set status = 'quoted'
    where id = (
      select design_request_id
      from public.quote_versions
      where id = counteroffer_record.quote_version_id
    )
      and status = 'negotiating';
  end if;

  return new;
end;
$$;

create or replace function private.guard_published_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.published_at is not null then
      raise exception using errcode = '55000', message = 'published draft revisions are immutable';
    end if;
    return old;
  end if;

  if old.published_at is not null and (
    new.id is distinct from old.id
    or new.design_draft_id is distinct from old.design_draft_id
    or new.revision_number is distinct from old.revision_number
    or new.summary is distinct from old.summary
    or new.specifications is distinct from old.specifications
    or new.customer_message is distinct from old.customer_message
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.published_at is distinct from old.published_at
  ) then
    raise exception using errcode = '55000', message = 'published draft revision payloads are immutable';
  end if;

  if old.status = 'working' and new.status = 'shared' then
    new.published_at := coalesce(new.published_at, now());
  elsif old.status = 'shared' and new.status in ('approved', 'superseded') then
    null;
  elsif new.status is distinct from old.status then
    raise exception using errcode = '22023', message = 'invalid draft revision status transition';
  end if;

  return new;
end;
$$;

create or replace function private.guard_revision_asset()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_revision_id uuid := case
    when tg_op = 'DELETE' then old.draft_revision_id
    else new.draft_revision_id
  end;
  parent_published_at timestamptz;
  owning_customer_id uuid;
begin
  select revisions.published_at, commissions.customer_id
  into parent_published_at, owning_customer_id
  from public.draft_revisions as revisions
  inner join public.design_drafts as drafts
    on drafts.id = revisions.design_draft_id
  inner join public.commissions
    on commissions.id = drafts.commission_id
  where revisions.id = parent_revision_id;

  if parent_published_at is not null then
    raise exception using
      errcode = '55000',
      message = 'assets on published draft revisions are immutable';
  end if;
  if tg_op <> 'DELETE'
    and (new.object_path like owning_customer_id::text || '/%') is not true
  then
    raise exception using
      errcode = '23514',
      message = 'draft asset path must be namespaced to the commission customer';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.guard_released_deliverable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.released_at is not null then
      raise exception using errcode = '55000', message = 'released deliverables cannot be deleted';
    end if;
    return old;
  end if;

  if old.status = 'revoked' then
    raise exception using errcode = '55000', message = 'revoked deliverables are immutable';
  end if;
  if old.status = 'released' and new.status not in ('released', 'revoked') then
    raise exception using
      errcode = '55000',
      message = 'released deliverables may only be revoked';
  end if;

  if old.released_at is not null and (
    new.id is distinct from old.id
    or new.commission_id is distinct from old.commission_id
    or new.customer_id is distinct from old.customer_id
    or new.kind is distinct from old.kind
    or new.version_number is distinct from old.version_number
    or new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.file_name is distinct from old.file_name
    or new.mime_type is distinct from old.mime_type
    or new.byte_size is distinct from old.byte_size
    or new.sha256_hex is distinct from old.sha256_hex
    or new.released_at is distinct from old.released_at
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  ) then
    raise exception using errcode = '55000', message = 'released deliverable metadata is immutable';
  end if;

  return new;
end;
$$;

create or replace function private.guard_completed_aftercare_case()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'completed' then
    raise exception using
      errcode = '55000',
      message = 'completed aftercare cases are immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.validate_payment_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  commission_customer uuid;
  commission_currency text;
begin
  select customer_id, accepted_currency
  into commission_customer, commission_currency
  from public.commissions
  where id = new.commission_id;

  if commission_customer is distinct from new.customer_id
    or commission_currency is distinct from new.currency
  then
    raise exception using
      errcode = '23514',
      message = 'payment customer and currency must match the commission';
  end if;
  return new;
end;
$$;

create or replace function private.validate_deliverable_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  commission_customer uuid;
begin
  select customer_id
  into commission_customer
  from public.commissions
  where id = new.commission_id;

  if commission_customer is distinct from new.customer_id then
    raise exception using
      errcode = '23514',
      message = 'deliverable customer must match the commission';
  end if;
  return new;
end;
$$;

create or replace function private.validate_aftercare_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  commission_customer uuid;
  commission_current_status public.commission_status;
begin
  select customer_id, status
  into commission_customer, commission_current_status
  from public.commissions
  where id = new.commission_id;

  if commission_customer is distinct from new.customer_id
    or new.opened_by is distinct from new.customer_id
    or commission_current_status not in ('delivered', 'aftercare', 'completed')
  then
    raise exception using
      errcode = '23514',
      message = 'aftercare can only be opened by the customer for a delivered commission';
  end if;
  return new;
end;
$$;

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_json jsonb;
  new_json jsonb;
  target_id uuid;
  current_actor uuid := auth.uid();
  current_email text;
  request_id_value text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    old_json := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    new_json := to_jsonb(new);
  end if;

  if tg_table_schema = 'public' and tg_table_name = 'admin_allowlist' then
    if old_json ? 'email' then
      old_json := (old_json - 'email') || jsonb_build_object(
        'email_sha256',
        pg_catalog.encode(
          extensions.digest(
            pg_catalog.convert_to(lower(old_json ->> 'email'), 'UTF8'),
            'sha256'
          ),
          'hex'
        )
      );
    end if;
    if new_json ? 'email' then
      new_json := (new_json - 'email') || jsonb_build_object(
        'email_sha256',
        pg_catalog.encode(
          extensions.digest(
            pg_catalog.convert_to(lower(new_json ->> 'email'), 'UTF8'),
            'sha256'
          ),
          'hex'
        )
      );
    end if;
  end if;

  target_id := coalesce(
    nullif(new_json ->> 'id', '')::uuid,
    nullif(old_json ->> 'id', '')::uuid
  );

  if current_actor is not null then
    select email into current_email from auth.users where id = current_actor;
  end if;

  begin
    request_id_value := (
      nullif(current_setting('request.headers', true), '')::jsonb
      ->> 'x-request-id'
    );
  exception
    when invalid_text_representation then
      request_id_value := null;
  end;

  insert into private.audit_logs (
    actor_id,
    actor_email,
    action,
    schema_name,
    table_name,
    record_id,
    old_record,
    new_record,
    request_id
  )
  values (
    current_actor,
    current_email,
    tg_op,
    tg_table_schema,
    tg_table_name,
    target_id,
    old_json,
    new_json,
    request_id_value
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  )
  on conflict (id) do nothing;

  insert into public.notification_preferences (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;

  return new;
end;
$$;

insert into public.profiles (id, display_name)
select
  users.id,
  nullif(btrim(coalesce(users.raw_user_meta_data ->> 'display_name', '')), '')
from auth.users as users
on conflict (id) do nothing;

insert into public.notification_preferences (profile_id)
select id
from public.profiles
on conflict (profile_id) do nothing;

create trigger auth_user_profile_created
after insert on auth.users
for each row execute function public.handle_new_user();

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function private.touch_updated_at();
create trigger notification_preferences_touch_updated_at
before update on public.notification_preferences
for each row execute function private.touch_updated_at();
create trigger site_content_touch_updated_at
before update on public.site_content
for each row execute function private.touch_updated_at();
create trigger site_settings_touch_updated_at
before update on public.site_settings
for each row execute function private.touch_updated_at();
create trigger portfolio_projects_touch_updated_at
before update on public.portfolio_projects
for each row execute function private.touch_updated_at();
create trigger design_requests_touch_updated_at
before update on public.design_requests
for each row execute function private.touch_updated_at();
create trigger design_requests_guard
before insert or update on public.design_requests
for each row execute function private.guard_design_request();
create trigger conversations_touch_updated_at
before update on public.conversations
for each row execute function private.touch_updated_at();
create trigger commissions_touch_updated_at
before update on public.commissions
for each row execute function private.touch_updated_at();
create trigger design_drafts_touch_updated_at
before update on public.design_drafts
for each row execute function private.touch_updated_at();
create trigger payments_touch_updated_at
before update on public.payments
for each row execute function private.touch_updated_at();
create trigger deliverables_touch_updated_at
before update on public.deliverables
for each row execute function private.touch_updated_at();
create trigger aftercare_cases_touch_updated_at
before update on public.aftercare_cases
for each row execute function private.touch_updated_at();
create trigger admin_notes_touch_updated_at
before update on public.admin_notes
for each row execute function private.touch_updated_at();

create trigger conversations_validate_owner
before insert or update of design_request_id, customer_id on public.conversations
for each row execute function private.validate_conversation_owner();
create trigger conversation_read_markers_validate_boundary
before insert or update on public.conversation_read_markers
for each row execute function private.validate_read_marker_boundary();
create trigger messages_notify_recipient
after insert on public.messages
for each row execute function private.notify_message_recipient();
create constraint trigger messages_require_content
after insert on public.messages
deferrable initially deferred
for each row execute function private.require_message_content();
create trigger design_request_attachments_validate
before insert on public.design_request_attachments
for each row execute function private.validate_design_request_attachment();
create trigger design_requests_notify_submission
after insert or update of status on public.design_requests
for each row execute function private.notify_design_request_submission();
create trigger quote_counteroffers_validate
before insert on public.quote_counteroffers
for each row execute function private.validate_quote_counteroffer();
create trigger quote_counteroffers_mark_activity
after insert on public.quote_counteroffers
for each row execute function private.mark_counteroffer_activity();
create trigger quote_counteroffer_decisions_apply
after insert on public.quote_counteroffer_decisions
for each row execute function private.apply_counteroffer_decision();
create trigger quote_acceptances_validate_snapshot
before insert on public.quote_acceptances
for each row execute function private.validate_quote_acceptance_snapshot();
create trigger quote_versions_guard
before insert or update or delete on public.quote_versions
for each row execute function private.guard_quote_version();
create trigger quote_status_events_guard
before insert on public.quote_status_events
for each row execute function private.guard_quote_status_event();
create trigger quote_status_events_apply
after insert on public.quote_status_events
for each row execute function private.apply_quote_status_event();
create trigger quote_options_guard
before insert or update or delete on public.quote_options
for each row execute function private.guard_quote_option();
create trigger commissions_snapshot_guard
before update or delete on public.commissions
for each row execute function private.guard_commission_snapshot();
create trigger commissions_validate_snapshot
before insert on public.commissions
for each row execute function private.validate_commission_snapshot();
create trigger draft_revisions_guard
before update or delete on public.draft_revisions
for each row execute function private.guard_published_revision();
create trigger draft_revision_assets_guard
before insert or update or delete on public.draft_revision_assets
for each row execute function private.guard_revision_asset();
create trigger deliverables_release_guard
before update or delete on public.deliverables
for each row execute function private.guard_released_deliverable();
create trigger deliverables_notify_release
after update of status on public.deliverables
for each row execute function private.notify_deliverable_release();
create trigger payments_validate_owner
before insert or update of commission_id, customer_id, currency on public.payments
for each row execute function private.validate_payment_owner();
create trigger deliverables_validate_owner
before insert or update of commission_id, customer_id on public.deliverables
for each row execute function private.validate_deliverable_owner();
create trigger aftercare_cases_validate_owner
before insert or update of commission_id, customer_id, opened_by on public.aftercare_cases
for each row execute function private.validate_aftercare_owner();
create trigger aftercare_cases_completed_guard
before update or delete on public.aftercare_cases
for each row execute function private.guard_completed_aftercare_case();

create trigger messages_immutable
before update or delete on public.messages
for each row execute function private.prevent_mutation('messages are immutable');
create trigger message_attachments_immutable
before update or delete on public.message_attachments
for each row execute function private.guard_message_attachment_binding();
create trigger quote_counteroffers_immutable
before update or delete on public.quote_counteroffers
for each row execute function private.guard_counteroffer_payload();
create trigger quote_counteroffer_decisions_immutable
before update or delete on public.quote_counteroffer_decisions
for each row execute function private.prevent_mutation('counteroffer decisions are immutable');
create trigger quote_status_events_immutable
before update or delete on public.quote_status_events
for each row execute function private.prevent_mutation('quote status events are immutable');
create trigger quote_acceptances_immutable
before update or delete on public.quote_acceptances
for each row execute function private.prevent_mutation('quote acceptances are immutable');
create trigger commission_status_history_immutable
before update or delete on public.commission_status_history
for each row execute function private.prevent_mutation('commission status history is immutable');
create trigger draft_feedback_immutable
before update or delete on public.draft_feedback
for each row execute function private.prevent_mutation('draft feedback is immutable');
create trigger payment_status_history_immutable
before update or delete on public.payment_status_history
for each row execute function private.prevent_mutation('payment status history is immutable');
create trigger aftercare_completions_immutable
before update or delete on public.aftercare_completions
for each row execute function private.prevent_mutation('aftercare completions are immutable');
create trigger payment_webhook_events_immutable
before update or delete on private.payment_webhook_events
for each row execute function private.prevent_mutation('payment webhook events are immutable');
create trigger stripe_event_receipts_immutable
before update or delete on private.stripe_event_receipts
for each row execute function private.prevent_mutation('Stripe event receipts are immutable');
create trigger payment_checkout_requests_immutable
before update or delete on private.payment_checkout_requests
for each row execute function private.prevent_mutation('payment Checkout request bindings are immutable');
create trigger stripe_refund_events_immutable
before update or delete on private.stripe_refund_events
for each row execute function private.prevent_mutation('Stripe refund events are immutable');
create trigger stripe_charge_refund_events_immutable
before update or delete on private.stripe_charge_refund_events
for each row execute function private.prevent_mutation('Stripe charge refund events are immutable');
create trigger stripe_checkout_events_immutable
before update or delete on private.stripe_checkout_events
for each row execute function private.prevent_mutation('Stripe checkout events are immutable');
create trigger stripe_dispute_events_immutable
before update or delete on private.stripe_dispute_events
for each row execute function private.prevent_mutation('Stripe dispute events are immutable');
create trigger deliverable_access_logs_immutable
before update or delete on private.deliverable_access_logs
for each row execute function private.prevent_mutation('deliverable access logs are immutable');
create trigger deliverable_write_requests_immutable
before update or delete on private.deliverable_write_requests
for each row execute function private.prevent_mutation('deliverable write requests are immutable');
create trigger audit_logs_immutable
before update or delete on private.audit_logs
for each row execute function private.prevent_mutation('audit logs are immutable');

create trigger admin_allowlist_audit
after insert or update or delete on public.admin_allowlist
for each row execute function private.audit_row_change();
create trigger site_settings_audit
after insert or update or delete on public.site_settings
for each row execute function private.audit_row_change();
create trigger quote_versions_audit
after insert or update or delete on public.quote_versions
for each row execute function private.audit_row_change();
create trigger quote_options_audit
after insert or update or delete on public.quote_options
for each row execute function private.audit_row_change();
create trigger quote_status_events_audit
after insert or update or delete on public.quote_status_events
for each row execute function private.audit_row_change();
create trigger quote_counteroffers_audit
after insert or update or delete on public.quote_counteroffers
for each row execute function private.audit_row_change();
create trigger quote_counteroffer_decisions_audit
after insert or update or delete on public.quote_counteroffer_decisions
for each row execute function private.audit_row_change();
create trigger quote_acceptances_audit
after insert or update or delete on public.quote_acceptances
for each row execute function private.audit_row_change();
create trigger commissions_audit
after insert or update or delete on public.commissions
for each row execute function private.audit_row_change();
create trigger commission_status_history_audit
after insert or update or delete on public.commission_status_history
for each row execute function private.audit_row_change();
create trigger design_drafts_audit
after insert or update or delete on public.design_drafts
for each row execute function private.audit_row_change();
create trigger draft_revisions_audit
after insert or update or delete on public.draft_revisions
for each row execute function private.audit_row_change();
create trigger draft_feedback_audit
after insert or update or delete on public.draft_feedback
for each row execute function private.audit_row_change();
create trigger payments_audit
after insert or update or delete on public.payments
for each row execute function private.audit_row_change();
create trigger payment_status_history_audit
after insert or update or delete on public.payment_status_history
for each row execute function private.audit_row_change();
create trigger deliverables_audit
after insert or update or delete on public.deliverables
for each row execute function private.audit_row_change();
create trigger aftercare_cases_audit
after insert or update or delete on public.aftercare_cases
for each row execute function private.audit_row_change();
create trigger aftercare_completions_audit
after insert or update or delete on public.aftercare_completions
for each row execute function private.audit_row_change();
create trigger admin_notes_audit
after insert or update or delete on public.admin_notes
for each row execute function private.audit_row_change();

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;
