# Local Development

## Prerequisites

- Git.
- Node.js matching `.nvmrc`.
- npm 10 or newer.
- Docker Desktop with the engine running.
- Supabase CLI from the project dependency.
- Chromium installed through Playwright.
- Stripe CLI for manual webhook delivery.

The production build does not require Docker. Local database, RLS, and
integration tests do.

## Windows PowerShell

Install exact dependencies and create the local environment file:

```powershell
npm ci
Copy-Item .env.example .env.local
npx playwright install chromium
```

Start Supabase:

```powershell
npm run db:start
npx supabase status
```

Copy the displayed local URL, anonymous key, and service-role key into
`.env.local`. Keep the service-role value server-only.

To exercise local Google OAuth, also set
`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and
`SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` before starting Supabase. Email/password
signup is disabled; application users must have an OAuth AMR claim in the
current JWT and a confirmed linked Google identity.

Reset the database:

```powershell
npm run db:reset
```

Set the fictional local administrator email and synchronize it:

```powershell
$env:ADMIN_GOOGLE_EMAIL = "designer@example.test"
npm run admin:sync
```

Start the application:

```powershell
npm run dev
```

Forward Stripe test events in another PowerShell window:

```powershell
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Copy the resulting `whsec_` value to `STRIPE_WEBHOOK_SECRET` in `.env.local`,
then restart the Next.js process.

Stop local Supabase:

```powershell
npm run db:stop
```

## POSIX shell

```bash
npm ci
cp .env.example .env.local
npx playwright install chromium
npm run db:start
npx supabase status
```

Copy the local values into `.env.local`, then:

```bash
npm run db:reset
ADMIN_GOOGLE_EMAIL=designer@example.test npm run admin:sync
npm run dev
```

In another terminal:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Stop services:

```bash
npm run db:stop
```

## Google OAuth locally

The application can build and render a clear disabled sign-in state without
Supabase credentials. Real Google OAuth requires:

1. A Google Web OAuth client.
2. The local Supabase provider callback configured in Google.
3. Google provider credentials entered in local Supabase configuration.
4. `http://localhost:3000/auth/callback` in the application redirect allowlist.

Do not automate Google's login screen in ordinary tests. Use the controlled
local test-user setup from the database test fixtures.

## Email locally

Leave `RESEND_API_KEY` empty unless intentionally testing a controlled
recipient. The disabled provider records an explicit disabled result and sends
nothing.

## Resetting safely

`npm run db:reset` destroys and recreates the **local** database, then applies
migrations and fictional seed data. Before running it, verify:

```powershell
npx supabase status
```

Never run a reset command with production credentials or a linked production
project.

## Common problems

### Docker is unavailable

Start Docker Desktop and wait for `docker info` to succeed. Unit, component,
type, lint, and build checks can still run, but executable RLS tests require
the local database.

### Sign-in is disabled

Confirm both `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are non-placeholder values, then restart the
development server.

### Stripe return stays pending

Confirm the Stripe CLI is forwarding to the exact webhook route and that
`STRIPE_WEBHOOK_SECRET` matches the currently running listener. The browser
return cannot mark payment successful.

### A private image is unavailable

Confirm the attachment record belongs to the signed-in customer's request or
commission, the object exists in the expected private bucket, and the storage
policy migration has been applied.
