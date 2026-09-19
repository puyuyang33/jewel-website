# Administrator Guide

## Sign in

Use the exact confirmed Google account configured through
`ADMIN_GOOGLE_EMAIL` and synchronized into the active allowlist. There is no
administrator registration page.

If the customer workspace appears instead, verify the environment value,
rerun `npm run admin:sync`, and sign in again.

## Dashboard

The dashboard highlights operational work:

- Unread conversations.
- Open design requests.
- Quotes awaiting customer action.
- Accepted commissions awaiting confirmation.
- Active commissions by stage.
- Drafts awaiting review.
- Final payments due or recently paid.
- Aftercare awaiting customer completion.

Metrics reflect database records and do not estimate unverified revenue.

## Inbox

Use search and filters to locate unread or active conversations. Opening a
conversation records the administrator read marker.

Messages are customer-visible. Private notes are a separate control and never
appear in customer conversations, email, or Realtime channels.

## Customer history

Customer detail shows the confirmed profile, sign-in history, requests,
conversations, quotes, commissions, payments, authorized attachments, and
private notes. Do not copy private content into external tools.

## Quote options

1. Open a quotable design request.
2. Create a draft quote with one or more options.
3. Enter scope, materials, stone assumptions, deliverables, included revision
   rounds, estimates, price, final-payment amount, currency, expiry, and terms.
4. Review all values before sending.
5. Send the quote.

Sending freezes that version. To change it, create a revision. Do not edit a
sent quote in place.

A counteroffer is a customer proposal, not an official quote. Respond by
declining it or issuing a revised quote.

## Commission confirmation

After a customer accepts, confirm the commission and enter an estimated
completion date or duration. Treat the estimate as a professional forecast,
not an automatic guarantee.

Advance only through controls offered by the commission page. Invalid or stale
transitions are rejected.

## Drafts and revisions

Upload a private normalized draft image, create the next version, and publish
it for review. Customer revision requests and approvals always reference an
exact version.

The page shows included, used, and remaining revision rounds. A complimentary
override requires an administrator reason and remains auditable.

## Final payment and delivery

After the latest draft is approved:

1. Register the final approved HTTPS deliverable.
2. Verify its allowed hostname and content.
3. Mark final payment due.
4. Wait for a verified Stripe webhook.
5. Confirm payment status in the administrator ledger.
6. Release the deliverable.

Never paste the raw link into messages or email. Never mark payment successful
manually.

The first successful customer access records delivery. External links can be
shared after the customer sees them.

## Aftercare

Start aftercare after delivery and continue in the private conversation. The
customer, not the administrator, confirms aftercare completion.

## Portfolio

Create or edit a project, add original or licensed media, supply meaningful alt
text, assign categories, and publish only after review. Never publish customer
references or draft images without documented permission.

## Settings

Settings are allowlisted and typed. Update the public brand/contact content
through supported fields. Security-sensitive host, currency, timezone, and
provider configuration remains in the deployment environment.

## Audit log

The audit view contains a sanitized operational projection. It excludes raw
deliverable URLs, message bodies, tokens, and image data. Review unexpected
administrator, payment, or delivery actions promptly.
