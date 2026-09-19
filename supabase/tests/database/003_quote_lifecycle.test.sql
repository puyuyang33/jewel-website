begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(13);

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
values (
  '90000000-0000-4000-8000-000000000001',
  '33333333-3333-4333-8333-333333333333',
  'DR-LOCAL-ORIN-QUOTE-EVENTS',
  'LOCAL TEST append-only quote lifecycle',
  'pendant',
  'LOCAL TEST DATA: an independent request used to verify derived quote lifecycle behavior.',
  'open',
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
    '90000000-0000-4000-8000-000000000010',
    '90000000-0000-4000-8000-000000000001',
    1,
    'LOCAL TEST quote version one',
    'LOCAL TEST TERMS',
    'USD',
    8,
    now() + interval '1 day',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    '90000000-0000-4000-8000-000000000020',
    '90000000-0000-4000-8000-000000000001',
    2,
    'LOCAL TEST quote version two',
    'LOCAL TEST TERMS',
    'USD',
    8,
    now() + interval '1 day',
    '11111111-1111-4111-8111-111111111111'
  );

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
values
  (
    '90000000-0000-4000-8000-000000000011',
    '90000000-0000-4000-8000-000000000010',
    'LOCAL TEST option one',
    'LOCAL TEST first quote option',
    '{"localTestData":true,"version":1}'::jsonb,
    'USD',
    120000,
    0
  ),
  (
    '90000000-0000-4000-8000-000000000021',
    '90000000-0000-4000-8000-000000000020',
    'LOCAL TEST option two',
    'LOCAL TEST second quote option',
    '{"localTestData":true,"version":2}'::jsonb,
    'USD',
    125000,
    0
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
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
      '90000000-0000-4000-8000-000000000020',
      'LOCAL TEST forbidden deposit',
      'LOCAL TEST option with a nonzero deposit must fail.',
      '{"localTestData":true}'::jsonb,
      'USD',
      125000,
      1
    )
  $$,
  null,
  null,
  'nonzero quote option deposit is rejected for MVP'
);

select results_eq(
  $$
    select created, effective_status
    from public.transition_quote_status(
      '90000000-0000-4000-8000-000000000010',
      'draft',
      'sent',
      'quote-event|send|version-1'
    )
  $$,
  $$ values (true, 'sent'::public.quote_status) $$,
  'admin appends the sent event'
);

select results_eq(
  $$
    select created, effective_status
    from public.transition_quote_status(
      '90000000-0000-4000-8000-000000000010',
      'draft',
      'sent',
      'quote-event|send|version-1'
    )
  $$,
  $$ values (false, 'sent'::public.quote_status) $$,
  'sent event replay is idempotent'
);

select throws_ok(
  $$
    select *
    from public.transition_quote_status(
      '90000000-0000-4000-8000-000000000010',
      'draft',
      'cancelled',
      'quote-event|stale-cancel|version-1'
    )
  $$,
  '40001',
  null,
  'new quote transition rejects a stale expected status'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select results_eq(
  $$
    select created, effective_status
    from public.transition_quote_status(
      '90000000-0000-4000-8000-000000000010',
      'sent',
      'viewed',
      'quote-event|view|version-1'
    )
  $$,
  $$ values (true, 'viewed'::public.quote_status) $$,
  'system appends the viewed event'
);

reset role;
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
      '90000000-0000-4000-8000-000000000010',
      '90000000-0000-4000-8000-000000000011',
      115000,
      'LOCAL TEST COUNTEROFFER',
      'quote-counteroffer|local|1'
    )
  $$,
  array[true],
  'counteroffer appends quote activity through its relationship'
);

select is(
  (
    select status
    from public.quote_lifecycle
    where id = '90000000-0000-4000-8000-000000000010'
  ),
  'countered'::public.quote_status,
  'effective lifecycle derives countered from its append-only event'
);

reset role;
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
    select created, effective_status
    from public.transition_quote_status(
      '90000000-0000-4000-8000-000000000020',
      'draft',
      'sent',
      'quote-event|send|version-2'
    )
  $$,
  $$ values (true, 'sent'::public.quote_status) $$,
  'admin appends a sent event for the next quote version'
);

select results_eq(
  $$
    select version_number, status
    from public.quote_lifecycle
    where design_request_id = '90000000-0000-4000-8000-000000000001'
    order by version_number
  $$,
  $$
    values
      (1::smallint, 'superseded'::public.quote_status),
      (2::smallint, 'sent'::public.quote_status)
  $$,
  'later sent version derives superseded without mutating the earlier quote'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.quote_status_events
    where quote_version_id in (
      '90000000-0000-4000-8000-000000000010',
      '90000000-0000-4000-8000-000000000020'
    )
      and status in ('accepted', 'superseded', 'expired')
  ),
  0,
  'acceptance, supersession, and expiration are never persisted as events'
);

select is(
  private.effective_quote_status(
    '90000000-0000-4000-8000-000000000020',
    now() + interval '2 days'
  ),
  'expired'::public.quote_status,
  'expiration is derived against the effective evaluation time'
);

select throws_ok(
  $$
    update public.quote_status_events
    set metadata = '{"mutated":true}'::jsonb
    where quote_version_id = '90000000-0000-4000-8000-000000000010'
  $$,
  null,
  null,
  'quote lifecycle events cannot be mutated'
);

select throws_ok(
  $$
    update public.quote_versions
    set terms = 'mutated terms'
    where id = '90000000-0000-4000-8000-000000000010'
  $$,
  null,
  null,
  'sent quote payload remains immutable'
);

select * from finish();
rollback;
