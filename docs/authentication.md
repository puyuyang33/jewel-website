# Authentication and Authorization

## Sign-in

The application uses Google OAuth through Supabase Auth. Public pages do not
require an account. Creating or viewing private work requires sign-in.

Email/password, phone, anonymous, and other hosted providers must remain
disabled. Database authorization requires both a confirmed Auth email and a
linked Google identity, plus an OAuth authentication method in the current
JWT. A password session is denied even when that account also has a linked
Google identity.

The sign-in action:

1. Validates the requested internal return path.
2. Starts Supabase OAuth with PKCE.
3. Requests only OpenID, email, and profile scopes.
4. Sends Google back through the Supabase provider callback.
5. Returns to `/auth/callback`.

The application does not store Google access or refresh tokens.

## Callback

The callback exchanges the one-time authorization code, loads the verified
Supabase user, synchronizes a minimal profile, records last sign-in, derives
the current role from trusted data, and redirects to an allowlisted internal
path.

External, protocol-relative, encoded-separator, backslash, and control
character redirect values are rejected.

## Roles

- `customer`: all ordinary signed-in accounts.
- `admin`: the one confirmed Google email in the active database allowlist.

No browser form can set a role. The first user is not automatically promoted,
and there is no public administrator registration.

## Administrator synchronization

Set these server-side variables:

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ADMIN_GOOGLE_EMAIL
```

Then run:

```powershell
npm run admin:sync
```

The script normalizes the configured email and synchronizes the protected
allowlist. Run it again whenever the administrator email changes. Verify the
old account loses access. The service-role RPC serializes rotations and
atomically leaves exactly one active administrator; an exact retry is
idempotent.

## Enforcement

`requireUser()` verifies the current Supabase claims and returns a minimal
identity DTO. `requireAdmin()` additionally invokes the active allowlist check.
Profile role data alone never grants administrator access.

Pages, Server Actions, route handlers, database functions, RLS policies, and
storage policies enforce their own relevant authorization. Navigation,
layouts, hidden controls, and proxy redirects are convenience layers rather
than security boundaries.

## Cookies and expiration

`@supabase/ssr` owns session cookies. The Next.js proxy refreshes expired
sessions before rendering when possible and propagates updated cookies.
Concurrent refreshes can still cause a temporary null session; the UI returns
to sign-in rather than treating the request as authorized.

Signing out clears the Supabase session and redirects to the public site.

## Test strategy

Ordinary E2E tests use local controlled users and do not automate Google's
login page. Unit and database tests cover:

- Safe redirect handling.
- Email normalization.
- Missing and expired sessions.
- Customer and administrator authorization.
- Revoked allowlist access.
- Password-only and non-Google JWT denial.
- Atomic singleton-administrator synchronization.
- Cross-customer RLS isolation.
- Customer inability to mutate role or allowlist data.
