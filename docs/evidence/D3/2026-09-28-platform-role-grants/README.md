# D3: any tenant scope could make its member a platform operator

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-28. The row was claimed before any change. The item was
handed on by `../2026-09-28-users-rls/` (the children of `public.users`).
**Database:** `c2c_d3u`, PostgreSQL 16, provisioned from empty by
`scripts/db/provision-test-db.sh`. The runtime connects as `app_service`, which
is not a superuser and has no BYPASSRLS, with `RLS_ENFORCE=on`
(`posture.txt`).

**What this is not:** the row's closing evidence. That is the contract run
against staging with the production image, owed with D1.

## The defect

`public.platform_role_grants` decides who is a platform operator. One active
row for a user admits them to every cross-tenant console. Three things read it:

- `requirePlatformAdmin` and `requireBusinessAdmin` (`server/middleware/`);
- the master-admin entitlement (`server/services/entitlements/master-admin.ts`).

The table had no row-level security, and `app_service` holds INSERT, UPDATE
and DELETE on it. Measured as `app_service` in a plain member's tenant scope
(`red/before.txt`, 2 of 6 fail):

- **A `super_admin` grant was written for that member.** The Access Management
  console's own gate (`/api/admin/access`, behind the production auth
  boundary) then admitted the member's token with **200**. The same console
  answers 403 to that member without the planted row.
- The same scope reinstated a revoked grant, re-roled another user's grant to
  `super_admin`, and deleted a platform operator's grant. Each wrote 1 row.

## The change

**`migrations/20260928_platform_role_grants_platform_writes.sql`** is in
`C2C_MIGRATION_FILES`, after `20260928_users_membership_rls.sql` and above the
final pair (`ci:migration-set-order` OK). It converges on every run and drops
nothing (Rule 1).

- **SELECT is open.** The platform-admin check runs in the caller's own tenant
  scope (behind `authenticateToken`), and the caller may belong to any
  organization.
- **INSERT, UPDATE and DELETE need the platform scope (`app_super_admin`)**, or
  enforcement off. Enforcement is off on owner connections: migrations, seeds,
  and the test fixture's `grantPlatformRole`.
- **RLS is enabled and FORCEd.** The table has no tenant column, so the sweep
  neither covers it nor heals it.

There is one application writer, the Access Management console
(`server/routes/admin/access-management.ts`). It is mounted at
`/api/admin/access`, a `SYSTEM_SCOPE_PREFIXES` entry, so it already runs in the
platform scope. No writer had to move.

`scripts/db/rls-coverage-check.sql` listed this table among the children of
`public.users` that are "recorded, not policied". That comment now says it is
policied.

## The contract

`tests/db/platform-role-grants.dbtest.ts` runs on the two-tenant fixture,
through the application pool.

| # | Case | Before | After |
| - | --- | --- | --- |
| 1 | The console refuses a plain member (positive control) | pass | pass |
| 2 | A's scope cannot write its member `super_admin`, and the console never admits them | **fail**: row written, console **200** | pass |
| 3 | A's scope cannot reinstate, re-role or delete a grant | **fail**: 1 / 1 / 1 | pass |
| 4 | A tenant scope reads grants (what the platform-admin check needs) | pass | pass |
| 5 | The platform scope grants and revokes | pass | pass |
| 6 | A platform operator grants and revokes through the Access Management console | pass | pass |

**Mutation.** `red/M1-console-outside-system-scope.txt` takes
`/api/admin/access` out of `SYSTEM_SCOPE_PREFIXES`. Case 6 then fails: the
console's grant is refused and answers 500. That shows the console's write
depends on the system scope, and that the contract catches it if the scope is
lost.

**An existing assertion changed.** `tests/db/entitlement-grants-resolution.dbtest.ts`
pinned the table as "not RLS-governed". Its purpose, stated by the case after
it, is that the master-admin lookup sees the row from a per-user scope. That
lookup still passes, unchanged. The posture assertion now pins what makes it
true: RLS and FORCE on, one SELECT policy `true`, and the runtime role able to
SELECT.

| File | Shows |
| --- | --- |
| `green/after.txt` | 6/6 |
| `green/affected-suites.txt` | 9 files, **212/212**: this contract, `entitlement-grants-resolution` (master-admin fallback under a per-user scope), `control-plane-access` (platform operators via `grantPlatformRole`), `module-access-requests`, `master-licensing-console`, `users-rls`, `memberships`, `account-standing`, `two-tenant-application-rls` |
| `green/deploy-migrate.txt` | Through the real applier, twice. Both runs apply the file and complete. |
| `green/full-db-tier-summary.txt` | The whole `tests/db` tier, run before the posture assertion was rewritten. The failures are the 13 pre-existing ones recorded in `../2026-09-28-users-rls/` (identical with `users` RLS off) and that one assertion, which passes now (`green/affected-suites.txt`). |
| `posture.txt` | RLS and FORCE on, the four policies as stored, and `app_service` NOSUPERUSER NOBYPASSRLS. |

**Gates:**

- `ci:migration-set-order` OK (319).
- `ci:migration-drop-safety` OK.
- `ci:rls-allowlist-sync` OK.
- `ci:tenant-isolation:no-regression` OK (8, the same as the baseline).
- `rls-coverage-check.sql` returns 0 rows.
