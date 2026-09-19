begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

do $setup$
begin
  perform *
  from public.accept_quote(
    '63000000-0000-4000-8000-000000000001',
    'admin-boundaries|accept',
    '64000000-0000-4000-8000-000000000001',
    null
  );
end;
$setup$;

reset role;
update public.commissions
set status = 'final_payment_due'
where design_request_id = '60000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

select results_eq(
  $$
    select operation, status, replayed
    from public.admin_upsert_deliverable(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'design_package',
      1,
      'LOCAL TEST admin deliverable',
      'Customer-safe public metadata',
      'admin-deliverable.pdf',
      'application/pdf',
      4096,
      repeat('a', 64),
      'deliverables-private',
      '22222222-2222-4222-8222-222222222222/deliverables/admin-deliverable.pdf',
      'https://storage.local.test/private/admin-deliverable.pdf?token=local-test-secret',
      false,
      'deliverable-write|create',
      null
    )
  $$,
  $$ values ('created'::text, 'preparing'::public.deliverable_status, false) $$,
  'active admin atomically creates safe metadata and private URL'
);

select results_eq(
  $$
    select operation, status, replayed
    from public.admin_upsert_deliverable(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'design_package',
      1,
      'LOCAL TEST admin deliverable',
      'Customer-safe public metadata',
      'admin-deliverable.pdf',
      'application/pdf',
      4096,
      repeat('a', 64),
      'deliverables-private',
      '22222222-2222-4222-8222-222222222222/deliverables/admin-deliverable.pdf',
      'https://storage.local.test/private/admin-deliverable.pdf?token=local-test-secret',
      false,
      'deliverable-write|create',
      null
    )
  $$,
  $$ values ('created'::text, 'preparing'::public.deliverable_status, true) $$,
  'deliverable write replay returns the original result'
);

select throws_ok(
  $$
    select *
    from public.admin_upsert_deliverable(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'design_package',
      1,
      'CHANGED TITLE',
      'Customer-safe public metadata',
      'admin-deliverable.pdf',
      'application/pdf',
      4096,
      repeat('a', 64),
      'deliverables-private',
      '22222222-2222-4222-8222-222222222222/deliverables/admin-deliverable.pdf',
      'https://storage.local.test/private/admin-deliverable.pdf?token=local-test-secret',
      false,
      'deliverable-write|create',
      null
    )
  $$,
  null,
  null,
  'deliverable idempotency key rejects changed inputs'
);

select results_eq(
  $$
    select operation, status, replayed
    from public.admin_upsert_deliverable(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'design_package',
      1,
      'LOCAL TEST admin deliverable',
      'Customer-safe public metadata',
      'admin-deliverable.pdf',
      'application/pdf',
      4096,
      repeat('a', 64),
      'deliverables-private',
      '22222222-2222-4222-8222-222222222222/deliverables/admin-deliverable.pdf',
      'https://storage.local.test/private/admin-deliverable.pdf?token=local-test-secret',
      true,
      'deliverable-write|release',
      'preparing'
    )
  $$,
  $$ values ('released'::text, 'released'::public.deliverable_status, false) $$,
  'active admin atomically releases metadata and private secret'
);

select ok(
  (
    select to_jsonb(deliverables)::text
      not like '%local-test-secret%'
    from public.deliverables
    where commission_id = (
      select id
      from public.commissions
      where design_request_id = '60000000-0000-4000-8000-000000000001'
    )
      and kind = 'design_package'
  ),
  'customer-visible deliverable metadata never contains the raw URL'
);

select results_eq(
  $$
    select authorized, resulting_commission_status
    from public.authorize_deliverable_access(
      (
        select id
        from public.deliverables
        where commission_id = (
          select id
          from public.commissions
          where design_request_id = '60000000-0000-4000-8000-000000000001'
        )
          and kind = 'design_package'
      ),
      '80000000-0000-4000-8000-000000000040',
      '192.0.2.20'::inet,
      'pgTAP admin access'
    )
  $$,
  $$ values (true, 'final_payment_due'::public.commission_status) $$,
  'active admin can authorize access without impersonating the customer'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  public.resolve_deliverable_secret_url(
    (
      select id
      from private.deliverable_access_logs
      where request_id = '80000000-0000-4000-8000-000000000040'
    ),
    '80000000-0000-4000-8000-000000000040',
    '11111111-1111-4111-8111-111111111111'
  ),
  'https://storage.local.test/private/admin-deliverable.pdf?token=local-test-secret',
  'service resolver validates the logged admin actor and returns minimal URL'
);

reset role;

select is(
  (
    select secret_url
    from private.deliverable_secrets
    where deliverable_id = (
      select id
      from public.deliverables
      where commission_id = (
        select id
        from public.commissions
        where design_request_id = '60000000-0000-4000-8000-000000000001'
      )
        and kind = 'design_package'
    )
  ),
  'https://storage.local.test/private/admin-deliverable.pdf?token=local-test-secret',
  'raw HTTPS URL is persisted only in private storage'
);

select is(
  (
    select count(*)::integer
    from private.deliverable_write_requests
    where deliverable_id = (
      select id
      from public.deliverables
      where commission_id = (
        select id
        from public.commissions
        where design_request_id = '60000000-0000-4000-8000-000000000001'
      )
        and kind = 'design_package'
    )
  ),
  2,
  'deliverable write request ledger records each unique operation once'
);

select ok(
  not exists (
    select 1
    from private.audit_logs
    where table_name = 'deliverable_secrets'
      and (
        coalesce(old_record::text, '') like '%local-test-secret%'
        or coalesce(new_record::text, '') like '%local-test-secret%'
      )
  ),
  'deliverable secret audit records contain hashes rather than raw URLs'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

select ok(
  (
    select count(*) > 0
    from public.admin_list_audit_logs(
      p_limit => 20,
      p_table_name => 'deliverable_secrets',
      p_search => 'deliverable'
    )
  ),
  'active admin can page and filter sanitized audit rows'
);

select ok(
  not exists (
    select 1
    from public.admin_list_audit_logs(
      p_limit => 20,
      p_table_name => 'deliverable_secrets'
    )
    where changed_fields && array[
      'access_token_hash',
      'body',
      'object_path',
      'safe_payload',
      'sanitized_payload',
      'secret_url'
    ]
      or actor_email_masked not like '_***@%'
  ),
  'audit projection excludes sensitive fields and masks actor email'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

select throws_ok(
  $$
    select *
    from public.admin_list_audit_logs()
  $$,
  null,
  null,
  'customer cannot query sanitized admin audit projection'
);

select throws_ok(
  $$
    select *
    from public.admin_upsert_deliverable(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'design_package',
      2,
      'FORBIDDEN',
      null,
      'forbidden.pdf',
      'application/pdf',
      100,
      repeat('b', 64),
      'deliverables-private',
      '22222222-2222-4222-8222-222222222222/deliverables/forbidden.pdf',
      'https://storage.local.test/private/forbidden.pdf',
      false,
      'deliverable-write|forbidden',
      null
    )
  $$,
  null,
  null,
  'customer cannot write deliverable metadata or private URL'
);

select * from finish();
rollback;
