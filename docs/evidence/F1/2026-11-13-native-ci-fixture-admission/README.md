# Native CI: project fixture admission and private-profile offboarding audit

Plan: F1. Complete the existing native project-deletion proof; audit the separate private-profile export/purge failure without changing its privacy boundary.

## What already exists

- Hosted core CI run `43514511746`, head `cef271edbae9022ed1c4728db62ca099a80bcea0`, failed Integration Tests job `132207579539`: five failed, 3264 passed. The two project-deletion cases receive `403 PROJECT_ACTOR_ACCESS_DENIED` before their intended deletion/retention assertions; three tenant-purge cases concern an omitted `ana_relational_profiles` row and its project foreign key. The latter failures were already recorded before this run.
- `tests/db/project-delete-held-by-store.dbtest.ts` creates real organizations, users, a client workspace and projects, but no `organization_users` membership. Its HTTP harness merely claims an admin role. The proof is about draft-only deletion preserving detached conversation memory and retained FDA communications causing `409 PROJECT_HOLDS_RECORDS`; those expectations remain valid for a real authorized administrator.
- `server/routes/projects-management.ts::projectAdmission`, completed in `f09bc2d29`, now reads the actor's real current organization membership through `current-program-access.ts::readCurrentProgramActor` and `csr/project-scope.ts::readCsrProjectActor`, then applies the existing project sharing policy. Both the organization and user must be active. A request-body/session role does not supply membership. `docs/evidence/F1/2026-11-13-projects-list-scope/README.md` explicitly documents missing membership as a deliberate 403.
- `server/routes/__tests__/projects-management-project-scope.pglite.test.ts` already verifies the canonical policy and access refusals. No production admission change is needed to repair the older deletion fixture. `organization_users` has the existing unique `(user_id, organization_id)` key and `admin` is an existing organization project-management role.
- `vitest.db.config.ts` runs only native `*.dbtest.ts` files with `tests/setup.db.ts`, real unmocked PostgreSQL, RLS enforcement, and file-level sequencing. `TEST_DATABASE_URL` supplies the disposable owner connection; `APP_DATABASE_URL` supplies the non-superuser runtime connection. Existing install-fresh and deploy-migrate scripts create the deployed schema. The owner must be able to create roles.
- The private-profile failure is separately documented in `.design/claude-convergence/COORDINATION.md` under the founder/P-104 private-profile owner and D6 offboarding owner, and in `docs/evidence/D3/2026-11-12-live-tier-at-head/README.md`. FORCE RLS and restrictive account-owner policies intentionally hide members' private profiles from organization/system scope. P-58 export-before-purge and P-104 owner-only privacy have an explicitly unresolved offboarding decision. No profile body or secret was read in this audit.

Searches covered the current fixture, its production guard, project sharing policy, focused access tests, CI native harness, coordination and current/deleted test/export owners. No deletion-fixture hold was found. Private-profile ownership and its unresolved decision remain respected; no migration, RLS policy, export/purge runtime, held-record door, plan or gate is authorized for change here.

## Bounded fixture completion contract

Persist the fixture administrator's actual organization membership with the existing key, and explicitly set the fixture user/organization active on insert or conflict. Preserve both original deletion/retention outcomes and the production current-member refusal. Do not mock admission, remove a guard, fabricate a program anchor or relax the assertions.

The existing two-case native file is the red/green proof. Run it only against the lead's dedicated disposable database, after existing schema provisioning, using Node 22:

```sh
npm run test:db -- tests/db/project-delete-held-by-store.dbtest.ts --reporter=verbose
```

Supply the disposable owner URL in `TEST_DATABASE_URL` and `DATABASE_URL`, its runtime URL in `APP_DATABASE_URL`, and `RLS_ENFORCE=on`; never use the demo database. The related existing project-scope PGlite file is the bounded admission regression check. No broad 3000-test rerun is needed for this fixture correction.

## Verification status

Hosted red evidence and the missing membership are confirmed. The existing fixture now explicitly creates active organization/user rows and persists their real `admin` membership through the existing unique key. Both deletion/retention assertions are unchanged. No local database test has been run by this agent; the lead provisions and runs the disposable native harness and related PGlite admission tests. Private-profile export/purge remains an audit finding, not an implemented or verified repair.

Focused ESLint on the changed native fixture exits 0 with no diagnostics. No database, provider, compiler/build or Git mutation was performed for this patch.

## Separate private-profile policy finding

The current P-105 private-boundary owner is `session_01KZK3jgtmQBgNepqLjXjS3k`. The exact P-58/P-104 decision is already addressed to the founder and the private-profile/D6 owners in coordination: whether organization offboarding returns members' private profiles or deliberately excludes and erases them, and which restricted disposal mechanism may cross their owner-only boundary. `user_intelligence_profiles` is under the same decision and is not currently in the purge list.

`purge-referrers.ts` already includes `ana_relational_profiles`; adding that name again cannot repair it. Its plain DELETE affects zero rows under FORCE RLS, and the later project deletion fails. `tenant-full-export.service.ts::exportTenantFull` likewise cannot see those rows in organization-only scope. The legacy profile fields are plaintext text/JSON, including personal summaries, emotional signals, mistakes and preferences; there is no ciphertext-only return shortcut. Downstream private-capsule encryption/lifetime controls do not encrypt these legacy table columns.

No current authorized export/disposal policy resolves the conflict. After that existing founder decision is resolved, the narrow disposal pattern is the existing reviewed `tenant_record_purger` doors in `purge-held-doors.ts`, retaining pending-deletion, legal-hold and export-custody checks. Do not introduce general SELECT access, impersonate profile owners, add a session-settable bypass, drop a policy or exclude the failing proof to obtain green CI. Future verification must retain the blocking-key native suite and cover two tenants/two owners, owner-only reads, the decided export treatment, tenant-local complete erasure and hold/custody rollback. No private profile contents were queried and no export/purge/RLS source was edited.
