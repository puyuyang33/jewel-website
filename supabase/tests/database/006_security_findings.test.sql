begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);

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
    'security-fixes|accept',
    '64000000-0000-4000-8000-000000000001',
    null
  );
end;
$setup$;

reset role;
update public.commissions
set status = 'draft_review'
where design_request_id = '60000000-0000-4000-8000-000000000001';

insert into public.design_drafts (
  id,
  commission_id,
  sequence_number,
  stage,
  title,
  status,
  published_at,
  created_by
)
select
  fixtures.id,
  commissions.id,
  fixtures.sequence_number,
  'concept',
  fixtures.title,
  'shared',
  now(),
  '11111111-1111-4111-8111-111111111111'
from public.commissions
cross join (
  values
    ('a1000000-0000-4000-8000-000000000001'::uuid, 1::smallint, 'LOCAL TEST older shared draft'),
    ('a1000000-0000-4000-8000-000000000002'::uuid, 2::smallint, 'LOCAL TEST latest shared draft')
) as fixtures(id, sequence_number, title)
where commissions.design_request_id = '60000000-0000-4000-8000-000000000001';

insert into public.draft_revisions (
  id,
  design_draft_id,
  revision_number,
  status,
  summary,
  specifications,
  created_by,
  published_at
)
values
  (
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    1,
    'shared',
    'LOCAL TEST older shared revision',
    '{"localTestData":true,"version":1}'::jsonb,
    '11111111-1111-4111-8111-111111111111',
    now() - interval '2 minutes'
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000002',
    1,
    'shared',
    'LOCAL TEST latest shared revision',
    '{"localTestData":true,"version":2}'::jsonb,
    '11111111-1111-4111-8111-111111111111',
    now() - interval '1 minute'
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
    from public.transition_commission_status(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'draft_review',
      'draft_approved',
      'Unsafe generic customer approval',
      'security-fixes|generic-customer'
    )
  $$,
  '42501',
  null,
  'customer cannot invoke the generic commission transition'
);

select is(
  (
    with attempted as (
      update public.draft_revisions
      set status = 'approved'
      where id = 'a2000000-0000-4000-8000-000000000001'
      returning id
    )
    select count(*)::integer from attempted
  ),
  0,
  'customer cannot directly approve a shared revision'
);

select throws_ok(
  $$
    select *
    from public.approve_latest_draft_revision(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'a2000000-0000-4000-8000-000000000001',
      1,
      'a3000000-0000-4000-8000-000000000001',
      'Approve obsolete version'
    )
  $$,
  '40001',
  null,
  'obsolete shared draft approval is rejected'
);

select results_eq(
  $$
    select created, resulting_commission_status
    from public.approve_latest_draft_revision(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'a2000000-0000-4000-8000-000000000002',
      1,
      'a3000000-0000-4000-8000-000000000002',
      'Approved latest'
    )
  $$,
  $$ values (true, 'draft_approved'::public.commission_status) $$,
  'customer approves exactly the latest shared revision'
);

select results_eq(
  $$
    select created, resulting_commission_status
    from public.approve_latest_draft_revision(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'a2000000-0000-4000-8000-000000000002',
      1,
      'a3000000-0000-4000-8000-000000000002',
      'Approved latest'
    )
  $$,
  $$ values (false, 'draft_approved'::public.commission_status) $$,
  'latest approval replay is idempotent'
);

reset role;

do $fixtures$
declare
  commission_uuid uuid;
begin
  select id into commission_uuid
  from public.commissions
  where design_request_id = '60000000-0000-4000-8000-000000000001';

  update public.commissions set status = 'draft_review' where id = commission_uuid;

  for sequence_value in 3..5 loop
    insert into public.design_drafts (
      id,
      commission_id,
      sequence_number,
      stage,
      title,
      status,
      published_at,
      created_by
    )
    values (
      ('a1000000-0000-4000-8000-' || lpad(sequence_value::text, 12, '0'))::uuid,
      commission_uuid,
      sequence_value,
      'revision',
      'LOCAL TEST revision round ' || sequence_value,
      'shared',
      now(),
      '11111111-1111-4111-8111-111111111111'
    );

    insert into public.draft_revisions (
      id,
      design_draft_id,
      revision_number,
      status,
      summary,
      specifications,
      created_by,
      published_at
    )
    values (
      ('a2000000-0000-4000-8000-' || lpad(sequence_value::text, 12, '0'))::uuid,
      ('a1000000-0000-4000-8000-' || lpad(sequence_value::text, 12, '0'))::uuid,
      1,
      'shared',
      'LOCAL TEST shared revision ' || sequence_value,
      jsonb_build_object('localTestData', true, 'round', sequence_value),
      '11111111-1111-4111-8111-111111111111',
      now()
    );
  end loop;
end;
$fixtures$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

select results_eq(
  $$
    select created, remaining_revision_rounds, complimentary
    from public.request_latest_draft_revision(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'a2000000-0000-4000-8000-000000000005',
      1,
      'First included revision',
      'a3000000-0000-4000-8000-000000000003',
      null
    )
  $$,
  $$ values (true, 1, false) $$,
  'first customer revision consumes one included round'
);

reset role;
update public.commissions
set status = 'draft_review'
where design_request_id = '60000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

select results_eq(
  $$
    select created, remaining_revision_rounds, complimentary
    from public.request_latest_draft_revision(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'a2000000-0000-4000-8000-000000000004',
      1,
      'Second included revision',
      'a3000000-0000-4000-8000-000000000004',
      null
    )
  $$,
  $$ values (true, 0, false) $$,
  'second customer revision exhausts included allowance'
);

reset role;
update public.commissions
set status = 'draft_review'
where design_request_id = '60000000-0000-4000-8000-000000000001';

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
    from public.request_latest_draft_revision(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'a2000000-0000-4000-8000-000000000003',
      1,
      'Third included revision should fail',
      'a3000000-0000-4000-8000-000000000005',
      null
    )
  $$,
  null,
  null,
  'customer revision request is denied when allowance is exhausted'
);

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
    select created, complimentary
    from public.request_latest_draft_revision(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'a2000000-0000-4000-8000-000000000003',
      1,
      'Complimentary atelier revision',
      'a3000000-0000-4000-8000-000000000006',
      'Atelier-authorized complimentary correction'
    )
  $$,
  $$ values (true, true) $$,
  'active admin can authorize a reasoned complimentary revision'
);

reset role;
update public.commissions
set status = 'final_payment_due'
where design_request_id = '60000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

do $checkout$
begin
  perform *
  from public.begin_payment_checkout(
    (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
    'security-fixes|checkout'
  );
end;
$checkout$;

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
    from public.transition_commission_status(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'final_payment_due',
      'cancelled',
      'Unsafe cancellation',
      'security-fixes|active-checkout-cancel'
    )
  $$,
  null,
  null,
  'admin cannot cancel while an active Checkout reservation exists'
);

reset role;
update public.payments
set status = 'cancelled'
where commission_id = (
  select id
  from public.commissions
  where design_request_id = '60000000-0000-4000-8000-000000000001'
)
  and kind = 'final'
  and attempt_number = 1;

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
    select changed
    from public.transition_commission_status(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'final_payment_due',
      'cancelled',
      'Checkout reservation cancelled',
      'security-fixes|cancelled'
    )
  $$,
  array[true],
  'admin can cancel after the payment reservation is terminal'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select results_eq(
  $$
    select payment_created, duplicate_event
    from public.record_verified_payment(
      'stripe',
      'evt_security_late_payment',
      'payment_intent.succeeded',
      repeat('c', 64),
      '{"object":"payment_intent","localTestData":true}'::jsonb,
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'pi_security_late_payment',
      (
        select provider_idempotency_key
        from public.payments
        where commission_id = (
          select id
          from public.commissions
          where design_request_id = '60000000-0000-4000-8000-000000000001'
        )
          and kind = 'final'
          and attempt_number = 1
      ),
      'final',
      'USD',
      390000,
      'succeeded',
      '2026-09-17T08:00:00Z'::timestamptz,
      null,
      0
    )
  $$,
  $$ values (false, false) $$,
  'late verified payment adopts the cancelled reservation'
);

select results_eq(
  $$
    select payments.status, commissions.status
    from public.payments
    inner join public.commissions
      on commissions.id = payments.commission_id
    where payments.provider_payment_id = 'pi_security_late_payment'
  $$,
  $$ values ('succeeded'::public.payment_status, 'disputed'::public.commission_status) $$,
  'late charge is durably recorded and cancelled commission becomes disputed'
);

reset role;
update public.commissions
set status = 'aftercare'
where design_request_id = '60000000-0000-4000-8000-000000000001';

insert into public.aftercare_cases (
  id,
  commission_id,
  customer_id,
  client_request_id,
  category,
  subject,
  description,
  opened_by
)
select
  fixtures.id,
  commissions.id,
  commissions.customer_id,
  fixtures.client_request_id,
  'care',
  fixtures.subject,
  'LOCAL TEST DATA: aftercare completion guard case.',
  commissions.customer_id
from public.commissions
cross join (
  values
    ('a4000000-0000-4000-8000-000000000001'::uuid, 'a4000000-0000-4000-8000-000000000011'::uuid, 'LOCAL TEST first aftercare case'),
    ('a4000000-0000-4000-8000-000000000002'::uuid, 'a4000000-0000-4000-8000-000000000012'::uuid, 'LOCAL TEST second aftercare case')
) as fixtures(id, client_request_id, subject)
where commissions.design_request_id = '60000000-0000-4000-8000-000000000001';

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
    from public.transition_commission_status(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'aftercare',
      'completed',
      'Unsafe direct completion',
      'security-fixes|unsafe-aftercare-complete'
    )
  $$,
  '42501',
  null,
  'customer cannot bypass case completion with generic transition'
);

select results_eq(
  $$
    select completed
    from public.complete_aftercare_case(
      'a4000000-0000-4000-8000-000000000001',
      'LOCAL TEST first case completed safely.',
      'security-fixes|aftercare-one'
    )
  $$,
  array[true],
  'customer completes a loaded aftercare case'
);

select is(
  (
    select status
    from public.commissions
    where design_request_id = '60000000-0000-4000-8000-000000000001'
  ),
  'aftercare'::public.commission_status,
  'open aftercare case prevents commission completion'
);

reset role;

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
    'a5000000-0000-4000-8000-000000000001',
    '33333333-3333-4333-8333-333333333333',
    'DR-SECURITY-COUNTER-CURRENT',
    'LOCAL TEST current counteroffer request',
    'pendant',
    'LOCAL TEST DATA: current quote for trusted counteroffer derivation.',
    'quoted',
    now()
  ),
  (
    'a5000000-0000-4000-8000-000000000002',
    '33333333-3333-4333-8333-333333333333',
    'DR-SECURITY-COUNTER-EXPIRED',
    'LOCAL TEST expired counteroffer request',
    'pendant',
    'LOCAL TEST DATA: expired quote must reject counteroffer submission.',
    'quoted',
    now() - interval '3 days'
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
  created_by,
  created_at
)
values
  (
    'a5000000-0000-4000-8000-000000000010',
    'a5000000-0000-4000-8000-000000000001',
    1,
    'LOCAL TEST current quote',
    'LOCAL TEST TERMS',
    'USD',
    8,
    now() + interval '1 day',
    '11111111-1111-4111-8111-111111111111',
    now()
  ),
  (
    'a5000000-0000-4000-8000-000000000020',
    'a5000000-0000-4000-8000-000000000002',
    1,
    'LOCAL TEST expired quote',
    'LOCAL TEST TERMS',
    'USD',
    8,
    now() - interval '1 day',
    '11111111-1111-4111-8111-111111111111',
    now() - interval '3 days'
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
    'a5000000-0000-4000-8000-000000000011',
    'a5000000-0000-4000-8000-000000000010',
    'LOCAL TEST trusted option',
    'LOCAL TEST trusted option description',
    '{"metal":"trusted-gold","hiddenTerm":"server-only"}'::jsonb,
    'USD',
    200000,
    0
  ),
  (
    'a5000000-0000-4000-8000-000000000021',
    'a5000000-0000-4000-8000-000000000020',
    'LOCAL TEST expired option',
    'LOCAL TEST expired option description',
    '{"metal":"trusted-silver"}'::jsonb,
    'USD',
    150000,
    0
  );

insert into public.quote_status_events (
  id,
  quote_version_id,
  status,
  actor,
  changed_by,
  idempotency_key,
  occurred_at
)
values
  (
    'a5000000-0000-4000-8000-000000000012',
    'a5000000-0000-4000-8000-000000000010',
    'sent',
    'admin',
    '11111111-1111-4111-8111-111111111111',
    'security-counter|sent-current',
    now()
  ),
  (
    'a5000000-0000-4000-8000-000000000022',
    'a5000000-0000-4000-8000-000000000020',
    'sent',
    'admin',
    '11111111-1111-4111-8111-111111111111',
    'security-counter|sent-expired',
    now() - interval '2 days'
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
      'a5000000-0000-4000-8000-000000000010',
      'a5000000-0000-4000-8000-000000000011',
      180000,
      'LOCAL TEST derived counteroffer',
      'security-counter|submit'
    )
  $$,
  array[true],
  'customer submits counteroffer only through narrow RPC'
);

select results_eq(
  $$
    select currency, proposed_deposit_minor, proposed_scope
    from public.quote_counteroffers
    where idempotency_key = 'security-counter|submit'
  $$,
  $$ values ('USD'::text, 0::bigint, '{"metal":"trusted-gold","hiddenTerm":"server-only"}'::jsonb) $$,
  'counteroffer currency, deposit, and hidden scope derive from trusted option'
);

select throws_ok(
  $$
    insert into public.quote_counteroffers (
      quote_version_id,
      quote_option_id,
      customer_id,
      idempotency_key,
      version_number,
      currency,
      proposed_total_minor,
      proposed_deposit_minor,
      proposed_scope,
      customer_note
    )
    values (
      'a5000000-0000-4000-8000-000000000010',
      'a5000000-0000-4000-8000-000000000011',
      '33333333-3333-4333-8333-333333333333',
      'security-counter|smuggled',
      99,
      'EUR',
      1,
      0,
      '{"hiddenTerm":"smuggled"}'::jsonb,
      'smuggled'
    )
  $$,
  null,
  null,
  'customer cannot directly insert smuggled counteroffer fields'
);

select throws_ok(
  $$
    select *
    from public.submit_counteroffer(
      'a5000000-0000-4000-8000-000000000020',
      'a5000000-0000-4000-8000-000000000021',
      140000,
      'Expired quote attempt',
      'security-counter|expired'
    )
  $$,
  null,
  null,
  'expired quote rejects counteroffer submission'
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
    from public.submit_counteroffer(
      'a5000000-0000-4000-8000-000000000010',
      'a5000000-0000-4000-8000-000000000011',
      180000,
      'Cross customer attempt',
      'security-counter|cross-customer'
    )
  $$,
  null,
  null,
  'cross-customer counteroffer is denied'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into storage.objects (id, bucket_id, name, metadata)
values
  (
    'a6000000-0000-4000-8000-000000000101',
    'commission-private',
    '22222222-2222-4222-8222-222222222222/messages/security-one.webp',
    '{"mimetype":"image/webp","size":1024}'::jsonb
  ),
  (
    'a6000000-0000-4000-8000-000000000102',
    'commission-private',
    '22222222-2222-4222-8222-222222222222/messages/security-two.webp',
    '{"mimetype":"image/webp","size":1024}'::jsonb
  );

do $attachments$
begin
  perform * from public.register_message_attachment_upload(
    '22222222-2222-4222-8222-222222222222',
    'a6000000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222/messages/security-one.webp',
    'security-one.webp',
    'image/webp',
    1024,
    repeat('d', 64)
  );
  perform * from public.register_message_attachment_upload(
    '22222222-2222-4222-8222-222222222222',
    'a6000000-0000-4000-8000-000000000002',
    '22222222-2222-4222-8222-222222222222/messages/security-two.webp',
    'security-two.webp',
    'image/webp',
    1024,
    repeat('e', 64)
  );
end;
$attachments$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

select results_eq(
  $$
    select created
    from public.send_message(
      '61000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000010',
      '',
      array[(
        select id
        from public.message_attachments
        where client_attachment_id = 'a6000000-0000-4000-8000-000000000001'
      )]
    )
  $$,
  array[true],
  'attachment-only message atomically binds verified upload'
);

select results_eq(
  $$
    select created
    from public.send_message(
      '61000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000010',
      '',
      array[(
        select id
        from public.message_attachments
        where client_attachment_id = 'a6000000-0000-4000-8000-000000000001'
      )]
    )
  $$,
  array[false],
  'message replay preserves finalized attachment set'
);

select ok(
  (
    select sent_at >= transaction_timestamp()
    from public.messages
    where client_message_id = 'a6000000-0000-4000-8000-000000000010'
  ),
  'message timestamp is assigned by the server'
);

select throws_ok(
  $$
    select *
    from public.send_message(
      '61000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000010',
      '',
      array[
        (select id from public.message_attachments where client_attachment_id = 'a6000000-0000-4000-8000-000000000001'),
        (select id from public.message_attachments where client_attachment_id = 'a6000000-0000-4000-8000-000000000002')
      ]
    )
  $$,
  null,
  null,
  'attachment cannot be appended to an old message replay'
);

reset role;
update public.conversations
set status = 'closed',
    closed_at = now()
where id = '61000000-0000-4000-8000-000000000001';

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
    from public.send_message(
      '61000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000011',
      'Closed conversation',
      array[(
        select id
        from public.message_attachments
        where client_attachment_id = 'a6000000-0000-4000-8000-000000000002'
      )]
    )
  $$,
  null,
  null,
  'closed conversation rejects new message and attachment binding'
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
    from public.send_message(
      '61000000-0000-4000-8000-000000000001',
      'a6000000-0000-4000-8000-000000000012',
      'Cross customer',
      '{}'::uuid[]
    )
  $$,
  null,
  null,
  'cross-customer message send is denied'
);

select * from finish();
rollback;
