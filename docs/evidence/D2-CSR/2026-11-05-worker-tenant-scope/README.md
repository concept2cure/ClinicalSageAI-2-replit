# D2 — CSR: the queued workers read the Vault in their organization's full tenant scope (B1)

Launch row D2 (the CSR path), workstream W1. This fixes blocker **B1** of the 2026-11-05 walk
(`../../DEMO/2026-11-05-csr-lifecycle/README.md`). On a properly set-up database (forced row security, a runtime role
that does not own the tables), "Build narratives" and "Assemble CSR files" each ended `CSR_SOURCE_DATA_UNAVAILABLE`.

All data in the test is **SYNTHETIC** (`server/services/csr/__tests__/support/adam-narrative-synthetic.ts`).

## The cause, confirmed

- `vault.documents` has `FORCE ROW LEVEL SECURITY` (`db/migrations/044c_gcc_vault_schema.sql`).
- Its SELECT policy is `core.can_access_program(program_id)`, which calls `identity.can_access_program`
  (`db/migrations/069_gcc_multitenant_rls_expansion.sql`).
- That calls `identity.current_org_id()` (`db/migrations/20260821_uuid_org_guc_cast_heal.sql`), which reads only
  `app.current_org_id`, the organization's **uuid**.

The narrative and assembly workers opened their connection with `withTenantConnection({ tenantId, source: 'job' })`
and no `orgUuid`. `app.current_org_id` was therefore `''`, so the Vault row was invisible and
`validateCsrSourceReceipts` (`server/services/csr/source-receipt-eligibility.ts:39`) refused.

The boot sweep (`server/jobs/csrQueueRecovery.ts`) had the same defect twice: its claim connection, and the recovered
build, which ran under `runWithOrgJobScope` (tenant id, `orgUuid: null`).

The test reproduces the walk's measurement as the runtime role: 0 rows with tenant 7 and no uuid, 1 with the uuid.

**Why the build worked.** `launchCSRBuildAsync` (`server/services/csr-builder.ts`) starts `runCSRBuildJob` with
`setImmediate` inside the request. AsyncLocalStorage carries the request's scope into it. That scope holds the
organization's uuid: `organizations.uuid`, from the membership JOIN in `server/middleware/orgMembership.ts`, set by
`server/middleware/establishRequestTenantScope.ts`. The narrative and assembly workers also start inside the request,
but `withTenantConnection` then entered a new scope without the uuid.

## The fix: the repo's one mechanism, given the uuid

- **The mechanism is unchanged.** It is `withTenantConnection({ tenantId, orgUuid })` (`server/db/withTenantConnection.ts`
  → `applySessionScope`, `server/db/sessionScope.ts`). The uuid is read by `currentTenantOrgUuid`
  (`server/db/currentTenant.ts`), the repo's one derivation of a scope's organization uuid. It reads
  `organizations.uuid` for the scope's own tenant id.
- **Two functions are added beside `withTenantConnection`, in the same file:**
  - `withOrganizationTenantConnection(organizationId, caller, fn, unavailable?)`. It looks up the uuid on a connection
    in the organization's integer scope. It then opens `withTenantConnection({ tenantId, orgUuid, role: null, source:
    'job' })`. That is the scope a request of the organization carries: no role, no platform arm, no bypass.
  - `readOrganizationTenantUuid`, the same lookup, for the build. The build runs on the shared pool (AsyncLocalStorage
    only), as `vaultProcessingSweep.ts` and `retentionCron.ts` hold their scope.
- **Exactly the job's organization.** Each worker's id is the job row's `organization_id`: the route enqueued the row
  with it, and the boot sweep discovered it there. Each claim is `WHERE id = $1 AND organization_id = $2`, in that
  scope, under row security. A worker cannot act on another organization's row.
- **Fail closed, by name.** An organization with no uuid never gets `fn`. On its integer scope only (which reads none
  of its Vault), the worker records its queued row `failed` with `CSR_TENANT_SCOPE_UNAVAILABLE`. That covers the
  narrative run, the assembly run, and the boot sweep's item, including a build, recorded with reason
  `tenant_scope_unavailable`. `csrBuildFailureText` states it.

Files changed:
- `server/db/withTenantConnection.ts`
- `server/services/csr/csr-narrative-run.ts`
- `server/services/csr/csr-assembly-run.ts`
- `server/services/csr/csr-queue-recovery.ts`
- `server/jobs/csrQueueRecovery.ts`
- `server/services/csr/csr-job-runner.ts` (the failure text only)
- the narratives route test's module mock (`server/routes/__tests__/csr-jobs-narratives.pglite.test.ts`)

No BYPASSRLS, no owner connection, no session-settable bypass. `ci:session-scoped-rls-bypass` and
`ci:drizzle-tenant-scope` pass.

## The proof: a non-owner role under forced RLS

`server/services/csr/__tests__/csr-worker-tenant-scope.pglite.test.ts` runs the production wiring.

**What runs for real:**
- each worker's own default deps (`runNarrativeRun`, `runCsrAssembly`, `runCsrQueueRecoveryOnce`);
- the real `withTenantConnection`, over the real `instrumentPool`, over a PGlite-backed pool;
- `RLS_ENFORCE=on`;
- these deploy files, applied unchanged:
  - `069`, `20260821` and `044c`;
  - `migrations/20260926_organizations_own_writes.sql`;
  - `20260628_csr_job_state.sql` and the integer tenant sweep `20260801`, each applied twice.

**The database role.** Every worker statement runs as `csr_runtime`: `NOSUPERUSER NOBYPASSRLS`, owning nothing. The
first case asserts this.

**What is stubbed.** Only the readers above the database (the retained run's tables, the ADaM bytes) and the
assembler's PDF work. Each stub reads `vault.documents` through the worker's own connection, then calls the real
`validateCsrSourceReceipts`. The narrative build itself is the real `buildCsrNarratives`, which lands §14.3.3 and
§12.3.2 as that role.

| Case | Red (`8e3a265312`, `red.txt`) | Green (`green.txt`) |
|---|---|---|
| Narratives, org 7 | sees `orgUuid: null`, Vault `[]` | complete; sees only org 7's document |
| Assembly, org 7 | sees `orgUuid: null`, Vault `[]` | assembled; sees only org 7's document |
| Narratives, org 8 | sees nothing | sees only org 8's document, never org 7's |
| Org 9 (no uuid), narratives and assembly | run, refused `CSR_SOURCE_DATA_UNAVAILABLE` | refused `CSR_TENANT_SCOPE_UNAVAILABLE`; no reader called |
| Boot sweep: stalled build of org 7; of org 9 | org 9 resumed; build scope `orgUuid: null` | org 7 resumed with its uuid and its Vault row; org 9 refused by name, not dispatched |

**Mutations (`mutations.txt`).** Each worker's default deps were put back to the integer-only open, one at a time.
The test for that worker fails each time:
- narratives: 3 cases;
- assembly: 2 cases;
- the build's dispatch: 1 case.

**Suites.** 83 files, 837 tests pass: `server/services/csr/__tests__`, `server/routes/__tests__/csr-*`,
`server/jobs/__tests__`, the `withTenantConnection` and tenant-scope suites, and `orchestrator-csr-readiness`.

**Lint.** Every touched file has the same error and warning count as before. No function I touched is over
complexity 15. In `csr-job-runner.ts`, `runCSRBuildJob` and `enqueueCSRBuildJob` were over it before, and only two
map entries changed there.

**Typecheck.** The full typecheck was left to the push, as the coordinator asked. A typecheck scoped to the touched
files and their imports is clean, apart from Express-augmentation errors in untouched files that the scoped
configuration does not load.

## Every CSR queued worker, checked

| Worker | Scope before | Defect | Now |
|---|---|---|---|
| Build, request-launched (`csr-builder.ts` `launchCSRBuildAsync` → `csr-job-runner.ts` `runCSRBuildJob`) | Inherits the request's scope, uuid included | No | Unchanged |
| Build continuation (`submission-orchestrator-continuation.ts`, called by the build) | The build's scope | No (follows the build) | Unchanged; fixed with the recovered build |
| Narratives (`csr-narrative-run.ts`) | `withTenantConnection`, integer only | **Yes** (B1) | Full scope; fails closed by name |
| Assembly (`csr-assembly-run.ts`) | `withTenantConnection`, integer only | **Yes** (B1) | Full scope; fails closed by name |
| Boot sweep claim (`jobs/csrQueueRecovery.ts` → `csr-queue-recovery.ts`) | `withTenantConnection`, integer only | **Yes** | Full scope; fails closed by name |
| Boot sweep, recovered build | `runWithOrgJobScope`, `orgUuid: null` | **Yes** | `runWithTenantScope` with the uuid |
| Any pg-boss, Bull or `server/workers` consumer of CSR work | — | None exists (searched: `pg-boss`, `PgBoss`, `bullmq`, `new Queue(`, `server/workers/*`, `setImmediate` in `server/services/csr`) | — |

**One residue, not changed.** The request-launched build inherits whatever scope its request had. On the degraded
membership path (the enrichment JOIN failed, `orgMembership.ts` `enrichmentDegraded`), that scope has no uuid. The
build's Vault reads would then refuse, as every Vault read of that request does.

## What already exists (RULE 3)

**Searches run:** `app.current_org_id`, `orgUuid`, `organizations.uuid`, `uuid FROM organizations`,
`withTenantConnection(`, `runWithOrgJobScope`, `runWithTenantScope`, `currentTenantOrgUuid`, `identity.current_org_id`,
`can_access_program`, `setImmediate` and `csr_*_runs` in `server/services/csr`, and `pg-boss`/`bullmq`.

**Deleted history:** `git log --all --diff-filter=D` on `*TenantConnection*`, `*tenantScope*`, `*orgScope*`,
`*OrgUuid*` and `*organizationScope*` found nothing. Neither new function name appears anywhere in history.

| Piece (path) | What it does | What it did not do |
|---|---|---|
| `server/db/withTenantConnection.ts` `withTenantConnection` | A dedicated client with `app.current_tenant_id`, `app.current_org_id` (from `orgUuid`) and the role, inside the same AsyncLocalStorage scope | Find the uuid itself. **Reused**; the two functions above are added beside it |
| `server/db/currentTenant.ts` `currentTenantOrgUuid` | The one derivation of a scope's organization uuid (`organizations.uuid` for the scope's tenant) | **Reused** for the lookup |
| `server/db/sessionScope.ts` `applySessionScope` | Sets the tenant variables and pins the isolation switches | **Reused**, through `withTenantConnection` |
| `server/middleware/establishRequestTenantScope.ts`, `server/middleware/orgMembership.ts` | The request's scope: tenant id and `organizations.uuid` | The shape the workers now open |
| `server/jobs/vaultProcessingSweep.ts`, `server/jobs/retentionCron.ts`, `server/services/vault/document-chunking-backfill.service.ts`, `server/services/tenant-export/company-export-snapshot.ts` | Per-organization work in `{ tenantId, orgUuid: organizations.uuid }`, refused when there is no uuid | **The precedent followed** |
| `server/db/tenantStore.ts` `runWithOrgJobScope` | Per-organization job scope, integer only | Carry the uuid. No longer used by the boot sweep; unchanged |
| `server/services/csr/csr-narrative-run.ts`, `csr-assembly-run.ts`, `csr-queue-recovery.ts`, `server/jobs/csrQueueRecovery.ts` | The CSR queues and their boot sweep | Open the full scope (B1). **Fixed** |
| `server/routes/__tests__/csr-jobs-narratives.pglite.test.ts` and the other worker suites | Prove the workers' logic | Exercise row security: they mock the connection. The new test does not |

## Not covered here

- The other gate `ci:tenant-entry-points` fails on this tree for two files this change does not touch:
  `server/jobs/auditChainIntegritySweep.ts` and `server/jobs/retentionCron.ts`, whose digests changed upstream. It was
  not refreshed here.
- The founder's demo database was not re-walked in this change. The rerun is the walk's steps 13a/13b, as its
  README describes.
