-- Veyra Atelier data platform: authorization, transactional workflows, and API grants.

revoke create on schema public from public;
grant usage on schema public to anon, authenticated;

create or replace function public.current_application_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select users.id
  from auth.users as users
  where users.id = auth.uid()
    and users.email is not null
    and users.email_confirmed_at is not null
    and users.deleted_at is null
    and exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        coalesce(auth.jwt() -> 'amr', '[]'::jsonb)
      ) as authentication_method(value)
      where (
        pg_catalog.jsonb_typeof(authentication_method.value) = 'object'
        and authentication_method.value ->> 'method' = 'oauth'
      )
      or authentication_method.value = '"oauth"'::jsonb
    )
    and exists (
      select 1
      from auth.identities as identities
      where identities.user_id = users.id
        and identities.provider = 'google'
    )
  limit 1;
$$;

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as users
    inner join public.admin_allowlist as allowlist
      on allowlist.email = users.email::extensions.citext
    where users.id = public.current_application_user_id()
      and users.email is not null
      and allowlist.is_active
      and (allowlist.expires_at is null or allowlist.expires_at > now())
  );
$$;

create or replace function private.is_active_admin_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as users
    inner join public.admin_allowlist as allowlist
      on allowlist.email = users.email::extensions.citext
    where users.id = p_user_id
      and users.email is not null
      and users.email_confirmed_at is not null
      and users.deleted_at is null
      and exists (
        select 1
        from auth.identities as identities
        where identities.user_id = users.id
          and identities.provider = 'google'
      )
      and allowlist.is_active
      and (allowlist.expires_at is null or allowlist.expires_at > now())
  );
$$;

create or replace function public.sync_admin_allowlist(
  p_normalized_email text
)
returns table (
  target_user_id uuid,
  normalized_email text,
  changed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
  target_email text;
  changed_at timestamptz := now();
  affected_rows integer;
  active_rows integer;
  state_changed boolean := false;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_normalized_email is null
    or char_length(p_normalized_email) not between 3 and 320
    or p_normalized_email is distinct from lower(btrim(p_normalized_email))
    or p_normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception using
      errcode = '22023',
      message = 'normalized email is invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('admin-allowlist-sync', 0)
  );

  begin
    select users.id, lower(users.email::text)
    into strict target_id, target_email
    from auth.users as users
    inner join public.profiles as profiles
      on profiles.id = users.id
    where lower(users.email::text) = p_normalized_email
      and users.email_confirmed_at is not null
      and users.deleted_at is null
      and exists (
        select 1
        from auth.identities as identities
        where identities.user_id = users.id
          and identities.provider = 'google'
      )
    for update of users, profiles;
  exception
    when no_data_found or too_many_rows then
      raise exception using
        errcode = 'P0002',
        message = 'exactly one confirmed Google user with a profile is required';
  end;

  perform identities.id
  from auth.identities as identities
  where identities.user_id = target_id
    and identities.provider = 'google'
  for share;

  update public.admin_allowlist as allowlist
  set is_active = false,
      deactivated_at = changed_at
  where allowlist.is_active
    and allowlist.email <> target_email::extensions.citext;
  get diagnostics affected_rows = row_count;
  state_changed := affected_rows > 0;

  insert into public.admin_allowlist (
    email,
    is_active,
    reason,
    activated_at,
    deactivated_at,
    expires_at
  )
  values (
    target_email::extensions.citext,
    true,
    'Managed by verified Google admin synchronization',
    changed_at,
    null,
    null
  )
  on conflict (email) do update
  set is_active = true,
      activated_at = case
        when not admin_allowlist.is_active
          or admin_allowlist.activated_at is null
          then changed_at
        else admin_allowlist.activated_at
      end,
      deactivated_at = null,
      expires_at = null
  where not admin_allowlist.is_active
    or admin_allowlist.activated_at is null
    or admin_allowlist.deactivated_at is not null
    or admin_allowlist.expires_at is not null;
  get diagnostics affected_rows = row_count;
  state_changed := state_changed or affected_rows > 0;

  select count(*)::integer
  into active_rows
  from public.admin_allowlist as allowlist
  where allowlist.is_active;

  if active_rows <> 1
    or not exists (
      select 1
      from public.admin_allowlist as allowlist
      where allowlist.email = target_email::extensions.citext
        and allowlist.is_active
        and allowlist.activated_at is not null
        and allowlist.deactivated_at is null
        and allowlist.expires_at is null
    )
  then
    raise exception using
      errcode = '23514',
      message = 'admin allowlist synchronization did not produce exactly one active admin';
  end if;

  return query
  select target_id, target_email, state_changed;
end;
$$;

create or replace function public.get_public_site_settings()
returns table (
  intake_open boolean,
  quote_validity_days integer,
  brand_name text,
  contact_email text,
  contact_phone text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    settings.intake_open,
    settings.quote_validity_days,
    settings.brand_name,
    settings.contact_email::text,
    settings.contact_phone
  from public.site_settings as settings
  where settings.settings_key = 'public'
    and settings.status = 'published'
  limit 1;
$$;

create or replace function public.can_read_quote(p_quote_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.quote_versions
    inner join public.design_requests
      on design_requests.id = quote_versions.design_request_id
    where quote_versions.id = p_quote_version_id
      and (
        public.is_active_admin()
        or (
          public.current_application_user_id() is not null
          and design_requests.customer_id = public.current_application_user_id()
          and exists (
            select 1
            from public.quote_status_events
            where quote_status_events.quote_version_id = quote_versions.id
              and quote_status_events.status = 'sent'
          )
        )
      )
  );
$$;

create or replace function private.consume_rate_limit_internal(
  p_action public.rate_limit_action,
  p_subject text,
  p_cost integer default 1
)
returns table (
  is_allowed boolean,
  remaining_requests integer,
  resets_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule_max integer;
  rule_window integer;
  subject_digest text;
  bucket_start timestamptz;
  new_count integer;
begin
  if p_subject is null or char_length(p_subject) < 3 or char_length(p_subject) > 512 then
    raise exception using errcode = '22023', message = 'rate-limit subject is invalid';
  end if;
  if p_cost is null or p_cost < 1 or p_cost > 100 then
    raise exception using errcode = '22023', message = 'rate-limit cost must be between 1 and 100';
  end if;

  select rules.max_requests, rules.window_seconds
  into rule_max, rule_window
  from private.rate_limit_rules as rules
  where rules.action = p_action and rules.enabled;

  if not found then
    raise exception using errcode = '22023', message = 'rate-limit action is disabled or unknown';
  end if;

  subject_digest := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_subject, 'UTF8'), 'sha256'),
    'hex'
  );
  bucket_start := pg_catalog.to_timestamp(
    floor(extract(epoch from pg_catalog.clock_timestamp()) / rule_window) * rule_window
  );

  insert into private.rate_limit_buckets as buckets (
    action,
    subject_hash,
    window_started_at,
    request_count
  )
  values (p_action, subject_digest, bucket_start, p_cost)
  on conflict (action, subject_hash, window_started_at)
  do update
    set request_count = least(
          2147483647::bigint,
          buckets.request_count::bigint + excluded.request_count
        )::integer,
        updated_at = now()
  returning request_count into new_count;

  return query
  select
    new_count <= rule_max,
    greatest(rule_max - new_count, 0),
    bucket_start + pg_catalog.make_interval(secs => rule_window);
end;
$$;

create or replace function private.register_stripe_event_receipt(
  p_provider_event_id text,
  p_event_family text,
  p_event_type text,
  p_payload_sha256 text,
  p_provider_created_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_receipt private.stripe_event_receipts%rowtype;
begin
  if p_provider_event_id is null
    or char_length(p_provider_event_id) not between 1 and 255
    or p_event_family not in ('checkout', 'payment', 'refund', 'dispute')
    or p_event_type is null
    or char_length(p_event_type) not between 1 and 200
    or p_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_provider_created_at is null
  then
    raise exception using errcode = '22023', message = 'Stripe event receipt is invalid';
  end if;

  insert into private.stripe_event_receipts (
    provider_event_id,
    event_family,
    event_type,
    payload_sha256,
    provider_created_at
  )
  values (
    p_provider_event_id,
    p_event_family,
    p_event_type,
    p_payload_sha256,
    p_provider_created_at
  )
  on conflict (provider_event_id) do nothing;

  if found then
    return true;
  end if;

  select *
  into existing_receipt
  from private.stripe_event_receipts
  where provider_event_id = p_provider_event_id;

  if existing_receipt.event_family is distinct from p_event_family
    or existing_receipt.event_type is distinct from p_event_type
    or existing_receipt.payload_sha256 is distinct from p_payload_sha256
    or existing_receipt.provider_created_at is distinct from p_provider_created_at
  then
    raise exception using
      errcode = '22023',
      message = 'Stripe event ID was reused with different verified inputs';
  end if;

  return false;
end;
$$;

create or replace function private.payment_has_blocking_dispute(
  p_payment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with max_event_times as (
    select
      dispute_events.provider_dispute_id,
      max(dispute_events.provider_created_at) as provider_created_at
    from private.stripe_dispute_events as dispute_events
    where dispute_events.payment_id = p_payment_id
    group by dispute_events.provider_dispute_id
  ),
  effective_disputes as (
    select
      events.provider_dispute_id,
      count(distinct events.dispute_status) as status_count,
      bool_or(
        events.dispute_status not in ('won', 'warning_closed', 'prevented')
      ) as has_blocking_status
    from private.stripe_dispute_events as events
    inner join max_event_times
      on max_event_times.provider_dispute_id = events.provider_dispute_id
      and max_event_times.provider_created_at = events.provider_created_at
    where events.payment_id = p_payment_id
    group by events.provider_dispute_id
  )
  select exists (
    select 1
    from effective_disputes
    where status_count > 1
      or has_blocking_status
  );
$$;

create or replace function private.payment_has_blocking_refund(
  p_payment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with max_event_times as (
    select
      refund_events.provider_refund_id,
      max(refund_events.provider_created_at) as provider_created_at
    from private.stripe_refund_events as refund_events
    where refund_events.payment_id = p_payment_id
    group by refund_events.provider_refund_id
  ),
  effective_refunds as (
    select
      events.provider_refund_id,
      count(distinct events.refund_status) as status_count,
      bool_or(
        events.refund_status in ('pending', 'requires_action', 'succeeded')
      ) as has_blocking_status
    from private.stripe_refund_events as events
    inner join max_event_times
      on max_event_times.provider_refund_id = events.provider_refund_id
      and max_event_times.provider_created_at = events.provider_created_at
    where events.payment_id = p_payment_id
    group by events.provider_refund_id
  )
  select exists (
    select 1
    from effective_refunds
    where status_count > 1
      or has_blocking_status
  );
$$;

create or replace function private.derived_cumulative_refund(
  p_payment_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  with succeeded_individual_refunds as (
    select coalesce(sum(refunds.amount_minor), 0) as amount_minor
    from (
      select
        provider_refund_id,
        max(amount_minor) as amount_minor
      from private.stripe_refund_events
      where payment_id = p_payment_id
      group by provider_refund_id
      having bool_or(refund_status = 'succeeded')
    ) as refunds
  ),
  aggregate_charge_refunds as (
    select coalesce(max(cumulative_refunded_minor), 0) as amount_minor
    from private.stripe_charge_refund_events
    where payment_id = p_payment_id
  )
  select greatest(
    succeeded_individual_refunds.amount_minor,
    aggregate_charge_refunds.amount_minor
  )::bigint
  from succeeded_individual_refunds
  cross join aggregate_charge_refunds;
$$;

create or replace function private.payment_status_rank(
  p_status public.payment_status
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'not_started' then 0
    when 'pending' then 1
    when 'processing' then 2
    when 'failed' then 3
    when 'cancelled' then 3
    when 'succeeded' then 4
    when 'partially_refunded' then 5
    when 'refunded' then 6
  end;
$$;

create or replace function private.is_safe_stripe_payload(
  p_payload jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_payload is not null
    and jsonb_typeof(p_payload) = 'object'
    and not p_payload ?| array[
      'billing_details',
      'card',
      'charges',
      'client_secret',
      'customer',
      'payment_method',
      'receipt_email'
    ];
$$;

create or replace function public.commission_payment_is_clear(
  p_commission_id uuid,
  p_customer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.commissions
    inner join public.payments
      on payments.commission_id = commissions.id
    where commissions.id = p_commission_id
      and commissions.customer_id = p_customer_id
      and (
        p_customer_id = public.current_application_user_id()
        or public.is_active_admin()
      )
      and payments.customer_id = p_customer_id
      and payments.kind = 'final'
      and payments.status = 'succeeded'
      and payments.refunded_minor = 0
      and not private.payment_has_blocking_refund(payments.id)
      and not private.payment_has_blocking_dispute(payments.id)
  );
$$;

create or replace function public.consume_rate_limit(
  p_action public.rate_limit_action,
  p_cost integer default 1
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := public.current_application_user_id();
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  return query
  select result.is_allowed, result.remaining_requests, result.resets_at
  from private.consume_rate_limit_internal(
    p_action,
    'user:' || current_user_id::text,
    p_cost
  ) as result;
end;
$$;

create or replace function public.consume_rate_limit_for_subject(
  p_action public.rate_limit_action,
  p_subject_hash text,
  p_cost integer default 1
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_subject_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'subject hash must be lowercase SHA-256';
  end if;

  return query
  select result.is_allowed, result.remaining_requests, result.resets_at
  from private.consume_rate_limit_internal(
    p_action,
    'external-sha256:' || p_subject_hash,
    p_cost
  ) as result;
end;
$$;

create or replace function public.can_delete_own_commission_object(
  p_bucket_id text,
  p_object_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.current_application_user_id() is not null
    and p_bucket_id = 'commission-private'
    and split_part(p_object_path, '/', 1) = public.current_application_user_id()::text
    and not exists (
      select 1
      from public.message_attachments
      where message_attachments.bucket_id = p_bucket_id
        and message_attachments.object_path = p_object_path
    )
    and not exists (
      select 1
      from public.draft_revision_assets
      where draft_revision_assets.bucket_id = p_bucket_id
        and draft_revision_assets.object_path = p_object_path
    )
    and (
      not exists (
        select 1
        from public.design_request_attachments
        where design_request_attachments.bucket_id = p_bucket_id
          and design_request_attachments.object_path = p_object_path
      )
      or exists (
        select 1
        from public.design_request_attachments
        inner join public.design_requests
          on design_requests.id = design_request_attachments.design_request_id
        where design_request_attachments.bucket_id = p_bucket_id
          and design_request_attachments.object_path = p_object_path
          and design_request_attachments.owner_id = public.current_application_user_id()
          and design_requests.customer_id = public.current_application_user_id()
          and design_requests.status = 'draft'
      )
    );
$$;

create or replace function public.authorize_deliverable_access(
  p_deliverable_id uuid,
  p_request_id uuid,
  p_ip_address inet default null,
  p_user_agent text default null
)
returns table (
  authorized boolean,
  access_log_id uuid,
  resulting_commission_status public.commission_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_application_user_id();
  deliverable_record public.deliverables%rowtype;
  commission_record public.commissions%rowtype;
  existing_log private.deliverable_access_logs%rowtype;
  log_uuid uuid := gen_random_uuid();
  access_allowed boolean := false;
  rate_allowed boolean;
  access_outcome text := 'denied';
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_deliverable_id is null or p_request_id is null then
    raise exception using errcode = '22023', message = 'deliverable and request IDs are required';
  end if;
  if p_user_agent is not null and char_length(p_user_agent) > 1000 then
    raise exception using errcode = '22023', message = 'user agent exceeds 1000 characters';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('deliverable-access:' || p_request_id::text, 0)
  );

  select *
  into existing_log
  from private.deliverable_access_logs
  where request_id = p_request_id;

  if found then
    if existing_log.deliverable_id is distinct from p_deliverable_id
      or existing_log.accessed_by is distinct from actor_id
    then
      raise exception using errcode = '22023', message = 'request ID was reused for different access inputs';
    end if;

    select commissions.status
    into resulting_commission_status
    from public.deliverables
    inner join public.commissions
      on commissions.id = deliverables.commission_id
    where deliverables.id = p_deliverable_id;

    return query
    select existing_log.outcome = 'allowed', existing_log.id, resulting_commission_status;
    return;
  end if;

  select *
  into deliverable_record
  from public.deliverables
  where id = p_deliverable_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'deliverable not found';
  end if;

  select *
  into commission_record
  from public.commissions
  where id = deliverable_record.commission_id
  for update;

  select result.is_allowed
  into rate_allowed
  from private.consume_rate_limit_internal(
    'deliverable_access',
    'user:' || actor_id::text,
    1
  ) as result;

  if not rate_allowed then
    access_outcome := 'denied';
  elsif public.is_active_admin() then
    access_allowed := deliverable_record.status <> 'revoked'
      and exists (
        select 1
        from private.deliverable_secrets
        where deliverable_id = deliverable_record.id
      );
    access_outcome := case when access_allowed then 'allowed' else 'revoked' end;
  elsif deliverable_record.customer_id = actor_id
    and commission_record.customer_id = actor_id
    and deliverable_record.status = 'released'
    and commission_record.status in ('paid', 'delivered', 'aftercare', 'completed')
    and public.commission_payment_is_clear(
      commission_record.id,
      actor_id
    )
    and exists (
      select 1
      from private.deliverable_secrets
      where deliverable_id = deliverable_record.id
    )
  then
    access_allowed := true;
    access_outcome := 'allowed';
  elsif deliverable_record.status = 'revoked' then
    access_outcome := 'revoked';
  end if;

  insert into private.deliverable_access_logs (
    id,
    deliverable_id,
    request_id,
    accessed_by,
    ip_address,
    user_agent,
    outcome
  )
  values (
    log_uuid,
    p_deliverable_id,
    p_request_id,
    actor_id,
    p_ip_address,
    p_user_agent,
    access_outcome
  );

  if access_allowed
    and actor_id = commission_record.customer_id
    and commission_record.status = 'paid'
  then
    update public.commissions
    set status = 'delivered',
        delivered_at = coalesce(delivered_at, now())
    where id = commission_record.id;

    insert into public.commission_status_history (
      commission_id,
      from_status,
      to_status,
      actor,
      changed_by,
      reason,
      metadata,
      idempotency_key
    )
    values (
      commission_record.id,
      'paid',
      'delivered',
      'system',
      actor_id,
      'First deliverable access',
      jsonb_build_object(
        'deliverable_id', p_deliverable_id,
        'access_log_id', log_uuid
      ),
      p_request_id::text
    );

    commission_record.status := 'delivered';
  end if;

  return query
  select access_allowed, log_uuid, commission_record.status;
end;
$$;

create or replace function public.admin_upsert_deliverable(
  p_commission_id uuid,
  p_kind public.deliverable_kind,
  p_version_number smallint,
  p_title text,
  p_description text,
  p_file_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_sha256_hex text,
  p_bucket_id text,
  p_object_path text,
  p_secret_url text,
  p_release boolean,
  p_idempotency_key text,
  p_expected_status public.deliverable_status default null
)
returns table (
  deliverable_id uuid,
  status public.deliverable_status,
  operation text,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_application_user_id();
  actor_email text;
  commission_record public.commissions%rowtype;
  deliverable_record public.deliverables%rowtype;
  existing_request private.deliverable_write_requests%rowtype;
  deliverable_uuid uuid := gen_random_uuid();
  input_hash text;
  result_operation text;
begin
  if actor_id is null or not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'active confirmed admin required';
  end if;
  if p_commission_id is null
    or p_kind is null
    or p_version_number is null
    or p_version_number <= 0
    or p_title is null
    or char_length(btrim(p_title)) not between 1 and 200
    or (p_description is not null and char_length(p_description) > 5000)
    or p_file_name is null
    or char_length(btrim(p_file_name)) not between 1 and 255
    or p_mime_type is null
    or char_length(p_mime_type) not between 3 and 127
    or p_byte_size is null
    or p_byte_size not between 1 and 262144000
    or p_sha256_hex !~ '^[0-9a-f]{64}$'
    or p_bucket_id <> 'deliverables-private'
    or p_object_path is null
    or p_object_path = ''
    or p_object_path ~ '(^|/)\.\.?(/|$)'
    or p_secret_url is null
    or char_length(p_secret_url) not between 9 and 4096
    or p_secret_url !~ '^https://[^[:space:][:cntrl:]]+$'
    or p_release is null
    or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 1 and 255
    or p_idempotency_key !~ '^[!-~]+$'
  then
    raise exception using errcode = '22023', message = 'deliverable write inputs are invalid';
  end if;

  input_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        jsonb_build_object(
          'commission_id', p_commission_id,
          'kind', p_kind,
          'version_number', p_version_number,
          'title', btrim(p_title),
          'description', p_description,
          'file_name', btrim(p_file_name),
          'mime_type', p_mime_type,
          'byte_size', p_byte_size,
          'sha256_hex', p_sha256_hex,
          'bucket_id', p_bucket_id,
          'object_path', p_object_path,
          'secret_url', p_secret_url,
          'release', p_release,
          'expected_status', p_expected_status
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('deliverable-write:' || p_idempotency_key, 0)
  );

  select requests.*
  into existing_request
  from private.deliverable_write_requests as requests
  where requests.idempotency_key = p_idempotency_key;

  if found then
    if existing_request.input_sha256 is distinct from input_hash
      or existing_request.actor_id is distinct from actor_id
    then
      raise exception using
        errcode = '22023',
        message = 'deliverable idempotency key was reused with different inputs';
    end if;

    select deliverables.*
    into deliverable_record
    from public.deliverables
    where deliverables.id = existing_request.deliverable_id;

    return query
    select
      deliverable_record.id,
      existing_request.result_status,
      existing_request.operation,
      true;
    return;
  end if;

  select commissions.*
  into commission_record
  from public.commissions
  where commissions.id = p_commission_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'commission not found';
  end if;
  if commission_record.status not in (
    'draft_approved',
    'final_payment_due',
    'paid',
    'delivered',
    'aftercare',
    'completed'
  ) then
    raise exception using
      errcode = '55000',
      message = 'commission state does not allow deliverable preparation';
  end if;
  if p_release
    and commission_record.status not in (
      'final_payment_due',
      'paid',
      'delivered',
      'aftercare',
      'completed'
    )
  then
    raise exception using
      errcode = '55000',
      message = 'commission state does not allow deliverable release';
  end if;
  if p_object_path not like commission_record.customer_id::text || '/%' then
    raise exception using
      errcode = '23514',
      message = 'deliverable object path must be namespaced to the customer';
  end if;

  select deliverables.*
  into deliverable_record
  from public.deliverables
  where deliverables.commission_id = p_commission_id
    and deliverables.kind = p_kind
    and deliverables.version_number = p_version_number
  for update;

  if not found then
    if p_expected_status is not null then
      raise exception using
        errcode = '40001',
        message = 'deliverable does not exist at the expected state';
    end if;

    insert into public.deliverables (
      id,
      commission_id,
      customer_id,
      kind,
      status,
      version_number,
      title,
      description,
      file_name,
      mime_type,
      byte_size,
      sha256_hex,
      created_by
    )
    values (
      deliverable_uuid,
      p_commission_id,
      commission_record.customer_id,
      p_kind,
      'preparing',
      p_version_number,
      btrim(p_title),
      nullif(p_description, ''),
      btrim(p_file_name),
      p_mime_type,
      p_byte_size,
      p_sha256_hex,
      actor_id
    )
    returning * into deliverable_record;

    result_operation := 'created';
  else
    if deliverable_record.status is distinct from p_expected_status then
      raise exception using
        errcode = '40001',
        message = 'deliverable status changed; refresh and retry';
    end if;
    if deliverable_record.status <> 'preparing' then
      raise exception using
        errcode = '55000',
        message = 'released or revoked deliverables cannot be rewritten';
    end if;

    update public.deliverables
    set title = btrim(p_title),
        description = nullif(p_description, ''),
        file_name = btrim(p_file_name),
        mime_type = p_mime_type,
        byte_size = p_byte_size,
        sha256_hex = p_sha256_hex
    where id = deliverable_record.id
    returning * into deliverable_record;

    deliverable_uuid := deliverable_record.id;
    result_operation := 'updated';
  end if;

  insert into private.deliverable_secrets (
    deliverable_id,
    bucket_id,
    object_path,
    secret_url,
    encryption_context,
    rotated_at
  )
  values (
    deliverable_uuid,
    p_bucket_id,
    p_object_path,
    p_secret_url,
    jsonb_build_object(
      'commission_id', p_commission_id,
      'customer_id', commission_record.customer_id,
      'sha256_hex', p_sha256_hex
    ),
    now()
  )
  on conflict (deliverable_id) do update
  set bucket_id = excluded.bucket_id,
      object_path = excluded.object_path,
      secret_url = excluded.secret_url,
      encryption_context = excluded.encryption_context,
      rotated_at = now();

  if p_release then
    update public.deliverables
    set status = 'released',
        released_at = now()
    where id = deliverable_uuid
    returning * into deliverable_record;
    result_operation := 'released';
  end if;

  select email
  into actor_email
  from auth.users
  where id = actor_id;

  insert into private.audit_logs (
    actor_id,
    actor_email,
    action,
    schema_name,
    table_name,
    record_id,
    new_record,
    request_id
  )
  values (
    actor_id,
    actor_email,
    case when result_operation = 'created' then 'INSERT' else 'UPDATE' end,
    'private',
    'deliverable_secrets',
    deliverable_uuid,
    jsonb_build_object(
      'deliverable_id', deliverable_uuid,
      'object_path_sha256', pg_catalog.encode(
        extensions.digest(pg_catalog.convert_to(p_object_path, 'UTF8'), 'sha256'),
        'hex'
      ),
      'secret_url_sha256', pg_catalog.encode(
        extensions.digest(pg_catalog.convert_to(p_secret_url, 'UTF8'), 'sha256'),
        'hex'
      )
    ),
    p_idempotency_key
  );

  insert into private.deliverable_write_requests (
    idempotency_key,
    input_sha256,
    deliverable_id,
    actor_id,
    operation,
    result_status
  )
  values (
    p_idempotency_key,
    input_hash,
    deliverable_uuid,
    actor_id,
    result_operation,
    deliverable_record.status
  );

  return query
  select
    deliverable_record.id,
    deliverable_record.status,
    result_operation,
    false;
end;
$$;

create or replace function public.resolve_deliverable_secret_url(
  p_access_log_id uuid,
  p_request_id uuid,
  p_actor_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_url text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_access_log_id is null
    or p_request_id is null
    or p_actor_id is null
  then
    raise exception using errcode = '22023', message = 'access log, request, and customer IDs are required';
  end if;

  select secrets.secret_url
  into resolved_url
  from private.deliverable_access_logs as access_logs
  inner join public.deliverables
    on deliverables.id = access_logs.deliverable_id
  inner join public.commissions
    on commissions.id = deliverables.commission_id
  inner join private.deliverable_secrets as secrets
    on secrets.deliverable_id = deliverables.id
  where access_logs.id = p_access_log_id
    and access_logs.request_id = p_request_id
    and access_logs.accessed_by = p_actor_id
    and access_logs.outcome = 'allowed'
    and access_logs.occurred_at >= pg_catalog.clock_timestamp() - interval '5 minutes'
    and deliverables.status <> 'revoked'
    and (secrets.token_expires_at is null or secrets.token_expires_at > now())
    and not exists (
      select 1
      from public.payments as blocked_payments
      where blocked_payments.commission_id = commissions.id
        and blocked_payments.kind = 'final'
        and (
          blocked_payments.status in ('partially_refunded', 'refunded')
          or blocked_payments.refunded_minor > 0
          or private.payment_has_blocking_refund(blocked_payments.id)
          or private.payment_has_blocking_dispute(blocked_payments.id)
        )
    )
    and (
      private.is_active_admin_user(p_actor_id)
      or (
        deliverables.customer_id = p_actor_id
        and commissions.customer_id = p_actor_id
        and deliverables.status = 'released'
        and commissions.status in ('paid', 'delivered', 'aftercare', 'completed')
        and exists (
          select 1
          from public.payments
          where payments.commission_id = commissions.id
            and payments.customer_id = p_actor_id
            and payments.kind = 'final'
            and payments.status = 'succeeded'
            and payments.refunded_minor = 0
            and not private.payment_has_blocking_refund(payments.id)
            and not private.payment_has_blocking_dispute(payments.id)
        )
      )
    );

  if resolved_url is null then
    raise exception using
      errcode = '42501',
      message = 'deliverable secret is unavailable for this authorized access';
  end if;

  return resolved_url;
end;
$$;

create or replace function public.admin_list_audit_logs(
  p_limit integer default 50,
  p_offset integer default 0,
  p_search text default null,
  p_schema_name text default null,
  p_table_name text default null,
  p_action text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  id uuid,
  actor_id uuid,
  actor_email_masked text,
  action text,
  schema_name text,
  table_name text,
  record_id uuid,
  changed_fields text[],
  request_id_fingerprint text,
  occurred_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_application_user_id() is null or not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'active confirmed admin required';
  end if;
  if p_limit not between 1 and 100
    or p_offset not between 0 and 10000
    or (p_search is not null and char_length(p_search) > 100)
    or (p_schema_name is not null and char_length(p_schema_name) > 63)
    or (p_table_name is not null and char_length(p_table_name) > 63)
    or (p_action is not null and p_action not in ('INSERT', 'UPDATE', 'DELETE'))
    or (p_from is not null and p_to is not null and p_to < p_from)
  then
    raise exception using errcode = '22023', message = 'audit query parameters are invalid';
  end if;

  return query
  select
    logs.id,
    logs.actor_id,
    case
      when logs.actor_email is null then null
      when position('@' in logs.actor_email) > 1
        then left(logs.actor_email, 1) || '***@' || split_part(logs.actor_email, '@', 2)
      else '***'
    end,
    logs.action,
    logs.schema_name,
    logs.table_name,
    logs.record_id,
    array(
      select fields.field_name
      from jsonb_object_keys(
        coalesce(logs.old_record, '{}'::jsonb)
        || coalesce(logs.new_record, '{}'::jsonb)
      ) as fields(field_name)
      where logs.old_record -> fields.field_name
        is distinct from logs.new_record -> fields.field_name
        and fields.field_name not in (
          'access_token_hash',
          'body',
          'destination_ciphertext',
          'encryption_context',
          'object_path',
          'raw_payload',
          'safe_payload',
          'sanitized_payload',
          'secret_url'
        )
      order by fields.field_name
    ),
    case
      when logs.request_id is null then null
      else left(
        pg_catalog.encode(
          extensions.digest(
            pg_catalog.convert_to(logs.request_id, 'UTF8'),
            'sha256'
          ),
          'hex'
        ),
        16
      )
    end,
    logs.occurred_at,
    count(*) over ()
  from private.audit_logs as logs
  where (p_schema_name is null or logs.schema_name = p_schema_name)
    and (p_table_name is null or logs.table_name = p_table_name)
    and (p_action is null or logs.action = p_action)
    and (p_from is null or logs.occurred_at >= p_from)
    and (p_to is null or logs.occurred_at < p_to)
    and (
      p_search is null
      or position(
        lower(p_search)
        in lower(concat_ws(
          ' ',
          logs.actor_email,
          logs.action,
          logs.schema_name,
          logs.table_name,
          logs.record_id::text,
          logs.request_id
        ))
      ) > 0
    )
  order by logs.occurred_at desc, logs.id desc
  limit p_limit
  offset p_offset;
end;
$$;

create or replace function private.enforce_rate_limit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_application_user_id();
  action_name public.rate_limit_action := tg_argv[0]::public.rate_limit_action;
  result_allowed boolean;
begin
  if actor_id is null or public.is_active_admin() then
    return new;
  end if;

  if tg_table_name = 'design_requests'
    and not (
      (tg_op = 'INSERT' and new.status = 'open')
      or (tg_op = 'UPDATE' and old.status = 'draft' and new.status = 'open')
    )
  then
    return new;
  end if;

  select is_allowed
  into result_allowed
  from private.consume_rate_limit_internal(
    action_name,
    'user:' || actor_id::text,
    1
  );

  if not result_allowed then
    raise exception using errcode = 'P0001', message = 'rate limit exceeded';
  end if;

  return new;
end;
$$;

create trigger design_requests_rate_limit
before insert or update of status on public.design_requests
for each row execute function private.enforce_rate_limit_trigger('design_request_submit');
create trigger messages_rate_limit
before insert on public.messages
for each row execute function private.enforce_rate_limit_trigger('message_send');
create or replace function public.transition_quote_status(
  p_quote_version_id uuid,
  p_expected_status public.quote_status,
  p_to_status public.quote_status,
  p_idempotency_key text
)
returns table (
  quote_status_event_id uuid,
  effective_status public.quote_status,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_application_user_id();
  quote_record public.quote_versions%rowtype;
  request_customer uuid;
  existing_event public.quote_status_events%rowtype;
  event_uuid uuid := gen_random_uuid();
  event_actor public.message_kind;
  current_status public.quote_status;
begin
  if p_quote_version_id is null
    or p_expected_status is null
    or p_to_status is null
    or p_idempotency_key is null
  then
    raise exception using errcode = '22023', message = 'quote, expected status, target status, and idempotency key are required';
  end if;
  if char_length(p_idempotency_key) not between 1 and 255
    or p_idempotency_key !~ '^[!-~]+$'
  then
    raise exception using errcode = '22023', message = 'idempotency key is invalid';
  end if;
  if p_to_status in ('accepted', 'superseded', 'expired', 'countered') then
    raise exception using
      errcode = '22023',
      message = 'target quote status is derived from acceptance, versions, expiration, or counteroffers';
  end if;

  select *
  into quote_record
  from public.quote_versions
  where id = p_quote_version_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'quote not found';
  end if;

  select customer_id
  into request_customer
  from public.design_requests
  where id = quote_record.design_request_id;

  event_actor := case
    when p_to_status in ('sent', 'cancelled')
      and actor_id is not null
      and public.is_active_admin()
      then 'admin'::public.message_kind
    when p_to_status = 'viewed'
      and (
        auth.role() = 'service_role'
        or actor_id = request_customer
      )
      then 'system'::public.message_kind
    when p_to_status = 'declined'
      and actor_id = request_customer
      then 'customer'::public.message_kind
    else null
  end;

  if event_actor is null then
    raise exception using errcode = '42501', message = 'actor cannot perform this quote transition';
  end if;

  select *
  into existing_event
  from public.quote_status_events
  where quote_version_id = p_quote_version_id
    and idempotency_key = p_idempotency_key;

  if found then
    if existing_event.status is distinct from p_to_status then
      raise exception using errcode = '22023', message = 'idempotency key was used for a different quote event';
    end if;
    return query
    select
      existing_event.id,
      private.effective_quote_status(p_quote_version_id, now()),
      false;
    return;
  end if;

  current_status := private.effective_quote_status(p_quote_version_id, now());
  if current_status is distinct from p_expected_status then
    raise exception using
      errcode = '40001',
      message = 'quote status changed; refresh and retry';
  end if;

  insert into public.quote_status_events (
    id,
    quote_version_id,
    status,
    actor,
    changed_by,
    idempotency_key
  )
  values (
    event_uuid,
    p_quote_version_id,
    p_to_status,
    event_actor,
    actor_id,
    p_idempotency_key
  );

  return query
  select
    event_uuid,
    private.effective_quote_status(p_quote_version_id, now()),
    true;
end;
$$;

create or replace function public.submit_counteroffer(
  p_quote_version_id uuid,
  p_quote_option_id uuid,
  p_proposed_total_minor bigint,
  p_explanation text,
  p_idempotency_key text
)
returns table (
  counteroffer_id uuid,
  version_number smallint,
  status public.counteroffer_status,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_application_user_id();
  quote_record public.quote_versions%rowtype;
  option_record public.quote_options%rowtype;
  request_record public.design_requests%rowtype;
  existing_counteroffer public.quote_counteroffers%rowtype;
  effective_status public.quote_status;
  counteroffer_uuid uuid := gen_random_uuid();
  next_version integer;
  rate_allowed boolean;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_quote_version_id is null
    or p_quote_option_id is null
    or p_proposed_total_minor is null
    or p_proposed_total_minor <= 0
    or p_proposed_total_minor > 99999999
    or p_explanation is null
    or char_length(btrim(p_explanation)) not between 1 and 2000
    or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 1 and 255
    or p_idempotency_key !~ '^[!-~]+$'
  then
    raise exception using errcode = '22023', message = 'counteroffer inputs are invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'counteroffer:' || actor_id::text || ':' || p_idempotency_key,
      0
    )
  );

  select counteroffers.*
  into existing_counteroffer
  from public.quote_counteroffers as counteroffers
  where counteroffers.customer_id = actor_id
    and counteroffers.idempotency_key = p_idempotency_key;

  if found then
    if existing_counteroffer.quote_version_id is distinct from p_quote_version_id
      or existing_counteroffer.quote_option_id is distinct from p_quote_option_id
      or existing_counteroffer.proposed_total_minor is distinct from p_proposed_total_minor
      or existing_counteroffer.customer_note is distinct from btrim(p_explanation)
    then
      raise exception using errcode = '22023', message = 'counteroffer idempotency key was reused';
    end if;

    return query
    select
      existing_counteroffer.id,
      existing_counteroffer.version_number,
      existing_counteroffer.status,
      false;
    return;
  end if;

  select quotes.*
  into quote_record
  from public.quote_versions as quotes
  where quotes.id = p_quote_version_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'quote not found';
  end if;

  select requests.*
  into request_record
  from public.design_requests as requests
  where requests.id = quote_record.design_request_id
  for update;

  if request_record.customer_id is distinct from actor_id then
    raise exception using errcode = '42501', message = 'quote does not belong to the customer';
  end if;

  effective_status := private.effective_quote_status(p_quote_version_id, now());
  if effective_status not in ('sent', 'viewed', 'countered')
    or quote_record.valid_until is null
    or quote_record.valid_until <= now()
    or request_record.status not in ('quoted', 'negotiating')
  then
    raise exception using errcode = '55000', message = 'quote is not eligible for counteroffer';
  end if;

  select options.*
  into option_record
  from public.quote_options as options
  where options.id = p_quote_option_id
    and options.quote_version_id = p_quote_version_id;

  if not found then
    raise exception using errcode = '22023', message = 'quote option does not belong to the quote';
  end if;
  if option_record.currency is distinct from quote_record.currency
    or option_record.deposit_minor > p_proposed_total_minor
  then
    raise exception using errcode = '22023', message = 'trusted quote option terms are incompatible';
  end if;

  select result.is_allowed
  into rate_allowed
  from private.consume_rate_limit_internal(
    'counteroffer_submit',
    'user:' || actor_id::text,
    1
  ) as result;

  if not rate_allowed then
    raise exception using errcode = 'P0001', message = 'rate limit exceeded';
  end if;

  select coalesce(max(counteroffers.version_number), 0) + 1
  into next_version
  from public.quote_counteroffers as counteroffers
  where counteroffers.quote_version_id = p_quote_version_id
    and counteroffers.customer_id = actor_id;

  if next_version > 32767 then
    raise exception using errcode = '22003', message = 'counteroffer version overflow';
  end if;

  insert into public.quote_counteroffers (
    id,
    quote_version_id,
    quote_option_id,
    customer_id,
    idempotency_key,
    version_number,
    status,
    currency,
    proposed_total_minor,
    proposed_deposit_minor,
    proposed_scope,
    customer_note,
    submitted_at
  )
  values (
    counteroffer_uuid,
    p_quote_version_id,
    p_quote_option_id,
    actor_id,
    p_idempotency_key,
    next_version::smallint,
    'pending',
    option_record.currency,
    p_proposed_total_minor,
    option_record.deposit_minor,
    option_record.scope_snapshot,
    btrim(p_explanation),
    now()
  );

  return query
  select counteroffer_uuid, next_version::smallint, 'pending'::public.counteroffer_status, true;
end;
$$;

create or replace function public.decide_counteroffer(
  p_counteroffer_id uuid,
  p_decision public.counteroffer_decision,
  p_response_note text,
  p_idempotency_key text
)
returns table (
  decision_id uuid,
  decision public.counteroffer_decision,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_application_user_id();
  counteroffer_record public.quote_counteroffers%rowtype;
  quote_record public.quote_versions%rowtype;
  request_record public.design_requests%rowtype;
  existing_decision public.quote_counteroffer_decisions%rowtype;
  decision_uuid uuid := gen_random_uuid();
  effective_status public.quote_status;
begin
  if actor_id is null or not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'active confirmed admin required';
  end if;
  if p_counteroffer_id is null
    or p_decision is null
    or (p_response_note is not null and char_length(p_response_note) > 5000)
    or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 1 and 255
    or p_idempotency_key !~ '^[!-~]+$'
  then
    raise exception using errcode = '22023', message = 'counteroffer decision inputs are invalid';
  end if;

  select counteroffers.*
  into counteroffer_record
  from public.quote_counteroffers as counteroffers
  where counteroffers.id = p_counteroffer_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'counteroffer not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'quote-acceptance-decision:' || counteroffer_record.quote_version_id::text,
      0
    )
  );

  select quotes.*
  into quote_record
  from public.quote_versions as quotes
  where quotes.id = counteroffer_record.quote_version_id
  for update;

  select requests.*
  into request_record
  from public.design_requests as requests
  where requests.id = quote_record.design_request_id
  for update;

  perform 1
  from public.quote_counteroffers as counteroffers
  where counteroffers.quote_version_id = quote_record.id
  order by counteroffers.id
  for update;

  perform 1
  from public.quote_counteroffer_decisions as decisions
  inner join public.quote_counteroffers as counteroffers
    on counteroffers.id = decisions.counteroffer_id
  where counteroffers.quote_version_id = quote_record.id
  order by decisions.id
  for update of decisions;

  select decisions.*
  into existing_decision
  from public.quote_counteroffer_decisions as decisions
  where decisions.counteroffer_id = p_counteroffer_id;

  if found then
    if existing_decision.idempotency_key is distinct from p_idempotency_key
      or existing_decision.decision is distinct from p_decision
      or existing_decision.response_note is distinct from nullif(btrim(p_response_note), '')
    then
      raise exception using errcode = '22023', message = 'counteroffer already has another decision';
    end if;

    return query select existing_decision.id, existing_decision.decision, false;
    return;
  end if;

  select counteroffers.*
  into counteroffer_record
  from public.quote_counteroffers as counteroffers
  where counteroffers.id = p_counteroffer_id;

  effective_status := private.effective_quote_status(quote_record.id, now());
  if effective_status not in ('sent', 'viewed', 'countered')
    or request_record.status not in ('quoted', 'negotiating')
    or exists (
      select 1
      from public.quote_acceptances
      where quote_version_id = quote_record.id
    )
  then
    raise exception using errcode = '55000', message = 'quote can no longer accept a counteroffer decision';
  end if;
  if counteroffer_record.status <> 'pending' then
    raise exception using errcode = '55000', message = 'counteroffer is no longer pending';
  end if;

  insert into public.quote_counteroffer_decisions (
    id,
    counteroffer_id,
    idempotency_key,
    decision,
    response_note,
    decided_by
  )
  values (
    decision_uuid,
    p_counteroffer_id,
    p_idempotency_key,
    p_decision,
    nullif(btrim(p_response_note), ''),
    actor_id
  );

  return query select decision_uuid, p_decision, true;
end;
$$;

create or replace function public.register_message_attachment_upload(
  p_owner_id uuid,
  p_client_attachment_id uuid,
  p_object_path text,
  p_file_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_sha256_hex text
)
returns table (
  attachment_id uuid,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_attachment public.message_attachments%rowtype;
  attachment_uuid uuid := gen_random_uuid();
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_owner_id is null
    or p_client_attachment_id is null
    or p_object_path is null
    or p_object_path not like p_owner_id::text || '/%'
    or p_object_path ~ '(^|/)\.\.?(/|$)'
    or p_file_name is null
    or char_length(btrim(p_file_name)) not between 1 and 255
    or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_byte_size not between 1 and 6291456
    or p_sha256_hex !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'verified attachment inputs are invalid';
  end if;
  if not exists (
    select 1
    from public.profiles
    where id = p_owner_id
  ) then
    raise exception using errcode = 'P0002', message = 'attachment owner not found';
  end if;
  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'commission-private'
      and name = p_object_path
      and metadata ->> 'mimetype' = p_mime_type
      and coalesce(metadata ->> 'size', '') ~ '^[1-9][0-9]*$'
      and (metadata ->> 'size')::bigint = p_byte_size
  ) then
    raise exception using
      errcode = '55000',
      message = 'verified storage object does not match attachment metadata';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'message-attachment:' || p_owner_id::text || ':' || p_client_attachment_id::text,
      0
    )
  );

  select attachments.*
  into existing_attachment
  from public.message_attachments as attachments
  where attachments.owner_id = p_owner_id
    and attachments.client_attachment_id = p_client_attachment_id;

  if found then
    if existing_attachment.object_path is distinct from p_object_path
      or existing_attachment.file_name is distinct from btrim(p_file_name)
      or existing_attachment.mime_type is distinct from p_mime_type
      or existing_attachment.byte_size is distinct from p_byte_size
      or existing_attachment.sha256_hex is distinct from p_sha256_hex
    then
      raise exception using errcode = '22023', message = 'attachment upload ID was reused';
    end if;
    return query select existing_attachment.id, false;
    return;
  end if;

  insert into public.message_attachments (
    id,
    message_id,
    owner_id,
    client_attachment_id,
    object_path,
    file_name,
    mime_type,
    byte_size,
    sha256_hex,
    verified_at,
    finalized_at
  )
  values (
    attachment_uuid,
    null,
    p_owner_id,
    p_client_attachment_id,
    p_object_path,
    btrim(p_file_name),
    p_mime_type,
    p_byte_size,
    p_sha256_hex,
    now(),
    null
  );

  return query select attachment_uuid, true;
end;
$$;

create or replace function public.send_message(
  p_conversation_id uuid,
  p_client_message_id uuid,
  p_body text default '',
  p_attachment_ids uuid[] default '{}'::uuid[]
)
returns table (
  message_id uuid,
  sent_at timestamptz,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_application_user_id();
  actor_kind public.message_kind;
  conversation_record public.conversations%rowtype;
  existing_message public.messages%rowtype;
  new_message_id uuid := gen_random_uuid();
  message_sent_timestamp timestamptz := now();
  normalized_body text := btrim(coalesce(p_body, ''));
  attachment_count integer;
  matched_attachment_count integer;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_conversation_id is null or p_client_message_id is null then
    raise exception using errcode = '22023', message = 'conversation and client message IDs are required';
  end if;
  if char_length(normalized_body) > 4000 then
    raise exception using errcode = '22023', message = 'message body exceeds 4000 characters';
  end if;
  if p_attachment_ids is null then
    raise exception using errcode = '22023', message = 'attachment IDs are required as an array';
  end if;

  attachment_count := cardinality(p_attachment_ids);
  if attachment_count > 4 then
    raise exception using errcode = '22023', message = 'a message may contain at most four attachments';
  end if;
  if normalized_body = '' and attachment_count = 0 then
    raise exception using errcode = '22023', message = 'a message must contain text or an attachment';
  end if;
  if (
    select count(distinct attachment_id)
    from unnest(p_attachment_ids) as attachment_ids(attachment_id)
  ) <> attachment_count then
    raise exception using errcode = '22023', message = 'attachment IDs must be unique';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_conversation_id::text || ':message:' || p_client_message_id::text,
      0
    )
  );

  select *
  into conversation_record
  from public.conversations
  where id = p_conversation_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'conversation not found';
  end if;

  actor_kind := case
    when public.is_active_admin() then 'admin'::public.message_kind
    when conversation_record.customer_id = actor_id then 'customer'::public.message_kind
    else null
  end;

  if actor_kind is null then
    raise exception using errcode = '42501', message = 'conversation does not belong to the current actor';
  end if;

  select *
  into existing_message
  from public.messages
  where conversation_id = p_conversation_id
    and client_message_id = p_client_message_id;

  if found then
    if existing_message.sender_id is distinct from actor_id
      or existing_message.sender_kind is distinct from actor_kind
      or existing_message.body is distinct from normalized_body
      or (
        select count(*)
        from public.message_attachments as stored_attachments
        where stored_attachments.message_id = existing_message.id
      ) <> attachment_count
      or exists (
        select 1
        from unnest(p_attachment_ids) as requested(attachment_id)
        where not exists (
          select 1
          from public.message_attachments as stored
          where stored.message_id = existing_message.id
            and stored.id = requested.attachment_id
            and stored.owner_id = actor_id
            and stored.finalized_at is not null
        )
      )
    then
      raise exception using errcode = '22023', message = 'client message ID was reused with different inputs';
    end if;

    return query select existing_message.id, existing_message.sent_at, false;
    return;
  end if;

  if conversation_record.status <> 'open' then
    raise exception using errcode = '55000', message = 'conversation is not open';
  end if;

  perform 1
  from public.message_attachments as attachments
  where attachments.id = any(p_attachment_ids)
  order by attachments.id
  for update;

  select count(*)
  into matched_attachment_count
  from public.message_attachments as attachments
  where attachments.id = any(p_attachment_ids)
    and attachments.owner_id = actor_id
    and attachments.message_id is null
    and attachments.finalized_at is null
    and attachments.verified_at is not null;

  if matched_attachment_count <> attachment_count then
    raise exception using
      errcode = '42501',
      message = 'attachment is not verified, unbound, and owned by the sender';
  end if;

  insert into public.messages (
    id,
    conversation_id,
    sender_id,
    sender_kind,
    client_message_id,
    body,
    sent_at
  )
  values (
    new_message_id,
    p_conversation_id,
    actor_id,
    actor_kind,
    p_client_message_id,
    normalized_body,
    message_sent_timestamp
  );

  update public.message_attachments
  set message_id = new_message_id,
      finalized_at = now()
  where id = any(p_attachment_ids);

  update public.conversations
  set last_message_at = message_sent_timestamp,
      last_message_id = new_message_id
  where id = p_conversation_id;

  return query
  select
    new_message_id,
    message_sent_timestamp,
    true;
end;
$$;

create or replace function public.advance_conversation_read_marker(
  p_conversation_id uuid,
  p_message_id uuid
)
returns table (
  conversation_id uuid,
  user_id uuid,
  last_read_message_id uuid,
  last_read_at timestamptz,
  advanced boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_application_user_id();
  conversation_record public.conversations%rowtype;
  message_record public.messages%rowtype;
  marker_record public.conversation_read_markers%rowtype;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_conversation_id is null or p_message_id is null then
    raise exception using errcode = '22023', message = 'conversation and message IDs are required';
  end if;

  select conversations.*
  into conversation_record
  from public.conversations
  where conversations.id = p_conversation_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'conversation not found';
  end if;
  if conversation_record.customer_id is distinct from actor_id
    and not public.is_active_admin()
  then
    raise exception using errcode = '42501', message = 'conversation does not belong to the actor';
  end if;

  select messages.*
  into message_record
  from public.messages
  where messages.id = p_message_id
    and messages.conversation_id = p_conversation_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'message not found in conversation';
  end if;

  select markers.*
  into marker_record
  from public.conversation_read_markers as markers
  where markers.conversation_id = p_conversation_id
    and markers.user_id = actor_id
  for update;

  if not found then
    insert into public.conversation_read_markers (
      conversation_id,
      user_id,
      last_read_message_id,
      last_read_at
    )
    values (
      p_conversation_id,
      actor_id,
      p_message_id,
      message_record.sent_at
    )
    returning * into marker_record;

    return query
    select
      marker_record.conversation_id,
      marker_record.user_id,
      marker_record.last_read_message_id,
      marker_record.last_read_at,
      true;
    return;
  end if;

  if message_record.sent_at > marker_record.last_read_at
    or (
      message_record.sent_at = marker_record.last_read_at
      and message_record.id > coalesce(
        marker_record.last_read_message_id,
        '00000000-0000-0000-0000-000000000000'::uuid
      )
    )
  then
    update public.conversation_read_markers
    set last_read_message_id = message_record.id,
        last_read_at = message_record.sent_at
    where conversation_read_markers.conversation_id = p_conversation_id
      and conversation_read_markers.user_id = actor_id
    returning * into marker_record;

    return query
    select
      marker_record.conversation_id,
      marker_record.user_id,
      marker_record.last_read_message_id,
      marker_record.last_read_at,
      true;
    return;
  end if;

  return query
  select
    marker_record.conversation_id,
    marker_record.user_id,
    marker_record.last_read_message_id,
    marker_record.last_read_at,
    false;
end;
$$;

create or replace function public.accept_quote(
  p_quote_version_id uuid,
  p_idempotency_key text,
  p_quote_option_id uuid default null,
  p_counteroffer_id uuid default null
)
returns table (
  quote_acceptance_id uuid,
  commission_id uuid,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_application_user_id();
  quote_record public.quote_versions%rowtype;
  option_record public.quote_options%rowtype;
  counteroffer_record public.quote_counteroffers%rowtype;
  existing_acceptance public.quote_acceptances%rowtype;
  request_customer uuid;
  request_status public.design_request_status;
  acceptance_uuid uuid := gen_random_uuid();
  commission_uuid uuid := gen_random_uuid();
  accepted_total bigint;
  accepted_deposit bigint;
  accepted_scope_value jsonb;
  option_snapshot jsonb;
  counteroffer_snapshot jsonb;
  quote_snapshot jsonb;
  acceptance_timestamp timestamptz := now();
  rate_allowed boolean;
  effective_status public.quote_status;
  accepted_counteroffer_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'idempotency key is required';
  end if;
  if char_length(p_idempotency_key) not between 1 and 255
    or p_idempotency_key !~ '^[!-~]+$'
  then
    raise exception using errcode = '22023', message = 'idempotency key is invalid';
  end if;
  if num_nonnulls(p_quote_option_id, p_counteroffer_id) <> 1 then
    raise exception using errcode = '22023', message = 'select exactly one quote option or accepted counteroffer';
  end if;

  select acceptances.*
  into existing_acceptance
  from public.quote_acceptances as acceptances
  where acceptances.customer_id = actor_id
    and acceptances.idempotency_key = p_idempotency_key;

  if found then
    if existing_acceptance.quote_version_id is distinct from p_quote_version_id
      or existing_acceptance.selected_quote_option_id is distinct from p_quote_option_id
      or existing_acceptance.selected_counteroffer_id is distinct from p_counteroffer_id
    then
      raise exception using errcode = '22023', message = 'idempotency key was used for different acceptance inputs';
    end if;

    return query
    select existing_acceptance.id, commissions.id, false
    from public.commissions as commissions
    where commissions.quote_acceptance_id = existing_acceptance.id;
    return;
  end if;

  select result.is_allowed
  into rate_allowed
  from private.consume_rate_limit_internal(
    'quote_accept',
    'user:' || actor_id::text,
    1
  ) as result;

  if not rate_allowed then
    raise exception using errcode = 'P0001', message = 'rate limit exceeded';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'quote-acceptance-decision:' || p_quote_version_id::text,
      0
    )
  );

  select quotes.*
  into quote_record
  from public.quote_versions as quotes
  where quotes.id = p_quote_version_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'quote not found';
  end if;

  select requests.customer_id, requests.status
  into request_customer, request_status
  from public.design_requests as requests
  where requests.id = quote_record.design_request_id
  for update;

  if request_customer is distinct from actor_id then
    raise exception using errcode = '42501', message = 'quote does not belong to the current customer';
  end if;
  effective_status := private.effective_quote_status(quote_record.id, acceptance_timestamp);
  if effective_status not in ('sent', 'viewed', 'countered')
    or quote_record.valid_until is null
    or quote_record.valid_until <= now()
  then
    raise exception using errcode = '55000', message = 'quote is not active';
  end if;
  if request_status not in ('quoted', 'negotiating') then
    raise exception using errcode = '55000', message = 'design request cannot accept a quote in its current state';
  end if;

  perform 1
  from public.quote_counteroffers as counteroffers
  where counteroffers.quote_version_id = quote_record.id
  order by counteroffers.id
  for update;

  perform 1
  from public.quote_counteroffer_decisions as decisions
  inner join public.quote_counteroffers as counteroffers
    on counteroffers.id = decisions.counteroffer_id
  where counteroffers.quote_version_id = quote_record.id
  order by decisions.id
  for update of decisions;

  select counteroffers.id
  into accepted_counteroffer_id
  from public.quote_counteroffers as counteroffers
  inner join public.quote_counteroffer_decisions as decisions
    on decisions.counteroffer_id = counteroffers.id
    and decisions.decision = 'accepted'
  where counteroffers.quote_version_id = quote_record.id
    and counteroffers.status = 'accepted'
  order by decisions.decided_at desc, decisions.id desc
  limit 1;

  if accepted_counteroffer_id is not null
    and (
      p_quote_option_id is not null
      or p_counteroffer_id is distinct from accepted_counteroffer_id
    )
  then
    raise exception using
      errcode = '55000',
      message = 'accepted counteroffer takes precedence over original quote options';
  end if;

  select acceptances.*
  into existing_acceptance
  from public.quote_acceptances as acceptances
  where acceptances.customer_id = actor_id
    and acceptances.idempotency_key = p_idempotency_key;

  if found then
    if existing_acceptance.quote_version_id is distinct from p_quote_version_id
      or existing_acceptance.selected_quote_option_id is distinct from p_quote_option_id
      or existing_acceptance.selected_counteroffer_id is distinct from p_counteroffer_id
    then
      raise exception using errcode = '22023', message = 'idempotency key was used for different acceptance inputs';
    end if;

    return query
    select existing_acceptance.id, commissions.id, false
    from public.commissions as commissions
    where commissions.quote_acceptance_id = existing_acceptance.id;
    return;
  end if;

  if exists (
    select 1
    from public.quote_acceptances
    where design_request_id = quote_record.design_request_id
  ) then
    raise exception using errcode = '23505', message = 'a quote has already been accepted for this design request';
  end if;

  if p_quote_option_id is not null then
    select options.*
    into option_record
    from public.quote_options as options
    where options.id = p_quote_option_id
      and options.quote_version_id = quote_record.id;

    if not found then
      raise exception using errcode = '22023', message = 'quote option does not belong to the quote';
    end if;

    accepted_total := option_record.total_minor;
    accepted_deposit := option_record.deposit_minor;
    accepted_scope_value := option_record.scope_snapshot;
    option_snapshot := jsonb_build_object(
      'id', option_record.id,
      'title', option_record.title,
      'description', option_record.description,
      'price', jsonb_build_object(
        'amountMinor', option_record.total_minor,
        'currency', quote_record.currency
      ),
      'includedRevisionRounds', option_record.included_revision_rounds,
      'estimatedCompletionDays', option_record.estimated_completion_days,
      'lineItems', option_record.line_items
    );
  else
    select counteroffers.*
    into counteroffer_record
    from public.quote_counteroffers as counteroffers
    where counteroffers.id = p_counteroffer_id
      and counteroffers.quote_version_id = quote_record.id
      and counteroffers.customer_id = actor_id
      and counteroffers.status = 'accepted';

    if counteroffer_record.id is null or not exists (
      select 1
      from public.quote_counteroffer_decisions as decisions
      where decisions.counteroffer_id = counteroffer_record.id
        and decisions.decision = 'accepted'
    ) then
      raise exception using errcode = '22023', message = 'counteroffer is not accepted for this quote';
    end if;

    accepted_total := counteroffer_record.proposed_total_minor;
    accepted_deposit := counteroffer_record.proposed_deposit_minor;
    accepted_scope_value := counteroffer_record.proposed_scope;
    counteroffer_snapshot := jsonb_build_object(
      'id', counteroffer_record.id,
      'quoteId', counteroffer_record.quote_version_id,
      'quoteVersion', quote_record.version_number,
      'optionId', counteroffer_record.quote_option_id,
      'status', counteroffer_record.status,
      'proposedPrice', jsonb_build_object(
        'amountMinor', counteroffer_record.proposed_total_minor,
        'currency', counteroffer_record.currency
      ),
      'explanation', counteroffer_record.customer_note
    );

    select options.*
    into option_record
    from public.quote_options as options
    where options.id = counteroffer_record.quote_option_id;

    option_snapshot := jsonb_build_object(
      'id', option_record.id,
      'title', option_record.title,
      'description', option_record.description,
      'price', jsonb_build_object(
        'amountMinor', counteroffer_record.proposed_total_minor,
        'currency', counteroffer_record.currency
      ),
      'includedRevisionRounds', option_record.included_revision_rounds,
      'estimatedCompletionDays', option_record.estimated_completion_days,
      'lineItems', '[]'::jsonb
    );
  end if;

  if accepted_total not between 1 and 99999999 then
    raise exception using
      errcode = '22003',
      message = 'accepted quote total is outside the Checkout amount bounds';
  end if;

  quote_snapshot := jsonb_build_object(
    'schemaVersion', 1,
    'quoteId', quote_record.id,
    'quoteVersion', quote_record.version_number,
    'designRequestId', quote_record.design_request_id,
    'acceptedAt', acceptance_timestamp,
    'terms', quote_record.terms,
    'option', option_snapshot
  );

  insert into public.quote_acceptances (
    id,
    customer_id,
    design_request_id,
    quote_version_id,
    selected_quote_option_id,
    selected_counteroffer_id,
    idempotency_key,
    accepted_quote_version,
    accepted_title,
    accepted_currency,
    accepted_total_minor,
    accepted_deposit_minor,
    accepted_scope,
    accepted_terms,
    accepted_production_weeks,
    accepted_option_snapshot,
    accepted_counteroffer_snapshot,
    accepted_quote_snapshot,
    accepted_at
  )
  values (
    acceptance_uuid,
    actor_id,
    quote_record.design_request_id,
    quote_record.id,
    p_quote_option_id,
    p_counteroffer_id,
    p_idempotency_key,
    quote_record.version_number,
    quote_record.title,
    quote_record.currency,
    accepted_total,
    accepted_deposit,
    accepted_scope_value,
    quote_record.terms,
    quote_record.production_weeks,
    option_snapshot,
    counteroffer_snapshot,
    quote_snapshot,
    acceptance_timestamp
  );

  insert into public.commissions (
    id,
    reference_code,
    quote_acceptance_id,
    design_request_id,
    customer_id,
    accepted_quote_version,
    accepted_title,
    accepted_currency,
    accepted_total_minor,
    accepted_deposit_minor,
    accepted_scope,
    accepted_terms,
    accepted_production_weeks,
    accepted_option_snapshot,
    accepted_counteroffer_snapshot,
    accepted_quote_snapshot,
    accepted_at,
    target_completion_at
  )
  values (
    commission_uuid,
    'VYR-' || upper(replace(commission_uuid::text, '-', '')),
    acceptance_uuid,
    quote_record.design_request_id,
    actor_id,
    quote_record.version_number,
    quote_record.title,
    quote_record.currency,
    accepted_total,
    accepted_deposit,
    accepted_scope_value,
    quote_record.terms,
    quote_record.production_weeks,
    option_snapshot,
    counteroffer_snapshot,
    quote_snapshot,
    acceptance_timestamp,
    acceptance_timestamp + pg_catalog.make_interval(days => option_record.estimated_completion_days)
  );

  insert into public.commission_status_history (
    commission_id,
    from_status,
    to_status,
    actor,
    changed_by,
    reason,
    metadata,
    idempotency_key
  )
  values (
    commission_uuid,
    null,
    'awaiting_admin_confirmation',
    'customer',
    actor_id,
    'Quote accepted',
    jsonb_build_object('quote_acceptance_id', acceptance_uuid),
    acceptance_uuid::text
  );

  update public.design_requests
  set status = 'accepted',
      lock_version = lock_version + 1
  where id = quote_record.design_request_id;

  update public.quote_counteroffers
  set status = 'superseded'
  where quote_version_id = quote_record.id
    and status = 'pending';

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
    actor_id,
    'commission_created',
    'Commission created',
    'Your accepted quote is awaiting atelier confirmation.',
    'commission',
    commission_uuid,
    'commission-created:' || commission_uuid::text
  )
  on conflict (recipient_id, dedupe_key) do nothing;

  return query select acceptance_uuid, commission_uuid, true;
end;
$$;

create or replace function public.transition_commission_status(
  p_commission_id uuid,
  p_expected_status public.commission_status,
  p_to_status public.commission_status,
  p_reason text,
  p_idempotency_key text
)
returns table (
  history_id uuid,
  resulting_status public.commission_status,
  changed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_application_user_id();
  actor_kind public.message_kind;
  commission_record public.commissions%rowtype;
  prior_history public.commission_status_history%rowtype;
  history_uuid uuid := gen_random_uuid();
  transition_allowed boolean := false;
  paid_minor bigint;
  notification_event public.notification_event;
begin
  if p_idempotency_key is null or p_expected_status is null or p_to_status is null then
    raise exception using errcode = '22023', message = 'expected status, target status, and idempotency key are required';
  end if;
  if char_length(p_idempotency_key) not between 1 and 255
    or p_idempotency_key !~ '^[!-~]+$'
  then
    raise exception using errcode = '22023', message = 'idempotency key is invalid';
  end if;
  if p_reason is not null and char_length(p_reason) > 2000 then
    raise exception using errcode = '22023', message = 'transition reason is too long';
  end if;

  select commissions.*
  into commission_record
  from public.commissions as commissions
  where commissions.id = p_commission_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'commission not found';
  end if;

  actor_kind := case
    when p_expected_status = 'final_payment_due'
      and p_to_status = 'paid'
      and auth.role() = 'service_role'
      then 'system'::public.message_kind
    when actor_id is not null and public.is_active_admin()
      then 'admin'::public.message_kind
    else null
  end;

  if actor_kind is null then
    raise exception using
      errcode = '42501',
      message = 'active confirmed admin required for generic commission transition';
  end if;

  select history.*
  into prior_history
  from public.commission_status_history as history
  where history.commission_id = p_commission_id
    and history.idempotency_key = p_idempotency_key;

  if found then
    if prior_history.to_status is distinct from p_to_status then
      raise exception using errcode = '22023', message = 'idempotency key was used for a different transition';
    end if;
    return query select prior_history.id, prior_history.to_status, false;
    return;
  end if;

  if commission_record.status is distinct from p_expected_status then
    raise exception using
      errcode = '40001',
      message = 'commission status changed; refresh and retry';
  end if;
  if p_expected_status = p_to_status then
    raise exception using errcode = '22023', message = 'target status must differ from current status';
  end if;

  transition_allowed := case
    when p_expected_status = 'awaiting_admin_confirmation'
      then p_to_status in ('confirmed', 'cancelled') and actor_kind = 'admin'
    when p_expected_status = 'confirmed'
      then p_to_status in ('in_progress', 'cancelled') and actor_kind = 'admin'
    when p_expected_status = 'in_progress'
      then p_to_status = 'cancelled' and actor_kind = 'admin'
    when p_expected_status = 'draft_review'
      then p_to_status = 'cancelled' and actor_kind = 'admin'
    when p_expected_status = 'revision_requested'
      then p_to_status = 'cancelled' and actor_kind = 'admin'
    when p_expected_status = 'draft_approved'
      then p_to_status in ('final_payment_due', 'cancelled') and actor_kind = 'admin'
    when p_expected_status = 'final_payment_due'
      then (
        (p_to_status = 'paid' and actor_kind = 'system')
        or (p_to_status = 'cancelled' and actor_kind = 'admin')
      )
    when p_expected_status = 'paid'
      then (
        (p_to_status = 'delivered' and actor_kind = 'admin')
        or (p_to_status = 'disputed' and actor_kind in ('admin', 'system'))
      )
    when p_expected_status = 'delivered'
      then (
        (p_to_status = 'aftercare' and actor_kind = 'admin')
        or (p_to_status = 'disputed' and actor_kind in ('admin', 'system'))
      )
    when p_expected_status = 'aftercare'
      then p_to_status = 'disputed' and actor_kind in ('admin', 'system')
    when p_expected_status = 'disputed'
      then (
        (p_to_status = 'paid' and actor_kind in ('admin', 'system'))
        or (p_to_status = 'cancelled' and actor_kind = 'admin')
      )
    else false
  end;

  if not transition_allowed then
    raise exception using errcode = '22023', message = 'invalid commission status transition';
  end if;

  if p_expected_status = 'final_payment_due'
    and p_to_status = 'cancelled'
    and exists (
      select 1
      from public.payments
      where payments.commission_id = p_commission_id
        and payments.kind = 'final'
        and (
          payments.status = 'succeeded'
          or payments.status = 'processing'
          or (
            payments.status = 'pending'
            and payments.provider_payment_id is not null
          )
          or (
            payments.status in ('not_started', 'pending')
            and (
              payments.checkout_expires_at is null
              or payments.checkout_expires_at > now()
            )
          )
        )
    )
  then
    raise exception using
      errcode = '55000',
      message = 'active or settled final-payment reservation prevents cancellation';
  end if;

  if p_expected_status = 'final_payment_due' and p_to_status = 'paid' then
    select coalesce(sum(
      case
        when payments.kind = 'refund' then -payments.amount_minor
        else payments.amount_minor - payments.refunded_minor
      end
    ), 0)
    into paid_minor
    from public.payments
    where payments.commission_id = p_commission_id
      and payments.kind = 'final'
      and payments.status in ('succeeded', 'partially_refunded', 'refunded');

    if paid_minor < commission_record.accepted_total_minor then
      raise exception using errcode = '55000', message = 'verified final payment has not been satisfied';
    end if;
    if exists (
      select 1
      from public.payments
      where payments.commission_id = p_commission_id
        and payments.kind = 'final'
        and private.payment_has_blocking_refund(payments.id)
    ) then
      raise exception using errcode = '55000', message = 'payment has an unresolved Stripe refund';
    end if;
    if exists (
      select 1
      from public.payments
      where payments.commission_id = p_commission_id
        and payments.kind = 'final'
        and private.payment_has_blocking_dispute(payments.id)
    ) then
      raise exception using errcode = '55000', message = 'payment has an unresolved Stripe dispute';
    end if;
  end if;

  update public.commissions
  set status = p_to_status,
      started_at = case
        when p_to_status = 'in_progress' then coalesce(started_at, now())
        else started_at
      end,
      delivered_at = case
        when p_to_status = 'delivered' then coalesce(delivered_at, now())
        else delivered_at
      end,
      completed_at = case
        when p_to_status = 'completed' then coalesce(completed_at, now())
        else completed_at
      end
  where id = p_commission_id;

  insert into public.commission_status_history (
    id,
    commission_id,
    from_status,
    to_status,
    actor,
    changed_by,
    reason,
    idempotency_key
  )
  values (
    history_uuid,
    p_commission_id,
    p_expected_status,
    p_to_status,
    actor_kind,
    actor_id,
    nullif(btrim(p_reason), ''),
    p_idempotency_key
  );

  notification_event := case p_to_status
    when 'draft_review' then 'draft_ready'::public.notification_event
    when 'revision_requested' then 'revision_requested'::public.notification_event
    when 'draft_approved' then 'draft_approved'::public.notification_event
    else null
  end;

  if notification_event = 'draft_ready' then
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
      commission_record.customer_id,
      notification_event,
      'Commission status updated',
      'Your commission is now ' || replace(p_to_status::text, '_', ' ') || '.',
      'commission',
      p_commission_id,
      'commission-status:' || history_uuid::text
    )
    on conflict (recipient_id, dedupe_key) do nothing;
  elsif notification_event in ('revision_requested', 'draft_approved') then
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
      notification_event,
      case notification_event
        when 'revision_requested' then 'Revision requested'
        else 'Draft approved'
      end,
      case notification_event
        when 'revision_requested' then 'A customer requested a design revision.'
        else 'A customer approved a design draft.'
      end,
      'commission',
      p_commission_id,
      'commission-status:' || history_uuid::text
    from auth.users as users
    inner join public.admin_allowlist as allowlist
      on allowlist.email = users.email::extensions.citext
    where users.email_confirmed_at is not null
      and users.deleted_at is null
      and allowlist.is_active
      and (allowlist.expires_at is null or allowlist.expires_at > now())
    on conflict (recipient_id, dedupe_key) do nothing;
  end if;

  return query select history_uuid, p_to_status, true;
end;
$$;

create or replace function public.create_draft_revision(
  p_commission_id uuid,
  p_design_draft_id uuid,
  p_title text,
  p_notes text,
  p_idempotency_key text
)
returns table (
  draft_revision_id uuid,
  revision_number smallint,
  status public.draft_status,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_application_user_id();
  commission_record public.commissions%rowtype;
  draft_record public.design_drafts%rowtype;
  existing_revision public.draft_revisions%rowtype;
  revision_uuid uuid := gen_random_uuid();
  next_revision integer;
begin
  if actor_id is null or not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'active confirmed admin required';
  end if;
  if p_commission_id is null
    or p_design_draft_id is null
    or p_title is null
    or char_length(btrim(p_title)) not between 1 and 200
    or (p_notes is not null and char_length(p_notes) > 5000)
    or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 1 and 255
    or p_idempotency_key !~ '^[!-~]+$'
  then
    raise exception using errcode = '22023', message = 'draft revision inputs are invalid';
  end if;

  select commissions.*
  into commission_record
  from public.commissions
  where commissions.id = p_commission_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'commission not found';
  end if;

  select drafts.*
  into draft_record
  from public.design_drafts as drafts
  where drafts.id = p_design_draft_id
  for update;

  if not found
    or draft_record.commission_id is distinct from p_commission_id
  then
    raise exception using errcode = 'P0002', message = 'design draft not found for commission';
  end if;

  select revisions.*
  into existing_revision
  from public.draft_revisions as revisions
  where revisions.design_draft_id = p_design_draft_id
    and revisions.idempotency_key = p_idempotency_key;

  if found then
    if existing_revision.summary is distinct from btrim(p_title)
      or existing_revision.customer_message is distinct from nullif(btrim(p_notes), '')
      or existing_revision.created_by is distinct from actor_id
    then
      raise exception using errcode = '22023', message = 'draft revision idempotency key was reused';
    end if;

    return query
    select
      existing_revision.id,
      existing_revision.revision_number,
      existing_revision.status,
      false;
    return;
  end if;

  if commission_record.status not in ('in_progress', 'revision_requested') then
    raise exception using
      errcode = '55000',
      message = 'commission state does not allow a new draft revision';
  end if;
  if draft_record.status <> 'working'
    or draft_record.published_at is not null
  then
    raise exception using
      errcode = '55000',
      message = 'historical or published design draft cannot receive a new revision';
  end if;

  select coalesce(max(revisions.revision_number), 0) + 1
  into next_revision
  from public.draft_revisions as revisions
  where revisions.design_draft_id = p_design_draft_id;

  if next_revision > 32767 then
    raise exception using errcode = '22003', message = 'draft revision number overflow';
  end if;

  update public.design_drafts
  set title = btrim(p_title)
  where id = p_design_draft_id;

  insert into public.draft_revisions (
    id,
    design_draft_id,
    revision_number,
    idempotency_key,
    status,
    summary,
    specifications,
    customer_message,
    created_by
  )
  values (
    revision_uuid,
    p_design_draft_id,
    next_revision::smallint,
    p_idempotency_key,
    'working',
    btrim(p_title),
    '{}'::jsonb,
    nullif(btrim(p_notes), ''),
    actor_id
  );

  return query
  select
    revision_uuid,
    next_revision::smallint,
    'working'::public.draft_status,
    true;
end;
$$;

create or replace function public.publish_latest_draft_revision(
  p_commission_id uuid,
  p_design_draft_id uuid,
  p_draft_revision_id uuid,
  p_expected_revision_number smallint,
  p_idempotency_key text
)
returns table (
  design_draft_id uuid,
  draft_revision_id uuid,
  resulting_commission_status public.commission_status,
  published_at timestamptz,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_application_user_id();
  commission_record public.commissions%rowtype;
  latest_revision public.draft_revisions%rowtype;
  latest_draft public.design_drafts%rowtype;
  existing_history public.commission_status_history%rowtype;
  publication_timestamp timestamptz := now();
  history_key text := 'draft-publish:' || coalesce(p_idempotency_key, '');
begin
  if actor_id is null or not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'active confirmed admin required';
  end if;
  if p_commission_id is null
    or p_design_draft_id is null
    or p_draft_revision_id is null
    or p_expected_revision_number is null
    or p_expected_revision_number <= 0
    or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 1 and 240
    or p_idempotency_key !~ '^[!-~]+$'
  then
    raise exception using errcode = '22023', message = 'draft publication inputs are invalid';
  end if;

  select commissions.*
  into commission_record
  from public.commissions
  where commissions.id = p_commission_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'commission not found';
  end if;

  select history.*
  into existing_history
  from public.commission_status_history as history
  where history.commission_id = p_commission_id
    and history.idempotency_key = history_key;

  if found then
    if existing_history.to_status <> 'draft_review'
      or existing_history.metadata ->> 'design_draft_id' <> p_design_draft_id::text
      or existing_history.metadata ->> 'draft_revision_id' <> p_draft_revision_id::text
      or existing_history.metadata ->> 'revision_number' <> p_expected_revision_number::text
    then
      raise exception using errcode = '22023', message = 'publication idempotency key was reused';
    end if;

    select revisions.published_at
    into publication_timestamp
    from public.draft_revisions as revisions
    where revisions.id = p_draft_revision_id;

    return query
    select
      p_design_draft_id,
      p_draft_revision_id,
      existing_history.to_status,
      publication_timestamp,
      false;
    return;
  end if;

  if commission_record.status not in ('in_progress', 'revision_requested') then
    raise exception using
      errcode = '40001',
      message = 'commission is not ready to publish a draft';
  end if;

  select revisions.*
  into latest_revision
  from public.design_drafts as drafts
  inner join public.draft_revisions as revisions
    on revisions.design_draft_id = drafts.id
  where drafts.commission_id = p_commission_id
    and drafts.status = 'working'
    and drafts.published_at is null
    and revisions.status = 'working'
    and revisions.published_at is null
  order by
    drafts.sequence_number desc,
    revisions.revision_number desc,
    revisions.created_at desc,
    revisions.id desc
  limit 1
  for update of drafts, revisions;

  if latest_revision.id is not null then
    select drafts.*
    into latest_draft
    from public.design_drafts as drafts
    where drafts.id = latest_revision.design_draft_id;
  end if;

  if latest_revision.id is null
    or latest_draft.id is distinct from p_design_draft_id
    or latest_revision.id is distinct from p_draft_revision_id
    or latest_revision.revision_number is distinct from p_expected_revision_number
  then
    raise exception using
      errcode = '40001',
      message = 'draft revision is stale or not the latest working revision';
  end if;
  if not exists (
    select 1
    from public.draft_revision_assets
    where draft_revision_id = p_draft_revision_id
  ) then
    raise exception using
      errcode = '55000',
      message = 'draft revision requires at least one verified asset before publication';
  end if;

  update public.draft_revisions
  set status = 'shared',
      published_at = publication_timestamp
  where id = p_draft_revision_id;

  update public.design_drafts
  set status = 'shared',
      published_at = publication_timestamp
  where id = p_design_draft_id;

  update public.commissions
  set status = 'draft_review'
  where id = p_commission_id;

  insert into public.commission_status_history (
    commission_id,
    from_status,
    to_status,
    actor,
    changed_by,
    reason,
    metadata,
    idempotency_key
  )
  values (
    p_commission_id,
    commission_record.status,
    'draft_review',
    'admin',
    actor_id,
    'Latest draft revision published for customer review',
    jsonb_build_object(
      'design_draft_id', p_design_draft_id,
      'draft_revision_id', p_draft_revision_id,
      'revision_number', p_expected_revision_number,
      'published_at', publication_timestamp
    ),
    history_key
  );

  return query
  select
    p_design_draft_id,
    p_draft_revision_id,
    'draft_review'::public.commission_status,
    publication_timestamp,
    true;
end;
$$;

create or replace function public.approve_latest_draft_revision(
  p_commission_id uuid,
  p_draft_revision_id uuid,
  p_expected_revision_number smallint,
  p_client_feedback_id uuid,
  p_note text default null
)
returns table (
  feedback_id uuid,
  draft_revision_id uuid,
  resulting_commission_status public.commission_status,
  approved_at timestamptz,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_application_user_id();
  commission_record public.commissions%rowtype;
  latest_revision public.draft_revisions%rowtype;
  latest_draft public.design_drafts%rowtype;
  existing_feedback public.draft_feedback%rowtype;
  feedback_uuid uuid := gen_random_uuid();
  approved_timestamp timestamptz := now();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_commission_id is null
    or p_draft_revision_id is null
    or p_expected_revision_number is null
    or p_expected_revision_number <= 0
    or p_client_feedback_id is null
    or (p_note is not null and char_length(p_note) > 5000)
  then
    raise exception using errcode = '22023', message = 'draft approval inputs are invalid';
  end if;

  select commissions.*
  into commission_record
  from public.commissions
  where commissions.id = p_commission_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'commission not found';
  end if;
  if commission_record.customer_id is distinct from actor_id then
    raise exception using errcode = '42501', message = 'commission does not belong to the customer';
  end if;

  select feedback.*
  into existing_feedback
  from public.draft_feedback as feedback
  where feedback.customer_id = actor_id
    and feedback.client_feedback_id = p_client_feedback_id;

  if found then
    if existing_feedback.draft_revision_id is distinct from p_draft_revision_id
      or existing_feedback.kind <> 'approved'
      or existing_feedback.body is distinct from nullif(btrim(p_note), '')
    then
      raise exception using errcode = '22023', message = 'feedback ID was reused for different approval inputs';
    end if;

    select drafts.approved_at
    into approved_timestamp
    from public.draft_revisions as revisions
    inner join public.design_drafts as drafts
      on drafts.id = revisions.design_draft_id
    where revisions.id = existing_feedback.draft_revision_id;

    return query
    select
      existing_feedback.id,
      existing_feedback.draft_revision_id,
      'draft_approved'::public.commission_status,
      approved_timestamp,
      false;
    return;
  end if;

  if commission_record.status <> 'draft_review' then
    raise exception using
      errcode = '40001',
      message = 'commission is no longer awaiting draft review';
  end if;

  select revisions.*
  into latest_revision
  from public.design_drafts as drafts
  inner join public.draft_revisions as revisions
    on revisions.design_draft_id = drafts.id
  where drafts.commission_id = p_commission_id
    and drafts.published_at is not null
    and revisions.published_at is not null
    and revisions.status = 'shared'
  order by
    drafts.sequence_number desc,
    revisions.revision_number desc,
    revisions.created_at desc,
    revisions.id desc
  limit 1
  for update of drafts, revisions;

  if latest_revision.id is not null then
    select drafts.*
    into latest_draft
    from public.design_drafts as drafts
    where drafts.id = latest_revision.design_draft_id;
  end if;

  if latest_revision.id is null
    or latest_revision.id is distinct from p_draft_revision_id
    or latest_revision.revision_number is distinct from p_expected_revision_number
  then
    raise exception using
      errcode = '40001',
      message = 'draft revision is obsolete; refresh and retry';
  end if;

  insert into public.draft_feedback (
    id,
    draft_revision_id,
    customer_id,
    kind,
    body,
    client_feedback_id,
    requested_by,
    consumes_included_revision,
    complimentary
  )
  values (
    feedback_uuid,
    p_draft_revision_id,
    actor_id,
    'approved',
    nullif(btrim(p_note), ''),
    p_client_feedback_id,
    'customer',
    false,
    false
  );

  update public.draft_revisions
  set status = 'approved'
  where id = p_draft_revision_id;

  update public.design_drafts
  set status = 'approved',
      approved_at = approved_timestamp
  where id = latest_draft.id;

  update public.commissions
  set status = 'draft_approved'
  where id = p_commission_id;

  insert into public.commission_status_history (
    commission_id,
    from_status,
    to_status,
    actor,
    changed_by,
    reason,
    metadata,
    idempotency_key
  )
  values (
    p_commission_id,
    'draft_review',
    'draft_approved',
    'customer',
    actor_id,
    'Latest shared draft approved',
    jsonb_build_object(
      'draft_id', latest_draft.id,
      'draft_revision_id', p_draft_revision_id,
      'feedback_id', feedback_uuid
    ),
    'draft-approval:' || p_client_feedback_id::text
  );

  return query
  select
    feedback_uuid,
    p_draft_revision_id,
    'draft_approved'::public.commission_status,
    approved_timestamp,
    true;
end;
$$;

create or replace function public.request_latest_draft_revision(
  p_commission_id uuid,
  p_draft_revision_id uuid,
  p_expected_revision_number smallint,
  p_reason text,
  p_client_feedback_id uuid,
  p_complimentary_override_reason text default null
)
returns table (
  feedback_id uuid,
  draft_revision_id uuid,
  resulting_commission_status public.commission_status,
  remaining_revision_rounds integer,
  complimentary boolean,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_application_user_id();
  actor_kind public.message_kind;
  commission_record public.commissions%rowtype;
  latest_revision public.draft_revisions%rowtype;
  latest_draft public.design_drafts%rowtype;
  existing_feedback public.draft_feedback%rowtype;
  feedback_uuid uuid := gen_random_uuid();
  included_rounds integer;
  used_rounds integer;
  consumes_round boolean;
  is_complimentary boolean;
  remaining_rounds integer;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_commission_id is null
    or p_draft_revision_id is null
    or p_expected_revision_number is null
    or p_expected_revision_number <= 0
    or p_reason is null
    or char_length(btrim(p_reason)) not between 1 and 2000
    or p_client_feedback_id is null
    or (
      p_complimentary_override_reason is not null
      and char_length(btrim(p_complimentary_override_reason)) not between 1 and 1000
    )
  then
    raise exception using errcode = '22023', message = 'revision request inputs are invalid';
  end if;

  select commissions.*
  into commission_record
  from public.commissions
  where commissions.id = p_commission_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'commission not found';
  end if;

  actor_kind := case
    when actor_id = commission_record.customer_id
      then 'customer'::public.message_kind
    when public.is_active_admin()
      then 'admin'::public.message_kind
    else null
  end;

  if actor_kind is null then
    raise exception using errcode = '42501', message = 'actor cannot request this revision';
  end if;
  if actor_kind = 'customer' and p_complimentary_override_reason is not null then
    raise exception using errcode = '42501', message = 'customer cannot authorize complimentary revision';
  end if;
  if actor_kind = 'admin' and p_complimentary_override_reason is null then
    raise exception using errcode = '22023', message = 'admin complimentary override reason is required';
  end if;

  select feedback.*
  into existing_feedback
  from public.draft_feedback as feedback
  where feedback.customer_id = commission_record.customer_id
    and feedback.client_feedback_id = p_client_feedback_id;

  if found then
    if existing_feedback.draft_revision_id is distinct from p_draft_revision_id
      or existing_feedback.kind <> 'changes_requested'
      or existing_feedback.body is distinct from btrim(p_reason)
      or existing_feedback.requested_by is distinct from actor_kind
      or existing_feedback.override_reason
        is distinct from nullif(btrim(p_complimentary_override_reason), '')
    then
      raise exception using errcode = '22023', message = 'feedback ID was reused for different revision inputs';
    end if;

    return query
    select
      existing_feedback.id,
      existing_feedback.draft_revision_id,
      'revision_requested'::public.commission_status,
      existing_feedback.remaining_revision_rounds,
      existing_feedback.complimentary,
      false;
    return;
  end if;

  if commission_record.status <> 'draft_review' then
    raise exception using
      errcode = '40001',
      message = 'commission is no longer awaiting draft review';
  end if;

  select revisions.*
  into latest_revision
  from public.design_drafts as drafts
  inner join public.draft_revisions as revisions
    on revisions.design_draft_id = drafts.id
  where drafts.commission_id = p_commission_id
    and drafts.published_at is not null
    and revisions.published_at is not null
    and revisions.status = 'shared'
  order by
    drafts.sequence_number desc,
    revisions.revision_number desc,
    revisions.created_at desc,
    revisions.id desc
  limit 1
  for update of drafts, revisions;

  if latest_revision.id is not null then
    select drafts.*
    into latest_draft
    from public.design_drafts as drafts
    where drafts.id = latest_revision.design_draft_id;
  end if;

  if latest_revision.id is null
    or latest_revision.id is distinct from p_draft_revision_id
    or latest_revision.revision_number is distinct from p_expected_revision_number
  then
    raise exception using
      errcode = '40001',
      message = 'draft revision is obsolete; refresh and retry';
  end if;

  included_rounds := case
    when coalesce(
      commission_record.accepted_option_snapshot ->> 'includedRevisionRounds',
      ''
    ) ~ '^[0-9]+$'
      then (commission_record.accepted_option_snapshot ->> 'includedRevisionRounds')::integer
    else 0
  end;

  select count(*) filter (where feedback.consumes_included_revision)
  into used_rounds
  from public.draft_feedback as feedback
  inner join public.draft_revisions as revisions
    on revisions.id = feedback.draft_revision_id
  inner join public.design_drafts as drafts
    on drafts.id = revisions.design_draft_id
  where drafts.commission_id = p_commission_id
    and feedback.customer_id = commission_record.customer_id
    and feedback.kind = 'changes_requested';

  is_complimentary := actor_kind = 'admin';
  consumes_round := actor_kind = 'customer';

  if consumes_round and used_rounds >= included_rounds then
    raise exception using
      errcode = '55000',
      message = 'included revision allowance is exhausted';
  end if;

  remaining_rounds := greatest(
    included_rounds - used_rounds - case when consumes_round then 1 else 0 end,
    0
  );

  insert into public.draft_feedback (
    id,
    draft_revision_id,
    customer_id,
    kind,
    body,
    client_feedback_id,
    requested_by,
    consumes_included_revision,
    complimentary,
    override_reason,
    remaining_revision_rounds
  )
  values (
    feedback_uuid,
    p_draft_revision_id,
    commission_record.customer_id,
    'changes_requested',
    btrim(p_reason),
    p_client_feedback_id,
    actor_kind,
    consumes_round,
    is_complimentary,
    nullif(btrim(p_complimentary_override_reason), ''),
    remaining_rounds
  );

  update public.draft_revisions
  set status = 'superseded'
  where id = p_draft_revision_id;

  update public.design_drafts
  set status = 'superseded'
  where id = latest_draft.id;

  update public.commissions
  set status = 'revision_requested'
  where id = p_commission_id;

  insert into public.commission_status_history (
    commission_id,
    from_status,
    to_status,
    actor,
    changed_by,
    reason,
    metadata,
    idempotency_key
  )
  values (
    p_commission_id,
    'draft_review',
    'revision_requested',
    actor_kind,
    actor_id,
    'Revision requested on latest shared draft',
    jsonb_build_object(
      'draft_id', latest_draft.id,
      'draft_revision_id', p_draft_revision_id,
      'feedback_id', feedback_uuid,
      'consumes_included_revision', consumes_round,
      'complimentary', is_complimentary,
      'remaining_revision_rounds', remaining_rounds
    ),
    'draft-revision:' || p_client_feedback_id::text
  );

  return query
  select
    feedback_uuid,
    p_draft_revision_id,
    'revision_requested'::public.commission_status,
    remaining_rounds,
    is_complimentary,
    true;
end;
$$;

create or replace function public.begin_payment_checkout(
  p_commission_id uuid,
  p_request_id text
)
returns table (
  payment_id uuid,
  status public.payment_status,
  currency text,
  amount_minor bigint,
  provider_idempotency_key text,
  provider_checkout_session_id text,
  checkout_expires_at timestamptz,
  attempt_number integer,
  resumed boolean,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_application_user_id();
  commission_record public.commissions%rowtype;
  existing_payment public.payments%rowtype;
  existing_request private.payment_checkout_requests%rowtype;
  payment_uuid uuid := gen_random_uuid();
  next_attempt integer;
  generated_provider_key text;
  can_resume boolean;
  expired_payment record;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_commission_id is null
    or p_request_id is null
    or char_length(p_request_id) not between 1 and 255
    or p_request_id !~ '^[!-~]+$'
  then
    raise exception using errcode = '22023', message = 'commission or checkout request ID is invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'stripe-checkout:' || p_commission_id::text,
      0
    )
  );

  select commissions.*
  into commission_record
  from public.commissions
  where commissions.id = p_commission_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'commission not found';
  end if;
  if commission_record.customer_id is distinct from actor_id then
    raise exception using errcode = '42501', message = 'commission does not belong to the current customer';
  end if;
  select requests.*
  into existing_request
  from private.payment_checkout_requests as requests
  where requests.customer_id = actor_id
    and requests.request_key = p_request_id;

  if found then
    if existing_request.commission_id is distinct from p_commission_id then
      raise exception using
        errcode = '22023',
        message = 'checkout request ID was used for another commission';
    end if;

    select payments.*
    into existing_payment
    from public.payments
    where payments.id = existing_request.payment_id;

    can_resume := existing_payment.status in ('not_started', 'pending', 'processing')
      and (
        existing_payment.provider_payment_id is not null
        or existing_payment.checkout_expires_at is null
        or existing_payment.checkout_expires_at > now()
      );

    return query
    select
      existing_payment.id,
      existing_payment.status,
      existing_payment.currency,
      existing_payment.amount_minor,
      existing_payment.provider_idempotency_key,
      existing_payment.provider_checkout_session_id,
      existing_payment.checkout_expires_at,
      existing_payment.attempt_number,
      can_resume,
      false;
    return;
  end if;

  if commission_record.status <> 'final_payment_due' then
    raise exception using errcode = '55000', message = 'commission is not awaiting final payment';
  end if;
  if commission_record.accepted_total_minor not between 1 and 99999999 then
    raise exception using
      errcode = '22003',
      message = 'commission total is outside the Checkout amount bounds';
  end if;

  if exists (
    select 1
    from public.payments as settled_payments
    where settled_payments.commission_id = p_commission_id
      and settled_payments.kind = 'final'
      and settled_payments.status in ('succeeded', 'partially_refunded', 'refunded')
  ) then
    raise exception using errcode = '55000', message = 'final payment is already settled';
  end if;

  select payments.*
  into existing_payment
  from public.payments
  where payments.commission_id = p_commission_id
    and payments.kind = 'final'
    and payments.status in ('not_started', 'pending', 'processing')
    and (
      payments.status = 'processing'
      or payments.provider_payment_id is not null
      or payments.checkout_expires_at is null
      or payments.checkout_expires_at > now()
    )
  order by payments.attempt_number desc
  limit 1
  for update;

  if found then
    insert into private.payment_checkout_requests (
      customer_id,
      request_key,
      commission_id,
      payment_id
    )
    values (
      actor_id,
      p_request_id,
      p_commission_id,
      existing_payment.id
    );

    return query
    select
      existing_payment.id,
      existing_payment.status,
      existing_payment.currency,
      existing_payment.amount_minor,
      existing_payment.provider_idempotency_key,
      existing_payment.provider_checkout_session_id,
      existing_payment.checkout_expires_at,
      existing_payment.attempt_number,
      true,
      false;
    return;
  end if;

  for expired_payment in
    select payments.id, payments.status, payments.checkout_expires_at
    from public.payments
    where payments.commission_id = p_commission_id
      and payments.kind = 'final'
      and payments.status in ('not_started', 'pending')
      and payments.provider_payment_id is null
      and payments.checkout_expires_at is not null
      and payments.checkout_expires_at <= now()
    for update
  loop
    update public.payments
    set status = 'cancelled'
    where id = expired_payment.id;

    insert into public.payment_status_history (
      payment_id,
      from_status,
      to_status,
      event,
      provider_event_id,
      occurred_at
    )
    values (
      expired_payment.id,
      expired_payment.status,
      'cancelled',
      'payment_cancelled',
      'local-checkout-expired:' || expired_payment.id::text,
      expired_payment.checkout_expires_at
    )
    on conflict (payment_id, provider_event_id, to_status) do nothing;
  end loop;

  if exists (
    select 1
    from public.payments as still_active
    where still_active.commission_id = p_commission_id
      and still_active.kind = 'final'
      and still_active.status in ('not_started', 'pending', 'processing')
  ) then
    raise exception using errcode = '55000', message = 'active final-payment attempt cannot be replaced';
  end if;

  select coalesce(max(payments.attempt_number), 0) + 1
  into next_attempt
  from public.payments
  where payments.commission_id = p_commission_id
    and payments.kind = 'final';

  generated_provider_key := concat(
    'payment|',
    p_commission_id::text,
    '|final|',
    commission_record.accepted_quote_version::text,
    '|',
    next_attempt::text
  );

  insert into public.payments (
    id,
    commission_id,
    customer_id,
    provider,
    provider_idempotency_key,
    kind,
    attempt_number,
    status,
    currency,
    amount_minor
  )
  values (
    payment_uuid,
    p_commission_id,
    actor_id,
    'stripe',
    generated_provider_key,
    'final',
    next_attempt,
    'not_started',
    commission_record.accepted_currency,
    commission_record.accepted_total_minor
  )
  returning * into existing_payment;

  insert into private.payment_checkout_requests (
    customer_id,
    request_key,
    commission_id,
    payment_id
  )
  values (
    actor_id,
    p_request_id,
    p_commission_id,
    existing_payment.id
  );

  return query
  select
    existing_payment.id,
    existing_payment.status,
    existing_payment.currency,
    existing_payment.amount_minor,
    existing_payment.provider_idempotency_key,
    existing_payment.provider_checkout_session_id,
    existing_payment.checkout_expires_at,
    existing_payment.attempt_number,
    false,
    true;
end;
$$;

create or replace function public.attach_stripe_checkout_session(
  p_payment_id uuid,
  p_provider_idempotency_key text,
  p_checkout_session_id text,
  p_checkout_created_at timestamptz,
  p_checkout_expires_at timestamptz
)
returns table (
  payment_id uuid,
  status public.payment_status,
  attached boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_record public.payments%rowtype;
  starts_checkout boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_payment_id is null
    or p_provider_idempotency_key is null
    or char_length(p_provider_idempotency_key) not between 1 and 255
    or p_checkout_session_id is null
    or char_length(p_checkout_session_id) not between 1 and 255
    or p_checkout_created_at is null
    or p_checkout_expires_at is null
    or p_checkout_expires_at <= p_checkout_created_at
  then
    raise exception using errcode = '22023', message = 'checkout session inputs are invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stripe-checkout-payment:' || p_payment_id::text, 0)
  );

  select payments.*
  into payment_record
  from public.payments
  where payments.id = p_payment_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'payment reservation not found';
  end if;
  if payment_record.provider <> 'stripe'
    or payment_record.kind <> 'final'
    or payment_record.provider_idempotency_key is distinct from p_provider_idempotency_key
  then
    raise exception using errcode = '22023', message = 'checkout reservation inputs do not match';
  end if;

  if payment_record.provider_checkout_session_id is not null then
    if payment_record.provider_checkout_session_id is distinct from p_checkout_session_id
      or payment_record.checkout_created_at is distinct from p_checkout_created_at
      or payment_record.checkout_expires_at is distinct from p_checkout_expires_at
    then
      raise exception using errcode = '22023', message = 'checkout reservation was attached to a different session';
    end if;

    return query select payment_record.id, payment_record.status, false;
    return;
  end if;

  if payment_record.status in ('failed', 'cancelled') then
    raise exception using
      errcode = '55000',
      message = 'terminal failed or cancelled attempt cannot bind a Checkout session';
  end if;

  starts_checkout := payment_record.status = 'not_started';

  update public.payments as target_payment
  set provider_checkout_session_id = p_checkout_session_id,
      checkout_created_at = p_checkout_created_at,
      checkout_expires_at = p_checkout_expires_at,
      status = case
        when target_payment.status = 'not_started' then 'pending'::public.payment_status
        else target_payment.status
      end
  where target_payment.id = p_payment_id
  returning * into payment_record;

  if starts_checkout then
    insert into public.payment_status_history (
      payment_id,
      from_status,
      to_status,
      event,
      provider_event_id,
      occurred_at
    )
    values (
      p_payment_id,
      'not_started',
      'pending',
      'checkout_started',
      'checkout:' || p_checkout_session_id,
      p_checkout_created_at
    );
  end if;

  return query select payment_record.id, payment_record.status, true;
end;
$$;

create or replace function public.record_stripe_checkout_event(
  p_provider_event_id text,
  p_event_type text,
  p_payload_sha256 text,
  p_provider_checkout_session_id text,
  p_provider_created_at timestamptz,
  p_safe_payload jsonb default '{}'::jsonb
)
returns table (
  checkout_event_id uuid,
  payment_id uuid,
  resulting_payment_status public.payment_status,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_event private.stripe_checkout_events%rowtype;
  payment_record public.payments%rowtype;
  event_uuid uuid := gen_random_uuid();
  prior_status public.payment_status;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_provider_event_id is null
    or char_length(p_provider_event_id) not between 1 and 255
    or p_event_type <> 'checkout.session.expired'
    or p_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_provider_checkout_session_id is null
    or char_length(p_provider_checkout_session_id) not between 1 and 255
    or p_provider_created_at is null
    or not private.is_safe_stripe_payload(p_safe_payload)
  then
    raise exception using
      errcode = '22023',
      message = 'verified Stripe Checkout event fields are invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stripe-event:' || p_provider_event_id, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'stripe-checkout-session:' || p_provider_checkout_session_id,
      0
    )
  );

  perform private.register_stripe_event_receipt(
    p_provider_event_id,
    'checkout',
    p_event_type,
    p_payload_sha256,
    p_provider_created_at
  );

  select events.*
  into existing_event
  from private.stripe_checkout_events as events
  where events.provider_event_id = p_provider_event_id;

  if found then
    if existing_event.provider_checkout_session_id
        is distinct from p_provider_checkout_session_id
      or existing_event.event_type is distinct from p_event_type
      or existing_event.safe_payload is distinct from p_safe_payload
    then
      raise exception using
        errcode = '22023',
        message = 'duplicate Checkout event has different immutable inputs';
    end if;

    select payments.*
    into payment_record
    from public.payments
    where payments.id = existing_event.payment_id;

    return query
    select existing_event.id, payment_record.id, payment_record.status, false;
    return;
  end if;

  select payments.*
  into payment_record
  from public.payments
  where payments.provider = 'stripe'
    and payments.provider_checkout_session_id = p_provider_checkout_session_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Stripe Checkout reservation not found';
  end if;

  insert into private.stripe_checkout_events (
    id,
    provider_event_id,
    payment_id,
    provider_checkout_session_id,
    event_type,
    safe_payload,
    signature_verified_at,
    provider_created_at
  )
  values (
    event_uuid,
    p_provider_event_id,
    payment_record.id,
    p_provider_checkout_session_id,
    p_event_type,
    p_safe_payload,
    now(),
    p_provider_created_at
  );

  prior_status := payment_record.status;

  if payment_record.status in ('not_started', 'pending', 'processing') then
    update public.payments
    set status = 'cancelled'
    where id = payment_record.id
    returning * into payment_record;

    insert into public.payment_status_history (
      payment_id,
      from_status,
      to_status,
      event,
      provider_event_id,
      occurred_at
    )
    values (
      payment_record.id,
      prior_status,
      'cancelled',
      'payment_cancelled',
      p_provider_event_id,
      p_provider_created_at
    );
  end if;

  return query
  select event_uuid, payment_record.id, payment_record.status, true;
end;
$$;

create or replace function public.record_verified_payment(
  p_provider public.payment_provider,
  p_provider_event_id text,
  p_event_type text,
  p_payload_sha256 text,
  p_sanitized_payload jsonb,
  p_commission_id uuid,
  p_provider_payment_id text,
  p_provider_idempotency_key text,
  p_kind public.payment_kind,
  p_currency text,
  p_amount_minor bigint,
  p_status public.payment_status,
  p_provider_created_at timestamptz,
  p_failure_code text default null,
  p_refunded_minor bigint default 0
)
returns table (
  payment_id uuid,
  payment_created boolean,
  duplicate_event boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  commission_record public.commissions%rowtype;
  payment_record public.payments%rowtype;
  event_record private.payment_webhook_events%rowtype;
  payment_uuid uuid := gen_random_uuid();
  old_status public.payment_status;
  created_payment boolean := false;
  should_apply_event boolean;
  allowed_transition boolean;
  domain_event_value public.payment_event;
  generated_attempt_number integer;
  other_payment record;
  successful_payment_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_provider_event_id is null or char_length(p_provider_event_id) not between 1 and 255
    or p_provider_payment_id is null or char_length(p_provider_payment_id) not between 1 and 255
    or p_provider_idempotency_key is null or char_length(p_provider_idempotency_key) not between 1 and 255
    or p_event_type is null or char_length(p_event_type) not between 1 and 200
  then
    raise exception using errcode = '22023', message = 'provider identifiers are invalid';
  end if;
  if p_payload_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'payload hash must be lowercase SHA-256';
  end if;
  if p_sanitized_payload is null or jsonb_typeof(p_sanitized_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'sanitized payload must be a JSON object';
  end if;
  if p_sanitized_payload ?| array[
    'billing_details',
    'card',
    'charges',
    'client_secret',
    'customer',
    'payment_method',
    'receipt_email'
  ] then
    raise exception using errcode = '22023', message = 'sanitized payload contains a forbidden sensitive field';
  end if;
  if p_currency !~ '^[A-Z]{3}$'
    or p_amount_minor <= 0
    or p_amount_minor > 99999999
    or p_refunded_minor < 0
    or p_refunded_minor > p_amount_minor
    or p_provider_created_at is null
  then
    raise exception using errcode = '22023', message = 'payment amounts or currency are invalid';
  end if;
  if p_kind <> 'final'
    or p_status in ('partially_refunded', 'refunded')
  then
    raise exception using
      errcode = '22023',
      message = 'verified payment workflow accepts only final PaymentIntent statuses';
  end if;

  domain_event_value := case
    when p_status in ('not_started', 'pending') then 'checkout_started'::public.payment_event
    when p_status = 'processing' then 'payment_processing'::public.payment_event
    when p_status = 'succeeded' then 'payment_succeeded'::public.payment_event
    when p_status = 'failed' then 'payment_failed'::public.payment_event
    when p_status = 'cancelled' then 'payment_cancelled'::public.payment_event
    when p_status = 'partially_refunded' then 'partial_refund_succeeded'::public.payment_event
    when p_status = 'refunded' then 'refund_succeeded'::public.payment_event
  end;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider::text || ':' || p_provider_event_id, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider::text || ':payment:' || p_provider_payment_id, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider::text || ':idempotency:' || p_provider_idempotency_key, 0)
  );

  if p_provider = 'stripe' then
    perform private.register_stripe_event_receipt(
      p_provider_event_id,
      'payment',
      p_event_type,
      p_payload_sha256,
      p_provider_created_at
    );
  end if;

  select events.*
  into event_record
  from private.payment_webhook_events as events
  where events.provider = p_provider
    and events.provider_event_id = p_provider_event_id;

  if found then
    select *
    into payment_record
    from public.payments
    where id = event_record.payment_id;

    if event_record.payload_sha256 is distinct from p_payload_sha256
      or event_record.event_type is distinct from p_event_type
      or event_record.domain_event is distinct from domain_event_value
      or event_record.provider_created_at is distinct from p_provider_created_at
      or payment_record.commission_id is distinct from p_commission_id
      or payment_record.provider_payment_id is distinct from p_provider_payment_id
      or payment_record.provider_idempotency_key is distinct from p_provider_idempotency_key
      or payment_record.kind is distinct from p_kind
      or payment_record.currency is distinct from p_currency
      or payment_record.amount_minor is distinct from p_amount_minor
    then
      raise exception using errcode = '22023', message = 'duplicate provider event has different immutable inputs';
    end if;
    return query select event_record.payment_id, false, true;
    return;
  end if;

  select commissions.*
  into commission_record
  from public.commissions as commissions
  where commissions.id = p_commission_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'commission not found';
  end if;
  if commission_record.accepted_currency is distinct from p_currency then
    raise exception using errcode = '22023', message = 'payment currency must match the commission';
  end if;
  if p_kind = 'final' and commission_record.status not in (
    'final_payment_due',
    'paid',
    'delivered',
    'aftercare',
    'completed',
    'cancelled',
    'disputed'
  ) then
    raise exception using errcode = '55000', message = 'commission is not eligible for final payment';
  end if;
  if p_kind = 'refund' and commission_record.status not in (
    'paid',
    'delivered',
    'aftercare',
    'completed',
    'disputed'
  ) then
    raise exception using errcode = '55000', message = 'commission is not eligible for a refund';
  end if;

  select payments.*
  into payment_record
  from public.payments as payments
  where payments.provider = p_provider
    and (
      payments.provider_payment_id = p_provider_payment_id
      or payments.provider_idempotency_key = p_provider_idempotency_key
    )
  order by (payments.provider_payment_id = p_provider_payment_id) desc
  limit 1
  for update;

  if found then
    if payment_record.commission_id is distinct from p_commission_id
      or (
        payment_record.provider_payment_id is not null
        and payment_record.provider_payment_id is distinct from p_provider_payment_id
      )
      or payment_record.provider_idempotency_key is distinct from p_provider_idempotency_key
      or payment_record.kind is distinct from p_kind
      or payment_record.currency is distinct from p_currency
      or payment_record.amount_minor is distinct from p_amount_minor
    then
      raise exception using errcode = '22023', message = 'payment identifier was reused with different immutable values';
    end if;
    payment_uuid := payment_record.id;
    old_status := payment_record.status;
  else
    select coalesce(max(payments.attempt_number), 0) + 1
    into generated_attempt_number
    from public.payments
    where payments.commission_id = p_commission_id
      and payments.kind = 'final';

    insert into public.payments (
      id,
      commission_id,
      customer_id,
      provider,
      provider_payment_id,
      provider_idempotency_key,
      kind,
      attempt_number,
      status,
      currency,
      amount_minor,
      refunded_minor,
      provider_created_at,
      last_provider_event_at,
      captured_at,
      failure_code
    )
    values (
      payment_uuid,
      p_commission_id,
      commission_record.customer_id,
      p_provider,
      p_provider_payment_id,
      p_provider_idempotency_key,
      p_kind,
      generated_attempt_number,
      p_status,
      p_currency,
      p_amount_minor,
      p_refunded_minor,
      p_provider_created_at,
      p_provider_created_at,
      case
        when p_status in ('succeeded', 'partially_refunded', 'refunded') then p_provider_created_at
        else null
      end,
      nullif(p_failure_code, '')
    )
    returning * into payment_record;

    created_payment := true;
    old_status := null;
  end if;

  should_apply_event := created_payment
    or payment_record.last_provider_event_at is null
    or p_provider_created_at > payment_record.last_provider_event_at
    or (
      p_status = 'succeeded'
      and private.payment_status_rank(payment_record.status)
        < private.payment_status_rank('succeeded')
    )
    or (
      p_provider_created_at = payment_record.last_provider_event_at
      and private.payment_status_rank(p_status)
        > private.payment_status_rank(payment_record.status)
    );

  if not created_payment and should_apply_event and payment_record.status <> p_status then
    allowed_transition := case
      when payment_record.status = 'not_started'
        then p_status in ('pending', 'processing', 'succeeded', 'failed', 'cancelled')
      when payment_record.status = 'pending'
        then p_status in ('processing', 'succeeded', 'failed', 'cancelled')
      when payment_record.status = 'processing'
        then p_status in ('succeeded', 'failed', 'cancelled')
      when payment_record.status = 'failed'
        then p_status in ('pending', 'processing', 'succeeded')
      when payment_record.status = 'cancelled'
        then p_status in ('pending', 'processing', 'succeeded')
      when payment_record.status = 'succeeded'
        then p_status in ('partially_refunded', 'refunded')
      when payment_record.status = 'partially_refunded'
        then p_status in ('partially_refunded', 'refunded')
      else false
    end;

    if not allowed_transition then
      should_apply_event := false;
    end if;
  end if;

  if not created_payment and should_apply_event then
    update public.payments
    set provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id),
        provider_created_at = coalesce(provider_created_at, p_provider_created_at),
        status = p_status,
        refunded_minor = p_refunded_minor,
        last_provider_event_at = p_provider_created_at,
        captured_at = case
          when p_status in ('succeeded', 'partially_refunded', 'refunded')
            then coalesce(captured_at, p_provider_created_at)
          else captured_at
        end,
        failure_code = nullif(p_failure_code, '')
    where id = payment_uuid
    returning * into payment_record;
  end if;

  insert into private.payment_webhook_events (
    provider,
    provider_event_id,
    event_type,
    domain_event,
    payload_sha256,
    sanitized_payload,
    payment_id,
    signature_verified_at,
    provider_created_at
  )
  values (
    p_provider,
    p_provider_event_id,
    p_event_type,
    domain_event_value,
    p_payload_sha256,
    p_sanitized_payload,
    payment_uuid,
    now(),
    p_provider_created_at
  );

  if (
    created_payment
    or (should_apply_event and old_status <> p_status)
  ) then
    insert into public.payment_status_history (
      payment_id,
      from_status,
      to_status,
      event,
      provider_event_id,
      occurred_at
    )
    values (
      payment_uuid,
      old_status,
      p_status,
      domain_event_value,
      p_provider_event_id,
      p_provider_created_at
    );
  end if;

  if (
    created_payment
    or (should_apply_event and old_status <> p_status)
  ) and p_kind = 'final' and p_status = 'succeeded' then
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
      commission_record.customer_id,
      'payment_received',
      'Payment received',
      'Your verified final payment has been received.',
      'payment',
      payment_uuid,
      'payment-event:' || p_provider::text || ':' || p_provider_event_id
    )
    on conflict (recipient_id, dedupe_key) do nothing;
  end if;

  if p_kind = 'final'
    and p_status = 'succeeded'
    and payment_record.status = 'succeeded'
  then
    for other_payment in
      select payments.id, payments.status
      from public.payments
      where payments.commission_id = p_commission_id
        and payments.kind = 'final'
        and payments.id <> payment_uuid
        and payments.status in ('not_started', 'pending', 'processing')
      for update
    loop
      update public.payments
      set status = 'cancelled'
      where id = other_payment.id;

      insert into public.payment_status_history (
        payment_id,
        from_status,
        to_status,
        event,
        provider_event_id,
        occurred_at
      )
      values (
        other_payment.id,
        other_payment.status,
        'cancelled',
        'payment_cancelled',
        'superseded-by-success:' || p_provider_event_id,
        p_provider_created_at
      )
      on conflict (payment_id, provider_event_id, to_status) do nothing;
    end loop;

    select count(*)::integer
    into successful_payment_count
    from public.payments as successful_payments
    where successful_payments.commission_id = p_commission_id
      and successful_payments.kind = 'final'
      and successful_payments.status = 'succeeded';

    if successful_payment_count > 1
      and commission_record.status <> 'disputed'
    then
      update public.commissions
      set status = 'disputed'
      where id = commission_record.id;

      insert into public.commission_status_history (
        commission_id,
        from_status,
        to_status,
        actor,
        changed_by,
        reason,
        metadata,
        idempotency_key
      )
      values (
        commission_record.id,
        commission_record.status,
        'disputed',
        'system',
        null,
        'Multiple verified final payments require review',
        jsonb_build_object(
          'payment_id', payment_uuid,
          'provider_event_id', p_provider_event_id,
          'successful_payment_count', successful_payment_count
        ),
        'duplicate-final-payment:' || p_provider_event_id
      );

      commission_record.status := 'disputed';
    end if;
  end if;

  if p_status = 'succeeded'
    and payment_record.status = 'succeeded'
    and commission_record.status = 'cancelled'
  then
    update public.commissions
    set status = 'disputed'
    where id = commission_record.id;

    insert into public.commission_status_history (
      commission_id,
      from_status,
      to_status,
      actor,
      changed_by,
      reason,
      metadata,
      idempotency_key
    )
    values (
      commission_record.id,
      'cancelled',
      'disputed',
      'system',
      null,
      'Verified late payment received after cancellation',
      jsonb_build_object(
        'payment_id', payment_uuid,
        'provider_event_id', p_provider_event_id
      ),
      'late-payment:' || p_provider_event_id
    );

    commission_record.status := 'disputed';
  end if;

  return query select payment_uuid, created_payment, false;
end;
$$;

create or replace function public.record_stripe_refund_event(
  p_provider_event_id text,
  p_event_type text,
  p_payload_sha256 text,
  p_payment_id uuid,
  p_provider_payment_id text,
  p_provider_refund_id text,
  p_refund_status text,
  p_currency text,
  p_amount_minor bigint,
  p_provider_created_at timestamptz,
  p_safe_payload jsonb default '{}'::jsonb
)
returns table (
  refund_event_id uuid,
  payment_id uuid,
  cumulative_refunded_minor bigint,
  resulting_payment_status public.payment_status,
  resulting_commission_status public.commission_status,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_event private.stripe_refund_events%rowtype;
  payment_record public.payments%rowtype;
  commission_record public.commissions%rowtype;
  event_uuid uuid := gen_random_uuid();
  calculated_refunded_minor bigint;
  derived_refunded_minor bigint;
  derived_payment_status public.payment_status;
  history_event public.payment_event;
  has_blocking_refund boolean;
  prior_commission_status public.commission_status;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_payment_id is null
    or p_provider_event_id is null
    or char_length(p_provider_event_id) not between 1 and 255
    or p_event_type is null
    or char_length(p_event_type) not between 1 and 200
    or p_event_type = 'charge.refunded'
    or p_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_provider_payment_id is null
    or char_length(p_provider_payment_id) not between 1 and 255
    or p_provider_refund_id is null
    or char_length(p_provider_refund_id) not between 1 and 255
    or p_refund_status not in (
      'pending',
      'requires_action',
      'succeeded',
      'failed',
      'canceled'
    )
    or p_currency !~ '^[A-Z]{3}$'
    or p_amount_minor <= 0
    or p_amount_minor > 99999999
    or p_provider_created_at is null
    or not private.is_safe_stripe_payload(p_safe_payload)
  then
    raise exception using errcode = '22023', message = 'verified Stripe refund fields are invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stripe-event:' || p_provider_event_id, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stripe-refund:' || p_provider_refund_id, 0)
  );

  perform private.register_stripe_event_receipt(
    p_provider_event_id,
    'refund',
    p_event_type,
    p_payload_sha256,
    p_provider_created_at
  );

  select events.*
  into existing_event
  from private.stripe_refund_events as events
  where events.provider_event_id = p_provider_event_id;

  if found then
    if existing_event.payment_id is distinct from p_payment_id
      or existing_event.provider_payment_id is distinct from p_provider_payment_id
      or existing_event.provider_refund_id is distinct from p_provider_refund_id
      or existing_event.refund_status is distinct from p_refund_status
      or existing_event.currency is distinct from p_currency
      or existing_event.amount_minor is distinct from p_amount_minor
      or existing_event.safe_payload is distinct from p_safe_payload
    then
      raise exception using errcode = '22023', message = 'duplicate refund event has different immutable inputs';
    end if;

    select payments.*
    into payment_record
    from public.payments
    where payments.id = existing_event.payment_id;

    select commissions.*
    into commission_record
    from public.commissions
    where commissions.id = payment_record.commission_id;

    return query
    select
      existing_event.id,
      payment_record.id,
      payment_record.refunded_minor,
      payment_record.status,
      commission_record.status,
      false;
    return;
  end if;

  select payments.*
  into payment_record
  from public.payments
  where payments.id = p_payment_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'payment not found';
  end if;

  select commissions.*
  into commission_record
  from public.commissions
  where commissions.id = payment_record.commission_id
  for update;

  select payments.*
  into payment_record
  from public.payments
  where payments.id = p_payment_id
  for update;

  if payment_record.provider <> 'stripe'
    or payment_record.kind <> 'final'
    or payment_record.provider_payment_id is distinct from p_provider_payment_id
    or payment_record.currency is distinct from p_currency
    or p_amount_minor > payment_record.amount_minor
  then
    raise exception using
      errcode = '22023',
      message = 'refund event does not match stored payment truth';
  end if;

  if exists (
    select 1
    from private.stripe_refund_events as prior_events
    where prior_events.provider_refund_id = p_provider_refund_id
      and (
        prior_events.payment_id is distinct from p_payment_id
        or prior_events.provider_payment_id is distinct from p_provider_payment_id
        or prior_events.currency is distinct from p_currency
        or prior_events.amount_minor is distinct from p_amount_minor
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Stripe refund ID changed immutable monetary fields';
  end if;

  insert into private.stripe_refund_events (
    id,
    provider_event_id,
    payment_id,
    provider_refund_id,
    provider_payment_id,
    refund_status,
    currency,
    amount_minor,
    safe_payload,
    signature_verified_at,
    provider_created_at
  )
  values (
    event_uuid,
    p_provider_event_id,
    p_payment_id,
    p_provider_refund_id,
    p_provider_payment_id,
    p_refund_status,
    p_currency,
    p_amount_minor,
    p_safe_payload,
    now(),
    p_provider_created_at
  );

  calculated_refunded_minor := private.derived_cumulative_refund(p_payment_id);

  derived_refunded_minor := greatest(
    payment_record.refunded_minor,
    calculated_refunded_minor
  );

  if derived_refunded_minor > payment_record.amount_minor then
    raise exception using
      errcode = '22023',
      message = 'cumulative refunds exceed stored payment amount';
  end if;

  derived_payment_status := case
    when derived_refunded_minor = payment_record.amount_minor
      and derived_refunded_minor > 0
      then 'refunded'::public.payment_status
    when derived_refunded_minor > 0
      then 'partially_refunded'::public.payment_status
    else payment_record.status
  end;

  if derived_refunded_minor > payment_record.refunded_minor
    or derived_payment_status is distinct from payment_record.status
  then
    history_event := case
      when derived_payment_status = 'refunded'
        then 'refund_succeeded'::public.payment_event
      else 'partial_refund_succeeded'::public.payment_event
    end;

    update public.payments
    set refunded_minor = derived_refunded_minor,
        status = derived_payment_status
    where id = p_payment_id;

    if derived_payment_status is distinct from payment_record.status then
      insert into public.payment_status_history (
        payment_id,
        from_status,
        to_status,
        event,
        provider_event_id,
        occurred_at
      )
      values (
        p_payment_id,
        payment_record.status,
        derived_payment_status,
        history_event,
        p_provider_event_id,
        p_provider_created_at
      );
    end if;

    payment_record.refunded_minor := derived_refunded_minor;
    payment_record.status := derived_payment_status;
  end if;

  has_blocking_refund := private.payment_has_blocking_refund(p_payment_id);
  prior_commission_status := commission_record.status;

  if (derived_refunded_minor > 0 or has_blocking_refund)
    and commission_record.status in ('paid', 'delivered', 'aftercare')
  then
    update public.commissions
    set status = 'disputed'
    where id = commission_record.id;
    commission_record.status := 'disputed';
  elsif derived_refunded_minor = 0
    and not has_blocking_refund
    and commission_record.status = 'disputed'
    and payment_record.status = 'succeeded'
    and not private.payment_has_blocking_dispute(p_payment_id)
    and exists (
      select 1
      from public.commission_status_history
      where commission_id = commission_record.id
        and to_status = 'disputed'
        and metadata ->> 'provider_refund_id' = p_provider_refund_id
    )
  then
    update public.commissions
    set status = 'paid'
    where id = commission_record.id;
    commission_record.status := 'paid';
  end if;

  if commission_record.status is distinct from prior_commission_status then
    insert into public.commission_status_history (
      commission_id,
      from_status,
      to_status,
      actor,
      changed_by,
      reason,
      metadata,
      idempotency_key
    )
    values (
      commission_record.id,
      prior_commission_status,
      commission_record.status,
      'system',
      null,
      case
        when commission_record.status = 'disputed'
          then 'Verified Stripe refund requires attention'
        else 'Verified Stripe refund attempt resolved without refund'
      end,
      jsonb_build_object(
        'refund_event_id', event_uuid,
        'provider_refund_id', p_provider_refund_id,
        'refund_status', p_refund_status,
        'cumulative_refunded_minor', derived_refunded_minor,
        'ambiguous_or_pending', has_blocking_refund
      ),
      p_provider_event_id
    );
  end if;

  return query
  select
    event_uuid,
    payment_record.id,
    payment_record.refunded_minor,
    payment_record.status,
    commission_record.status,
    true;
end;
$$;

create or replace function public.record_stripe_charge_refunded_event(
  p_provider_event_id text,
  p_event_type text,
  p_payload_sha256 text,
  p_payment_id uuid,
  p_provider_payment_id text,
  p_provider_charge_id text,
  p_currency text,
  p_cumulative_refunded_minor bigint,
  p_provider_created_at timestamptz,
  p_safe_payload jsonb default '{}'::jsonb
)
returns table (
  charge_refund_event_id uuid,
  payment_id uuid,
  cumulative_refunded_minor bigint,
  resulting_payment_status public.payment_status,
  resulting_commission_status public.commission_status,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_event private.stripe_charge_refund_events%rowtype;
  payment_record public.payments%rowtype;
  commission_record public.commissions%rowtype;
  event_uuid uuid := gen_random_uuid();
  derived_refunded_minor bigint;
  derived_payment_status public.payment_status;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_provider_event_id is null
    or char_length(p_provider_event_id) not between 1 and 255
    or p_event_type <> 'charge.refunded'
    or p_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_payment_id is null
    or p_provider_payment_id is null
    or char_length(p_provider_payment_id) not between 1 and 255
    or p_provider_charge_id is null
    or char_length(p_provider_charge_id) not between 1 and 255
    or p_currency !~ '^[A-Z]{3}$'
    or p_cumulative_refunded_minor <= 0
    or p_cumulative_refunded_minor > 99999999
    or p_provider_created_at is null
    or not private.is_safe_stripe_payload(p_safe_payload)
  then
    raise exception using
      errcode = '22023',
      message = 'verified aggregate Stripe refund fields are invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stripe-event:' || p_provider_event_id, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stripe-charge-refund:' || p_provider_charge_id, 0)
  );

  perform private.register_stripe_event_receipt(
    p_provider_event_id,
    'refund',
    p_event_type,
    p_payload_sha256,
    p_provider_created_at
  );

  select events.*
  into existing_event
  from private.stripe_charge_refund_events as events
  where events.provider_event_id = p_provider_event_id;

  if found then
    if existing_event.payment_id is distinct from p_payment_id
      or existing_event.provider_payment_id is distinct from p_provider_payment_id
      or existing_event.provider_charge_id is distinct from p_provider_charge_id
      or existing_event.currency is distinct from p_currency
      or existing_event.cumulative_refunded_minor is distinct from p_cumulative_refunded_minor
      or existing_event.safe_payload is distinct from p_safe_payload
    then
      raise exception using
        errcode = '22023',
        message = 'duplicate aggregate refund event has different immutable inputs';
    end if;

    select payments.*
    into payment_record
    from public.payments
    where payments.id = existing_event.payment_id;

    select commissions.*
    into commission_record
    from public.commissions
    where commissions.id = payment_record.commission_id;

    return query
    select
      existing_event.id,
      payment_record.id,
      payment_record.refunded_minor,
      payment_record.status,
      commission_record.status,
      false;
    return;
  end if;

  select payments.*
  into payment_record
  from public.payments
  where payments.id = p_payment_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'payment not found';
  end if;

  select commissions.*
  into commission_record
  from public.commissions
  where commissions.id = payment_record.commission_id
  for update;

  select payments.*
  into payment_record
  from public.payments
  where payments.id = p_payment_id
  for update;

  if payment_record.provider <> 'stripe'
    or payment_record.kind <> 'final'
    or payment_record.provider_payment_id is distinct from p_provider_payment_id
    or payment_record.currency is distinct from p_currency
    or p_cumulative_refunded_minor > payment_record.amount_minor
  then
    raise exception using
      errcode = '22023',
      message = 'aggregate refund event does not match stored payment truth';
  end if;

  if exists (
    select 1
    from private.stripe_charge_refund_events as prior_events
    where prior_events.provider_charge_id = p_provider_charge_id
      and (
        prior_events.payment_id is distinct from p_payment_id
        or prior_events.provider_payment_id is distinct from p_provider_payment_id
        or prior_events.currency is distinct from p_currency
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Stripe charge ID changed immutable payment fields';
  end if;

  insert into private.stripe_charge_refund_events (
    id,
    provider_event_id,
    payment_id,
    provider_charge_id,
    provider_payment_id,
    currency,
    cumulative_refunded_minor,
    safe_payload,
    signature_verified_at,
    provider_created_at
  )
  values (
    event_uuid,
    p_provider_event_id,
    p_payment_id,
    p_provider_charge_id,
    p_provider_payment_id,
    p_currency,
    p_cumulative_refunded_minor,
    p_safe_payload,
    now(),
    p_provider_created_at
  );

  derived_refunded_minor := greatest(
    payment_record.refunded_minor,
    private.derived_cumulative_refund(p_payment_id)
  );

  if derived_refunded_minor > payment_record.amount_minor then
    raise exception using
      errcode = '22023',
      message = 'aggregate refund exceeds stored payment amount';
  end if;

  derived_payment_status := case
    when derived_refunded_minor = payment_record.amount_minor
      then 'refunded'::public.payment_status
    else 'partially_refunded'::public.payment_status
  end;

  if derived_refunded_minor > payment_record.refunded_minor
    or derived_payment_status is distinct from payment_record.status
  then
    update public.payments
    set refunded_minor = derived_refunded_minor,
        status = derived_payment_status
    where id = p_payment_id;

    if derived_payment_status is distinct from payment_record.status then
      insert into public.payment_status_history (
        payment_id,
        from_status,
        to_status,
        event,
        provider_event_id,
        occurred_at
      )
      values (
        p_payment_id,
        payment_record.status,
        derived_payment_status,
        case
          when derived_payment_status = 'refunded'
            then 'refund_succeeded'::public.payment_event
          else 'partial_refund_succeeded'::public.payment_event
        end,
        p_provider_event_id,
        p_provider_created_at
      );
    end if;

    payment_record.refunded_minor := derived_refunded_minor;
    payment_record.status := derived_payment_status;
  end if;

  if derived_refunded_minor > 0
    and commission_record.status in ('paid', 'delivered', 'aftercare')
  then
    update public.commissions
    set status = 'disputed'
    where id = commission_record.id;

    insert into public.commission_status_history (
      commission_id,
      from_status,
      to_status,
      actor,
      changed_by,
      reason,
      metadata,
      idempotency_key
    )
    values (
      commission_record.id,
      commission_record.status,
      'disputed',
      'system',
      null,
      'Verified Stripe aggregate refund received',
      jsonb_build_object(
        'charge_refund_event_id', event_uuid,
        'provider_charge_id', p_provider_charge_id,
        'cumulative_refunded_minor', derived_refunded_minor
      ),
      p_provider_event_id
    );

    commission_record.status := 'disputed';
  end if;

  return query
  select
    event_uuid,
    payment_record.id,
    payment_record.refunded_minor,
    payment_record.status,
    commission_record.status,
    true;
end;
$$;

create or replace function public.record_stripe_dispute_event(
  p_provider_event_id text,
  p_event_type text,
  p_payload_sha256 text,
  p_payment_id uuid,
  p_provider_payment_id text,
  p_provider_dispute_id text,
  p_dispute_status text,
  p_currency text,
  p_amount_minor bigint,
  p_reason text,
  p_provider_created_at timestamptz,
  p_safe_payload jsonb default '{}'::jsonb
)
returns table (
  dispute_event_id uuid,
  payment_id uuid,
  effective_dispute_status text,
  resulting_commission_status public.commission_status,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_event private.stripe_dispute_events%rowtype;
  payment_record public.payments%rowtype;
  commission_record public.commissions%rowtype;
  event_uuid uuid := gen_random_uuid();
  derived_dispute_status text;
  has_blocking_dispute boolean;
  prior_commission_status public.commission_status;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_payment_id is null
    or p_provider_event_id is null
    or char_length(p_provider_event_id) not between 1 and 255
    or p_event_type is null
    or char_length(p_event_type) not between 1 and 200
    or p_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_provider_payment_id is null
    or char_length(p_provider_payment_id) not between 1 and 255
    or p_provider_dispute_id is null
    or char_length(p_provider_dispute_id) not between 1 and 255
    or p_dispute_status not in (
      'warning_needs_response',
      'warning_under_review',
      'warning_closed',
      'needs_response',
      'under_review',
      'won',
      'lost',
      'prevented'
    )
    or p_currency !~ '^[A-Z]{3}$'
    or p_amount_minor <= 0
    or p_amount_minor > 99999999
    or (p_reason is not null and char_length(p_reason) > 100)
    or p_provider_created_at is null
    or not private.is_safe_stripe_payload(p_safe_payload)
  then
    raise exception using errcode = '22023', message = 'verified Stripe dispute fields are invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stripe-event:' || p_provider_event_id, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stripe-dispute:' || p_provider_dispute_id, 0)
  );

  perform private.register_stripe_event_receipt(
    p_provider_event_id,
    'dispute',
    p_event_type,
    p_payload_sha256,
    p_provider_created_at
  );

  select events.*
  into existing_event
  from private.stripe_dispute_events as events
  where events.provider_event_id = p_provider_event_id;

  if found then
    if existing_event.payment_id is distinct from p_payment_id
      or existing_event.provider_payment_id is distinct from p_provider_payment_id
      or existing_event.provider_dispute_id is distinct from p_provider_dispute_id
      or existing_event.dispute_status is distinct from p_dispute_status
      or existing_event.currency is distinct from p_currency
      or existing_event.amount_minor is distinct from p_amount_minor
      or existing_event.reason is distinct from nullif(p_reason, '')
      or existing_event.safe_payload is distinct from p_safe_payload
    then
      raise exception using errcode = '22023', message = 'duplicate dispute event has different immutable inputs';
    end if;

    select payments.*
    into payment_record
    from public.payments
    where payments.id = existing_event.payment_id;

    select commissions.*
    into commission_record
    from public.commissions
    where commissions.id = payment_record.commission_id;

    with max_time as (
      select max(dispute_events.provider_created_at) as provider_created_at
      from private.stripe_dispute_events as dispute_events
      where dispute_events.payment_id = p_payment_id
        and dispute_events.provider_dispute_id = p_provider_dispute_id
    )
    select case
      when count(distinct events.dispute_status) > 1 then 'ambiguous'
      else min(events.dispute_status)
    end
    into derived_dispute_status
    from private.stripe_dispute_events as events
    cross join max_time
    where events.payment_id = p_payment_id
      and events.provider_dispute_id = p_provider_dispute_id
      and events.provider_created_at = max_time.provider_created_at;

    return query
    select
      existing_event.id,
      payment_record.id,
      derived_dispute_status,
      commission_record.status,
      false;
    return;
  end if;

  select payments.*
  into payment_record
  from public.payments
  where payments.id = p_payment_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'payment not found';
  end if;

  select commissions.*
  into commission_record
  from public.commissions
  where commissions.id = payment_record.commission_id
  for update;

  select payments.*
  into payment_record
  from public.payments
  where payments.id = p_payment_id
  for update;

  if payment_record.provider <> 'stripe'
    or payment_record.kind <> 'final'
    or payment_record.provider_payment_id is distinct from p_provider_payment_id
    or payment_record.currency is distinct from p_currency
    or p_amount_minor > payment_record.amount_minor
  then
    raise exception using
      errcode = '22023',
      message = 'dispute event does not match stored payment truth';
  end if;

  if exists (
    select 1
    from private.stripe_dispute_events as prior_events
    where prior_events.provider_dispute_id = p_provider_dispute_id
      and (
        prior_events.payment_id is distinct from p_payment_id
        or prior_events.provider_payment_id is distinct from p_provider_payment_id
        or prior_events.currency is distinct from p_currency
        or prior_events.amount_minor is distinct from p_amount_minor
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Stripe dispute ID changed immutable monetary fields';
  end if;

  insert into private.stripe_dispute_events (
    id,
    provider_event_id,
    payment_id,
    provider_dispute_id,
    provider_payment_id,
    dispute_status,
    currency,
    amount_minor,
    reason,
    safe_payload,
    signature_verified_at,
    provider_created_at
  )
  values (
    event_uuid,
    p_provider_event_id,
    p_payment_id,
    p_provider_dispute_id,
    p_provider_payment_id,
    p_dispute_status,
    p_currency,
    p_amount_minor,
    nullif(p_reason, ''),
    p_safe_payload,
    now(),
    p_provider_created_at
  );

  with max_time as (
    select max(dispute_events.provider_created_at) as provider_created_at
    from private.stripe_dispute_events as dispute_events
    where dispute_events.payment_id = p_payment_id
      and dispute_events.provider_dispute_id = p_provider_dispute_id
  )
  select case
    when count(distinct events.dispute_status) > 1 then 'ambiguous'
    else min(events.dispute_status)
  end
  into derived_dispute_status
  from private.stripe_dispute_events as events
  cross join max_time
  where events.payment_id = p_payment_id
    and events.provider_dispute_id = p_provider_dispute_id
    and events.provider_created_at = max_time.provider_created_at;

  has_blocking_dispute := private.payment_has_blocking_dispute(p_payment_id);
  prior_commission_status := commission_record.status;

  if has_blocking_dispute
    and commission_record.status in ('paid', 'delivered', 'aftercare')
  then
    update public.commissions
    set status = 'disputed'
    where id = commission_record.id;
    commission_record.status := 'disputed';
  elsif not has_blocking_dispute
    and commission_record.status = 'disputed'
    and payment_record.status = 'succeeded'
    and payment_record.refunded_minor = 0
    and exists (
      select 1
      from public.commission_status_history
      where commission_id = commission_record.id
        and to_status = 'disputed'
        and metadata ->> 'provider_dispute_id' = p_provider_dispute_id
    )
  then
    update public.commissions
    set status = 'paid'
    where id = commission_record.id;
    commission_record.status := 'paid';
  end if;

  if commission_record.status is distinct from prior_commission_status then
    insert into public.commission_status_history (
      commission_id,
      from_status,
      to_status,
      actor,
      changed_by,
      reason,
      metadata,
      idempotency_key
    )
    values (
      commission_record.id,
      prior_commission_status,
      commission_record.status,
      'system',
      null,
      case
        when commission_record.status = 'disputed'
          then 'Verified Stripe dispute requires attention'
        else 'All verified Stripe disputes resolved'
      end,
      jsonb_build_object(
        'dispute_event_id', event_uuid,
        'provider_dispute_id', p_provider_dispute_id,
        'effective_dispute_status', derived_dispute_status
      ),
      p_provider_event_id
    );
  end if;

  return query
  select
    event_uuid,
    payment_record.id,
    derived_dispute_status,
    commission_record.status,
    true;
end;
$$;

create or replace function public.open_aftercare_case(
  p_commission_id uuid,
  p_client_request_id uuid,
  p_category text,
  p_subject text,
  p_description text,
  p_idempotency_key text
)
returns table (
  aftercare_case_id uuid,
  case_status public.aftercare_status,
  resulting_commission_status public.commission_status,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_application_user_id();
  commission_record public.commissions%rowtype;
  existing_case public.aftercare_cases%rowtype;
  case_uuid uuid := gen_random_uuid();
  rate_allowed boolean;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_commission_id is null
    or p_client_request_id is null
    or p_category is null
    or p_category !~ '^[a-z][a-z0-9_]{1,49}$'
    or p_subject is null
    or char_length(btrim(p_subject)) not between 1 and 200
    or p_description is null
    or char_length(btrim(p_description)) not between 10 and 5000
    or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 1 and 255
    or p_idempotency_key !~ '^[!-~]+$'
  then
    raise exception using errcode = '22023', message = 'aftercare request inputs are invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'aftercare:' || actor_id::text || ':' || p_idempotency_key,
      0
    )
  );

  select cases.*
  into existing_case
  from public.aftercare_cases as cases
  where cases.customer_id = actor_id
    and cases.idempotency_key = p_idempotency_key;

  if found then
    if existing_case.commission_id is distinct from p_commission_id
      or existing_case.client_request_id is distinct from p_client_request_id
      or existing_case.category is distinct from p_category
      or existing_case.subject is distinct from btrim(p_subject)
      or existing_case.description is distinct from btrim(p_description)
    then
      raise exception using errcode = '22023', message = 'aftercare idempotency key was reused';
    end if;

    select commissions.*
    into commission_record
    from public.commissions
    where commissions.id = existing_case.commission_id;

    return query
    select existing_case.id, existing_case.status, commission_record.status, false;
    return;
  end if;

  select commissions.*
  into commission_record
  from public.commissions
  where commissions.id = p_commission_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'commission not found';
  end if;
  if commission_record.customer_id is distinct from actor_id then
    raise exception using errcode = '42501', message = 'commission does not belong to the customer';
  end if;
  if commission_record.status not in ('delivered', 'aftercare') then
    raise exception using errcode = '55000', message = 'commission is not eligible for aftercare';
  end if;

  select result.is_allowed
  into rate_allowed
  from private.consume_rate_limit_internal(
    'aftercare_open',
    'user:' || actor_id::text,
    1
  ) as result;

  if not rate_allowed then
    raise exception using errcode = 'P0001', message = 'rate limit exceeded';
  end if;

  if commission_record.status = 'delivered' then
    update public.commissions
    set status = 'aftercare'
    where id = p_commission_id;

    insert into public.commission_status_history (
      commission_id,
      from_status,
      to_status,
      actor,
      changed_by,
      reason,
      metadata,
      idempotency_key
    )
    values (
      p_commission_id,
      'delivered',
      'aftercare',
      'customer',
      actor_id,
      'Customer opened first aftercare case',
      jsonb_build_object('client_request_id', p_client_request_id),
      'aftercare-open:' || p_idempotency_key
    );

    commission_record.status := 'aftercare';
  end if;

  insert into public.aftercare_cases (
    id,
    commission_id,
    customer_id,
    client_request_id,
    idempotency_key,
    category,
    subject,
    description,
    status,
    opened_by
  )
  values (
    case_uuid,
    p_commission_id,
    actor_id,
    p_client_request_id,
    p_idempotency_key,
    p_category,
    btrim(p_subject),
    btrim(p_description),
    'open',
    actor_id
  );

  return query
  select case_uuid, 'open'::public.aftercare_status, commission_record.status, true;
end;
$$;

create or replace function public.complete_aftercare_case(
  p_aftercare_case_id uuid,
  p_resolution_summary text,
  p_idempotency_key text
)
returns table (
  completion_id uuid,
  commission_id uuid,
  completed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_application_user_id();
  case_record public.aftercare_cases%rowtype;
  existing_completion public.aftercare_completions%rowtype;
  completion_uuid uuid := gen_random_uuid();
  commission_status_value public.commission_status;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'idempotency key is required';
  end if;
  if char_length(p_idempotency_key) not between 1 and 255
    or p_idempotency_key !~ '^[!-~]+$'
  then
    raise exception using errcode = '22023', message = 'idempotency key is invalid';
  end if;
  if p_resolution_summary is null
    or char_length(btrim(p_resolution_summary)) not between 10 and 5000
  then
    raise exception using errcode = '22023', message = 'resolution summary must be between 10 and 5000 characters';
  end if;

  select cases.*
  into case_record
  from public.aftercare_cases as cases
  where cases.id = p_aftercare_case_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'aftercare case not found';
  end if;

  if actor_id <> case_record.customer_id and not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'aftercare case does not belong to the current actor';
  end if;

  select completions.*
  into existing_completion
  from public.aftercare_completions as completions
  where completions.idempotency_key = p_idempotency_key;

  if found then
    if existing_completion.aftercare_case_id is distinct from p_aftercare_case_id
      or existing_completion.resolution_summary is distinct from btrim(p_resolution_summary)
    then
      raise exception using errcode = '22023', message = 'idempotency key was reused with different aftercare inputs';
    end if;
    return query select existing_completion.id, case_record.commission_id, false;
    return;
  end if;

  if case_record.status not in ('open', 'in_progress') then
    raise exception using errcode = '55000', message = 'aftercare case is not completable';
  end if;

  insert into public.aftercare_completions (
    id,
    aftercare_case_id,
    idempotency_key,
    resolution_summary,
    completion_snapshot,
    completed_by
  )
  values (
    completion_uuid,
    p_aftercare_case_id,
    p_idempotency_key,
    btrim(p_resolution_summary),
    jsonb_build_object(
      'category', case_record.category,
      'subject', case_record.subject,
      'opened_at', case_record.opened_at
    ),
    actor_id
  );

  update public.aftercare_cases
  set status = 'completed',
      completed_at = now()
  where id = p_aftercare_case_id;

  select status
  into commission_status_value
  from public.commissions
  where id = case_record.commission_id
  for update;

  if actor_id = case_record.customer_id
    and commission_status_value = 'aftercare'
    and not exists (
      select 1
      from public.aftercare_cases as open_cases
      where open_cases.commission_id = case_record.commission_id
        and open_cases.status in ('open', 'in_progress')
    )
  then
    update public.commissions
    set status = 'completed',
        completed_at = coalesce(completed_at, now())
    where id = case_record.commission_id;

    insert into public.commission_status_history (
      commission_id,
      from_status,
      to_status,
      actor,
      changed_by,
      reason,
      metadata,
      idempotency_key
    )
    values (
      case_record.commission_id,
      'aftercare',
      'completed',
      'customer',
      actor_id,
      'All aftercare requests completed',
      jsonb_build_object(
        'aftercare_case_id', p_aftercare_case_id,
        'aftercare_completion_id', completion_uuid
      ),
      p_idempotency_key
    );
  end if;

  return query select completion_uuid, case_record.commission_id, true;
end;
$$;

create or replace function public.admin_list_ranked_inbox(
  p_limit integer default 25,
  p_before_activity_at timestamptz default null,
  p_before_conversation_id uuid default null,
  p_search text default null,
  p_status public.conversation_status default null,
  p_unread_only boolean default false
)
returns table (
  conversation_id uuid,
  design_request_id uuid,
  customer_id uuid,
  customer_display_name text,
  subject text,
  status public.conversation_status,
  latest_message_id uuid,
  latest_sender_kind public.message_kind,
  latest_preview text,
  activity_at timestamptz,
  unread_count bigint,
  has_more boolean,
  next_activity_at timestamptz,
  next_conversation_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_application_user_id();
  normalized_search text := nullif(btrim(p_search), '');
begin
  if actor_id is null or not public.is_active_admin() then
    raise exception using errcode = '42501', message = 'active confirmed admin required';
  end if;
  if p_limit not between 1 and 50
    or p_unread_only is null
    or (p_search is not null and char_length(p_search) > 100)
    or ((p_before_activity_at is null) <> (p_before_conversation_id is null))
  then
    raise exception using errcode = '22023', message = 'inbox query parameters are invalid';
  end if;

  return query
  with inbox_rows as (
    select
      conversations.id as conversation_id,
      conversations.design_request_id,
      conversations.customer_id,
      coalesce(
        nullif(btrim(profiles.display_name), ''),
        'Customer'
      ) as customer_display_name,
      conversations.subject,
      conversations.status,
      messages.id as latest_message_id,
      messages.sender_kind as latest_sender_kind,
      case
        when messages.id is null then null
        when btrim(messages.body) <> '' then left(
          regexp_replace(btrim(messages.body), '[[:space:]]+', ' ', 'g'),
          160
        )
        when attachment_counts.attachment_count = 1 then 'Attachment'
        when attachment_counts.attachment_count > 1
          then attachment_counts.attachment_count::text || ' attachments'
        else 'Message'
      end as latest_preview,
      coalesce(
        conversations.last_message_at,
        conversations.created_at
      ) as activity_at,
      unread_counts.unread_count
    from public.conversations
    inner join public.design_requests
      on design_requests.id = conversations.design_request_id
    inner join public.profiles
      on profiles.id = conversations.customer_id
    left join public.messages
      on messages.id = conversations.last_message_id
      and messages.conversation_id = conversations.id
    left join public.conversation_read_markers
      on conversation_read_markers.conversation_id = conversations.id
      and conversation_read_markers.user_id = actor_id
    left join lateral (
      select count(*)::integer as attachment_count
      from public.message_attachments
      where message_attachments.message_id = messages.id
        and message_attachments.finalized_at is not null
    ) as attachment_counts on true
    left join lateral (
      select count(*)::bigint as unread_count
      from public.messages as unread_messages
      where unread_messages.conversation_id = conversations.id
        and unread_messages.sender_id is distinct from actor_id
        and (
          conversation_read_markers.user_id is null
          or unread_messages.sent_at > conversation_read_markers.last_read_at
          or (
            unread_messages.sent_at = conversation_read_markers.last_read_at
            and unread_messages.id > coalesce(
              conversation_read_markers.last_read_message_id,
              '00000000-0000-0000-0000-000000000000'::uuid
            )
          )
        )
    ) as unread_counts on true
    where (p_status is null or conversations.status = p_status)
      and (
        p_before_activity_at is null
        or coalesce(
          conversations.last_message_at,
          conversations.created_at
        ) < p_before_activity_at
        or (
          coalesce(
            conversations.last_message_at,
            conversations.created_at
          ) = p_before_activity_at
          and conversations.id < p_before_conversation_id
        )
      )
      and (
        normalized_search is null
        or position(
          lower(normalized_search)
          in lower(concat_ws(
            ' ',
            profiles.display_name,
            conversations.subject,
            design_requests.reference_code,
            design_requests.title
          ))
        ) > 0
      )
  ),
  eligible_rows as (
    select *
    from inbox_rows
    where not p_unread_only or inbox_rows.unread_count > 0
  ),
  ranked_rows as (
    select
      eligible_rows.*,
      row_number() over (
        order by eligible_rows.activity_at desc, eligible_rows.conversation_id desc
      ) as row_position
    from eligible_rows
    order by eligible_rows.activity_at desc, eligible_rows.conversation_id desc
    limit p_limit + 1
  ),
  page_metadata as (
    select
      count(*) > p_limit as has_more,
      (
        select cursor_row.activity_at
        from ranked_rows as cursor_row
        where cursor_row.row_position = p_limit
      ) as next_activity_at,
      (
        select cursor_row.conversation_id
        from ranked_rows as cursor_row
        where cursor_row.row_position = p_limit
      ) as next_conversation_id
    from ranked_rows
  )
  select
    ranked_rows.conversation_id,
    ranked_rows.design_request_id,
    ranked_rows.customer_id,
    ranked_rows.customer_display_name,
    ranked_rows.subject,
    ranked_rows.status,
    ranked_rows.latest_message_id,
    ranked_rows.latest_sender_kind,
    ranked_rows.latest_preview,
    ranked_rows.activity_at,
    ranked_rows.unread_count,
    page_metadata.has_more,
    case
      when page_metadata.has_more then page_metadata.next_activity_at
      else null
    end,
    case
      when page_metadata.has_more then page_metadata.next_conversation_id
      else null
    end
  from ranked_rows
  cross join page_metadata
  where ranked_rows.row_position <= p_limit
  order by ranked_rows.activity_at desc, ranked_rows.conversation_id desc;
end;
$$;

create or replace function public.customer_list_history(
  p_limit integer default 25,
  p_before_occurred_at timestamptz default null,
  p_before_id uuid default null,
  p_before_type text default null,
  p_search text default null,
  p_types text[] default null
)
returns table (
  event_id uuid,
  event_type text,
  title text,
  description text,
  resource_type text,
  resource_id uuid,
  occurred_at timestamptz,
  has_more boolean,
  next_occurred_at timestamptz,
  next_id uuid,
  next_type text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_application_user_id();
  normalized_search text := nullif(btrim(p_search), '');
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_limit not between 1 and 50
    or (p_search is not null and char_length(p_search) > 100)
    or (p_types is not null and cardinality(p_types) > 20)
    or (
      num_nonnulls(
        p_before_occurred_at,
        p_before_id,
        p_before_type
      ) not in (0, 3)
    )
  then
    raise exception using errcode = '22023', message = 'history query parameters are invalid';
  end if;

  return query
  with all_history as (
    select
      requests.id as event_id,
      'design_request_created'::text as event_type,
      'Design request submitted'::text as title,
      requests.title::text as description,
      'design_request'::text as resource_type,
      requests.id as resource_id,
      coalesce(requests.submitted_at, requests.created_at) as occurred_at
    from public.design_requests as requests
    where requests.customer_id = actor_id

    union all

    select
      quote_events.id,
      'quote_' || quote_events.status::text,
      'Quote ' || replace(quote_events.status::text, '_', ' '),
      quotes.title,
      'quote',
      quotes.id,
      quote_events.occurred_at
    from public.quote_status_events as quote_events
    inner join public.quote_versions as quotes
      on quotes.id = quote_events.quote_version_id
    inner join public.design_requests as requests
      on requests.id = quotes.design_request_id
    where requests.customer_id = actor_id

    union all

    select
      acceptances.id,
      'quote_accepted',
      'Quote accepted',
      acceptances.accepted_title,
      'quote_acceptance',
      acceptances.id,
      acceptances.accepted_at
    from public.quote_acceptances as acceptances
    where acceptances.customer_id = actor_id

    union all

    select
      commissions.id,
      'commission_created',
      'Commission created',
      commissions.accepted_title,
      'commission',
      commissions.id,
      commissions.created_at
    from public.commissions
    where commissions.customer_id = actor_id

    union all

    select
      history.id,
      'commission_status',
      'Commission ' || replace(history.to_status::text, '_', ' '),
      'Commission status updated',
      'commission',
      history.commission_id,
      history.created_at
    from public.commission_status_history as history
    inner join public.commissions
      on commissions.id = history.commission_id
    where commissions.customer_id = actor_id

    union all

    select
      payment_history.id,
      'payment_status',
      'Payment ' || replace(payment_history.to_status::text, '_', ' '),
      'Final payment status updated',
      'payment',
      payment_history.payment_id,
      payment_history.occurred_at
    from public.payment_status_history as payment_history
    inner join public.payments
      on payments.id = payment_history.payment_id
    where payments.customer_id = actor_id

    union all

    select
      deliverables.id,
      'deliverable_released',
      'Deliverable ready',
      deliverables.title,
      'deliverable',
      deliverables.id,
      deliverables.released_at
    from public.deliverables
    where deliverables.customer_id = actor_id
      and deliverables.released_at is not null

    union all

    select
      cases.id,
      'aftercare_opened',
      'Aftercare request opened',
      cases.subject,
      'aftercare_case',
      cases.id,
      cases.opened_at
    from public.aftercare_cases as cases
    where cases.customer_id = actor_id

    union all

    select
      completions.id,
      'aftercare_completed',
      'Aftercare request completed',
      completions.resolution_summary,
      'aftercare_case',
      completions.aftercare_case_id,
      completions.completed_at
    from public.aftercare_completions as completions
    inner join public.aftercare_cases as cases
      on cases.id = completions.aftercare_case_id
    where cases.customer_id = actor_id

    union all

    select
      notifications.id,
      'notification_' || notifications.event::text,
      notifications.title,
      notifications.body,
      coalesce(notifications.resource_type, 'notification'),
      coalesce(notifications.resource_id, notifications.id),
      notifications.created_at
    from public.notifications
    where notifications.recipient_id = actor_id
  ),
  filtered_history as (
    select *
    from all_history
    where (p_types is null or all_history.event_type = any(p_types))
      and (
        normalized_search is null
        or position(
          lower(normalized_search)
          in lower(concat_ws(
            ' ',
            all_history.title,
            all_history.description,
            all_history.event_type
          ))
        ) > 0
      )
      and (
        p_before_occurred_at is null
        or all_history.occurred_at < p_before_occurred_at
        or (
          all_history.occurred_at = p_before_occurred_at
          and (
            all_history.event_id < p_before_id
            or (
              all_history.event_id = p_before_id
              and all_history.event_type < p_before_type
            )
          )
        )
      )
  ),
  ranked_history as (
    select
      filtered_history.*,
      row_number() over (
        order by occurred_at desc, event_id desc, event_type desc
      ) as row_position
    from filtered_history
    order by occurred_at desc, event_id desc, event_type desc
    limit p_limit + 1
  ),
  page_metadata as (
    select
      count(*) > p_limit as has_more,
      (
        select cursor_row.occurred_at
        from ranked_history as cursor_row
        where cursor_row.row_position = p_limit
      ) as next_occurred_at,
      (
        select cursor_row.event_id
        from ranked_history as cursor_row
        where cursor_row.row_position = p_limit
      ) as next_id,
      (
        select cursor_row.event_type
        from ranked_history as cursor_row
        where cursor_row.row_position = p_limit
      ) as next_type
    from ranked_history
  )
  select
    ranked_history.event_id,
    ranked_history.event_type,
    ranked_history.title,
    ranked_history.description,
    ranked_history.resource_type,
    ranked_history.resource_id,
    ranked_history.occurred_at,
    page_metadata.has_more,
    case when page_metadata.has_more then page_metadata.next_occurred_at end,
    case when page_metadata.has_more then page_metadata.next_id end,
    case when page_metadata.has_more then page_metadata.next_type end
  from ranked_history
  cross join page_metadata
  where ranked_history.row_position <= p_limit
  order by
    ranked_history.occurred_at desc,
    ranked_history.event_id desc,
    ranked_history.event_type desc;
end;
$$;

alter table public.profiles enable row level security;
alter table public.admin_allowlist enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.site_settings enable row level security;
alter table public.site_content enable row level security;
alter table public.portfolio_projects enable row level security;
alter table public.portfolio_media enable row level security;
alter table public.design_requests enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.design_request_attachments enable row level security;
alter table public.conversation_read_markers enable row level security;
alter table public.quote_versions enable row level security;
alter table public.quote_options enable row level security;
alter table public.quote_status_events enable row level security;
alter table public.quote_counteroffers enable row level security;
alter table public.quote_counteroffer_decisions enable row level security;
alter table public.quote_acceptances enable row level security;
alter table public.commissions enable row level security;
alter table public.commission_status_history enable row level security;
alter table public.design_drafts enable row level security;
alter table public.draft_revisions enable row level security;
alter table public.draft_revision_assets enable row level security;
alter table public.draft_feedback enable row level security;
alter table public.payments enable row level security;
alter table public.payment_status_history enable row level security;
alter table public.deliverables enable row level security;
alter table public.aftercare_cases enable row level security;
alter table public.aftercare_completions enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_notes enable row level security;

alter table private.payment_webhook_events enable row level security;
alter table private.stripe_event_receipts enable row level security;
alter table private.payment_checkout_requests enable row level security;
alter table private.stripe_refund_events enable row level security;
alter table private.stripe_charge_refund_events enable row level security;
alter table private.stripe_checkout_events enable row level security;
alter table private.stripe_dispute_events enable row level security;
alter table private.deliverable_secrets enable row level security;
alter table private.deliverable_access_logs enable row level security;
alter table private.deliverable_write_requests enable row level security;
alter table private.notification_delivery_attempts enable row level security;
alter table private.audit_logs enable row level security;
alter table private.rate_limit_rules enable row level security;
alter table private.rate_limit_buckets enable row level security;

create policy profiles_select_self_or_admin
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_active_admin());
create policy profiles_update_self
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy admin_allowlist_select_admin
on public.admin_allowlist for select to authenticated
using (public.is_active_admin());

create policy notification_preferences_select_self
on public.notification_preferences for select to authenticated
using (profile_id = auth.uid());
create policy notification_preferences_insert_self
on public.notification_preferences for insert to authenticated
with check (profile_id = auth.uid());
create policy notification_preferences_update_self
on public.notification_preferences for update to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy site_settings_public_read
on public.site_settings for select to anon, authenticated
using (status = 'published');
create policy site_settings_admin_all
on public.site_settings for all to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

create policy site_content_public_read
on public.site_content for select to anon
using (status = 'published');
create policy site_content_authenticated_read
on public.site_content for select to authenticated
using (status = 'published' or public.is_active_admin());
create policy site_content_admin_write
on public.site_content for all to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

create policy portfolio_projects_public_read
on public.portfolio_projects for select to anon
using (status = 'published');
create policy portfolio_projects_authenticated_read
on public.portfolio_projects for select to authenticated
using (status = 'published' or public.is_active_admin());
create policy portfolio_projects_admin_write
on public.portfolio_projects for all to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

create policy portfolio_media_public_read
on public.portfolio_media for select to anon
using (
  exists (
    select 1
    from public.portfolio_projects as projects
    where projects.id = portfolio_project_id
      and projects.status = 'published'
  )
);
create policy portfolio_media_authenticated_read
on public.portfolio_media for select to authenticated
using (
  public.is_active_admin()
  or exists (
    select 1
    from public.portfolio_projects as projects
    where projects.id = portfolio_project_id
      and projects.status = 'published'
  )
);
create policy portfolio_media_admin_read
on public.portfolio_media for select to authenticated
using (public.is_active_admin());

create policy design_requests_select_owner_or_admin
on public.design_requests for select to authenticated
using (customer_id = auth.uid() or public.is_active_admin());
create policy design_requests_insert_owner
on public.design_requests for insert to authenticated
with check (
  customer_id = auth.uid()
  and status in ('draft', 'open')
);
create policy design_requests_update_owner_draft
on public.design_requests for update to authenticated
using (customer_id = auth.uid() and status = 'draft')
with check (
  customer_id = auth.uid()
  and status in ('draft', 'open')
);
create policy design_requests_decline_owner
on public.design_requests for update to authenticated
using (customer_id = auth.uid() and status = 'open')
with check (customer_id = auth.uid() and status = 'declined');
create policy design_requests_admin_update
on public.design_requests for update to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

create policy conversations_select_owner_or_admin
on public.conversations for select to authenticated
using (customer_id = auth.uid() or public.is_active_admin());
create policy conversations_insert_owner
on public.conversations for insert to authenticated
with check (
  customer_id = auth.uid()
  and status = 'open'
  and last_message_at is null
  and last_message_id is null
  and exists (
    select 1
    from public.design_requests as requests
    where requests.id = design_request_id
      and requests.customer_id = auth.uid()
  )
);
create policy conversations_admin_write
on public.conversations for update to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

create policy messages_select_participant_or_admin
on public.messages for select to authenticated
using (
  public.is_active_admin()
  or exists (
    select 1
    from public.conversations as conversations
    where conversations.id = conversation_id
      and conversations.customer_id = auth.uid()
  )
);
create policy message_attachments_select_participant_or_admin
on public.message_attachments for select to authenticated
using (
  public.is_active_admin()
  or owner_id = auth.uid()
  or exists (
    select 1
    from public.messages
    inner join public.conversations
      on conversations.id = messages.conversation_id
    where messages.id = message_id
      and conversations.customer_id = auth.uid()
  )
);
create policy design_request_attachments_select_owner_or_admin
on public.design_request_attachments for select to authenticated
using (owner_id = auth.uid() or public.is_active_admin());

create policy read_markers_select_self_or_admin
on public.conversation_read_markers for select to authenticated
using (user_id = auth.uid() or public.is_active_admin());
create policy quote_versions_select_customer
on public.quote_versions for select to authenticated
using (
  public.can_read_quote(id)
);
create policy quote_versions_admin_all
on public.quote_versions for all to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

create policy quote_status_events_select_participant_or_admin
on public.quote_status_events for select to authenticated
using (
  public.can_read_quote(quote_version_id)
);

create policy quote_options_select_customer
on public.quote_options for select to authenticated
using (
  public.can_read_quote(quote_version_id)
);
create policy quote_options_admin_all
on public.quote_options for all to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

create policy quote_counteroffers_select_owner_or_admin
on public.quote_counteroffers for select to authenticated
using (customer_id = auth.uid() or public.is_active_admin());
create policy quote_counteroffers_withdraw_owner
on public.quote_counteroffers for update to authenticated
using (customer_id = auth.uid() and status = 'pending')
with check (customer_id = auth.uid() and status = 'withdrawn');

create policy quote_counteroffer_decisions_select_participant_or_admin
on public.quote_counteroffer_decisions for select to authenticated
using (
  public.is_active_admin()
  or exists (
    select 1
    from public.quote_counteroffers
    where quote_counteroffers.id = counteroffer_id
      and quote_counteroffers.customer_id = auth.uid()
  )
);
create policy quote_acceptances_select_owner_or_admin
on public.quote_acceptances for select to authenticated
using (customer_id = auth.uid() or public.is_active_admin());

create policy commissions_select_owner_or_admin
on public.commissions for select to authenticated
using (customer_id = auth.uid() or public.is_active_admin());
create policy commission_history_select_owner_or_admin
on public.commission_status_history for select to authenticated
using (
  public.is_active_admin()
  or exists (
    select 1
    from public.commissions
    where commissions.id = commission_id
      and commissions.customer_id = auth.uid()
  )
);

create policy design_drafts_select_customer
on public.design_drafts for select to authenticated
using (
  published_at is not null
  and exists (
    select 1
    from public.commissions
    where commissions.id = commission_id
      and commissions.customer_id = auth.uid()
  )
);
create policy design_drafts_admin_all
on public.design_drafts for all to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

create policy draft_revisions_select_customer
on public.draft_revisions for select to authenticated
using (
  published_at is not null
  and exists (
    select 1
    from public.design_drafts
    inner join public.commissions
      on commissions.id = design_drafts.commission_id
    where design_drafts.id = design_draft_id
      and design_drafts.published_at is not null
      and commissions.customer_id = auth.uid()
  )
);
create policy draft_revisions_admin_all
on public.draft_revisions for all to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());
create policy draft_revision_assets_select_customer
on public.draft_revision_assets for select to authenticated
using (
  exists (
    select 1
    from public.draft_revisions
    inner join public.design_drafts
      on design_drafts.id = draft_revisions.design_draft_id
    inner join public.commissions
      on commissions.id = design_drafts.commission_id
    where draft_revisions.id = draft_revision_id
      and draft_revisions.published_at is not null
      and design_drafts.published_at is not null
      and commissions.customer_id = auth.uid()
  )
);
create policy draft_revision_assets_admin_read
on public.draft_revision_assets for select to authenticated
using (public.is_active_admin());

create policy draft_feedback_select_owner_or_admin
on public.draft_feedback for select to authenticated
using (customer_id = auth.uid() or public.is_active_admin());
create policy draft_feedback_insert_owner
on public.draft_feedback for insert to authenticated
with check (
  customer_id = auth.uid()
  and kind = 'comment'
  and requested_by = 'customer'
  and not consumes_included_revision
  and not complimentary
  and override_reason is null
  and exists (
    select 1
    from public.draft_revisions
    inner join public.design_drafts
      on design_drafts.id = draft_revisions.design_draft_id
    inner join public.commissions
      on commissions.id = design_drafts.commission_id
    where draft_revisions.id = draft_revision_id
      and draft_revisions.published_at is not null
      and design_drafts.published_at is not null
      and commissions.customer_id = auth.uid()
  )
);

create policy payments_select_owner_or_admin
on public.payments for select to authenticated
using (customer_id = auth.uid() or public.is_active_admin());
create policy payment_history_select_owner_or_admin
on public.payment_status_history for select to authenticated
using (
  public.is_active_admin()
  or exists (
    select 1
    from public.payments
    where payments.id = payment_id
      and payments.customer_id = auth.uid()
  )
);

create policy deliverables_select_customer
on public.deliverables for select to authenticated
using (
  customer_id = auth.uid()
  and status = 'released'
  and exists (
    select 1
    from public.commissions
    where commissions.id = commission_id
      and commissions.status in ('paid', 'delivered', 'aftercare', 'completed')
  )
  and exists (
    select 1
    where public.commission_payment_is_clear(
      deliverables.commission_id,
      auth.uid()
    )
  )
);
create policy deliverables_admin_all
on public.deliverables for all to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

create policy aftercare_cases_select_owner_or_admin
on public.aftercare_cases for select to authenticated
using (customer_id = auth.uid() or public.is_active_admin());
create policy aftercare_cases_admin_update
on public.aftercare_cases for update to authenticated
using (public.is_active_admin())
with check (
  public.is_active_admin()
  and status <> 'completed'
);

create policy aftercare_completions_select_owner_or_admin
on public.aftercare_completions for select to authenticated
using (
  public.is_active_admin()
  or exists (
    select 1
    from public.aftercare_cases
    where aftercare_cases.id = aftercare_case_id
      and aftercare_cases.customer_id = auth.uid()
  )
);

create policy notifications_select_self
on public.notifications for select to authenticated
using (recipient_id = auth.uid());
create policy notifications_update_self
on public.notifications for update to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

create policy admin_notes_admin_all
on public.admin_notes for all to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

do $verified_google_application_policies$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'profiles',
    'admin_allowlist',
    'notification_preferences',
    'site_settings',
    'site_content',
    'portfolio_projects',
    'portfolio_media',
    'design_requests',
    'conversations',
    'messages',
    'message_attachments',
    'design_request_attachments',
    'conversation_read_markers',
    'quote_versions',
    'quote_options',
    'quote_status_events',
    'quote_counteroffers',
    'quote_counteroffer_decisions',
    'quote_acceptances',
    'commissions',
    'commission_status_history',
    'design_drafts',
    'draft_revisions',
    'draft_revision_assets',
    'draft_feedback',
    'payments',
    'payment_status_history',
    'deliverables',
    'aftercare_cases',
    'aftercare_completions',
    'notifications',
    'admin_notes'
  ]
  loop
    execute pg_catalog.format(
      'create policy verified_google_application_user on public.%I '
      || 'as restrictive for all to authenticated '
      || 'using (public.current_application_user_id() is not null) '
      || 'with check (public.current_application_user_id() is not null)',
      relation_name
    );
  end loop;
end;
$verified_google_application_policies$;

create view public.quote_lifecycle
with (security_invoker = true)
as
select
  quotes.id,
  quotes.design_request_id,
  quotes.version_number,
  case
    when acceptances.quote_version_id is not null
      then 'accepted'::public.quote_status
    when later_sent.has_later_sent
      then 'superseded'::public.quote_status
    when latest.status in ('declined', 'cancelled')
      then latest.status
    when sent.sent_at is null
      then 'draft'::public.quote_status
    when quotes.valid_until <= now()
      then 'expired'::public.quote_status
    else coalesce(latest.status, 'sent'::public.quote_status)
  end as status,
  quotes.title,
  quotes.introduction,
  quotes.terms,
  quotes.currency,
  quotes.production_weeks,
  quotes.valid_until,
  sent.sent_at,
  quotes.created_by,
  quotes.created_at
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
left join lateral (
  select quote_version_id
  from public.quote_acceptances
  where quote_version_id = quotes.id
  limit 1
) as acceptances on true
left join lateral (
  select exists (
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
  ) as has_later_sent
) as later_sent on true;

revoke all on table
  public.profiles,
  public.admin_allowlist,
  public.notification_preferences,
  public.site_settings,
  public.site_content,
  public.portfolio_projects,
  public.portfolio_media,
  public.design_requests,
  public.conversations,
  public.messages,
  public.message_attachments,
  public.design_request_attachments,
  public.conversation_read_markers,
  public.quote_versions,
  public.quote_options,
  public.quote_status_events,
  public.quote_counteroffers,
  public.quote_counteroffer_decisions,
  public.quote_acceptances,
  public.commissions,
  public.commission_status_history,
  public.design_drafts,
  public.draft_revisions,
  public.draft_revision_assets,
  public.draft_feedback,
  public.payments,
  public.payment_status_history,
  public.deliverables,
  public.aftercare_cases,
  public.aftercare_completions,
  public.notifications,
  public.admin_notes
from anon, authenticated;
revoke all on public.quote_lifecycle from anon, authenticated;

grant select on
  public.site_settings,
  public.site_content,
  public.portfolio_projects,
  public.portfolio_media
to anon;

grant select on
  public.profiles,
  public.admin_allowlist,
  public.notification_preferences,
  public.site_settings,
  public.site_content,
  public.portfolio_projects,
  public.portfolio_media,
  public.design_requests,
  public.conversations,
  public.messages,
  public.message_attachments,
  public.design_request_attachments,
  public.conversation_read_markers,
  public.quote_versions,
  public.quote_options,
  public.quote_status_events,
  public.quote_counteroffers,
  public.quote_counteroffer_decisions,
  public.quote_acceptances,
  public.commissions,
  public.commission_status_history,
  public.design_drafts,
  public.draft_revisions,
  public.draft_revision_assets,
  public.draft_feedback,
  public.payments,
  public.payment_status_history,
  public.deliverables,
  public.aftercare_cases,
  public.aftercare_completions,
  public.notifications,
  public.admin_notes
to authenticated;
grant select on public.quote_lifecycle to authenticated;

grant insert on
  public.notification_preferences,
  public.site_settings,
  public.site_content,
  public.portfolio_projects,
  public.design_requests,
  public.conversations,
  public.quote_versions,
  public.quote_options,
  public.design_drafts,
  public.draft_revisions,
  public.draft_feedback,
  public.admin_notes
to authenticated;

grant update (display_name, phone_e164, preferred_timezone, marketing_consent)
on public.profiles to authenticated;
grant update on
  public.notification_preferences,
  public.site_settings,
  public.site_content,
  public.portfolio_projects,
  public.design_requests,
  public.quote_versions,
  public.quote_options,
  public.design_drafts,
  public.draft_revisions,
  public.aftercare_cases,
  public.admin_notes
to authenticated;
grant update (read_at, dismissed_at) on public.notifications to authenticated;
grant update (status) on public.quote_counteroffers to authenticated;
grant update (subject, status, closed_at) on public.conversations to authenticated;

grant delete on
  public.site_content,
  public.site_settings,
  public.portfolio_projects,
  public.quote_versions,
  public.quote_options,
  public.design_drafts,
  public.draft_revisions,
  public.admin_notes
to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.current_application_user_id()
  from public, anon, authenticated;
revoke all on function public.is_active_admin() from public, anon, authenticated;
revoke all on function public.sync_admin_allowlist(text)
  from public, anon, authenticated;
revoke all on function public.get_public_site_settings()
  from public, anon, authenticated;
revoke all on function public.can_read_quote(uuid) from public, anon, authenticated;
revoke all on function public.commission_payment_is_clear(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.consume_rate_limit(
  public.rate_limit_action,
  integer
) from public, anon, authenticated;
revoke all on function public.consume_rate_limit_for_subject(
  public.rate_limit_action,
  text,
  integer
) from public, anon, authenticated;
revoke all on function public.can_delete_own_commission_object(text, text)
  from public, anon, authenticated;
revoke all on function public.authorize_deliverable_access(uuid, uuid, inet, text)
  from public, anon, authenticated;
revoke all on function public.admin_upsert_deliverable(
  uuid,
  public.deliverable_kind,
  smallint,
  text,
  text,
  text,
  text,
  bigint,
  text,
  text,
  text,
  text,
  boolean,
  text,
  public.deliverable_status
) from public, anon, authenticated;
revoke all on function public.resolve_deliverable_secret_url(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.admin_list_audit_logs(
  integer,
  integer,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.admin_list_ranked_inbox(
  integer,
  timestamptz,
  uuid,
  text,
  public.conversation_status,
  boolean
) from public, anon, authenticated;
revoke all on function public.accept_quote(uuid, text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.submit_counteroffer(uuid, uuid, bigint, text, text)
  from public, anon, authenticated;
revoke all on function public.decide_counteroffer(
  uuid,
  public.counteroffer_decision,
  text,
  text
) from public, anon, authenticated;
revoke all on function public.register_message_attachment_upload(
  uuid,
  uuid,
  text,
  text,
  text,
  bigint,
  text
) from public, anon, authenticated;
revoke all on function public.send_message(uuid, uuid, text, uuid[])
  from public, anon, authenticated;
revoke all on function public.advance_conversation_read_marker(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.transition_quote_status(
  uuid,
  public.quote_status,
  public.quote_status,
  text
) from public, anon, authenticated;
revoke all on function public.transition_commission_status(
  uuid,
  public.commission_status,
  public.commission_status,
  text,
  text
) from public, anon, authenticated;
revoke all on function public.approve_latest_draft_revision(
  uuid,
  uuid,
  smallint,
  uuid,
  text
) from public, anon, authenticated;
revoke all on function public.create_draft_revision(
  uuid,
  uuid,
  text,
  text,
  text
) from public, anon, authenticated;
revoke all on function public.publish_latest_draft_revision(
  uuid,
  uuid,
  uuid,
  smallint,
  text
) from public, anon, authenticated;
revoke all on function public.request_latest_draft_revision(
  uuid,
  uuid,
  smallint,
  text,
  uuid,
  text
) from public, anon, authenticated;
revoke all on function public.begin_payment_checkout(uuid, text)
  from public, anon, authenticated;
revoke all on function public.attach_stripe_checkout_session(
  uuid,
  text,
  text,
  timestamptz,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.record_stripe_checkout_event(
  text,
  text,
  text,
  text,
  timestamptz,
  jsonb
) from public, anon, authenticated;
revoke all on function public.record_verified_payment(
  public.payment_provider,
  text,
  text,
  text,
  jsonb,
  uuid,
  text,
  text,
  public.payment_kind,
  text,
  bigint,
  public.payment_status,
  timestamptz,
  text,
  bigint
) from public, anon, authenticated;
revoke all on function public.record_stripe_refund_event(
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  bigint,
  timestamptz,
  jsonb
) from public, anon, authenticated;
revoke all on function public.record_stripe_charge_refunded_event(
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  bigint,
  timestamptz,
  jsonb
) from public, anon, authenticated;
revoke all on function public.record_stripe_dispute_event(
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  bigint,
  text,
  timestamptz,
  jsonb
) from public, anon, authenticated;
revoke all on function public.complete_aftercare_case(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.open_aftercare_case(
  uuid,
  uuid,
  text,
  text,
  text,
  text
) from public, anon, authenticated;
revoke all on function public.customer_list_history(
  integer,
  timestamptz,
  uuid,
  text,
  text,
  text[]
) from public, anon, authenticated;

grant execute on function public.current_application_user_id() to authenticated;
grant execute on function public.is_active_admin() to authenticated;
grant execute on function public.sync_admin_allowlist(text) to service_role;
grant execute on function public.get_public_site_settings() to anon, authenticated;
grant execute on function public.can_read_quote(uuid) to authenticated;
grant execute on function public.commission_payment_is_clear(uuid, uuid)
  to authenticated;
grant execute on function public.consume_rate_limit(
  public.rate_limit_action,
  integer
) to authenticated;
grant execute on function public.consume_rate_limit_for_subject(
  public.rate_limit_action,
  text,
  integer
) to service_role;
grant execute on function public.can_delete_own_commission_object(text, text)
  to authenticated;
grant execute on function public.authorize_deliverable_access(uuid, uuid, inet, text)
  to authenticated;
grant execute on function public.admin_upsert_deliverable(
  uuid,
  public.deliverable_kind,
  smallint,
  text,
  text,
  text,
  text,
  bigint,
  text,
  text,
  text,
  text,
  boolean,
  text,
  public.deliverable_status
) to authenticated;
grant execute on function public.resolve_deliverable_secret_url(uuid, uuid, uuid)
  to service_role;
grant execute on function public.admin_list_audit_logs(
  integer,
  integer,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz
) to authenticated;
grant execute on function public.admin_list_ranked_inbox(
  integer,
  timestamptz,
  uuid,
  text,
  public.conversation_status,
  boolean
) to authenticated;
grant execute on function public.accept_quote(uuid, text, uuid, uuid)
  to authenticated;
grant execute on function public.submit_counteroffer(uuid, uuid, bigint, text, text)
  to authenticated;
grant execute on function public.decide_counteroffer(
  uuid,
  public.counteroffer_decision,
  text,
  text
) to authenticated;
grant execute on function public.register_message_attachment_upload(
  uuid,
  uuid,
  text,
  text,
  text,
  bigint,
  text
) to service_role;
grant execute on function public.send_message(uuid, uuid, text, uuid[])
  to authenticated;
grant execute on function public.advance_conversation_read_marker(uuid, uuid)
  to authenticated;
grant execute on function public.transition_quote_status(
  uuid,
  public.quote_status,
  public.quote_status,
  text
) to authenticated, service_role;
grant execute on function public.transition_commission_status(
  uuid,
  public.commission_status,
  public.commission_status,
  text,
  text
) to authenticated, service_role;
grant execute on function public.approve_latest_draft_revision(
  uuid,
  uuid,
  smallint,
  uuid,
  text
) to authenticated;
grant execute on function public.create_draft_revision(
  uuid,
  uuid,
  text,
  text,
  text
) to authenticated;
grant execute on function public.publish_latest_draft_revision(
  uuid,
  uuid,
  uuid,
  smallint,
  text
) to authenticated;
grant execute on function public.request_latest_draft_revision(
  uuid,
  uuid,
  smallint,
  text,
  uuid,
  text
) to authenticated;
grant execute on function public.begin_payment_checkout(uuid, text)
  to authenticated;
grant execute on function public.attach_stripe_checkout_session(
  uuid,
  text,
  text,
  timestamptz,
  timestamptz
) to service_role;
grant execute on function public.record_stripe_checkout_event(
  text,
  text,
  text,
  text,
  timestamptz,
  jsonb
) to service_role;
grant execute on function public.record_verified_payment(
  public.payment_provider,
  text,
  text,
  text,
  jsonb,
  uuid,
  text,
  text,
  public.payment_kind,
  text,
  bigint,
  public.payment_status,
  timestamptz,
  text,
  bigint
) to service_role;
grant execute on function public.record_stripe_refund_event(
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  bigint,
  timestamptz,
  jsonb
) to service_role;
grant execute on function public.record_stripe_charge_refunded_event(
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  bigint,
  timestamptz,
  jsonb
) to service_role;
grant execute on function public.record_stripe_dispute_event(
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  bigint,
  text,
  timestamptz,
  jsonb
) to service_role;
grant execute on function public.complete_aftercare_case(uuid, text, text)
  to authenticated;
grant execute on function public.open_aftercare_case(
  uuid,
  uuid,
  text,
  text,
  text,
  text
) to authenticated;
grant execute on function public.customer_list_history(
  integer,
  timestamptz,
  uuid,
  text,
  text,
  text[]
) to authenticated;

grant usage on schema private to service_role;
grant all on all tables in schema private to service_role;

do $realtime$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messages'
    ) then
      execute 'alter publication supabase_realtime add table public.messages';
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'conversations'
    ) then
      execute 'alter publication supabase_realtime add table public.conversations';
    end if;
  end if;
end;
$realtime$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'portfolio-public',
    'portfolio-public',
    false,
    10485760,
    array['image/avif', 'image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'commission-private',
    'commission-private',
    false,
    26214400,
    array[
      'application/pdf',
      'image/avif',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]
  ),
  (
    'deliverables-private',
    'deliverables-private',
    false,
    262144000,
    array[
      'application/pdf',
      'application/zip',
      'image/avif',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]
  )
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

revoke insert, update, delete on storage.objects from anon, authenticated;

create policy commission_objects_linked_customer_read
on storage.objects for select to authenticated
using (
  public.current_application_user_id() is not null
  and
  bucket_id = 'commission-private'
  and (
    exists (
      select 1
      from public.design_request_attachments
      inner join public.design_requests
        on design_requests.id = design_request_attachments.design_request_id
      where design_request_attachments.bucket_id = storage.objects.bucket_id
        and design_request_attachments.object_path = storage.objects.name
        and design_requests.customer_id = auth.uid()
    )
    or exists (
      select 1
      from public.message_attachments
      inner join public.messages
        on messages.id = message_attachments.message_id
      inner join public.conversations
        on conversations.id = messages.conversation_id
      where message_attachments.bucket_id = storage.objects.bucket_id
        and message_attachments.object_path = storage.objects.name
        and conversations.customer_id = auth.uid()
    )
    or exists (
      select 1
      from public.draft_revision_assets
      inner join public.draft_revisions
        on draft_revisions.id = draft_revision_assets.draft_revision_id
      inner join public.design_drafts
        on design_drafts.id = draft_revisions.design_draft_id
      inner join public.commissions
        on commissions.id = design_drafts.commission_id
      where draft_revision_assets.bucket_id = storage.objects.bucket_id
        and draft_revision_assets.object_path = storage.objects.name
        and draft_revisions.published_at is not null
        and design_drafts.published_at is not null
        and commissions.customer_id = auth.uid()
    )
  )
);
