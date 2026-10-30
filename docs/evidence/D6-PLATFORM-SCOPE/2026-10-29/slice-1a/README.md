# P-72 slice 1a: the non-superuser deploy runs to the end, and the role string no longer opens the platform scope

Launch rows **D1** (the deploy) and **D6** (tenant isolation). Decision P-72 (`docs/LAUNCH_DEFINITION_OF_DONE.md`, "### P-72" and its amendment). Design: `docs/design/PLATFORM_SCOPE_AS_A_ROLE_2026-10-29.md` §1, §3.5 and §4.2. Measurements that bind it: `../slice-0/README.md` (items 1 and 5). Brief: `../slice-1a-wip/brief.md`.

Measured at `bbb4b2c00` plus this lane's working tree, on 2026-10-30, on a private PostgreSQL 16.15 cluster and in PGlite (PostgreSQL 18.3).

## In short

- **D1 was broken and is fixed.** On a production-shaped copy, with the non-superuser RDS master as the applier, `deploy-migrate` at HEAD halts at `migrations/20260928_users_membership_rls.sql` after 321 of 456 files: "permission denied to set parameter app.current_user_role". With this change it runs 457 of 457 files and all five steps. Two replays leave every policy, function and constraint unchanged.
- **Sign-in and password reset still work** on that copy. As the runtime role, through the server's own code (`pre-auth-account.ts`), the lookups find the account, and an unknown address or token finds nothing.
- **The lookups have a new owner.** They are owned by `c2c_platform_scope`, a NOLOGIN role. The runtime role is not a member and cannot `SET ROLE` to it. The role can read only the columns the lookups need.
- **The re-owning is required, not optional.** Remove only the `SET` clause, leave the lookups with the RDS master, and sign-in finds no one, silently. Measured on the same copy.
- **The deploy now fails** if any function's `SET` clause names a custom setting, whoever created it. This was shown failing on the real deploy and in a CI test.
- **The role string is closed.** At HEAD, a tenant-A scope whose role string was `app_super_admin` did three things through the server's own scope code:
  - read B's tasks, audit trail, users and legal holds;
  - updated B's task;
  - wrote the string onto A's own membership.

  Now:
  - the scope is refused before any statement runs, and the request is answered 403;
  - the authoring router carries the membership role, not the token's claim;
  - `organization_users.role` refuses `app_super_admin` from every writer, the superuser included.
- **Tests:**
  - 25 new tests. At HEAD, 22 fail and the 3 controls pass. With this change, 25 of 25 pass.
  - 16 mutations, and each one turns its test red.
  - Every lane gate passes. Scoped tsc and eslint show nothing new.

## What already exists

Searched before any change (CLAUDE.md Rule 3). Nothing here was rebuilt. Each item was **completed**, **reached** or **fixed**.

| What | Where | What it did before | What it did not do |
|---|---|---|---|
| The three pre-auth lookups | `migrations/20260928_users_membership_rls.sql` (`user_id_for_email`, `user_id_for_reset_token`), `migrations/20260928_invitations_for_member.sql` (`invitations_for_member`) | Ran as SECURITY DEFINER. Each entered the platform scope with `SET app.current_user_role = 'app_super_admin'`. | Could not be created by a non-superuser on PostgreSQL 15+, so the deploy halted (slice 0, item 1). |
| Their callers | `server/services/auth/pre-auth-account.ts`, `server/db/tenantStore.ts` (`runWithPreAuthScope`, `bindPreAuthAccount`), `server/services/tenant/invitation-consent.ts`, `server/routes/tenant-users.ts` | Bind a pre-auth request to the id the lookup returns. | Unchanged here. The signatures did not change. |
| The slice-1a-wip patch | `../slice-1a-wip/p72-slice-1a.patch.txt`, already applied to the working tree | Contained the amended creators, `20261030b`, the CHECK and the scope refusals. | Was never verified. **Completed** here: tested, corrected and proven. |
| NOLOGIN door roles, and the applier granting itself membership | `20261008f_ana_run_events.sql:176`, `20261029k_tenant_offboarding_custody.sql:231` | Hand a function to a NOLOGIN role on a non-superuser applier. | `20261030b` step 1 follows the same pattern. |
| The converge pattern for stored function text | `migrations/20261029j_no_session_rls_bypass.sql` (P-70) | Rewrites stored helpers from their own text, conditional on what is stored. | Reads function bodies (`prosrc`) only, so it never saw `proconfig`. That gap is why the three were missed. |
| The membership role replacing the token's claim | `server/middleware/auth.ts` `applyOrganizationRole`, `server/auth.ts:296` | Every authenticator except the authoring router used it. | **Reached** from the router. It is exported, and its `.js` twin re-exports it. |
| The request and per-user scope builders | `server/middleware/establishRequestTenantScope.ts` (`tenantSessionVars`), `server/db/tenantStore.ts` (`runWithTenantScope`), `server/db/poolInstrumentation.ts` (`scopeParams`) | Sent whatever role string they were given. | **Fixed**: each refuses the platform role outside the system scope. |
| Who may mint a staff role | `20260926_organization_users_own_writes.sql`, trigger `organization_users_staff_role_platform_only` | Refused staff roles outside the platform scope. | It decides by reading the session setting, so a scope carrying the string passes it (slice 0). Its move to `CURRENT_USER` is slice 5. **Added** in the same file: the CHECK `organization_users_role_known`. |
| The assignable roles | `shared/constants/org-roles.ts` `ASSIGNABLE_ORG_ROLES`; SCIM `VALID_ROLES` (`server/routes/scim.ts:75`) | Define every role an administrator can assign. | The CHECK admits these, plus what rows already hold. |

**Searches run.** The code was searched for these names, in `migrations/`, `db/`, `scripts/`, `server/`, `shared/` and `tests/`:
- `user_id_for_email`, `user_id_for_reset_token`, `invitations_for_member`;
- `app_super_admin`, `current_user_role`, `proconfig`;
- `applyOrganizationRole`, `runWithTenantScope(`, `applySessionScope(`, `set_config('app.current_user_role'`;
- `INSERT INTO organization_users`, `UPDATE organization_users`, `insert(organizationUsers)`, `update(organizationUsers)`.

History was searched with `git log --all -S` and `git log --all --diff-filter=D` for `c2c_platform_scope`, `organization_users_role_known`, `assertScopeRoleAdmissible`, `PLATFORM_SCOPE_ROLE_REFUSED` and `proconfig`. The only hits were the slice-1a-wip commit. No deleted file matched.

## Part 1: D1, the non-superuser deploy

### What changed

- **`migrations/20260928_users_membership_rls.sql`** and **`migrations/20260928_invitations_for_member.sql`**. The creators were amended in place, each with a dated header:
  - the `SET app.current_user_role` clause is removed from all three functions;
  - the read policies the three depend on gain the arm `CURRENT_USER = 'c2c_platform_scope'::name`. On `users` this arm is in `users_member_*`. On `organization_invitations` it is a new SELECT policy, `organization_invitations_platform_scope_read`. The tenant sweep and its heal pass touch only `tenant_isolation_policy`, so neither touches this one.
  - `CURRENT_USER` equals that role only inside a definer the role owns.
- **`migrations/20261030b_platform_scope_role.sql`** (new; set entry before `UUID_TENANT_ISOLATION_NONPUBLIC`). Every step is conditional on what is stored. It creates no table, column or policy, and drops nothing.
  1. Creates the NOLOGIN NOINHERIT role `c2c_platform_scope` if it is absent, and refuses a role that already exists with any other attribute. Makes a non-superuser applier a member: INHERIT, plus SET on PostgreSQL 16. The SET test is inside `CASE`, because PostgreSQL 15, production's version, has no `SET` privilege type.
  2. Re-creates any of the three whose stored `proconfig` still names a custom setting, from its own `pg_get_functiondef` with that clause removed. Body, signature, SECURITY DEFINER and grants are unchanged.
  3. Grants the role SELECT on only the columns the lookups read: `users(id, email, reset_token)`, `organization_users(user_id, organization_id)` and the returned `organization_invitations` columns. Then hands the three to the role.
     - It first checks, on every run, that each policy the lookups read admits the role, and fails the deploy if one does not.
     - `CREATE` on schema `public` is held only for the hand-off and revoked after it.
  4. **The gate.** Fails the deploy, naming each offender, if:
     - any function's `SET` clause names a custom setting, other than an extension's own function;
     - a function the role owns is out of shape: not SECURITY DEFINER, no pinned `search_path`, or executable by PUBLIC;
     - the role holds `CREATE` on `public`;
     - `app_service` is a member of the role by any path.
- **`scripts/db/migration-set.mjs`.** One entry, `migrations/20261030b_platform_scope_role.sql`, with its comment.

### Proof

The production-shaped copy is `s1a_base`:
- a copy of slice 0's seeded two-tenant database (`c2c_p72_seed`);
- every object and the database handed to `c2c_rds_master` (`probes/41-*.sql.txt`, `probes/42-*.sql.txt`). That role is LOGIN CREATEROLE CREATEDB, not SUPERUSER, BYPASSRLS or REPLICATION, as the RDS master is (`probes/43-*.sql.txt`);
- a reset token, a cross-organization invitation and a legacy role value added (`probes/10-base-data.sql.txt`).

Each run takes a fresh copy (`probes/copydb.sh.txt`) and runs `deploy-migrate` as `c2c_rds_master` (`probes/deploy-as-rds.sh.txt`).

| Claim | Evidence |
|---|---|
| **Red.** HEAD halts: "migration halted at migrations/20260928_users_membership_rls.sql — permission denied to set parameter "app.current_user_role" (321/456 applied before the failure)". | `d1-red-deploy-at-head.log.txt` |
| **Green.** 457/457 files, steps 4 and 5 pass, "Schema migration complete". | `d1-green-deploy-1.log.txt` |
| **A second and third replay are clean.** Both exit 0. Every policy, function and constraint (5931 objects, oids stripped) is identical after the first deploy and after each replay. Replay 3's log equals replay 2's line for line. | `d1-replay-is-clean.txt`, `d1-green-deploy-2-replay.log.txt`, `d1-green-deploy-3-replay.tail.txt`, `d1-fingerprint-after-replays.txt` |
| **Sign-in, password reset and invitation lookups work on the production-shaped owner.** Run as `app_service` with `RLS_ENFORCE=on`, through `bindAccountByEmail`, `bindAccountByResetToken` and `runWithTenantScope`:<br>- each lookup returns id 2, and the bound row is read;<br>- an unknown address or token returns null;<br>- the invitation is found from B's own scope only;<br>- the pre-auth scope still reads 0 other `users` rows;<br>- `SET ROLE c2c_platform_scope` is refused to the `app_service` login. | `d1-preauth-lookups-green.json.txt`, `probes/60-preauth-lookups.mts.txt` |
| **Why the re-owning is needed.** Hand the two sign-in lookups back to the RDS master: no `SET` clause, FORCEd `users`. Sign-in and reset then return null, silently. | `d1-without-the-hand-off-sign-in-finds-no-one.txt` |
| **The gate fails.** A function with `SET app.current_user_role`, created by the superuser, stops the next deploy at `20261030b`: "a function's SET clause names a custom setting: function p72_probe_sets_a_setting() sets app.current_user_role". | `d1-gate-custom-set-clause-fails-the-deploy.txt` |
| **CI's shape still passes.** Blank database, `install-fresh` then `deploy-migrate` twice, as superuser: all exit 0. The three lookups are owned by the role with no custom `SET`, and the CHECK is validated. | `d1-ci-superuser-from-blank.txt` |

**The test that keeps it from coming back:** `server/__tests__/migrations/platform-scope-role.pglite.test.ts`.
- PGlite refuses a custom `SET` clause to a non-superuser, as RDS does. So the test applies the creators and `20261030b` as a CREATEROLE non-superuser that owns the tables, the schema and the database, in set order, and replays them.
- At HEAD the first case fails with the production error: `migrations/20260928_users_membership_rls.sql: permission denied to set parameter "app.current_user_role"` (`tests-red-at-head.txt`).
- Other cases show:
  - the lookups answering for the runtime role;
  - a stored `SET` clause converging;
  - the deploy failing on a custom `SET` clause, on a runtime member of the role, and on a read policy without the arm.

## Part 2: the role string

### What changed

- **`server/routes/authoring.router.ts`** (only the role hunks; lane B owns the draft hunks). After the router's own membership check, `applyOrganizationRole(req)` replaces `req.user.role` and `roles` with the membership row's role. `x-roles` is derived from that role. The image upload (`caller: 'server/routes/authoring.router.ts:images'`) re-enters its scope with `req.user.role`, which is now the membership role.
- **`server/middleware/auth.ts`.** `applyOrganizationRole` is exported. `auth.js` is a pure re-export twin and re-exports it; `ci:js-ts-shadows` passes.
- **`server/db/tenantStore.ts`.**
  - `PLATFORM_SCOPE_ROLE`, `isPlatformScopeRole` (case- and padding-insensitive), `PlatformScopeRoleRefusedError`.
  - `assertScopeRoleAdmissible` admits the platform role only in the system scope's own shape: tenant `'0'`, the exact string, no organization, no bound account.
  - `runWithTenantScope` asserts this before the callback, which covers `withTenantConnection` and every explicit scope.
- **`server/db/poolInstrumentation.ts`.** The same assertion runs at the pool's entry (no connection is taken) and again where the scope is written to the database (`scopeParams`, at BEGIN). A scope object changed after it was entered reaches no connection.
- **`server/middleware/establishRequestTenantScope.ts`.**
  - A request whose role is the platform string gets a 403 `PLATFORM_SCOPE_ROLE_REFUSED`. No scope is opened and no client is attached.
  - `tenantSessionVars` refuses it as well, as a second layer: mutation M15 removes the 403 and the applier still throws.
- **`migrations/20260926_organization_users_own_writes.sql`.** Amended in place, with a dated header: the CHECK `organization_users_role_known`. It admits:
  - `ASSIGNABLE_ORG_ROLES`;
  - the legacy organization roles the server still reads (`owner`, `editor`);
  - the staff spellings the trigger guards (`super_admin`, `superadmin`, `platform_admin`);
  - **any other value rows already hold**, so no existing membership stops being writable.

  It never admits `app_super_admin`, in any case or padding. It is added `NOT VALID` and validated only when every row passes, so a row that already holds a refused value cannot fail the deploy (a warning names the count). The replacement is conditional on `pg_get_constraintdef`, so a replay changes nothing. No other file defines the constraint.

### The deployed values, measured first

- **Every writer of `organization_users.role` in the code** writes a constant or an assignable role:
  - `'admin'`: `server/db/bootstrap/seed-default-org.ts`, `server/routes/setup.ts`, `server/routes/auth.ts:1056`, `scripts/seed-admin.mjs`, `scripts/seed-founder.mjs`, `scripts/seed-ga-demo.mjs`;
  - `'member'`: `server/routes/scim.ts:860`, `server/routes/sso.ts:913`, `scripts/ci/image-boot-signin.mjs`;
  - `'manager'` or `'member'`: `seed-ga-demo.mjs`;
  - a validated role or `'member'`: `atomicQuotaService.js`, `membership-change.ts`, and invitation accept through the invitation's role.
- **On the production-shaped copy:** `admin` ×2, plus `legacy_reviewer` ×1, seeded here on purpose to show a held value staying writable.
- **On the local development database** (port 5432, read-only): `admin` ×1.
- **Production cannot be read from here.** So the CHECK is built to admit whatever a database holds at the moment it runs.

### Proof

| Claim | Evidence |
|---|---|
| **Red at HEAD.** Through the server's own `runWithTenantScope` and `establishRequestTenantScope` (pool and request client), as `app_service` on the copy, a tenant-A scope with the role string reads 1 of each of B's rows, updates B's task, and writes `app_super_admin` onto A's membership. | `role-claim-red-at-head.json.txt`, `probes/20-role-claim.mts.txt` |
| **Green.** `runWithTenantScope` is refused before any statement. `establishRequestTenantScope` answers 403 `PLATFORM_SCOPE_ROLE_REFUSED`. The ordinary-role controls are unchanged: 0 of B's rows, and the staff-role trigger still refuses. | `role-claim-green.json.txt` |
| **The CHECK, red then green.** At HEAD, `app_super_admin` and an unknown string are written by the system scope, by A's own scope, by the table owner and by the superuser. Now each of these is refused by `organization_users_role_known`. The assignable roles and a persona change still land, and the system scope still mints `super_admin`. | `membership-role-check-red-at-head.txt`, `membership-role-check-green.txt` |
| **The router.** A token claiming `app_super_admin` with membership `reviewer` gives `req.user.role === 'reviewer'` and an `x-roles` without the claim. At HEAD the role stays `app_super_admin`. | `server/routes/__tests__/authoring-router-membership-role.test.ts`, `tests-red-at-head.txt` |

## Tests and mutations

New tests:
- `server/__tests__/migrations/platform-scope-role.pglite.test.ts` (8 tests);
- `server/db/__tests__/platform-scope-role-refused.test.ts` (11);
- `server/middleware/__tests__/request-scope-refuses-platform-role.test.ts` (4);
- `server/routes/__tests__/authoring-router-membership-role.test.ts` (2).

Results:
- **Red** (lane files at HEAD, everything else as in the tree): 22 failed, 3 passed. The 3 that pass are the controls. See `tests-red-at-head.txt`.
- **Green:** 25 of 25 pass (`tests-green.txt`).
- **Mutations:** 16 of 16 turn their test red (`mutations.txt`, driver `probes/mutate.py.txt`). Every mutated file was restored byte for byte; the sha256 of each was checked against the copy recorded before. Two restores did not go as planned, and both are recorded in `mutations.txt`:
  - **M11:** the first run's restore stopped, because its replacement text was not unique. The file was restored by hand and checked against its sha256 before anything else ran.
  - **M16:** another lane wrote the router during the run. The file settled back to its pre-mutation sha256.

| # | Mutation | Turns red |
|---|---|---|
| M01 | the `SET` clause put back in `user_id_for_email` | 6 of 8 PGlite tests ("permission denied to set parameter") |
| M02 | the users policy without the owner's arm | 6 of 8 (deploy refuses: "no read policy on public.users admits c2c_platform_scope") |
| M03 | invitations without the owner's policy | 6 of 8 |
| M04 | no hand-off | 3 of 8 (sign-in returns null) |
| M05 | the custom-`SET` assertion blinded | 1 of 8 |
| M06 | the runtime-membership assertion removed | 1 of 8 |
| M07 | the stored clause not stripped | 1 of 8 |
| M08 | the CHECK admits `app_super_admin` | 2 of 8 |
| M09 | the CHECK validated unconditionally | 1 of 8 (a database holding the value cannot deploy) |
| M10 | `runWithTenantScope` unchecked | 6 of 11 |
| M11 | the role string not normalised | 2 of 11 |
| M12 | any tenant-`'0'` scope taken as the system scope | 2 of 11 |
| M13 | the pool's entry check removed | 1 of 11 |
| M14 | the check at BEGIN removed | 1 of 11 |
| M15 | the 403 removed (the applier still throws) | 3 of 4 |
| M16 | the router keeps the token's claim | 2 of 2 |

**Existing tests run against the change:** 23 files, 273 tests. All pass except `server/routes/__tests__/coauthorSnapshotStatus.test.ts` (7 failing). It fails the same 7 with this lane's files at HEAD, so it is not caused here. The coauthor router does not import `authoring.router.ts`.

## Gates

All exit 0:
- `ci:migration-drop-safety` (dynamic DROPs 19 → 20: the new conditional `DROP CONSTRAINT IF EXISTS organization_users_role_known` inside `EXECUTE`, not a data-bearing kind) and its selftest (12/12);
- `ci:migration-set-order` (457, sweep last);
- `ci:migration-deploy-path` and its selftest;
- `ci:session-scoped-rls-bypass` and its selftest (32 passed);
- `ci:tenant-isolation:no-regression`;
- `ci:tenant-resolvers`;
- `ci:js-ts-shadows`;
- `audit:repo-health:ceiling`.

eslint shows no new warnings:
- `establishRequestTenantScope.ts` went 0 → 0, after the refusal moved into a helper to stay under the complexity limit;
- `authoring.router.ts` is at 22, the same as HEAD;
- the four new tests have 0.

Scoped tsc (the lane's files and tests) gives the same 38 errors as HEAD, message for message. None is new.

## Not done, and not measured

- **PostgreSQL 15**, production's version, was not available here. The rule on custom settings in a `SET` clause applies to 15 and later. Step 1 takes 15's path (a plain `GRANT`) by `server_version_num`. Measured on 16.15 and PGlite 18.3 only.
- **The platform arm itself (P) is unchanged in the database.** A session that sets `app.current_user_role = 'app_super_admin'` still reads every tenant. This slice closes the paths by which the server sends that string. The staff-role trigger still reads the setting, which is slice 5. Retiring the arm is slices 1 and 6 of the design.
- **Other writers of `app.current_user_role` were not changed** (outside this lane). Each takes its role from a membership row or from the ambient scope, which is now checked. The `organization_users` CHECK refuses the string at the source. Not separately proven:
  - `server/services/tenant/governed-tenant-context.ts:31` `setTenantContextTx`, whose callers pass `resolveRole(req)` or a role read from the database;
  - `server/mcp/tools/runtime.ts:198`, whose role is `principal.role`;
  - `server/services/ana/catalog-scope.ts:60`, whose role is `admittedScope.role`;
  - `server/routes/governed-signed-act.ts`.
- **Allowlist reasons.** `scripts/db/security-definer-allowlist.json` still describes the three lookups' owner the old way (design §3.5 asks for updated reasons). That file is outside this lane. The keys did not change, so nothing breaks.
- The rest of slice 1 (zero-row verifiers, the retention sweep, the chain sweep's scope, the dependent paths) is the next brief.

## Reproduce

- **Cluster:** `p72/pgstart.sh` from slice 0, on port 55472.
- **Copies:**
  - `probes/copydb.sh.txt` takes a copy;
  - `probes/deploy-as-rds.sh.txt <tree> <db> <log>` deploys as the RDS master;
  - `probes/run-probe.sh.txt <probe> <db> [tree] <out>` runs a `.mts` probe as `app_service` with `RLS_ENFORCE=on`;
  - `probes/ci-from-blank.sh.txt` runs CI's superuser shape.
- **Tests:** `npx vitest run` on the four test files above.
- **Mutations:** `python3 mutate.py [ids]`.
