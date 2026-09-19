begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

insert into public.design_requests (
  id,
  customer_id,
  reference_code,
  title,
  request_type,
  description
)
values (
  'ee000000-0000-4000-8000-000000000001',
  '22222222-2222-4222-8222-222222222222',
  'DR-UPLOAD-BYPASS',
  'LOCAL TEST upload draft request',
  'ring',
  'LOCAL TEST DATA: service-route upload metadata boundary fixture.'
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
    'upload-bypass|accept',
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
  'ee000000-0000-4000-8000-000000000010',
  commissions.id,
  1,
  'concept',
  'LOCAL TEST upload draft',
  '11111111-1111-4111-8111-111111111111'
from public.commissions
where design_request_id = '60000000-0000-4000-8000-000000000001';

insert into public.draft_revisions (
  id,
  design_draft_id,
  revision_number,
  status,
  summary,
  specifications,
  created_by
)
values (
  'ee000000-0000-4000-8000-000000000011',
  'ee000000-0000-4000-8000-000000000010',
  1,
  'working',
  'LOCAL TEST upload revision',
  '{"localTestData":true}'::jsonb,
  '11111111-1111-4111-8111-111111111111'
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
    insert into storage.objects (id, bucket_id, name, metadata)
    values (
      'ee000000-0000-4000-8000-000000000020',
      'commission-private',
      '22222222-2222-4222-8222-222222222222/direct-customer.webp',
      '{"mimetype":"image/webp","size":100}'::jsonb
    )
  $$,
  null,
  null,
  'ordinary customer cannot insert private storage object'
);

select throws_ok(
  $$
    insert into public.design_request_attachments (
      design_request_id,
      owner_id,
      client_attachment_id,
      object_path,
      file_name,
      mime_type,
      byte_size,
      sha256_hex
    )
    values (
      'ee000000-0000-4000-8000-000000000001',
      '22222222-2222-4222-8222-222222222222',
      'ee000000-0000-4000-8000-000000000021',
      '22222222-2222-4222-8222-222222222222/direct-request.webp',
      'direct-request.webp',
      'image/webp',
      100,
      repeat('a', 64)
    )
  $$,
  null,
  null,
  'ordinary customer cannot insert design request attachment metadata'
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
      'ee000000-0000-4000-8000-000000000022',
      '22222222-2222-4222-8222-222222222222/direct-message.webp',
      'direct-message.webp',
      'image/webp',
      100,
      repeat('b', 64),
      now()
    )
  $$,
  null,
  null,
  'ordinary customer cannot insert message attachment metadata'
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
    insert into storage.objects (id, bucket_id, name, metadata)
    values (
      'ee000000-0000-4000-8000-000000000023',
      'portfolio-public',
      'direct-admin.webp',
      '{"mimetype":"image/webp","size":100}'::jsonb
    )
  $$,
  null,
  null,
  'authenticated admin cannot insert portfolio storage object directly'
);

select throws_ok(
  $$
    insert into public.portfolio_media (
      portfolio_project_id,
      object_path,
      alt_text
    )
    values (
      '51000000-0000-4000-8000-000000000001',
      'direct-admin.webp',
      'FORBIDDEN direct admin media'
    )
  $$,
  null,
  null,
  'authenticated admin cannot insert portfolio media metadata directly'
);

select throws_ok(
  $$
    insert into public.draft_revision_assets (
      draft_revision_id,
      object_path,
      file_name,
      mime_type,
      byte_size,
      sha256_hex
    )
    values (
      'ee000000-0000-4000-8000-000000000011',
      '22222222-2222-4222-8222-222222222222/direct-draft.webp',
      'direct-draft.webp',
      'image/webp',
      100,
      repeat('c', 64)
    )
  $$,
  null,
  null,
  'authenticated admin cannot insert draft asset metadata directly'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select lives_ok(
  $$
    insert into storage.objects (id, bucket_id, name, metadata)
    values
      (
        'ee000000-0000-4000-8000-000000000030',
        'commission-private',
        '22222222-2222-4222-8222-222222222222/service-message.webp',
        '{"mimetype":"image/webp","size":100}'::jsonb
      ),
      (
        'ee000000-0000-4000-8000-000000000031',
        'commission-private',
        '22222222-2222-4222-8222-222222222222/service-request.webp',
        '{"mimetype":"image/webp","size":100}'::jsonb
      ),
      (
        'ee000000-0000-4000-8000-000000000032',
        'commission-private',
        '22222222-2222-4222-8222-222222222222/service-draft.webp',
        '{"mimetype":"image/webp","size":100}'::jsonb
      ),
      (
        'ee000000-0000-4000-8000-000000000033',
        'portfolio-public',
        'local-fixtures/service-portfolio.webp',
        '{"mimetype":"image/webp","size":100}'::jsonb
      )
  $$,
  'service role can insert validated storage objects for API routes'
);

select lives_ok(
  $$
    do $service_metadata$
    begin
      insert into public.design_request_attachments (
        id,
        design_request_id,
        owner_id,
        client_attachment_id,
        object_path,
        file_name,
        mime_type,
        byte_size,
        sha256_hex
      )
      values (
        'ee000000-0000-4000-8000-000000000040',
        'ee000000-0000-4000-8000-000000000001',
        '22222222-2222-4222-8222-222222222222',
        'ee000000-0000-4000-8000-000000000041',
        '22222222-2222-4222-8222-222222222222/service-request.webp',
        'service-request.webp',
        'image/webp',
        100,
        repeat('d', 64)
      );

      perform * from public.register_message_attachment_upload(
        '22222222-2222-4222-8222-222222222222',
        'ee000000-0000-4000-8000-000000000042',
        '22222222-2222-4222-8222-222222222222/service-message.webp',
        'service-message.webp',
        'image/webp',
        100,
        repeat('e', 64)
      );

      insert into public.draft_revision_assets (
        id,
        draft_revision_id,
        object_path,
        file_name,
        mime_type,
        byte_size,
        sha256_hex
      )
      values (
        'ee000000-0000-4000-8000-000000000043',
        'ee000000-0000-4000-8000-000000000011',
        '22222222-2222-4222-8222-222222222222/service-draft.webp',
        'service-draft.webp',
        'image/webp',
        100,
        repeat('f', 64)
      );

      insert into public.portfolio_media (
        id,
        portfolio_project_id,
        object_path,
        alt_text
      )
      values (
        'ee000000-0000-4000-8000-000000000044',
        '51000000-0000-4000-8000-000000000001',
        'local-fixtures/service-portfolio.webp',
        'LOCAL TEST service media'
      );
    end;
    $service_metadata$
  $$,
  'service role can write upload metadata through trusted API paths'
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
  (
    select count(*)::integer
    from public.message_attachments
    where client_attachment_id = 'ee000000-0000-4000-8000-000000000042'
  ),
  1,
  'customer read RLS still exposes their verified unbound attachment metadata'
);

select throws_ok(
  $$
    update storage.objects
    set metadata = '{"mimetype":"image/webp","size":101}'::jsonb
    where id = 'ee000000-0000-4000-8000-000000000030'
  $$,
  null,
  null,
  'ordinary customer cannot update a private storage object'
);

select throws_ok(
  $$
    delete from storage.objects
    where id = 'ee000000-0000-4000-8000-000000000030'
  $$,
  null,
  null,
  'ordinary customer cannot delete a private storage object'
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
    from public.portfolio_media
    where id = 'ee000000-0000-4000-8000-000000000044'
  ),
  1,
  'admin read RLS still exposes trusted portfolio media metadata'
);

select * from finish();
rollback;
