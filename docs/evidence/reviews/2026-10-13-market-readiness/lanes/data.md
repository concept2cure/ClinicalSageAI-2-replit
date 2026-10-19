## Lane: Data layer

Scratch evidence lives in `<scratch>/data/` (called `$S` below). The repo was not modified: `git status --porcelain` is empty. `c2c_cold_eval` is left provisioned with my test rows removed. `c2c_cold_eval_2` was dropped. Provisioning created cluster-wide roles: `app_service`, `gcc_*`, `audit_archiver`.

### Readiness score: 6/10
Provisioning is unusually good. It runs as one command, takes 24 s, refuses bad configuration before writing anything, gives the same schema on every run, replays cleanly, and checks readiness as the non-owner runtime role. The database layer is still not a "hard isolation / Part 11" store:
- **RLS can be switched off by the runtime role.** The policies let everything through when a session setting is unset, and `app_service` can change those settings itself. Demonstrated.
- **Views and credentials go around RLS.** 44 views run with owner rights and ignore row-level security. The API containers are given the database owner's connection string.
- **Authoring e-signature rows can be changed and deleted by the app role.** Demonstrated.
- **Upgrading an existing database does not reach the same schema as a fresh install.** The deploy still reports "safe to roll services".
- **Semantic search returns nothing for small tenants.** A tenant holding 0.4% of the rows gets 0 vector hits.

### Provisioning result
- **Command:** `DATABASE_OWNER_URL=postgres://postgres@…/c2c_cold_eval APP_DATABASE_URL=postgres://app_service:<pw>@…/c2c_cold_eval APP_SERVICE_DB_PASSWORD=<pw> time npm run db:provision`, log in `$S/provision1.log`.
- **Result:** exit 0 in **24.0 s** wall; the second from-empty run took 22.5 s. It ends with `✅ Database provisioned and the /readyz schema contract holds`.
  - install-fresh: drizzle push verified `481 of 487 declared tables`, overlay `270 applied`, `governed content: 42/42`, `tables (public): 795`, `RLS policies: 980`.
  - deploy-migrate: `✓ 323/323 migration files applied`.
  - Checked as `app_service`: `grant audit: 1285/1285`, `SELECT reach: 27/27`.
- **Warnings seen:**
  - One overlay file is skipped by design: `0008_critical_fk_delete_policies.sql — superseded … relation "user_sessions" does not exist`.
  - `application_role not found — skipping REVOKE`.
  - `[uuid-rls] SKIPPED cortex.traces/threads — not provisioned`.
  - 4 child-RLS WARNINGs (`vigilance_events/mdr_events/drafting_tasks/complaints → regulatory_programs … policied by text comparison`).
  - `[orphaned-guc] dropped 1, skipped 4` (see DATA-17).
- **Replay:** `node scripts/db/deploy-migrate.mjs` run again took **3.3 s**, exit 0, all 323 applied again. A third run took 2.7 s.
  - Schema dumps are identical after replay 1 and replay 2.
  - Two separate from-empty databases are identical apart from the `\restrict` token, so provisioning is deterministic.
  - The only difference between "just provisioned" and "after one replay" is the 4 orphaned-GUC policies (DATA-17).
- **Journal:** everything reports unchanged. I forced drift by setting a sha to `deadbeef`, then ran deploy-migrate with `C2C_MIGRATION_JOURNAL_STRICT=1`: exit 0, no message, and the hash was silently overwritten (DATA-07).
- **Gates, all green:** `ci:migration-drop-safety` (`323 migrations, 34 DROP(s)… 17 dynamic DROP(s)`), its selftest (12/12), `ci:migration-reachability`, `ci:migration-set-order`, `ci:migration-prefix-collisions`.
- **Upgrade simulation** (the production path):
  1. Exported commit `54927bde` (2026-09-06) with `git archive` into scratch.
  2. Ran its install-fresh and deploy-migrate into a clean database.
  3. Ran HEAD's `deploy-migrate`: exit 0, "✅ safe to roll services".
  4. Compared a semantic fingerprint (columns, constraints, indexes, policies, RLS flags, triggers, function/view hashes) against fresh HEAD: **47 columns and 14 constraints present on fresh are missing after upgrade**, and 166 stale columns, 31 indexes and 8 functions are extra (DATA-05).
- **DR test:** `pg_dump -Fc` gives 42 MB in 8.5 s. `pg_restore` into a new database takes 28 s. The fingerprint matches apart from how PostgreSQL re-prints 43 varchar CHECK constraints (no real difference). `deploy-migrate` on the restored database is clean (2.7 s).

### Key catalog metrics (c2c_cold_eval, provisioned)
| Metric | Value |
|---|---|
| Schemas / tables / partitioned | 38 / 1237 (976 in `public`) / 1 (`regulatory_harmonization.audit_log`) |
| Views / matviews / indexes / sequences / enums | 46 / 1 / 4784 / 653 / 128 |
| Functions (non-extension) / user triggers / policies / FKs | 176 / 98 / 1163 / 1950 |
| `public` RLS on / FORCED | 891 / 888 of 976 |
| Tenant-keyed tables (org_id/organization_id/tenant_id) | 862. Integer keys: 776; **uuid 74, bigint 13, varchar 1, text 1** |
| Tenant key nullable (integer) | 87 (Rule 1 says NOT NULL) |
| Tenant-keyed tables with RLS off | 13: `api_keys`, `billing_*`, `stripe_events` (allowlisted), `intelligence.*`×5, `ai.gateway_audit_log`, `audit.event_log`, `federated_ml.federation_participants`, `precedent.quality_checkpoints` |
| `public` tables with RLS off that `app_service` can UPDATE | 85 (e.g. `capa_records`, `capa_actions`, `conversation_os_*`, `mcp_oauth_clients`, `submission_projects`) |
| Tables with 2 / 3 / 4 / 8 policies | 22 / 3 / 22 / 1 (`vault.documents`: 2 duplicate sets of 4) |
| RLS on with zero policies | 9 |
| Tables without a PK | 0 |
| FKs without a supporting index / of which ON DELETE CASCADE | 731 / 44. 341 cascades in total |
| Tenant tables with no index led by the tenant key | 112 (incl. `authoring_*`, `doc_revisions`, `c2c_documents`, `project_tasks`, `readiness_evaluations`) |
| Duplicate indexes | 85 |
| SECURITY DEFINER functions (owned by superuser, `app_service` can EXECUTE) | 73, ~20 without `SET search_path`. `app_service` has CREATE on 0 schemas |
| Views with `security_invoker=false` | 44 of 46 |
| Vector columns | 42. HNSW 11, ivfflat 3, **unindexed 28** (including all 3072-dim) |
| `app_service` | LOGIN, NOSUPERUSER, NOBYPASSRLS, owns 0 relations (postgres owns 1938), no `pg_db_role_setting` |
| Rows after provision | 1066 in 47 tables. `knowledge_entries` / `innovation.guidance_documents` / `precedent.regulatory_precedents` = 0 |
| Migration files | 572 SQL. 323 in the deploy set; 249 outside it (119 `migrations/` overlay-only, 41 gcc, 4 authoring, **85 `db/migrations` on no applier**) |
| Drizzle vs DB | 487 declared tables and 8564 columns all present. 797 DB relations have no Drizzle model. 9 NOT NULL relaxations. 47 columns exist only in the DB |

### What is genuinely strong (keep)
- **`scripts/db/provision.mjs`:**
  - Refuses before writing anything if pgvector, CREATEROLE or psql is missing, with distinct exit codes.
  - Keeps owner and app roles apart and checks readiness as `app_service`.
  - Fast (24 s) and deterministic.
- **Replay-safe migration runner.** Files run in a per-file transaction with `lock_timeout` 2 s and bounded retry (`migration-set.mjs:2813-2850`). NOTICE and WARNING messages are printed into the deploy log. An advisory migration lock is taken.
- **Rule 1 gates.** The drop-safety gate proves itself with 12 failing cases, and it recognises DROPs issued through `EXECUTE`. Set-order and reachability gates are green.
- **Tenant isolation works when the session settings are set correctly** (`$S/rls_test.out`):
  - `app_service` scoped to tenant 9001 sees 1 of 2 rows.
  - With no tenant set it sees 0 rows.
  - A cross-tenant INSERT fails with `new row violates row-level security policy`.
  - 888 of 976 public tables have FORCE on.
- **Immutability is enforced on the core stores.**
  - Triggers block UPDATE/DELETE on `audit.tamper_proof_log`, `audit_events`, `audit_logs` (plus TRUNCATE), `electronic_signatures`, `concept2cure_signatures` and `doc_revisions` (append-only).
  - The audit schema grants `app_service` only SELECT and INSERT.
  - The audit-log archive function runs as a NOLOGIN `audit_archiver` role.
- **Pool settings** (`server/db/runtime.ts:51-60`): statement_timeout 30 s, idle-in-transaction 60 s, and the RLS setting is sent in the connection startup packet. Production refuses to boot unless `RLS_ENFORCE=on`.
- **Retention job** (`server/jobs/retentionCron.ts`): legal holds are loaded fail-closed, each disposal writes a chained audit row, and soft delete is the default.
- **RDS settings in Terraform:** multi-AZ, 35-day PITR, deletion protection, encryption, `rds.force_ssl=1`, `verify-full`. The evidence bucket uses Object Lock in COMPLIANCE mode.

### Findings

**DATA-01 · P1 · RLS switches off by default and the runtime role can disable it itself**
- **Evidence:**
  - The canonical policy on 958 tables starts with `NULLIF(current_setting('app.rls_enforce'),'') IS DISTINCT FROM 'on' OR … OR current_setting('app.current_user_role')='app_super_admin'` (`server/db/rlsEnforcement.ts:7-14`).
  - 16 policies are gated by `identity.can_*` functions that return TRUE when `app.bypass_rls='true'`.
  - Measured as `app_service` (`$S/rls_test.out`): with no settings, 2 of 2 rows visible. `SET app.current_user_role='app_super_admin'` gives 2. `SET app.rls_enforce='off'` gives 2. On `vault.documents`, tenant scope shows 0 rows, then `SET app.bypass_rls='true'` shows 1 (`secret-tenantB.pdf`).
  - No `ALTER ROLE app_service SET app.rls_enforce` exists; `pg_db_role_setting` is empty.
- **Impact:** RLS is not defence-in-depth. Any SQL injection, any extra connection path that skips the startup options (scripts, workers, a second driver), or any setting left on a pooled connection exposes every tenant. A GxP buyer's "hard isolation" claim does not hold at the database level.
- **Fix:**
  - `ALTER ROLE app_service SET app.rls_enforce='on'`.
  - Rewrite the canonical policy and the `identity.*` functions so they ignore `rls_enforce`, `app_super_admin`, `bypass_rls` and `is_admin` for `app_service`.
  - Give platform staff access through a separate NOLOGIN role reached by `SET ROLE`, with explicit `TO` policies.
  - Add a CI test that tries each bypass setting and expects no rows.
- **Effort:** M. **Depends on:** WO-1.

**DATA-02 · P2 · 44 owner-rights views ignore RLS; SECURITY DEFINER search takes the org as an argument**
- **Evidence:**
  - As `app_service` in tenant scope: `ectd_v4.regulatory_submissions` returns 0 rows but `ectd_v4.v_submission_overview` returns 4. `identity.users` returns 0 but `identity.v_user_access_summary` returns 7 (`$S/view_bypass.out`).
  - In production the owner is the RDS master, so the leak applies to views over non-FORCED tables: `signing.*`, `evidence.*`, `ectd_v4.*`, `site_intel.*`, `labeling.*`.
  - `ai.hybrid_search` / `ai.semantic_search` are SECURITY DEFINER and take the org id from the caller (`p_org_id`).
  - The app uses almost none of these (only `predicate.toxic_predicates` in `server/services/precedent-engine.ts:1300`).
- **Impact:** a latent way to read other tenants' data, and an item a validation auditor will find.
- **Fix:** `ALTER VIEW … SET (security_invoker=true)` on all views, or REVOKE SELECT. REVOKE EXECUTE on unused SECURITY DEFINER functions. Add a gate.
- **Effort:** S.

**DATA-03 · P1 · API and worker containers hold the owner (RDS master) credentials; a live route runs on them**
- **Evidence:**
  - `terraform/stack/main.tf:79,198-200`: `boot_secrets` puts `DATABASE_URL` (the master URL) into every API and worker task.
  - Boot runs DDL on it: `server/db/bootstrap/index.ts:36-44` (ensureAuthTables) and `server/startup/services.ts:130` (ensureCoreTables).
  - `server/routes/tenants-simple.ts:66-68` builds a second driver (`postgres.js`) on `DATABASE_URL` and serves `/api/tenants` as the owner, with no RLS setting.
- **Impact:** an API compromise gives full database-owner rights (DDL, reading every table that is not FORCED). The boot DDL is a seventh place schema gets written, outside the migration set.
- **Fix:**
  - Remove `DATABASE_URL` from API and worker tasks.
  - Move the boot DDL into `deploy-migrate`.
  - Move tenants-simple onto the app pool with a platform scope.
  - Add a boot assertion that the connected role is not the owner.
- **Effort:** M.

**DATA-04 · P0 (for regulated customers) · Authoring e-signatures and audit trails can be rewritten by the app role**
- **Evidence:**
  - As `app_service` in tenant 9001: `UPDATE authoring_signatures SET signer_name='Someone Else', meaning='reviewed', signed_at=now()-'30 days'` returned `UPDATED`, and `DELETE` returned `DELETE 1` (`$S/sig_mutability.out`).
  - No triggers exist on `authoring_signatures`, `authoring_audit_trail`, `authoring_audit_events`, `c2c_document_section_versions`, `submission_leaves` or any `qms_*` table (`$S/q3.out`).
  - Writers of `authoring_signatures`: `server/routes/authoring.router.ts:4327,5985`.
- **Impact:** a Part 11 §11.10(e)/§11.70 gap in Authoring, which is in the launch catalog. Other stores already have the trigger pattern.
- **Fix:** add an append-only trigger (UPDATE/DELETE/TRUNCATE), `REVOKE UPDATE, DELETE` from `app_service` on these tables, and extend a CI check to every table named `*signature*|*audit*`.
- **Effort:** S.

**DATA-05 · P1 · Upgrading an existing database does not match a fresh install, and nothing detects it**
- **Evidence** (`$S/fresh_only.txt`, `$S/upgraded_only.txt`):
  - After a 2026-09-06 database is upgraded by HEAD `deploy-migrate`, `assumption_records`, `decision_records` and `governance_boundary_rules/_transitions` keep their old enum-typed shape.
  - HEAD code writes the new columns (`server/services/assumption-registry-service.ts:411` `assumption_code, title`; `server/services/decision-record-service.ts:207`), so these writes fail at runtime on an upgraded database.
  - `cmc_comparability_assessments.tenant_id` is `text` after upgrade and `integer` on fresh.
  - Stale objects remain (`cortex.agents/edges` with RLS off).
  - 8 `migrations/` files changed since 09-06 are not in the deploy set (e.g. `0012_project_charter_timeline.sql`, `20260629_protocol_deviations.sql`). Drizzle push only runs on fresh installs.
  - `ci:migration-reachability` counts the install-fresh overlay and push as durable (`scripts/ci/check-migration-reachability.mjs` header). The readiness contract only checks sentinel tables.
- **Impact:** the first release after go-live can break features on the production database while the deploy reports green.
- **Fix:**
  - CI job: provision from the previous release tag, then run HEAD `deploy-migrate`, then require a fingerprint diff against fresh HEAD that is empty or baselined.
  - Add a set migration that converges these 4 tables.
  - Stop treating overlay-only or push-only paths as reachable for a production upgrade.
- **Effort:** M.

**DATA-06 · P1 · Semantic search returns nothing for small tenants (HNSW index + RLS filtering)**
- **Evidence:**
  - Seeded 20 atoms for tenant 9001 and 4980 for tenant 9002. As `app_service` in 9001, `search_atoms_hybrid('zzzqqq', vec, …, 10)` returned **0**; tenant 9002 got 10.
  - `EXPLAIN`: `Index Scan using idx_lumen_atoms_embedding_hnsw … Rows Removed by Filter: 40 … actual rows=0`.
  - The app path filters with `ARRAY(SELECT id FROM org_atoms)` the same way (`server/services/enhancedEmbeddingService.ts:582`).
  - pgvector is 0.6 locally and RDS 15.4 ships about 0.5, so iterative scan is not available.
  - `vault.document_chunks` has an ivfflat index built on an empty table (default lists, never rebuilt). 28 vector columns, including all 3072-dim ones, have no index.
- **Impact:** AnA grounding quietly returns nothing for smaller tenants once a large tenant exists. The retrieval result is wrong rather than an error.
- **Fix:**
  - pgvector ≥0.8 with `hnsw.iterative_scan=strict_order`, or an exact scan when a tenant's candidate set is small.
  - Rebuild ivfflat after data loads.
  - Recall test in CI.
- **Effort:** M.

**DATA-07 · P2 · Migration journal drift is recorded and then ignored**
- **Evidence:** `migration-set.mjs:2981` discards `recordApplied`'s result. The `deadbeef` test above got exit 0 even with STRICT=1.
- **Fix:** fail the deploy on `drift` unless the file carries a dated amendment header (CLAUDE.md Rule 1 practice), and print a drift summary.
- **Effort:** S.

**DATA-08 · P1 · Customers' free-text corrections are pooled across tenants with no RLS or consent**
- **Evidence:**
  - `intelligence.ana_interactions` has `prompt_summary`, `response_summary`, `correction_text` and RLS off.
  - `extractFailurePatterns` groups `correction_text` across tenants and promotes it to "cross-tenant memory" (`server/services/intelligence/ana-failure-learning.ts:300-330`).
  - It is written through `POST /api/regulatory-intelligence/interactions` (`server/routes/regulatory-intelligence.ts:253-285`); the file contains no opt-in or consent check.
- **Impact:** a pharma customer's text can influence other tenants' outputs. This is a contractual and confidentiality blocker, and the federated-learning capability is outside the launch scope (Rule 2).
- **Fix:** add a tenant consent flag and RLS, or disable the feature for launch.
- **Effort:** S–M.

**DATA-09 · P2 · Part 11 store has no tenant key; tenant data sits in tables without RLS**
- **Evidence:**
  - `audit.tamper_proof_log` has no org column and RLS off, so `app_service` can read every tenant's trail. The same holds for `audit.signature_log` and `ai.gateway_audit_log` (varchar org).
  - 85 public tables with RLS off are writable by the app, including QMS `capa_records`/`capa_actions` (scoped by joining through the program in `mdx-postmarket.ts:71-85`), `conversation_os_*`, and `mcp_oauth_clients` (stores `client_secret` as given, `server/mcp/auth/store.ts:50-56`).
- **Impact:** you cannot export or prove the audit trail per tenant, and there is no database backstop on those tables.
- **Fix:** add `organization_id` plus policies, or child-scope RLS through the parent; a per-tenant chain for tamper_proof_log.
- **Effort:** M.

**DATA-10 · P2 · Schema sprawl and duplicate stores**
- **Evidence:**
  - 1237 tables in 38 schemas, many outside the launch catalog (cortex 30, innovation 27, intelligence 14, federated_ml, manufacturing).
  - **8 e-signature stores** (`electronic_signatures`, `compliance.`, `cognitive_audit.`, `regulatory_harmonization.`, `signing.signatures`, `authoring_signatures`, `concept2cure_signatures`, `audit.signature_log`) and around 25 audit tables with inconsistent immutability.
  - 73 SECURITY DEFINER functions owned by the superuser.
  - 7 schema-writing paths: push, overlay, authoring, RLS set, gcc via psql, the deploy set, boot DDL.
  - 85 `db/migrations` files on no applier (`$S/db_orphans.txt`); `db/`, `sql/`, `database/`, `init-sql/` are legacy.
  - `vault.documents` has two duplicate policy sets.
- **Impact:** makes installation qualification and validation scope unclear, increases attack surface, and breaks the zero-duplication rule.
- **Fix:** name one signature store and one audit trail of record for launch; stop provisioning out-of-scope schemas in production; archive orphan files.
- **Effort:** L–XL.

**DATA-11 · P2 · Test data is seeded into every fresh production database**
- **Evidence:** `db/migrations/055_gcc_test_scenarios.sql:133,288` (gcc tree, install-fresh step 6) inserts 7 `*-test.example.com` users, 9 identity organisations and 4 fake submissions (`IND 999888`, `K241234`) plus 14 eCTD documents.
- **Impact:** breaks the "no fixture data in governed paths" rule, and installation qualification would find it.
- **Fix:** remove the seed by amending the file in place (dated header, per Rule 1) and add a cleanup migration.
- **Effort:** S.

**DATA-12 · P2 · Reference corpora are not deployed**
- **Evidence:** after provisioning, `knowledge_entries` (read by `regulatory-guidance-retrieval.ts:67`), guidance and precedent tables all have 0 rows. `scripts/ingest-corpus.ts` and the `seed-*` scripts are in no workflow.
- **What migrations do seed:** `c2c_rule_packs` 34, `ectd.module_structure` 213, `common_standards.*`.
- **Fix:** load corpora through a governed migration or deploy step with row-count assertions.
- **Effort:** M.

**DATA-13 · P2 · Production database platform does not match what was tested**
- **Evidence:**
  - `terraform/environments/production/main.tf:55` pins `rds_engine_version="15.4"`, while every local and CI provisioning run is on 16.x. Whether 15.4 is still creatable on RDS is UNVERIFIED.
  - Default class is `db.t3.medium` (`variables.tf:33`), a burstable instance.
  - No cross-region backup or S3 replication.
  - `pgaudit.log` is set without `shared_preload_libraries` (effect UNVERIFIED). No RDS Proxy.
  - Connection budget: 40 per task, api 2 + worker 1, 200% during rolling deploy, so about 240+ connections, against about 400 on t3.medium (estimate).
- **Fix:** run CI on the same engine as production, use a non-burstable class, copy snapshots cross-region, preload pgaudit.
- **Effort:** S–M.

**DATA-14 · P2 · Deploy time and blocking grow with data**
- **Evidence:** 36 files in the set run top-level UPDATE backfills and 34 run ADD CONSTRAINT on every deploy. There is no `CREATE INDEX CONCURRENTLY` anywhere. The replay was only measured on an empty database (3 s).
- **Fix:** a class of non-transactional migration files for concurrent index builds, cheap guards on backfills, and a replay benchmark on a seeded database with a time budget.
- **Effort:** M.

**DATA-15 · P2 · Performance hotspots**
- **Evidence:**
  - Every tamper_proof_log write across all tenants waits on one global advisory lock (`server/lib/tamper-proof-audit.ts:267`).
  - Audit tables are not partitioned.
  - 731 FKs lack an index; 112 tenant tables have no index led by the tenant key.
  - List queries without limits: `mdx-qms.ts:352-354` (`SELECT * FROM qms_documents … ORDER BY doc_number`), `project-sections.ts:1225-1236`, `authoring.router.ts:2288`.
  - N+1 comment replies at `authoring.router.ts:2972-2984`.
  - A per-row upsert loop with no transaction at `authoring.router.ts:6480`.
- **Effort:** M.

**DATA-16 · P2 · Governed rows can be destroyed by cascade or hard delete**
- **Evidence:**
  - Cascades: `document_audit_logs←unified_documents`, `qms_training_records←qms_documents`, `stab_audit←stab_studies`, `c2c_document_section_versions←c2c_document_sections`, `vault.document_read_receipts←vault.documents` (`$S/q4.out`).
  - `vault.documents` has no trigger guarding legal holds or hard deletes (`retentionCron.ts:127`).
  - `DELETE /docs/:docId` is guarded only by a static `ADMIN_TOKEN` header with no org check (`authoring.router.ts:5291-5325`).
  - QMS "revise" nulls `approver_id`/`approved_at` in place, and there is no version table (`mdx-qms.ts:643-670`).
- **Fix:** RESTRICT on governed children, a database-level legal-hold trigger, and a QMS version history table.
- **Effort:** M.

**DATA-17 · P3 · A Rule 1 create-then-drop cycle on policies**
- **Evidence:** `20260220_ind_section_tracking.sql:54,82` recreates 5 `*_org_policy` policies and `20260828_drop_orphaned_org_guc_policies.sql` drops them on every deploy. A fresh provision is left with 4 of them (the `app.organization_id` cast problem) until the second deploy. The gate counts dynamic DROP POLICY as allowed.
- **Fix:** amend the creating file in place.
- **Effort:** S.

**DATA-18 · P3 · Drizzle is not the source of truth**
- **Evidence:**
  - 9 `vault.documents` columns (`document_code`, `s3_key`, `file_name`, `mime_type`, …) are notNull in Drizzle but nullable in the database.
  - 47 columns exist only in the database (`audit_logs` chain columns, `organizations` offboarding columns).
  - `npx drizzle-kit push` on a provisioned database hung for more than 180 s at "Pulling schema" with no change.
  - `drizzle.config.ts` has `out: './migrations'`.
- **Fix:** document which source is canonical and remove or guard `db:push`.
- **Effort:** S.

**DATA-19 · P3 · Roles are cluster-wide; DR drill is synthetic**
- **Evidence:**
  - `app_service`, `gcc_*` and `audit_archiver` are cluster-global, so provisioning a second database on the same cluster with a different password re-sets it for all of them.
  - `pg_dump` does not carry roles.
  - `scripts/ops/dr-restore-drill.sh` proves a toy `dr_proof` schema, not the real one.
- **Fix:** name roles per environment and run the drill against the real schema.
- **Effort:** S.

### Recommended work orders
1. **WO-1: Make RLS a real control** (DATA-01, DATA-02). M.
   - Set the role default for `rls_enforce`.
   - Remove the four bypass settings from the policies and the `identity.*` functions.
   - Add a separate platform role reached by `SET ROLE`.
   - Set `security_invoker` on all views; revoke unused SECURITY DEFINER functions.
   - **Accept when:** as `app_service`, setting each bypass setting still returns 1 of 2 rows; each view in tenant scope returns no more rows than its base table; a CI selftest covers both.
2. **WO-2: Part 11 immutability for the launch tables** (DATA-04, part of DATA-16). S.
   - Add triggers and REVOKE on `authoring_signatures`, `authoring_audit_*`, section versions and QMS signatures.
   - **Accept when:** the UPDATE and DELETE from `$S/sig_mutability.out` both fail, and a gate lists every `*signature*|*audit*` table without a trigger.
3. **WO-3: Take the owner credentials out of the runtime** (DATA-03). M.
   - **Accept when:** the task definitions contain no `DATABASE_URL`; the API boots with only `APP_DATABASE_URL`; `/api/tenants` goes through the app pool; boot does no DDL.
4. **WO-4: Upgrade-convergence gate** (DATA-05, DATA-07). M.
   - **Accept when:** the "previous tag, then HEAD deploy-migrate" fingerprint diff against fresh HEAD is empty in CI; a drift record fails the deploy; the 4 divergent tables converge.
5. **WO-5: Vector retrieval correctness** (DATA-06). M.
   - **Accept when:** a tenant with 20 of 5000 rows gets k results; ivfflat is rebuilt after data loads.
6. **WO-6: Production database platform alignment** (DATA-13). S–M.
   - **Accept when:** CI and production run the same major version, with a non-burstable class, cross-region snapshots and pgaudit loaded.
7. **WO-7: Data hygiene** (DATA-08, DATA-11, DATA-12). M.
   - **Accept when:** a fresh provision has 0 fixture rows; cross-tenant learning is gated on consent or off; corpus row counts are asserted after deploy.
8. **WO-8: Deploy scalability and performance** (DATA-14, DATA-15). M.
   - **Accept when:** a replay on a seeded database (10^6 audit rows) stays within budget; FK and tenant indexes exist on the hot tables; list endpoints are paginated.
9. **WO-9: Schema consolidation** (DATA-10, DATA-18, DATA-19). L–XL.
   - One signature store and one audit trail; drop out-of-scope schemas from production provisioning; archive orphan migration files.

### Open questions for the founder
- Has any staging or production RDS already been provisioned, and from which commit? That decides how exposed you are to DATA-05.
- Which signature table and which audit table are the records of truth for installation/operational qualification (IQ/OQ)?
- Is there a customer contract or consent for cross-tenant learning (`intelligence.*`, `ana_platform_wisdom`)? If not, it should be switched off for launch.
- Is PostgreSQL 15.4 on `db.t3.medium` really the production target?
- Expected tenant count and document volumes, to size vector indexing and the deploy replay budget.
- Are confidential MCP OAuth clients (with a non-null `client_secret`) ever issued? UNVERIFIED.
