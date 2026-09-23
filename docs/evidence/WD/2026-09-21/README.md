# WD evidence — 2026-09-21 — IQ-DEV-001 corrected in the product's provisioning; IQ/OQ re-executed

**Rows moved:** D1/D3 (provisioning contract: the runtime role is granted whenever it is identifiable, and a deploy verifies it) and D4 (the validation package re-executed against a correctly provisioned installation). Worker WD. Scope touched: `scripts/db/**`, `server/db/__tests__/**`, `docs/operations/DB_READINESS.md`, `docs/operations/DEPLOYMENT.md`, this folder, the regenerated records under `docs/evidence/W3/2026-09-20/` (`IQ/`, `OQ-PROJECTS/`, `OQ-VAULT/`, `OQ-AUTHORING/`, `OQ-SUBMISSION-READINESS/`, `OQ-QMS/`, plus `IQ/db-grants-after.txt`), `docs/validation/TM-001-TRACEABILITY-MATRIX.{md,json}` (regenerated) and VSR-001 §8 (appended). Environment: PostgreSQL 16.13 + pgvector 0.6.0 at 127.0.0.1:5432, Node 22.22.2, Chromium 141 via playwright-core. No AI provider, no Redis. No `GRANT` was issued by hand.

## The defect and the fix

After `install-fresh` + `deploy-migrate` run as the database owner, the runtime role (`c2c` locally, `app_service` in production) lacked SELECT/INSERT on the 183 `public` tables the owner created (264 tables in all), because both installers refreshed grants **only when `APP_SERVICE_DB_PASSWORD` was set**. An existing, unminted runtime role got nothing; section creation 500'd and every Authoring Part 11 step behind it could not execute (W3a, IQ-DEV-001).

One grant recipe now serves every path (`scripts/db/provision-app-role.mjs`):

| Function | Role |
|---|---|
| `grantRuntimeRolePrivileges` (internal) | **the** recipe: USAGE on every application schema; SELECT/INSERT/UPDATE/DELETE on tables, **`audit` = SELECT, INSERT only**, `extensions` = SELECT; USAGE, SELECT on sequences; EXECUTE on functions; `ALTER DEFAULT PRIVILEGES` so the owner's future tables are covered. GRANT only — never REVOKE. |
| `provisionAppServiceRole` | unchanged contract: mint/align `app_service` when `APP_SERVICE_DB_PASSWORD` is set, then the recipe. |
| `refreshRuntimeRoleGrants` | **new:** the recipe for a role that already exists; throws if it does not (fail closed). |
| `resolveRuntimeRole` | **new:** `RUNTIME_DB_ROLE` → `APP_SERVICE_DB_PASSWORD` → `APP_DATABASE_URL` login → `DATABASE_URL` login when it differs from the connection's role; null = single-role. |
| `ensureRuntimeRole` | **new:** the installers' entry point (mint / refresh / single-role). Called from `deploy-migrate` step 4 and `install-fresh` step 7. |
| `auditRuntimeRoleGrants` | **new:** every table/view/matview/foreign table in every application schema vs the recipe: `denied` (missing privilege or schema USAGE), `excess` (beyond the audit ceiling on a relation the role does not own), `ownedAppendOnly` (the role owns `audit.tamper_proof_log`). |

`readiness-contract.mjs` runs that audit whenever a runtime role is under test (`asRuntimeRole`, or the new `runtimeRole` option for an owner connection) and fails the contract on any gap or any widening. `deploy-migrate.mjs` passes the identified role to step 5, so a deploy cannot print "safe to roll services" while the runtime cannot read a table or can UPDATE the Part 11 store. `connection.mjs` puts `DATABASE_OWNER_URL` first for the appliers, so `DATABASE_OWNER_URL=… DATABASE_URL=… node scripts/db/deploy-migrate.mjs` migrates as the owner and grants the `DATABASE_URL` role. `provision.mjs` identifies an unminted runtime role from the `APP_DATABASE_URL` login, refuses at preflight if it does not exist, hands `RUNTIME_DB_ROLE` to both children (they never see the app URL) and verifies step 4 as that role. `audit-runtime-grants.mjs` is the audit as a command (`--role`, `--json`; exit 1 on any gap), writing the same `deniedCount`/`denied[]` shape IQ-07 records.

## Before / after — the IQ-07 inventory query

```sql
select schemaname||'.'||tablename from pg_tables
 where schemaname not in ('pg_catalog','information_schema')
   and (case when not has_schema_privilege('c2c', schemaname, 'USAGE') then true
             else not has_table_privilege('c2c', quote_ident(schemaname)||'.'||quote_ident(tablename), 'SELECT') end)
```

| | denied total | denied in `public` | `audit.tamper_proof_log` for `c2c` | file |
|---|---|---|---|---|
| before | **264** | **183** | no privileges | `denied-before.txt`, `grant-audit-before.{txt,json}` (audit: 271 relations denied incl. views; 8 schemas without USAGE) |
| `DATABASE_OWNER_URL=postgres… DATABASE_URL=c2c… node scripts/db/deploy-migrate.mjs` | | | | `deploy-migrate-clinicalsage.transcript.txt` — step 4 "runtime role c2c identified from DATABASE_URL (owner is postgres) … refreshing grants"; step 5 "SELECT reach 8/8 … grant audit: 1263/1263 … beyond the audit ceiling: 0"; exit 0 |
| after | **0** | **0** | SELECT, INSERT only (UPDATE/DELETE false; owner `postgres`) | `denied-after.txt`, `grant-audit-after.{txt,json}`; `../../W3/2026-09-20/IQ/db-grants-after.txt` |

37 default-privilege entries (one per application schema) now exist for `postgres` → `c2c`, so the next migration cannot reintroduce the gap.

## Verified by making it fail — `fail-proof-throwaway.transcript.txt`

Throwaway database `clinicalsage_wd_throwaway` (`CREATE DATABASE … TEMPLATE clinicalsage_fresh`; owner `postgres`, runtime `app_service` from W2, no password given to any script):

| Step | Action (by hand, as the owner) | Check | Result |
|---|---|---|---|
| A1 | `REVOKE SELECT ON public.organizations FROM app_service; REVOKE USAGE ON SCHEMA intelligence FROM app_service` | `node scripts/db/audit-runtime-grants.mjs --role app_service` | **exit 1**: "denied: 15 — public.organizations: missing SELECT; schemas without USAGE: intelligence" |
| A2 | — | `RUNTIME_DB_ROLE=app_service node scripts/db/deploy-migrate.mjs` | step 4 refreshes the existing role without a password; step 5 grant audit 1281/1281; **exit 0**; A3 audit clean |
| B1 | `GRANT UPDATE ON audit.tamper_proof_log TO PUBLIC` (the recipe never does this) | `deploy-migrate` | **refused, exit 1**: "holds privileges beyond the append-only ceiling on: audit.tamper_proof_log (UPDATE) — REVOKE them" — step 4's refresh did not and cannot mask it |
| B2 | `REVOKE UPDATE … FROM PUBLIC` | `deploy-migrate` | exit 0 |
| C | `CREATE TABLE public.wd_future_table`, `CREATE TABLE audit.wd_future_audit` after the refresh | `has_table_privilege` | public: SELECT, INSERT true with no further grant; audit: SELECT, INSERT true, UPDATE, DELETE **false** |
| D | `RUNTIME_DB_ROLE=ghost_role` | `deploy-migrate` | **exit 1** at step 4: "runtime role ghost_role does not exist … nothing to grant to" — not skipped |

`provision-throwaway.transcript.txt` — the full one-command path with `APP_DATABASE_URL` on the existing `app_service` and `APP_SERVICE_DB_PASSWORD` unset. Two runs are in the file: the first, over the already-provisioned throwaway copy after a `REVOKE`, passed preflight ("runtime role app_service exists … grants will be refreshed") but its `drizzle-kit push` (install-fresh 2/8) had not returned after nine minutes of introspecting 972 tables and was killed — provision.mjs is documented for an EMPTY database, and its idempotent re-run over a complete one is W2's claim, not WD's. The second, on the empty `clinicalsage_wd_empty`: preflight confirms the role; install-fresh 7/8 "runtime role app_service identified from RUNTIME_DB_ROLE (owner is postgres) … refreshing grants for existing runtime role app_service (not minted here; no password needed)", 8/8 posture check ✓; deploy-migrate 4/5 refreshes again, 5/5 grant audit 1281/1281; step 4/4 **as `app_service`**: "SELECT reach: 27/27 … grant audit: 1281/1281 … beyond the audit ceiling: 0"; **exit 0**. The IQ-07 query on that database for `app_service`: 0 denied over 972 public tables.

Unit tests (`vitest-provision-and-contract.txt`): 44/44 in `server/db/__tests__/provision-app-role.test.ts` and `readiness-contract.test.ts`, including: refresh grants without CREATE/ALTER ROLE and without REVOKE; missing role throws; `ensureRuntimeRole` refresh / mint / single-role; audit reports a revoked privilege, a schema without USAGE, UPDATE on a non-owned audit table as excess, ownership of the store as a failure; the readiness contract fails for a named role on the 183-table shape, on a widened audit store, on an owned store, on a missing role and on a superuser. The scripted client in `readiness-contract.test.ts` now answers the audit query (the previous SELECT-reach query is gone: one query, one recipe).

## Re-execution — `validation-rerun.transcript.txt`

Server on port 5700 (`.env` + `ALLOW_DEV_AUTH=1 PORT=5700 SKIP_DB_STARTUP_TEST=true ALLOWED_ORIGINS=http://localhost:5700,http://127.0.0.1:5700 LAUNCH_SCOPE_ENFORCE=on`), `/readyz`: database ok, schema ok, ana down (no provider). `/tmp/wd-server.log` contains 0 `permission denied` lines. `VALIDATION_BASE_URL=http://localhost:5700 VALIDATION_SERVER_LOG=/tmp/wd-server.log npm run validation:iq`, then `npm run validation:oq -- projects vault authoring submission-readiness qms` (the five apps whose baseline records cited IQ-DEV-001), then `npm run validation:traceability` (`traceability-regenerate.txt`).

| Protocol | Pass | Fail | Deviation | Not executed | Baseline |
|---|---|---|---|---|---|
| IQ-001 (15) | **10** | 0 | 5 | 0 | 9 / 0 / 6 / 0 — IQ-07 now pass |
| OQ-001 Projects (16) | 14 | 2 | 0 | 0 | 13 / 2 / 1 / 0 |
| OQ-002 Vault (12) | 9 | 3 | 0 | 0 | 7 / 3 / 2 / 0 |
| OQ-003 Authoring (22) | 16 | 3 | 1 | 2 | 9 / 1 / 1 / 11 |
| OQ-004 Submission Center (15) | 13 | 1 | 1 | 0 | not re-run (baseline record) |
| OQ-005 Submission Readiness (9) | 8 | 1 | 0 | 0 | 6 / 1 / 2 / 0 |
| OQ-006 QMS (16) | 13 | 2 | 0 | 1 | 14 / 1 / 1 / 0 |
| **OQ total (90)** | **73** | **12** | **2** | **3** | 62 / 9 / 8 / 11 |

TM-001: 67 requirements — **53 pass, 1 partial, 10 fail, 3 open, 0 uncovered** (baseline 43 / 2 / 7 / 15). No deviation is attributed to IQ-DEV-001 any more; the two remaining are OQ-AUTH-16 (no AI provider — a model step stays a deviation) and OQ-SUBC-08 (baseline).

Failures: F-1, F-2, F-6, F-8 reproduce as in VSR-001 §4. New (VSR-001 §8.3): **F-10** the AI-draft route returns a template draft without a provider (OQ-AUTH-15 — fail closed violated; masked in the baseline); **F-11** the Vault surface does not show the filed document (OQ-VAULT-09, formerly a 500); **P-1** freeze correctly refused while a comment is unresolved — protocol must resolve it first (OQ-AUTH-11, blocks 13/14); **P-2** F-3 was fixed in the product since the baseline (approval now demands password + meaning + reason), so OQ-QMS-05/07/09 need a credentialed tester like OQ-SUBC-08 (OQ-QMS-06, the negative case, passes). None of these is environmental; none was fixed here (outside WD's paths).

## Gates — `repo-gates.txt`, `typecheck-fast.txt`

`eslint --no-ignore` on the nine changed script/test files: 0 errors (warnings are the repo's complexity/max-lines/no-console classes; `scripts/**` is eslint-ignored by config). `ci:migration-set-order` OK (291), `ci:migration-drop-safety` OK, `db:sync-manifest:check` in sync. `npm run typecheck:fast`: exit 1 with **5 errors, all in `server/services/signature/__tests__/kms-signer.test.ts`** (`SignCommand` typing — another worker's file, pre-existing); **0 errors in any file WD changed** (`scripts/db/*.d.mts`, `server/db/__tests__/*`). The first attempt (01:08 UTC) was OOM-killed (exit 137) while another session's full `tsc` held 6.7 GB; the recorded run is the second, at 01:12.

## Left open / for the control tower

- `package.json` is outside WD's paths: no `npm run db:audit-grants` alias was added; the command is `node scripts/db/audit-runtime-grants.mjs`. `.env.example` (also outside) does not yet mention `RUNTIME_DB_ROLE` / `DATABASE_OWNER_URL` for deploy-migrate; `DB_READINESS.md` does.
- `docs/evidence/W3/2026-09-20/README.md` and IQ-001 §6 still state the baseline counts and the open IQ-DEV-001; they were not in WD's paths. VSR-001 §8 carries the new counts and the proposed disposition.
- OQ-004 Submission Center was not re-run (its deviation did not cite IQ-DEV-001); its record in TM-001 is the baseline execution (00:23 UTC).
- One read-only `git show HEAD:…` was used to compare baseline step verdicts; no other git command was run and nothing was committed.
- Local state: `clinicalsage` was migrated by `deploy-migrate` as `postgres` (291 files re-applied; two dead tables the set drops are gone, `c2c` 789 / `postgres` 183 public tables) and `c2c` now holds the recipe grants. The throwaway databases `clinicalsage_wd_throwaway` and `clinicalsage_wd_empty` were dropped at the end of the session; `clinicalsage_fresh` and role `app_service` (W2) were not modified. The port-5700 server was stopped; the server on 5200 belongs to another session and was not touched.
