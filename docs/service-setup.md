# Service Setup and Cost Plan

This guide is the deployment checklist for a public Veyra Atelier repository.
Prices and quotas were rechecked on 2026-09-17 and must be rechecked again
before purchase or launch.

For a fully free prototype/demo track using Netlify Free and Supabase Free,
see `docs/deployment-free-bilingual.md`. That track is intentionally limited
to controlled test users and fewer than 200 Realtime connections. The paid
recommendation below remains the production/300-customer track.

## Production recommendation for 300 simultaneous customers

| Service         | Selected tier              | Expected cost                             | Why                                                       |
| --------------- | -------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| Vercel          | Pro, one deploying seat    | From $20/month                            | Hobby is restricted to non-commercial personal use        |
| Supabase        | Pro, one Micro project     | From $25/month                            | Free allows only 200 Realtime connections; Pro allows 500 |
| Google OAuth    | Basic OAuth client         | $0 service fee identified                 | OpenID, email, and profile only                           |
| Stripe Checkout | Standard hosted Checkout   | No monthly Checkout fee; transaction fees | Required for card payment                                 |
| Resend          | Disabled or Free initially | $0 up to 3,000/month and 100/day          | In-app state remains authoritative                        |
| Custom domain   | Registrar-dependent        | Registration and renewal                  | Required for a professional production identity           |
| GitHub Actions  | Manual workflow only       | Verify current account/repository terms   | Local `npm run verify` remains available                  |

**Minimum managed fixed cost:** approximately **$45/month**, plus domain,
taxes, Stripe transaction fees, and any usage overages.

A $0 managed production configuration does not meet the requirements:

- [Vercel Hobby](https://vercel.com/docs/plans/hobby) is not intended for this
  commercial service under its current
  [fair-use terms](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage).
- [Supabase Free](https://supabase.com/pricing) has a 200 concurrent Realtime
  connection limit, below the 300-customer target.

Self-hosting can remove a SaaS subscription but still requires paid compute,
backups, monitoring, security patching, and operator time. It is not treated as
free.

## Capacity assumptions

The 300-customer target means up to 300 customer sessions active at once, plus
one administrator and reconnect headroom. The application is designed to:

- Create one shared Supabase browser client per tab.
- Open Realtime only on messaging/inbox surfaces.
- Use one WebSocket connection per active tab, with multiple channels on that
  connection when needed.
- Avoid presence and typing broadcasts in the MVP.
- Page message history and inbox records instead of loading all customers.
- Persist every message before Realtime distribution.

Supabase's current documented limits:

| Limit                           | Free | Pro |
| ------------------------------- | ---: | --: |
| Concurrent Realtime connections |  200 | 500 |
| Realtime messages per second    |  100 | 500 |
| Channel joins per second        |  100 | 500 |
| Channels per connection         |  100 | 100 |

Source: [Supabase Realtime limits](https://supabase.com/docs/guides/realtime/limits).

Three hundred single-tab customers plus an administrator use about 301 of 500
connections, leaving roughly 199 for short reconnect spikes or some extra
tabs. Set an operational warning at 400 sustained connections. If customers
regularly open multiple tabs, enable a higher Realtime limit or contact
Supabase before reaching 500.

The application uses Supabase's HTTP/Data API rather than opening one direct
PostgreSQL connection per browser. Vercel functions should use the provider
API/pool rather than direct unpooled database connections.

## 1. Collect business decisions

Record these outside the repository:

- Merchant legal country and Stripe account country.
- Default ISO currency.
- Business timezone.
- Confirmed administrator Google email.
- Public domain.
- Administrator notification email.
- Approved deliverable hostnames.
- Cancellation, refund, privacy, and retention policies.

Do not use fictional defaults in production.

## 2. Prepare the public GitHub repository

1. Push only tracked source files.
2. Confirm `.env.local`, provider credentials, database dumps, screenshots
   containing customer data, and test artifacts are ignored.
3. Run:

   ```powershell
   npm ci
   npm run check:public-dependencies
   npm audit --audit-level=high
   npm run verify
   ```

4. Confirm the lockfile contains only `https://registry.npmjs.org/` resolved
   package URLs.
5. Confirm no dependency name starts with `@deere` or contains John Deere
   branding.

The checked-in `.npmrc` pins the project to the public npm registry.
`check:public-dependencies` fails verification if internal package names,
Artifactory paths, or non-public resolved sources appear later.

The GitHub workflow has only `workflow_dispatch`; it never starts
automatically.

## 3. Create Supabase production

1. Create a new Supabase organization or choose the intended organization.
2. Select Pro.
3. Create one production project on Micro compute.
4. Choose a region near the majority of customers and Vercel execution.
5. Generate and store a strong database password in a password manager.
6. Record:
   - Project reference.
   - Project URL.
   - Anonymous/publishable key.
   - Service-role key.
7. Keep the service-role key only in server environments.
8. Enable budget notifications and review spend-cap behavior.

### Apply schema

From a trusted workstation:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db dump --linked --file pre-launch-schema.sql
npx supabase migration list --linked
npx supabase db push --linked
```

Store the dump encrypted outside the repository. Review all migrations before
`db push`.

### Verify database and storage

1. Confirm RLS is enabled for all exposed private data tables.
2. Confirm customer A cannot read customer B.
3. Confirm private commission storage cannot be listed anonymously.
4. Confirm unpublished portfolio media remains private.
5. Confirm published portfolio access follows its parent project.
6. Confirm the active administrator RPC works only for the allowlisted email.
7. Confirm Realtime publication contains only required tables/events.
8. Confirm message/quote/payment/delivery functions are present.

### Supabase operational settings

- Keep Realtime spend/connection alerts visible.
- Monitor connections, joins, messages/second, database size, storage, and
  egress.
- Use Pro daily backups and test a manual restore in a separate project.
- Do not enable public access to private schemas to work around application
  errors.

## 4. Configure Google OAuth

1. Create a dedicated production Google Cloud project.
2. Configure Google Auth branding:
   - Application name.
   - Owned public domain.
   - Homepage.
   - Privacy policy.
   - Terms.
3. Request only `openid`, `email`, and `profile`.
4. Configure production audience/publication as required by Google.
5. Create a Web OAuth client.
6. Add this authorized redirect URI:

   ```text
   https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
   ```

7. In Supabase Auth, enable Google and enter the client ID and secret.
8. Disable Email/password, Phone, Anonymous, manual identity linking, and
   every non-Google hosted provider. The database also requires an OAuth AMR
   claim and a linked Google identity.
9. In Supabase URL configuration, set:
   - Site URL: `https://YOUR_DOMAIN`
   - Redirect URL: `https://YOUR_DOMAIN/auth/callback`
   - Local redirect: `http://localhost:3000/auth/callback`
10. Test one normal customer account and the administrator account.
11. Verify a password sign-in request is rejected, and retain pgTAP `014`
    evidence that a password-AMR JWT cannot use application RLS/RPCs.

Do not add Calendar, Drive, Gmail, or other sensitive Google scopes.

## 5. Synchronize the administrator

In a trusted server environment with the production Supabase values:

```powershell
$env:ADMIN_GOOGLE_EMAIL = "owner@your-domain.example"
npm run admin:sync
```

Then:

1. Sign in with the configured Google account.
2. Confirm `/admin` works.
3. Sign in with an ordinary account.
4. Confirm it remains a customer.
5. Remove or change the allowlist and prove the old account loses access.

## 6. Configure Stripe

1. Create or activate the merchant's Stripe account in its legal country.
2. Complete required identity/business verification.
3. Keep test mode enabled through the full smoke test.
4. Set `STRIPE_MODE=test` in Preview and `STRIPE_MODE=live` in Production.
5. Copy the matching test or live secret key.
6. Create a webhook endpoint:

   ```text
   https://YOUR_DOMAIN/api/webhooks/stripe
   ```

7. Subscribe only to the 17 exact event types listed in `docs/payments.md`.
8. Copy the endpoint signing secret.
9. Run a test Checkout payment.
10. Verify:

- The browser amount cannot change the charge.
- The return page remains pending before the webhook.
- Duplicate webhook delivery creates no duplicate payment/history.
- Refund and dispute test events block delivery where required.
- Checkout expiration without a PaymentIntent is recorded.

11. Switch to live keys only after all other production smoke checks pass.

Stripe pricing varies by merchant country, card origin, payment method,
currency conversion, and disputes. Recheck the merchant-country pricing page
before launch.

## 7. Configure optional Resend

Resend Free currently includes 3,000 transactional emails per month and 100 per
day. Three hundred customers can exceed the daily limit if chat messages
generate email.

Recommended launch behavior:

- Keep ordinary chat notifications in-app.
- Send email only for important project events.
- Leave `RESEND_API_KEY` unset until the domain is verified.
- Upgrade to Resend Pro only if measured daily volume exceeds the Free limit.

Setup:

1. Add the sending domain.
2. Configure SPF, DKIM, and DMARC records.
3. Verify the domain.
4. Create a restricted sending API key.
5. Set `RESEND_API_KEY`, `EMAIL_FROM`, and
   `ADMIN_NOTIFICATION_EMAIL`.
6. Send to controlled recipients first.
7. Confirm emails contain no private images, message bodies, signed URLs, or
   final deliverable links.

Source: [Resend pricing](https://resend.com/pricing).

## 8. Create the Vercel project

Do not use bare `npx vercel` or add Vercel CLI to the application dependency
tree. First pass the isolated Vercel CLI security gate in
`docs/deployment-bilingual.md`. If no audit-clean provider version is
available, the paid Vercel execution path is blocked; use the zero-cost
Netlify Demo track for the MVP.

1. Create a Pro team with one deploying seat.
2. Create a project without enabling Git auto-deployment.
3. Set the framework to Next.js.
4. Add environment variables from `.env.example`.
5. Separate Preview and Production values.
6. Never expose server variables with a `NEXT_PUBLIC_` prefix.
7. Configure spend notifications.
8. Deploy an unpromoted preview/candidate manually with the gated `$Vercel`
   command from the bilingual runbook.
9. Run smoke tests.
10. Promote the approved candidate manually.

No database migration runs from the Vercel build.

## 9. Configure the domain

1. Purchase or use an owned domain.
2. Add it to Vercel and configure registrar DNS.
3. Wait for HTTPS certificate validation.
4. Update:
   - `NEXT_PUBLIC_APP_URL`
   - Google authorized domain and branding
   - Supabase site/redirect URLs
   - Stripe webhook URL
   - Resend sending domain
5. Redeploy manually.

Avoid optional paid Supabase or Stripe custom service domains unless the
branding requirement justifies their separate monthly fees.

## 10. Production concurrency validation

Before public announcement:

1. Create fictional load-test customers in a non-production project.
2. Test 300 simultaneous sessions with one Realtime connection each.
3. Exercise:
   - Inbox initial pagination.
   - Conversation history cursor pagination.
   - New message persistence and list reordering.
   - Reconnect storms.
   - Upload authorization without uploading confidential media.
4. Confirm:
   - No cross-customer records appear.
   - New conversations move to the top of the admin inbox.
   - Unread counts remain consistent.
   - Message retries do not duplicate.
   - p95 message persistence and inbox update latency meet the chosen target.
   - Realtime connections remain below 400 sustained.
5. Repeat after major messaging or RLS changes.

Do not run load tests against production without provider approval and a
maintenance plan.

## 11. Final production smoke test

- Public pages, metadata, robots, sitemap, and mobile navigation work.
- Google customer/admin role separation works.
- Customer A cannot access Customer B records or files.
- Request creation and private image upload work.
- New messages appear at the top of the administrator inbox.
- Quote revision, counteroffer, and atomic acceptance work.
- Draft approval references the latest exact version.
- Stripe test Checkout and every subscribed event path work.
- Delivery is unavailable before verified payment/refund/dispute clearance.
- First access records `paid -> delivered`.
- Aftercare cases and customer completion work.
- Email disabled/failure state is explicit.
- Logs contain no message bodies, tokens, images, or private URLs.
- GitHub Actions does not run unless manually dispatched.

## 12. Monthly review

- Vercel usage and spend.
- Supabase connections, message rate, DB/storage/egress, backups, and logs.
- Stripe payment, refund, dispute, and webhook health.
- Resend daily/monthly usage if enabled.
- Domain renewal date.
- Dependency audit and public-registry guard.
- Administrator allowlist.
- Failed uploads, email attempts, and audit anomalies.
