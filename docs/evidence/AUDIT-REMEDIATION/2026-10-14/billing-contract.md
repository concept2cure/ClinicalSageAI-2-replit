# F12 — administrative allocations and unavailable credit charging

Date: 2026-10-14. Scope: the existing billing surface and credit service; no new product, payment, provider, model or tariff.

The audit found that **Buy more** opened a subscription-management portal, while no checkout, webhook fulfillment or usage debit could add or consume a customer's credit balance. The saved auto-reload rule could mint a ledger entry without charging a payment method if a caller invoked it. These were not complete payment workflows.

## The units actually present

| Source | Recorded unit / behavior | Relation to the allocation ledger |
| --- | --- | --- |
| `credit-ledger.ts`, `credit_ledger.amount_cents` | Signed integer cents; balance is their sum | Administrative allocation; grants and adjustments only |
| `usage-metering.ts`, `usage_records.credits_used` | Feature quota units, normally one per feature run | No approved conversion to money or ledger debit |
| `usage-recorder.ts`, `api_usage_logs.cost_cents` | Observed provider-cost attribution | A cost observation, not a customer charge |
| `billing.ts`, `PRICING` / `DTC_PRICING` | Subscription prices and included token allowances | Subscription checkout; no prepaid-credit checkout |

`PRICING.overagePerKTokens` is declared as cents per 1,000 tokens, but the `25` entry's comment says `$0.025`. Those interpretations differ by a factor of ten. No rate is chosen by this remediation. Feature credits also have no money tariff or policy governing included allowances, overages, unsuccessful requests, rounding, refunds or replay.

## Implemented contract

`GET /api/billing/credits` retains `balanceCents`, `ledger` and `autoReload`, and adds:

```json
{
  "capabilities": {
    "balanceMode": "administrative_allocation",
    "unit": "ledger_cent",
    "purchase": { "available": false, "reason": "Credit purchases are unavailable. Contact your administrator about allocations." },
    "autoReload": { "available": false, "reason": "Automatic credit reload is unavailable." },
    "usageDebit": { "available": false, "reason": "Allocations are not debited for usage and do not increase plan limits." }
  }
}
```

A historical enabled request is returned as `autoReload.requestedEnabled: true`, with effective `enabled: false` and `available: false`. Its recorded settings and ledger history are retained. Clearing that request remains admin/owner-only, requires the person's reason, and carries the existing audit outcome. Enabling it returns **409 `CREDIT_CAPABILITY_UNAVAILABLE`**, before any upsert. String booleans are rejected.

The service also refuses purchase, auto-reload and debit entries before opening a database connection. The existing `debitCredits` boundary raises the same explicit refusal; `maybeAutoReload` never mints an unpaid entry. Setting Stripe credentials alone cannot activate these missing workflows.

Platform administrators retain the allocation endpoint for `grant` and `adjustment`. Every allocation requires the target organization, identified actor and reason. It stamps the transaction's tenant context and writes the canonical chained audit row on the same client before committing. Failure to write that row rolls the allocation back. The response says `balanceMode: administrative_allocation` and carries the successful chained audit outcome only after commit.

The UI labels **Administrative allocation**, displays recent recorded entries/reasons, states that allocations do not increase plan limits, and states that credit purchases and automatic reload are unavailable. **Manage subscription** is the reachable replacement for the former portal button, beside invoices. It opens the existing subscription portal and makes no credit-purchase promise. A saved reload request can be cleared through a reason dialog; there is no enable action. The AnA surface context states the same boundaries.

## Remaining dependency and activation runbook

This is a complete correction of the misleading allocation controls, **not a completed prepaid billing integration**. Before any charging capability becomes available:

1. Record the approved, versioned pricing contract: currency; chargeable units and scopes; included-plan allowance ordering; conversion from each metered unit to integer cents; rounding; unsuccessful-call handling; refund/dispute policy. Resolve the token-overage unit discrepancy above. Provider cost observations must not become a retail tariff by default.
2. Implement a dedicated credit checkout seam, separate from subscription checkout. The server derives the organization and actor, resolves the configured Stripe price and authorized quantity, records the requested allocation, and supplies an idempotency key. Browser input cannot supply the credited amount or tenant identity.
3. Fulfill only a signature-verified, successfully paid Stripe event whose customer, currency, configured price, server-recorded request and amount match. Persist a unique payment/reference key with the allocation and chained audit in one transaction. Duplicate deliveries do nothing; a failed delivery remains retryable. The current subscription-event bookkeeping skips an existing event even when its `processed` flag is false; it cannot be adopted unchanged for money fulfillment.
4. Bind each charge to an immutable usage/run id and tariff version, with reservation/settlement ordering and an idempotent debit. Prove that concurrent requests cannot double-debit or overdraw and that a refused/failed execution follows the approved policy.
5. Implement off-session reload only with recorded payment consent and a payment method authorized for it. Bound reload frequency, maximum amount and monthly spend. Hold/reserve per organization; a provider failure, pending payment, authentication challenge or retry cannot mint an allocation. Credit only a verified paid settlement; disablement stops new requests.
6. Add provider-mocked, native database and browser proofs for successful settlement, replay, wrong tenant/customer/currency/price, unpaid/pending events, failed-event retry, concurrent debits, duplicate reloads, caps, provider outage and audit rollback. Use Stripe test mode for separate deployment qualification, with no real charges.
7. Activate the machine-readable capability flags only when their implemented workflows pass those checks and the reviewed pricing/consent contract is configured. Never use a flag to bypass the unsupported service boundary.

Existing deployment integration: register the additive canonical `migrations/20260702_usage_model_credit_ledger.sql` in `C2C_MIGRATION_FILES` before the final tenant sweeps, and remove only its migration-deploy-path baseline entry. It already backs fresh installs through the schema/migration installer; registration also repairs deployed estates. The control-tower owns that registration.
