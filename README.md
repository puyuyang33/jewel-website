# Veyra Atelier

Veyra Atelier is a production-oriented, English-language commission platform
for one independent jewelry designer. It combines an original editorial
portfolio with private design requests, durable messaging, versioned quotes,
commission tracking, draft review, Stripe final payment, payment-gated
delivery, and aftercare.

Veyra Atelier is a fictional development brand. Replace its identity, public
content, policies, and imagery before launch.

## Product scope

### Customers

- Browse the designer, process, FAQ, and portfolio.
- Sign in with Google.
- Create multiple private design requests.
- Exchange text and normalized reference images.
- Compare formal quote options and submit counteroffers.
- Accept exactly one eligible option.
- Follow an auditable commission timeline.
- Review versioned drafts, request revisions, and approve a draft.
- Pay the immutable final amount through Stripe Checkout.
- Open the final deliverable only after verified payment.
- Use aftercare and confirm completion.
- Retain request, quote, commission, payment, and delivery history.

### Administrator

- Operate from one allowlisted confirmed Google account.
- Manage the unified inbox and customer history.
- Create immutable versioned quotes with multiple options.
- Confirm commissions, estimates, stages, drafts, and revisions.
- Register a protected approved HTTPS deliverable.
- Monitor provider-verified payments and delivery access.
- Manage public portfolio content and typed site settings.
- Review a sanitized audit trail.

The MVP does not implement multiple merchants, employee accounts, inventory,
cart, tax calculation, shipping, fabrication fulfillment, deposits, automated
refunds, Dropbox OAuth, calendar integration, or native applications.

## Architecture

- Next.js 16 App Router and React Server Components.
- Strict TypeScript and Tailwind CSS.
- Accessible Radix-based interaction primitives.
- Touch-first responsive layouts for 320px phones, iPad portrait/landscape,
  and desktop screens.
- Supabase PostgreSQL, Auth, Realtime, Storage, and RLS.
- Google OAuth through Supabase.
- Stripe-hosted Checkout and signed webhooks.
- Optional Resend transactional email.
- Vitest, Testing Library, pgTAP, and Playwright.
- Vercel manual deployment.

PostgreSQL is authoritative. Realtime and email reflect durable database
writes; they never determine correctness. Commercial transitions use
transactional, expected-state, idempotent database functions.

See [Architecture](docs/architecture.md) and
[Database](docs/database.md).

## Prerequisites

- Node.js from `.nvmrc`.
- npm 10 or newer.
- Docker Desktop for local Supabase.
- Supabase CLI, installed as a pinned project dependency.
- Chromium and WebKit for Playwright.
- Stripe CLI for manual webhook smoke tests.

## Installation

```powershell
npm ci
Copy-Item .env.example .env.local
npx playwright install chromium webkit
```

Enter the local Supabase values after starting the stack:

```powershell
npm run db:start
npx supabase status
```

Never commit `.env.local` or any provider secret.

## Environment variables

| Variable                             | Visibility            | Purpose                                   |
| ------------------------------------ | --------------------- | ----------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                | Browser-safe          | Exact application origin                  |
| `NEXT_PUBLIC_SUPABASE_URL`           | Browser-safe          | Supabase project URL                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`      | Browser-safe          | Supabase anonymous key                    |
| `SUPABASE_SERVICE_ROLE_KEY`          | Server only           | Narrow privileged operations              |
| `ADMIN_GOOGLE_EMAIL`                 | Server only           | Administrator bootstrap allowlist         |
| `STRIPE_MODE`                        | Server only           | Explicit `test` or `live` provider mode   |
| `STRIPE_SECRET_KEY`                  | Server only           | Stripe test/live API access               |
| `STRIPE_WEBHOOK_SECRET`              | Server only           | Stripe signature verification             |
| `RESEND_API_KEY`                     | Server only, optional | Transactional email                       |
| `EMAIL_FROM`                         | Server only, optional | Verified sender                           |
| `ADMIN_NOTIFICATION_EMAIL`           | Server only           | Administrator notifications               |
| `BUSINESS_TIMEZONE`                  | Server only           | Date display rules                        |
| `DEFAULT_CURRENCY`                   | Server only           | New quote ISO currency                    |
| `DELIVERABLE_ALLOWED_HOSTS`          | Server only           | External delivery host allowlist          |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Server only           | Stable action encryption across instances |

Production must set real business currency, timezone, administrator, domain,
and allowed delivery hosts.

## Local database

```powershell
npm run db:start
npm run db:reset
npm run db:types
```

The reset command applies migrations and fictional local seed data. Never run
it against production.

Database tests:

```powershell
npm run test:rls
```

## Google OAuth

1. Create a Google Cloud Web OAuth client.
2. Request only OpenID, email, and profile.
3. Add the Supabase callback URL.
4. Configure the client ID and secret in Supabase Auth.
5. Add local and production `/auth/callback` application redirects.
6. Configure the administrator email and run:

```powershell
npm run admin:sync
```

See [Authentication](docs/authentication.md).

## Stripe test setup

Configure Stripe test keys, then forward webhooks locally:

```powershell
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Copy the displayed `whsec_` value to `.env.local`. All development and
automated tests must remain in Stripe test mode. A browser success redirect
does not unlock delivery; only a verified durable webhook can do so.

See [Payments](docs/payments.md).

## Optional email

Configure a verified Resend domain and set `RESEND_API_KEY`, `EMAIL_FROM`, and
`ADMIN_NOTIFICATION_EMAIL`. With no key, the provider returns an explicit
disabled result while all in-app features continue to work.

Email never includes message bodies, private images, signed URLs, or final
delivery links.

## Development

```powershell
npm run dev
```

Open `http://localhost:3000`.

Useful commands:

```powershell
npm run format
npm run check:public-dependencies
npm run check:manual-workflows
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run test:component
npm run test:integration
npm run test:rls
npm run test:e2e
npm run build
npm run verify
npm run verify:full
npm run audit:dependencies
npm run load:http
npm run load:realtime
```

`verify` requires no production credentials and runs formatting, lint, strict
types, manual-only workflow enforcement, public dependency provenance,
coverage, and a production build. `verify:full` additionally requires local
Supabase and runs RLS and browser tests.

See [Testing](docs/testing.md).

Detailed Windows PowerShell and POSIX instructions are in
[Local Development](docs/local-development.md).

## Security

- Active administrator allowlist; profile role alone is insufficient.
- Server authorization plus RLS and matching storage policies.
- Immutable quote and accepted commission snapshots.
- Expected-state and idempotent transactional workflows.
- Content-inspected, normalized private image uploads.
- Server-owned Stripe amount, currency, ownership, and payment state.
- Raw-body signature verification and replay-safe provider ledgers.
- Raw deliverable URLs isolated in a private schema.
- Two-stage authorized delivery redirect with no URL leakage.
- PostgreSQL-backed rate limiting.
- Redacted logs and no sensitive email content.

See [Security](docs/security.md).

## Manual deployment

Commercial production on Vercel requires a plan whose current terms permit
commercial use. Vercel Hobby is not suitable for this storefront under its
current fair-use terms. Supabase Free can support development or a small,
interruption-tolerant launch but can pause and lacks managed backups.

Deployment remains manual:

1. Verify locally.
2. Create production Supabase resources.
3. Back up and manually apply reviewed migrations.
4. Configure storage, Google OAuth, and administrator access.
5. Configure Stripe test webhook and optional Resend.
6. Create Vercel without Git auto-deployment.
7. Add scoped environment variables.
8. Deploy a preview manually.
9. Run the production smoke checklist.
10. Deploy production manually.

See [Manual Deployment](docs/deployment.md).

The complete account-by-account checklist and 300-concurrent-user sizing plan
are in [Service Setup](docs/service-setup.md) and
[Capacity](docs/capacity.md).

A complete step-by-step English/Chinese deployment runbook is available in
[Bilingual Deployment Runbook](docs/deployment-bilingual.md).

For a zero-recurring-cost MVP demonstration, use
[Zero-Cost MVP Demo / 完全免费 MVP Demo](docs/deployment-free-bilingual.md).

## GitHub Actions

`.github/workflows/manual-verify.yml` uses only `workflow_dispatch`. It never
runs automatically on pushes, pull requests, schedules, tags, or releases and
does not deploy or migrate the database.

See [CI/CD Plan](docs/ci-cd-plan.md).

## Documentation

- [Architecture](docs/architecture.md)
- [Database](docs/database.md)
- [Security](docs/security.md)
- [Authentication](docs/authentication.md)
- [Messaging](docs/messaging.md)
- [Commission workflow](docs/commission-workflow.md)
- [Payments](docs/payments.md)
- [Storage](docs/storage.md)
- [Testing](docs/testing.md)
- [Local development](docs/local-development.md)
- [Deployment](docs/deployment.md)
- [Bilingual deployment runbook / 中英双语部署手册](docs/deployment-bilingual.md)
- [Zero-cost MVP demo / 完全免费 MVP Demo](docs/deployment-free-bilingual.md)
- [Service setup](docs/service-setup.md)
- [Capacity and inbox behavior](docs/capacity.md)
- [Operations](docs/operations.md)
- [Administrator guide](docs/admin-guide.md)
- [Customization](docs/customization.md)
- [CI/CD plan](docs/ci-cd-plan.md)

## Production limitations

- Provider quotas, pricing, and commercial terms must be rechecked before
  launch.
- External shared links can be forwarded after disclosure.
- Legal, privacy, retention, payment, cancellation, and refund policies
  require jurisdiction-specific owner/professional review.
- Transactional email is optional and not a source of truth.
- Physical manufacturing, shipping, and tax handling remain outside the MVP.
- CI, deployment, and database migrations are not automatic.
