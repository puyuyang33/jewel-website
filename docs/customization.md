# Customization

Veyra Atelier is a fictional development brand. Replace it before launch.

## Brand and public content

| Item                                                 | Location                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| Brand name, designer, tagline, contact, social links | `src/config/brand.ts`                                              |
| Colors and typography tokens                         | `src/app/globals.css`                                              |
| Logo mark                                            | `src/components/brand/logo.tsx`                                    |
| Favicon/application icon                             | `src/app/icon.svg`                                                 |
| Global SEO defaults                                  | `src/config/brand.ts`, `src/app/layout.tsx`                        |
| Home and public sections                             | `src/components/marketing`, `src/app` public routes                |
| Portfolio seed/fallback content                      | Public marketing data module and Supabase seed                     |
| Legal templates                                      | `src/app/privacy`, `src/app/terms`, `src/app/payment-cancellation` |

Do not scatter new brand constants through route components. Add them to the
central typed configuration or editable site settings.

## Images

Replace abstract development artwork with original or properly licensed
photography. Record alt text and permission. Never copy another designer's
portfolio, descriptions, client references, or brand identity.

## Business settings

Configure these values per environment:

```text
BUSINESS_TIMEZONE
DEFAULT_CURRENCY
DELIVERABLE_ALLOWED_HOSTS
ADMIN_NOTIFICATION_EMAIL
```

Production must use the merchant's actual timezone and ISO currency. Currency
changes do not convert existing immutable quote or commission snapshots.

## File limits

Edit centralized limits in `src/config/limits.ts`, then update route validation,
storage documentation, and tests together. Keep limits below Vercel and
Supabase request/runtime constraints.

## Administrator

Set `ADMIN_GOOGLE_EMAIL` and run:

```powershell
npm run admin:sync
```

Never hardcode the real administrator email in source or seed data.

## Supabase

Set:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Apply migrations and regenerate types after an approved schema change:

```powershell
npm run db:reset
npm run db:types
```

Do not manually edit generated production types without updating the migration.

## Google OAuth

Configure separate testing and production OAuth clients. Update Google
authorized domains, the Supabase callback, Supabase site URL, and application
redirect allowlist whenever the public domain changes.

## Stripe

Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` with test values during
development. Merchant country controls availability and pricing. Do not reuse
test webhooks or products in live mode.

## Resend

Set `RESEND_API_KEY`, `EMAIL_FROM`, and `ADMIN_NOTIFICATION_EMAIL` after sender
domain verification. If not configured, email remains explicitly disabled and
in-app state continues to work.

## Vercel and domain

Set `NEXT_PUBLIC_APP_URL` to the exact HTTPS production origin. Update OAuth,
webhook, canonical, and email deep-link settings at the same time.

Keep Vercel Git auto-deployment disabled unless separately approved. The
checked-in GitHub Action remains manual-only.

## Feature changes

Future deposits, physical fulfillment, additional staff, taxes, shipping, or
private uploaded final files affect core business rules. Implement them through
new migrations, domain transitions, authorization tests, documentation, and
explicit owner approval rather than hidden settings.
