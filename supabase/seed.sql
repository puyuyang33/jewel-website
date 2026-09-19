-- LOCAL DEVELOPMENT ONLY.
-- Every identity and record below is fictional and uses the reserved .test domain.
-- Local identities model Google OAuth accounts and have no password credential.
-- No payment, webhook, deliverable secret, access-log, or delivery-attempt rows are seeded.

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'atelier.admin@veyra.local.test',
    now(),
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{"display_name":"Local Atelier Admin","local_test_identity":true}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'mara.client@veyra.local.test',
    now(),
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{"display_name":"Mara Vale (Local Test)","local_test_identity":true}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '33333333-3333-4333-8333-333333333333',
    'authenticated',
    'authenticated',
    'orin.client@veyra.local.test',
    now(),
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{"display_name":"Orin Sable (Local Test)","local_test_identity":true}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '44444444-4444-4444-8444-444444444444',
    'authenticated',
    'authenticated',
    'unconfirmed.admin@veyra.local.test',
    null,
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{"display_name":"Unconfirmed Local Admin","local_test_identity":true}'::jsonb,
    now(),
    now()
  )
on conflict (id) do update
set email = excluded.email,
    encrypted_password = null,
    email_confirmed_at = excluded.email_confirmed_at,
    raw_app_meta_data = excluded.raw_app_meta_data,
    raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = excluded.updated_at;

insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  (
    'a1111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    'google-local-admin-11111111',
    '{"sub":"11111111-1111-4111-8111-111111111111","email":"atelier.admin@veyra.local.test","email_verified":true,"local_test_identity":true}'::jsonb,
    'google',
    now(),
    now(),
    now()
  ),
  (
    'a2222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222',
    'google-local-client-22222222',
    '{"sub":"22222222-2222-4222-8222-222222222222","email":"mara.client@veyra.local.test","email_verified":true,"local_test_identity":true}'::jsonb,
    'google',
    now(),
    now(),
    now()
  ),
  (
    'a3333333-3333-4333-8333-333333333333',
    '33333333-3333-4333-8333-333333333333',
    'google-local-client-33333333',
    '{"sub":"33333333-3333-4333-8333-333333333333","email":"orin.client@veyra.local.test","email_verified":true,"local_test_identity":true}'::jsonb,
    'google',
    now(),
    now(),
    now()
  ),
  (
    'a4444444-4444-4444-8444-444444444444',
    '44444444-4444-4444-8444-444444444444',
    'google-local-unconfirmed-44444444',
    '{"sub":"44444444-4444-4444-8444-444444444444","email":"unconfirmed.admin@veyra.local.test","email_verified":false,"local_test_identity":true}'::jsonb,
    'google',
    null,
    now(),
    now()
  )
on conflict (id) do update
set provider_id = excluded.provider_id,
    identity_data = excluded.identity_data,
    provider = excluded.provider,
    last_sign_in_at = excluded.last_sign_in_at,
    updated_at = excluded.updated_at;

insert into public.profiles (id, display_name, preferred_timezone)
values
  ('11111111-1111-4111-8111-111111111111', 'Local Atelier Admin', 'America/Chicago'),
  ('22222222-2222-4222-8222-222222222222', 'Mara Vale (Local Test)', 'America/New_York'),
  ('33333333-3333-4333-8333-333333333333', 'Orin Sable (Local Test)', 'Europe/London'),
  ('44444444-4444-4444-8444-444444444444', 'Unconfirmed Local Admin', 'UTC')
on conflict (id) do update
set display_name = excluded.display_name,
    preferred_timezone = excluded.preferred_timezone;

insert into public.admin_allowlist (
  id,
  email,
  is_active,
  reason,
  created_by,
  activated_at,
  deactivated_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'atelier.admin@veyra.local.test',
    true,
    'LOCAL TEST ONLY: confirmed administrator fixture',
    '11111111-1111-4111-8111-111111111111',
    now(),
    null
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'unconfirmed.admin@veyra.local.test',
    false,
    'LOCAL TEST ONLY: inactive and deliberately unconfirmed authorization fixture',
    '11111111-1111-4111-8111-111111111111',
    null,
    now()
  )
on conflict (id) do update
set email = excluded.email,
    is_active = excluded.is_active,
    reason = excluded.reason,
    created_by = excluded.created_by,
    activated_at = excluded.activated_at,
    deactivated_at = excluded.deactivated_at,
    expires_at = null;

insert into public.site_content (
  id,
  slug,
  content_type,
  title,
  body,
  status,
  sort_order,
  published_at,
  created_by
)
values
  (
    '50000000-0000-4000-8000-000000000001',
    'atelier-introduction',
    'home_hero',
    'Jewelry shaped around one story',
    '{
      "eyebrow":"Veyra Atelier",
      "headline":"A singular piece, considered from first sketch to final polish.",
      "summary":"A fictional local-development introduction for a private, single-designer commission atelier.",
      "primaryCta":"Begin a commission"
    }'::jsonb,
    'published',
    10,
    now(),
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    'commission-process',
    'process',
    'The commission process',
    '{
      "steps":[
        {"title":"Conversation","copy":"Share the person, memory, and practical needs behind the piece."},
        {"title":"Design","copy":"Review a focused proposal and considered design revisions."},
        {"title":"Making","copy":"Follow milestone updates while the piece is made and finished."},
        {"title":"Aftercare","copy":"Return for fit, care, and long-term support."}
      ]
    }'::jsonb,
    'published',
    20,
    now(),
    '11111111-1111-4111-8111-111111111111'
  )
on conflict (id) do nothing;

insert into public.site_settings (
  id,
  intake_open,
  quote_validity_days,
  brand_name,
  contact_email,
  contact_phone,
  status,
  published_at,
  created_by
)
values (
  '50500000-0000-4000-8000-000000000001',
  true,
  14,
  'Veyra Atelier',
  'hello@veyra.local.test',
  null,
  'published',
  now(),
  '11111111-1111-4111-8111-111111111111'
)
on conflict (id) do nothing;

insert into public.portfolio_projects (
  id,
  slug,
  title,
  excerpt,
  story,
  materials,
  techniques,
  status,
  is_featured,
  sort_order,
  completed_on,
  published_at,
  created_by
)
values
  (
    '51000000-0000-4000-8000-000000000001',
    'north-window-ring',
    'North Window Ring',
    'A fictional pale-sapphire ring inspired by winter light.',
    'This local-development portfolio story follows an imagined heirloom commission, balancing a low profile with a softly architectural setting.',
    array['recycled platinum', 'lab-grown pale sapphire'],
    array['hand fabrication', 'bright cut setting'],
    'published',
    true,
    10,
    '2025-11-14',
    now(),
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    '51000000-0000-4000-8000-000000000002',
    'tideline-pendant',
    'Tideline Pendant',
    'A fictional gold pendant carrying the rhythm of a remembered shoreline.',
    'An imagined keepsake developed from a simple contour drawing, translated into a reversible pendant with a quiet hand-finished surface.',
    array['18k recycled yellow gold'],
    array['lost-wax casting', 'hand engraving'],
    'published',
    false,
    20,
    '2026-02-08',
    now(),
    '11111111-1111-4111-8111-111111111111'
  )
on conflict (id) do nothing;

insert into public.portfolio_media (
  id,
  portfolio_project_id,
  object_path,
  media_type,
  alt_text,
  width,
  height,
  blurhash,
  sort_order
)
values
  (
    '52000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000001',
    'local-fixtures/north-window-ring.webp',
    'image',
    'Fictional platinum ring with a pale oval sapphire',
    1600,
    1200,
    null,
    10
  ),
  (
    '52000000-0000-4000-8000-000000000002',
    '51000000-0000-4000-8000-000000000002',
    'local-fixtures/tideline-pendant.webp',
    'image',
    'Fictional engraved gold pendant on a fine chain',
    1600,
    1200,
    null,
    10
  )
on conflict (id) do nothing;

insert into public.design_requests (
  id,
  customer_id,
  reference_code,
  title,
  request_type,
  occasion,
  desired_by,
  budget_min_minor,
  budget_max_minor,
  currency,
  description,
  metal_preferences,
  stone_preferences,
  ring_size,
  inspiration_notes,
  status,
  submitted_at
)
values (
  '60000000-0000-4000-8000-000000000001',
  '22222222-2222-4222-8222-222222222222',
  'DR-LOCAL-MARA-001',
  'Mara''s fictional constellation ring',
  'ring',
  'Tenth anniversary',
  current_date + 180,
  280000,
  420000,
  'USD',
  'LOCAL TEST DATA: a low-profile anniversary ring inspired by a winter constellation and intended for comfortable everyday wear.',
  array['18k white gold', 'platinum'],
  array['sapphire', 'diamond accents'],
  'US 6.5',
  'Keep the silhouette restrained and avoid a raised center setting.',
  'quoted',
  now()
)
on conflict (id) do nothing;

insert into public.conversations (
  id,
  design_request_id,
  customer_id,
  subject
)
values (
  '61000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  '22222222-2222-4222-8222-222222222222',
  'LOCAL TEST: constellation ring commission'
)
on conflict (id) do nothing;

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
    '62000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    'customer',
    '62000000-0000-4000-8000-000000000011',
    'LOCAL TEST MESSAGE: I would like the profile to stay low enough for everyday wear.',
    now() - interval '2 days'
  ),
  (
    '62000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'admin',
    '62000000-0000-4000-8000-000000000012',
    'LOCAL TEST MESSAGE: I have prepared two fictional directions with different setting details.',
    now() - interval '1 day'
  )
on conflict (conversation_id, client_message_id) do nothing;

with latest_messages as (
  select distinct on (conversation_id)
    conversation_id,
    id,
    sent_at
  from public.messages
  order by conversation_id, sent_at desc, id desc
)
update public.conversations
set last_message_id = latest_messages.id,
    last_message_at = latest_messages.sent_at
from latest_messages
where conversations.id = latest_messages.conversation_id;

insert into public.quote_versions (
  id,
  design_request_id,
  version_number,
  title,
  introduction,
  terms,
  currency,
  production_weeks,
  valid_until,
  created_by
)
values (
  '63000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  1,
  'Constellation ring proposal',
  'LOCAL TEST QUOTE: two fictional approaches for a low-profile anniversary ring.',
  'LOCAL TEST TERMS ONLY. A commission begins after written acceptance and any required deposit. Timing starts after final design approval.',
  'USD',
  12,
  now() + interval '30 days',
  '11111111-1111-4111-8111-111111111111'
)
on conflict (id) do nothing;

insert into public.quote_options (
  id,
  quote_version_id,
  title,
  description,
  scope_snapshot,
  included_revision_rounds,
  estimated_completion_days,
  line_items,
  currency,
  total_minor,
  deposit_minor,
  sort_order
)
values
  (
    '64000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    'Platinum and pale sapphire',
    'Fictional platinum setting with an oval lab-grown pale sapphire and four flush-set accents.',
    '{"metal":"recycled platinum","centerStone":"lab-grown pale sapphire","accentStones":4,"finish":"soft polish","localTestData":true}'::jsonb,
    2,
    84,
    '[{"description":"Design and fabrication","amount":{"amountMinor":330000,"currency":"USD"}},{"description":"Stone setting","amount":{"amountMinor":60000,"currency":"USD"}}]'::jsonb,
    'USD',
    390000,
    0,
    10
  ),
  (
    '64000000-0000-4000-8000-000000000002',
    '63000000-0000-4000-8000-000000000001',
    'White gold and blue sapphire',
    'Fictional 18k white-gold setting with a blue sapphire and two flush-set accents.',
    '{"metal":"18k recycled white gold","centerStone":"lab-grown blue sapphire","accentStones":2,"finish":"high polish","localTestData":true}'::jsonb,
    2,
    70,
    '[{"description":"Design and fabrication","amount":{"amountMinor":280000,"currency":"USD"}},{"description":"Stone setting","amount":{"amountMinor":45000,"currency":"USD"}}]'::jsonb,
    'USD',
    325000,
    0,
    20
  )
on conflict (id) do nothing;

insert into public.quote_status_events (
  id,
  quote_version_id,
  status,
  actor,
  changed_by,
  idempotency_key
)
values (
  '64500000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000001',
  'sent',
  'admin',
  '11111111-1111-4111-8111-111111111111',
  '64500000-0000-4000-8000-000000000011'
)
on conflict (id) do nothing;

insert into public.quote_counteroffers (
  id,
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
  '65000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000001',
  '64000000-0000-4000-8000-000000000001',
  '22222222-2222-4222-8222-222222222222',
  'local-seed|counteroffer|1',
  1,
  'USD',
  365000,
  0,
  '{"metal":"recycled platinum","centerStone":"lab-grown pale sapphire","accentStones":2,"finish":"soft polish","localTestData":true}'::jsonb,
  'LOCAL TEST COUNTEROFFER: could we use two accent stones while keeping the platinum setting?'
)
on conflict (id) do nothing;

insert into public.admin_notes (
  id,
  design_request_id,
  author_id,
  body
)
values (
  '66000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'LOCAL TEST INTERNAL NOTE: verify the low-profile preference before preparing a second quote version.'
)
on conflict (id) do nothing;
