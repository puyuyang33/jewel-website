# CI/CD Plan

## Current status

CI/CD is intentionally **manual-only**.

The repository contains `.github/workflows/manual-verify.yml`, whose only
trigger is `workflow_dispatch`. It does not run on pushes, pull requests,
branches, tags, schedules, or releases. It does not deploy the application,
apply database migrations, create Supabase projects, or receive production
credentials.

Dependabot, Vercel Git deployment, automated migrations, and scheduled jobs
are not configured.

`vercel.json` sets `git.deploymentEnabled=false`; Vercel deployments are
created only through the reviewed manual `npm run vercel:*` workflow.

## Running the current workflow

1. Open the repository on GitHub.
2. Select **Actions**.
3. Select **Manual verification**.
4. Select **Run workflow** and the branch to verify.
5. Review the complete log and resolve failures before a manual deployment.

The workflow checks out the selected revision, installs the pinned Node.js
version, runs `npm ci`, and runs `npm run verify`.

`npm run verify` includes `npm run check:manual-workflows`, which fails if any
workflow declares a trigger other than `workflow_dispatch`.

The same gate is available locally:

```powershell
npm ci
npm run verify
```

Database and browser tests require the local services documented in
`docs/testing.md`:

```powershell
npm run verify:full
```

## Guardrails

- Do not add `push`, `pull_request`, `schedule`, `release`, or `deployment`
  triggers without explicit owner approval.
- Do not place production Supabase, Stripe, Resend, or Google secrets in
  GitHub Actions for the current workflow.
- Do not run migrations from a Vercel build.
- Do not point tests or previews at the production database.
- Do not expose secrets to pull requests from forks.
- Do not upload screenshots, traces, logs, or database dumps until they have
  been reviewed for customer data.

## Future pull-request pipeline

If automatic checks are approved later, add a separate pull-request workflow:

1. Check out the exact commit.
2. Install the pinned Node.js version with npm caching.
3. Run `npm ci`.
4. Run formatting, lint, and strict type checks.
5. Run unit and component tests.
6. Start an isolated local Supabase instance.
7. Reset the local database and apply committed migrations.
8. Run pgTAP RLS and transaction tests.
9. Run integration tests with test-only provider credentials.
10. Build the production application without production secrets.
11. Run Playwright against local services.
12. Upload artifacts only on failure and only after confirming that fixtures
    contain no personal or confidential data.

Forked pull requests must run without organization secrets.

## Future preview deployment

A preview pipeline may be enabled only after the quality pipeline is reliable:

- Use an isolated non-production Supabase project.
- Use Stripe test mode and a preview-specific webhook.
- Use a test-only Resend recipient or keep email disabled.
- Never use the production service-role key.
- Never apply destructive or production migrations.
- Produce a preview URL only after all checks pass.

## Future production deployment

Production automation, if approved, should require:

1. A protected default branch.
2. Successful quality checks.
3. A manual environment approval.
4. A reviewed database backup.
5. Backward-compatible, forward-only migrations.
6. Application deployment after migration success.
7. Production smoke tests with synthetic accounts.
8. Explicit rollback instructions.

Application rollback promotes a previous Vercel deployment. Database rollback
uses a reviewed corrective migration; it must never automatically run a
destructive down migration.

## Enabling automation later

1. Obtain explicit owner approval for the exact trigger and environment.
2. Create isolated preview resources and least-privilege credentials.
3. Add protected GitHub environments and required reviewers.
4. Copy the relevant manual commands into a new workflow.
5. Validate it from a non-production branch.
6. Confirm fork-secret behavior.
7. Enable branch protection only after the workflow is stable.
8. Document the change and update this file.

Until those steps are approved and completed, `workflow_dispatch` remains the
only GitHub Actions trigger.
