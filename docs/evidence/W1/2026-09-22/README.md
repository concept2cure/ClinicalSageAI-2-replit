# W1 evidence — the launch catalog on real PostgreSQL, 2026-09-22

**Row moved:** D2 (the launch catalog is on for every new organization, and
everything else is locked when `LAUNCH_SCOPE_ENFORCE=on`).
**State after this session:** green against a deploy-shaped local database
(`scripts/db/provision-test-db.sh`: install-fresh followed by the full C2C
migration set), running as the non-superuser runtime role `app_service` with
`RLS_ENFORCE=on`, which is the production posture. Staging and production are
still owed under W2 (D1).

## A correction to the 2026-09-20 evidence

`docs/evidence/W1/2026-09-20/README.md` says organization creation "now
provisions the launch catalog". **On the production posture that was false for
the self-serve path.** Signup runs under the pre-auth scope (tenant `0`, no
role). `module_subscriptions` has RLS enabled and FORCED, so every grant
`provisionLaunchModules` wrote for the new organization was refused. The
function logged one error per module and the signup returned 201. A new
organization therefore got **0 of 21** launch modules and no industry profile.
The earlier evidence was gathered on a local instance with
`provision-launch-modules --org 2`, an ops script that runs outside any
request's tenant scope, and never went through signup. (First-run setup,
`/api/setup`, is mounted under `establishRequestSystemScope`
(`server/bootstrap/register-platform-routes.ts`) and was not affected.)

This was found only because this session ran the real signup handler against
real PostgreSQL as the runtime role. PGlite, and every mocked-pool test, passed.

## Defects found and fixed

Each defect below was reproduced failing first, then passing after the fix.
The failing runs are filed here or pinned in the named suite.

| # | Defect | Fix | Proof |
|---|---|---|---|
| 1 | Signup provisioned 0/21 launch modules and no industry profile (pre-auth scope versus FORCED RLS) | `server/routes/auth.ts` provisions inside `runWithTenantScope` for the new organization; `launch-scope.ts` logs one error-level summary with the remediation command, not 21 lines | `tests/db/signup-launch-catalog.dbtest.ts` drives the real handler: `signup-before.log` 5 failed/11, `signup-after.log` 11/11 |
| 2 | `POST /api/tenants` created an organization with no launch catalog at all | `server/routes/tenants-simple.ts` calls `provisionLaunchModules` for the created id | `tenant-isolation-tenants-simple.contract.test.ts`, "the launch catalog comes with it (D2)", 11/11; fails with the call removed |
| 3 | `ectd-publishing` (a launch module) was marked deprecated again on **every deploy** by `20260810_reconcile_module_catalog.sql` (RULE 1: the set re-runs) | 20260810 amended in place with a dated header: keep-list entry, plus a heal for rows already marked | New rule in `ci:launch-scope`: every launch module must be on the 20260810 keep-list. Its selftest strips the entry and requires the finding |
| 3a | The first push of #3 (e68982b) **broke the deploy**: `20260823_module_catalog_commercial_packaging.sql` refuses any catalog module with no tier | 20260823 amended in place: `('ectd-publishing','standard')` (adfd1cc) | `replay.log`: halted at 218/300, "no tier assigned: ectd-publishing". `replay2.log`: 300/300. `replay3.log`: 300/300 again, idempotent |
| 4 | `canAccessModule` let a module an administrator had **turned off** through whenever the plan covered it, so the API disagreed with the rail | An `enabled = false` row refuses. The toggle's own recheck passes `{ ignoreRevocation: true }` | `entitlement-grants-resolution.dbtest.ts` (56/56), "a REVOKED module the plan covers is refused, agreeing with the rail" |
| 5 | The master console disagreed with the rail on three inputs: an expired grant counted as on, an unknown tier threw or ranked below standard, and a null industry did not default to biotech | Console and navigation now use the one rule from `license-manager` (`isGrantExpired`, unknown tier ranks as standard, null industry means biotech). `TrialsPanel.planAlreadyIncludes` applies the industry check | `master-licensing-console.dbtest.ts` (41/41): three `it.fails` trackers became `it`, and each of 4 mutations was caught. `navigation-entitlements.test.ts` 24/24. TrialsPanel test 20/20 |
| 6 | H1: the owner's "all workspaces" access-request queue ran under the owner's own tenant scope, so it answered 200 with one workspace and rendered every other as "no requests waiting" | The owner's queue and decisions moved to `/api/admin/master/access-requests` (system scope), using the same two handlers. The per-user route refuses `scope=all` with 400 | `module-access-requests.dbtest.ts` H1. Unit test 25/25 |
| 7 | H2: the owner approving another workspace's request returned 404, because the row was invisible under the owner's scope | Same mount as #6 | `module-access-requests.dbtest.ts` H2 |
| 8 | H3: a decline racing an approval left the request **declined with the module switched on** and no approval in the audit trail | The decision now runs in one transaction holding a `FOR UPDATE` row lock from the status check to the write | `module-access-requests.dbtest.ts` H3. The unit test asserts the lock and BEGIN/COMMIT/ROLLBACK/release; three mutations were each caught |
| 9 | Ending a trial through `/end` re-enabled a module that a second administrator had revoked in the meantime | A revoked row is reported as `revoked` and left alone | `licensing-trials.dbtest.ts`; `licensing-trials.test.ts` 13/13 |
| 10 | Licensing history: a row after a break reported `verified` because it was placed by timestamp; other tenants' rows reported `after-break` for a break outside their chain; a row appended inside the memo window was vouched for by a walk that never saw it | Rows are placed within their own tenant's chain by `chain_seq`, using a per-tenant `verifyAuditChain` walk. The memo is keyed on store size | `licensing-history.dbtest.ts` 18/18. The unit test (24/24) caught each of 4 mutations |
| 11 | Test fidelity: under Vitest, `server/db` resolved to the `.js` shadow, which retries three times, while the production build (esbuild) resolves `.ts` | `vitest.db.config.ts` sets `resolve.extensions` to match esbuild, with the rationale | The real-DB tier now runs the code production runs |

## Test totals (real database, CI environment)

`RLS_ENFORCE=on CI=true NODE_ENV=test`, with `APP_DATABASE_URL` set to the
`app_service` role, running `npm run test:db`. `testdb-final.log`:
**34 of 34 files and 437 of 437 tests passed, none skipped.** The
`FAIL-CLOSED` lines in that log come from tests that deliberately call without
a tenant scope and assert the refusal. An earlier run of the same tier showed 7
skips and one failing file, `capa-code-uniqueness.dbtest.ts`. That suite read
`TEST_DATABASE_URL ?? DATABASE_URL`, and this runner passes the variable
through as an empty string. It now uses `||`.

Unit suites for the changed routes and services: 18 files, 292 tests, all
passing. `tsc --noEmit -p tsconfig.check.json` reports 0 errors.

## Files in this folder

| File | What it shows |
|---|---|
| `signup-before.log` | The real signup handler, before the fix: 5 of 11 failed, 0/21 grants |
| `signup-after.log` | After the fix: 11/11 |
| `replay.log` | Full migration replay on the pushed e68982b: halted at 218/300 |
| `replay2.log`, `replay3.log` | After adfd1cc: 300/300, twice. The second replay proves the RULE 1 idempotence |
| `testdb-final.log` | The whole real-database tier, CI environment |

## Still owed, and reported rather than fixed here

- **D1 / W2:** the same signup run against staging.
- **Boot-seeded founding organizations** are not auto-provisioned with the
  launch catalog. `npm run ops:provision-launch-modules -- --org <id>` is the
  remedy. Whether boot should do it is a founder decision.
- **Eight real-database suites DELETE audit rows** as fixture cleanup, which
  breaks tenant chains in the shared test database. `licensing-history.dbtest.ts`
  now checks its own chains and requires the headline status to agree with the
  canonical verifier over the whole store, so it is honest either way. The
  suites themselves still do it.
- **`ci:unkeyed-request-tables` is red on `concept2cure-v2` before this
  change.** `c2c_document_section_versions` and `mcp_oauth_clients` came from
  other work and are unclassified. This change only adds a written reason for
  `platform_settings` (global, deliberately unpolicied, pinned by
  `entitlement-schema-posture.dbtest.ts`).
