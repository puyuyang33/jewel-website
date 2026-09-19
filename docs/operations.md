# Operations

## Daily administrator checks

- Review unread conversations and failed message sends.
- Review new design requests and quotes awaiting action.
- Confirm accepted commissions and set realistic estimates.
- Review drafts and revision requests.
- Review final payments due, pending, failed, refunded, or disputed.
- Review deliverable access and aftercare awaiting completion.
- Review failed transactional email attempts.
- Review recent audit events.

Do not infer revenue from incomplete or pending payments.

## Health

`GET /api/health` returns application availability and boolean integration
configuration only. `supabase` requires valid public and service-role
configuration; `stripe` requires a mode-matched key, webhook secret, and
application origin; `email` requires a valid Resend key, sender, and
application origin. It does not connect to providers, expose secrets, or prove
that downstream services are healthy.

Use controlled smoke operations to test Supabase, Stripe, storage, and email.

## Logs

Application logs use event names and redacted context. Never add message text,
image content, signed URLs, raw deliverable URLs, OAuth codes, tokens, secrets,
or full Stripe payloads.

When investigating an event, prefer internal record IDs and provider event IDs.
Limit access to logs and follow the provider retention policy.

## Email failures

Email is secondary to in-app state. A failed or disabled delivery attempt must
be visible to the administrator and must not roll back the underlying business
event. Retry only from the stored notification record, preserving its
idempotency key.

## Realtime incidents

Realtime disconnection does not lose persisted messages. Users should see a
reconnecting state. After service recovery, reload the authorized conversation
from PostgreSQL and reconcile messages by ID.

Do not relax RLS or publish private tables globally to troubleshoot Realtime.

## Payment incidents

For delayed webhooks:

1. Keep the customer in a pending state.
2. Locate the Stripe event and internal payment attempt by safe IDs.
3. Confirm signature verification and handler response.
4. Resend the event from Stripe if needed.
5. Confirm idempotent processing.

Never mark a payment successful manually. Refunds and disputes are driven by
verified provider events and reviewed business procedures.

## Upload incidents

For rejected uploads, record only the safe reason and verified metadata. Remove
orphaned temporary objects. Do not download or copy customer images into issue
trackers.

If suspicious content bypasses validation, disable the affected upload purpose,
preserve a minimal audit record, and review the decoder and storage policy.

## Administrator access changes

To rotate administrator access:

1. Change `ADMIN_GOOGLE_EMAIL` in the trusted execution environment.
2. Run `npm run admin:sync`.
3. Sign out existing sessions where practical.
4. Verify the old account fails `is_active_admin()`.
5. Verify the new confirmed Google account succeeds.
6. Review the audit event.

## Backups

Supabase Free does not provide managed backups. Before production migrations,
create an encrypted manual dump and test restoration in a separate project.
Store backups outside the repository with restricted access and defined
retention.

## Database migration incident

Never reset production. On failure:

1. Stop the release.
2. Preserve the failed statement and database logs.
3. Capture a new dump if safe.
4. Review partial effects.
5. Create a forward corrective migration.
6. Test it against a restored copy.
7. Apply it manually.
8. Repeat RLS, payment, and delivery smoke tests.

## Application rollback

Promote the previous verified Vercel deployment. Confirm its schema
compatibility before promotion. Database migrations are not automatically
reversed.

## Retention and deletion

Before launch, establish periods for abandoned requests, customer image
references, completed commissions, notification attempts, provider-event
metadata, audit events, and backups.

Accepted commercial terms and financial history should be anonymized where
required instead of hard-deleted in a way that damages accounting or dispute
records.
