# RLS Enforcement Burndown — runway to `RLS_ENFORCE=on`

Status: **analysis / planning** (no enforcement flip in this doc).
Owner: unassigned. Relates to `GA_READINESS_PLAN.md` item **0.1** (highest severity).

This is the map for turning on Postgres Row-Level Security as tenant-isolation
defense-in-depth. It sizes the work, names the linchpin, and gives a safe order.
It complements — does not duplicate — the app-layer boundary already merged
(JWT org scoping in handlers, PR #1047; default-deny `/api` auth boundary +
RLS boot-posture hardening, PR #1042).

## Where the pieces stand

| Piece | State | Where |
|---|---|---|
| RLS policy installed (compiles to no-op unless `app.rls_enforce='on'`) | ✅ done | migrations; `server/db/tenantRls.ts` |
| Three-knob rollout `RLS_ENFORCE=off\|shadow\|on` + per-connection `app.rls_enforce` | ✅ done | `server/db/rlsEnforcement.ts` |
| Prod fail-closed boot posture (explicit decision required; `RLS_REQUIRE_ENFORCE`) | ✅ done (#1042) | `server/db/rlsEnforcement.ts` |
| Observability shim: counts queries with no tenant scope (`tenant_session_var_missing_total`, labeled by caller) | ✅ done | `server/db/poolInstrumentation.ts` |
| AsyncLocalStorage tenant scope (`runWithTenantScope` / `getTenantScope`) | ✅ done | `server/db/tenantStore.ts` |
| Request middleware establishes scope + per-request scoped client | ✅ done, but **mounted on one route only** | `server/middleware/tenantContext.ts` |
| `withTenantConnection` (dedicated scoped client for jobs/scripts) | ✅ exists, **~1 caller** | `server/db/withTenantConnection.ts`; only `server/services/memory-consolidation-job.ts` |
| **Pooled queries carry `app.current_tenant_id`** | ❌ **missing — the linchpin** | see below |
| Scope established across all request routes + jobs/workers | ❌ not done | the burndown |

## The linchpin (do this first)

`db` (drizzle) is built over the **pool** (`server/db/runtime.ts:120`). The pool's
`connect` handler sets `app.rls_enforce` but **not** `app.current_tenant_id`.
The request middleware sets tenant vars only on a **dedicated per-request client**
(`req.dbClient`); jobs use the pooled `db`. So today, when `RLS_ENFORCE=on`, any
pooled `db.*` query runs with no `current_tenant_id` and the policy returns **zero
rows**.

Two ways to close it; **prefer (A):**

- **(A) Pool-level primitive** — a query/checkout hook that reads `getTenantScope()`
  and applies `app.current_tenant_id` (e.g. `SET LOCAL` inside a per-checkout
  transaction, or a wrapper that prepends `set_config`). This turns the scope
  *already established* by the request middleware into real filtering **without
  rewriting ~6,100 call sites.** Lives next to `installRlsEnforcement` in
  `server/db/rlsEnforcement.ts`. Delicate (pooling/reuse/transaction semantics) —
  needs targeted tests. **Highest leverage.**
- (B) Migrate every tenant-owned query to a scoped client (`req.dbClient` /
  `withTenantConnection`). Correct but ~thousands of edits; only for call sites
  that (A) can't cover.

> ⚠️ Do **not** just wrap code in bare `runWithTenantScope` to make the metric go
> green. Without (A) the pooled query still isn't filtered — the metric would
> report "scoped" while RLS does nothing. That is a false-green.

## Runway size (static approximation of the runtime metric)

Middleware is **piecemeal, not global**: the global `/api` gate is auth-only;
`requireTenantContext` (which calls `runWithTenantScope`) is mounted on **one**
route file (`server/routes/ana-features.ts`). So the unscoped surface is:

- **(D) Request routes** — effectively **all** data routes except `ana-features`.
  Closed in one move by promoting the global `/api` gate to also establish scope
  (with an allowlist for public/health/webhook prefixes). Coordinate with the
  merged `authBoundary` gate.
- **(A-jobs) Background writers, ~13 files** — the scariest, all unscoped:
  `server/jobs/*` (retentionCron, auditChainIntegritySweep, corpusIngestionSweep,
  driftSentinelSweep, externalIntelligenceSweep, regulatoryHorizonScan,
  scheduleOfEventsSweep, periodicReview) + `server/workers/*`.
- **(C) Schedulers/timers, ~9 files** — sentinel/scheduler, securityHealthScheduler,
  pv-periodic-scheduler, pdev-readiness-scheduler, submission-chat-sweep-scheduler,
  report-os worker, automation/scheduled-jobs, audit/chainIntegrityMonitor,
  ana/citation-run-pruner.
- **(B) Startup/bootstrap, ~4** — `server/startup/services.ts`, `server/data-importer.ts`,
  bootstrap route factories querying at mount time.

### Highest-risk unscoped **writers** (fix first within jobs)

| File | R/W | Why |
|---|---|---|
| `server/jobs/retentionCron.ts` | **W** | Cross-tenant `db.delete(vaultDocuments)` + archive INSERT (:59,:17) |
| `server/services/automation/scheduled-jobs.ts` | **W** | Automation writes, started at boot (`services.ts:254`) |
| `server/jobs/auditChainIntegritySweep.ts` | **W** | Cron audit-chain writes |
| `server/jobs/corpusIngestionSweep.ts` | **W** | Cron corpus writes |
| `server/jobs/scheduleOfEventsSweep.ts` | **W** | `setInterval` SoE writes |
| `server/jobs/externalIntelligenceSweep.ts` | **W** | Cron external-intel writes |
| `server/jobs/regulatoryHorizonScan.ts` | **W** | Cron horizon-scan writes |
| `server/workers/vectorization-worker.ts` | **W** | High-volume embedding writes |
| `server/workers/entity-extraction-worker.ts` | **W** | Extraction writes per doc |
| `server/workers/ivdr-pack-worker.ts` | **W** | `setInterval` IVDR pack writes |
| `server/data-importer.ts` | **W** | Bulk import (`setInterval` :707) |

Reference pattern for jobs — `server/services/memory-consolidation-job.ts`:
per-org work uses `withTenantConnection({tenantId: org})`; deliberate cross-tenant
sweeps use `role: 'app_super_admin'`. A job that legitimately spans tenants (e.g. a
global retention sweep) should use the super-admin scope, **not** be forced into one
tenant.

## Recommended sequence

1. **Build the pool primitive (A).** Set `app.current_tenant_id` from
   `getTenantScope()` on pooled queries. Unit-test connection reuse + transaction
   nesting. Nothing filters correctly until this exists.
2. **Promote the `/api` gate** to establish request scope (chain `runWithTenantScope`
   after the merged auth/default-deny gate), with a public-prefix allowlist. Closes
   category (D) — hundreds of routes — at once.
3. **Wrap background writers** (jobs → workers → schedulers) in the correct scope:
   per-org loop, or `app_super_admin` for legitimate global sweeps.
4. **Verify in staging** with `RLS_ENFORCE=on`: run the cron/worker set + a
   cross-tenant request smoke test asserting **zero-row leakage**, and watch
   `tenant_session_var_missing_total` drop to ~0 (labels pinpoint stragglers).
5. **Flip:** `RLS_ENFORCE=on`, then `RLS_REQUIRE_ENFORCE=true` so any regression
   fails boot (`server/db/rlsEnforcement.ts`).

**Acceptance (GA plan 0.1):** cross-tenant read returns zero rows in a staging test;
prod boot fails closed if enforcement is missing.
