# Billing remediation verification

Node 22.23.3, Vitest 4.1.7. No provider calls, payment transactions, native database provisioning, commit, push or deployment were performed.

`billing-red.txt`: ten meaningful service regressions failed against the previous credit service. They cover unbacked reload minting, unsupported payment/debit entry creation, accepting automatic-charge enablement, interpreting a saved request as effective, absent allocation actor/reason, and allocation commit without its audit row.

`billing-green.txt`: **68 tests passed in 8 files**, no failures or skips. The group covers those boundaries, real route role/refusal behavior, allocation actor/reason/audit transaction ordering and rollback, UI allocation/capability/history rendering, subscription-portal access, saved-request clearing, existing invoice/usage error states, monthly/annual subscription arithmetic and free-tier activation safeguards.

`billing-lint.txt`: scoped ESLint completed with zero errors. Remaining warnings are the existing large/complex surface and dashboard warnings; the credit service has no warnings. Scoped `git diff --check` passed.

Test files:

- `server/services/__tests__/credit-allocation-boundary.test.ts`
- `server/services/__tests__/credit-autoreload-audit-outcome.test.ts`
- `server/services/__tests__/usage-alignment.test.ts`
- `server/services/__tests__/billing-interval-pricing.test.ts`
- `server/services/__tests__/billing-free-tier-activation.test.ts`
- `server/routes/__tests__/billing-credit-capabilities.test.ts`
- `client/src/concept2cure/v2/__tests__/usageBillingControls.test.tsx`
- `client/src/concept2cure/v2/__tests__/usageBillingLive.test.tsx`

Limits: database access is mocked in this group; client APIs and the allocation's canonical audit writer are mocked. The allocation tests prove the writer is on the same client, before commit, and failure requests rollback; they do not replace the canonical audit-chain or native PostgreSQL/RLS tests. No Stripe money settlement, actual payment consent or approved retail tariff exists in this change. Those remain the explicit activation dependency in `billing-contract.md`.
