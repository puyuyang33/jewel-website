# Database

## Source of truth

The schema is defined only by ordered SQL files in `supabase/migrations`.
`src/types/database.generated.ts` mirrors the exposed schema for TypeScript.
After any approved migration, reset the local database, run pgTAP, and
regenerate types.

PostgreSQL stores UTC `timestamptz` values. User-facing dates are formatted in
the configured business timezone. Money uses integer minor units plus an ISO
currency code.

## Main entities

| Area           | Entities                                                                           |
| -------------- | ---------------------------------------------------------------------------------- |
| People         | Profiles, administrator allowlist, notification preferences                        |
| Public content | Portfolio projects/media, testimonials, site settings                              |
| Communication  | Design requests, conversations, messages, attachments, read markers, notifications |
| Quotes         | Immutable quote versions/options, lifecycle events, counteroffers, acceptance      |
| Commissions    | Accepted-term snapshots, status history, drafts, revisions                         |
| Payments       | Checkout reservations, payments, provider event receipts, refunds, disputes        |
| Delivery       | Customer-safe deliverables, private secrets, access records                        |
| Operations     | Administrator notes, audit logs, rate buckets, idempotency records                 |

Raw external deliverable URLs and other server-only operational data live in a
private schema. It is not exposed to customer PostgREST queries.

## Status values

Design requests:

```text
draft, open, quoted, negotiating, accepted, declined, closed
```

Quotes:

```text
draft, sent, viewed, countered, accepted, declined, cancelled, superseded, expired
```

`expired` is an effective derived state from the immutable expiry timestamp.

Commissions:

```text
awaiting_admin_confirmation, confirmed, in_progress, draft_review,
revision_requested, draft_approved, final_payment_due, paid, delivered,
aftercare, completed, cancelled, disputed
```

Drafts:

```text
working, shared, approved, superseded
```

Payments:

```text
not_started, pending, processing, succeeded, failed, cancelled,
partially_refunded, refunded
```

## Immutability

Database triggers and privileges prevent mutation of:

- Sent quote payloads and options.
- Quote lifecycle history.
- Accepted quote snapshots.
- Financial/provider event receipts.
- Commission status history.
- Delivery access events.
- Audit history.

Corrections create a new version or append a new event rather than rewriting
historical business terms.

## Critical functions

Names and signatures are represented in the generated types. Major operations
include:

- Active administrator authorization.
- Authenticated and service-subject rate-limit consumption.
- Quote lifecycle transitions with expected state.
- Atomic quote option acceptance and commission creation.
- Commission transition with actor and expected state.
- Stripe Checkout reservation and provider-session binding.
- Verified payment, refund, and dispute event recording.
- Deliverable administration without returning its secret.
- Deliverable access authorization and post-authorization secret resolution.
- Sanitized administrator audit pagination.
- Customer aftercare completion.

Security-definer functions set a fixed search path, validate the actor
internally, minimize grants, and return only required fields.

## Checkout and provider events

Checkout reservation exists before Stripe always exposes a canonical Payment
Intent. Provider session and PaymentIntent identifiers are therefore nullable
until safely bound.

Verified event ledgers deduplicate globally by provider event identity. Refund
and dispute workflows lock related records, derive cumulative state, and do
not trust metadata for amount, currency, customer, or commission truth.

Automated outbound refund initiation is not implemented.

## Deliverables

Administrator upsert writes customer-safe metadata and the private HTTPS
secret transactionally, but never returns the raw URL.

Customer access occurs in two stages:

1. `authorize_deliverable_access` verifies actor, ownership, release, payment,
   commission state, revocation/refund/dispute status, rate limit, and request
   idempotency. First access may advance `paid -> delivered`.
2. A service-role-only resolver accepts the resulting access/request/actor
   binding and returns the URL for the immediate redirect.

The private schema remains inaccessible through ordinary authenticated
clients.

## Row Level Security

RLS is enabled for all user-related exposed tables. Policies guarantee:

- Anonymous users read only intentionally published content.
- Customers read and mutate only their own allowed records.
- Customers cannot create official quotes, successful payments, or
  administrator state transitions.
- Attachments follow their related request, conversation, or commission.
- Administrator access is derived from the active allowlist.
- Internal notes, raw secrets, and audit history are protected.

Conversation creation requires the request owner and initial status `open`.

## Storage

Storage bucket policies parallel database ownership. Private objects are not
made public for convenience. Portfolio media remains private and is written
only by the active administrator; published bytes use a controlled signed
redirect after checking public parent metadata.

## Tests

SQL tests under `supabase/tests/database` cover:

- Schema constraints and grants.
- Public/customer/administrator RLS.
- Ownership and cross-customer denial.
- Initial conversation status.
- Quote concurrency, immutability, and lifecycle derivation.
- Commission transitions.
- Payment, refund, and dispute idempotency.
- Delivery authorization and secret boundaries.
- Sanitized administrator operations.

Run:

```powershell
npm run db:start
npm run db:reset
npm run test:rls
```

Docker is required for executable pgTAP tests.
