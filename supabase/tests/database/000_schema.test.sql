begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(57);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_tables
    where schemaname = 'public'
      and tablename = any(array[
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
      ])
  ),
  32,
  'all API-facing domain tables exist'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_tables
    where schemaname = 'private'
      and tablename = any(array[
        'payment_webhook_events',
        'stripe_event_receipts',
        'payment_checkout_requests',
        'stripe_refund_events',
        'stripe_charge_refund_events',
        'stripe_checkout_events',
        'stripe_dispute_events',
        'deliverable_secrets',
        'deliverable_access_logs',
        'deliverable_write_requests',
        'notification_delivery_attempts',
        'audit_logs',
        'rate_limit_rules',
        'rate_limit_buckets'
      ])
  ),
  14,
  'all private operational tables exist'
);

select ok(
  (
    select bool_and(classes.relrowsecurity)
    from pg_catalog.pg_class as classes
    inner join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = classes.relnamespace
    where namespaces.nspname = 'public'
      and classes.relkind = 'r'
      and classes.relname = any(array[
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
      ])
  ),
  'RLS is enabled on every API-facing table'
);

select ok(
  (
    select bool_and(classes.relrowsecurity)
    from pg_catalog.pg_class as classes
    inner join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = classes.relnamespace
    where namespaces.nspname = 'private'
      and classes.relkind = 'r'
  ),
  'RLS is enabled on every private table as defense in depth'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_type as types
    inner join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = types.typnamespace
    where namespaces.nspname = 'public'
      and types.typtype = 'e'
  ),
  21,
  'all domain enums exist'
);

select has_function(
  'public',
  'current_application_user_id',
  array[]::text[],
  'confirmed Google application-user resolver exists'
);

select has_function(
  'public',
  'is_active_admin',
  array[]::text[],
  'confirmed Google admin authorization helper exists'
);

select has_function(
  'public',
  'sync_admin_allowlist',
  array['text'],
  'service-only singleton admin synchronization function exists'
);

select has_function(
  'public',
  'accept_quote',
  array['uuid', 'text', 'uuid', 'uuid'],
  'atomic quote acceptance function exists'
);

select has_view(
  'public',
  'quote_lifecycle',
  'effective quote lifecycle view exists'
);

select has_function(
  'public',
  'transition_quote_status',
  array['uuid', 'quote_status', 'quote_status', 'text'],
  'append-only quote lifecycle transition function exists'
);

select has_function(
  'public',
  'send_message',
  array['uuid', 'uuid', 'text', 'uuid[]'],
  'idempotent attachment-aware message function exists'
);

select has_function(
  'public',
  'advance_conversation_read_marker',
  array['uuid', 'uuid'],
  'monotonic read-marker advancement function exists'
);

select has_function(
  'public',
  'register_message_attachment_upload',
  array['uuid', 'uuid', 'text', 'text', 'text', 'bigint', 'text'],
  'service-only verified attachment registration function exists'
);

select has_function(
  'public',
  'submit_counteroffer',
  array['uuid', 'uuid', 'bigint', 'text', 'text'],
  'derived counteroffer submission function exists'
);

select has_function(
  'public',
  'decide_counteroffer',
  array['uuid', 'counteroffer_decision', 'text', 'text'],
  'serialized admin counteroffer decision function exists'
);

select has_function(
  'public',
  'approve_latest_draft_revision',
  array['uuid', 'uuid', 'smallint', 'uuid', 'text'],
  'latest shared draft approval function exists'
);

select has_function(
  'public',
  'create_draft_revision',
  array['uuid', 'uuid', 'text', 'text', 'text'],
  'active-admin transactional draft revision creation function exists'
);

select has_function(
  'public',
  'publish_latest_draft_revision',
  array['uuid', 'uuid', 'uuid', 'smallint', 'text'],
  'atomic latest working draft publication function exists'
);

select has_function(
  'public',
  'request_latest_draft_revision',
  array['uuid', 'uuid', 'smallint', 'text', 'uuid', 'text'],
  'revision allowance and override function exists'
);

select has_function(
  'public',
  'open_aftercare_case',
  array['uuid', 'uuid', 'text', 'text', 'text', 'text'],
  'customer aftercare initiation function exists'
);

select has_function(
  'public',
  'customer_list_history',
  array['integer', 'timestamp with time zone', 'uuid', 'text', 'text', 'text[]'],
  'durable customer history keyset function exists'
);

select has_function(
  'public',
  'get_public_site_settings',
  array[]::text[],
  'typed published site settings function exists'
);

select has_function(
  'public',
  'can_delete_own_commission_object',
  array['text', 'text'],
  'storage deletion authorization helper exists'
);

select has_function(
  'public',
  'authorize_deliverable_access',
  array['uuid', 'uuid', 'inet', 'text'],
  'deliverable access authorization and transition RPC exists'
);

select has_function(
  'public',
  'admin_upsert_deliverable',
  array[
    'uuid',
    'deliverable_kind',
    'smallint',
    'text',
    'text',
    'text',
    'text',
    'bigint',
    'text',
    'text',
    'text',
    'text',
    'boolean',
    'text',
    'deliverable_status'
  ],
  'admin-only atomic deliverable metadata and secret writer exists'
);

select has_function(
  'public',
  'admin_list_audit_logs',
  array[
    'integer',
    'integer',
    'text',
    'text',
    'text',
    'text',
    'timestamp with time zone',
    'timestamp with time zone'
  ],
  'sanitized paginated admin audit query exists'
);

select has_column(
  'public',
  'conversations',
  'last_message_at',
  'conversation stores server-owned last message timestamp'
);

select has_column(
  'public',
  'conversations',
  'last_message_id',
  'conversation stores server-owned last message pointer'
);

select has_index(
  'public',
  'admin_allowlist',
  'admin_allowlist_single_active_idx',
  'admin allowlist enforces at most one active row'
);

select has_index(
  'public',
  'conversations',
  'conversations_activity_idx',
  'conversation activity keyset index exists'
);

select has_index(
  'public',
  'messages',
  'messages_conversation_sent_idx',
  'message latest and unread traversal index exists'
);

select has_index(
  'public',
  'conversation_read_markers',
  'conversation_read_markers_user_idx',
  'admin read marker lookup index exists'
);

select has_function(
  'public',
  'admin_list_ranked_inbox',
  array[
    'integer',
    'timestamp with time zone',
    'uuid',
    'text',
    'conversation_status',
    'boolean'
  ],
  'active-admin ranked inbox function exists'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in ('messages', 'conversations')
  ),
  2,
  'messages and conversations are the lightweight Realtime inbox source'
);

select has_function(
  'public',
  'resolve_deliverable_secret_url',
  array['uuid', 'uuid', 'uuid'],
  'service-only authorized deliverable URL resolver exists'
);

select has_function(
  'public',
  'commission_payment_is_clear',
  array['uuid', 'uuid'],
  'customer-safe payment and dispute gate exists'
);

select has_function(
  'public',
  'consume_rate_limit',
  array['rate_limit_action', 'integer'],
  'authenticated rate limit RPC exists'
);

select has_function(
  'public',
  'transition_commission_status',
  array['uuid', 'commission_status', 'commission_status', 'text', 'text'],
  'commission transition function exists'
);

select has_function(
  'public',
  'record_verified_payment',
  array[
    'payment_provider',
    'text',
    'text',
    'text',
    'jsonb',
    'uuid',
    'text',
    'text',
    'payment_kind',
    'text',
    'bigint',
    'payment_status',
    'timestamp with time zone',
    'text',
    'bigint'
  ],
  'verified payment recorder exists'
);

select has_function(
  'public',
  'record_stripe_refund_event',
  array[
    'text',
    'text',
    'text',
    'uuid',
    'text',
    'text',
    'text',
    'text',
    'bigint',
    'timestamp with time zone',
    'jsonb'
  ],
  'verified Stripe refund ledger function exists'
);

select has_function(
  'public',
  'record_stripe_charge_refunded_event',
  array[
    'text',
    'text',
    'text',
    'uuid',
    'text',
    'text',
    'text',
    'bigint',
    'timestamp with time zone',
    'jsonb'
  ],
  'verified aggregate Stripe charge refund function exists'
);

select has_function(
  'public',
  'record_stripe_checkout_event',
  array[
    'text',
    'text',
    'text',
    'text',
    'timestamp with time zone',
    'jsonb'
  ],
  'verified Stripe Checkout lifecycle function exists'
);

select has_function(
  'public',
  'record_stripe_dispute_event',
  array[
    'text',
    'text',
    'text',
    'uuid',
    'text',
    'text',
    'text',
    'text',
    'bigint',
    'text',
    'timestamp with time zone',
    'jsonb'
  ],
  'verified Stripe dispute ledger function exists'
);

select has_function(
  'public',
  'begin_payment_checkout',
  array['uuid', 'text'],
  'atomic payment checkout reservation function exists'
);

select has_function(
  'public',
  'attach_stripe_checkout_session',
  array['uuid', 'text', 'text', 'timestamp with time zone', 'timestamp with time zone'],
  'service-only checkout session attachment function exists'
);

select has_function(
  'public',
  'complete_aftercare_case',
  array['uuid', 'text', 'text'],
  'aftercare completion function exists'
);

select ok(
  (
    select bool_and(
      procedures.prosecdef
      and exists (
        select 1
        from unnest(procedures.proconfig) as setting
        where setting like 'search_path=%'
      )
    )
    from pg_catalog.pg_proc as procedures
    inner join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = procedures.pronamespace
    where namespaces.nspname = 'public'
      and procedures.proname = any(array[
        'current_application_user_id',
        'is_active_admin',
        'sync_admin_allowlist',
        'can_read_quote',
        'commission_payment_is_clear',
        'can_delete_own_commission_object',
        'authorize_deliverable_access',
        'admin_upsert_deliverable',
        'admin_list_audit_logs',
        'admin_list_ranked_inbox',
        'resolve_deliverable_secret_url',
        'register_message_attachment_upload',
        'send_message',
        'advance_conversation_read_marker',
        'submit_counteroffer',
        'decide_counteroffer',
        'transition_quote_status',
        'accept_quote',
        'transition_commission_status',
        'approve_latest_draft_revision',
        'create_draft_revision',
        'publish_latest_draft_revision',
        'request_latest_draft_revision',
        'open_aftercare_case',
        'customer_list_history',
        'get_public_site_settings',
        'begin_payment_checkout',
        'attach_stripe_checkout_session',
        'record_verified_payment',
        'record_stripe_refund_event',
        'record_stripe_charge_refunded_event',
        'record_stripe_checkout_event',
        'record_stripe_dispute_event',
        'complete_aftercare_case',
        'consume_rate_limit',
        'consume_rate_limit_for_subject'
      ])
  ),
  'every public SECURITY DEFINER workflow fixes search_path'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.current_application_user_id()',
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'authenticated',
    'public.current_application_user_id()',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'public.sync_admin_allowlist(text)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.sync_admin_allowlist(text)',
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'service_role',
    'public.sync_admin_allowlist(text)',
    'EXECUTE'
  ),
  'application identity resolution and admin synchronization use least privilege'
);

select ok(
  not pg_catalog.has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated clients cannot use the private schema'
);

select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.resolve_deliverable_secret_url(uuid,uuid,uuid)',
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'service_role',
    'public.resolve_deliverable_secret_url(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'only service role can resolve an authorized deliverable secret URL'
);

select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.record_stripe_refund_event(text,text,text,uuid,text,text,text,text,bigint,timestamptz,jsonb)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.record_stripe_charge_refunded_event(text,text,text,uuid,text,text,text,bigint,timestamptz,jsonb)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.record_stripe_checkout_event(text,text,text,text,timestamptz,jsonb)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.record_stripe_dispute_event(text,text,text,uuid,text,text,text,text,bigint,text,timestamptz,jsonb)',
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'service_role',
    'public.record_stripe_refund_event(text,text,text,uuid,text,text,text,text,bigint,timestamptz,jsonb)',
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'service_role',
    'public.record_stripe_charge_refunded_event(text,text,text,uuid,text,text,text,bigint,timestamptz,jsonb)',
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'service_role',
    'public.record_stripe_checkout_event(text,text,text,text,timestamptz,jsonb)',
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'service_role',
    'public.record_stripe_dispute_event(text,text,text,uuid,text,text,text,text,bigint,text,timestamptz,jsonb)',
    'EXECUTE'
  ),
  'verified Stripe refund and dispute workflows are service-role-only'
);

select ok(
  not pg_catalog.has_table_privilege('authenticated', 'private.deliverable_secrets', 'SELECT'),
  'authenticated clients cannot read raw deliverable secrets'
);

select ok(
  not pg_catalog.has_table_privilege('authenticated', 'private.audit_logs', 'SELECT'),
  'authenticated clients cannot read audit logs'
);

select results_eq(
  $$
    select id, public
    from storage.buckets
    where id in ('portfolio-public', 'commission-private', 'deliverables-private')
    order by id
  $$,
  $$
    values
      ('commission-private'::text, false),
      ('deliverables-private'::text, false),
      ('portfolio-public'::text, false)
  $$,
  'storage buckets have deliberate public/private visibility'
);

select is(
  (
    select
      case
        when count(*) = 1
          and count(*) filter (
            where policyname = 'commission_objects_linked_customer_read'
              and cmd = 'SELECT'
          ) = 1
        then 1
        else 0
      end::integer
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
  ),
  1,
  'storage objects expose only the authenticated linked-object read policy'
);

select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.quote_status_events', 'UPDATE')
  and not pg_catalog.has_table_privilege('authenticated', 'public.quote_acceptances', 'UPDATE')
  and not pg_catalog.has_table_privilege('authenticated', 'public.commission_status_history', 'UPDATE')
  and not pg_catalog.has_table_privilege('authenticated', 'public.payment_status_history', 'UPDATE')
  and not pg_catalog.has_table_privilege('authenticated', 'public.deliverables', 'INSERT')
  and not pg_catalog.has_table_privilege('authenticated', 'public.deliverables', 'UPDATE')
  and not pg_catalog.has_table_privilege('authenticated', 'public.deliverables', 'DELETE')
  and not pg_catalog.has_table_privilege('authenticated', 'public.messages', 'INSERT')
  and not pg_catalog.has_table_privilege('authenticated', 'public.message_attachments', 'INSERT')
  and not pg_catalog.has_table_privilege('authenticated', 'public.quote_counteroffers', 'INSERT')
  and not pg_catalog.has_table_privilege('authenticated', 'public.quote_counteroffer_decisions', 'INSERT')
  and not pg_catalog.has_table_privilege('authenticated', 'public.aftercare_cases', 'INSERT')
  and not pg_catalog.has_table_privilege('authenticated', 'public.conversation_read_markers', 'INSERT')
  and not pg_catalog.has_table_privilege('authenticated', 'public.conversation_read_markers', 'UPDATE')
  and not pg_catalog.has_table_privilege('authenticated', 'public.design_request_attachments', 'INSERT')
  and not pg_catalog.has_table_privilege('authenticated', 'public.design_request_attachments', 'UPDATE')
  and not pg_catalog.has_table_privilege('authenticated', 'public.design_request_attachments', 'DELETE')
  and not pg_catalog.has_table_privilege('authenticated', 'public.draft_revision_assets', 'INSERT')
  and not pg_catalog.has_table_privilege('authenticated', 'public.draft_revision_assets', 'UPDATE')
  and not pg_catalog.has_table_privilege('authenticated', 'public.draft_revision_assets', 'DELETE')
  and not pg_catalog.has_table_privilege('authenticated', 'public.portfolio_media', 'INSERT')
  and not pg_catalog.has_table_privilege('authenticated', 'public.portfolio_media', 'UPDATE')
  and not pg_catalog.has_table_privilege('authenticated', 'public.portfolio_media', 'DELETE')
  and not pg_catalog.has_table_privilege('anon', 'storage.objects', 'INSERT')
  and not pg_catalog.has_table_privilege('anon', 'storage.objects', 'UPDATE')
  and not pg_catalog.has_table_privilege('anon', 'storage.objects', 'DELETE')
  and not pg_catalog.has_table_privilege('authenticated', 'storage.objects', 'INSERT')
  and not pg_catalog.has_table_privilege('authenticated', 'storage.objects', 'UPDATE')
  and not pg_catalog.has_table_privilege('authenticated', 'storage.objects', 'DELETE')
  and pg_catalog.has_table_privilege('service_role', 'storage.objects', 'INSERT')
  and pg_catalog.has_table_privilege('service_role', 'storage.objects', 'UPDATE')
  and pg_catalog.has_table_privilege('service_role', 'storage.objects', 'DELETE'),
  'authenticated clients have no direct mutation grants on immutable ledgers'
);

select * from finish();
rollback;
