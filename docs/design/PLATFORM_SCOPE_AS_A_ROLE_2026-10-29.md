# Platform scope is a role, not a session setting (P-72): design

Launch row D6, tenant isolation (the row P-70 moved). Founder decision P-72 (`docs/LAUNCH_DEFINITION_OF_DONE.md`, "### P-72"), decided 2026-10-29 under the founder's delegation for regulated clients. P-72 asks for this design before any policy changes: every path that sets either setting today, and the door each path moves to. This document changes no code, migration or test. The implementation slices file their evidence under `docs/evidence/D6-PLATFORM-SCOPE-ROLE/<date>/`.

Read at `1d9e01848` and re-checked at `96a9ecf58` on `concept2cure-v2`. Between the two, no file this design cites changed except `scripts/db/migration-set.mjs`, whose deploy set now has 452 entries. The offboarding-custody lane's work (P-58/P-59) was read from its uncommitted working tree, which the lead had set aside for pushes as `git stash` "lead-aside-for-push". In that tree, `migrations/20261029k_tenant_offboarding_custody.sql` is new, and `migrations/20261023_review_routes.sql`, `scripts/db/security-definer-allowlist.json`, `scripts/db/migration-set.mjs` and `server/services/tenant/*` are modified. Doors are named here as that lane defines them. Where this design changes one of them, the change belongs to that lane's files, and the purge slice below is a hand-off to that lane, not a takeover.

## In short

- Two session settings still open almost every tenant policy. When `app.rls_enforce` is not `'on'`, about 1020 policies admit every row. When `app.current_user_role = 'app_super_admin'`, about 973 do. Any role can set either one. Production is safe only because every connection is pinned to `'on'` and to a role the server chose (`server/db/sessionScope.ts`).
- The platform arm becomes `CURRENT_USER = 'c2c_platform_scope'`. `c2c_platform_scope` is a new NOLOGIN role, and the runtime role is not granted it in any form. `current_user` takes that value only inside a SECURITY DEFINER door the role owns. A session cannot set it, and an inherited or `WITH SET FALSE` grant never makes it true. It works the same way on PostgreSQL 15, the version production is pinned to.
- The shadow arm becomes a property of the login, not of the session. A session whose login role is a member of a second NOLOGIN role, `c2c_rls_exempt_login`, sees what it owns, but only while it acts as itself (`CURRENT_USER = SESSION_USER`). The migration applier and a single-role developer database are members. The runtime role never is, and the deploy and the boot refuse it if it ever is. Without this, every backfill a non-superuser applier (the RDS master) runs on a FORCEd table would match nothing, silently. CI would never show it, because CI's applier is a superuser.
- The platform paths shrink before the arm is replaced. Today 57 `runWithSystemTenantScope` call sites in 39 files, 9 path prefixes, 5 direct mounts, 5 staff cross-organization routes and 8 explicit super-admin scopes run in the platform scope. Each moves to one of three places:
  - the **infrastructure scope**, when it reads no tenant's rows: catalog probes, enumerating the open `organizations` table, `api_keys`;
  - **one named organization's own scope**, when it acts on one tenant: the purge, the export, staff edits, webhooks. This is the P-66 pattern `purge_tenant_vault_records` already uses;
  - a **platform door** owned by `c2c_platform_scope`, only when it reads across tenants or writes rows the platform owns. About 20 doors, listed in §3.
- Every creator is amended in place (Rule 1). `migrations/2026MMDD_platform_scope_role.sql` converges installed databases by rewriting each stored policy and function from its own text, as `20261029j` does. The deploy then fails if any policy, function body, function `SET` clause or role/database default still reads `app.rls_enforce` or `app.current_user_role`.

## What the two settings do today

Every tenant policy the sweeps generate carries two arms besides its tenant match (`db/migrations/20260801_tenant_isolation_sweep.sql:184`, `migrations/0021_enable_rls_everywhere.sql:189`):

```
NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'      -- S: the shadow arm
OR <tenant column> = <app.current_tenant_id | app.current_org_id>
OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'          -- P: the platform arm
```

| Who passes S today | Who passes P today |
|---|---|
| Every connection the application does not configure: migrations and the deploy applier (`deploy-migrate.mjs` sets neither), operator scripts, `psql`. | The system scope (`tenantId '0'`, role `app_super_admin`): every `runWithSystemTenantScope` call and every request routed to `establishRequestSystemScope`. |
| Dev and CI wherever `RLS_ENFORCE` is not `on`, because `sessionScope.ts` pins `''`. | Four definer functions that set it for their own body. |
| Any session that runs `SET app.rls_enforce = 'off'`. | Any session that runs the SET, and any per-user scope whose JWT role claim is the literal `app_super_admin` (found below). |

Production turns enforcement on in the startup packet (`server/db/rlsEnforcement.ts:118`, `-c app.rls_enforce=on`). It re-pins it on every scope and clears it on release (`sessionScope.ts` `switchPinTerms`, `CLEAR_SESSION_SCOPE_SQL`, `RESET_ENFORCEMENT_SQL`). So no caller-controlled SET reaches the database. But one injected or careless SET lifts isolation on every table that carries either arm, for the rest of that request (`docs/evidence/D6-NO-SESSION-RLS-BYPASS/2026-10-29/README.md`, "What remains").

## What already exists

### How this was counted

P-70's live-catalog inventory (`docs/evidence/D6-NO-SESSION-RLS-BYPASS/2026-10-29/inventory.txt`; queries in `probes.sql.txt`) was taken on a database that install-fresh and deploy-migrate built at `92bb29868` (PostgreSQL 16.15). It counts 1231 policies:

- 1025 read `app.rls_enforce`, of which 1020 have the admit-everything shape;
- 973 read `app.current_user_role`, and the only value they compare it to is `app_super_admin`;
- 13 functions read one of the two settings in their body.

The design counts the rest **from source** at `96a9ecf58` plus the custody working tree. The freeze ruled out running PostgreSQL, so no catalog was rebuilt for this document. Since `92bb29868` the set has gained tables (`20261029g`, `20261029l`, `20261029_vault_documents_restored_from`, the custody certificate in `20261029k`, `review_routes`). The sweep polices each of them with both arms, so the true counts are a handful higher. Slice 0 re-runs the P-70 queries, extended as described below.

### Every writer of either setting

| Writer | What it sets | When |
|---|---|---|
| `server/db/rlsEnforcement.ts` `buildRlsStartupOptions` | `-c app.rls_enforce=on` in the startup packet | every runtime connection when `RLS_ENFORCE=on` |
| `server/db/sessionScope.ts` `applySessionScope`, `switchPinTerms`, `CLEAR_SESSION_SCOPE_SQL`, `RESET_ENFORCEMENT_SQL` | `app.rls_enforce` to the deployment's mode; `app.current_user_role` to `scope.role` | every scope applied and released. Callers: `establishRequestTenantScope.ts`, `lazyRequestDbClient.ts`, `withTenantConnection.ts`, `server/src/routes/stability.router.ts`, `poolInstrumentation.ts` (LOCAL, per statement) |
| `server/db/tenantStore.ts:81` `runWithSystemTenantScope` | role `app_super_admin`, tenant `'0'` | **57 call sites in 39 files** (each classified in §3.6) |
| `server/middleware/establishRequestTenantScope.ts` `systemSessionVars`, `establishRequestSystemScope` | the same, for a request | 9 prefixes in `SYSTEM_SCOPE_PREFIXES` (`/api/admin/master`, `/business`, `/access`, `/scim-tenants`, `/scim-ip-allowlist`, `/audit`, `/api/tenant-export`, `/scim/v2`, `/api/tenants`); 5 direct mounts in `server/bootstrap/register-platform-routes.ts` (`/api/setup`, `/scim/v2`, `/api/admin/scim-tenants`, `/api/admin/audit`, `/api/admin/scim-ip-allowlist`); `server/middleware/staffCrossOrgScope.ts`, used 5 times (`organizations-routes.ts:301`, `:514`; `tenant-config.ts:257`, `:326`, `:373`) |
| Explicit `role: 'app_super_admin'` scopes | the same | `server/routes/sso.ts:34` (the whole pre-tenant SSO router), `public-api.ts:97`, `firecrawl-webhooks.ts:33`, `c2c/actions.ts:805`, `middleware/enterprise-security.ts:820`, `services/memory-consolidation-job.ts:110`, `services/audit/tenant-chain-verdict.ts:80`, `services/audit/compliance-reports/integrity-checks.ts:38` |
| The per-user scope | `app.current_user_role` = the JWT role claim, unfiltered (`establishRequestTenantScope.ts`: `role = String(req.user.role)`) | every authenticated request (see "Found while reading", item 3) |
| Function `SET` clauses (`pg_proc.proconfig`) | `app.current_user_role = 'app_super_admin'` for the body | `public.user_id_for_email`, `public.user_id_for_reset_token` (`migrations/20260928_users_membership_rls.sql:96`, `:114`), `public.invitations_for_member` (`migrations/20260928_invitations_for_member.sql:78`) |
| Function bodies | `set_config('app.current_user_role','app_super_admin', true)`, then restored | `public.actor_name` (`migrations/20260929_actor_names.sql:103`) |
| Migrations | `set_config('app.rls_enforce','off', true)` for a backfill | `migrations/20260923b_artifact_approval_follows_status.sql:92` |
| Scripts | `SET LOCAL app.rls_enforce = 'off'` (`set_config`) | `scripts/db/program-same-org-preflight.mjs:306`; `scripts/db-verify/verify-rls.ts:123`, `:173`, `:203` (on, and `app_super_admin`) |
| Tests | both | 132 test files: 92 real-database (`tests/db/**`, `*.dbtest.ts`), the rest unit and PGlite. Their own copy of the template is `tests/db/harness.ts:34` `tenantIsolationPolicySql` |

### Every reader

**Policies, by creating file and applier.** 55 SQL files contain either setting outside comments:

- 41 on the deploy set (`C2C_MIGRATION_FILES`, 452 entries), most also on the install-fresh overlay;
- 8 on install-fresh only;
- 1 in the authoring subsystem;
- 5 on no applier.

| Kind | Files | How it re-creates on replay |
|---|---|---|
| Generators on the deploy set | `db/migrations/20260801_tenant_isolation_sweep.sql` (last); `20260801_uuid_tenant_isolation_nonpublic.sql` (S only, no P); `20260813_child_table_parent_scoped_rls.sql`; `20260828_fail_closed_insert_withcheck_policies.sql` and `20260828_fail_closed_org_coalesce_policies.sql` (they ALTER non-public policies to add S) | Create when absent, so an amended text reaches no installed database. The sweep's self-heal pass and the two 20260828 files find their targets **by the setting's text** (below). |
| Generators off the set | `migrations/0021_enable_rls_everywhere.sql` (install-fresh step 5, DROP+CREATE per table); `scripts/db/authoring-subsystem.mjs:253–292` (deploy step 3 and install-fresh step 4, DROP+CREATE every run) | 0021 runs once. The authoring subsystem converges on every deploy. |
| Hand-written, deploy set | `082_ectd_submission_agent`, `20260617_precedent_org_isolation`, `20260728_artifacts_table`, `20260728_stability_backing_tables`, `20260728_stability_tenant_isolation`, `20260730_cmc_evidence_tables`, `20260730_cmc_projects_reconstruction`, `20260730_fk_delete_policies_port`, `20260730_licensing_ip_tables`, `20260730_manufacturing_processes_reconstruction`, `20260730_submission_center_tables`, `20260809_source_attribution_draft_candidates`, `20260902_clinical_ops_schema`, `20260902_manufacturing_responses` (S only) (all `db/migrations/`); `20260608_ai_placement_policies`, `20260906_ivdr_history_tenant_isolation`, `20260906b_vault_legal_holds`, `20260923b_artifact_approval_follows_status`, `20260924_license_requests`, `20260924_org_relationships_sponsor_rls` (S only), `20260926_organization_users_own_writes`, `20260926_organizations_own_writes`, `20260928_platform_role_grants_platform_writes`, `20260928_users_membership_rls`, `20261004_user_presence_rls`, `20261014_ana_source_read_receipts`, `20261029d_vault_data_room_seals` (all `migrations/`) | Mixed. DROP+CREATE (10 files) and ALTER-or-CREATE (the D3 2026-09-2x family) reach installed databases by themselves. Create-if-absent files do not. The converge file handles every case from stored text, so no file's replay behaviour has to be relied on. |
| install-fresh only | `migrations/20260612_rls_research_admin.sql`; `migrations/20260727_onboarding_proposal_runs.sql` (compares the role to `'super_admin'`, a tenant role name; replaced on a fresh install by 0021's DROP+CREATE, which is why P-70's catalog shows only `app_super_admin`); `db/migrations/074`–`078_gcc_*` (S only) | The converge file reaches every installed database, as `20261029j` reached 053/069. |
| No applier | `database/policies/rls-policies.sql` (30 references; also queries `pg_policies.polname`, which does not exist); `db/migrations/_legacy/` (4 files) | Amended or deleted, so a future list entry cannot bring them back. The P-70 gate scans `migrations/` and `db/` only, not `database/`. |

**Functions, 18.** 13 are in the P-70 catalog and read a setting in their body:

- `public.actor_name`;
- `expire_orphaned_run_events` and `release_sealed_run_events` (S as a dev-mode skip of their own-scope check);
- `guard_company_document_design`, `guard_company_document_revision`, `guard_company_legal_registry` (DELETE only in the platform scope);
- `organization_users_staff_role_platform_only` (staff roles minted only by the platform scope);
- `purge_tenant_artifact_records`, `purge_tenant_run_events`, `purge_tenant_source_read_receipts`, `purge_tenant_turn_records`, `purge_tenant_vault_records`, `purge_tenant_vault_seals` (the platform-scope precondition).

Three more set the role in `proconfig` and are **missed by P-70's catalog query and by its gate**, which read `prosrc` only: `user_id_for_email`, `user_id_for_reset_token`, `invitations_for_member`.

Two more are in the custody working tree:

- `public.tenant_purge_door_preconditions` (`20261029k:231`, the precondition shared by its five doors);
- `public.review_route_door_scope` (`20261023`, S as a dev-mode skip).

**Code readers.**

- `server/services/audit/chain.ts:708` `connectionIsTenantScoped` decides whether the connection sees every tenant.
- `scripts/db/program-same-org-preflight.mjs:241` detects the enforce arm by text.
- `scripts/db-verify/verify-rls.ts` asserts that `app_super_admin` bypasses isolation.
- `scripts/db/provision-test-db.sh:180` prints the arm as advice.
- `server/db/tenantRls.ts` is runtime DDL that writes the P arm. It has no caller and sits in `unreferenced-modules-baseline.json` and `runtime-ddl-baseline.json`.

**Readers that find policies by the setting's text.**

- The sweep's self-heal pass: `20260801_tenant_isolation_sweep.sql:317`, `strpos(qual, 'app.rls_enforce') > 0`. Its comment says the marker is load-bearing, because it keeps the stricter knowledge-graph `tenant_isolation_policy` from being rebuilt.
- `20260828_fail_closed_insert_withcheck_policies.sql:67` and `20260828_fail_closed_org_coalesce_policies.sql:78`, `!~ 'app\.rls_enforce'`. Their stated idempotency is "once a policy carries app.rls_enforce it no longer matches".
- The preflight above.

### NOLOGIN role and definer door precedents

| Role | Created by | Doors | What its guard admits |
|---|---|---|---|
| `ana_record_purger` | `migrations/20260926_ana_turn_records.sql:248` | `purge_tenant_turn_records`, `purge_tenant_source_read_receipts` | append-only DELETE by `current_user` |
| `artifact_record_purger` | `migrations/20260929_concept2cure_signatures_append_only.sql:160` | `purge_tenant_artifact_records` | the same |
| `ana_run_events_purger` | `migrations/20261008f_ana_run_events.sql:164` | `purge_tenant_run_events`, `release_sealed_run_events`, `expire_orphaned_run_events` (the last two run in the caller's own tenant scope) | the same |
| `audit_archiver` | `db/migrations/20260617_audit_logs_immutability.sql` | `audit_logs_archive_delete` | the only DELETE of `audit_logs` |
| `review_route_writer` | `migrations/20261023_review_routes.sql:371` (P-59, amended in place in the working tree) | `review_route_enlist_member`, `_record_signature`, `_open_step`, `_restep_approver`, `_cancel_member`, `_stamp_act`, `_reassign_member`; helpers `review_route_door_scope`, `review_route_subject_target` | `unified_tasks_route_rows_guard` admits a route row's write when `current_user = 'review_route_writer'`, and its DELETE when `current_user = 'tenant_record_purger'`. The setting `c2c.review_route_writer` is no longer read. **This is the exact P-72 move at the scale of one guard.** |
| `tenant_record_purger` | `migrations/20261029k_tenant_offboarding_custody.sql:175` (working tree) | `purge_tenant_signed_records`, `purge_tenant_lineage_records`, `purge_tenant_ivdr_histories`, `purge_tenant_reg_questions`, `purge_tenant_review_routes`; helpers `tenant_purge_door_preconditions`, `tenant_export_custody_signed`, `tenant_purge_door_custody`, `tenant_purge_door_erase`, `tenant_purge_door_count` | each store's guard admits this role's DELETE |
| (the table owner) | `migrations/20260926_vault_documents_record_immutability.sql:217`, amended in `665873b2d` | `purge_tenant_vault_records` | Owner-only DELETE. **The one door that enters the purged organization's own scope** (it sets `app.current_org_id` to the organization's uuid and restores it), because `vault.documents` is FORCEd and a non-superuser owner is held to its policies (P-66). |

The installer idiom, the same in every file:

- create the role only when absent, `NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION`;
- a non-superuser applier checks `pg_has_role(current_user, role, 'SET')` on PostgreSQL 16+ (`'MEMBER'` before 16), grants itself the role if it can, and otherwise raises with the remedy;
- grant the role only the tables its doors touch;
- `ALTER FUNCTION … OWNER TO` the role, `REVOKE ALL … FROM PUBLIC`, `GRANT EXECUTE … TO app_service`;
- verify the door's shape or raise.

The review of definers: `scripts/db/security-definer-allowlist.json` has 34 entries at HEAD and 46 in the working tree. `scripts/db/provision-app-role.mjs:462` `revokeUnreviewedDefinerExecute` revokes EXECUTE on any unlisted definer on every deploy. `tests/db/security-definer-functions.dbtest.ts` fails on a callable unlisted one. `server/services/tenant/__tests__/tenant-purge-doors-reviewed.test.ts` pins the purge doors.

### Gates

- `ci:session-scoped-rls-bypass` (`scripts/ci/check-session-scoped-rls-bypass.mjs` and its `.selftest.mjs`, in `.husky/pre-push`). It refuses any write of `app.rls_enforce` outside `sessionScope.ts` in server code, and any reader of `app.bypass_rls` or `app.is_admin` in `migrations/`, `db/` and code. **Extended by P-72**: readers and writers of the two settings, `proconfig` included, plus `database/`.
- `ci:tenant-isolation`, `:no-regression`, `:strict`, `:selftest` and `ci:tenant-isolation-justifications`. The gate's cross-tenant file allowlist (27 entries: `server/routes/admin/master-admin.ts`, `business-center.ts`, `access-management.ts`, `scim.ts`, `c2c/actions.ts`, `services/audit/chain.ts`, `chainIntegrityMonitor.ts`, `server/jobs/`, `server/workers/`, …) is the source-side list of platform paths. §3 must account for each entry.
- `ci:tenant-entry-points`, `ci:migration-drop-safety` (with selftest), `ci:migration-set-order`.
- `scripts/db/deploy-smoke-assert.mjs` 1c and 1d.
- `scripts/db/readiness-contract.mjs` (deploy step 6).
- The boot posture `assertRlsCatalogPosture` (`rlsEnforcement.ts`).
- The dbtests:
  - `tests/db/no-session-rls-bypass.dbtest.ts` (P-70, 29 cases; **P-72 extends this file, not a new one**);
  - `isolation-switch-does-not-outlive-request.dbtest.ts`;
  - `security-definer-functions.dbtest.ts`;
  - `rls-tenant-isolation.dbtest.ts`;
  - `two-tenant-application-rls.dbtest.ts`.

### Searches run

**In the tree:**

- terms: `rls_enforce`, `app_super_admin`, `current_user_role`, `super_admin'` in policies, `runWithSystemTenantScope`, `establishRequestSystemScope`, `staffCrossOrgScope`, `SYSTEM_SCOPE_PREFIXES`, `role: 'app_super_admin'`, `isSystemScope`, `connectionIsTenantScoped`;
- function SET clauses: `SET app.`, `proconfig`, `set_config('app.current_user_role'`, `set_config('app.rls_enforce'`;
- roles and memberships: `CREATE ROLE`, `pg_has_role`, `WITH SET`, `INHERIT FALSE`, `SET ROLE` in PGlite tests;
- the purger roles (`purger`, `review_route_writer`, `tenant_record_purger`, `audit_archiver`);
- `PURGE_DOORS`, `PURGE_CHILD_TABLES`, `tenant-full-export`;
- marker readers: `strpos`, `~`, `!~` and `LIKE` near the settings;
- role and database defaults: `ALTER ROLE … SET`, `PGOPTIONS`, `-c app.`;
- the PostgreSQL versions in `terraform/` and `.github/workflows/`.

These were run over `migrations/`, `db/` (including `_legacy`), `database/`, `server/`, `scripts/`, `shared/`, `tests/`, `.github/` and `terraform/`, and over the custody working tree.

**In history:** `git log --all --diff-filter=D` on `*rlsBypass*`, `*bypass*`, `*session-scoped*`, `*platform*scope*`, `*tenantRls*` and `*sessionScope*`. The only deletion found is P-70's `rlsBypassSession.ts` and its dbtest. History in this clone starts on 2026-10-22.

**Nothing found that this design must not rebuild:**

- the platform-scope role does not exist;
- `app.current_user_role` has no reader outside the arm and the 18 functions;
- no gate reads `proconfig`;
- no file uses `GRANT … WITH SET` or `WITH INHERIT`.

### Found while reading (pre-existing, reported, not fixed here)

1. **Production is pinned to PostgreSQL 15, not 16.** Evidence: `terraform/environments/production/main.tf:61` and `staging/main.tf:63`, `rds_engine_version = "15"`; CI's database services use `pgvector/pgvector:pg15` (`.github/workflows/ci.yml:1198`, `:1303`, `:1454`, `:1650`). Some migration comments speak of "the RDS master user, PG16" (`db/migrations/20260617_audit_logs_immutability.sql:72`). Nothing has been applied yet (D1 is owed), so the Terraform pin is what would be created. P-70 measured on 16.15. PGlite 0.5.3 embeds PostgreSQL 18.3. `GRANT … WITH SET FALSE`, `WITH INHERIT` and `pg_has_role(…, 'SET')` exist only from 16. The design below does not depend on them.
2. **Function SET clauses are invisible to P-70's catalog query and gate.** Three definers enter the platform scope through `proconfig` (above). A future `SET app.rls_enforce = 'off'` on a function would also pass both.
3. **A JWT role claim of `app_super_admin` is the platform scope at the database.** The per-user scope copies the claim unfiltered. `organization_users_staff_role_platform_only` refuses to mint that membership role outside the platform scope. Whether any other source can mint the claim (`users.role`, SSO/SCIM mapping) is not established here. P-72 closes it by making the setting meaningless, so slice 6 adds the case to the dbtest rather than tracing every source.
4. **By reading, the retention sweep finds no Vault document in production.** `server/jobs/retentionCron.ts:212` runs in the system scope. `vault.documents` decides through `core.can_access_program`, which has no platform arm and is false for tenant `'0'`. Not measured. Slice 0 measures it. If confirmed, the Vault's retention has never run on a production-shaped database.
5. **Ten of the eleven tenant purge doors, and `purgeTenant`'s plain DELETE loop, rely on the session's P arm.** The loop covers 64 named tables plus `PURGE_REFERRER_TABLES` (`server/services/tenant/tenant-offboarding.ts`). The doors delete from tenant-policied tables as a non-owner role (the purgers, `tenant_record_purger`), or as a non-superuser owner on FORCEd tables. Only `purge_tenant_vault_records` enters the organization's own scope. Remove P first and the purge erases nothing from those tables while reporting success.
6. **The two 20260828 files would put the S arm back on every deploy.** Once the converge removes it, their `!~ 'app\.rls_enforce'` test matches again. The sweep's self-heal would stop healing (its marker would be gone). Both are amended in place in the policy slice.
7. **The whole SSO router runs in the system scope** (`server/routes/sso.ts:30`), not just its tenant lookup. **The SIEM export** (`/api/admin/audit`, system-scoped) admits tenant `admin` and `compliance_officer` (`server/routes/admin/audit-siem.ts:42`). It filters by organization in its SQL only.
8. **Rows for organization 0 are not platform-only.** `scheduled_job_claims` and `session_activity` keep platform rows as organization 0. Any tenant-`'0'` scope reaches them through the **tenant** arm, the pre-auth scope included. P-72 does not change this.
9. `.husky/pre-push:365` still advises `SET LOCAL app.bypass_rls` and names the deleted `rlsBypassSession.ts`.
10. `database/policies/rls-policies.sql` and `server/db/tenantRls.ts` are on no applier and have no caller.

## The design

### 1. Two roles

| Role | Attributes | Who holds it | What it means |
|---|---|---|---|
| `c2c_platform_scope` | NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION | It owns the platform doors (§3). The applier holds membership so that it can hand functions to it (`ALTER FUNCTION … OWNER TO` needs SET on 16+ and membership on 15). Nobody else. | `current_user` is this role only inside a door it owns, or after `SET ROLE` by a superuser or the applier. |
| `c2c_rls_exempt_login` | the same | The applier's login (the RDS master in production, `postgres` in CI, the owner on a developer's database), granted by install-fresh and deploy-migrate. Never the runtime role. | A session whose login role is a member, acting as itself, sees what its policies would show an unenforced session today. |

Both are created by the idempotent block the purger roles use, in the file that first needs each. Roles are cluster-wide, and `pg_dump` does not carry them. A restore into a new cluster therefore lacks both. The predicates below then fail closed (no platform rows, no exemption) instead of raising.

### 2. The predicates

```
P'  (CURRENT_USER = 'c2c_platform_scope'::name)
S'  ((CURRENT_USER = SESSION_USER)
     AND pg_has_role(SESSION_USER, to_regrole('c2c_rls_exempt_login'), 'MEMBER'))
```

The converge file, the assertion and the self-heal marker recognize them by role name (`c2c_platform_scope`, `c2c_rls_exempt_login`), not by the exact text `pg_get_expr` deparses them to (which adds casts). Slice 6 records the deparsed forms.

**Why `CURRENT_USER =`, and not `pg_has_role(current_user, 'c2c_platform_scope', …)`:**

| Candidate | What goes wrong |
|---|---|
| `pg_has_role(current_user, r, 'MEMBER')` | Transitive, and blind to INHERIT and SET. The applier must be a member to own doors, so every SECURITY DEFINER function the applier owns would read across tenants. 27 of the 46 allowlisted definers are owned by no purger or door role, so by the role that created them, the owner (counted from source; slice 0 reads `proowner`). Among them are `identity.can_*`, `core.can_*`, `identity.current_org_id`, `actor_name`, `invitations_for_member`, `purge_tenant_vault_records` and the four audit trigger functions. On RDS they are tenant-scoped today, because FORCE holds the non-superuser owner to the session's tenant. This widens them. |
| `pg_has_role(current_user, r, 'USAGE')` | Follows INHERIT chains. A default `GRANT` inherits, and so does the existing applier self-grant (`GRANT tenant_record_purger TO current_user`). One careless `GRANT c2c_platform_scope TO app_service` would open every table. `WITH INHERIT FALSE` does not exist on 15. |
| Either `pg_has_role` form | Raises 42704 when the role is absent: after a restore without globals, every query on about 1000 tables fails. |
| **`CURRENT_USER = 'c2c_platform_scope'`** | Who you are, not what you belong to. Membership options never make it true; only ownership of the running definer, or `SET ROLE`, does. P-72's "not granted, or granted `WITH SET FALSE`" holds for it by construction. A `WITH SET FALSE, INHERIT TRUE` grant (16+) gives table privileges and never the arm. It works the same on 15, 16 and PGlite's 18. It costs a name comparison. A missing role is just false. |

**Why S' exists, and why it is written this way:**

- *Migrations.* The deploy applier connects with no settings, and every backfill on a FORCEd table passes S today. `20260923b` even sets it `off` explicitly, "so a database-level default cannot make the backfill match nothing, silently". The deploy set holds about 175 UPDATE, 25 DELETE and 16 INSERT…SELECT statements in 58 files over 43 tables (counted from source at `96a9ecf58`). On RDS the applier is a non-superuser CREATEROLE master, and FORCE holds it to every policy. Without S', each of those statements would match nothing on a FORCEd table, and the deploy would be green. CI cannot show it: its applier is `postgres`, a superuser. It is the same blind spot `665873b2d` found in the Vault door.
- *`CURRENT_USER = SESSION_USER`.* Inside any SECURITY DEFINER function called by the runtime role, `session_user` is `app_service`, so an owner-owned function is not exempt. That matches production today. `SET ROLE` to another role drops the exemption. In PGlite, `session_user` is the bootstrap superuser and the suites `SET ROLE app_service`, which correctly leaves them enforced.
- *`to_regrole`.* A missing role gives NULL, the strict function returns NULL, and the arm is false.
- The runtime role cannot become exempt. `session_user` cannot change without superuser (`SET SESSION AUTHORIZATION`), and the deploy and the boot refuse a runtime login that is a member by any path (§5).

**After this**, `RLS_ENFORCE` no longer changes what the database admits. It keeps two meanings:

- the boot contract: production requires `on`, and the boot then refuses an exempt runtime login;
- the pool instrumentation's refusal of unscoped statements.

`switchPinTerms`, `RESET_ENFORCEMENT_SQL` and the startup option are deleted with their last reader (slice 6).

### 3. Each platform path, and where it goes

There are three destinations, in order of preference:

- **(I) Infrastructure scope.** `runWithSystemTenantScope` keeps its name and its instrumentation meaning (tenant `'0'`, `source: 'job'`). It no longer sends a role to the database. Use it when the path reads no tenant's rows: catalog probes, `organizations` (whose read policy is `(true)`, `migrations/20260926_organizations_own_writes.sql:71`), `api_keys`, `stripe_events`, `billing_*` (all on `RLS_ALLOWLIST`), and organization-0 rows.
- **(O) The named organization's own scope.** The server sets the tenant selector to that organization after its own platform check (`requirePlatformAdmin`, or the router's staff test). This is the P-66 pattern. The tenant selector stays server-pinned (P-72, out of scope). Use it when the path acts on one tenant.
- **(D) A platform door.** SECURITY DEFINER, owned by `c2c_platform_scope`, `search_path = pg_catalog, public`, no caller-supplied SQL text or table names. It returns only the columns its caller shows, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO app_service`, and has an allowlist entry. A door that writes takes `p_actor`, refuses unless `p_actor` holds an active `platform_role_grants` row, and writes the chained audit row itself. Use it only when the path reads across tenants or writes rows the platform owns.

What the database can and cannot check: that a request is really a platform administrator's stays the server's job (`requirePlatformAdmin`), as today. What P-72 changes is that the runtime role, however it is driven, reaches other tenants only through these doors. Each door does one stated thing, instead of one SET opening about 1000 tables.

#### 3.1 Deploy, migrations, seeds, the RLS sweep itself

- **Deploy and migrations:** the applier's login is exempt (S'). The explicit `set_config('app.rls_enforce','off')` in `20260923b` is deleted, with a dated header.
- **The sweep and the other generators** run as the applier and need no runtime scope. Their templates are amended (§4).
- **Seeds:** reference data is seeded in migrations only (Rule 1 corollary). The boot-time writers (`ana-capability-registry:seed` and `:backfill-governance`, `template-seeds:seed-if-missing`, `feature-toggle:initialize`, `audit:initialize`) move to (I) when their tables carry no tenant policy. Slice 0 measures this. A writer whose table is policied moves into the migration set, not behind a door.
- **Laptop seeds** (`scripts/seed-*`) run as the owner, which is exempt.

#### 3.2 The tenant purge (custody lane, P-58/P-59)

Destination (O). `purgeTenant` opens the purged organization's own scope (tenant id and org uuid, transaction-local) for its whole transaction. Its DELETE loop over `PURGE_CHILD_TABLES` is then admitted by the tables' tenant arm. The `organizations` row's own-update policy already admits its own scope.

Every door keeps its owner and changes as follows:

| Door (owner) | Change |
|---|---|
| `purge_tenant_turn_records`, `purge_tenant_source_read_receipts` (`ana_record_purger`); `purge_tenant_run_events` (`ana_run_events_purger`); `purge_tenant_artifact_records` (`artifact_record_purger`); `purge_tenant_vault_seals` (table owner); `purge_tenant_signed_records`, `purge_tenant_lineage_records`, `purge_tenant_ivdr_histories`, `purge_tenant_reg_questions`, `purge_tenant_review_routes` (`tenant_record_purger`) | Enters the purged organization's own scope, transaction-local, and restores the caller's, as `purge_tenant_vault_records` does. Today the session's P arm admits these DELETEs (found 5). |
| Their shared precondition: the bodies in `20260926`, `20260929`, `20261008f`, `20261014`, `20261029d`, and `tenant_purge_door_preconditions` in `20261029k` | The two-settings test (`rls_enforce = 'on' AND role IS DISTINCT FROM 'app_super_admin'` → refuse) is deleted. What remains is database state: `pending_deletion`, no active legal hold, and custody when a held record is erased (P-58). To keep the precondition from weakening, the lifecycle columns (`status`, `purge_eligible_at`, the deletion request fields) change only through two platform doors, `platform_request_tenant_deletion(p_org, p_actor, p_reason, p_retention_days)` and `platform_cancel_tenant_deletion(p_org, p_actor)`, called by `tenants-simple.ts` DELETE `/:id` and POST `/:id/cancel-deletion`. The organizations-row guard in `migrations/20260925_organizations_tenant_key_immutable.sql` is extended in place to refuse any other change to them. The applier's exempt session is still admitted for migrations. Today the own-update policy lets a tenant scope set its own status. |
| `guard_company_document_design`, `_revision`, `guard_company_legal_registry` | DELETE admitted when the organization is `pending_deletion` with no active hold, which their second test already reads. The settings test is deleted. |
| `release_sealed_run_events`, `expire_orphaned_run_events`, `review_route_door_scope` | The dev-mode skip (`rls_enforce = 'on' AND …`) is deleted. The own-scope test always applies. |

Allowlist reasons for the changed doors: "refuses unless the session is in the platform scope" becomes "erases inside the purged organization's own scope; refuses unless pending_deletion (settable only by `platform_request_tenant_deletion`), no active hold, and custody".

#### 3.3 The tenant export

`/api/tenant-export` moves to destination (O). `exportTenantFull` and `exportTenantData` already run in one REPEATABLE READ snapshot for one organization (`company-export-snapshot.ts`). The public tables are then admitted by the tenant arm. The Vault reads go through `core.can_access_program`, which in an organization scope without a project member returns no row. That is item 3 of `docs/evidence/D6-TENANT-EXPORT-GAPS/2026-10-29/README.md`, and by reading it holds in the system scope too. Slice 0 measures whether the export contains the Vault today. If it does not, the Vault export needs either a door, `platform_export_vault_rows(p_org)` (D, keys and columns as `VAULT_DOCUMENT_TENANCY`), or a member-free organization arm on the Vault policies. That is founder decision F5.

#### 3.4 The platform administration console

| Route (file) | Tables it reads or writes | Destination |
|---|---|---|
| `/api/admin/master` lists (`master-admin.ts`, 16 handlers; `master-licensing.ts` 9; `licensing-trials.ts` 4; `licensing-history.ts` 1) | `organizations`, `organization_users`, `users`, `module_subscriptions`, `usage_records`, `billing_alerts`, `connector_credentials`, `deep_research_jobs`, `feature_toggles`, `available_modules`, `platform_settings`, `audit_logs` | Reads across organizations: `platform_console_organizations()` (status, plan, seats, member count, purge state), `platform_console_usage(p_from, p_to)`, `platform_console_module_subscriptions(p_org)`, `platform_console_audit(p_org, p_after, p_limit)`, `platform_console_find_users(p_query, p_limit)` (no credential columns). Acting on one organization (grant a module, start a trial, edit settings): (O), in that organization's scope. |
| `/api/admin/business` (`business-center.ts` 6, `business/rate-cards.ts` 4) | `platform_cost_rates`, `tier_pricing`, `platform_role_grants`, `usage_records`, `users` | `platform_console_usage`; platform-owned rate rows through `platform_rate_card_put(...)` if those tables are policied (slice 0), else (I) |
| `/api/admin/access` (`access-management.ts` 3) | `platform_role_grants` (writes are P-only, `20260928_platform_role_grants_platform_writes.sql`) | `platform_role_grant_put(p_user, p_role, p_actor, p_reason)`, `platform_role_grant_revoke(p_grant, p_actor, p_reason)` |
| `/api/admin/master` enterprise and access requests (`master-enterprise-requests.ts`, `master-access-requests.ts`) | `license_requests` (P-only access, `20260924_license_requests.sql:88`) | `platform_license_requests()`, `platform_license_request_decide(p_id, p_decision, p_actor, p_reason)` |
| `/api/admin/audit` (`audit-siem.ts` 2) | `audit_events` | A tenant `admin` or `compliance_officer`: (O), their own organization (found 7). A platform administrator: `platform_siem_events(p_org, p_after, p_limit)`. |
| `/api/admin/scim-tenants`, `/api/admin/scim-ip-allowlist`, `/scim/v2` (`scim-tenants.ts` 5, `scim-ip-allowlist.ts` 4, `scim.ts` 12) | `scim_tenants`, `scim_ip_allowlist` (integer `organization_id`), `users`, `organization_users`, `audit_events` | SCIM provisioning acts on the SCIM tenant's one organization: (O) after the bearer token resolves it. The token resolves through `scim_tenant_for_token(p_token_hash)` (D, returns organization id and status). The two admin lists use (D) `platform_scim_tenants()`; writes use (O) on the named organization. |
| `/api/tenants` (`tenants-simple.ts` 7) | `organizations`, `organization_users`, `users` | Create and plan-limit counts: (I), since `organizations` reads are open. Membership counts across organizations: `platform_console_organizations()`. Deletion request and cancel: the two lifecycle doors (§3.2). Purge: §3.2. |
| `/api/setup` (`setup.ts` 2) | `users` (first administrator) | (I) plus `platform_setup_first_admin(...)` only if `users` refuses the pre-tenant insert (slice 0) |
| Staff cross-organization edits (`staffCrossOrgScope`: `organizations-routes.ts` PATCH `/:id/profile`, `/:id/settings`; `tenant-config.ts` three `super_admin` branches) | the named organization's row and configuration | (O): open the **named** organization's scope instead of the system scope. No door. |
| `c2c/actions.ts:805` verify-chain; `audit/tenant-chain-verdict.ts:80`; `audit/compliance-reports/integrity-checks.ts:38`; `audit/chain.ts` (cross-tenant walk); `chainIntegrityMonitor.ts:318`; `jobs/auditChainIntegritySweep.ts:595`; `securityHealth.ts` `checkAuditChainIntegrity` | `audit_logs` (one sha256 chain across tenants, `chain_seq`), `audit_events` (per-organization sequences), `audit.tamper_proof_log` | `platform_audit_chain_links(p_after_seq, p_limit)` (D, the chain columns verification hashes). `audit_events` is verified per organization in (O). `connectionIsTenantScoped` is deleted; the walk is complete because the door is. |

#### 3.5 Pre-authentication lookups

| Path | Destination |
|---|---|
| `user_id_for_email`, `user_id_for_reset_token` (callers: `server/services/auth/pre-auth-account.ts`, `server/db/tenantStore.ts`), `invitations_for_member` (callers: `server/services/tenant/invitation-consent.ts`, `verified-org-scope.ts`, `server/routes/tenant-users.ts`) | (D), as they are, re-owned by `c2c_platform_scope` with the `SET` clause deleted and SELECT granted on `users`, `organization_users`, `organization_invitations`. Signatures unchanged, so their allowlist keys stand; their reasons are updated. **Login depends on this**: after the flip, a function owned by a non-superuser owner no longer reads `users` across tenants. |
| `actor_name` (34 server files call it in SQL: the audit ledger and the document, Vault, project and MDX routes) | (D), re-owned. `set_config` and the dev skip are deleted; its tenant tests stay. |
| SSO pre-tenant router (`sso.ts:30`) | The router moves to the pre-auth scope (no role). Resolving an identity provider to an organization goes through `sso_connection_for_issuer(p_issuer)` (D) if its table is policied (slice 0). Each callback then acts in the resolved organization's scope (O). |
| API-key resolution (`public-api.ts:97`, `enterprise-security.ts:820`) | (I): `api_keys` carries no policy (`RLS_ALLOWLIST`) |

#### 3.6 Background work: the 57 call sites

| Class | Call sites | Destination |
|---|---|---|
| Catalog and readiness probes | `startup/services.ts:108`, `:135`, `:146`; `startup/audit-enforcement.ts:215`; `startup/authoringAuthorizationInvariant.ts:42`; `index.ts:170`; `lib/startup-invariants.ts:144`; `auditService.ts:176`; `embedding-corpus-policy.ts:380`, `:399`; `ai-gateway/audit.ts:163`; `ai-gateway/embeddings/embedding-provider.ts:431` (no SQL) | (I) |
| Enumerate organizations, then work per organization (already the pattern) | `automation/scheduled-jobs.ts:492`, `digest/digest-heartbeat.ts:127`, `sentinel/scheduler.ts:51`, `jobs/vaultProcessingSweep.ts:230`, `jobs/driftSentinelSweep.ts:54` | (I) for the list (`organizations` is open), (O) per organization (already `runWithOrgJobScope` / `runWithTenantScope`) |
| One organization, wrongly in the system scope | `digest-heartbeat.ts:141` (`WHERE organization_id = $1`), `intelligence/pattern-registry.ts:727` (takes `organizationId`), `firecrawl-webhooks.ts:33` (insert with `tenant_id`), `enterprise-security.ts:987` (audit for `user.organizationId`), `routes/billing.ts:328` (the Stripe event names one organization), `clinical-regulatory-evidence/data-room-processing.ts:386` and `vault/document-chunking-backfill.service.ts:258` (one organization's uuid, from `organizations`, which is open) | (O); (I) where only `organizations` is read |
| Cross-tenant sweeps whose work is per organization | `jobs/taskDueSweep.ts:155` (`unified_tasks`), `jobs/retentionCron.ts:212` (Vault; found 4), `memory-consolidation-job.ts:110`, `ana/submission-chat-sweep-scheduler.ts:57`, `jobs/corpusIngestionSweep.ts:99`, `jobs/externalIntelligenceSweep.ts:51`, `jobs/regulatoryHorizonScan.ts:78` | The open organization list and a per-organization loop in (O). The last three move to (I) if their tables are reference data with no tenant key (slice 0). |
| Queues and coordination across tenants | `workers/ivdr-pack-worker.ts:695`, `jobs/csrQueueRecovery.ts:37`, `report-os/scheduling/worker.ts:119`, `ana/run-control.ts:1359`, `:1376`, `:1494`, `:1533`, `:1588`, `:1599`, `:1650`, `:1783`, `:1846`, `:1890` | Keys-only doors that return `(organization_id, id)` and nothing else; the work then runs in (O): `platform_claim_ivdr_pack_job(p_worker)`, `platform_stalled_csr_jobs(p_before)`, `platform_due_report_subscriptions(p_now)`, `platform_run_events_release_candidates(p_limit)` and `platform_run_events_expiry_orgs()` (then the existing `release_sealed_run_events` / `expire_orphaned_run_events` in (O)), `platform_run_control_heartbeat(p_instance, p_run_ids, p_seqs)` and `platform_run_control_reap(p_instance, p_before)` (they touch only the control columns of runs that instance owns), and `platform_run_control_state(p_run_ids)` for the poll and the notify refresh (`:1846`, `:1890`; it returns `id, status, stopped_reason, stopped_detail` only). `pg_notify` and LISTEN (`:1376`, `:1494`, `:1783`) need no table: (I). |
| Platform-owned rows | `db/scheduledOnce.ts:74`, `:219` (`scheduled_job_claims`, organization 0); `session-inactivity.ts:226` (`session_activity`, organization 0); `ai-gateway/audit.ts:368` (`ai.gateway_audit_log`, varchar organization key); `featureToggleService.ts:59`, `:82`, `:327` | (I). Organization-0 rows are admitted by the tenant arm (found 8). `feature_toggles` has no tenant column. The gateway ledger moves to (I) or (D) by its measured posture. |
| The request lever | `establishRequestTenantScope.ts:293` | Deleted with `SYSTEM_SCOPE_PREFIXES`: each prefix's router takes its destination from §3.4. |

#### 3.7 Operator scripts, dev, CI and tests

- `scripts/db/program-same-org-preflight.mjs` runs as the owner, which is exempt. Its `set_config('app.rls_enforce','off')` is deleted. Its "refused" branch (P-70) stays for a non-exempt role. On a managed database it can now read `vault.documents` again, which closes P-70's item 5.
- `scripts/db-verify/verify-rls.ts` is rewritten to assert the new semantics.
- `provision-test-db.sh` gets new advice.
- `tests/db/harness.ts` stops carrying its own copy of the template: it imports the shape from the sweep's constants or matches the deparsed text.

### 4. The policy rewrite

**4.1 In place, per creating file (Rule 1, each with a dated header naming P-72 and this document).**

- **Every policy template.** Replace the S arm with S' and the P arm with P', each where it was and only where it was. A policy that had only S gets only S'; one that had only P gets only P'. Policies thereby keep the same shape and differ only in what can satisfy those two disjuncts. This covers:
  - the generators: 0021, the sweep's two `CREATE POLICY` texts, the uuid step, the child scope, and the authoring subsystem's three templates;
  - the hand-written creators in §"What already exists";
  - the 074–078 gcc files;
  - the five no-applier files (or delete them; see slice 7).
- **Comparisons with tenant role names.** `20260727_onboarding_proposal_runs.sql`'s `= 'super_admin'` arm is deleted, not converted.
- **The marker readers.** The sweep's self-heal identifies its template by P' (`strpos(qual, 'c2c_platform_scope')`), not by `app.rls_enforce`. The two 20260828 files test for S' (`!~ 'c2c_rls_exempt_login'`) and emit S'. Without this they re-add S on every deploy (found 6).
- **The 18 functions.** Change each as §3 says, in its creating file.

**The rewrite runs in two passes, so every deploy stays green.** Slice 1 adds P' and S' beside P and S. Slice 6 removes P and S, once every path that relied on them has moved. The templates are amended in place at each pass. The converge file carries both passes, each conditional on the stored text, so a database at any version converges.

**4.2 Installed databases.** Add `migrations/2026MMDD_platform_scope_role.sql`, in the deploy set after the custody file (`20261029k`) and before `UUID_TENANT_ISOLATION_NONPUBLIC`, which is where `20261029j_no_session_rls_bypass.sql` sits. In order, it:

1. Creates both roles if absent, verifies their attributes, and grants the applier membership in `c2c_platform_scope` (SET on 16+, membership on 15) and in `c2c_rls_exempt_login`. The applier idiom applies, with the remedy in the HINT.
2. Rewrites, for every policy whose stored expression contains a known S or P form, its USING and WITH CHECK from `pg_get_expr` with those disjuncts extended by S' and P' (slice 1), and later replaced by them (slice 6), under one fixed `search_path`, so that a deparsed name resolves to the same object. Then it runs `ALTER POLICY`. It is conditional on the stored text, so a second run changes nothing.

   The forms, exactly:
   - `(NULLIF(current_setting('app.rls_enforce'::text, true), ''::text) IS DISTINCT FROM 'on'::text)`;
   - `(COALESCE(current_setting('app.rls_enforce'::text, true), 'off'::text) <> 'on'::text)`;
   - `(current_setting('app.current_user_role'::text, true) = 'app_super_admin'::text)`;
   - `(current_setting('app.current_user_role'::text, true) = 'super_admin'::text)`, which is deleted, not converted.

   The ALTER keeps the policy's oid, as P-70's replay proof required.
3. Re-creates each function from `pg_get_functiondef` minus its settings test, as `20261029j` did for the identity helpers, for the bodies whose creators are create-if-absent or install-fresh-only. A body the edit cannot clean fails the deploy.
4. Runs the assertion (4.3), from slice 6 on.

**4.3 The assertion.** The deploy fails, naming each offender, when any of these holds:

- a policy's USING or WITH CHECK matches `app\.(rls_enforce|current_user_role)`;
- a function outside `pg_catalog` and `information_schema`, in any language but C, matches it in `prosrc`, **or in `array_to_string(proconfig, ',')`**;
- `pg_db_role_setting` sets either for any role or database;
- `c2c_platform_scope` or `c2c_rls_exempt_login` has any attribute beyond NOLOGIN NOINHERIT;
- any LOGIN role other than the applier and superusers is a member of `c2c_platform_scope` by any path (`pg_auth_members`, recursively);
- any function owned by `c2c_platform_scope` is not SECURITY DEFINER, lacks a pinned `search_path`, or is executable by PUBLIC.

The same checks are repeated in `scripts/db/readiness-contract.mjs` (deploy step 6, after the isolation tail and after the grants of step 5), with one more: the runtime role named by `RUNTIME_DB_ROLE` / `APP_DATABASE_URL` is a member of neither role by any path. The tail runs after the converge file, so the readiness contract is the check that sees the finished database.

**4.4 The gate.** `ci:session-scoped-rls-bypass` gains these rules:

- a reader or a writer of `app.rls_enforce` or `app.current_user_role` in any `.sql` under `migrations/`, `db/` and `database/`, `SET` clauses of `CREATE FUNCTION` included;
- the same in server, scripts and shared code outside tests, with one allowed writer of `app.current_user_role` (none, once slice 6 lands);
- any `GRANT c2c_platform_scope` or `GRANT c2c_rls_exempt_login` outside the converge file and the applier idiom.

The baseline stays empty.

### 5. Role grants

| Role | Relation to `c2c_platform_scope` | Relation to `c2c_rls_exempt_login` |
|---|---|---|
| `app_service` (runtime; `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION`, `provision-app-role.mjs:379`) | None. EXECUTE on each door only (granted in the door's file; kept by `revokeUnreviewedDefinerExecute` because the door is listed). | None. The boot (`assertRlsCatalogPosture`) and readiness refuse membership by any path. |
| The applier: RDS master in production (non-superuser, CREATEROLE, in `rds_superuser`); `postgres` in CI; the owner locally | Member, for ownership hand-off. On 16+, created as the CREATEROLE creator with ADMIN; it grants itself SET. On 15, plain membership, which also allows SET ROLE. It already owns every table, so this adds nothing it could not already do. | Member (its own sessions are exempt) |
| Superusers | Implicitly everything; they bypass RLS anyway | The same |
| The purger roles, `review_route_writer`, `audit_archiver` | None. Their doors enter the organization's own scope (§3.2) or already run in the caller's tenant scope. | None |

**PostgreSQL 16 semantics, for the record.** `GRANT r TO u WITH INHERIT FALSE, SET FALSE` makes `u` a member that neither inherits `r`'s privileges nor can `SET ROLE r`. With P', neither option matters: only being `r` does. NOINHERIT on `c2c_platform_scope` means it does not inherit the privileges of roles granted *to* it. None are, so it holds exactly the table privileges its doors' files grant.

**CI.** The real-database lane (`ci.yml:1575`) keeps `postgres` as the applier and `app_service` as the runtime.

- The 92 dbtest files that set either setting are reviewed in slice 6. A test that used the settings to see everything uses the owner connection. A test that asserted shadow behaviour asserts S' (an exempt login sees all; `app_service` with any setting sees its tenant).
- A second, non-superuser applier lane is added: an RDS-shaped CREATEROLE owner that is not a superuser, the shape P0-8a (`docs/evidence/D6/2026-09-24-p0/P0-8a/`) used by hand. Without it, every owner-owned door and every backfill passes in CI whatever the predicates say.
- Both lanes run on PostgreSQL 15 (CI's image, production's major). The evidence also records a 16 run.

**Local development.**

- Single-role (runtime = owner): the owner is exempt, so behaviour is as today.
- Split-role (`APP_DATABASE_URL` = `app_service`): enforced always, whatever `RLS_ENFORCE` says. That is production's behaviour, and the comment in `establishRequestTenantScope.ts` already calls the split "the worst possible split for a control whose whole job is to hold in production".
- Dev-auth (`server/auth/dev-auth-policy.ts`) is unaffected; it decides who a request is, not what the database admits.

**PGlite (0.5.3, PostgreSQL 18.3).** Roles, `SET ROLE`, `GRANT` and `ALTER FUNCTION … OWNER TO` work. Ten PGlite files already create or switch roles. What PGlite cannot do is log in as another role: `session_user` is always the bootstrap superuser. So:

- a suite that `SET ROLE app_service` is enforced under S', and the 7 PGlite files that set either setting to see everything change to `RESET ROLE`;
- a suite modelling a platform door creates `c2c_platform_scope` and the door as in production and calls it as `app_service`, or uses `SET ROLE c2c_platform_scope` for a direct case;
- S' itself is tested on real PostgreSQL only, where a non-superuser login exists.

### 6. Order of work and risk

Each slice leaves every deploy green. The arms are replaced only after every path that relied on P has moved, so no slice can make a platform path silently return empty in production. Every slice shows its check failing on the case it exists for, then passing. Mutations run in a scratch copy of the tree, as P-70's harness did (`mutate.py.txt`).

| Slice | What | Can break | Red → green, mutations |
|---|---|---|---|
| **0. Measure** | Re-run P-70's queries on a PostgreSQL 15 database from blank and on an upgraded one, extended with `proconfig`, `pg_db_role_setting`, the role comparisons, and the platform-only policies (whose admitting arms are only S and P). For each of the 57 call sites, routes and doors, record the tables touched and each table's RLS, FORCE and arms. Run each platform path on a two-tenant database as `app_service` with today's P arm, and again with P removed in a scratch copy. The diff is the list of paths that depend on it. Also measure found 4 (retention) and the Vault export (§3.3). | Nothing: no tree change | The diff file is the evidence. A path whose answer does not change without P needs no door. |
| **1. Roles, new arms and doors; nothing removed** | Both roles. P' and S' are added **beside** P and S in every template (in place) and, through the converge file, in every stored policy. This widens nothing: no runtime session is `c2c_platform_scope` or exempt. Then the `platform_*` doors of §3 with allowlist entries, and the four identity functions re-owned by `c2c_platform_scope` with their `SET` and `set_config` removed; they now pass P'. | Login (re-owned `user_id_for_email`); a policy the add pass cannot parse (fails the deploy, by design) | dbtest: the doors answer across tenants as `app_service` on the non-superuser-owner lane. Mutation: a door owned by the table owner instead returns nothing on that lane (killed). The allowlist dbtest fails on an unlisted door (killed). |
| **2. One-organization paths to (O)** | The purge transaction and its eleven doors (custody lane); the lifecycle doors and the organizations guard; the export; staff cross-organization edits; webhooks and single-organization jobs | Purge erasing nothing, export missing tables | `tenant-purge*.dbtest.ts`, `tenant-offboarding-custody.dbtest.ts`, `tenant-export-*`: run them with P removed in a scratch copy. Red before the move, green after. Mutation: drop one door's scope entry, and a row of B or of the purged organization survives (killed). |
| **3. Jobs** | §3.6: (I), per organization, keys doors | A sweep processing nothing | Each sweep's dbtest on two tenants with P removed: red before, green after. Count assertions, never "no error". |
| **4. Console and pre-auth** | §3.4–3.5 | Console lists empty; login | Route dbtests as `app_service` with P removed. Login and reset run end to end on the non-superuser-owner lane. |
| **5. Function bodies** | The 18 functions stop reading the settings | Doors refusing in dev | `no-session-rls-bypass.dbtest.ts` cases per function: with `app.current_user_role = 'app_super_admin'` and `app.rls_enforce = ''`, each refuses or scopes exactly as with neither set |
| **6. The flip** | P and S removed from templates and hand-written creators (in place) and, through the converge file's second pass, from every stored policy; the assertion in the file and in readiness; the gate; `sessionScope.ts` stops writing `app.rls_enforce` and `app.current_user_role`; the startup option goes | Any path missed by slices 2–4 | Red at the base: in tenant A's scope, `SET app.current_user_role = 'app_super_admin'` reads and updates B's rows on a swept table, `vault.legal_holds` and `organizations`; `SET app.rls_enforce = 'off'` the same; a JWT role claim of `app_super_admin` the same (found 3). Green: none lifts anything; the converge applied three times keeps oid and row version; the non-superuser applier's backfills still match. Mutations: P' as `pg_has_role(…,'MEMBER')`, and an owner-owned definer reads B on the RDS-shaped lane; S' without `CURRENT_USER = SESSION_USER`, and a PGlite `SET ROLE app_service` reads B; `GRANT c2c_platform_scope TO app_service` (and on 16 `WITH SET FALSE, INHERIT TRUE`, shown passing as the control); `proconfig` SET reintroduced; a 20260828 marker unamended (the second deploy fails the assertion); the sweep's heal marker unamended (a damaged canonical policy is not healed); `ALTER ROLE app_service SET app.rls_enforce = 'off'` (assertion) |
| **7. Cleanup** | The TS label `app_super_admin` on scopes becomes a scope kind; `database/policies/rls-policies.sql` and `server/db/tenantRls.ts` deleted (no applier, no caller; history search by path in the commit); `.husky/pre-push` advice; the security lane's `C2C_TENANT_ISOLATION_PROOF.md` and `PEN_TEST_SCOPE_2026-09-26.md` handed the new switch list | Nothing at runtime | `ci:unreferenced-modules` and `ci:runtime-ddl` baselines shrink |

**What a regulated customer gets**:

- No statement the runtime role can run lifts tenant isolation on any table.
- Platform work reaches another tenant only through about 20 reviewed doors, each named on the allowlist with its caller.
- The migration applier keeps seeing what it owns, because its login is exempt, not because of a setting.

**What it does not get**, and this design does not claim: the tenant selector is still a server-pinned session value (P-72, out of scope). A session that can run its own SQL can still choose which one tenant it is, and can call a door with arguments.

### 7. Not in scope, and founder decisions

**Out of scope:**

- binding the tenant selector (per-tenant roles, signed scopes);
- the identity helpers `identity.can_*` (no setting since P-70);
- the content of the security lane's documents;
- any new surface (Rule 2).

The platform doors serve existing console and job paths and add no capability.

**Decisions:**

- **F1. What replaces shadow mode.** (a) S' as designed: a login exemption for the applier and single-role dev. (b) No shadow at all: every role subject to RLS is always enforced, and the applier must be BYPASSRLS. Whether RDS PostgreSQL 15 lets the master hold or grant BYPASSRLS is not established here, and must be measured before (b) can be chosen. (c) Keep the setting for dev only. That is (b) plus a dev-only reader, which the gate cannot tell from a production one. **Recommendation: (a).** It is the only option that keeps today's migrations correct on RDS without a new privilege, and it is a role check, as P-72 asks.
- **F2. Who may call a platform door.** (a) `app_service`, as designed: injected SQL on a tenant route can call a door, but only for what the door does. (b) A second login role for platform routes and jobs (`app_platform_service`), with EXECUTE on the doors and `app_service` holding none. That needs a second runtime credential in the task definition (D1 infrastructure: Terraform, the deploy preflight). **Recommendation: (a) now.** Each door is granted in one line, so (b) later is a grant change per door with no redesign.
- **F3. The purge's database precondition.** (a) As designed: the lifecycle columns are writable only through the two platform doors. (b) Also hold `purge_eligible_at` at the database: no door erases before the retention window closes, unless an override recorded by `platform_request_tenant_deletion` says so. **Recommendation: (b).** An injected sequence of door calls then cannot purge a tenant before the window, and the platform sees the pending deletion first. It is the custody lane's call, inside P-58.
- **F4. PostgreSQL 15.** The design does not need 16, and P-72's "`WITH SET FALSE` on PostgreSQL 16" is satisfied by "not granted". No upgrade is asked for. The P-72 text could say "not granted" alone.
- **F5. The Vault in the tenant export** (if slice 0 shows it absent): (a) `platform_export_vault_rows(p_org)` as a door; (b) a member-free organization arm on the Vault policies. **Recommendation: (a).** (b) widens every Vault policy for every organization-scoped session, which the Vault has refused by design (`20260926` header).
