# No session setting lifts row-level security (P-70)

Launch row D6 (tenant isolation). Date 2026-10-29. Base `92bb29868` (red and green are built from the same commit; green is that commit plus this change, nothing else).

The founder decision P-70 (`docs/LAUNCH_DEFINITION_OF_DONE.md`, with P-59 as its reasoning) has four parts:

- the runtime role must not be able to switch tenant isolation off from inside its own connection;
- every policy that reads `app.bypass_rls` converges on "the platform scope the reviewed purge doors already require (a role the runtime role cannot assume)";
- the settings readers that remain are deleted;
- a path that genuinely reads across tenants does it through a reviewed SECURITY DEFINER door, or a role granted only to that path.

"The head database" below is the database install-fresh + deploy-migrate built at the base commit.

The work is a **fix**: in each creating file, the bypass and admin terms are removed, installed databases are brought to the same state, the one server path that set the bypass stops setting it, the operator preflight stops relying on it, and the existing session-scope gate is extended so a reader cannot come back.

**Status: done**, with one point of P-70's wording not done as written (see "The platform scope is not a role"), and what remains switchable reported in founder terms under "What remains".

## What was open

On the head database, built by install-fresh + deploy-migrate:

- the runtime role (`app_service`, NOSUPERUSER NOBYPASSRLS), in tenant A's scope, saw one Vault version (A's);
- after `SET app.bypass_rls = 'true'` it saw A's and B's, and `UPDATE` of B's version returned 1 (`red.txt` §1).

Any role can set a custom setting. So isolation for 165 policies rested on no line of server code ever issuing one `SET`.

## What already exists

Read at `227b2b78e`, re-checked at `92bb29868`. No commit in between touched any file below.

| Piece | Path | What it does today | What it did not do |
|---|---|---|---|
| The four helpers | `db/migrations/053_gcc_rls_policies.sql` (access/write org), `069_gcc_multitenant_rls_expansion.sql` (all four) | `identity.can_access_org / can_write_org / can_access_program / can_write_program`, SECURITY DEFINER. They decide by `identity.current_org_id()` and `identity.org_relationships`. `core.can_*` wraps them. | They returned TRUE first, whenever `app.bypass_rls = 'true'`. Their creators run on install-fresh only, and no file of the deploy set redefines them. |
| Policies that decide through them | 146 policies on 69 tables in 12 schemas, read from `pg_policy`. vault: 28 policies on 6 tables; also signing, ectd_v4, labeling, registry, site_intel, innovation, ai, discovery, fhir, identity, product_master | Tenant isolation by program or organization | None has an `rls_enforce` or `app_super_admin` arm (4 also admit the caller's own user id), so the bypass was their only way past the tenant |
| Direct bypass policies | `db/migrations/20260129_phase5_intelligent_document_system.sql` (6), `20260206_phase5_evidence_fabric.sql` (6), `20260206_phase5_contradiction_scanner.sql` (1), `20260207_phase6_6_predicate_intelligence.sql` (3), all four in `C2C_MIGRATION_FILES` | Program or organization isolation through `app.current_program_id` / `app.current_organization_id` | They also admitted `app.bypass_rls`. Nothing in server code sets either selector or reads these tables, so the bypass was the only way in. The last three create only when absent, so editing the text alone reaches no installed database. |
| `app.is_admin` policies | `072_gcc_innovation_platform_core.sql` (`guidance_docs_admin`, `workspace_analytics_policy`), `077_gcc_self_evolving_intelligence.sql` (`federated_admin`), install-fresh only | Two policies that are the switch and nothing else, and one that is own rows OR the switch | Nothing reads or writes these tables. `federated_admin` cast the setting to boolean, so the `''` that `sessionScope` pins made every read of `cortex.federated_learning_state` raise 22P02 (`red.txt` §3) |
| Files on no applier | `20260206_phase4_orchestration_kernel.sql` (3 `admin_bypass_*` policies), `20260206_phase6_docx_factory.sql` (2) | Nothing: not in the set, not install-fresh's, objects absent from the catalog | — |
| The server writer | `server/services/innovation/submission-readiness-twin-service.ts` `createCriteria`, `runAssessmentInternal` (4 SETs) | Rule-based readiness scoring | Neither method has a production caller; AnA's `get_submission_readiness_twin` calls `getDashboard`, which never set it. `pool.connect` already carries the request's tenant scope (`server/db/poolInstrumentation.ts`), and that scope admits the caller's own program. `readiness_criteria` has no INSERT policy, so the bypass never helped `createCriteria` either. |
| Its release guard | `server/services/innovation/rlsBypassSession.ts` + `tests/db/rls-bypass-does-not-outlive-release.dbtest.ts` | Cleared the two settings before a connection went back to the pool | Served only the twin's SETs |
| Scope pins | `server/db/sessionScope.ts` (D3, 2026-10-08) | Pins `app.rls_enforce` to the deployment's mode and both bypass settings empty on every scope it applies, and clears them on release | Kept as is (writers of `''`); its header no longer says a helper grants on them |
| The operator preflight | `scripts/db/program-same-org-preflight.mjs` | Lists records naming another organization's project, run as the owner, inside a READ ONLY transaction, with `rls_enforce` off and `bypass_rls` on | Relied on the bypass to read `vault.documents` (FORCEd, helper policies) on an owner that is not a superuser |
| The purge doors | `public.purge_tenant_vault_records` (`migrations/20260926_…`), `purge_tenant_run_events` (`20261008f`), and the others listed by `tenant-purge-doors-reviewed.test.ts` | Run as their owner (the table owner or a NOLOGIN purger), refuse outside the platform scope, and erase inside the purged organization's own scope (P-66) | Need no policy arm. Their "platform scope" check is itself two session settings (see below). |
| The session-scope gate | `scripts/ci/check-session-scoped-rls-bypass.mjs` + selftest; in `.husky/pre-push` | Fails on a session-scoped SET of either setting in server/scripts/shared, and on any write of the three switches in server code outside its allowlist | Did not look at SQL, did not look at readers, and let scripts write the bypass transaction-locally |
| The deploy's definer review | `scripts/db/security-definer-allowlist.json`, `revokeUnreviewedDefinerExecute`, `tests/db/security-definer-functions.dbtest.ts` | The four helpers and `core.can_*` are listed as reviewed policy helpers | Unchanged: CREATE OR REPLACE keeps their signatures, so the entries still name them. No allowlist edit. |
| Earlier work on the switches | `docs/evidence/D3/2026-10-08-isolation-not-session-switchable/` | Measured that the tenant selector itself is session-settable, so the policies defend against code that forgets a predicate, not against injected SQL; closed the leak of a switch from one request to the next | Left the readers in place |

**Searches run:** `bypass_rls`, `is_admin`, `current_setting('app.` over migrations, db/migrations (including `_legacy`), server, scripts, shared and tests; `pg_policy` and `pg_proc` on the live catalog for every `current_setting('<x>.<y>')` reader (`inventory.txt`); `can_access_program`, `can_write_program`, `can_access_org`, `can_write_org`, `core.can_`; `releaseWithoutBypass`, `rlsBypassSession`; `SubmissionReadinessTwinService`, `createCriteria`, `runAssessment`, `get_submission_readiness_twin`; the nineteen table names and their policy names, which have one definer each; `app.current_program_id`, `app.current_organization_id`, `app.current_user_id` setters; `purge_tenant_`, `platform scope`, `app_super_admin` in the doors; `git log --all --diff-filter=D` on `*rlsBypass*`, `*bypass*`, `*session-scoped*`, which found nothing deleted (history starts 2026-10-22).

Nothing is built beside an existing piece. Ten migrations are amended in place and one deploy-set file is added, because the creators of the helpers run on no deploy, following the precedent of `20261015g`. One server path stops setting the switch, one script stops relying on it, and the existing gate is extended.

## Inventory (live catalog, head database)

`inventory.txt` has the queries and their output. The catalog had 1231 policies.

| Policy or path | What read it | What it needed it for | After |
|---|---|---|---|
| `identity.can_access_org / can_write_org / can_access_program / can_write_program` (and `core.can_*` through them), deciding 146 policies on 69 tables | `app.bypass_rls` | Nothing reachable: no server path sets it except the twin, which did not need it | Bypass block removed (053, 069 in place; `20261029j` for installed databases) |
| 16 direct policies: evidence.* (7 with contradiction_scans), intelligent_docs.* (6), predicate.* (3) | `app.bypass_rls` | Nothing: no reader of these tables; the selector they key on is set by nothing | Term removed; the three create-if-absent creators ALTER a stored policy that still reads it |
| `federated_admin` (cortex.federated_learning_state), `guidance_docs_admin` (innovation.guidance_documents) | `app.is_admin` | Nothing: no reader or writer | Dropped (`20261029j`), no longer created (077, 072) |
| `workspace_analytics_policy` (innovation.workspace_analytics) | `app.is_admin` | Nothing | Own-rows arm only |
| `orchestration.admin_bypass_*` (3), `documents.*_program_isolation` (2) | `app.bypass_rls` | Files on no applier | Amended so they cannot bring it back |
| `submission-readiness-twin-service.ts` `createCriteria`, `runAssessmentInternal` | set `app.bypass_rls`, `app.is_admin` | Nothing: tenant scope covers its own program; no production caller | SETs deleted; a rollback that cannot be confirmed now destroys the connection |
| `rlsBypassSession.ts` (+ its dbtest) | reset both | The twin's SETs | Deleted with them |
| `server/db/sessionScope.ts` | pins both to `''`, clears both | Belt and braces | Unchanged; comment corrected |
| `scripts/db/program-same-org-preflight.mjs` | set `app.bypass_rls` (transaction-local) | Read `vault.documents` across tenants as a non-superuser owner | No bypass; a store this role is held to by row security, with no policy the enforcement switch opens, is **refused** with its reason (exit 2), never reported clean |
| `tests/integration/innovation-platform.test.ts` | set both | Nothing (skipped suite) | SETs removed |
| Other session settings that widen access | `app.rls_enforce` (1020 policies grant every row when not `'on'`), `app.current_user_role = 'app_super_admin'` (973), the tenant selectors (`app.current_org_id`, `current_tenant_id`, `current_program_id`, `current_organization_id`, `current_account_id`, `current_user_id`, `organization_id`) | The platform scope and the tenancy itself | **Reported, not fixed** (see "What remains"). None of the 165 changed policies reads `rls_enforce` or `app_super_admin`: the dbtest sets both and they lift nothing there. |
| `public.unified_tasks_route_rows_guard` | `c2c.review_route_writer` | A trigger guard, not RLS | P-59, the custody lane's |

## The platform scope is not a role

P-70 says the bypass term converges on "the platform scope the reviewed purge doors already require (a role the runtime role cannot assume)". Read from the door bodies, that scope is two session settings:

```
IF NULLIF(current_setting('app.rls_enforce', true), '') = 'on'
   AND current_setting('app.current_user_role', true) IS DISTINCT FROM 'app_super_admin' THEN
  RAISE EXCEPTION 'VAULT_PURGE_REFUSED: the tenant purge runs in the platform scope …'
```

The same check appears in `20260926:230`, `20261008f:323` and every door after them. Putting it in place of the bypass term would swap one session switch for two. It would also give the Vault's document tables a platform arm, which they have never had by design (`20260926` header), so every platform-admin request would read every tenant's documents. `vault.legal_holds`, an integer-keyed table the sweep polices, is the only Vault table with the sweep's arms. The role the runtime role cannot assume is the doors' owner: the table owner, or a NOLOGIN purger as in `20261008f`. The doors erase inside the purged organization's own scope (P-66), so they need no policy arm. So the bypass term is **deleted with no replacement**, which is P-70's intent. The lead confirmed this before the work started.

## Changed

- **The helpers.** `053` and `069` are amended in place, with dated headers, and the IF blocks are gone. `migrations/20261029j_no_session_rls_bypass.sql` handles installed databases. For each helper whose stored body still reads the bypass, it re-creates the helper from its own `pg_get_functiondef` with that block removed, so whatever else the database's version holds is kept. CREATE OR REPLACE keeps the owner, the grants, SECURITY DEFINER and the pinned search_path (`green.txt` §2). A body it cannot clean fails the deploy.
- **The is_admin policies.** `072` and `077` are amended in place. `20261029j` drops `federated_admin` and `guidance_docs_admin`, and alters `workspace_analytics_policy`, each only while its stored text reads `app.is_admin`. The DROP is replay-safe (Rule 1): no file on any applier creates either policy now.
- **The sixteen direct policies.** Their four creators are amended in place. `20260129` drops and re-creates on every run, as before, so the text change reaches every database. The other three create only when absent, so each now ends with an ALTER POLICY of a stored policy whose text still reads the bypass, and only then.
- **The tail assertion.** `20261029j` ends by failing the deploy if any policy, or any function outside pg_catalog, still reads either setting. It sits in the set after the four creators, and before the custody file and the isolation tail (uuid step, child scope, sweep).
- **The twin service.** The four SETs are gone. Its connections carry the caller's tenant scope. A failed transaction whose ROLLBACK cannot be confirmed now destroys the connection instead of returning it (what `releaseWithoutBypass` used to do). `rlsBypassSession.ts` and its dbtest are deleted, and its one entry leaves `sql-interpolation-baseline.json`.
- **The preflight.** It turns enforcement off (as before) and nothing else. A store whose table, or programs table, is held by row security for the running role, with no policy that the enforcement switch opens, is reported `NOT CHECKED — row security holds <role> to <relation> …`, and the run exits 2.
- **The gate**, `ci:session-scoped-rls-bypass`, keeps its rules and gains three:
  - fail on any reader of either setting in any `.sql` under `migrations/` and `db/` (comments stripped, dollar-quoted bodies read);
  - the same in server/scripts/shared code outside tests (strings kept);
  - fail on any write of either setting in scripts or shared.
  The baseline is empty. The closing advice no longer recommends `SET LOCAL`.

### Found on the way, and fixed with it

The first green build failed in install-fresh. Its overlay applies `migrations/` before the gcc tree, so `cortex.federated_learning_state` did not exist yet, and a `'…'::regclass` inside the guarded `EXISTS` was evaluated anyway (SQL does not short-circuit AND): `relation "cortex.federated_learning_state" does not exist`. Both guards now use `to_regclass`, in `20261029j` and in the contradiction creator (`green.txt` §1).

## Red, green, mutations

| | What | Result |
|---|---|---|
| Red §1 | psql as `app_service` on the head database | bypass lifts the Vault: A sees B's version, updates it |
| Red §2 | `ci:session-scoped-rls-bypass` (the extended gate) on the base tree; the gate as it stood passes there | **32 problems**: 30 SQL readers, the twin's 4 SETs, the preflight's write |
| Red §3 | `tests/db/no-session-rls-bypass.dbtest.ts` on the head database (HEAD's files) | **14 of 29 fail**, each for its reason (below) |
| Green §1 | Built from blank (install-fresh + deploy-migrate) | both exit 0; `20261029j` applied |
| Green §2 | The head database deployed with the change, three times | readers 23 → 0. On deploys 2 and 3 the changed policies keep their oid and row version, and the helpers keep their text, owner, grants, SECURITY DEFINER and search_path. The helpers' row version moves on every deploy because deploy step 5 re-GRANTs EXECUTE; the same happens on a plain base redeploy, and `20261029j` applied alone twice leaves it unchanged. |
| Green §3 | The new dbtest | **29/29** on the fresh build and **29/29** on the upgraded head database. Its replay case applies `20261029j` and the three self-converging creators twice more inside a rolled-back transaction, and requires the same oid, text and row version (`xmin`) |
| Green §4 | The same probe on the database built with the change | A sees only its own version and updates 0 |
| Green §5 | 74 related real-database suites, red vs green, on fresh copies | **No test fails only with the change.** The only base-only failures are the new dbtest's 14. Failing on both sides: 19 Vault fixture suites and submission-required-deliverables, which refuse this lane's database by name; on the names their guards accept they pass on both (162 + 38 + 18 tests). Also failing on both: two report-pack and report-os suites, for lack of PDF fonts. One concurrency case in `vault-version-checkin` failed once on green under 19 parallel suites, then passed 3 of 3 alone (as did red). `security-definer-functions`, `isolation-switch-does-not-outlive-request`, `rls-policy-inputs`, `vault-isolation-hardening`, `vault-catalog-tenant-isolation`, `phase5-intelligent-docs`, `tenant-purge` and `tenant-purge-blocking-keys` pass on both sides |
| Green §6 | Unit and PGlite suites | twin 18/18; the three preflight PGlite suites, `withTenantConnection`, `tenant-scope-org-guc` 48/48; the gate's selftest 32/32 (+4 known gaps), its strings test 3/3 |
| Mutations | `mutations.txt` | **16 mutations, 16 killed**, each by the check meant for it; every file restored byte for byte (sha256), all in a scratch copy of the tree |

**Red §3, why each fails at HEAD.**

- The catalog case lists 23 readers.
- With `app.bypass_rls`, A reads B's rows (the Vault version and the sixteen direct-bypass tables), the helpers admit B, and A updates B's version and claim.
- With `app.is_admin`, A reads B's workspace analytics and writes guidance.
- With `rls_enforce` off or `app_super_admin`, the federated-state read raises 22P02: `federated_admin`'s boolean cast of the `''` that the previous scope left.
- With all four set, every case fails.
- The replay case cannot read `20261029j` (not at HEAD).
- The preflight's Vault entry has no `refused`, and its rows are `[]`: it under-counts.

The 15 that pass at HEAD are the controls:

- the four no-switch cases;
- the cases where a switch has no arm to lift: `rls_enforce` off and `app_super_admin` on reads, helpers and writes; `app.is_admin` on the helpers and writes; `app.bypass_rls` on the two switch-only tables;
- A's own write;
- the superuser preflight.

## What remains (item 4, for the founder)

After this change no session setting lifts the 165 policies above. Two kinds of session setting still widen others:

1. **The two platform switches.**
   - `app.rls_enforce` not `'on'`: 1020 policies admit every row.
   - `app.current_user_role = 'app_super_admin'`: 973 policies admit every row.
   These are the platform scope itself: the tenant purge and the platform-admin routes use them (26 references in 18 server files).
2. **The tenant selectors.** `app.current_org_id`, `app.current_tenant_id` and the others choose which tenant a session is. A session that can set them can be any tenant, one at a time.

**What an attacker would need today:** a way to run their own SQL text on a runtime connection, i.e. SQL injection, or a server code path that issues the SET. With that, they could turn enforcement off or claim the platform role, and read every tenant's rows in those 1020 tables for the rest of that request.

**What already stands in the way:**

- `server/db/sessionScope.ts` pins `rls_enforce` to `'on'` and both bypass settings to `''` on every scope it applies, and clears them on release. So a switch does not outlive the request it was set in (`tests/db/isolation-switch-does-not-outlive-request.dbtest.ts`).
- `ci:session-scoped-rls-bypass` refuses any write of the three switches in server code outside `sessionScope.ts`, and now any reader of the two bypass settings anywhere.
- `ci:sql-interpolation` freezes the values interpolated into SQL text (1056 in 223 files) and fails on a new one.
- Production refuses to boot as a superuser or as the table owner (`server/db/rlsEnforcement.ts`).
- The 69 helper-decided tables (the six Vault document tables, signing, ectd_v4 and the rest) and the nineteen direct ones have no arm for either platform switch, so injected SQL there gets only the tenant it can name.

**What closing it would take:** this is new capability, so it is a founder decision. Each of these is a design of its own, as D3 measured on 2026-10-08.

- Move the platform scope off a session setting and onto a role the runtime role cannot assume: NOLOGIN roles held by the definer doors for the purge, and reviewed doors for each platform-admin read. Then delete the `rls_enforce` and `app_super_admin` arms. Dev and test, which run with enforcement unset, would need the same.
- Bind the tenant selector to something a session cannot forge: per-tenant database roles, or a scope that only a SECURITY DEFINER function can set after verifying a server-signed token.

## Gates

`gates.txt`, on the finished tree:

- **Pass:**
  - ci:session-scoped-rls-bypass, plus its selftest (32 passed, 4 known gaps);
  - ci:migration-drop-safety, plus its selftest;
  - ci:migration-set-order (450 at the run, 451 after the lead's merge, sweep last);
  - ci:migration-deploy-path;
  - ci:sql-interpolation:selftest;
  - ci:db-test-isolation, ci:check-test-imports, ci:unreferenced-modules, ci:runtime-ddl, ci:baseline-justifications;
  - the `security-definer-functions` dbtest (5/5 on both sides, green.txt §5).
- **Fail, not this change.** Each names only another lane's file:
  - ci:tenant-isolation:no-regression names `server/services/vault/vault-placement.service.ts` (1371823ee);
  - ci:sql-interpolation names the custody lane's `held-records.ts`, `held-record-integrity.ts`, `vault/retention-period.ts`, and asks for `vault-retention-period.ts`'s baseline to be lowered. This change removes one entry, for the deleted helper, and the gate does not name it;
  - ci:check-unrun-tests names `tests/cortex/csr-cortex.*`, as at the base.

Scoped tsc (`typecheck.txt`): the change adds no error and removes five (the TS7016/TS7006 on the preflight import, fixed by the new `.d.mts`). ESLint (`eslint.txt`): no file gains a finding.

## Reported, not fixed

1. **The two platform switches and the tenant selectors** remain session-settable (above).
2. **The purge doors' own precondition** is those switches. A session that sets `app_super_admin` passes the door's first check. The organization must still be `pending_deletion` with no active legal hold. That is the custody lane's surface (P-58).
3. **`core.can_access_program` / `can_write_program` return TRUE when neither `identity` nor `auth` has the helper** (fail open). It does not happen on any database the installers build (identity is always there). Pre-existing.
4. **A redeploy drops four org-GUC policies a first deploy leaves** (`project_notifications`, `project_sections`, `section_comments`, `section_status_log` `_org_policy`): `20260220` re-creates them and `20260828_drop_orphaned_org_guc_policies.sql` drops them. The same happens on a plain HEAD redeploy (`green.txt` §2, and a base-only redeploy shows the same). They never granted anything and `tenant_isolation_policy` stays. Pre-existing.
5. **The preflight on a managed Postgres** whose owner is not a superuser now refuses `vault.documents` instead of reading it through the bypass. Run it as a BYPASSRLS role. A NOLOGIN reader role with a SELECT arm on the Vault would meet the need without one, but it is new capability, so it is the founder's call.
6. **`docs/security/C2C_TENANT_ISOLATION_PROOF.md:12` and `PEN_TEST_SCOPE_2026-09-26.md:392`** still list `app.bypass_rls` and `app.is_admin` among the switches. That is the security lane's document.
7. **`federated_admin` raised 22P02 at the base** whenever `app.is_admin` was `''`, which is what `sessionScope` pins on every request (red.txt §3). Moot now that it is dropped.
8. **`vault-version-checkin`'s concurrent check-in case** failed once under parallel load and passed alone, on both sides. It looks timing-sensitive, and it is pre-existing.
9. **The identity helpers are EXECUTE-able by PUBLIC** (`=X/postgres` in the ACL). That is pre-existing and unchanged. They are reviewed policy helpers, and with the bypass gone they answer only for the caller's own scope.

## Files

| File | Change |
|---|---|
| `migrations/20261029j_no_session_rls_bypass.sql` | New (deploy set) |
| `scripts/db/migration-set.mjs` | Lines 3687–3700 at `4fa3184ab`: a 13-line comment and the entry, after `'migrations/20261029g_qms_job_roles_and_training_assignments.sql'` (upstream, merged by the lead) and before the custody file `20261029k`. ci:migration-set-order: OK, 451 |
| `db/migrations/053_gcc_rls_policies.sql`, `069_gcc_multitenant_rls_expansion.sql` | Amended in place: helper bypass blocks |
| `db/migrations/072_gcc_innovation_platform_core.sql`, `077_gcc_self_evolving_intelligence.sql` | Amended in place: is_admin policies |
| `db/migrations/20260129_phase5_intelligent_document_system.sql`, `20260206_phase5_evidence_fabric.sql`, `20260206_phase5_contradiction_scanner.sql`, `20260207_phase6_6_predicate_intelligence.sql` | Amended in place: bypass terms, and conditional ALTER where create-if-absent |
| `db/migrations/20260206_phase4_orchestration_kernel.sql`, `20260206_phase6_docx_factory.sql` | Amended in place (no applier) |
| `server/services/innovation/submission-readiness-twin-service.ts` (+ its test) | SETs deleted; unconfirmed rollback destroys the connection |
| `server/services/innovation/rlsBypassSession.ts`, `tests/db/rls-bypass-does-not-outlive-release.dbtest.ts` | Deleted |
| `scripts/ci/sql-interpolation-baseline.json` | The deleted helper's entry removed |
| `server/db/sessionScope.ts` | Comment |
| `scripts/db/program-same-org-preflight.mjs` | No bypass; refuses what row security holds |
| `scripts/ci/check-session-scoped-rls-bypass.mjs`, `.selftest.mjs` | Reader and script-writer rules; empty baseline; new cases; KNOWN GAP 5 promoted and narrowed |
| `tests/db/no-session-rls-bypass.dbtest.ts` | New |
| `scripts/db/program-same-org-preflight.d.mts` | New: types for the preflight, which tests import (the `.d.mts` pattern of `migration-set.d.mts`) |
| `tests/integration/innovation-platform.test.ts` | SETs removed |

### In this folder

- `red.txt`, `green.txt`, `mutations.txt`, `gates.txt`: the runs above.
- `inventory.txt`: the catalog queries and their output.
- `typecheck.txt`, `typecheck-tsconfig.json`, `eslint.txt`.
- `probes.sql.txt`: the two-tenant seed, the probe, the replay snapshot and the inventory queries.
- `mutate.py.txt`, `mutation-specs.py.txt`, `deploy-then-test.sh.txt`: the mutation harness. It works on a scratch copy of the tree; no repo file was mutated.

### Rule 1, Rule 2, Rule 3

- **Rule 1.**
  - Ten files are amended in place, each with a dated note, and no DROP is appended.
  - The one DROP, in `20261029j`, removes two policies that nothing on any applier creates any more.
  - Every replacement is conditional on the stored text.
  - The upgraded database was deployed three times: the changed policies keep oid and row version, and the helpers keep their text. The helpers' row version moves only because of the deploy's own re-GRANT, as at the base.
- **Rule 2.** Launch row D6. No surface, module or tool is added.
- **Rule 3.** See "What already exists". Each piece is fixed in place, and the gate is extended rather than a new one written.
