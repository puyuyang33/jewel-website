begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(40);

set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into storage.objects (id, bucket_id, name, metadata)
values (
  '80000000-0000-4000-8000-000000000022',
  'commission-private',
  '22222222-2222-4222-8222-222222222222/messages/local-test.webp',
  '{"mimetype":"image/webp","size":1024}'::jsonb
);

do $setup$
begin
  perform *
  from public.register_message_attachment_upload(
    '22222222-2222-4222-8222-222222222222',
    '80000000-0000-4000-8000-000000000021',
    '22222222-2222-4222-8222-222222222222/messages/local-test.webp',
    'local-test.webp',
    'image/webp',
    1024,
    repeat('b', 64)
  );
end;
$setup$;

reset role;
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
      '80000000-0000-4000-8000-000000000020',
      '',
      array['80000000-0000-4000-8000-000000000021'::uuid]
    )
  $$,
  array[true],
  'message transaction supports attachment-only domain messages'
);

select results_eq(
  $$
    select created
    from public.send_message(
      '61000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000020',
      '',
      array['80000000-0000-4000-8000-000000000021'::uuid]
    )
  $$,
  array[false],
  'message transaction replay is idempotent'
);

select results_eq(
  $$
    select created
    from public.accept_quote(
      '63000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000001',
      '64000000-0000-4000-8000-000000000001',
      null
    )
  $$,
  array[true],
  'first quote acceptance creates the acceptance and commission atomically'
);

select results_eq(
  $$
    select created
    from public.accept_quote(
      '63000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000001',
      '64000000-0000-4000-8000-000000000001',
      null
    )
  $$,
  array[false],
  'replaying quote acceptance with the same key is idempotent'
);

select is(
  (
    select count(*)::integer
    from public.quote_acceptances
    where design_request_id = '60000000-0000-4000-8000-000000000001'
  ),
  1,
  'one request has only one accepted quote snapshot'
);

select is(
  (
    select accepted_total_minor
    from public.commissions
    where design_request_id = '60000000-0000-4000-8000-000000000001'
  ),
  390000::bigint,
  'commission copies the immutable accepted option total'
);

select is(
  (
    select status
    from public.quote_lifecycle
    where id = '63000000-0000-4000-8000-000000000001'
  ),
  'accepted'::public.quote_status,
  'accepted quote lifecycle status is recorded without changing its payload'
);

select is(
  (
    select accepted_quote_snapshot ->> 'schemaVersion'
    from public.commissions
    where design_request_id = '60000000-0000-4000-8000-000000000001'
  ),
  '1',
  'commission stores the canonical domain accepted-quote snapshot'
);

reset role;

select throws_ok(
  $$
    update public.quote_versions
    set title = 'mutated sent quote'
    where id = '63000000-0000-4000-8000-000000000001'
  $$,
  null,
  null,
  'sent quote version cannot be changed'
);

select throws_ok(
  $$
    update public.quote_options
    set total_minor = 1
    where id = '64000000-0000-4000-8000-000000000001'
  $$,
  null,
  null,
  'option on a sent quote cannot be changed'
);

select throws_ok(
  $$
    update public.quote_status_events
    set status = 'cancelled'
    where id = '64500000-0000-4000-8000-000000000001'
  $$,
  null,
  null,
  'quote lifecycle events are append-only'
);

select throws_ok(
  $$
    update public.quote_counteroffers
    set proposed_total_minor = 1
    where id = '65000000-0000-4000-8000-000000000001'
  $$,
  null,
  null,
  'submitted counteroffer cannot be changed'
);

select throws_ok(
  $$
    update public.quote_acceptances
    set accepted_total_minor = 1
    where design_request_id = '60000000-0000-4000-8000-000000000001'
  $$,
  null,
  null,
  'quote acceptance cannot be changed'
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
      (
        select id
        from public.commissions
        where design_request_id = '60000000-0000-4000-8000-000000000001'
      ),
      'awaiting_admin_confirmation',
      'confirmed',
      'Customer cannot confirm',
      '80000000-0000-4000-8000-000000000002'
    )
  $$,
  null,
  null,
  'customer cannot perform the admin confirmation transition'
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

select results_eq(
  $$
    select created, status
    from public.begin_payment_checkout(
      (
        select id
        from public.commissions
        where design_request_id = '60000000-0000-4000-8000-000000000001'
      ),
      'idem_local_test_final_001'
    )
  $$,
  $$ values (true, 'not_started'::public.payment_status) $$,
  'customer atomically reserves the final-payment checkout'
);

select results_eq(
  $$
    select created, status
    from public.begin_payment_checkout(
      (
        select id
        from public.commissions
        where design_request_id = '60000000-0000-4000-8000-000000000001'
      ),
      'idem_local_test_final_001'
    )
  $$,
  $$ values (false, 'not_started'::public.payment_status) $$,
  'checkout reservation replay is idempotent'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select results_eq(
  $$
    select attached, status
    from public.attach_stripe_checkout_session(
      (
        select id
        from public.payments
        where commission_id = (
          select id
          from public.commissions
          where design_request_id = '60000000-0000-4000-8000-000000000001'
        )
          and kind = 'final'
          and attempt_number = 1
      ),
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
      'cs_local_test_final_001',
      '2026-09-17T06:00:00Z'::timestamptz,
      '2026-09-17T07:00:00Z'::timestamptz
    )
  $$,
  $$ values (true, 'pending'::public.payment_status) $$,
  'service role attaches the Stripe checkout session'
);

select results_eq(
  $$
    select attached, status
    from public.attach_stripe_checkout_session(
      (
        select id
        from public.payments
        where commission_id = (
          select id
          from public.commissions
          where design_request_id = '60000000-0000-4000-8000-000000000001'
        )
          and kind = 'final'
          and attempt_number = 1
      ),
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
      'cs_local_test_final_001',
      '2026-09-17T06:00:00Z'::timestamptz,
      '2026-09-17T07:00:00Z'::timestamptz
    )
  $$,
  $$ values (false, 'pending'::public.payment_status) $$,
  'Stripe checkout attachment replay is idempotent'
);

select results_eq(
  $$
    select created, resulting_payment_status
    from public.record_stripe_checkout_event(
      'evt_local_checkout_expired',
      'checkout.session.expired',
      repeat('8', 64),
      'cs_local_test_final_001',
      '2026-09-17T07:00:00Z'::timestamptz,
      '{"object":"checkout.session","localTestData":true}'::jsonb
    )
  $$,
  $$ values (true, 'cancelled'::public.payment_status) $$,
  'verified expired Checkout session cancels pending reservation without a PI'
);

select results_eq(
  $$
    select created, resulting_payment_status
    from public.record_stripe_checkout_event(
      'evt_local_checkout_expired',
      'checkout.session.expired',
      repeat('8', 64),
      'cs_local_test_final_001',
      '2026-09-17T07:00:00Z'::timestamptz,
      '{"object":"checkout.session","localTestData":true}'::jsonb
    )
  $$,
  $$ values (false, 'cancelled'::public.payment_status) $$,
  'expired Checkout event replay is idempotent'
);

select results_eq(
  $$
    select payment_created, duplicate_event
    from public.record_verified_payment(
      'stripe',
      'evt_local_test_final_001',
      'payment_intent.succeeded',
      repeat('a', 64),
      '{"object":"payment_intent","localTestData":true}'::jsonb,
      (
        select id
        from public.commissions
        where design_request_id = '60000000-0000-4000-8000-000000000001'
      ),
      'pi_local_test_final_001',
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
      '2026-09-17T06:30:00Z'::timestamptz,
      null,
      0
    )
  $$,
  $$ values (false, false) $$,
  'verified service-role event completes the reserved payment'
);

select is(
  (
    select
      payments.amount_minor = commissions.accepted_total_minor
      and commissions.accepted_deposit_minor = 0
    from public.payments
    inner join public.commissions
      on commissions.id = payments.commission_id
    where payments.provider_payment_id = 'pi_local_test_final_001'
  ),
  true,
  'final payment equals displayed accepted total and deposit remains disabled'
);

select results_eq(
  $$
    select payment_created, duplicate_event
    from public.record_verified_payment(
      'stripe',
      'evt_local_test_final_001',
      'payment_intent.succeeded',
      repeat('a', 64),
      '{"object":"payment_intent","localTestData":true}'::jsonb,
      (
        select id
        from public.commissions
        where design_request_id = '60000000-0000-4000-8000-000000000001'
      ),
      'pi_local_test_final_001',
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
      '2026-09-17T06:30:00Z'::timestamptz,
      null,
      0
    )
  $$,
  $$ values (false, true) $$,
  'replaying a verified provider event is idempotent'
);

select results_eq(
  $$
    select created, resulting_payment_status
    from public.record_stripe_checkout_event(
      'evt_local_checkout_expired_delayed',
      'checkout.session.expired',
      repeat('9', 64),
      'cs_local_test_final_001',
      '2026-09-17T07:01:00Z'::timestamptz,
      '{"object":"checkout.session","localTestData":true}'::jsonb
    )
  $$,
  $$ values (true, 'succeeded'::public.payment_status) $$,
  'delayed expiration receipt cannot regress a succeeded PaymentIntent'
);

select results_eq(
  $$
    select changed
    from public.transition_commission_status(
      (
        select id
        from public.commissions
        where design_request_id = '60000000-0000-4000-8000-000000000001'
      ),
      'final_payment_due',
      'paid',
      'Verified final payment received',
      '80000000-0000-4000-8000-000000000004'
    )
  $$,
  array[true],
  'verified final payment permits the system paid transition'
);

reset role;

select is(
  (
    select count(*)::integer
    from private.payment_webhook_events
    where provider_event_id = 'evt_local_test_final_001'
  ),
  1,
  'provider event uniqueness prevents duplicate webhook records'
);

insert into public.deliverables (
  id,
  commission_id,
  customer_id,
  kind,
  status,
  title,
  file_name,
  mime_type,
  byte_size,
  sha256_hex,
  released_at,
  created_by
)
select
  '80000000-0000-4000-8000-000000000030',
  commissions.id,
  commissions.customer_id,
  'design_package',
  'released',
  'LOCAL TEST final design package',
  'local-design-package.pdf',
  'application/pdf',
  2048,
  repeat('d', 64),
  now(),
  '11111111-1111-4111-8111-111111111111'
from public.commissions
where design_request_id = '60000000-0000-4000-8000-000000000001';

insert into private.deliverable_secrets (
  deliverable_id,
  object_path,
  secret_url
)
values (
  '80000000-0000-4000-8000-000000000030',
  '22222222-2222-4222-8222-222222222222/deliverables/local-design-package.pdf',
  'https://storage.local.test/private/local-design-package.pdf'
);

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
    select authorized, resulting_commission_status
    from public.authorize_deliverable_access(
      '80000000-0000-4000-8000-000000000030',
      '80000000-0000-4000-8000-000000000031',
      '192.0.2.10'::inet,
      'pgTAP local test'
    )
  $$,
  $$ values (true, 'delivered'::public.commission_status) $$,
  'first customer deliverable access transitions paid to delivered'
);

select results_eq(
  $$
    select authorized, resulting_commission_status
    from public.authorize_deliverable_access(
      '80000000-0000-4000-8000-000000000030',
      '80000000-0000-4000-8000-000000000031',
      '192.0.2.10'::inet,
      'pgTAP local test'
    )
  $$,
  $$ values (true, 'delivered'::public.commission_status) $$,
  'deliverable access request replay is idempotent'
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
      where request_id = '80000000-0000-4000-8000-000000000031'
    ),
    '80000000-0000-4000-8000-000000000031',
    '22222222-2222-4222-8222-222222222222'
  ),
  'https://storage.local.test/private/local-design-package.pdf',
  'service role resolves only the URL for a recent allowed access'
);

reset role;

update public.commissions
set status = 'awaiting_admin_confirmation'
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
    select changed
    from public.transition_commission_status(
      (
        select id
        from public.commissions
        where design_request_id = '60000000-0000-4000-8000-000000000001'
      ),
      'awaiting_admin_confirmation',
      'confirmed',
      'Atelier confirmed the commission',
      '80000000-0000-4000-8000-000000000003'
    )
  $$,
  array[true],
  'admin can confirm an accepted commission'
);

select results_eq(
  $$
    select changed
    from public.transition_commission_status(
      (
        select id
        from public.commissions
        where design_request_id = '60000000-0000-4000-8000-000000000001'
      ),
      'awaiting_admin_confirmation',
      'confirmed',
      'Atelier confirmed the commission',
      '80000000-0000-4000-8000-000000000003'
    )
  $$,
  array[false],
  'replaying a commission transition is idempotent'
);

select is(
  (
    select count(*)::integer
    from public.commission_status_history
    where commission_id = (
      select id
      from public.commissions
      where design_request_id = '60000000-0000-4000-8000-000000000001'
    )
  ),
  4,
  'commission history contains initial, payment, first-access delivery, and admin transitions'
);

reset role;

select throws_ok(
  $$
    update public.commissions
    set accepted_total_minor = 2
    where design_request_id = '60000000-0000-4000-8000-000000000001'
  $$,
  null,
  null,
  'accepted commission snapshot cannot be changed'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

select is(
  (
    select count(*)::integer
    from generate_series(1, 21) as requests(sequence)
    cross join lateral public.consume_rate_limit(
      'deliverable_access',
      1 + (requests.sequence * 0)
    ) as result
    where result.allowed
  ),
  20,
  'database rate limiter allows only the configured request count'
);

select results_eq(
  $$
    select allowed
    from public.consume_rate_limit('deliverable_access', 1)
  $$,
  array[false],
  'database rate limiter continues denying the exhausted window'
);

reset role;

update public.commissions
set status = 'aftercare',
    delivered_at = coalesce(delivered_at, now())
where design_request_id = '60000000-0000-4000-8000-000000000001';

insert into public.aftercare_cases (
  id,
  commission_id,
  customer_id,
  client_request_id,
  category,
  subject,
  description,
  status,
  opened_by
)
select
  '80000000-0000-4000-8000-000000000010',
  commissions.id,
  commissions.customer_id,
  '80000000-0000-4000-8000-000000000011',
  'fit',
  'LOCAL TEST fit follow-up',
  'LOCAL TEST DATA: the fictional ring needs a small fit adjustment.',
  'open',
  commissions.customer_id
from public.commissions
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
    select completed
    from public.complete_aftercare_case(
      '80000000-0000-4000-8000-000000000010',
      'LOCAL TEST RESOLUTION: fit adjustment completed and inspected.',
      '80000000-0000-4000-8000-000000000012'
    )
  $$,
  array[true],
  'customer can complete aftercare transactionally'
);

select results_eq(
  $$
    select completed
    from public.complete_aftercare_case(
      '80000000-0000-4000-8000-000000000010',
      'LOCAL TEST RESOLUTION: fit adjustment completed and inspected.',
      '80000000-0000-4000-8000-000000000012'
    )
  $$,
  array[false],
  'aftercare completion replay is idempotent'
);

select is(
  (
    select status
    from public.commissions
    where design_request_id = '60000000-0000-4000-8000-000000000001'
  ),
  'completed'::public.commission_status,
  'finishing the final aftercare case completes an aftercare commission'
);

reset role;

select throws_ok(
  $$
    update public.aftercare_completions
    set resolution_summary = 'mutated completion record'
    where aftercare_case_id = '80000000-0000-4000-8000-000000000010'
  $$,
  null,
  null,
  'aftercare completion record is immutable'
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
    insert into public.payments (
      commission_id,
      customer_id,
      provider,
      provider_payment_id,
      provider_idempotency_key,
      kind,
      status,
      currency,
      amount_minor,
      provider_created_at,
      last_provider_event_at
    )
    select
      commissions.id,
      commissions.customer_id,
      'manual',
      'forbidden-direct-payment',
      'forbidden-direct-payment',
      'final',
      'succeeded',
      'USD',
      1,
      now(),
      now()
    from public.commissions
    where design_request_id = '60000000-0000-4000-8000-000000000001'
  $$,
  null,
  null,
  'customer cannot insert an unverified payment directly'
);

select * from finish();
rollback;
