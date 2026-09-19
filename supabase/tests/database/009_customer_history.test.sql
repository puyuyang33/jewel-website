begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

insert into public.notifications (
  id,
  recipient_id,
  event,
  title,
  body,
  dedupe_key,
  created_at
)
select
  (
    'f1000000-0000-4000-8000-'
    || lpad(sequence_value::text, 12, '0')
  )::uuid,
  '22222222-2222-4222-8222-222222222222',
  'message_received',
  case
    when sequence_value = 1 then 'needle-oldest history event'
    else 'History event ' || sequence_value
  end,
  'LOCAL TEST customer-safe notification history.',
  'history-event-' || sequence_value,
  '2026-01-01T00:00:00Z'::timestamptz
    + make_interval(secs => sequence_value)
from generate_series(1, 205) as sequence_values(sequence_value);

insert into public.notifications (
  id,
  recipient_id,
  event,
  title,
  body,
  dedupe_key,
  created_at
)
values
  (
    'f2000000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    'message_received',
    'same-time tie alpha',
    'LOCAL TEST tie.',
    'history-tie-alpha',
    '2027-01-01T00:00:00Z'
  ),
  (
    'f2000000-0000-4000-8000-000000000002',
    '22222222-2222-4222-8222-222222222222',
    'message_received',
    'same-time tie beta',
    'LOCAL TEST tie.',
    'history-tie-beta',
    '2027-01-01T00:00:00Z'
  ),
  (
    'f2000000-0000-4000-8000-000000000003',
    '33333333-3333-4333-8333-333333333333',
    'message_received',
    'needle-other-customer',
    'LOCAL TEST ownership.',
    'history-other-customer',
    '2028-01-01T00:00:00Z'
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
    from public.customer_list_history(p_limit => 50)
  ),
  50,
  'customer history returns the bounded page size'
);

select is(
  (
    select bool_and(has_more)
    from public.customer_list_history(p_limit => 50)
  ),
  true,
  'customer history reports an accurate additional page'
);

select results_eq(
  $$
    select event_id
    from public.customer_list_history(
      p_limit => 10,
      p_search => 'needle-oldest'
    )
  $$,
  $$ values ('f1000000-0000-4000-8000-000000000001'::uuid) $$,
  'search is applied before limiting and finds a record beyond 200'
);

select results_eq(
  $$
    select event_id
    from public.customer_list_history(
      p_limit => 10,
      p_search => 'same-time tie'
    )
  $$,
  $$
    values
      ('f2000000-0000-4000-8000-000000000002'::uuid),
      ('f2000000-0000-4000-8000-000000000001'::uuid)
  $$,
  'same-timestamp history ordering is deterministic by ID'
);

select is(
  (
    with first_page as (
      select *
      from public.customer_list_history(p_limit => 2)
    ),
    second_page as (
      select *
      from public.customer_list_history(
        p_limit => 2,
        p_before_occurred_at => (
          select next_occurred_at from first_page limit 1
        ),
        p_before_id => (
          select next_id from first_page limit 1
        ),
        p_before_type => (
          select next_type from first_page limit 1
        )
      )
    )
    select count(*)::integer
    from second_page
    where event_id not in (select event_id from first_page)
  ),
  2,
  'stable keyset cursor returns the next non-overlapping page'
);

select ok(
  (
    select bool_and(event_type = 'notification_message_received')
    from public.customer_list_history(
      p_limit => 20,
      p_types => array['notification_message_received']
    )
  ),
  'history type filter is applied before page limiting'
);

select is(
  (
    select count(*)::integer
    from public.customer_list_history(
      p_limit => 10,
      p_search => 'needle-other-customer'
    )
  ),
  0,
  'customer cannot search another customer history'
);

select is(
  (
    select count(*)::integer
    from public.customer_list_history(
      p_limit => 10,
      p_search => 'needle-oldest',
      p_types => array['commission_status']
    )
  ),
  0,
  'search and type filters compose before limiting'
);

select * from finish();
rollback;
