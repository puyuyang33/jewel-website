begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(34);

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
    'stripe-events|accept',
    '64000000-0000-4000-8000-000000000001',
    null
  );
end;
$setup$;

reset role;
update public.commissions
set status = 'final_payment_due'
where design_request_id = '60000000-0000-4000-8000-000000000001';

set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $setup$
declare
  commission_uuid uuid;
begin
  select id
  into commission_uuid
  from public.commissions
  where design_request_id = '60000000-0000-4000-8000-000000000001';

  perform *
  from public.record_verified_payment(
    'stripe',
    'evt_local_stripe_payment',
    'payment_intent.succeeded',
    repeat('a', 64),
    '{"object":"payment_intent","localTestData":true}'::jsonb,
    commission_uuid,
    'pi_local_refund_dispute',
    'idem_local_refund_dispute',
    'final',
    'USD',
    390000,
    'succeeded',
    '2026-09-17T06:00:00Z'::timestamptz,
    null,
    0
  );

  perform *
  from public.transition_commission_status(
    commission_uuid,
    'final_payment_due',
    'paid',
    'Verified local payment',
    'stripe-events|paid'
  );
end;
$setup$;

select results_eq(
  $$
    select payment_created, duplicate_event
    from public.record_verified_payment(
      'stripe',
      'evt_local_stripe_payment_tie',
      'payment_intent.processing',
      repeat('9', 64),
      '{"object":"payment_intent","localTestData":true}'::jsonb,
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'pi_local_refund_dispute',
      'idem_local_refund_dispute',
      'final',
      'USD',
      390000,
      'processing',
      '2026-09-17T06:00:00Z'::timestamptz,
      null,
      0
    )
  $$,
  $$ values (false, false) $$,
  'same-timestamp lower-rank payment event is logged without contradiction'
);

select is(
  (
    select status
    from public.payments
    where provider_payment_id = 'pi_local_refund_dispute'
  ),
  'succeeded'::public.payment_status,
  'same-timestamp stale event cannot regress succeeded payment truth'
);

select results_eq(
  $$
    select created, effective_dispute_status, resulting_commission_status
    from public.record_stripe_dispute_event(
      'evt_local_dispute_open',
      'charge.dispute.created',
      repeat('b', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      'dp_local_001',
      'under_review',
      'USD',
      390000,
      'fraudulent',
      '2026-09-17T06:20:00Z'::timestamptz,
      '{"object":"dispute","localTestData":true}'::jsonb
    )
  $$,
  $$ values (true, 'under_review'::text, 'disputed'::public.commission_status) $$,
  'verified active dispute atomically moves paid commission to disputed'
);

select results_eq(
  $$
    select created, effective_dispute_status, resulting_commission_status
    from public.record_stripe_dispute_event(
      'evt_local_dispute_open',
      'charge.dispute.created',
      repeat('b', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      'dp_local_001',
      'under_review',
      'USD',
      390000,
      'fraudulent',
      '2026-09-17T06:20:00Z'::timestamptz,
      '{"object":"dispute","localTestData":true}'::jsonb
    )
  $$,
  $$ values (false, 'under_review'::text, 'disputed'::public.commission_status) $$,
  'duplicate dispute event returns the original derived result'
);

select results_eq(
  $$
    select created, effective_dispute_status, resulting_commission_status
    from public.record_stripe_dispute_event(
      'evt_local_dispute_older_win',
      'charge.dispute.closed',
      repeat('c', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      'dp_local_001',
      'won',
      'USD',
      390000,
      'fraudulent',
      '2026-09-17T06:10:00Z'::timestamptz,
      '{"object":"dispute","localTestData":true}'::jsonb
    )
  $$,
  $$ values (true, 'under_review'::text, 'disputed'::public.commission_status) $$,
  'out-of-order older dispute event is logged without regressing effective state'
);

select results_eq(
  $$
    select created, effective_dispute_status, resulting_commission_status
    from public.record_stripe_dispute_event(
      'evt_local_dispute_won',
      'charge.dispute.closed',
      repeat('d', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      'dp_local_001',
      'won',
      'USD',
      390000,
      'fraudulent',
      '2026-09-17T06:30:00Z'::timestamptz,
      '{"object":"dispute","localTestData":true}'::jsonb
    )
  $$,
  $$ values (true, 'won'::text, 'paid'::public.commission_status) $$,
  'latest resolved dispute restores disputed commission to paid'
);

select results_eq(
  $$
    select created, effective_dispute_status, resulting_commission_status
    from public.record_stripe_dispute_event(
      'evt_local_dispute_prevented',
      'charge.dispute.closed',
      repeat('4', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      'dp_local_001',
      'prevented',
      'USD',
      390000,
      'fraudulent',
      '2026-09-17T06:31:00Z'::timestamptz,
      '{"object":"dispute","localTestData":true}'::jsonb
    )
  $$,
  $$ values (true, 'prevented'::text, 'paid'::public.commission_status) $$,
  'prevented is accepted as a resolved non-blocking dispute state'
);

select results_eq(
  $$
    select created, cumulative_refunded_minor, resulting_commission_status
    from public.record_stripe_refund_event(
      'evt_local_refund_requires_action',
      'refund.updated',
      repeat('0', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      're_local_requires_action',
      'requires_action',
      'USD',
      1000,
      '2026-09-17T06:31:30Z'::timestamptz,
      '{"object":"refund","localTestData":true}'::jsonb
    )
  $$,
  $$ values (true, 0::bigint, 'disputed'::public.commission_status) $$,
  'requires_action refund is persisted and blocks commission clearance'
);

select results_eq(
  $$
    select created, cumulative_refunded_minor, resulting_commission_status
    from public.record_stripe_refund_event(
      'evt_local_refund_requires_action',
      'refund.updated',
      repeat('0', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      're_local_requires_action',
      'requires_action',
      'USD',
      1000,
      '2026-09-17T06:31:30Z'::timestamptz,
      '{"object":"refund","localTestData":true}'::jsonb
    )
  $$,
  $$ values (false, 0::bigint, 'disputed'::public.commission_status) $$,
  'requires_action refund replay is idempotent'
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
  'b0000000-0000-4000-8000-000000000001',
  commissions.id,
  commissions.customer_id,
  'design_package',
  'released',
  'LOCAL TEST blocked refund deliverable',
  'blocked-refund.pdf',
  'application/pdf',
  100,
  repeat('a', 64),
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
  'b0000000-0000-4000-8000-000000000001',
  '22222222-2222-4222-8222-222222222222/deliverables/blocked-refund.pdf',
  'https://storage.local.test/private/blocked-refund.pdf'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

select is(
  public.commission_payment_is_clear(
    (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
    '22222222-2222-4222-8222-222222222222'
  ),
  false,
  'requires_action refund denies customer payment clearance and delivery'
);

select results_eq(
  $$
    select authorized, resulting_commission_status
    from public.authorize_deliverable_access(
      'b0000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000002',
      '192.0.2.30'::inet,
      'pgTAP refund block'
    )
  $$,
  $$ values (false, 'disputed'::public.commission_status) $$,
  'requires_action refund denies actual deliverable authorization'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select results_eq(
  $$
    select created, cumulative_refunded_minor, resulting_commission_status
    from public.record_stripe_refund_event(
      'evt_local_refund_requires_action_resolved',
      'refund.updated',
      repeat('1', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      're_local_requires_action',
      'failed',
      'USD',
      1000,
      '2026-09-17T06:31:45Z'::timestamptz,
      '{"object":"refund","localTestData":true}'::jsonb
    )
  $$,
  $$ values (true, 0::bigint, 'paid'::public.commission_status) $$,
  'newer failed event resolves requires_action without changing refund total'
);

select is(
  (
    select count(*)::integer
    from private.stripe_dispute_events
    where provider_dispute_id = 'dp_local_001'
  ),
  4,
  'dispute ledger retains each unique verified event'
);

select throws_ok(
  $$
    update private.stripe_dispute_events
    set reason = 'mutated'
    where provider_event_id = 'evt_local_dispute_open'
  $$,
  null,
  null,
  'dispute ledger is immutable'
);

select results_eq(
  $$
    select
      created,
      cumulative_refunded_minor,
      resulting_payment_status,
      resulting_commission_status
    from public.record_stripe_refund_event(
      'evt_local_refund_tie_pending',
      'refund.updated',
      repeat('5', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      're_local_tie',
      'pending',
      'USD',
      5000,
      '2026-09-17T06:32:00Z'::timestamptz,
      '{"object":"refund","localTestData":true}'::jsonb
    )
  $$,
  $$
    values (
      true,
      0::bigint,
      'succeeded'::public.payment_status,
      'disputed'::public.commission_status
    )
  $$,
  'pending refund fails commission closed without changing monetary truth'
);

select results_eq(
  $$
    select created, cumulative_refunded_minor, resulting_commission_status
    from public.record_stripe_refund_event(
      'evt_local_refund_tie_failed',
      'refund.updated',
      repeat('6', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      're_local_tie',
      'failed',
      'USD',
      5000,
      '2026-09-17T06:32:00Z'::timestamptz,
      '{"object":"refund","localTestData":true}'::jsonb
    )
  $$,
  $$ values (true, 0::bigint, 'disputed'::public.commission_status) $$,
  'same-timestamp conflicting refund states remain ambiguous and blocking'
);

select results_eq(
  $$
    select created, cumulative_refunded_minor, resulting_commission_status
    from public.record_stripe_refund_event(
      'evt_local_refund_tie_resolved',
      'refund.updated',
      repeat('7', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      're_local_tie',
      'failed',
      'USD',
      5000,
      '2026-09-17T06:33:00Z'::timestamptz,
      '{"object":"refund","localTestData":true}'::jsonb
    )
  $$,
  $$ values (true, 0::bigint, 'paid'::public.commission_status) $$,
  'newer unambiguous failed refund resolves the fail-closed commission state'
);

select results_eq(
  $$
    select
      created,
      cumulative_refunded_minor,
      resulting_payment_status,
      resulting_commission_status
    from public.record_stripe_charge_refunded_event(
      'evt_local_charge_refund_aggregate',
      'charge.refunded',
      repeat('a', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      'ch_local_001',
      'USD',
      50000,
      '2026-09-17T06:34:00Z'::timestamptz,
      '{"object":"charge","localTestData":true}'::jsonb
    )
  $$,
  $$
    values (
      true,
      50000::bigint,
      'partially_refunded'::public.payment_status,
      'disputed'::public.commission_status
    )
  $$,
  'aggregate charge refund derives provider cumulative amount without a synthetic refund ID'
);

select results_eq(
  $$
    select created, cumulative_refunded_minor, resulting_payment_status
    from public.record_stripe_charge_refunded_event(
      'evt_local_charge_refund_aggregate',
      'charge.refunded',
      repeat('a', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      'ch_local_001',
      'USD',
      50000,
      '2026-09-17T06:34:00Z'::timestamptz,
      '{"object":"charge","localTestData":true}'::jsonb
    )
  $$,
  $$ values (false, 50000::bigint, 'partially_refunded'::public.payment_status) $$,
  'aggregate charge refund replay is idempotent'
);

select results_eq(
  $$
    select created, cumulative_refunded_minor, resulting_payment_status
    from public.record_stripe_charge_refunded_event(
      'evt_local_charge_refund_older',
      'charge.refunded',
      repeat('b', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      'ch_local_001',
      'USD',
      25000,
      '2026-09-17T06:33:30Z'::timestamptz,
      '{"object":"charge","localTestData":true}'::jsonb
    )
  $$,
  $$ values (true, 50000::bigint, 'partially_refunded'::public.payment_status) $$,
  'out-of-order lower aggregate cannot decrease cumulative refund truth'
);

select is(
  (
    select count(*)::integer
    from private.stripe_charge_refund_events
    where provider_charge_id = 'ch_local_001'
  ),
  2,
  'aggregate charge refund ledger preserves unique verified receipts'
);

select results_eq(
  $$
    select
      created,
      cumulative_refunded_minor,
      resulting_payment_status,
      resulting_commission_status
    from public.record_stripe_refund_event(
      'evt_local_refund_one',
      'refund.updated',
      repeat('e', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      're_local_001',
      'succeeded',
      'USD',
      100000,
      '2026-09-17T06:40:00Z'::timestamptz,
      '{"object":"refund","localTestData":true}'::jsonb
    )
  $$,
  $$
    values (
      true,
      100000::bigint,
      'partially_refunded'::public.payment_status,
      'disputed'::public.commission_status
    )
  $$,
  'first succeeded refund derives cumulative amount and disputes commission'
);

select results_eq(
  $$
    select created, cumulative_refunded_minor, resulting_payment_status
    from public.record_stripe_refund_event(
      'evt_local_refund_one',
      'refund.updated',
      repeat('e', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      're_local_001',
      'succeeded',
      'USD',
      100000,
      '2026-09-17T06:40:00Z'::timestamptz,
      '{"object":"refund","localTestData":true}'::jsonb
    )
  $$,
  $$ values (false, 100000::bigint, 'partially_refunded'::public.payment_status) $$,
  'duplicate refund event returns the existing cumulative state'
);

select results_eq(
  $$
    select created, cumulative_refunded_minor, resulting_payment_status
    from public.record_stripe_refund_event(
      'evt_local_refund_older_failure',
      'refund.updated',
      repeat('f', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      're_local_001',
      'failed',
      'USD',
      100000,
      '2026-09-17T06:35:00Z'::timestamptz,
      '{"object":"refund","localTestData":true}'::jsonb
    )
  $$,
  $$ values (true, 100000::bigint, 'partially_refunded'::public.payment_status) $$,
  'out-of-order failed refund cannot decrease cumulative refunded amount'
);

select results_eq(
  $$
    select created, cumulative_refunded_minor, resulting_payment_status
    from public.record_stripe_refund_event(
      'evt_local_refund_two',
      'refund.updated',
      repeat('1', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      're_local_002',
      'succeeded',
      'USD',
      290000,
      '2026-09-17T06:50:00Z'::timestamptz,
      '{"object":"refund","localTestData":true}'::jsonb
    )
  $$,
  $$ values (true, 390000::bigint, 'refunded'::public.payment_status) $$,
  'multiple succeeded refunds monotonically derive a full refund'
);

select results_eq(
  $$
    select refunded_minor, status
    from public.payments
    where provider_payment_id = 'pi_local_refund_dispute'
  $$,
  $$ values (390000::bigint, 'refunded'::public.payment_status) $$,
  'stored payment truth reflects cumulative verified refunds'
);

select is(
  (
    select count(*)::integer
    from private.stripe_refund_events
    where payment_id = (
      select id
      from public.payments
      where provider_payment_id = 'pi_local_refund_dispute'
    )
  ),
  8,
  'refund ledger retains unique and out-of-order events'
);

select throws_ok(
  $$
    select *
    from public.record_stripe_refund_event(
      'evt_local_refund_excess',
      'refund.updated',
      repeat('2', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      're_local_excess',
      'succeeded',
      'USD',
      390001,
      '2026-09-17T07:00:00Z'::timestamptz,
      '{"object":"refund","localTestData":true}'::jsonb
    )
  $$,
  null,
  null,
  'refund event cannot exceed stored payment amount'
);

select throws_ok(
  $$
    select *
    from public.record_stripe_refund_event(
      'evt_local_aggregate_charge_refund',
      'charge.refunded',
      repeat('8', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      're_not_available_on_aggregate',
      'succeeded',
      'USD',
      100000,
      '2026-09-17T07:01:00Z'::timestamptz,
      '{"object":"charge","localTestData":true}'::jsonb
    )
  $$,
  null,
  null,
  'aggregate charge.refunded event fails closed without a canonical refund ID'
);

select throws_ok(
  $$
    select *
    from public.record_stripe_dispute_event(
      'evt_local_refund_one',
      'charge.dispute.created',
      repeat('e', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      'dp_wrong_family',
      'under_review',
      'USD',
      390000,
      null,
      '2026-09-17T06:40:00Z'::timestamptz,
      '{"object":"dispute","localTestData":true}'::jsonb
    )
  $$,
  null,
  null,
  'global Stripe receipt rejects provider event reuse across families'
);

select is(
  (
    select status
    from public.commissions
    where design_request_id = '60000000-0000-4000-8000-000000000001'
  ),
  'disputed'::public.commission_status,
  'verified refund leaves active commission fail-closed in disputed'
);

select is(
  (
    select count(*)::integer
    from private.stripe_event_receipts
    where event_family in ('payment', 'refund', 'dispute')
  ),
  16,
  'global Stripe receipt ledger contains payment, refund, and dispute identities'
);

select throws_ok(
  $$
    update private.stripe_refund_events
    set refund_status = 'failed'
    where provider_event_id = 'evt_local_refund_one'
  $$,
  null,
  null,
  'refund ledger is immutable'
);

reset role;
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
    from public.record_stripe_refund_event(
      'evt_forbidden_browser_refund',
      'refund.updated',
      repeat('3', 64),
      (select id from public.payments where provider_payment_id = 'pi_local_refund_dispute'),
      'pi_local_refund_dispute',
      're_forbidden',
      'succeeded',
      'USD',
      1,
      '2026-09-17T07:10:00Z'::timestamptz,
      '{}'::jsonb
    )
  $$,
  null,
  null,
  'authenticated browser cannot invoke verified refund workflow'
);

select * from finish();
rollback;
