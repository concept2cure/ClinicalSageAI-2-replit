# Architecture Remediation Implementation Audit

**Audit ID:** ARCH-REM-AUD-001  
**Audit date:** 2026-07-29  
**Scope:** Remediation commits `0c73f2c` through the current audit revision  
**Disposition:** Conditional — critical controls improved; production release is
not approved by this audit

## 1. Executive conclusion

The reviewed work materially improves the tenant-isolation posture: production
RLS startup is fail closed, canonical request database helpers no longer fall
back to the shared pool, tenant-local settings cover promise and callback pool
paths, and uncertain cleanup poisons connections. These changes are supported by
focused unit contracts.

The work does **not** yet establish the epic's final claim of zero tenant bypass
paths. Live PostgreSQL isolation tests were not executed in this environment,
the full entry-point and route-mount inventory remains open, RLS policy coverage
for every tenant table has not been proven here, and the repository-wide
TypeScript check exceeded its configured heap in the preceding implementation
session. REM-101, REM-102, and REM-103 therefore remain in evidence review, not
accepted.

## 2. Audit method

The audit reviewed every file introduced or modified by the remediation commit
series and traced the security-sensitive call chains:

1. production configuration import → RLS posture assertion → pool connection
   initialization;
2. HTTP tenant middleware → lazy request client → `requestDb` and compatibility
   helpers;
3. async tenant store → instrumented `pool.query`/`pool.connect` → transaction-
   local session settings → commit/rollback → release;
4. baseline source discovery → categorization → hashing → persisted manifest →
   verification; and
5. remediation claims → executable test references and stated residual scope.

The audit used source inspection, targeted Vitest and Node test runs, baseline
recapture/verification, Git whitespace checks, and the repository security-
pattern scanner. It did not use production data.

## 3. Findings and disposition

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| AUD-001 | Critical | The infrastructure-query exemption accepted every SQL string beginning with `SELECT set_config('app.current_...`, allowing caller-controlled session tenant values to bypass the new missing-scope guard. | **Resolved in this audit:** only exact empty-value reset statements remain exempt; parameterized session mutation is rejected and tested. |
| AUD-002 | High | `BEGIN`, `COMMIT`, and `ROLLBACK` were classified as unscoped infrastructure queries. In particular, `pool.query('BEGIN')` can return its physical connection to the pool with an open transaction. | **Resolved in this audit:** transaction control is no longer an unscoped pool exemption; scoped checked-out clients remain the supported transaction path. |
| AUD-003 | High | Baseline verification compared artifact hashes but ignored category membership, category counts, and the declared hash algorithm. A categorization regression could therefore pass if the union of artifact paths stayed unchanged. | **Resolved in this audit:** verifier now checks SHA-256 declaration, category arrays, and category/count consistency; regression tests added. |
| AUD-004 | High | Live connection reuse, policy filtering, and `WITH CHECK` tests require PostgreSQL and were skipped when no test database URL was configured. | **Open:** execute in a controlled PostgreSQL 16 environment with the production RLS migration set; retain the report as REM-102/103 evidence. |
| AUD-005 | High | The canonical helpers fail closed, but this audit has not proven that all route mounts, jobs, queues, CLIs, WebSockets, tools, or direct driver instances enter through those helpers. | **Open:** complete the entry-point inventory and make the existing tenant-isolation CI audit strict with an approved, expiring allowlist. |
| AUD-006 | High | Production startup proves the switch is `on`; it does not prove that every tenant-owned table enables/forces RLS or has correct `USING` and `WITH CHECK` policies for every application role. | **Open:** generate a database-derived policy matrix and execute cross-tenant read/write tests per table and role. |
| AUD-007 | Medium | The committed baseline records the capture revision, while its containing commit necessarily advances `HEAD`. Ordinary verification intentionally ignores revision drift; exact-revision checking is optional. | **Accepted design constraint:** protected-branch review must treat recapture as approval; use `--strict-revision` only against the captured source revision. |
| AUD-008 | Medium | The baseline captures tracked and untracked non-ignored files. This is useful during preparation but can accidentally include an uncommitted contract in an approval candidate. | **Resolved in this audit continuation:** `architecture:baseline:release` requires a clean worktree before approval-grade capture; the ordinary command remains the explicit local draft path. |
| AUD-009 | Medium | Repository-wide `npm run check` previously exhausted the configured 6144 MB heap. Focused tests compile the touched modules but are not a full type-system proof. | **Open:** run the no-regression typecheck gate in the CI environment or split the TypeScript project graph; do not waive on the basis of focused tests. |
| AUD-010 | Critical | `ci:tenant-isolation:no-regression` still reports 25 baseline candidate violations: raw SQL against known tenant-scoped tables without an organization, tenant, or workspace predicate. The no-regression check passes because the count did not increase, not because the set is safe. | **Open release blocker:** investigate every candidate; fix real bypasses and permit only reviewed, narrowly justified pre-tenant/infrastructure operations through an expiring allowlist. |
| AUD-011 | Critical | The request-DB coverage audit reports 96 route files touching the database, only 16 using `requestDb(req)`, and 77 still using the shared pool. Pool fail-closed behavior reduces runtime risk when RLS is on but does not prove correct route middleware or prevent availability failures. | **Open release blocker:** migrate or explicitly classify all 77 routes and add a strict zero-unreviewed-path gate. |
| AUD-012 | Critical | The lazy request client used session-level tenant variables and called bare `release()` when setup or cleanup failed. A partial `set_config` or failed reset could therefore return contaminated state to the pool. | **Resolved in this audit continuation:** setup and cleanup errors are passed to `pg` release so the physical connection is destroyed; focused poisoning tests added. |
| AUD-013 | Critical | After unscoped pool access became fail closed, `requireTenantContext` still queried the organization and membership through the shared Drizzle pool before establishing AsyncLocalStorage scope. With production RLS on, authentication would fail before the request-scoped client was installed. | **Resolved in this audit continuation:** the signed JWT organization claim establishes a least-privilege bootstrap scope for tenant and membership lookup; membership remains the authorization decision and the resolved role replaces the bootstrap scope downstream. |

## 4. Control-by-control assessment

### REM-103 — Production RLS posture

**Implemented:** configuration import calls the production assertion before the
exported runtime configuration is usable. Production accepts the canonical on
posture and rejects missing, invalid, off, and shadow configurations.

**Not yet proven:** policy installation, FORCE RLS coverage, application-role
behavior, migration parity, and table-by-table read/write isolation.

### REM-101 — Missing tenant and fallback removal

**Implemented:** `requestDb`, its legacy `getDb` alias, and
`getRequestDbClient` require a valid request-scoped client. The instrumented pool
rejects non-infrastructure promise/callback query and connection operations when
RLS is on but async tenant scope is absent.

**Not yet proven:** exhaustive route/job/tool coverage. Exact health probes and
empty-value session resets remain narrow infrastructure exemptions and must stay
under regression tests.

### REM-102 — Pool reset and contamination safety

**Implemented:** tenant variables are transaction-local; rollback failure,
transaction initialization failure, context initialization failure, cleanup
failure, and release with an open transaction send a destruction signal to
`pg`. Promise/callback APIs and PostgreSQL transaction aliases are covered. The
session-scoped lazy request client likewise destroys connections after partial
setup or unverifiable cleanup.

**Not yet proven:** real driver destruction/replacement behavior under network
cancellation, backend termination, timeout, and concurrent tenant load. Mock
assertions that `release(error)` was called are necessary but not sufficient.

### REM-000 — Baseline

**Implemented:** deterministic categorized paths, sizes, and SHA-256 hashes for
the selected API, command/tool registry, schema/migration, ADR, and architecture
control surfaces; drift verification now includes category metadata.

**Not yet proven:** generated-contract freshness, database schema dump/restore,
repository settings export, performance baseline, and rollback rehearsal.

## 5. Required release blockers

The following must be complete before these controls may move to `accepted`:

1. Run the live PostgreSQL pool integration suite and failure-injection cases
   with connection reuse (`max: 1`) and concurrent alternating tenants.
2. Produce a database-derived inventory of tenant-owned tables, FORCE/ENABLE RLS,
   policies, commands, roles, `USING`, and `WITH CHECK`, then test each matrix row.
3. Inventory all direct imports/instances of `pg.Pool`, `pg.Client`, Drizzle,
   postgres-js, and raw database adapters; disposition every bypass.
4. Audit every route registrar and non-HTTP entry point for tenant middleware or
   an explicit, reviewed infrastructure identity.
5. Require a clean worktree for an approval-grade baseline and verify generated
   OpenAPI/command/tool artifacts are fresh before capture.
6. Obtain a passing repository typecheck/no-regression result in a sufficiently
   provisioned CI environment.
7. Resolve the 25 tenant-isolation raw-SQL candidates and the 77 shared-pool
   route files reported by the current CI audits; baseline/no-regression status
   is not acceptance.

## 6. Audit acceptance statement

This audit accepts the listed code fixes for continued controlled testing. It
does not approve production release, claim regulatory compliance, or close the
Architecture Remediation Epic. Any PR description stating that live integration
tests passed must include the database-backed command output; a skipped suite is
not passing evidence.
