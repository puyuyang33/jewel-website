begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

insert into public.messages (
  id,
  conversation_id,
  sender_id,
  sender_kind,
  client_message_id,
  body,
  sent_at
)
values
  (
    'dc000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    'customer',
    'dc100000-0000-4000-8000-000000000001',
    'LOCAL TEST same timestamp low ID',
    '2026-09-17T10:00:00Z'
  ),
  (
    'dc000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    'customer',
    'dc100000-0000-4000-8000-000000000002',
    'LOCAL TEST same timestamp high ID',
    '2026-09-17T10:00:00Z'
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
    select advanced, last_read_message_id
    from public.advance_conversation_read_marker(
      '61000000-0000-4000-8000-000000000001',
      'dc000000-0000-4000-8000-000000000002'
    )
  $$,
  $$ values (true, 'dc000000-0000-4000-8000-000000000002'::uuid) $$,
  'customer advances marker to newer message'
);

select results_eq(
  $$
    select advanced, last_read_message_id
    from public.advance_conversation_read_marker(
      '61000000-0000-4000-8000-000000000001',
      'dc000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values (false, 'dc000000-0000-4000-8000-000000000002'::uuid) $$,
  'older same-timestamp tab cannot regress marker'
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
    select advanced, last_read_message_id
    from public.advance_conversation_read_marker(
      '61000000-0000-4000-8000-000000000001',
      'dc000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values (true, 'dc000000-0000-4000-8000-000000000001'::uuid) $$,
  'active admin has an independent read marker'
);

select results_eq(
  $$
    select advanced, last_read_message_id
    from public.advance_conversation_read_marker(
      '61000000-0000-4000-8000-000000000001',
      'dc000000-0000-4000-8000-000000000002'
    )
  $$,
  $$ values (true, 'dc000000-0000-4000-8000-000000000002'::uuid) $$,
  'equal timestamp advances only by greater UUID'
);

select results_eq(
  $$
    select advanced, last_read_message_id
    from public.advance_conversation_read_marker(
      '61000000-0000-4000-8000-000000000001',
      'dc000000-0000-4000-8000-000000000001'
    )
  $$,
  $$ values (false, 'dc000000-0000-4000-8000-000000000002'::uuid) $$,
  'concurrent older-after-newer admin update is a no-op'
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
    from public.advance_conversation_read_marker(
      '61000000-0000-4000-8000-000000000001',
      'dc000000-0000-4000-8000-000000000002'
    )
  $$,
  null,
  null,
  'cross-customer read marker update is denied'
);

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
  perform * from public.accept_quote(
    '63000000-0000-4000-8000-000000000001',
    'read-marker-draft|accept',
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
  'dd000000-0000-4000-8000-000000000001',
  commissions.id,
  1,
  'concept',
  'LOCAL TEST working parent',
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

select results_eq(
  $$
    select revision_number, status, created
    from public.create_draft_revision(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'dd000000-0000-4000-8000-000000000001',
      'LOCAL TEST revision one',
      'First notes',
      'read-marker-draft|revision-1'
    )
  $$,
  $$ values (1::smallint, 'working'::public.draft_status, true) $$,
  'admin creates first working draft revision atomically'
);

select results_eq(
  $$
    select revision_number, created
    from public.create_draft_revision(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'dd000000-0000-4000-8000-000000000001',
      'LOCAL TEST revision one',
      'First notes',
      'read-marker-draft|revision-1'
    )
  $$,
  $$ values (1::smallint, false) $$,
  'draft revision creation replay is idempotent'
);

select results_eq(
  $$
    select revision_number, created
    from public.create_draft_revision(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'dd000000-0000-4000-8000-000000000001',
      'LOCAL TEST revision two',
      'Second notes',
      'read-marker-draft|revision-2'
    )
  $$,
  $$ values (2::smallint, true) $$,
  'admin creates the next unique revision number'
);

reset role;
update public.design_drafts
set status = 'shared',
    published_at = now()
where id = 'dd000000-0000-4000-8000-000000000001';

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
    from public.create_draft_revision(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'dd000000-0000-4000-8000-000000000001',
      'FORBIDDEN historical revision',
      null,
      'read-marker-draft|historical'
    )
  $$,
  null,
  null,
  'shared historical parent rejects new revisions'
);

reset role;
update public.design_drafts
set status = 'superseded'
where id = 'dd000000-0000-4000-8000-000000000001';

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
    from public.create_draft_revision(
      (select id from public.commissions where design_request_id = '60000000-0000-4000-8000-000000000001'),
      'dd000000-0000-4000-8000-000000000001',
      'FORBIDDEN superseded revision',
      null,
      'read-marker-draft|superseded'
    )
  $$,
  null,
  null,
  'superseded parent rejects new revisions'
);

select * from finish();
rollback;
