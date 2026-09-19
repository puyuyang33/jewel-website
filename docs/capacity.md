# Capacity and Inbox Behavior

## Target

The launch target is approximately 300 simultaneous customers plus one
administrator. This is a modest application-data workload but exceeds
Supabase Free's 200 concurrent Realtime connection limit.

Use Supabase Pro for production. Its current 500 concurrent connections,
500 messages per second, and 500 joins per second are adequate when the client
uses one shared connection per active tab and does not connect Realtime on
unrelated public pages.

The zero-cost MVP Demo track in `docs/deployment-free-bilingual.md` uses
Supabase Free and therefore does not claim this 300-user capacity. Keep that
demo well below the 200-connection Free limit.

## Connection budget

| Consumer                                    | Planned connections |
| ------------------------------------------- | ------------------: |
| 300 customers, one active tab each          |                 300 |
| Administrator inbox/chat                    |                   1 |
| Reconnect and occasional extra-tab headroom |                  99 |
| Operational warning threshold               |                 400 |
| Supabase Pro capped limit                   |                 500 |

If more than 100 extra tabs/reconnecting clients are common, increase the
provider limit before launch.

## Messaging design

- PostgreSQL persistence is authoritative.
- Every send uses a client idempotency UUID.
- Server timestamps determine order.
- Realtime distributes only persisted changes.
- One browser Supabase client is reused per tab.
- Only messaging and inbox views subscribe.
- Presence and typing indicators are intentionally omitted.
- Message history uses `(sent_at, id)` cursor pagination.
- Administrative lists page records rather than loading all customers.

## Administrator inbox

The inbox follows familiar Messenger/Instagram behavior:

1. Sort by latest persisted message/activity descending.
2. Move a conversation to the top when a new message is committed.
3. Display unread conversations prominently.
4. Show customer identity, safe last-message preview, timestamp, status, and
   unread count.
5. Preserve a deterministic ID tie-breaker for same-time messages.
6. Update from a lightweight authorized Realtime event.
7. Reconcile with the database after reconnect.
8. Search and filter without replacing authoritative ordering.

The administrator does not subscribe to every full customer message channel
from the list page. It subscribes to the minimal summary/activity stream and
loads full messages only after opening a conversation.

## Database indexes

The messaging schema should retain indexes equivalent to:

```text
conversations (last_message_at DESC, id DESC)
messages (conversation_id, sent_at DESC, id DESC)
conversation_read_markers (conversation_id, user_id)
```

Summary updates occur in the same transaction that persists the message so the
inbox cannot reorder before the message exists.

## Performance checks

Measure on a non-production Supabase project:

- 300 simultaneous authenticated connections.
- 300 near-simultaneous channel joins.
- New-message burst and reconnect storm.
- p50/p95 message persistence latency.
- p50/p95 inbox reorder latency.
- Unread-count consistency.
- Cursor pagination query time.
- Database CPU/memory and Realtime message rate.

Set alerts before sustained usage reaches 400 Realtime connections or provider
resource limits.

Run the HTTP smoke against a local or approved preview deployment:

```powershell
$env:LOAD_TEST_URL = "https://your-preview.example"
$env:LOAD_TEST_CONCURRENCY = "300"
npm run load:http
```

Run the Realtime connection smoke only against an approved non-production
project:

```powershell
$env:LOAD_TEST_CONFIRM_NON_PRODUCTION = "I_UNDERSTAND"
$env:LOAD_TEST_EXPECTED_PROJECT_REF = "yourstagingprojectref"
$env:LOAD_TEST_PRODUCTION_PROJECT_REF = "yourproductionprojectref"
$env:LOAD_TEST_SUPABASE_URL = "https://yourstagingprojectref.supabase.co"
$env:LOAD_TEST_SUPABASE_ANON_KEY = "your-staging-anon-key"
$env:LOAD_TEST_ACCESS_TOKEN = "short-lived-staging-test-token"
$env:LOAD_TEST_CONNECTIONS = "300"
npm run load:realtime
```

Never commit the access token or run the script against production.

### Local production-server baseline

On 2026-09-17, the optimized local `next start` build completed:

- 300 concurrent clients.
- Three requests per client.
- 900 total requests.
- Zero failures.
- Approximately 220 requests/second.
- p50 1.18 seconds, p95 2.00 seconds, p99 2.08 seconds.

This is a workstation HTTP smoke result, not a Vercel/Supabase capacity
guarantee. `next dev` is not a valid load target because on-demand compilation
serializes work. Repeat the test against an approved Vercel preview and run the
separate Realtime connection smoke against the actual non-production Supabase
Pro project before launch.

## Scaling path

No Redis or message broker is required at 300 customers. If monitoring shows a
real bottleneck:

1. Verify indexes and query plans.
2. Reduce unnecessary subscriptions and payloads.
3. Increase Supabase Realtime/compute limits.
4. Add a database-maintained summary table or materialized projection.
5. Introduce separate infrastructure only after measurements justify it.
