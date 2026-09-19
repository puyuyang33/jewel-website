# Testing

## Prerequisites

- Node.js matching `.nvmrc`.
- npm 10 or newer.
- Docker Desktop for local Supabase and pgTAP tests.
- Chromium installed by Playwright.
- Stripe CLI only for manual webhook smoke tests.

Install dependencies:

```powershell
npm ci
npx playwright install chromium
```

Automated tests use fictional identities and Stripe test values. They must not
send real email or create live charges.

## Commands

| Command                             | Purpose                                                     |
| ----------------------------------- | ----------------------------------------------------------- |
| `npm run format:check`              | Verify repository formatting                                |
| `npm run check:public-dependencies` | Reject internal package names and non-public registries     |
| `npm run lint`                      | Run strict Next.js and accessibility lint rules             |
| `npm run typecheck`                 | Generate route types and run strict TypeScript              |
| `npm test`                          | Run deterministic unit and component tests                  |
| `npm run test:coverage`             | Run tests with domain/security coverage thresholds          |
| `npm run test:component`            | Run interactive component tests                             |
| `npm run test:integration`          | Run integration tests; provider tests opt in                |
| `npm run test:rls`                  | Execute pgTAP database, RLS, and transaction tests          |
| `npm run test:e2e`                  | Run desktop and mobile Playwright journeys                  |
| `npm run build`                     | Create the production Next.js build                         |
| `npm run free:build`                | Create an account-independent `free-demo` Next.js build     |
| `npm run free:build:netlify`        | Validate the linked Netlify OpenNext adapter from Linux/WSL |
| `npm run verify`                    | Run formatting, lint, types, coverage, and build            |
| `npm run verify:full`               | Add local RLS and E2E tests to `verify`                     |
| `npm run audit:dependencies`        | Fail on high or critical npm advisories                     |

## Local database tests

Start and reset Supabase before database-dependent tests:

```powershell
npm run db:start
npm run db:reset
npm run test:rls
```

`db:reset` applies all migrations and development seed data to the local
instance. Never use it with a linked production project.

The RLS suite must prove:

- Anonymous users read only published public content.
- Customer A cannot read or modify Customer B's records.
- A customer cannot create official quotes or successful payments.
- Private storage object paths are owner-scoped.
- Raw deliverable secrets, internal notes, and audit logs are inaccessible.
- The active administrator can perform required operations.
- Stale profile roles do not grant administrator access.
- Critical RPCs enforce expected state and idempotency.

## Unit and component tests

Unit tests cover money, currency, quote expiration/versioning, counteroffers,
commission transitions, revisions, payment eligibility, webhook ordering,
deliverable gating, redirect/URL validation, messages, files, allowlist
normalization, rate limits, and notification deduplication.

Component tests use DTOs and action stubs. They do not connect to Supabase,
Stripe, Google, or Resend.

## Integration tests

Provider integration tests skip unless their explicit test-only environment
flag is enabled. Keep Stripe in test mode and use a controlled Resend recipient.
Integration tests must not run against production.

Webhook tests construct signed fixture bodies and cover:

- Missing or invalid signatures.
- Duplicate event delivery.
- Delayed and out-of-order events.
- Mismatched amount, currency, customer, or commission metadata.
- Successful transactional state advancement.
- Refund and dispute commands.

## End-to-end tests

Playwright runs desktop Chromium and an iPhone-sized Chromium profile. Google
login itself is not automated. Private journeys use controlled local auth
fixtures.

Required journeys include public navigation, multiple requests, private
messaging, cross-customer denial, quote negotiation and acceptance, commission
confirmation, drafts and revisions, Stripe test payment, locked and unlocked
delivery, aftercare, history, mobile layout, and keyboard operation.

Run a single file during development:

```powershell
npx playwright test tests/e2e/public.spec.ts
```

Run all journeys before handoff:

```powershell
npm run test:e2e
```

## Manual OAuth and Stripe checks

Automated tests do not operate Google's login page. Before production:

1. Sign in with a normal Google account and verify customer access.
2. Sign in with the allowlisted account and verify administrator access.
3. Remove the allowlist entry and verify access is revoked.
4. Forward a Stripe test event through the Stripe CLI.
5. Verify the return page does not unlock before the webhook.
6. Resend the event and confirm no duplicate payment or timeline entry.

## Failure artifacts

Playwright retains traces, screenshots, and video only on failure. Review them
before sharing or uploading because private fixtures may resemble customer
records. Never capture real message bodies, images, OAuth codes, or
deliverable URLs.
