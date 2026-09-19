# Messaging

Each design request owns one private conversation between its customer and the
single administrator.

## Write path

1. The action authenticates the sender and verifies conversation ownership or
   administrator access.
2. Text and attachment references are validated.
3. The PostgreSQL rate limit is consumed.
4. A client-generated message identifier is submitted.
5. PostgreSQL inserts the message under a unique conversation/idempotency
   constraint.
6. The UI treats the message as sent only after persistence succeeds.
7. Supabase Realtime synchronizes the persisted row to other authorized
   clients.

Retrying the same client identifier returns the durable message instead of
creating a duplicate.

## Content

Messages are plain text with a bounded length. URLs are detected and rendered
as safe React links without `dangerouslySetInnerHTML`. HTML, script, and rich
markup are never interpreted.

Reference images are uploaded through the bounded authenticated upload route,
normalized, and stored privately before message metadata is submitted.

## Reading

History is ordered by server timestamp and UUID, and uses cursor pagination.
Read markers record the last acknowledged message per participant. Unread
counts are derived from persisted messages and markers.

Private images are opened through an authenticated route that verifies the
related request or commission before issuing a short-lived signed URL.

## Realtime

Realtime is an optimization, not durable delivery. RLS remains active for
subscriptions. On reconnect, the client reloads persisted messages and
reconciles by message ID.

The UI represents:

- Loading and empty history.
- Sending and failed messages.
- Offline and reconnecting state.
- Retry without duplication.
- Upload progress and rejection.
- Session expiration.

## Notifications

Optional email includes a generic project update and authenticated deep link.
It excludes message bodies, images, signed URLs, and deliverable links. In-app
records remain authoritative when email is disabled or fails.

## Privacy

Message bodies, attachment content, object paths, and signed URLs are excluded
from application logs. Customers cannot query another conversation even when
they know its UUID.
