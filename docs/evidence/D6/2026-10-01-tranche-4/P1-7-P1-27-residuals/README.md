# P1-7 and P1-27 residuals: the cortex router keeps the session's tenant (IAM-15), and the Part 11 store names its tenant (DP-28)

**Findings:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-15 (residual `cortex-unified.ts:128`) and DP-28
(`tamper_proof_log` is one global chain with no tenant column). Plan rows P1-7 and P1-27.
**Audited at:** HEAD `c6f2028b` (red runs); working tree on `0e58e794` (green runs). None of this item's files
changed between the two commits.
**Resume note:** the interrupted earlier attempt left nothing behind for this item. No diff on any of its
files, no untracked file, no evidence folder. This is a from-scratch completion.

## 1. IAM-15 residual: `/api/cortex` replaced the verified tenant context

### What was wrong

The residual was recorded as "`cortex-unified.ts:128` takes an organisation UUID from `x-org-uuid`". At HEAD,
line 128 was the router-level `extractTenantContext`:

```ts
const organizationId = String((req as any).user?.organizationId || '') || null;
const clientWorkspaceId = (req.headers['x-client-workspace-id'] as string) || null;
(req as any).tenantContext = { organizationId, clientWorkspaceId, module: 'cortex' };
```

This middleware **replaced** the `req.tenantContext` that the auth boundary publishes
(`middleware/establishRequestTenantScope.ts`: `organizationId`, `organizationUuid`, `userId`, `role`). Two
problems followed:

- The organisation uuid was dropped. With no uuid, the `tenantContext?.organizationUuid || req.headers['x-org-uuid']`
  fallbacks keyed tenant data on the header. Those fallbacks were removed from nine sites by `b1618c69` and from
  `cortexQueryRoutes.ts` by `c062f4b0`. Any new reader of that shape inside the cortex router would have
  inherited the hole.
- `clientWorkspaceId` came straight from the caller's `x-client-workspace-id` header, with no check.

The router runs for every `/api/cortex/*` path, so the rewritten context also reached every request that falls
through it. `/api/cortex/management` is mounted after this router in `bootstrap/register-document-routes.ts`,
so every management request went through the rewrite. `scripts/check-security-patterns.ts` exempted this file
from `workspace-trust-header` with a dated "DEFERRED, not legitimate" note.

### What is true now

`extractTenantContext` extends the verified context and never replaces it. It reads no header. The only fields
it adds are `module: 'cortex'` and, when the boundary published no context, `organizationId` taken from
`req.user`. Any route that needs the uuid still takes it from `server/db/currentTenant.ts`
(`currentTenantOrgUuid`) and answers 403 when there is none. `/query` already did this. The new suite pins it:
a session with no tenant scope that sends `x-org-uuid` gets a 403 and no query runs.

The exemption line is removed from `check-security-patterns.ts`:

- With the exemption removed and HEAD's route, the gate reports 1 violation at `cortex-unified.ts:128`.
- After the fix, it reports 0 violations.

### Grep: every other reader of a tenant or workspace header

Searched case-insensitively across `server/` and `shared/` for `headers[...]`, `header(...)` and `get(...)`
reads of `x-org*`, `x-organi[sz]ation*`, `x-tenant*`, `x-client*` and `x-workspace*`.

| Site | Header | Disposition |
|---|---|---|
| `middleware/tenantContext.ts:154` | `x-org-uuid` | Impersonation detection only. It logs a mismatch and is never used as a key. |
| `middleware/tenantContext.ts:165` | `x-client-id` | The one deliberate claim reader. Consumers verify it (P1-7b). |
| `utils/tenantContext.ts:35` | `x-client-workspace-id` | Exempt. Consumers only narrow or verify (P1-7b "Left open"). |
| `routes/regulatorySubmissions.ts:102`, `routes/cerv2-document-routes.ts:49` | workspace | Verified by `workspaceInOrganization` (P1-7b). |
| `middleware/enterprise-security.ts:569`, `middleware/tenantContext.ts:123`, `utils/tenantContext.ts:22,76` | `x-organization-id` / `x-org-id` | Compared with the session, never trusted. |
| `src/mw/observability.ts:90`, `middleware/deprecation.ts:81`, `routes/projects-management.ts:79` | `x-tenant-id` / `x-organization-id` | Log labels only. |
| **`middleware/tenantAuth.ts:26,39`** | **`x-tenant-id` / `x-tenant`** | **Trusted when the session has no organisation** (`const tenant = jwtTenant \|\| headerTenant`). This is the allowlist gate for `/api/test-assembly`, which is disabled in production unless `FORCE_TEST_ASSEMBLY` is set. It is outside this item's files; see "Left open". |

No other reader of `x-org-uuid` or `x-client-id` trusts the header.

## 2. DP-28: `audit.tamper_proof_log` had no tenant column

### What was wrong

The 21 CFR Part 11 store was one global hash chain with no tenant column:

- A row could not say whose it was.
- `TamperProofAuditLog.search` and `getRecentEntries` answered with every tenant's rows.
- The one per-tenant reader, the `auditService.getAuditLog` fallback, had to refuse outright
  (`AUDIT_LOG_TENANT_SCOPE_UNAVAILABLE`). When the store could not be read, it answered `[]`.

### What is true now

- **Column.** The store gains `organization_id INTEGER NULL`, an index on `(organization_id, sequence_number)`
  and a column comment. The change is an additive amendment to `db/migrations/20260813_audit_tamper_proof_log.sql`
  with a dated header note (CLAUDE.md Rule 1). See "Why the migration was amended in place" below.
  - Existing rows are **not re-chained and not back-filled**. The immutability trigger refuses UPDATE, and a
    back-filled value would sit outside the hash its row was sealed with.
  - The first run on each database writes the cut-over into the column comment. On the local test database it
    reads: `Cut-over after sequence 527 (added 2026-10-01T06:18:29Z, DP-28)`.
  - NULL means a platform row, or a row written before the cut-over.
- **One writer path, `resolveAuditOrganization`** in `server/lib/tamper-proof-audit.ts`:
  - `null` means an explicit platform row.
  - A number is that tenant. Inside a per-user request scope it must be the scope's tenant: `assertTenantIsCurrent`
    throws, and nothing is written or read.
  - `undefined` means the request scope's tenant, or NULL outside a scope.
- **Writers name their tenant:**
  - `auditService.logAction` passes the tenant that `audit_logs.tenant_id` also gets.
  - The mutation audit trail (`startup/audit-trail.ts`) passes `req.tenantContext.organizationId` as the boundary
    resolved it, never a header. It reads it off the request because the `finish` callback is not guaranteed to
    run inside the async scope.
  - `multi-agent-council` passes the council session's organisation.
  - The chain verifier's own row is an explicit platform row.
  - Boot and shutdown rows run outside any scope, so they are NULL.
- **The tenant is sealed into the row's hash.** `buildContentData` covers `organizationId`, appended last and
  dropped when NULL. As a result, every NULL-tenant row hashes exactly as before. On the local database:
  - All 506 NULL-tenant rows get the same verdict from the HEAD verifier and the new one.
  - All 129 rows written with a tenant since the cut-over verify under the new verifier and fail under HEAD's.
  - Moving a row to another tenant is reported as `content_hash mismatch`.
- **Per-tenant reads filter on the column:**
  - Inside a tenant scope, `search` and `getRecentEntries` return that tenant's rows only. Naming another tenant
    is refused before the query runs.
  - Platform tooling outside any scope still reads the whole store.
  - The `getAuditLog` fallback now asks for the tenant's rows, adds the `resourceId` filter it used to drop, and
    raises an error instead of returning `[]` when the store cannot be read.
- **Boot says so when the column is missing.** `initialize()` refuses a store without `organization_id` and names
  the migration. Without that check, every INSERT would fail with 42703 into callers that treat audit-write
  failures as non-fatal.
- **Whole-store readers are unchanged by design:** the ops verifier, the daily sweep (`jobs/auditChainIntegritySweep.ts`)
  and `verifyChain`. They walk the global chain with `SELECT *` and pick up the column without edits.
- **Still one chain, still no RLS policy, deliberately.** The writer links each row to the previous row of the
  whole table. A FORCEd tenant policy would hide other tenants' tail rows from the writer and fork the chain.

### Why the migration was amended in place

The task brief allowed a new `migrations/20261001_*` file. These nine harnesses provision this store from
`db/migrations/20260813_audit_tamper_proof_log.sql` alone:

- the five authoring `*.pglite*` suites
- `draft-authoring-document-tool.pglite.integration`
- `tests/lineage/founder-path-lineage.pglite`
- `tests/golden-journeys/harness.ts`
- `tests/db/part11-audit-store.dbtest.ts`

A separate file would give all nine a table without the column. Every tenant-attributed write would then fail
into `auditService`'s non-fatal catch. That is the swallowed-write defect the golden-journey harness comment
describes. Amending the creating file additively reaches every applier without editing those harnesses, several
of which other lanes have open.

Consequences of this choice:

- Nothing is added to `scripts/db/migration-set.mjs`. The file is already listed.
- No manifest needs regenerating. `db/migrations/migrations_manifest.json` lists file names only.
- The journal records content-hash drift for this file, which nothing reads, as Rule 1 says.

## Red / green

| Check | Red (HEAD) | Green (working tree) |
|---|---|---|
| `server/routes/__tests__/cortex-unified-tenant-context.test.ts` (new) | 2 of 4 fail: the session's uuid lost (`undefined`); `x-client-workspace-id: 999` published as `clientWorkspaceId` (`red/cortex-unified-tenant-context.txt`, exit 1). The two that pass are the guards for the parts already closed (`/query` 403s with no scope; no uuid from the header) | 4/4 (`green/unit.txt`: the four unit suites 28/28) |
| `check-security-patterns` with the cortex exemption removed | 1 violation, `server/routes/cortex-unified.ts:128:30` (`red/security-patterns.txt`, exit 1) | 0 violations across 2955 files (`green/security-patterns.txt`) |
| `server/lib/__tests__/tamper-proof-audit-tenant-column.test.ts` (new) | 12 of 16 fail when the final test runs against HEAD's library. The HEAD file was copied beside the test in scratch. Failures: no `organization_id` on any row; a row for tenant 12 written inside tenant 11's session; tenant move undetected; `search` / `getRecentEntries` unfiltered; cross-tenant search not refused; a store without the column initialises silently (`red/tamper-proof-tenant-column.txt`) | 16/16 |
| `server/startup/__tests__/audit-trail-tenant.test.ts` (new) | 2/2 fail: no tenant on the trail row (`red/audit-trail-tenant.txt`) | 2/2 |
| `server/services/__tests__/auditService-tenant-scope-fallback.contract.test.ts` (rewritten to the new contract) | 4 of 6 fail: `AUDIT_LOG_TENANT_SCOPE_UNAVAILABLE` instead of a filtered read (×2); an unreadable store answered `[]`; `logAction` names no tenant (`red/auditService-tenant-scope.txt`) | 6/6 |
| `tests/db/tamper-proof-log-tenant-column.dbtest.ts` (new; PostgreSQL 16, runtime role `app_service`, `RLS_ENFORCE=on`) | Run with the HEAD migration: 5 of 6 fail. The column is absent and the write fails with 42703 `column "organization_id" does not exist` (`red/dbtest-tamper-proof-tenant-column.txt`) | 6/6, with `part11-audit-store.dbtest` 8/8 alongside (`green/dbtest-tamper-proof-tenant-column.txt`) |
| HEAD verifier vs new verifier over every row of the local store | — | 506/506 NULL-tenant rows agree; 129/129 tenant rows valid now, 0/129 under HEAD's verifier (`green/verifier-head-vs-now.txt`) |

The dbtest commits nothing. Every write runs on one runtime-role connection inside one transaction, with the
writer's BEGIN and COMMIT mapped onto savepoints, and the transaction is rolled back at the end. This matters
because deleting probe rows from the shared chain would unlink any row another writer had chained onto them.
After the run, 0 probe rows remain (`SELECT count(*) … WHERE action LIKE 'dp28-dbtest-%'` → 0).

## Neighbours and gates

- **`green/neighbours.txt`**: suites that import, mock or pin the changed modules. 18 files pass, 184/184.
  - Suites: tamper-proof content-hash and rows-verifier, audit-secret refusal, multi-agent-council, the daily
    sweep, audit-chain wiring, audit enforcement, `tests/services/auditService`, decision-lineage (both), the
    cortex threads-failclosed, prime-unmounted, advisory and org-uuid contracts, both `check-security-patterns`
    suites, and the immutability-trigger suites.
  - `cortex-threads.runtime.test.ts` passes 8/8 on its own. Its first case cold-imports cortex-unified under
    vitest's 10 s default; it took 9.9 s alone, and in an earlier 19-file batch it timed out at 10.009 s. That is
    a load-sensitive timeout that predates this item, not a behaviour change.
- **`green/dbtest-cortex.txt`**: `cortex-query-tenant-header.dbtest` 6/6 and `feature-toggle-workspace-header.dbtest`
  7/7 on the two-tenant fixture.
- **`green/pglite-harnesses.txt`**: the seven PGlite suites that apply the amended migration. 65 of 78 pass, and
  there are **zero** tamper-proof write failures in the output. All 13 failures belong to other lanes'
  uncommitted work, which these harnesses do not provision:
  - `relation "organization_retention_settings" does not exist`: the vault ingest change, from
    `migrations/20261001_organization_retention_settings.sql` and `vault-ingest.service.ts`.
  - `column "sessions_ended_at" does not exist`: the session-termination change, from
    `migrations/20261001_users_sessions_ended_at.sql` and `account-standing.ts`.
- **`green/golden-journey.txt`**: `submission-release-signature.journey` fails 1/1 on the same
  `sessions_ended_at` gap. Zero tamper-proof write failures.
- **`green/gates.txt`**: all of these are OK.
  - `ci:migration-drop-safety`
  - `ci:tenant-isolation:no-regression` (8 = 8 baseline)
  - `check:security-patterns` (0)
  - `ci:column-reachability`
  - `ci:discarded-audit-write` (no new occurrences)
- **`green/lint.txt`**: ESLint per touched file, HEAD versus working tree. No file's count rose (cortex-unified
  32→32, tamper-proof-audit 3→3, auditService 5→5, audit-trail 1→1, multi-agent-council 9→9,
  check-security-patterns 1→1). The four new test files are clean.

## Commands

```bash
# unit (red at HEAD, green after)
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run \
  server/routes/__tests__/cortex-unified-tenant-context.test.ts \
  server/lib/__tests__/tamper-proof-audit-tenant-column.test.ts \
  server/startup/__tests__/audit-trail-tenant.test.ts \
  server/services/__tests__/auditService-tenant-scope-fallback.contract.test.ts
npx tsx scripts/check-security-patterns.ts
# real database (TEST_DATABASE_URL / APP_DATABASE_URL as in the tranche brief; RLS_ENFORCE=on)
npx vitest run --config vitest.db.config.ts tests/db/tamper-proof-log-tenant-column.dbtest.ts tests/db/part11-audit-store.dbtest.ts
npx vitest run --config vitest.db.config.ts tests/db/cortex-query-tenant-header.dbtest.ts tests/db/feature-toggle-workspace-header.dbtest.ts
npm run ci:migration-drop-safety && npm run ci:tenant-isolation:no-regression && npm run ci:column-reachability
```

The red dbtest run temporarily put HEAD's `20260813` file in place, then restored the amended file. The restore
was checked with `cmp`.

## Left open

- **Rolling-deploy window.** An instance still on the old code verifies rows with the old recipe. Its daily
  sweep or security self-test would report post-cut-over tenant rows as `content_hash mismatch` until it is
  replaced (`green/verifier-head-vs-now.txt`: 0/129 under HEAD's verifier). Its writes during the window carry
  NULL after the recorded cut-over. Deploy should replace instances before the sweep's next run.
- **`server/middleware/tenantAuth.ts:39`** trusts `x-tenant-id` when the session has no organisation. This is
  the test-assembly allowlist, which is production-disabled unless `FORCE_TEST_ASSEMBLY` is set. Proposed change:
  `const tenant = jwtTenant;` with the header kept only for the mismatch alert, and a test that a session with no
  organisation plus `x-tenant-id: <allowed>` gets 403. Also, the `req.header('x-tenant-id')` call form is not
  matched by the tenant-header rule in `check-security-patterns`.
- **Pre-cut-over rows are not returned to a tenant-scoped read** of the fallback. They carry no tenant. The
  platform-wide verifier and readers still see them. The primary `audit_logs` store holds every tenant row.
- **The fallback still cannot filter by `action`.** `search` has no such criterion. This predates this item.
