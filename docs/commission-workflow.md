# Commission Workflow

## Design requests

```text
draft -> open -> quoted <-> negotiating -> accepted
                 |             |
                 +-----------> declined
open / quoted / negotiating -> closed
```

Declining one quote does not automatically close the entire inquiry. A request
becomes accepted only through atomic quote acceptance.

## Quotes

Administrator drafts may contain multiple options. Sending a quote makes its
commercial payload immutable.

Actionable lifecycle events are append-only:

```text
draft -> sent -> viewed
sent/viewed -> countered | accepted | declined | cancelled | superseded
countered -> superseded when a revised quote is sent
```

Expiration is derived from `expires_at` and blocks acceptance even before an
explicit expired event is written.

Accepting an eligible option:

1. Locks the request and active quote versions.
2. Rechecks expiration and expected status.
3. Ensures no prior option was accepted.
4. Records the acceptance idempotently.
5. Copies scope, materials, stones, deliverables, revisions, money, currency,
   and schedule into an immutable commission snapshot.
6. Creates one commission in `awaiting_admin_confirmation`.
7. Supersedes competing quote versions.

## Commission states

```text
awaiting_admin_confirmation
  -> confirmed
  -> in_progress
  -> draft_review
  -> revision_requested -> draft_review
  -> draft_approved
  -> final_payment_due
  -> paid
  -> delivered
  -> aftercare
  -> completed
```

`cancelled` and `disputed` are explicit terminal or exceptional branches. They
do not silently return to normal production.

## Drafts and revisions

Drafts are versioned and remain private. A customer may approve only the
latest eligible shared version.

A revision request references an exact draft. Customer requests consume the
accepted revision allowance. When it is exhausted, the customer control is
disabled; another revision requires a revised quote or a documented
complimentary administrator override.

## Payments and delivery

Only a verified Stripe webhook advances
`final_payment_due -> paid`. The success redirect cannot do so.

The first authorized final-deliverable access records an access event and
atomically advances `paid -> delivered`. Repeated access is idempotent.

Either participant may start aftercare after delivery. Only the customer
confirms `aftercare -> completed`.

## History and audit

Every transition records prior state, new state, actor, timestamp, reason, and
idempotency identity. Accepted terms, financial records, draft versions,
delivery access, and audit history are not hard-deleted.
