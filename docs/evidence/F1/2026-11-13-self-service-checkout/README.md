# Self-service checkout response repair

Package: F1. Launch concern: D9 purchase/onboarding correctness. Existing surface completed: `client/src/concept2cure/v2/surfaces/LicensingSurface.tsx`. This slice does not close commercial readiness or customer acceptance.

## Problem and resulting behavior

The self-service route returns `{ sessionId, url }`. Licensing read only `checkoutUrl`, so a successfully created Stripe session appeared as “Checkout did not return a payment link.” Its existing test used the wrong response shape and therefore concealed the defect.

The existing billing adapter now normalizes the self-service response and retains the session identifier. Paid selections use the returned checkout link. A successful `sessionId: 'free'` response acknowledges free activation and reloads the actual subscription status instead of opening the internal return URL as a payment page. A free-session marker on a paid request, malformed/missing link or refused request does not claim activation.

Per-user checkout still reads its existing `checkoutUrl` contract. Existing administrator/member boundaries, portal behavior, plan prices and server-side authorization/qualification are unchanged. Compact formatting keeps the existing source below the ESLint code-line threshold without adding a parallel helper file.

## What already exists

- `server/routes/billing.ts`: authenticated, billing-admin-only DTC/per-user checkout and portal routes. DTC returns the service result, while per-user checkout maps its result to `checkoutUrl`.
- `server/services/billing.ts`: Stripe session creation and the existing free activation/provisioning path; free activation returns `sessionId: 'free'` only after its service work.
- `client/src/concept2cure/v2/surfaces/LicensingSurface.tsx`: the existing catalog, checkout/portal adapter, real subscription read and role-aware controls. This is the only runtime source changed.
- `client/src/concept2cure/v2/dataConnect.tsx`: existing mutation outcome handling and dependency-driven `useLiveData` refresh.
- `client/src/concept2cure/v2/surfaces/Onboarding.tsx`: an existing consumer already distinguishes a real DTC URL from free activation; it was inspected, not replaced.
- `client/src/concept2cure/v2/__tests__/licensingBillingControls.test.tsx`: existing component/API seam tests. Their DTC fixture now reflects the actual route contract.

Search covered checkout, DTC, licensing, portal, free activation, onboarding and deleted licensing/checkout paths in the available history. No existing capability was rebuilt; no screen, route, service, table, provider or model was added.

## Verification

The corrected contract and activation tests were exercised against the original component: three behavioral tests failed, with ten passing. The final implementation passes 31 tests across the billing-control, invoice and enterprise-action suites, including 13 billing-control cases. Cases cover real paid DTC links, selected cycle/plan, per-user links, free activation/readback, malformed/missing links, paid/free mismatches, service refusals and member access.

Commands:

```bash
npx vitest run --config vitest.config.ts \
  client/src/concept2cure/v2/__tests__/licensingBillingControls.test.tsx \
  client/src/concept2cure/v2/__tests__/licensingInvoices.test.tsx \
  client/src/concept2cure/v2/__tests__/licensingEnterpriseAction.test.tsx
npx eslint client/src/concept2cure/v2/surfaces/LicensingSurface.tsx \
  client/src/concept2cure/v2/__tests__/licensingBillingControls.test.tsx
bash scripts/ai/verify-tests.sh
```

Node 22 was used to honor the repository engine requirement. ESLint reports zero errors and no added warnings: three existing surface warnings, zero test warnings. The companion-name scan warns because the existing test is named `licensingBillingControls.test.tsx`, not `LicensingSurface.test.tsx`; the component was exercised by the suites above. No dependency or lockfile change is included.

The canonical `npm run build` passed for the client, server, audit-chain verifier and qualification verifier packaging. `ci:one-product` passed with no new surface or rail entry. The warning ratchet linted both original and repaired versions and found no warning-count change. The one-design-plan selftest and proposed F1 path/trailer evaluation passed.

The canonical full-program typecheck gate completed successfully with zero errors against the unchanged zero baseline: `TYPECHECK_HEAP_MB=12288 node scripts/ci/typecheck-no-regression.mjs --incremental`. An earlier incomplete sparse-checkout run was not used as proof; required tracked locale/worker sources were materialized before the final successful run. The final exact-source billing-control smoke run passed all 13 cases.

Verified runtime/test source SHA-256 values:

- `LicensingSurface.tsx`: `38584861acbc46fff2b378b151e1723bd39c679ec330a564eccde0593d502c5b`
- `licensingBillingControls.test.tsx`: `5aa5dfe559df86a3ff10ea514aaf794ecab22c3cbe0aa57ae13cfc79d86876cf`

## Boundaries and next work

Tests exercise the real React component and client request/outcome seam with simulated HTTP responses, not a live Stripe account, production browser or payment settlement. This repair does not establish end-to-end signup, qualified production use or a deployed checkout.

The audit found independent remaining work:

1. `ZenSignup.tsx` checks `data.organizationId`, while signup returns `data.organization.id`.
2. Production email verification returns before paid checkout, losing the component-local plan choice. Complete durable, non-authorizing preference continuity through verification/resend/login into the existing onboarding flow; preserve password/second-factor and server entitlement gates.
3. `processWebhookEvent` skips any stored event, including unsuccessful processing, and the route acknowledges processing failure. Complete retry/recovery and concurrency semantics before claiming reliable paid activation. This slice changes neither webhook code nor financial fulfillment.

Keep these as separate accepted repairs in the existing plan. Do not mark the complete website-to-qualified-project journey done from this UI fix.
