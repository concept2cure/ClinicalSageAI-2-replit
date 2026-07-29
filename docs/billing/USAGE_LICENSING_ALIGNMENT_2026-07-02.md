# Usage monitoring + licensing alignment (Anthropic-style) — 2026-07-02

Aligns the platform's licensing, usage monitoring, and billing backend with
the model Anthropic uses for Claude plans: plan usage limits with a rolling
session window and weekly per-model buckets, a rechargeable credit balance
with auto-reload, invoice history, and per-capability toggles.

## What existed before (and the core defect)

The repo already carried most of the Anthropic-shaped machinery:
`weekly_usage_limits` + overage ledger + threshold alerts
(`server/services/weekly-usage-limits.ts`), a billing dashboard API
(`server/routes/billing-dashboard.ts`), budgets/alerts tables, a Stripe
invoice proxy, module subscriptions, feature toggles, and a pure tier
entitlement matrix (`server/services/entitlements/mdx-entitlements.ts`).

The core defect: **nothing ever wrote `api_usage_logs`** — the table every
usage dashboard, weekly limit, and overage computation reads. Limits could
be configured but never fired; dashboards always read zero. The enforcement
middleware (`enforceWeeklyLimit`) was also mounted on no route, and the
three entitlement layers (tier matrix, module subscriptions, feature
toggles) were disconnected.

## What this change adds

### 1. Usage recording (the missing writer)
- `server/services/usage-recorder.ts` — validated, fire-and-forget writer
  for `api_usage_logs`. Pure `normalizeUsageEntry` (drops unattributable
  entries rather than guessing a tenant), `usdToCents`.
- The **AI gateway** (`server/services/ai-gateway/gateway.ts`) now meters
  every routed LLM call — org, user, caller module, task type, serving
  model, real token counts, estimated cost in cents — on both success paths
  and the terminal-failure path. Metering is independent of the audit
  toggle and never fails the call.
- Migration `migrations/20260702_usage_model_credit_ledger.sql` adds
  `api_usage_logs.model` (+ `(org, model, created_at)` index) so usage can
  be bucketed per model family.

### 2. Plan usage windows (the Anthropic Usage page shape)
- `server/services/usage-windows.ts` — pure session-window math
  (`sessionWindowFromEvents`: 5-hour window anchored on the first metered
  call, "resets at" = anchor + 5h) and `percentUsed`, plus a per-tier
  budget grid (`PLAN_USAGE_BUDGETS`, free → enterprise). An org-configured
  weekly `cost_cents` limit (existing governed setter) overrides the plan's
  weekly all-models budget.
- `GET /api/billing/usage/limits` — plan label, session bucket (% used,
  resets at), weekly "All models" + "Premium models (Opus)" buckets.
- `GET /api/billing/usage/by-model` — weekly per-model drill-down.

### 3. Credit balance + auto-reload (the Anthropic Billing page shape)
- Tables `credit_ledger` (append-only signed ledger; balance =
  SUM(amount_cents); every row stores balance-after; CHECK-constrained
  entry signs) and `credit_autoreload_settings` (defaults mirror "top off
  to $25 when balance is $10").
- `server/services/credit-ledger.ts` — per-org advisory-lock serialized
  writes, overdraw rejection (`INSUFFICIENT_CREDITS`), `debitCredits` →
  `maybeAutoReload` flow, governed `setAutoReload` (reason-for-change +
  Part 11 audit event, mirroring `setWeeklyLimit`).
- Endpoints: `GET /api/billing/credits` (balance, ledger, settings),
  `PUT /api/billing/credits/auto-reload` (org admin, governed),
  `POST /api/billing/credits/adjust` (platform admin only — ledger credits
  are money-equivalent, so tenants cannot self-issue them).
- **Deliberately out of scope:** charging the payment method. Purchase /
  auto-reload entries record the ledger movement; Stripe charging wires to
  the existing `billing.ts` checkout flow in a follow-up. Until then,
  credit issuance is platform-admin-gated.

### 4. Unified capabilities (the Anthropic Capabilities page shape)
- `server/services/entitlements/resolver.ts` — composes the tier matrix ⊕
  `feature_toggles` grants ⊕ `module_subscriptions` into one effective view.
  Toggles are **grant-only** (pilot/beta access below tier); revoking a
  tier entitlement is a plan change, not a flag flip. Fail-soft per layer.
- `GET /api/billing/capabilities`.

### 5. Enforcement actually mounted
- `enforceWeeklyLimit('requests')` now guards `/api/ana`, `/api/ana-ri`,
  `/api/chat`, `/api/claude` (`server/bootstrap/register-ai-routes.ts`).
  Strictly opt-in per org (no configured limit → no-op) and fail-open, so
  a metering outage never blocks an AI call.

## Relationship to existing metering

`usage_records` (per-feature monthly credits, `usage-metering.ts`) remains
the Business-Center cost-accounting source and is untouched. This work
feeds and consumes `api_usage_logs` (tokens/cost/requests, now per-model).
The gating order stays: entitlement first (`resolver` / `isEntitled`), then
quota (`checkQuota` / weekly limits) — per
`MDX_PAYING_CUSTOMER_VALUE_AND_ENTITLEMENTS_2026-06-15.md`.

## Tests

`server/services/__tests__/usage-alignment.test.ts` covers the pure cores:
entry normalization, USD→cents, session-window anchoring, percent-used,
budget-grid monotonicity, auto-reload predicate/validation, ledger entry
sign rules, toggle applicability, and tier⊕toggle composition (grant-only
invariant). DB wrappers are thin pass-throughs, same posture as
`weekly-usage-limits.test.ts`.

## Client wiring (future)

The client Billing/Usage/Capabilities settings surfaces are still
greenfield (`HANDOFF_TO_DESIGN_master_admin_business_center.md`); the
endpoints above provide the exact shapes those pages need.
