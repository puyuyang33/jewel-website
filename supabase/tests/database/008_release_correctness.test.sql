begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

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
    'release-correctness|accept',
    '64000000-0000-4000-8000-000000000001',
    null
  );
end;
$setup$;

reset role;
update public.commissions
set status = 'in_progress'
where design_request_id = '60000000-0000-4000-8000-000000000001';

insert into public.design_drafts (
  id,
  commission_id,
  sequence_number,
  stage,
  title,
  created_by
)
select
  'e1000000-0000-4000-8000-000000000001',
  commissions.id,
  1,
  'concept',
  'LOCAL TEST working draft',
  '11111111-1111-4111-8111-111111111111'
from public.commissions
where design_request_id = '60000000-0000-4000-8000-000000000001';

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
      'in_progress',
      'draft_review',
      'Unsafe generic publication',
      'release-correctness|generic-publish'
    )
  $$,
  null,
  null,
  'generic admin transition cannot enter draft review without publication'
);

select throws_ok(
  $$
    select *
    from public.publish_latest_draft_revision(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'e1000000-0000-4000-8000-000000000001',
      'e2000000-0000-4000-8000-000000000099',
      1,
      'release-correctness|no-revision'
    )
  $$,
  '40001',
  null,
  'draft publication rejects a missing working revision'
);

reset role;

insert into public.draft_revisions (
  id,
  design_draft_id,
  revision_number,
  summary,
  specifications,
  created_by
)
values
  (
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    1,
    'LOCAL TEST obsolete working revision',
    '{"localTestData":true,"revision":1}'::jsonb,
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    'e2000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000001',
    2,
    'LOCAL TEST latest working revision',
    '{"localTestData":true,"revision":2}'::jsonb,
    '11111111-1111-4111-8111-111111111111'
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
    from public.publish_latest_draft_revision(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'e1000000-0000-4000-8000-000000000001',
      'e2000000-0000-4000-8000-000000000002',
      2,
      'release-correctness|no-assets'
    )
  $$,
  null,
  null,
  'draft publication rejects a latest revision without assets'
);

reset role;

insert into public.draft_revision_assets (
  id,
  draft_revision_id,
  object_path,
  file_name,
  mime_type,
  byte_size,
  sha256_hex
)
values
  (
    'e3000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222/drafts/revision-one.webp',
    'revision-one.webp',
    'image/webp',
    100,
    repeat('a', 64)
  ),
  (
    'e3000000-0000-4000-8000-000000000002',
    'e2000000-0000-4000-8000-000000000002',
    '22222222-2222-4222-8222-222222222222/drafts/revision-two.webp',
    'revision-two.webp',
    'image/webp',
    100,
    repeat('b', 64)
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
    from public.publish_latest_draft_revision(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'e1000000-0000-4000-8000-000000000001',
      'e2000000-0000-4000-8000-000000000001',
      1,
      'release-correctness|stale-revision'
    )
  $$,
  '40001',
  null,
  'draft publication rejects an obsolete working revision'
);

select results_eq(
  $$
    select created, resulting_commission_status
    from public.publish_latest_draft_revision(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'e1000000-0000-4000-8000-000000000001',
      'e2000000-0000-4000-8000-000000000002',
      2,
      'release-correctness|publish'
    )
  $$,
  $$ values (true, 'draft_review'::public.commission_status) $$,
  'admin atomically publishes the latest working revision'
);

select results_eq(
  $$
    select created, resulting_commission_status
    from public.publish_latest_draft_revision(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'e1000000-0000-4000-8000-000000000001',
      'e2000000-0000-4000-8000-000000000002',
      2,
      'release-correctness|publish'
    )
  $$,
  $$ values (false, 'draft_review'::public.commission_status) $$,
  'draft publication replay is idempotent'
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
  (
    select count(*)::integer
    from public.draft_revisions
    where id = 'e2000000-0000-4000-8000-000000000002'
      and status = 'shared'
      and published_at is not null
  ),
  1,
  'customer RLS sees the exact published shared revision'
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
    select created, resumed, attempt_number
    from public.begin_payment_checkout(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'release-correctness|click-1'
    )
  $$,
  $$ values (true, false, 1) $$,
  'first checkout click creates attempt generation one'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $attach$
begin
  perform *
  from public.attach_stripe_checkout_session(
    (select id from public.payments where attempt_number = 1 and kind = 'final'),
    (select provider_idempotency_key from public.payments where attempt_number = 1 and kind = 'final'),
    'cs_release_attempt_1',
    now(),
    now() + interval '1 hour'
  );
end;
$attach$;

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
    select created, resumed, attempt_number, provider_checkout_session_id
    from public.begin_payment_checkout(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'release-correctness|click-2'
    )
  $$,
  $$ values (false, true, 1, 'cs_release_attempt_1'::text) $$,
  'new click resumes the still-valid Checkout session'
);

select results_eq(
  $$
    select created, resumed, attempt_number
    from public.begin_payment_checkout(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'release-correctness|click-1'
    )
  $$,
  $$ values (false, true, 1) $$,
  'original request ID replays the same active attempt'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $expire$
begin
  perform *
  from public.record_stripe_checkout_event(
    'evt_release_checkout_expired',
    'checkout.session.expired',
    repeat('c', 64),
    'cs_release_attempt_1',
    now() + interval '1 hour',
    '{"object":"checkout.session","localTestData":true}'::jsonb
  );
end;
$expire$;

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
    select created, resumed, attempt_number
    from public.begin_payment_checkout(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'release-correctness|click-3'
    )
  $$,
  $$ values (true, false, 2) $$,
  'new request after expiration creates attempt generation two'
);

select results_eq(
  $$
    select created, resumed, attempt_number
    from public.begin_payment_checkout(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'release-correctness|simultaneous-click'
    )
  $$,
  $$ values (false, true, 2) $$,
  'simultaneous-style second request binds to the single active attempt'
);

select ok(
  (
    select count(*) = 2
      and count(distinct provider_idempotency_key) = 2
      and min(attempt_number) = 1
      and max(attempt_number) = 2
    from public.payments
    where commission_id = (
      select id
      from public.commissions
      where design_request_id = '60000000-0000-4000-8000-000000000001'
    )
      and kind = 'final'
  ),
  'checkout attempts preserve immutable history and unique deterministic provider keys'
);

reset role;
update public.payments
set status = 'failed',
    provider_payment_id = 'pi_release_failed_attempt'
where commission_id = (
  select id
  from public.commissions
  where design_request_id = '60000000-0000-4000-8000-000000000001'
)
  and kind = 'final'
  and attempt_number = 2;

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
    select created, resumed, attempt_number
    from public.begin_payment_checkout(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'release-correctness|click-4'
    )
  $$,
  $$ values (true, false, 3) $$,
  'new request after failed attempt creates generation three without reusing PI'
);

select is(
  (
    select amount_minor
    from public.payments
    where commission_id = (
      select id
      from public.commissions
      where design_request_id = '60000000-0000-4000-8000-000000000001'
    )
      and kind = 'final'
      and attempt_number = 3
  ),
  390000::bigint,
  'every checkout generation charges the immutable accepted total'
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
values (
  'e4000000-0000-4000-8000-000000000001',
  '33333333-3333-4333-8333-333333333333',
  'DR-RELEASE-DECLINE',
  'LOCAL TEST quote decline request',
  'ring',
  'LOCAL TEST DATA: declining one quote must not close the inquiry.',
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
values (
  'e4000000-0000-4000-8000-000000000010',
  'e4000000-0000-4000-8000-000000000001',
  1,
  'LOCAL TEST declined quote version',
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
values (
  'e4000000-0000-4000-8000-000000000011',
  'e4000000-0000-4000-8000-000000000010',
  'LOCAL TEST zero-deposit option',
  'LOCAL TEST quote option',
  '{"localTestData":true}'::jsonb,
  'USD',
  100000,
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
  'e4000000-0000-4000-8000-000000000010',
  'sent',
  'admin',
  '11111111-1111-4111-8111-111111111111',
  'release-correctness|quote-sent'
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
    select created, effective_status
    from public.transition_quote_status(
      'e4000000-0000-4000-8000-000000000010',
      'sent',
      'declined',
      'release-correctness|quote-declined'
    )
  $$,
  $$ values (true, 'declined'::public.quote_status) $$,
  'customer can decline an individual quote version'
);

select is(
  (
    select status
    from public.design_requests
    where id = 'e4000000-0000-4000-8000-000000000001'
  ),
  'quoted'::public.design_request_status,
  'declining one quote version keeps the inquiry quotable'
);

reset role;
update public.commissions
set status = 'delivered'
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
    select created, case_status, resulting_commission_status
    from public.open_aftercare_case(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'e5000000-0000-4000-8000-000000000001',
      'care',
      'LOCAL TEST customer aftercare',
      'LOCAL TEST DATA: customer safely opens aftercare.',
      'release-correctness|aftercare-open'
    )
  $$,
  $$ values (true, 'open'::public.aftercare_status, 'aftercare'::public.commission_status) $$,
  'customer opening first aftercare case atomically starts aftercare'
);

select results_eq(
  $$
    select created, resulting_commission_status
    from public.open_aftercare_case(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'e5000000-0000-4000-8000-000000000001',
      'care',
      'LOCAL TEST customer aftercare',
      'LOCAL TEST DATA: customer safely opens aftercare.',
      'release-correctness|aftercare-open'
    )
  $$,
  $$ values (false, 'aftercare'::public.commission_status) $$,
  'aftercare opening replay is idempotent'
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
    from public.open_aftercare_case(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'e5000000-0000-4000-8000-000000000002',
      'care',
      'Cross customer aftercare',
      'LOCAL TEST DATA: cross-customer aftercare must fail.',
      'release-correctness|aftercare-cross'
    )
  $$,
  null,
  null,
  'cross-customer aftercare initiation is denied'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$
    select intake_open, quote_validity_days, brand_name, contact_email
    from public.get_public_site_settings()
  $$,
  $$ values (true, 14, 'Veyra Atelier'::text, 'hello@veyra.local.test'::text) $$,
  'anonymous typed settings RPC returns only published public fields'
);

reset role;
update public.site_settings
set status = 'draft',
    published_at = null
where settings_key = 'public';

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select count(*)::integer from public.get_public_site_settings()),
  0,
  'unpublished settings are never exposed by the public helper'
);

select * from finish();
rollback;
