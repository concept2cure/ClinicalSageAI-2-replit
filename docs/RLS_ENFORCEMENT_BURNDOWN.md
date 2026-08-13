# RLS Enforcement Burndown — runway to `RLS_ENFORCE=on`

Status: **evidence complete** (2026-08-13). Production boot requires enforcement,
request and scheduled-worker scopes are implemented, and the full-schema
two-tenant probe — the last outstanding item, and the acceptance criterion for
`GA_READINESS_PLAN.md` item **0.1** (highest severity) — now runs on every PR.

## The closing evidence (2026-08-13)

`tests/schema-contract/rls-two-tenant-full-schema.contract.test.ts` builds the
real base schema from the drizzle journal, applies the real `0019 → 0020 → 0021`
chain, seeds **two tenants into 220 of the 222 policied tables**, drops to a
`NOSUPERUSER NOBYPASSRLS` role and reads every one of them under
`app.rls_enforce='on'`.

| Assertion | Result |
|---|---|
| Tenant A sees no row belonging to tenant B, on any table | ✅ zero leaks |
| Symmetric — tenant B sees no row belonging to tenant A | ✅ zero leaks |
| Tenant A still sees its OWN rows (a policy that hides everything is an outage, not isolation) | ✅ |
| Enforcement ON with no tenant scope → schema reads empty (fail-closed) | ✅ |
| `app_super_admin` still reads across tenants (the deliberate carve-out for estate-wide jobs) | ✅ |
| `WITH CHECK` rejects an INSERT aimed at another tenant | ✅ |
| Every RLS-enabled table is also `FORCE`d (owner-bypass closed — the Neon case) | ✅ |

Two things make this evidence rather than decoration:

- **A negative control ships with it.** The same sweep re-runs with
  `app.rls_enforce='off'` and asserts the other tenant's rows *are* visible. A
  probe that cannot see anything reports zero leaks too; this is the assertion
  that goes red if the seeding, the grant, or `FORCE` ever silently breaks.
- **Superuser-ness is asserted, not assumed.** PostgreSQL bypasses RLS for
  superusers regardless of `FORCE`, so a superuser probe would pass every
  enforce-mode assertion for the wrong reason. `is_superuser` is checked `off`
  before any isolation claim is made.

Verified to detect the real hazard (ledger C-33 — a table shipping unpoliced):
dropping `tenant_isolation_policy` from a single table flips that table from
`FOREIGN=0` to `FOREIGN=1` in the sweep.

It runs in ~8s on PGlite, so it is an ordinary PR check rather than the
"dedicated enforce-mode job" this document originally scoped — PGlite is a real
PostgreSQL and supports `CREATE ROLE … NOSUPERUSER NOBYPASSRLS`, `SET ROLE`,
`FORCE ROW LEVEL SECURITY` and the `current_setting` predicates the policy uses.

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
| Auth boundary establishes a verified tenant execution scope for protected routes | ✅ global protected-route adoption | `server/middleware/authBoundary.ts`; `server/middleware/orgMembership.ts` |
| `withTenantConnection` and named system scopes for jobs/scripts | ✅ exists; failed cleanup destroys the connection | `server/db/withTenantConnection.ts`; `server/db/tenantStore.ts` |
| Request-scoped drizzle over the tenant client (`requestDb(req)` / `getDb(req)`) | ✅ exists and fails closed if middleware omitted; low adoption | `server/db/requestDb.ts`, `server/db/tenantDbHelper.ts` |
| Shared-pool automatic scoping | ✅ promise/callback paths implemented; missing scope blocked when enforcement is on | `server/db/poolInstrumentation.ts` |
| Connection poisoning after uncertain tenant setup/cleanup | ✅ mock-tested for pool and lazy request clients | `server/db/poolInstrumentation.ts`; `server/middleware/lazyRequestDbClient.ts` |
| Shared-pool route disposition | ✅ 77/77 classified: 75 JWT-bound, 2 explicit pre-tenant; 0 unclassified | `docs/reports/requestdb-coverage-baseline.json` |
| Scheduled job/worker scope | ✅ repository schedulers use named system scope; IVDR work switches to the claimed tenant | `server/jobs/*`; `server/workers/vectorization-worker.ts`; `server/workers/ivdr-pack-worker.ts` |
| Policy **behaviour** proof (enforce isolates; shadow passes all; WITH CHECK blocks cross-tenant insert; super-admin bypass) | ✅ done, against real Postgres in CI | `server/db/__tests__/rlsPolicy.integration.test.ts` (integration-tests job) |
| Policy **coverage** gate — every org-keyed base table carries `tenant_isolation_policy` on the fully provisioned **+ deploy-migrated** schema (catches a later C2C-set table shipped unprotected because deploy-migrate does not re-run 0021) | ✅ CI-gated | `scripts/db/rls-coverage-check.sql`; `blank-db-provisioning` job in `.github/workflows/ci.yml` |
| Live two-tenant probe across the **real** schema's tables under `RLS_ENFORCE=on` | ✅ **done** — 222 policied tables, 220 seeded with two tenants, zero cross-tenant reads; runs on every PR | `tests/schema-contract/rls-two-tenant-full-schema.contract.test.ts` |

## Adopted execution model

`db` (drizzle) is built over the **pool** (`server/db/runtime.ts`). The pool
instrumentation now reads AsyncLocalStorage scope and applies tenant values in a
transaction-local micro-transaction. When enforcement is on, a non-infrastructure
pool operation with no scope is rejected rather than returning an ambiguous empty
result. The global boundary and explicit alternative-entry scopes now supply that
context; an omitted scope becomes an availability failure rather than silently
under-filtered access.

But the per-connection primitives already exist:

- **Requests:** `requestDb(req)` returns a drizzle bound to `req.dbClient` and
  throws if that client is absent. `requireTenantContext` bootstraps a scope from
  the signed JWT organization claim for tenant/membership lookup, authorizes from
  the membership record, and installs the resolved role for downstream work.
- **Jobs/scripts:** `withTenantConnection({tenantId, role})` gives a dedicated
  scoped client; run drizzle on it via `drizzle(client, { schema })`.

The application-level adoption pass is now complete. The global authentication
boundary installs ALS scope and a lazy request client only after authentication;
membership lookup is itself bootstrap-scoped and fails closed when membership
cannot be verified. Alternative entry points establish their own named scope:
API keys, signed SAML, Firecrawl, and Stripe callbacks. The 77 shared-pool route
files remain a performance/maintainability migration backlog, but are no longer
unclassified isolation paths: 75 inherit the authenticated JWT boundary and two
install an explicit pre-tenant scope. New shared-pool routes remain prohibited by
the ratchet.

The automatic pool primitive is the compatibility bridge for the 77 classified
shared-pool routes. `requestDb(req)` remains the preferred explicit primitive for
new and multi-statement request work, and the ratchet prevents new shared-pool
adoption while the compatibility backlog is reduced.

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

The global `/api` gate now combines authentication and tenant execution context.
The remaining inventory is classified as follows:

- **Request routes:** 75 shared-pool files inherit the JWT boundary; Firecrawl
  and SSO are explicitly pre-tenant scoped. Stripe and API-key callbacks also
  establish named scope at their authentication boundary.
- **Scheduled jobs/workers:** audit, corpus ingestion, drift, external intelligence,
  regulatory horizon, retention, schedule-of-events, and vectorization use a named
  system scope. IVDR claims work system-wide, then processes inside the job's tenant.
  Non-scheduled ingestion helpers remain caller-scoped and fail closed if invoked
  without an established request/job scope. `periodicReview.js` uses its external
  Supabase client rather than the instrumented PostgreSQL pool.
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
2. ✅ **Global protected-route context is implemented** in `authBoundary`; public
   and alternative-auth entry points are either allowlisted or explicitly scoped.
3. **Continue scoped-client migration:** for (A), migrate handlers `db.*` → `requestDb(req).*`;
   for (B), no per-handler change once the primitive reads the now-global scope.
   Either way, watch `tenant_session_var_missing_total` fall for the request path.
4. ✅ **Scheduled background writers are wrapped** in
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
The current tenant audit's 25 findings are individually dispositioned in
`docs/reports/tenant-isolation-justifications.md`, and its justification parity
gate passes. The 77 shared-pool routes are classified in the request-DB baseline
(75 JWT-bound, two explicit pre-tenant, zero unclassified). Those dispositions do
not replace the still-mandatory live PostgreSQL evidence gate.
