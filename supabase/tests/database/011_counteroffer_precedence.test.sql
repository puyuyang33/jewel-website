begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

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
    'ab000000-0000-4000-8000-000000000001',
    '33333333-3333-4333-8333-333333333333',
    'DR-COUNTER-PRECEDENCE',
    'LOCAL TEST accepted counteroffer precedence',
    'ring',
    'LOCAL TEST DATA: accepted counteroffer must override original quote option.',
    'quoted',
    now()
  ),
  (
    'ab000000-0000-4000-8000-000000000002',
    '33333333-3333-4333-8333-333333333333',
    'DR-OPTION-FIRST',
    'LOCAL TEST original option first',
    'ring',
    'LOCAL TEST DATA: late admin decision must not race an existing acceptance.',
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
    'ab000000-0000-4000-8000-000000000010',
    'ab000000-0000-4000-8000-000000000001',
    1,
    'LOCAL TEST counter precedence quote',
    'LOCAL TEST TERMS',
    'USD',
    8,
    now() + interval '1 day',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    'ab000000-0000-4000-8000-000000000020',
    'ab000000-0000-4000-8000-000000000002',
    1,
    'LOCAL TEST option-first quote',
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
    'ab000000-0000-4000-8000-000000000011',
    'ab000000-0000-4000-8000-000000000010',
    'LOCAL TEST original option',
    'LOCAL TEST original option terms.',
    '{"metal":"gold","trusted":true}'::jsonb,
    'USD',
    200000,
    0
  ),
  (
    'ab000000-0000-4000-8000-000000000021',
    'ab000000-0000-4000-8000-000000000020',
    'LOCAL TEST original option two',
    'LOCAL TEST original option terms two.',
    '{"metal":"platinum","trusted":true}'::jsonb,
    'USD',
    210000,
    0
  );

insert into public.quote_status_events (
  quote_version_id,
  status,
  actor,
  changed_by,
  idempotency_key
)
values
  (
    'ab000000-0000-4000-8000-000000000010',
    'sent',
    'admin',
    '11111111-1111-4111-8111-111111111111',
    'counter-precedence|sent'
  ),
  (
    'ab000000-0000-4000-8000-000000000020',
    'sent',
    'admin',
    '11111111-1111-4111-8111-111111111111',
    'option-first|sent'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

do $counteroffers$
begin
  perform * from public.submit_counteroffer(
    'ab000000-0000-4000-8000-000000000010',
    'ab000000-0000-4000-8000-000000000011',
    180000,
    'Accepted counter terms',
    'counter-precedence|submit'
  );
  perform * from public.submit_counteroffer(
    'ab000000-0000-4000-8000-000000000020',
    'ab000000-0000-4000-8000-000000000021',
    190000,
    'Pending counter terms',
    'option-first|submit'
  );
end;
$counteroffers$;

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
    select decision, created
    from public.decide_counteroffer(
      (
        select id from public.quote_counteroffers
        where idempotency_key = 'counter-precedence|submit'
      ),
      'accepted',
      'Accepted by atelier',
      'counter-precedence|decision'
    )
  $$,
  $$ values ('accepted'::public.counteroffer_decision, true) $$,
  'admin atomically accepts the counteroffer'
);

select results_eq(
  $$
    select decision, created
    from public.decide_counteroffer(
      (
        select id from public.quote_counteroffers
        where idempotency_key = 'counter-precedence|submit'
      ),
      'accepted',
      'Accepted by atelier',
      'counter-precedence|decision'
    )
  $$,
  $$ values ('accepted'::public.counteroffer_decision, false) $$,
  'counteroffer decision replay is idempotent'
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
      'ab000000-0000-4000-8000-000000000010',
      'counter-precedence|original-option',
      'ab000000-0000-4000-8000-000000000011',
      null
    )
  $$,
  null,
  null,
  'accepted counteroffer prevents acceptance of original option terms'
);

select results_eq(
  $$
    select created
    from public.accept_quote(
      'ab000000-0000-4000-8000-000000000010',
      'counter-precedence|accept-counter',
      null,
      (
        select id from public.quote_counteroffers
        where idempotency_key = 'counter-precedence|submit'
      )
    )
  $$,
  array[true],
  'customer accepts only the currently accepted counteroffer'
);

select is(
  (
    select accepted_total_minor
    from public.quote_acceptances
    where design_request_id = 'ab000000-0000-4000-8000-000000000001'
  ),
  180000::bigint,
  'accepted snapshot uses trusted counteroffer terms'
);

select results_eq(
  $$
    select created
    from public.accept_quote(
      'ab000000-0000-4000-8000-000000000020',
      'option-first|accept',
      'ab000000-0000-4000-8000-000000000021',
      null
    )
  $$,
  array[true],
  'original option may be accepted while all counteroffers remain pending'
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
    select *
    from public.decide_counteroffer(
      (
        select id from public.quote_counteroffers
        where idempotency_key = 'option-first|submit'
      ),
      'accepted',
      'Too late',
      'option-first|late-decision'
    )
  $$,
  null,
  null,
  'admin cannot accept a counteroffer after original option acceptance'
);

select * from finish();
rollback;
