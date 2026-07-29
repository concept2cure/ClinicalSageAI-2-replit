# RLS Enforcement Burndown — runway to `RLS_ENFORCE=on`

Status: **implementation / evidence review** (production boot now requires enforcement;
route, worker, and live-policy coverage remain incomplete).
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
| Three-knob local/test rollout `RLS_ENFORCE=off\|shadow\|on` + per-connection `app.rls_enforce` | ✅ done; production accepts canonical `on` only | `server/db/rlsEnforcement.ts` |
| Prod fail-closed boot posture | ✅ done; missing, invalid, `off`, and `shadow` refuse startup | `server/db/rlsEnforcement.ts`; `server/config/environment.ts` |
| Observability shim: counts queries with no tenant scope (`tenant_session_var_missing_total`, labeled by caller) | ✅ done | `server/db/poolInstrumentation.ts` |
| AsyncLocalStorage tenant scope (`runWithTenantScope` / `getTenantScope`) | ✅ done | `server/db/tenantStore.ts` |
| Request middleware establishes bootstrap scope, verifies membership, then installs a per-request scoped client | ✅ primitive; **mounted on one route only** | `server/middleware/tenantContext.ts` |
| `withTenantConnection` (dedicated scoped client for jobs/scripts) | ✅ exists, **~1 caller** | `server/db/withTenantConnection.ts`; only `server/services/memory-consolidation-job.ts` |
| Request-scoped drizzle over the tenant client (`requestDb(req)` / `getDb(req)`) | ✅ exists and fails closed if middleware omitted; low adoption | `server/db/requestDb.ts`, `server/db/tenantDbHelper.ts` |
| Shared-pool automatic scoping | ✅ promise/callback paths implemented; missing scope blocked when enforcement is on | `server/db/poolInstrumentation.ts` |
| Connection poisoning after uncertain tenant setup/cleanup | ✅ mock-tested for pool and lazy request clients | `server/db/poolInstrumentation.ts`; `server/middleware/lazyRequestDbClient.ts` |
| Scope **adopted** across all request routes + jobs/workers | ❌ not done | the burndown |

## The real gap: adoption, not a missing primitive

`db` (drizzle) is built over the **pool** (`server/db/runtime.ts`). The pool
instrumentation now reads AsyncLocalStorage scope and applies tenant values in a
transaction-local micro-transaction. When enforcement is on, a non-infrastructure
pool operation with no scope is rejected rather than returning an ambiguous empty
result. Scope adoption is therefore still the linchpin: unscoped routes now become
availability failures instead of silently under-filtered access.

But the per-connection primitives already exist:

- **Requests:** `requestDb(req)` returns a drizzle bound to `req.dbClient` and
  throws if that client is absent. `requireTenantContext` bootstraps a scope from
  the signed JWT organization claim for tenant/membership lookup, authorizes from
  the membership record, and installs the resolved role for downstream work.
- **Jobs/scripts:** `withTenantConnection({tenantId, role})` gives a dedicated
  scoped client; run drizzle on it via `drizzle(client, { schema })`.

So the linchpin is **adoption**, and it has two blockers:

1. **`requireTenantContext` is mounted on one route only** (`server/routes/ana-features.ts`).
   Until it's promoted to the global `/api` chain (after the merged auth/default-deny
   gate, with a public/health/webhook allowlist), `req.dbClient` isn't set up for
   other routes and `requestDb(req)` now rejects access. That is safe but becomes
   a client-visible availability failure until adoption is complete.
2. **Handlers still call the pool-bound `db`** instead of `requestDb(req)`.
   The existing coverage artifact currently lists 77 shared-pool route files:
   `docs/reports/requestdb-coverage-baseline.json`.

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

1. ✅ **DONE — the (B) auto primitive is built and active when enforcement is on.** `instrumentPool`
   (`server/db/poolInstrumentation.ts`) now applies the active scope's tenant vars
   via a `set_config(..., true)` **LOCAL** micro-transaction, gated on
   `RLS_ENFORCE==='on' && getTenantScope()`. LOCAL settings vanish at
   COMMIT/ROLLBACK, so reset-on-release is a Postgres guarantee — cross-tenant
   reuse is structurally impossible. Fully inert while `RLS_ENFORCE=off` (verified:
   `server/db/__tests__/poolInstrumentation-tenant-scope.test.ts`). Ground truth
   from the design pass: the live policy is `migrations/0021_enable_rls_everywhere.sql`
   (has the `rls_enforce` escape clause); `server/db/tenantRls.ts` is dead legacy;
   the RAISE-on-missing-tenant insert trigger is installed on only ~5
   `concept2cure_*` tables. **Still needs a live-Postgres integration test** (no-leak
   reuse + cross-tenant filtering) before production acceptance — RLS row-filtering isn't
   exercised by the mock-pool unit tests. Keep (A) `requestDb` adoption as the
   escape hatch for hot read paths if per-statement transaction overhead bites.
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
6. **Production posture:** `RLS_ENFORCE=on` is now mandatory; no secondary
   `RLS_REQUIRE_ENFORCE` opt-in is required (`server/db/rlsEnforcement.ts`).

**Acceptance (GA plan 0.1):** cross-tenant reads/writes are rejected or filtered in
a live two-tenant staging test, unscoped application access is rejected, connection
failure cannot leak tenant state, and production boot fails closed if enforcement
is missing.

## Canonical control reuse review (2026-07-29)

No separate remediation epic, audit manifest, or architecture-baseline generator
is needed for this work. The repository already has canonical control artifacts:

| Need | Existing source of truth |
|---|---|
| Program sequencing and release stages | `docs/audit-2026-07/15-remediation-plan.md`, `docs/GA_READINESS_PLAN.md` |
| RLS rollout status and residual work | this document |
| Tenant-isolation proof boundaries | `docs/security/C2C_TENANT_ISOLATION_PROOF.md` |
| Raw-SQL isolation ratchet | `scripts/ci/check-tenant-isolation.mjs`, `docs/reports/tenant-isolation-baseline.json`, `docs/reports/tenant-isolation-justifications.md` |
| Request-scoped DB adoption | `scripts/ci/audit-requestdb-coverage.mjs`, `docs/reports/requestdb-coverage-baseline.json` |
| RLS policy/allowlist parity | `scripts/ci/check-rls-allowlist-sync.mjs`, `server/db/rlsAllowlist.ts` |
| Database readiness | `scripts/db/readiness-audit.mjs`, `docs/operations/DB_READINESS.md` |
| Evidence packaging | `scripts/audits/generate-evidence-pack.mjs`, `docs/reports/evidence-pack-2026-07-28.md` |

New controls must extend these artifacts rather than introduce parallel manifests.
The current no-regression tenant audit still carries 25 candidates, and the
request-DB coverage artifact still carries 77 shared-pool route files. Neither a
green ratchet nor fail-closed pool behavior makes those backlogs accepted.
