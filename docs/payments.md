# Payments

## Scope

The MVP accepts one final payment after draft approval. Deposits are disabled.
Checkout uses Stripe-hosted card fields; the application never receives or
stores card number, CVC, or raw payment credentials.

Set `STRIPE_MODE=test` for local, Preview, and zero-cost Demo deployments.
Set `STRIPE_MODE=live` only in an approved live Production environment with a
matching `sk_live_...` key. A mode/key mismatch is treated as unconfigured and
Checkout remains unavailable.

## Checkout creation

The customer posts only a commission reference. The server:

1. Authenticates the customer and verifies ownership.
2. Locks or transactionally reserves the eligible commission.
3. Requires `final_payment_due`.
4. Reads amount and currency from the immutable accepted snapshot.
5. Creates or reuses a pending payment attempt.
6. Builds safe Stripe metadata containing only internal correlation IDs.
7. Creates a hosted Checkout Session with a deterministic idempotency key.
8. Stores the provider session correlation.
9. Returns only the Checkout URL.

Browser-supplied amount, currency, customer, payment status, and quote data are
ignored.

## Return page

The return page reads database payment state. If the webhook has not arrived,
it displays payment pending. It never interprets a query parameter as proof of
payment.

## Webhooks

The webhook route reads the raw body once and verifies the Stripe signature
before creating a service-role client.

Provider event IDs are unique. Processing re-reads the expected payment,
commission, amount, and currency from PostgreSQL, then calls an atomic
database workflow.

Supported commands include successful/failed Checkout payment, expiration,
refund status, and dispute status. Duplicate and out-of-order delivery is
monotonic and idempotent.

Refund `requires_action` is persisted as unresolved and blocks delivery until
a later verified event resolves it.

The route returns success only after durable recording. Invalid signatures,
mismatched monetary data, or unavailable transaction workflows fail
explicitly.

Subscribe the production webhook to exactly these handled events:

```text
checkout.session.completed
checkout.session.expired
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
payment_intent.processing
payment_intent.succeeded
payment_intent.payment_failed
payment_intent.canceled
refund.created
refund.updated
refund.failed
charge.refunded
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
charge.dispute.funds_withdrawn
charge.dispute.funds_reinstated
```

Other signed Stripe events are intentionally ignored. The minimum Stripe
product is one-time Payments through hosted Checkout with PaymentIntents,
signed webhooks, refunds, and dispute handling. Billing, subscriptions,
Elements, Payment Links, Connect, Tax, Customer Portal, saved Customers, and
pre-created Products/Prices are not required.

## Refunds and disputes

Automated refund initiation is not implemented. Inbound verified provider
events are recorded in append-only ledgers, update cumulative refund state
under lock, and transition the payment or commission only through allowed
states.

Business cancellation and refund decisions remain manual and must follow the
published policy.

## Testing

- All automated payments use Stripe test mode or injected fake clients.
- Webhook tests generate signed fixture payloads.
- Duplicate, delayed, and reordered events are covered.
- Cross-customer Checkout creation is denied.
- Delivery remains locked until a succeeded final payment is committed.
- No test makes a live charge.
