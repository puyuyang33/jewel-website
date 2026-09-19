begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(15);

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
    'c0000000-0000-4000-8000-000000000001',
    '33333333-3333-4333-8333-333333333333',
    'DR-INBOX-ALPHA',
    'Inbox fixture alpha request',
    'ring',
    'LOCAL TEST DATA: ranked inbox alpha conversation fixture.',
    'open',
    now()
  ),
  (
    'c0000000-0000-4000-8000-000000000002',
    '33333333-3333-4333-8333-333333333333',
    'DR-INBOX-BETA',
    'Inbox fixture beta request',
    'pendant',
    'LOCAL TEST DATA: ranked inbox beta conversation fixture.',
    'open',
    now()
  );

insert into public.conversations (
  id,
  design_request_id,
  customer_id,
  subject,
  status
)
values
  (
    'c1000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    '33333333-3333-4333-8333-333333333333',
    'Inbox fixture alpha',
    'open'
  ),
  (
    'c1000000-0000-4000-8000-000000000002',
    'c0000000-0000-4000-8000-000000000002',
    '33333333-3333-4333-8333-333333333333',
    'Inbox fixture beta',
    'archived'
  );

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
    'd0000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000001',
    '33333333-3333-4333-8333-333333333333',
    'customer',
    'd1000000-0000-4000-8000-000000000001',
    'Alpha first message',
    '2026-01-01T12:00:00Z'
  ),
  (
    'd0000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000001',
    '33333333-3333-4333-8333-333333333333',
    'customer',
    'd1000000-0000-4000-8000-000000000002',
    'Alpha same-time unread message',
    '2026-01-01T12:00:00Z'
  ),
  (
    'd0000000-0000-4000-8000-000000000003',
    'c1000000-0000-4000-8000-000000000002',
    '33333333-3333-4333-8333-333333333333',
    'customer',
    'd1000000-0000-4000-8000-000000000003',
    'Beta same-time read message',
    '2026-01-01T12:00:00Z'
  );

update public.conversations
set last_message_at = '2026-01-01T12:00:00Z',
    last_message_id = case id
      when 'c1000000-0000-4000-8000-000000000001'
        then 'd0000000-0000-4000-8000-000000000002'::uuid
      else 'd0000000-0000-4000-8000-000000000003'::uuid
    end
where id in (
  'c1000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000002'
);

insert into public.conversation_read_markers (
  conversation_id,
  user_id,
  last_read_message_id,
  last_read_at
)
values
  (
    'c1000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'd0000000-0000-4000-8000-000000000001',
    '2026-01-01T12:00:00Z'
  ),
  (
    'c1000000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    'd0000000-0000-4000-8000-000000000003',
    '2026-01-01T12:00:00Z'
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
  $$ select * from public.admin_list_ranked_inbox() $$,
  '42501',
  null,
  'customer cannot query the ranked admin inbox'
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
  (
    select count(*)::integer
    from public.admin_list_ranked_inbox(
      p_limit => 1,
      p_search => 'Inbox fixture'
    )
  ),
  1,
  'ranked inbox enforces the requested page bound'
);

select results_eq(
  $$
    select conversation_id
    from public.admin_list_ranked_inbox(
      p_limit => 10,
      p_search => 'Inbox fixture'
    )
  $$,
  $$
    values
      ('c1000000-0000-4000-8000-000000000002'::uuid),
      ('c1000000-0000-4000-8000-000000000001'::uuid)
  $$,
  'same activity timestamp orders deterministically by conversation ID descending'
);

select results_eq(
  $$
    select has_more, next_activity_at, next_conversation_id
    from public.admin_list_ranked_inbox(
      p_limit => 1,
      p_search => 'Inbox fixture'
    )
  $$,
  $$
    values (
      true,
      '2026-01-01T12:00:00Z'::timestamptz,
      'c1000000-0000-4000-8000-000000000002'::uuid
    )
  $$,
  'bounded page returns deterministic next keyset cursor'
);

select results_eq(
  $$
    select conversation_id
    from public.admin_list_ranked_inbox(
      p_limit => 10,
      p_before_activity_at => '2026-01-01T12:00:00Z',
      p_before_conversation_id => 'c1000000-0000-4000-8000-000000000002',
      p_search => 'Inbox fixture'
    )
  $$,
  $$ values ('c1000000-0000-4000-8000-000000000001'::uuid) $$,
  'keyset cursor returns the next deterministic conversation'
);

select is(
  (
    select unread_count
    from public.admin_list_ranked_inbox(
      p_search => 'Inbox fixture alpha'
    )
  ),
  1::bigint,
  'same-timestamp message ID boundary produces deterministic unread count'
);

select results_eq(
  $$
    select conversation_id
    from public.admin_list_ranked_inbox(
      p_search => 'Inbox fixture',
      p_unread_only => true
    )
  $$,
  $$ values ('c1000000-0000-4000-8000-000000000001'::uuid) $$,
  'unread-only filter does not promote read conversations'
);

select results_eq(
  $$
    select conversation_id
    from public.admin_list_ranked_inbox(
      p_search => 'beta request'
    )
  $$,
  $$ values ('c1000000-0000-4000-8000-000000000002'::uuid) $$,
  'literal search matches safe request and conversation fields'
);

select results_eq(
  $$
    select conversation_id
    from public.admin_list_ranked_inbox(
      p_search => 'Inbox fixture',
      p_status => 'archived'
    )
  $$,
  $$ values ('c1000000-0000-4000-8000-000000000002'::uuid) $$,
  'status filter returns only matching conversations'
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
    from public.send_message(
      'c1000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000010',
      'Newest alpha activity',
      '{}'::uuid[]
    )
  $$,
  array[true],
  'new customer message is accepted through hardened send RPC'
);

select results_eq(
  $$
    select created
    from public.send_message(
      'c1000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000010',
      'Newest alpha activity',
      '{}'::uuid[]
    )
  $$,
  array[false],
  'exact message replay does not create or bump activity twice'
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
  (
    select conversation_id
    from public.admin_list_ranked_inbox(
      p_limit => 1,
      p_search => 'Inbox fixture'
    )
  ),
  'c1000000-0000-4000-8000-000000000001'::uuid,
  'newest message activity reorders its conversation to the top'
);

select is(
  (
    select latest_preview
    from public.admin_list_ranked_inbox(
      p_search => 'Inbox fixture alpha'
    )
  ),
  'Newest alpha activity',
  'latest preview is the safe truncated latest message body'
);

update public.conversations
set status = 'archived'
where id = 'c1000000-0000-4000-8000-000000000001';

insert into public.admin_notes (
  conversation_id,
  author_id,
  body
)
values (
  'c1000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'LOCAL TEST internal note must not affect inbox activity.'
);

select is(
  (
    select inbox.activity_at = messages.sent_at
    from public.admin_list_ranked_inbox(
      p_search => 'Inbox fixture alpha'
    ) as inbox
    inner join public.messages
      on messages.id = inbox.latest_message_id
  ),
  true,
  'status and admin-note updates do not masquerade as message activity'
);

select is(
  (
    select
      count(*) = 1
      and bool_and(conversations.last_message_id = messages.id)
    from public.messages
    inner join public.conversations
      on conversations.id = messages.conversation_id
    where messages.client_message_id = 'd1000000-0000-4000-8000-000000000010'
  ),
  true,
  'message replay preserves one row and one server-owned activity pointer'
);

select * from finish();
rollback;
