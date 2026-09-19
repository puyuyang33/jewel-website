begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(26);

insert into public.quote_versions (
  id,
  design_request_id,
  version_number,
  title,
  terms,
  currency,
  production_weeks,
  created_by
)
values (
  '70000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  2,
  'LOCAL TEST draft quote',
  'LOCAL TEST TERMS: this unsent quote must remain hidden from the customer.',
  'USD',
  10,
  '11111111-1111-4111-8111-111111111111'
);

insert into public.site_content (
  id,
  slug,
  content_type,
  title,
  body,
  status,
  created_by
)
values (
  '70000000-0000-4000-8000-000000000002',
  'local-private-draft',
  'test_fixture',
  'LOCAL TEST unpublished content',
  '{"localTestData":true}'::jsonb,
  'draft',
  '11111111-1111-4111-8111-111111111111'
);

insert into public.portfolio_projects (
  id,
  slug,
  title,
  excerpt,
  story,
  status,
  created_by
)
values (
  '70000000-0000-4000-8000-000000000030',
  'local-draft-project',
  'LOCAL TEST draft project',
  'LOCAL TEST unpublished excerpt.',
  'LOCAL TEST unpublished portfolio story.',
  'draft',
  '11111111-1111-4111-8111-111111111111'
);

insert into public.portfolio_media (
  id,
  portfolio_project_id,
  object_path,
  alt_text
)
values (
  '70000000-0000-4000-8000-000000000031',
  '70000000-0000-4000-8000-000000000030',
  'local-fixtures/private-draft.webp',
  'LOCAL TEST unpublished portfolio image'
);

insert into storage.objects (
  id,
  bucket_id,
  name,
  metadata
)
values (
  '70000000-0000-4000-8000-000000000032',
  'portfolio-public',
  'local-fixtures/private-draft.webp',
  '{"mimetype":"image/webp","size":1024}'::jsonb
);

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
    '70000000-0000-4000-8000-000000000003',
    '22222222-2222-4222-8222-222222222222',
    'DR-LOCAL-CONVERSATION-OPEN',
    'LOCAL TEST open conversation request',
    'ring',
    'LOCAL TEST DATA: owner may create an open conversation for this request.',
    'open',
    now()
  ),
  (
    '70000000-0000-4000-8000-000000000004',
    '22222222-2222-4222-8222-222222222222',
    'DR-LOCAL-CONVERSATION-ARCHIVED',
    'LOCAL TEST archived conversation denial',
    'ring',
    'LOCAL TEST DATA: owner may not choose archived as an initial conversation status.',
    'open',
    now()
  ),
  (
    '70000000-0000-4000-8000-000000000005',
    '33333333-3333-4333-8333-333333333333',
    'DR-LOCAL-CONVERSATION-OTHER',
    'LOCAL TEST other customer conversation',
    'pendant',
    'LOCAL TEST DATA: another customer cannot open a conversation for this request.',
    'open',
    now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

select is(public.is_active_admin(), true, 'confirmed allowlisted Google identity is an admin');

select ok(
  (select count(*) >= 4 from public.profiles),
  'active admin can see customer profiles'
);

select is(
  (select count(*)::integer from public.admin_notes),
  1,
  'active admin can read internal notes'
);

select is(
  (
    select count(*)::integer
    from public.quote_versions
    where id = '70000000-0000-4000-8000-000000000001'
  ),
  1,
  'active admin can read an unsent quote'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

select is(
  public.is_active_admin(),
  false,
  'an inactive allowlist entry does not authorize an unconfirmed Google identity'
);

select is(
  (select count(*)::integer from public.admin_notes),
  0,
  'unconfirmed allowlisted identity cannot read internal notes'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

select is(
  (select count(*)::integer from public.profiles),
  1,
  'customer can only read their own profile'
);

select is(
  (select count(*)::integer from public.design_requests),
  3,
  'customer can read only their own design requests'
);

select is(
  (select count(*)::integer from public.messages),
  2,
  'customer can read messages in their own conversation'
);

select is(
  (select count(*)::integer from public.admin_notes),
  0,
  'customer cannot read internal notes'
);

select is(
  (select count(*)::integer from public.quote_versions),
  1,
  'customer sees the sent quote but not its draft successor'
);

select results_eq(
  $$
    select created
    from public.send_message(
      '61000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000011',
      'LOCAL TEST MESSAGE: this is an authorized customer message.',
      '{}'::uuid[]
    )
  $$,
  array[true],
  'customer can send a message in their own open conversation'
);

select throws_ok(
  $$
    insert into public.messages (
      conversation_id,
      sender_id,
      sender_kind,
      client_message_id,
      body
    )
    values (
      '61000000-0000-4000-8000-000000000001',
      '22222222-2222-4222-8222-222222222222',
      'customer',
      '70000000-0000-4000-8000-000000000013',
      'LOCAL TEST direct insert must be denied.'
    )
  $$,
  null,
  null,
  'customer cannot bypass send_message with a direct message insert'
);

select throws_ok(
  $$
    insert into public.message_attachments (
      owner_id,
      client_attachment_id,
      object_path,
      file_name,
      mime_type,
      byte_size,
      sha256_hex,
      verified_at
    )
    values (
      '22222222-2222-4222-8222-222222222222',
      '70000000-0000-4000-8000-000000000014',
      '22222222-2222-4222-8222-222222222222/messages/direct.webp',
      'direct.webp',
      'image/webp',
      100,
      repeat('f', 64),
      now()
    )
  $$,
  null,
  null,
  'customer cannot directly create or backdate attachment records'
);

select throws_ok(
  $$
    insert into storage.objects (
      id,
      bucket_id,
      name,
      metadata
    )
    values (
      '70000000-0000-4000-8000-000000000033',
      'portfolio-public',
      'customer-forbidden.webp',
      '{"mimetype":"image/webp","size":100}'::jsonb
    )
  $$,
  null,
  null,
  'customer cannot write private portfolio storage objects'
);

select lives_ok(
  $$
    insert into public.conversations (
      id,
      design_request_id,
      customer_id,
      subject,
      status
    )
    values (
      '70000000-0000-4000-8000-000000000020',
      '70000000-0000-4000-8000-000000000003',
      '22222222-2222-4222-8222-222222222222',
      'LOCAL TEST valid owner conversation',
      'open'
    )
  $$,
  'owner can create a conversation with the valid initial open status'
);

select throws_ok(
  $$
    insert into public.conversations (
      id,
      design_request_id,
      customer_id,
      subject,
      status
    )
    values (
      '70000000-0000-4000-8000-000000000021',
      '70000000-0000-4000-8000-000000000004',
      '22222222-2222-4222-8222-222222222222',
      'LOCAL TEST invalid archived conversation',
      'archived'
    )
  $$,
  null,
  null,
  'owner cannot choose archived as the initial conversation status'
);

select throws_ok(
  $$
    insert into public.conversations (
      id,
      design_request_id,
      customer_id,
      subject,
      status
    )
    values (
      '70000000-0000-4000-8000-000000000022',
      '70000000-0000-4000-8000-000000000005',
      '22222222-2222-4222-8222-222222222222',
      'LOCAL TEST unauthorized customer conversation',
      'open'
    )
  $$,
  null,
  null,
  'customer cannot create an open conversation for another owner request'
);

select throws_ok(
  $$
    insert into public.messages (
      conversation_id,
      sender_id,
      sender_kind,
      client_message_id,
      body
    )
    values (
      '61000000-0000-4000-8000-000000000001',
      '22222222-2222-4222-8222-222222222222',
      'admin',
      '70000000-0000-4000-8000-000000000012',
      'LOCAL TEST MESSAGE: this spoofed admin message must fail.'
    )
  $$,
  null,
  null,
  'customer cannot spoof the admin sender kind'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}',
  true
);

select is(
  (
    select count(*)::integer
    from public.design_requests
    where customer_id = '22222222-2222-4222-8222-222222222222'
  ),
  0,
  'one customer cannot read another customer''s request'
);

select throws_ok(
  $$ select count(*) from private.audit_logs $$,
  null,
  null,
  'customer cannot query private audit logs'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (
    select count(*)::integer
    from public.site_content
    where status = 'published'
  ),
  2,
  'anonymous visitor can read fictional published site content'
);

select is(
  (
    select count(*)::integer
    from public.site_content
    where id = '70000000-0000-4000-8000-000000000002'
  ),
  0,
  'anonymous visitor cannot read unpublished site content'
);

select is(
  (
    select count(*)::integer
    from public.portfolio_projects
    where status = 'published'
  ),
  2,
  'anonymous visitor can query only published portfolio metadata'
);

select is(
  (
    select count(*)::integer
    from public.portfolio_media
    where portfolio_project_id = '70000000-0000-4000-8000-000000000030'
  ),
  0,
  'anonymous visitor cannot read draft portfolio media metadata'
);

select is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'portfolio-public'
      and name = 'local-fixtures/private-draft.webp'
  ),
  0,
  'anonymous visitor cannot list or read a draft portfolio storage object'
);

select * from finish();
rollback;
