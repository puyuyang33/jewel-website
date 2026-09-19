# Manual Deployment

This application is prepared for manual deployment to Supabase and Vercel. Do
not deploy with production credentials until the business owner has reviewed
the policies, enabled the required accounts, and completed local verification.

For the complete English/Chinese step-by-step procedure, use
`docs/deployment-bilingual.md`.

For the zero-recurring-hosting-cost Netlify/Supabase MVP Demo track, use
`docs/deployment-free-bilingual.md`.

The Vercel Pro architecture recommendation remains, but do not run bare
`npx vercel`. The current reviewed CLI dependency tree contains unresolved
high/critical advisories. Follow the isolated audit gate in
`docs/deployment-bilingual.md`; if it cannot pass, use the free Netlify Demo
track or wait for an audit-clean Vercel CLI release.

## Cost and account prerequisites

- Vercel Hobby is restricted to non-commercial personal use. Use Vercel Pro
  or another host whose current terms permit the intended commercial use.
- Supabase Free can pause inactive projects, does not include managed backups,
  and allows only 200 concurrent Realtime connections. The 300-customer target
  therefore requires Supabase Pro or another paid/self-operated deployment.
- Stripe charges transaction fees based on the merchant account country and
  payment method.
- A custom domain and its renewals are registrar-dependent costs.
- Resend can remain disabled; in-app activity remains the source of truth.

Recheck each provider's current pricing and terms immediately before launch.
See `docs/service-setup.md` for the account-by-account setup and current cost
floor.

## 1. Verify locally

```powershell
npm ci
npm run db:start
npm run db:reset
npm run verify:full
```

Use Stripe test mode only. Confirm that no real email recipients are
configured.

## 2. Create the Supabase project

1. Create a production Supabase project in the selected region.
2. Record the project URL and public anonymous key.
3. Store the service-role key in a password manager. Never paste it into
   browser code, tickets, screenshots, or public logs.
4. Configure the database password and require multi-factor authentication on
   provider accounts where available.
5. Review Free versus Pro continuity and backup requirements.

## 3. Back up and apply migrations

Link the CLI to the intended project:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

Before each production migration:

```powershell
npx supabase db dump --linked --file pre-deploy-schema.sql
npx supabase migration list --linked
```

Review every file in `supabase/migrations`, then apply:

```powershell
npx supabase db push --linked
```

Do not run `supabase db reset` against production. If a migration fails, stop
the release, preserve logs, and create a forward corrective migration.

## 4. Verify storage

Confirm the migration created:

- Private commission storage for customer references and drafts.
- Private portfolio storage with publication-aware signed redirects.
- RLS-aligned object policies.

Upload one fictional image with a customer test account. Confirm another
customer cannot read it directly.

## 5. Configure Google OAuth

1. Create separate Google Cloud OAuth projects for testing and production.
2. Configure the application name, owned domain, homepage, and privacy policy.
3. Request only OpenID, email, and profile scopes.
4. Create a Web OAuth client.
5. Add the Supabase provider callback:
   `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`.
6. In Supabase Auth, enable Google and enter the client ID and secret.
7. Add application redirect URLs:
   `http://localhost:3000/auth/callback` and
   `https://YOUR_DOMAIN/auth/callback`.
8. Set the Supabase site URL to the production origin.

Test with an ordinary customer Google account and the configured
administrator account.

## 6. Synchronize the administrator

Set `ADMIN_GOOGLE_EMAIL` in a trusted local shell alongside production
Supabase server credentials, then run:

```powershell
npm run admin:sync
```

The command normalizes the email and updates the active database allowlist.
Changing the environment value alone is not sufficient; rerun synchronization
and verify `is_active_admin()` before launch.

## 7. Configure Stripe

1. Keep Stripe in test mode.
2. Set `STRIPE_MODE=test`; use `live` only with matching approved live keys.
3. Create a webhook endpoint:
   `https://YOUR_DOMAIN/api/webhooks/stripe`.
4. Subscribe only to the event types documented in `docs/payments.md`.
5. Set the test secret and endpoint signing secret.
6. Complete a test Checkout payment and verify the signed webhook changes the
   database state.
7. Confirm duplicate delivery is harmless.
8. Confirm the success page alone does not unlock the deliverable.
9. Complete Stripe business verification before enabling live mode.
10. Replace test keys with live keys only after the production smoke test is
    otherwise complete.

## 8. Configure optional email

1. Add and verify a sending domain in Resend.
2. Configure SPF and DKIM records.
3. Set `RESEND_API_KEY`, `EMAIL_FROM`, and
   `ADMIN_NOTIFICATION_EMAIL`.
4. Send only to controlled recipients during the smoke test.

If email is not configured, leave `RESEND_API_KEY` empty. The application
records email as disabled and continues to use in-app notifications.

## 9. Create the Vercel project

Create the project without connecting Git auto-deployment. Use only the
isolated, audit-clean `$Vercel` CLI established in
`docs/deployment-bilingual.md`.

Add the variables from `.env.example` separately for Preview and Production.
Use only production Supabase and Stripe values in the Production environment.
Protect every secret variable.

The production build must not contact Stripe, send email, seed customer data,
or require Docker.

## 10. Deploy manually

Create the preview and production candidate only through that gated CLI,
following the bilingual runbook's unpromoted-candidate procedure.

Attach the custom domain, update DNS, and wait for HTTPS certificate
provisioning. Update application, Supabase, Google, Stripe, and Resend origins
to the final domain.

## 11. Production smoke test

- Public pages, metadata, sitemap, and responsive navigation render.
- Google OAuth returns to the expected domain.
- The configured account is administrator; an ordinary account is customer.
- Customer A cannot access Customer B's records or object paths.
- A request, private image, and persisted message work.
- Realtime delivery appears only in authorized sessions.
- Multiple quote options and a counteroffer work.
- Exactly one option can be accepted.
- Acceptance creates one immutable commission snapshot.
- Administrator confirmation, ETA, drafts, revision, and approval work.
- Stripe test Checkout and signed webhook processing work.
- Duplicate and delayed webhooks are harmless.
- Deliverable access is denied before payment and succeeds after payment.
- First access advances `PAID` to `DELIVERED`.
- Aftercare and customer completion work.
- Private routes are `noindex`.
- Logs contain no tokens, message bodies, private URLs, or image data.

## 12. Rollback and recovery

For application regressions, promote the previously verified Vercel
deployment. Do not roll back the database automatically.

For database incidents:

1. Stop writes if integrity is at risk.
2. Take a new database dump.
3. Preserve migration and provider logs.
4. Create and review a forward corrective migration.
5. Apply it manually.
6. Repeat isolation and payment-gating smoke tests.

Restore from a backup only after testing the restore procedure in a separate
project.
