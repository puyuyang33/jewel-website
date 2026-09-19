# Architecture

## System shape

Veyra Atelier is a single Next.js App Router application backed by Supabase.
It serves three surfaces:

- Public marketing and portfolio pages.
- A private customer workspace.
- A private single-administrator workspace.

Supabase PostgreSQL is authoritative for identity-linked application data,
commercial terms, workflow state, messages, payment state, and audit history.
Realtime and email synchronize or notify users after durable writes; neither
is a source of truth.

## Runtime services

| Service             | Responsibility                                          |
| ------------------- | ------------------------------------------------------- |
| Next.js on Vercel   | Server rendering, actions, route handlers, public pages |
| Supabase Auth       | Google OAuth and secure session cookies                 |
| Supabase PostgreSQL | Transactional data, RLS, workflow RPCs, rate limits     |
| Supabase Realtime   | Authorized conversation synchronization                 |
| Supabase Storage    | Private commission and staged/published portfolio media |
| Stripe Checkout     | Hosted final-payment collection                         |
| Resend              | Optional transactional email                            |

The MVP has no Redis, message broker, search cluster, CMS, Dropbox OAuth,
inventory system, cart, tax engine, or shipping integration.

## Source boundaries

| Path               | Responsibility                                                  |
| ------------------ | --------------------------------------------------------------- |
| `src/app`          | Routes, metadata, Server Components, actions, protocol handlers |
| `src/components`   | Accessible presentation and narrow interactive islands          |
| `src/features`     | Use-case actions and orchestration                              |
| `src/lib/domain`   | Framework-independent validation and workflow rules             |
| `src/lib/data`     | Authorized DTO queries and database access                      |
| `src/lib/auth`     | Session DAL and active administrator authorization              |
| `src/lib/supabase` | Browser, server-session, and service-role clients               |
| `src/lib/security` | Uploads, origins, rate limits, safe errors and logging          |
| `src/lib/payments` | Stripe adapter and webhook command mapping                      |
| `src/lib/email`    | Transactional provider abstraction and safe templates           |
| `supabase`         | Versioned schema, RLS, storage policies, seeds and pgTAP tests  |

Server Components are the default. Client Components are limited to browser
state, live messaging, form feedback, dialogs, and uploads. Sensitive records
are converted to explicit DTOs before crossing a client boundary.

## Request flow

1. The Next.js proxy refreshes Supabase cookies and may perform an optimistic
   authentication redirect.
2. The page, action, or route handler authenticates again through the DAL.
3. Administrator operations recheck the active database allowlist.
4. Inputs are parsed at the server boundary.
5. Data queries include ownership predicates even though RLS also applies.
6. Critical mutations call PostgreSQL functions with expected-state and
   idempotency values.
7. The database writes state history and audit information transactionally.
8. Realtime or optional email reflects the completed durable write.

Proxy and layouts are not treated as authorization boundaries.

## Transaction boundaries

PostgreSQL functions own operations whose invariants span multiple rows:

- Quote status transitions and exactly-one option acceptance.
- Immutable accepted-term snapshot and commission creation.
- Commission state transitions with expected current state.
- Verified payment recording and webhook idempotency.
- Deliverable authorization, access logging, and first-access delivery.
- Aftercare completion.
- Rate-limit bucket consumption.

Retries return the original durable result when the idempotency key matches.
Stale expected-state changes fail explicitly rather than overwriting a newer
state.

## Configuration

Public connection values use `NEXT_PUBLIC_` variables. Service-role,
administrator, Stripe, Resend, currency, timezone, and deliverable host
configuration remains server-only.

Editable portfolio and public content live in PostgreSQL. Security-sensitive
limits and provider settings come from validated application configuration.
Production does not silently replace missing private data with demo content.

## Rendering and caching

Public pages may be statically rendered and indexed. Customer and
administrator pages are dynamic, authenticated, `noindex`, and absent from the
sitemap. Route handlers that return identity, payment, upload, or deliverable
information set `Cache-Control: no-store`.

Message history and administrative lists use bounded pagination. Realtime
subscriptions append or reconcile persisted rows; reconnecting clients reload
from PostgreSQL.

## Failure behavior

- Missing optional email configuration returns an explicit disabled result.
- Missing required authentication redirects to sign-in or returns `401`.
- Missing authorization returns `403` or an indistinguishable not-found result
  where record existence is sensitive.
- Provider failures do not fabricate successful database state.
- A Checkout success redirect displays pending until a verified webhook is
  committed.
- Invalid state transitions and stale writes return stable domain error codes.

## Extension points

Future deposits can use the existing payment-kind boundary but remain disabled.
Private uploaded final files can implement the deliverable adapter without
changing payment authorization. Additional staff would require a deliberate
participant/role redesign rather than reusing the single-admin allowlist.
