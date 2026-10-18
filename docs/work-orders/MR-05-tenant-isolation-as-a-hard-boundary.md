# MR-05 — Make tenant isolation a hard database boundary

| | |
|---|---|
| Phase | Phase 1 (stages 1–2), Phase 2 (stage 3), Phase 3 (stages 4–6), Backlog (stage 7) |
| Highest open severity at head | P1 |
| Human testing | Not observable in testing. Click-through testers see correct tenant scoping. One API-level exception: on a local or staging deploy without `NODE_ENV=production`, a tester can move one tenant's correction text to another through `/api/regulatory-intelligence` (DATA-08). Workaround: set `LAUNCH_SCOPE_ENFORCE=on`. |
| Owner | engineering (stage 2 needs a `terraform apply` and a deploy by the founder or ops; stage 5 needs F-17 confirmed) |
| Effort | XL in total: S + M + M + M + M + S + S |
| Depends on | MR-06 (SEC-04 immutability triggers before stage 2), MR-03 (staging stack and first deploy for stage 2), MR-17 (DATA-05/DATA-07 migration discipline overlaps stage 2), MR-14 (out-of-catalog bypass writers in stage 4), F-17, F-21 |
| Findings | 12 total — open 7 · partially fixed 4 · fixed 1 · refuted 0 · unverifiable 0 |
| Basis | cold audit at `92ccdba1`; every status re-verified at `94b4f9238` on 2026-10-13 — [evidence](../evidence/reviews/2026-10-13-market-readiness/) · [findings register](MR-findings-2026-10-13.json). The branch moves about 1,500 commits a day: re-confirm each finding at the current head before starting its stage. |

## Goal

The process that serves customer requests holds no database credential that can
change schema, disable a trigger or read across tenants. Every tenant table,
view and function is filtered by the database itself, and no session setting
can switch that filter off in production. A buyer's security reviewer can be
shown one role, `app_service`, with a test that proves it sees one tenant's rows
and nothing else, and a deploy that refuses to ship anything weaker.

## Why it matters

- The API and worker tasks hold the RDS master credential today
  (`terraform/stack/main.tf:315-317`). One remote-code or environment leak in the
  API gives an attacker DDL, every non-FORCE table, and the ability to disable
  the Part 11 append-only triggers. The Terraform calls this "a known exposure"
  in its own comment.
- `/api/tenants` is called on every shell load
  (`client/src/contexts/TenantContext.tsx:152`), and it serves the tenant
  directory, including user emails and roles, through that owner credential on a
  second driver outside RLS (`server/routes/tenants-simple.ts:66-75`). This
  contradicts the "runtime connects as NOBYPASSRLS" control a GxP buyer will be
  shown.
- Any SQL that runs as `app_service` can `SET app.rls_enforce='off'` or
  `SET app.current_user_role='app_super_admin'` and read every tenant. The code
  says so itself (`server/db/sessionScope.ts:20-23`). Until that changes, "hard
  isolation at the database" is not a claim the company can make in a security
  questionnaire or the F-21 two-tenant penetration test.
- 44 owner-rights views return rows their base tables hide, and the Part 11
  `audit.tamper_proof_log` has no RLS. An auditor who runs one query finds both,
  and a per-tenant audit export cannot be proven complete.
- The cross-tenant learning tables hold tenant free text with RLS off and are
  allowlisted as a carve-out. They are refused in production only by the
  launch-scope gate. The day `reg-change` enters the catalog, they go live with no
  consent (F-17).

## State at head

| Finding | Status at head | Severity (pilot) | Tester impact | Evidence at head |
|---|---|---|---|---|
| ARCH-08 | Still open | P1 | None | `server/routes/tenants-simple.ts:6,66-75` porsager client on `DATABASE_URL` serves GET / (129-145), POST / (177-193), PATCH /:id (262-277), GET /:tenantId/users (324-341) |
| DATA-03 | Still open | P1 | None | `terraform/stack/main.tf:95,315-317,431,440` owner URL in api and worker secrets; boot DDL via `server/startup/services.ts:129-131` and `server/db/bootstrap/index.ts:30-44` |
| SEC-03 | Still open | P1 | None | `terraform/stack/main.tf:315-328` owner URL plus `AUDIT_HMAC_KEY`, `AUDIT_EXPORT_SIGNING_KEY`, `AUDIT_ATTESTATION_KEY`, `MFA_ENCRYPTION_KEY` in api and worker; sweep pass-through at `db/migrations/20260801_tenant_isolation_sweep.sql:188-197` |
| DATA-01 | Partially fixed | P2 | None | Policies still lead with the `app.rls_enforce` clause and end with `app_super_admin` (`db/migrations/20260801_tenant_isolation_sweep.sql:184-198`, `migrations/0021_enable_rls_everywhere.sql:190-220`); no role default |
| DATA-02 | Still open | P2 | None | No `security_invoker` in `migrations/` or `scripts/db`; `ai.hybrid_search`/`ai.semantic_search` SECURITY DEFINER take `p_org_id` |
| DATA-08 | Partially fixed | P2 | API-level only, non-production | `server/services/intelligence/ana-failure-learning.ts:300-345,439-470` pools across orgs; `scripts/db/rls-coverage-check.sql:89-95` allowlists the tables |
| DATA-09 | Partially fixed | P2 | None | `db/migrations/20260813_audit_tamper_proof_log.sql:60-195` nullable `organization_id`, no RLS; `capa_records`/`capa_actions`, `mcp_oauth_clients` RLS off |
| SEC-13 | Still open | P2 | None | `server/middleware/moduleEntitlementGate.ts:112` `startsWith('/api/')` on the raw path; no `case sensitive routing` |
| ARCH-09 | Partially fixed | P2 | None | CI regex boundary added (`scripts/ci/check-launch-scope-api.ts:158`); gate bypass at `moduleEntitlementGate.ts:112,172` remains |
| SEC-12 | Fixed | none | None | `scripts/ci/unkeyed-request-tables-baseline.json`: 101 entries, 0 unreviewed |
| SEC-26 | Still open | P3 | None | `server/utils/ssrfGuard.ts:47-61` prefix match on `fc`/`fd`, no `::`, NAT64 or 6to4 handling |
| SEC-28 | Still open | P3 | None | `server/middleware/enterprise-security.ts:44-57` legacy origins; `operator-endpoints.ts:26-30` `===` on `METRICS_TOKEN` |

## Already done at head — do not redo

- **SEC-12 (fixed).** All 101 unkeyed request-read tables carry a decision
  (31 global, 51 derived, 19 exempt, 0 unreviewed). Commits a5bc45b71,
  b1b2f2c5b, fa8c212e5 (`capa_records`, `q_submissions` into
  `db/migrations/20260813_child_table_parent_scoped_rls.sql`), 15af6bc4b,
  93992487f, and 31d9a9c5b, which fixed the live cross-tenant read at
  `/api/graphrag/citation-trace` (`server/routes/graphrag.ts`, tested by
  `server/routes/__tests__/graphrag-citation-trace-scope.test.ts`). Stage 5 adds
  the optional lock-in: running `ci:unkeyed-request-tables:unreviewed` per PR.
- **DATA-01, part.** ac688076e: `server/db/sessionScope.ts:39-82` pins
  `app.rls_enforce` and empties `app.bypass_rls`/`app.is_admin` whenever a scope
  is applied, and clears them on release. `scripts/ci/check-session-scoped-rls-bypass.mjs:150-185`
  counts every server write of the switches against an allowlist (wired at
  `.husky/pre-push:340` and `.github/workflows/ci.yml:571`). This closes only the
  pooled-connection carry-over.
- **DATA-08, part.** Production refuses `/api/regulatory-intelligence` with 403:
  `server/middleware/moduleEntitlementGate.ts:113-117` and
  `server/services/entitlements/launch-scope.ts:42-58`, plus the deploy guard at
  `.github/workflows/deploy-aws.yml:633-655` (471e5a4cd) that refuses a production
  task definition with `LAUNCH_SCOPE_ENFORCE` other than `on`.
- **DATA-09, part.** `db/migrations/20260813_audit_tamper_proof_log.sql:60-195`
  was amended to add a nullable `organization_id` and its index.
- **ARCH-09, part.** The CI regex in `scripts/ci/check-launch-scope-api.ts:158`
  now has the `(?<![\w-])` boundary.
- **Runtime role.** The request pool already connects as `app_service`
  (NOSUPERUSER NOBYPASSRLS) via `APP_DATABASE_URL`
  (`server/db/getDatabaseUrl.ts:62-83`), checked at boot by
  `assertRlsEnforcementForProduction` (`server/db/runtime.ts:41-67`).
  `app_service` is append-only on 30+ stores
  (`scripts/db/provision-app-role.mjs:199-250`). Stages 1–2 build on this; do not
  replace it.

## Work, in order

### Stage 1 — One pool: the tenant directory off the owner connection (Phase 1 · S · engineering) — closes ARCH-08

This stage also delivers the `tenants-simple` parts of DATA-03 (step 7) and
SEC-03 (step 1). It has no infrastructure dependency and can start now.

1. Re-confirm ARCH-08, and the `tenants-simple` parts of DATA-03 and SEC-03, at
   the current head (statuses here are from 94b4f9238).
2. Write the failing tests first.
   - Extend `server/__tests__/security/tenant-isolation-tenants-simple.contract.test.ts`
     to assert that `server/routes/tenants-simple.ts` does not import `postgres`,
     does not read `process.env.DATABASE_URL`, and sends every query through
     `req.dbClient` or `pool`. It is red at HEAD.
   - Add `tests/db/tenants-directory-rls.dbtest.ts`, connected as `app_service`:
     a member's GET `/api/tenants` returns only their organisations; GET
     `/api/tenants/:otherOrg/users` returns 403; a platform admin still sees every
     organisation; `SELECT current_user` on the serving connection is
     `app_service`.
3. In `server/routes/tenants-simple.ts`, delete the `postgres` import (line 6),
   `cleanDatabaseUrl` (lines 44-63) and the `sql` client (lines 66-75). Use
   `const db = req.dbClient ?? pool` (`pool` is already imported from `'../db'` at
   line 14) with parameterized `db.query(text, values)`.
4. Convert the four handlers:
   - GET / (lines 128-145): two parameterized SELECTs.
   - POST / (177-193): `INSERT … RETURNING` with `$1..$9`.
   - PATCH /:id (262-277): `SET name = COALESCE($1, name), slug = COALESCE($2, slug), …`
     in place of the nested `sql` fragments.
   - GET /:tenantId/users (324-341).
   Keep the `23505` / `organizations_slug_unique` mapping; `pg` errors carry
   `.code` and `.constraint` the same way.
5. Scope. `/api/tenants` is in `SYSTEM_SCOPE_PREFIXES`
   (`server/middleware/establishRequestTenantScope.ts:77-98`), so every request
   runs under the system scope today. Narrow it: the platform-admin
   all-organisations read, POST, PATCH and the existing DELETE, cancel-deletion
   and purge paths (lines 411, 452, 510) run under
   `runWithSystemTenantScope('tenants:<route>', …)` (pattern at
   `server/startup/services.ts:129`); the member branch of GET / and GET
   `/:tenantId/users` when `authedOrgId(req) === tenantId` run under the caller's
   tenant scope via `runWithTenantScope` (`server/db/tenantStore.ts:74`), so RLS
   filters as defence in depth. This resolves the one wording difference between
   ARCH-08 and SEC-03: member reads are tenant-scoped, platform-admin reads are
   system-scoped. Keep `resolvePlatformAdmin` (no org-admin bypass), the
   membership join (line 128) and the `authedOrgId` check (line 319) unchanged.
   Confirm the `organizations` policy admits both scopes.
6. Remove the extra drivers.
   - Port `scripts/verify-migration.mjs` and `tests/migrations/proofAuditLogs.test.ts`
     to `pg`, then drop `postgres` from `package.json`.
   - Port or delete `server/scripts/direct_import.js` and
     `scripts/fix-missing-schema.cjs` (offline, not user-facing), then drop
     `@neondatabase/serverless`.
   - In `server/services/indCopilot.js:11-21` (reachable via
     `server/routes/ind.ts:17`), replace the Supabase service-role reads with pool
     queries, or delete the branch, which is null unless `SUPABASE_*` is set. Move
     `scripts/setup_reference_model.js` to `pg`. Drop `@supabase/supabase-js` and
     empty `SUPABASE_ALLOWLIST` in `scripts/ci/check-legacy-dep-quarantine.mjs:23-26`.
7. Add one gate, `ci:single-db-pool`, with `ci:single-db-pool:selftest`, wired in
   `package.json`, `.husky/pre-push` and the CI lint step beside
   `.github/workflows/ci.yml:863`. Outside `server/db/**` and test files it refuses:
   any import of `postgres`, `@neondatabase/serverless` or `@supabase/supabase-js`;
   any `new Pool(` / `new pg.Pool(`; and any read of `process.env.DATABASE_URL`
   under `server/` except the boot code stage 2 names. Baseline existing script
   violators (for example `server/scripts/run-sql.js:30`) with a written reason
   each. The selftest writes a temporary `server/routes/__fixture__.ts` that
   imports `postgres` and must fail. This is the single gate both ARCH-08 and
   SEC-03 ask for; do not add a second one.
8. Update the comments that describe the exposure:
   `establishRequestTenantScope.ts:88-96` now; `terraform/stack/main.tf:35-60`
   in stage 2, when the credential leaves.

**Acceptance**

- The contract test is red at HEAD and green after; the red output is filed.
- `git grep -nE "from 'postgres'|@neondatabase/serverless|@supabase/supabase-js" -- server shared`
  returns nothing, and `package.json` lists none of the three packages.
- `ci:single-db-pool:selftest` fails on the injected fixture; `ci:single-db-pool`
  fails on today's `tenants-simple.ts` and passes on the new tree.
- The dbtest shows the member-scoped directory under `app_service`, a 403 on
  another org's users, and a platform admin seeing every organisation.

### Stage 2 — Take the owner credential out of the runtime (Phase 1 · M · mixed) — closes DATA-03; advances SEC-03

Start after MR-06 lands SEC-04 (the immutability triggers and their boot-probe
registration must exist before the owner credential leaves) and when MR-03 has a
staging stack to run `deploy-migrate` against. The boot DDL move overlaps MR-17
(DATA-05, DATA-07); coordinate there rather than writing a second applier.

1. Re-confirm DATA-03 and SEC-03 at the current head (statuses here are from
   94b4f9238).
2. Write the failing infrastructure check first. In
   `terraform/stack/tests/boot_contract.tftest.hcl`, assert that
   `module.ecs.api_container.secrets` and `worker_container.secrets` contain no
   `DATABASE_URL`, and that the api container has no `APP_SERVICE_DB_PASSWORD`.
   Run `terraform test` against the current `terraform/stack/main.tf` and file the
   red output.
3. `terraform/stack/main.tf`: split `boot_secrets` (lines 315-330) into
   `runtime_secrets` (no `DATABASE_URL`, no `APP_SERVICE_DB_PASSWORD`) and
   `migrate_secrets` (`runtime_secrets` plus both). Set `api_secrets` (line 431)
   to `runtime_secrets` plus `SETUP_TOKEN`, and `worker_secrets` (line 440) to
   `runtime_secrets`. Add a Terraform-managed migrate task definition (family
   `c2c-production-migrate`) with the same image variable, execution role, log
   configuration and `migrate_secrets`. Rewrite the comment at lines 31-60 so it
   no longer lists an exposure.
4. `.github/workflows/deploy-aws.yml`: in the migrate step (around lines 756-800),
   run the one-off task from the migrate family instead of the API revision
   (lines 74-79 and 756-787 derive it from the API today). If a separate family is
   not wanted, pass `DATABASE_URL` and `APP_SERVICE_DB_PASSWORD` through the
   existing `EXTRA_SECRETS_JSON` of `scripts/ops/ecs-one-off-task.sh`. Remove
   `DATABASE_URL` from the API preflight list (line 514) and add a preflight that
   fails when the API container definition contains it. Make the same change in
   `provision-database.yml` and in `scripts/ci/check-compose-boot-contract.mjs`.
5. Boot refusal, in one place. In `server/startup/env.ts` `validateEnvironment`
   (lines 64-68, which today require `DATABASE_URL`): under
   `NODE_ENV=production`, require `APP_DATABASE_URL` and exit when `DATABASE_URL`
   or `DATABASE_NEON_NEW_SECRET` is set. Keep the development fallback. In
   `server/config/environment.ts:99-106`, stop falling back to `DATABASE_URL` in
   production so no second path reintroduces it. Write the unit test first and
   show it passing a production boot that has `DATABASE_URL` set.
6. Boot DDL out of the API.
   - `server/startup/services.ts:129-131`: in production call `ensureCoreTables()`
     with no connection string, so it uses the runtime pool in verify-only mode.
   - `server/db/ensureCoreTables.ts:458-590`: skip `autoCreateTables` when
     `NODE_ENV=production` and report a missing table as a `/readyz` failure. If
     `documents` still needs creating, put it in a `C2C_MIGRATION_FILES` file
     (`IF NOT EXISTS`, before the final sweep pair, Rule 1).
   - `server/db/bootstrap/index.ts:22-71`: in production open no owner pool. Move
     `applyAuthSchemaMigrations`, `applyModuleCatalogSchema` and
     `seedOrganizations` into `deploy-migrate`, either as set migrations or as a
     new `scripts/db/deploy-migrate.mjs` step that runs as the owner. Seed data
     follows Rule 1 (an `ON CONFLICT DO NOTHING` file in the set with a row-count
     assertion). Leave a read-only verification at boot. Do not seed the GA demo
     user in production.
7. Boot posture probe. In `server/db/rlsEnforcement.ts` `assessRlsCatalogPosture`
   (186-300), fail when `current_user` owns any relation in a non-system schema
   (`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE pg_get_userbyid(c.relowner) = current_user AND n.nspname NOT IN ('pg_catalog','information_schema') LIMIT 1`).
   Show it failing when the probe runs as the owner.
8. Founder or ops: run `terraform apply` on staging, deploy, capture a
   `deploy-migrate` run, then production. Confirm with
   `aws ecs describe-task-definition` that the API and worker carry no
   `DATABASE_URL`.

**Acceptance**

- `terraform test` in `terraform/stack` fails on HEAD with the
  no-`DATABASE_URL` assertion and passes after.
- The CI production boot smoke boots with `APP_DATABASE_URL` only and `/readyz`
  returns 200. Setting `DATABASE_URL` in production refuses boot; the test was
  shown passing that boot first.
- Booting against a database where `app_service` has no CREATE logs no DDL and
  no "Could not auto-create".
- The `deploy-aws.yml` preflight fails on an API task definition containing
  `DATABASE_URL`.
- A staging `deploy-migrate` run succeeds with the owner secrets supplied only to
  the migrate task; its log is filed.
- After apply, `describe-task-definition` for API and worker shows no
  `DATABASE_URL`, and the Terraform comment no longer lists `tenants-simple`.

### Stage 3 — Seal keys out of the runtime (Phase 2 · M · engineering) — closes SEC-03

1. Re-confirm SEC-03 at the current head (statuses here are from 94b4f9238),
   and that stages 1–2 have landed.
2. Write the failing test first: extend the tftest from stage 2 to assert that
   `AUDIT_HMAC_KEY` and `AUDIT_HMAC_SECRET` are absent from the api and worker
   containers. File the red run.
3. Add AWS KMS HMAC keys (KeySpec `HMAC_256`) in Terraform. Add a seal adapter
   used by both the audit chain writer and the `tamper_proof_log` writer. The task
   role gets `kms:GenerateMac` only; verification
   (`server/jobs/auditChainIntegritySweep.ts`) gets `kms:VerifyMac`. The existing
   boot posture `server/services/audit/auditSealPosture.ts` accepts the KMS mode
   as satisfying production.
4. Drop `AUDIT_HMAC_KEY` and `AUDIT_HMAC_SECRET` from `runtime_secrets`. Keep the
   raw-key path for non-AWS installs behind an explicit flag that production
   refuses.
5. Review `AUDIT_EXPORT_SIGNING_KEY`, `AUDIT_ATTESTATION_KEY` and
   `MFA_ENCRYPTION_KEY` (`terraform/stack/main.tf:315-328`) the same way, and
   record for each either the KMS move or why the runtime must hold it.
6. Add `tests/db/app-service-cannot-rewrite-evidence.dbtest.ts`, connected as
   `app_service`: `ALTER TABLE public.authoring_signatures DISABLE TRIGGER ALL`
   fails with 42501, and `UPDATE public.authoring_signatures …` fails. Run the same
   statements as the owner to show the test can see the difference.

**Acceptance**

- The tftest is red on the stage 2 tree and green after.
- The audit chain writes and verifies through KMS on staging; the integrity sweep
  passes on the new seals.
- The dbtest passes for `app_service`, and its owner-control half shows the same
  statements succeeding as the owner.

### Stage 4 — RLS that no session can switch off (Phase 3 · M · engineering) — closes DATA-01, DATA-02

This stage also closes SEC-03 item 4 (the session-setting pass-through). DATA-01
and SEC-03 propose two mechanisms; use DATA-01's floor function and platform role.
SEC-03's alternative, a `current_user = 'app_service'` clause in each policy,
hard-codes one role name into every policy and leaves the `app_super_admin`
setting usable by any other login. Do not implement both.

1. Re-confirm DATA-01, DATA-02 and the RLS item of SEC-03 at the current head
   (statuses here are from 94b4f9238).
2. Write the failing test first. Add `tests/db/rls-switches-inert.dbtest.ts` and
   run it in the `ci.yml` dbtest job. Seed two tenants' rows in one FORCE-RLS
   public table and in `vault.documents`. As `app_service`, scoped to tenant A,
   under the production floor, assert that each of
   `SET app.rls_enforce='off'`, `SET app.current_user_role='app_super_admin'`,
   `SET app.bypass_rls='true'` and `SET app.is_admin='true'` still returns only
   tenant A's rows. Also assert that a connection opened without startup options
   returns 0 rows with no scope. Add a view case: in tenant scope,
   `ectd_v4.v_submission_overview` returns no more rows than
   `ectd_v4.regulatory_submissions`, and `identity.v_user_access_summary` no more
   than `identity.users`. File the red run (2 of 2 rows; views 4 vs 0 and 7 vs 0).
3. Role default. In `scripts/db/provision-app-role.mjs`, when `RLS_ENFORCE`
   resolves to `on` (same rules as `readEnforcementMode` in
   `server/db/rlsEnforcement.ts`), run
   `ALTER ROLE <quote_ident(appRole)> IN DATABASE <current_database()> SET app.rls_enforce = 'on'`;
   when off, `… RESET app.rls_enforce`. Extend the grant audit in that file to read
   `pg_db_role_setting` and fail `deploy-migrate` in production when the default
   is absent.
4. Floor function. Add
   `CREATE OR REPLACE FUNCTION public.c2c_rls_floor() RETURNS boolean LANGUAGE sql IMMUTABLE AS 'SELECT <true|false>'`,
   owned by the owner role, with the body written by `deploy-migrate` from
   `RLS_ENFORCE` (true in production). It must exist before any policy references
   it: amend the first file in `C2C_MIGRATION_FILES` to create it, and add it to
   install-fresh before the overlay. `app_service` has CREATE on no schema, so it
   cannot replace it.
5. Change the leading clause of every tenant policy to
   `(NOT public.c2c_rls_floor() AND NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on')`.
   Rule 1: amend each creator in place with a dated header note naming this
   change; never append a DROP POLICY. Start with
   `db/migrations/20260801_tenant_isolation_sweep.sql:184-198` (and 332-341),
   `db/migrations/20260801_uuid_tenant_isolation_nonpublic.sql`,
   `db/migrations/20260813_child_table_parent_scoped_rls.sql` and
   `migrations/0021_enable_rls_everywhere.sql:190-220`, then every file on an
   applier returned by `grep -rl "IS DISTINCT FROM 'on'" migrations db/migrations`
   (this includes `migrations/20260928_users_membership_rls.sql` and
   `20261004_user_presence_rls.sql`). The sweeps drop and re-create policies on
   every deploy, so the change converges.
6. Platform reach by role, not by setting. Replace the
   `app.current_user_role='app_super_admin'` clause and the `app.bypass_rls` /
   `app.is_admin` short-circuits in `identity.can_*`
   (`db/migrations/069_gcc_multitenant_rls_expansion.sql:95,128,167,222`) with
   `pg_has_role(current_user, 'c2c_platform', 'MEMBER')`. Create `c2c_platform` as
   NOLOGIN and grant it to a separate LOGIN role used only by the system-scope
   pool, which serves `server/middleware/establishRequestTenantScope.ts:185`,
   `server/services/memory-consolidation-job.ts:110`,
   `server/services/audit/tenant-chain-verdict.ts:80` and
   `server/services/audit/compliance-reports/integrity-checks.ts:38`. The
   system-scope pool lives in `server/db/**` beside the runtime pool, so
   `ci:single-db-pool` still holds. `app_service` must not be a member.
7. Session-level bypass writers. Convert the seven entries in the BASELINE of
   `scripts/ci/check-session-scoped-rls-bypass.mjs:57-65` to `SET LOCAL` inside an
   explicit transaction, or remove them, and lower the baseline to lock each in.
   They are innovation services outside the launch catalog, so coordinate removal
   with MR-14. `server/services/innovation/submission-readiness-twin-service.ts:483-484`
   is reachable from AnA tools (`server/services/ana/AnaToolExecutor.ts`): removing
   it requires naming the replacement by path and the gate that proves it
   reachable (working agreement), or a founder decision.
8. Views and definer functions (DATA-02). Add a migration to
   `C2C_MIGRATION_FILES`, before the final RLS sweep pair (`ci:migration-set-order`),
   that runs `ALTER VIEW … SET (security_invoker = true)` on every view outside
   `pg_catalog`/`information_schema`, and `REVOKE EXECUTE` on
   `ai.hybrid_search` and `ai.semantic_search` from `app_service`. The only app
   reader of these views is `predicate.toxic_predicates`
   (`server/services/precedent-engine.ts:1300`); run its test after the change.
   For each remaining SECURITY DEFINER function `app_service` can execute, either
   derive the org from `current_setting('app.current_organization_id')` instead of
   an argument, or revoke it.
9. Add `ci:view-security-invoker` with a selftest: on the provisioned CI database
   it lists views whose `pg_class.reloptions` lacks `security_invoker=true` and
   definer functions executable by `app_service`, against a baseline with written
   reasons. Show it failing on HEAD.

**Acceptance**

- On a production-provisioned database, `psql` as `app_service` with no
  `PGOPTIONS` shows `current_setting('app.rls_enforce') = 'on'`, and an unscoped
  SELECT on a tenant table returns 0 rows (all rows at HEAD).
- With tenant A scoped, each of the four switch SETs returns 1 of 2 rows on the
  generic table and 0 tenant-B rows on `vault.documents` (2 of 2 and 1 extra at
  HEAD).
- `deploy-migrate` exits non-zero in production when `pg_db_role_setting` lacks
  the default, shown by deleting it first.
- Each view in tenant scope returns no more rows than its base table; the view
  gate selftest fails on an injected owner-rights view.
- The `ci:session-scoped-rls-bypass` BASELINE is empty, or every remaining entry
  is `SET LOCAL` inside a transaction.
- The dbtest red and green outputs are filed.

### Stage 5 — No tenant data in a table without RLS (Phase 3 · M · mixed) — closes DATA-08, DATA-09

RLS added here is a real control only once stage 4 removes the switches. Steps
2–3 (cross-tenant learning off everywhere) do not depend on stage 4 and are
small; land them early if staging testers run without launch scope.

1. Re-confirm DATA-08 and DATA-09 at the current head (statuses here are from
   94b4f9238).
2. Cross-tenant learning off by default (F-17). Write the route test first: with
   `CROSS_TENANT_LEARNING` unset, POST `/api/regulatory-intelligence/interactions`
   returns 404 (201 at HEAD). Then add one guard in
   `server/routes/regulatory-intelligence.ts` ahead of POST `/interactions` (:253),
   GET `/corrections` (:289), POST `/patterns/extract` (:303), GET
   `/agency-requirements` (:317), POST `/patterns/:id/promote` (:330), POST
   `/warnings/replay` (:429) and POST `/patterns/maintenance` (:448). It returns 404
   unless `CROSS_TENANT_LEARNING === 'on'`. Unset means off in every environment;
   production refuses to boot on any value other than `on`/`off`, matching
   `readLaunchScopeMode`. No client, AnA or MCP caller exists (grep `client/src`,
   `server/services/ana*`, `server/mcp`), so no user-facing capability is removed;
   say so in the commit and name the route test.
3. `server/services/intelligence/template-registry.ts:405-415` (`buildPromptHints`):
   treat `includeCorrections` as false unless the flag is on, and stop defaulting it
   to true at `regulatory-intelligence.ts:563`.
4. Consent and clamps, for the day F-17 changes. Add
   `cross_tenant_learning_opt_in BOOLEAN NOT NULL DEFAULT FALSE` to
   `public.organizations` through a new additive file in `C2C_MIGRATION_FILES`
   (`scripts/db/migration-set.mjs`), before the final sweep pair. In
   `recordInteraction` (`ana-failure-learning.ts:195`), persist no
   `promptSummary`, `responseSummary` or `correctionText` for orgs not opted in. In
   `extractFailurePatterns` (300-345), restrict the `failures` CTE to opted-in
   orgs and clamp with `Math.max(opts.minTenantCount ?? 0, MIN_TENANT_COUNT)` and
   `Math.max(opts.minFailureCount ?? 0, MIN_FAILURE_COUNT)` (`MIN_TENANT_COUNT` at
   routes line 35). Require platform admin on `/patterns/extract`,
   `/patterns/:id/promote` and `/patterns/maintenance`.
5. RLS on the learning tables. Enable and FORCE RLS on
   `intelligence.ana_interactions`, `intelligence.pattern_warnings` and
   `intelligence.template_validations` with the canonical `organization_id` policy,
   by amending `db/migrations/20260520_ana_failure_learning.sql` and
   `20260520_document_templates.sql` in place with dated header notes (both in the
   set at `migration-set.mjs:698-699`). Remove the three entries from
   `scripts/db/rls-coverage-check.sql:89-95`. Serve the cross-tenant aggregation
   only through a SECURITY DEFINER function owned by a NOLOGIN role, with
   `SET search_path` pinned, that returns aggregated, opted-in rows.
6. Part 11 store (DATA-09). Amend
   `db/migrations/20260813_audit_tamper_proof_log.sql` in place (dated header) so
   new rows require `organization_id` (a `CHECK (organization_id IS NOT NULL) NOT VALID`
   that admits the unkeyed pre-cutover rows, since `ADD CONSTRAINT` validates every
   existing row; guard it on `pg_constraint` so the file still re-runs on every
   deploy), and add FORCE RLS with the canonical policy plus `c2c_platform`
   reach for the integrity sweep. Do the same for `audit.signature_log`, and move
   `ai.gateway_audit_log` from a varchar org to `organization_id INTEGER`. Record in
   the file how pre-cutover rows are attributed or why they stay platform-only.
7. RLS-off public tables (DATA-09). Give `capa_records`/`capa_actions` and
   `mcp_oauth_clients` either `organization_id INTEGER NOT NULL` plus the canonical
   policy or parent-joined RLS in `db/migrations/20260813_child_table_parent_scoped_rls.sql`.
   Work through the remaining RLS-off public tables the same way, or record each
   as global with a reason in the coverage check.
8. Lock in SEC-12's zero: move `ci:unkeyed-request-tables:unreviewed` from the
   nightly strict job (`.github/workflows/ci.yml:2511`) into the per-PR lint step
   beside `ci.yml:686`.
9. Prove each step failing first: (a) the route test from step 2; (b) a dbtest as
   `app_service` scoped to org A selecting org B's `ana_interactions` and
   `tamper_proof_log` rows returns 1 before and 0 after; (c)
   `scripts/db/rls-coverage-check.sql` with the allowlist entries removed fails
   before step 5 and passes after.

**Acceptance**

- With `CROSS_TENANT_LEARNING` unset, in every `NODE_ENV`, the seven endpoints
  return 404 and `/templates/prompt-hints` returns no corrections (201 before).
- With the flag on, an org without opt-in gets no correction text persisted and is
  excluded from extraction; `minTenantCount: 1` no longer promotes a single-tenant
  pattern.
- As `app_service` in org A, `SELECT count(*) FROM intelligence.ana_interactions WHERE organization_id = <B>`
  returns 0 (1 before); the same holds for `audit.tamper_proof_log`.
- `rls-coverage-check.sql` has no `intelligence.*` carve-out and passes on a fresh
  provision; `capa_records`, `capa_actions` and `mcp_oauth_clients` are covered.
- The production launch-scope verdict for `/api/regulatory-intelligence` stays
  `out-of-scope`.

### Stage 6 — Path controls that match the router (Phase 3 · S · engineering) — closes SEC-13, ARCH-09

SEC-13 and ARCH-09 are the same defect. CloudFront's case-sensitive path patterns
(`terraform/modules/cloudfront/main.tf:8-23`) hide it on the canonical topology
only; compose, Helm, `app.yaml` and `.replit` expose it.

1. Re-confirm SEC-13 and ARCH-09 at the current head (statuses here are from
   94b4f9238).
2. Write the test first: with launch scope on, GET
   `/API/regulatory-digital-twin/ping` and `/Api/cmc/ping` reach the handler at HEAD
   (200) where `/api/regulatory-digital-twin/ping` returns 403. File it.
3. Fix at the router, once: call `app.set('case sensitive routing', true)` and
   `app.set('strict routing', true)` in server startup before any route is mounted
   (`server/startup/routes.ts`, ahead of the gate at line 108). Then `/API/…` never
   reaches an `/api` handler. Do not also add lowercase rewriting in individual
   middlewares.
4. Run the full route and auth-boundary suites; record any client call that relied
   on a trailing slash or mixed case and fix the caller.
5. Check every path-regex control against the new behaviour, including the audit
   immutability regex `/^\/api\/audit\/events/` (`server/startup/middleware.ts:225-233`)
   and the `authBoundary` allowlist.
6. Confirm `/api/project-rules` is registered on the `tasks` surface (the second
   half of ARCH-09's CI finding) and that `ci:launch-scope-api` reports it.

**Acceptance**

- `/API/regulatory-digital-twin/ping` returns 404 (200 before); the lowercase path
  still returns 403 `LAUNCH_SCOPE`.
- The existing route, auth-boundary and launch-scope suites pass.

### Stage 7 — Small hardening (Backlog · S · engineering) — closes SEC-26, SEC-28

1. Re-confirm SEC-26 and SEC-28 at the current head (statuses here are from
   94b4f9238).
2. SEC-26: in `server/utils/ssrfGuard.ts:47-61` `isSafePublicHost`, parse the
   address with `ipaddr.js` and classify by range: block `::`, unique-local
   `fc00::/7`, link-local, loopback, IPv4-mapped, NAT64 (`64:ff9b::/96`) and 6to4
   (`2002::/16`) embeddings of private IPv4. Stop prefix-matching hostnames, which
   today refuses `fda.gov` and `fcc.gov`. Write the tests first: `fda.gov` allowed,
   `[::]`, `[64:ff9b::a00:1]` and `[2002:a00:1::]` refused.
3. SEC-28, each with a failing-first test:
   - Compare `METRICS_TOKEN` with `crypto.timingSafeEqual` over equal-length buffers
     (`server/routes/operator-endpoints.ts:26-30`).
   - Remove the legacy brand origins (`trialsage.com`, `concept2cure-ri.ai`,
     `clinicalsage.ai`) from the production CORS and CSRF allowlist in
     `server/middleware/enterprise-security.ts:44-57`, or move them to configuration,
     per the founder decision below.
   - Stop storing the unused plaintext `organizations.api_key` in the POST handler
     of `server/routes/tenants-simple.ts` (:177). If the column is to go, remove it
     by amending its creating migration in place (Rule 1).
   - Rate-limit public `/readyz` (`server/startup/inline-endpoints.ts:50`).
   - Give `JWT_SECRET_PREVIOUS` an expiry (`jwtVerify.ts:44-47`).
   - Verify `clientWorkspaceId` (client-intelligence) and the `x-client-id` header
     (tenantContext) against the caller's org memberships.
   - Hand base-image digest pinning, global-by-email user squatting and
     Stripe-before-admission to their owning orders (MR-03, MR-07, MR-16) and note
     the hand-off in the register.

**Acceptance**

- The SSRF tests fail on HEAD and pass after.
- A metrics request with a wrong token of equal length is refused, and the
  comparison uses `timingSafeEqual`.
- A production CORS preflight from `https://trialsage.com` is refused (allowed
  before), unless the founder keeps it.

## Definition of done

- No API or worker task definition, in Terraform or in a running deploy, contains
  `DATABASE_URL`, `APP_SERVICE_DB_PASSWORD` or a raw audit HMAC key; production boot
  refuses to start if one appears.
- Every request-serving query goes through the canonical pool as `app_service`,
  and `ci:single-db-pool` blocks any new driver or pool.
- As `app_service`, no session setting, view or definer function returns another
  tenant's rows; `tests/db/rls-switches-inert.dbtest.ts` proves it in the CI dbtest
  job.
- No table holding tenant data, including `audit.tamper_proof_log` and the
  `intelligence.*` learning tables, sits outside RLS without a written reason in
  `scripts/db/rls-coverage-check.sql`.
- Cross-tenant learning is off in every environment unless the founder turns it on
  with consent.
- Path-based controls and the router agree on case.

## Founder decisions this order needs

- **F-17** (cross-tenant learning off for launch) — blocks stage 5, steps 2–5. Any
  later "yes" needs customer contract and consent language before the flag is set.
- **F-21** (external pen test with a two-tenant isolation test before customer
  data) — not a blocker, but schedule it after stages 1–2, and ideally after stage
  4, so the test measures the database boundary this order builds.
- **F-4** (AWS accounts and staging) — stage 2 needs a staging stack for the
  `deploy-migrate` change and a founder or ops `terraform apply`.
- **NEW: KMS cost and key ownership for audit sealing.** Approve AWS KMS HMAC keys
  for the audit seal, and who administers them. Blocks stage 3.
- **NEW: the out-of-catalog RLS bypass writers.** Whether the seven innovation
  services in the `check-session-scoped-rls-bypass` baseline, including the
  AnA-reachable `submission-readiness-twin-service.ts`, are converted or removed.
  Removal without a named replacement is a product decision (working agreement).
  Blocks stage 4, step 7; coordinate with MR-14.
- **NEW: legacy brand domains.** Whether `trialsage.com`, `concept2cure-ri.ai` and
  `clinicalsage.ai` still serve any customer. Blocks stage 7's CORS change only.

## Do not

- Do not append a `DROP POLICY`, `DROP VIEW` or `DROP COLUMN` migration. Amend the
  creating file in place with a dated header note (Rule 1). A policy change in a
  file the sweep also rewrites must converge on every deploy, not revert.
- Do not move `tenants-simple` onto the pool and leave the owner credential in the
  task "for boot". The order is done only when the runtime holds no owner secret;
  move boot DDL and seeds into `deploy-migrate` instead.
- Do not implement both RLS fixes (the `c2c_rls_floor()` floor and a
  `current_user = 'app_service'` clause), and do not add a second pool gate beside
  `ci:single-db-pool`. One mechanism each (zero duplication).
- Do not grant `c2c_platform` to `app_service`, or reintroduce cross-tenant reach
  through a session setting, a definer view or a function argument.
- Do not treat the launch-scope 403 as the fix for DATA-08. It protects production
  only while `reg-change` stays out of the catalog; the tables still need RLS and
  the flag must default off everywhere.
- Do not fix SEC-13 by lowercasing in one middleware; the router setting fixes every
  path control at once.

## How to run this order

- Claim it with one line in `docs/work-orders/README.md` §0 before starting; release it when you stop.
- Commit to `concept2cure-v2` only; merge, never rebase.
- Show each acceptance check failing on the current code before the fix, then passing; file that evidence under `docs/evidence/MR-05/<date>/`.
- When a finding closes, update its `statusAtHead` in `docs/work-orders/MR-findings-2026-10-13.json` with the closing commit.
