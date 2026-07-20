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
| Request-scoped drizzle over the tenant client (`requestDb(req)` / `getDb(req)`) | ✅ **exists**, low adoption | `server/db/requestDb.ts`, `server/db/tenantDbHelper.ts` |
| Scope **adopted** across all request routes + jobs/workers | ❌ not done | the burndown |

## The real gap: adoption, not a missing primitive

`db` (drizzle) is built over the **pool** (`server/db/runtime.ts:120`), whose
connections carry `app.rls_enforce` but **not** `app.current_tenant_id`. So a
pooled `db.*` query returns **zero rows** under `RLS_ENFORCE=on`.

But the per-connection primitives already exist:

- **Requests:** `requestDb(req)` returns a drizzle bound to `req.dbClient` — the
  lazy per-request client that runs `SET LOCAL app.current_tenant_id`. Queries
  through it are RLS-correct. `req.dbClient` + the AsyncLocalStorage scope are set
  up by the `requireTenantContext` middleware.
- **Jobs/scripts:** `withTenantConnection({tenantId, role})` gives a dedicated
  scoped client; run drizzle on it via `drizzle(client, { schema })`.

So the linchpin is **adoption**, and it has two blockers:

1. **`requireTenantContext` is mounted on one route only** (`server/routes/ana-features.ts`).
   Until it's promoted to the global `/api` chain (after the merged auth/default-deny
   gate, with a public/health/webhook allowlist), `req.dbClient` isn't set up for
   other routes and `requestDb(req)` falls back to the pool-bound `db`.
2. **Handlers still call the pool-bound `db`** instead of `requestDb(req)`.

Two ways to close it:

- **(A) Mass-adopt the existing scoped clients** — global-mount `requireTenantContext`,
  then migrate handlers `db.*` → `requestDb(req).*` and jobs → `withTenantConnection`.
  Correct, but a large call-site migration (~6,100 sites, though many are already
  behind services that can take the scoped db).
- **(B) Automatic pool primitive** — a query/checkout hook that reads
  `getTenantScope()` and applies `app.current_tenant_id` on the connection, so the
  *shared* `db` becomes RLS-correct wherever scope is established, **without** the
  call-site migration. Lives next to `installRlsEnforcement`. Delicate
  (pool reuse / transaction / `SET LOCAL`-needs-a-txn semantics) — needs targeted
  tests. Higher leverage if it can be made safe.

> ⚠️ Do **not** wrap code in bare `runWithTenantScope` alone to turn the metric
> green: without (A) using a scoped client or (B) the auto primitive, the pooled
> query still isn't filtered — the metric would report "scoped" while RLS does
> nothing. False-green.

> ⚠️ **Auto-set trigger interaction:** `server/db/tenantRls.ts` installs a BEFORE-INSERT
> trigger that sets `NEW.organization_id := current_setting('app.current_tenant_id')`.
> It fires whenever `current_tenant_id` is set, **independent of `RLS_ENFORCE`**.
> So broadening where `current_tenant_id` is set (either approach) can change INSERT
> behavior even with enforcement off — any rollout must verify inserts still land the
> intended org (especially global/super-admin sweeps where the var is `0`/empty).

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

1. **Decide (A) mass-adopt vs (B) auto primitive.** (B) avoids the call-site
   migration and is highest-leverage *if* it can be made safe against pool reuse,
   transaction semantics, and the auto-set trigger. Prototype (B) with tests; fall
   back to (A) if the pooling semantics prove too risky.
2. **Promote `requireTenantContext` to the global `/api` chain** (after the merged
   auth/default-deny gate), with a public/health/webhook allowlist. This sets up
   `req.dbClient` + AsyncLocalStorage scope for all routes — the prerequisite for
   either approach. **High blast radius: an over-broad mount 401s public routes** —
   build the allowlist deliberately and verify against the merged `authBoundary`.
3. **Adopt scoped clients:** for (A), migrate handlers `db.*` → `requestDb(req).*`;
   for (B), no per-handler change once the primitive reads the now-global scope.
   Either way, watch `tenant_session_var_missing_total` fall for the request path.
4. **Wrap background writers** (jobs → workers → schedulers) in
   `withTenantConnection` + `drizzle(client)`: per-org loop, or `app_super_admin`
   for legitimate global sweeps. Verify the auto-set trigger still lands inserts in
   the intended org.
5. **Verify in staging** with `RLS_ENFORCE=on`: run the cron/worker set + a
   cross-tenant request smoke test asserting **zero-row leakage**, and watch
   `tenant_session_var_missing_total` drop to ~0 (labels pinpoint stragglers).
6. **Flip:** `RLS_ENFORCE=on`, then `RLS_REQUIRE_ENFORCE=true` so any regression
   fails boot (`server/db/rlsEnforcement.ts`).

**Acceptance (GA plan 0.1):** cross-tenant read returns zero rows in a staging test;
prod boot fails closed if enforcement is missing.
