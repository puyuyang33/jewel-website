# Security Model

## Trust boundaries

Browser input is untrusted. This includes identifiers, role claims, prices,
currency, ownership, workflow status, MIME declarations, redirect targets,
and Stripe metadata.

Supabase PostgreSQL is the source of truth. Server-side authorization and RLS
provide independent layers; neither replaces the other.

## Identity and administrator access

Google OAuth is handled by Supabase Auth with PKCE. The application does not
store Google access or refresh tokens.

Administrator access requires:

1. A current authenticated Supabase user.
2. A confirmed email address.
3. An OAuth authentication method in the current JWT.
4. A linked Google identity.
5. An exact normalized email match in the active `admin_allowlist`.

Profile role fields are not authoritative. The allowlist is synchronized by a
server-only command, cannot be changed by customers, and is rechecked for each
administrator operation.

## Record authorization

Every private table has RLS. Customer policies derive ownership through the
authenticated user and related request or commission. Queries also include
explicit owner predicates to reduce the impact of future policy mistakes.

Customers cannot directly read:

- Other customers or their activity.
- Raw external deliverable URLs.
- Internal administrator notes.
- Audit records.
- Service-provider event payloads.
- Administrator-only site drafts.

## Commercial state

Sent quotes are immutable. Acceptance, commission creation, state transitions,
verified payment, and delivery access use transactional PostgreSQL functions.
They require the expected prior state and stable idempotency input.

No browser request can mark a payment successful. A Checkout success redirect
does not unlock delivery.

## Stripe

- Checkout receives trusted database amount and currency.
- Card fields are hosted by Stripe.
- Webhook signatures are verified against the raw request body.
- Unique event IDs prevent replay.
- Expected database amount, currency, owner, and commission are re-read before
  mutation.
- Duplicate and out-of-order events are processed monotonically.
- Logs exclude complete payloads, secrets, and unnecessary customer data.

## Deliverables

Customer-safe deliverable metadata and raw external URLs are stored
separately. The raw URL is never placed in an RSC payload, page source,
metadata, Realtime event, notification, or denied response.

The open endpoint checks authentication, ownership, published state, succeeded
payment, commission state, HTTPS, and the configured hostname allowlist. It
records access and returns a no-store redirect with a restrictive referrer
policy.

Once an external link is shown, the application cannot technically prevent the
authorized customer from sharing it. Private Supabase-hosted files with
short-lived signed URLs provide stronger ongoing control.

## Uploads

Accepted inputs are JPEG, PNG, and WebP within centralized limits. The upload
pipeline:

1. Authenticates the uploader and checks the related record.
2. Reads a bounded body.
3. Detects content from bytes rather than trusting the filename or header.
4. Decodes and normalizes the image with Sharp.
5. Removes unnecessary metadata.
6. Writes an unpredictable private object path.
7. Stores verified size, MIME, dimensions, hash, and uploader.
8. Removes rejected or failed objects.

SVG, HTML, archives, executables, and arbitrary documents are rejected.

Authenticated browser clients cannot insert, update, or delete Storage objects
or attachment/media metadata directly. The authorized upload route performs
validation and normalization, then uses service-role writes. The host-safe
limit is 4 MiB in both deployment tracks.

Portfolio storage is private even for published projects. Anonymous users can
read published metadata, but bytes are issued only through a publication-aware
short-lived signed redirect. Draft and archived media cannot be listed.

## Messaging

Messages are plain text. URLs are rendered as React nodes without raw HTML.
Each message has a client-generated idempotency identifier and a unique
constraint. Realtime subscriptions remain subject to RLS and only synchronize
persisted rows.

Direct message and attachment inserts are revoked. The message RPC assigns the
server timestamp and atomically binds a permanently finalized set of verified,
uploader-owned staged attachments to an open authorized conversation.

Message bodies and private attachment URLs are excluded from logs and email.

## Web security

- Server Actions are authenticated, authorized, and validated as public
  mutation endpoints.
- Browser mutation routes verify the request origin.
- OAuth redirects accept only normalized internal paths.
- Security headers include CSP, `nosniff`, frame denial, referrer policy, and
  a restrictive permissions policy.
- Private responses use `Cache-Control: no-store`.
- Private routes are `noindex`.
- External links use safe rel attributes.
- Zoom is not disabled.

## Rate limiting

PostgreSQL-backed buckets protect requests, messages, uploads, quote actions,
payment-session creation, deliverable access, and other sensitive mutations.
The wrappers fail closed when the rate-limit RPC is unavailable.

## Secrets and logging

Secrets are loaded only at server boundaries and are never prefixed with
`NEXT_PUBLIC_`. Logs are structured and redacted.

Never log:

- Supabase session or service-role values.
- Google OAuth codes or tokens.
- Stripe keys, signatures, or full webhook payloads.
- Message bodies or customer images.
- Private signed URLs or raw deliverable links.

## Operational limitations

This project does not claim legal, regulatory, privacy, or payment-card
compliance by itself. Business policies, retention periods, jurisdictional
requirements, provider agreements, and incident procedures require owner and
professional review before production.
