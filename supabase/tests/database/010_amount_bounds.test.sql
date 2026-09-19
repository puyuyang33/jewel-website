begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

insert into public.design_requests (
  id,
  customer_id,
  reference_code,
  title,
  request_type,
  description,
  status,
  submitted_at
)
values
  (
    'fa000000-0000-4000-8000-000000000001',
    '33333333-3333-4333-8333-333333333333',
    'DR-AMOUNT-BOUNDARY',
    'LOCAL TEST maximum amount',
    'ring',
    'LOCAL TEST DATA: quote at the maximum Checkout amount.',
    'quoted',
    now()
  ),
  (
    'fa000000-0000-4000-8000-000000000002',
    '33333333-3333-4333-8333-333333333333',
    'DR-AMOUNT-LEGACY-HIGH',
    'LOCAL TEST legacy high amount',
    'ring',
    'LOCAL TEST DATA: simulated corrupt historical quote above Checkout bounds.',
    'quoted',
    now()
  );

insert into public.quote_versions (
  id,
  design_request_id,
  version_number,
  title,
  terms,
  currency,
  production_weeks,
  valid_until,
  created_by
)
values
  (
    'fa000000-0000-4000-8000-000000000010',
    'fa000000-0000-4000-8000-000000000001',
    1,
    'LOCAL TEST maximum quote',
    'LOCAL TEST TERMS',
    'USD',
    8,
    now() + interval '1 day',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    'fa000000-0000-4000-8000-000000000020',
    'fa000000-0000-4000-8000-000000000002',
    1,
    'LOCAL TEST legacy high quote',
    'LOCAL TEST TERMS',
    'USD',
    8,
    now() + interval '1 day',
    '11111111-1111-4111-8111-111111111111'
  );

select lives_ok(
  $$
    insert into public.quote_options (
      id,
      quote_version_id,
      title,
      description,
      scope_snapshot,
      line_items,
      currency,
      total_minor,
      deposit_minor
    )
    values (
      'fa000000-0000-4000-8000-000000000011',
      'fa000000-0000-4000-8000-000000000010',
      'LOCAL TEST maximum option',
      'LOCAL TEST option at exact supported amount.',
      '{"localTestData":true}'::jsonb,
      '[{"description":"Maximum option","amount":{"amountMinor":99999999,"currency":"USD"}}]'::jsonb,
      'USD',
      99999999,
      0
    )
  $$,
  '99,999,999 minor units is accepted at draft option boundary'
);

select throws_ok(
  $$
    insert into public.quote_options (
      quote_version_id,
      title,
      description,
      scope_snapshot,
      currency,
      total_minor,
      deposit_minor
    )
    values (
      'fa000000-0000-4000-8000-000000000010',
      'LOCAL TEST amount too high',
      'LOCAL TEST option above supported amount.',
      '{"localTestData":true}'::jsonb,
      'USD',
      100000000,
      0
    )
  $$,
  null,
  null,
  '100,000,000 minor units is rejected while quote remains draft'
);

select throws_ok(
  $$
    insert into public.quote_options (
      quote_version_id,
      title,
      description,
      scope_snapshot,
      line_items,
      currency,
      total_minor,
      deposit_minor
    )
    values (
      'fa000000-0000-4000-8000-000000000010',
      'LOCAL TEST overflowing line items',
      'LOCAL TEST line-item total exceeds supported amount.',
      '{"localTestData":true}'::jsonb,
      '[{"description":"Too high","amount":{"amountMinor":100000000,"currency":"USD"}}]'::jsonb,
      'USD',
      99999999,
      0
    )
  $$,
  null,
  null,
  'line-item sum cannot overflow or mismatch trusted option total'
);

insert into public.quote_status_events (
  quote_version_id,
  status,
  actor,
  changed_by,
  idempotency_key
)
values (
  'fa000000-0000-4000-8000-000000000010',
  'sent',
  'admin',
  '11111111-1111-4111-8111-111111111111',
  'amount-boundary|sent'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

select results_eq(
  $$
    select created
    from public.submit_counteroffer(
      'fa000000-0000-4000-8000-000000000010',
      'fa000000-0000-4000-8000-000000000011',
      99999999,
      'Boundary counteroffer',
      'amount-boundary|counter'
    )
  $$,
  array[true],
  'counteroffer accepts the exact maximum amount'
);

select throws_ok(
  $$
    select *
    from public.submit_counteroffer(
      'fa000000-0000-4000-8000-000000000010',
      'fa000000-0000-4000-8000-000000000011',
      100000000,
      'Too-high counteroffer',
      'amount-boundary|counter-high'
    )
  $$,
  null,
  null,
  'counteroffer RPC rejects 100,000,000 minor units'
);

select results_eq(
  $$
    select created
    from public.accept_quote(
      'fa000000-0000-4000-8000-000000000010',
      'amount-boundary|accept',
      'fa000000-0000-4000-8000-000000000011',
      null
    )
  $$,
  array[true],
  'quote acceptance succeeds at exact maximum amount'
);

select is(
  (
    select accepted_total_minor
    from public.commissions
    where design_request_id = 'fa000000-0000-4000-8000-000000000001'
  ),
  99999999::bigint,
  'accepted commission snapshot retains exact bounded total'
);

reset role;
update public.commissions
set status = 'final_payment_due'
where design_request_id = 'fa000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

select results_eq(
  $$
    select created, amount_minor
    from public.begin_payment_checkout(
      (select id from public.commissions where design_request_id = 'fa000000-0000-4000-8000-000000000001'),
      'amount-boundary|checkout'
    )
  $$,
  $$ values (true, 99999999::bigint) $$,
  'checkout reservation accepts and charges exact displayed total'
);

reset role;
alter table public.quote_options
  drop constraint quote_options_amounts;

insert into public.quote_options (
  id,
  quote_version_id,
  title,
  description,
  scope_snapshot,
  currency,
  total_minor,
  deposit_minor
)
values (
  'fa000000-0000-4000-8000-000000000021',
  'fa000000-0000-4000-8000-000000000020',
  'LOCAL TEST corrupt legacy high option',
  'LOCAL TEST simulated legacy option.',
  '{"localTestData":true,"legacy":true}'::jsonb,
  'USD',
  100000000,
  0
);

insert into public.quote_status_events (
  quote_version_id,
  status,
  actor,
  changed_by,
  idempotency_key
)
values (
  'fa000000-0000-4000-8000-000000000020',
  'sent',
  'admin',
  '11111111-1111-4111-8111-111111111111',
  'amount-boundary|legacy-sent'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

select throws_ok(
  $$
    select *
    from public.accept_quote(
      'fa000000-0000-4000-8000-000000000020',
      'amount-boundary|legacy-accept',
      'fa000000-0000-4000-8000-000000000021',
      null
    )
  $$,
  null,
  null,
  'acceptance RPC rejects simulated legacy total above Checkout bound'
);

reset role;
alter table public.commissions disable trigger commissions_snapshot_guard;
alter table public.commissions
  drop constraint commissions_amounts;
update public.commissions
set accepted_total_minor = 100000000
where design_request_id = 'fa000000-0000-4000-8000-000000000001';
alter table public.commissions enable trigger commissions_snapshot_guard;

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

select throws_ok(
  $$
    select *
    from public.begin_payment_checkout(
      (select id from public.commissions where design_request_id = 'fa000000-0000-4000-8000-000000000001'),
      'amount-boundary|legacy-checkout'
    )
  $$,
  null,
  null,
  'checkout reservation rejects simulated legacy commission above bound'
);

select is(
  (
    select count(*)::integer
    from public.payments
    where commission_id = (
      select id
      from public.commissions
      where design_request_id = 'fa000000-0000-4000-8000-000000000001'
    )
  ),
  1,
  'rejected legacy checkout creates no orphan payment attempt'
);

select * from finish();
rollback;
