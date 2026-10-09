# D3 — an organization's row is written by that organization or the platform

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-26. Claimed before any change (`33e16e7a`); the item this
lane handed on the day before.
**Database:** `c2c_d3b`, PostgreSQL 16, provisioned from empty by
`scripts/db/provision-test-db.sh`. The runtime connects as `app_service` (not
superuser, no BYPASSRLS) with `RLS_ENFORCE=on`. See `posture.txt`.

**What this is not:** the row's closing evidence, which is the contract against
staging with the production image, owed with D1.

## The defect

`public.organizations` had no RLS, and `app_service` may UPDATE it. So any
tenant scope could rewrite any organization's tier, seats, settings, Stripe ids
and API key. Its tenant key (`id`, `uuid`) has been immutable since
`../2026-09-25-organizations-tenant-key/`; this change covers the rest of the
row.

## Why the policy could not simply be added

The obvious policy is to allow UPDATE and DELETE only by the row's own tenant or
the platform scope. It breaks five platform-staff override paths. Each one lets
staff name **another** organization, then writes it from the staff member's
**own** request scope, where the role is `super_admin`, not the system scope's
`app_super_admin`:

- `organizations-routes.ts`:
  - `PATCH /:id/profile`;
  - `PATCH /:id/settings`.
- `tenant-config.ts`:
  - `PATCH /:tenantId/settings`;
  - `POST /:tenantId/settings/reset`;
  - `PATCH /:tenantId/settings/:section`.

`red/policy-without-staff-scope.txt` shows this happening, on the production
routers:

| Path                     | Policy alone                                                                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PATCH /:id/settings`    | **Answered success and wrote nothing** (_"answered success, wrote nothing"_). It never checked its UPDATE, and it wrote an audit row for a change that did not happen. |
| `PATCH /:id/profile`     | 500                                                                                                                                                                    |
| `tenant-config` settings | 500                                                                                                                                                                    |

The writer map for this change covered every UPDATE and DELETE of
`organizations` in `server/`. Every other writer already runs in the right
scope:

- the org's own scope: billing checkout, seats, the AnA tool policy, AnA
  platform settings, onboarding;
- the system scope: `/api/admin/master` status and tier, `/api/tenants`
  offboarding, and the Stripe webhook through `runWithSystemTenantScope`.

The boot-time bootstrap and `tenants-simple.ts`' separate client connect
without the app's `app.rls_enforce` setting (the runtime pool sets it per
connection, `server/db/rlsEnforcement.ts`), so the policy's shadow clause
passes them as before.

**Staff cannot be minted by a tenant.** "Platform staff" is the caller's
`organization_users.role` in their own org. Every application writer of that
column is limited to `admin`, `manager`, `member` and `viewer`: SCIM,
`tenant-users.ts`' two schemas, and `users.ts`, which writes persona only. So
the system scope below cannot be reached by a tenant promoting itself through
the product.

## The change

1. **`server/middleware/staffCrossOrgScope.ts`** opens the system scope for a
   request only when two things hold:

   - the router's **own** staff test passes (it does not widen who counts as
     staff);
   - the organization named in the URL is not the request's scope.

   It reuses `establishRequestSystemScope`, the mechanism the system-prefixed
   consoles already use. An org administrator acting on their own organization
   stays in their tenant scope. The five routes mount it after authentication.

2. **Zero-row writes are no longer answered as changes.** `PATCH /:id/settings`
   checks its UPDATE (`.returning`), and so do `PATCH /:id/profile` and all
   three `tenant-config` writes. A write that matches nothing is a 404, and the
   settings route writes no audit row for it.
3. **`migrations/20260926_organizations_own_writes.sql`**:

   - enables and FORCEs RLS;
   - UPDATE and DELETE use the canonical `tenant_isolation_policy` expression
     keyed on `id`;
   - SELECT and INSERT stay open, because pre-auth lookups and signup use the
     table before any tenant exists.

   The file is in `C2C_MIGRATION_FILES` above the final isolation pair. It
   converges on every run, with nothing dropped. Its policy names differ from
   the one the sweep's heal pass may drop.

4. **`tests/db/rls-policy-inputs.dbtest.ts`**: `organizations` now has RLS, so
   yesterday's reviewed exception is gone, and with it the exception mechanism.
   Its self-test now reconstructs the 2026-09-25 finding directly: disable the
   table's RLS and the sweep must report it.

## The evidence

`tests/db/organizations-writes.dbtest.ts` is new. It mounts the global `/api`
auth boundary and both routers at their registered paths, with a real staff
user (`super_admin` in org A) and org A's administrator. Nothing is stubbed. It
checks the row, not the answer: a 200 counts only if the database changed. The
staff settings case also requires `auditTrail.persisted: true` for org B's row.

| File                                 | Shows                                                                                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `red/before-no-policy.txt`           | Before: **1 fail, 5 pass**. Tenant A's scope wrote B's organization row; the five staff paths worked.                                                 |
| `red/policy-without-staff-scope.txt` | The policy alone: **3 fail, 3 pass**. The tenant write is refused, and the staff paths break as the table above describes.                            |
| `red/M1-no-staff-system-scope.txt`   | The fix with the middleware made a pass-through: **3 fail**. Each is now a visible **404**, where the unchecked settings write used to claim success. |
| `red/M2-organizations-rls-off.txt`   | The fix with the table's RLS disabled: **2 fail**. The tenant write lands, and the sweep reports `public.organizations`.                              |
| `green/fixed.txt`                    | **10 of 10** (this contract plus the sweep), after both mutations were reverted.                                                                      |
| `green/final-three-contracts.txt`    | This contract, the sweep and `vault-program-ownership.dbtest.ts` on the final code: **19 of 19**.                                                     |
| `green/tests-db-tier.txt`            | The whole `tests/db` tier: **711 of 718**. The same 7 failures in three other suites fail identically without this change, as measured on 2026-09-25. |
| `posture.txt`                        | RLS, FORCE, the four policies and the triggers on `public.organizations`.                                                                             |

**Unit tests.** `server/routes/__tests__/organizations-profile-settings.test.ts`
changed in three ways:

- its auth stub opens the caller's tenant scope, as the real `authMiddleware`
  does;
- the settings cases say the UPDATE matched a row;
- two cases are new: the system scope opens only for staff acting on
  **another** org, and a zero-row settings update is a 404 with no audit row.

With staff detection removed from the router, the staff case fails. The 24 unit
files that touch these routers or the scope middleware pass, 257 tests.

## Still asserted, not proven

- **Reads of `organizations` stay open:** any tenant scope can list every
  organization, including `api_key` and the Stripe ids. No route is known to
  expose that. Narrowing it first means finding every pre-auth reader.
- **`organization_users` has no RLS at all** (read from the catalog while
  writing this). Any tenant scope can write any organization's membership rows
  at the database, including a staff role, and `authMiddleware` accepts a
  token for an organization on exactly that row. The application never writes
  a staff role (above), so no route is known to reach it. It is the same class
  as this row, and more serious than anything above, so it is recorded here and
  taken up next by this lane.
- **`tenants-simple.ts`** still uses its own `postgres()` connection that
  bypasses the instrumented pool and every scope.
- **Staging.** The row closes there, with the production image, owed with D1.
