begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '55000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'password.only@veyra.local.test',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"LOCAL TEST Password Only"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '66000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'unconfirmed.google@veyra.local.test',
    null,
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{"display_name":"LOCAL TEST Unconfirmed Google"}'::jsonb,
    now(),
    now()
  );

insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  created_at,
  updated_at
)
values
  (
    '55000000-0000-4000-8000-000000000002',
    '55000000-0000-4000-8000-000000000001',
    'local-password-only-55000000',
    '{"sub":"55000000-0000-4000-8000-000000000001","email":"password.only@veyra.local.test","email_verified":true}'::jsonb,
    'email',
    now(),
    now()
  ),
  (
    '66000000-0000-4000-8000-000000000002',
    '66000000-0000-4000-8000-000000000001',
    'local-unconfirmed-google-66000000',
    '{"sub":"66000000-0000-4000-8000-000000000001","email":"unconfirmed.google@veyra.local.test","email_verified":false}'::jsonb,
    'google',
    now(),
    now()
  );

insert into public.profiles (id, display_name)
values
  (
    '55000000-0000-4000-8000-000000000001',
    'LOCAL TEST Password Only'
  ),
  (
    '66000000-0000-4000-8000-000000000001',
    'LOCAL TEST Unconfirmed Google'
  )
on conflict (id) do update
set display_name = excluded.display_name;

insert into public.admin_allowlist (
  id,
  email,
  is_active,
  reason,
  deactivated_at
)
values
  (
    '55000000-0000-4000-8000-000000000003',
    'password.only@veyra.local.test',
    false,
    'LOCAL TEST password-only rejection target',
    now()
  ),
  (
    '66000000-0000-4000-8000-000000000003',
    'unconfirmed.google@veyra.local.test',
    false,
    'LOCAL TEST unconfirmed Google rejection target',
    now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

select is(
  public.current_application_user_id(),
  '22222222-2222-4222-8222-222222222222'::uuid,
  'confirmed Google identity is an authorized application user'
);

select is(
  (select count(*)::integer from public.profiles),
  1,
  'confirmed Google customer retains self-read access'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","amr":[{"method":"password","timestamp":1}]}',
  true
);

select is(
  public.current_application_user_id(),
  null::uuid,
  'password session is denied even when the account has a linked Google identity'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

select is(
  public.is_active_admin(),
  true,
  'active allowlisted confirmed Google identity remains an admin'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '55000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"55000000-0000-4000-8000-000000000001","role":"authenticated","amr":[{"method":"password","timestamp":1}]}',
  true
);

select is(
  public.current_application_user_id(),
  null::uuid,
  'confirmed email-password identity is not an authorized application user'
);

select is(
  (select count(*)::integer from public.profiles),
  0,
  'restrictive RLS denies a password-only identity its nominally owned profile'
);

select throws_ok(
  $$ select * from public.consume_rate_limit('message_send', 1) $$,
  null,
  null,
  'SECURITY DEFINER customer RPC denies a password-only identity'
);

reset role;
update public.admin_allowlist
set is_active = false,
    deactivated_at = now()
where email = 'atelier.admin@veyra.local.test';
update public.admin_allowlist
set is_active = true,
    activated_at = now(),
    deactivated_at = null
where email = 'password.only@veyra.local.test';

set local role authenticated;
select set_config('request.jwt.claim.sub', '55000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"55000000-0000-4000-8000-000000000001","role":"authenticated","amr":[{"method":"password","timestamp":1}]}',
  true
);

select is(
  public.is_active_admin(),
  false,
  'even an active allowlist row cannot authorize a password-only identity'
);

reset role;
update public.admin_allowlist
set is_active = false,
    deactivated_at = now()
where email = 'password.only@veyra.local.test';
update public.admin_allowlist
set is_active = true,
    activated_at = now(),
    deactivated_at = null
where email = 'atelier.admin@veyra.local.test';

set local role authenticated;
select set_config('request.jwt.claim.sub', '66000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"66000000-0000-4000-8000-000000000001","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

select is(
  public.current_application_user_id(),
  null::uuid,
  'unconfirmed Google identity is not an authorized application user'
);

select is(
  (select count(*)::integer from public.profiles),
  0,
  'restrictive RLS denies an unconfirmed Google identity'
);

reset role;
update public.admin_allowlist
set is_active = false,
    deactivated_at = now()
where email = 'atelier.admin@veyra.local.test';
update public.admin_allowlist
set is_active = true,
    activated_at = now(),
    deactivated_at = null
where email = 'unconfirmed.google@veyra.local.test';

set local role authenticated;
select set_config('request.jwt.claim.sub', '66000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"66000000-0000-4000-8000-000000000001","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

select is(
  public.is_active_admin(),
  false,
  'even an active allowlist row cannot authorize an unconfirmed Google identity'
);

reset role;
update public.admin_allowlist
set is_active = false,
    deactivated_at = now()
where email = 'unconfirmed.google@veyra.local.test';
update public.admin_allowlist
set is_active = true,
    activated_at = now(),
    deactivated_at = null
where email = 'atelier.admin@veyra.local.test';

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

select throws_ok(
  $$ select * from public.sync_admin_allowlist('atelier.admin@veyra.local.test') $$,
  null,
  null,
  'authenticated admin cannot invoke service-only allowlist synchronization'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select results_eq(
  $$
    select allowed
    from public.consume_rate_limit_for_subject(
      'message_send',
      repeat('9', 64),
      1
    )
  $$,
  array[true],
  'service-role rate limiting remains available without an application user'
);

select throws_ok(
  $$ select * from public.sync_admin_allowlist('Atelier.Admin@veyra.local.test') $$,
  null,
  null,
  'admin synchronization rejects a non-normalized email'
);

select throws_ok(
  $$ select * from public.sync_admin_allowlist('password.only@veyra.local.test') $$,
  null,
  null,
  'admin synchronization rejects a password-only target'
);

select throws_ok(
  $$ select * from public.sync_admin_allowlist('unconfirmed.google@veyra.local.test') $$,
  null,
  null,
  'admin synchronization rejects an unconfirmed Google target'
);

select results_eq(
  $$
    select target_user_id, normalized_email, changed
    from public.sync_admin_allowlist('orin.client@veyra.local.test')
  $$,
  $$
    values (
      '33333333-3333-4333-8333-333333333333'::uuid,
      'orin.client@veyra.local.test'::text,
      true
    )
  $$,
  'service role atomically switches the singleton admin to a confirmed Google user'
);

select results_eq(
  $$
    select count(*)::integer, min(email::text)
    from public.admin_allowlist
    where is_active
  $$,
  $$ values (1, 'orin.client@veyra.local.test'::text) $$,
  'allowlist synchronization leaves exactly one active target'
);

select results_eq(
  $$
    select changed
    from public.sync_admin_allowlist('orin.client@veyra.local.test')
  $$,
  array[false],
  'exact allowlist synchronization retry is idempotent'
);

select ok(
  exists (
    select 1
    from private.audit_logs
    where table_name = 'admin_allowlist'
      and (
        old_record ? 'email_sha256'
        or new_record ? 'email_sha256'
      )
  )
  and not exists (
    select 1
    from private.audit_logs
    where table_name = 'admin_allowlist'
      and (
        coalesce(old_record::text, '') like '%orin.client@veyra.local.test%'
        or coalesce(new_record::text, '') like '%orin.client@veyra.local.test%'
      )
  ),
  'admin allowlist audit records hash target emails and retain no raw target email'
);

select results_eq(
  $$
    select target_user_id, changed
    from public.sync_admin_allowlist('atelier.admin@veyra.local.test')
  $$,
  $$
    values (
      '11111111-1111-4111-8111-111111111111'::uuid,
      true
    )
  $$,
  'a different serialized target safely becomes the singleton admin'
);

select results_eq(
  $$
    select count(*)::integer, min(email::text)
    from public.admin_allowlist
    where is_active
  $$,
  $$ values (1, 'atelier.admin@veyra.local.test'::text) $$,
  'different-target ordering preserves the one-active-admin invariant'
);

reset role;

select throws_ok(
  $$
    update public.admin_allowlist
    set is_active = true,
        activated_at = now(),
        deactivated_at = null
    where email = 'password.only@veyra.local.test'
  $$,
  null,
  null,
  'singleton unique index rejects a second concurrently active admin'
);

select ok(
  position(
    'pg_advisory_xact_lock' in pg_catalog.pg_get_functiondef(
      'public.sync_admin_allowlist(text)'::regprocedure
    )
  ) > 0,
  'admin synchronization uses one global transaction advisory lock'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and policyname = 'verified_google_application_user'
      and permissive = 'RESTRICTIVE'
  ),
  32,
  'every public table has the central restrictive Google application-user policy'
);

select * from finish();
rollback;
