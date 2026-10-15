# D6 — Master Administration and the owner grant read platform standing, never a tenant membership role (2026-10-05)

**Row:** D6 (security posture). This is the same class as
`docs/evidence/D6/2026-10-05-business-center-standing/`, on the cross-tenant
console. It was handed on there as item 2 and claimed on the board the same
day.

## What was wrong

Master Administration (`/api/admin/master/*`, SCIM tenant administration,
tenant purge, the licensing console and more) shows **every organisation**:
its users, its audit and its subscriptions. Its guard,
`server/middleware/requirePlatformAdmin.ts` `isPlatformAdmin`, admitted a
request role of `super_admin`, `platform_admin` or `support`. The owner grant
(`server/services/entitlements/master-admin.ts` `isMasterAdminIdentity`)
admitted a request role of `super_admin`. The owner grant exempts its holder
from the tenant boundary on access requests.

Behind `server/auth.ts`, the request role **is the tenant membership role**
(`organization_users.role`). That column has no CHECK. No current writer
produces those values, but a legacy row, a future writer or a hand edit
would give that member every organisation's data. The owner-grant suite even
said "The role is the platform's record". On this path it is not.

No production code puts a platform role on a request: a search of `server/`
for these roles assigned to `role`, `userRole` or `roles` finds nothing
outside tests. Platform standing reaches a real request only through the
allowlists or `platform_role_grants`. So the role read served test harnesses
alone, and the change refuses no real platform user.

## What changed

- `isPlatformAdmin` no longer reads the request role. Platform standing is:
  - `PLATFORM_ADMIN_EMAILS` on the owner's own sign-in (never SAML,
    unchanged), **or**
  - an active `platform_role_grants` row (`resolvePlatformAdmin`, unchanged).
- `isMasterAdminIdentity` no longer reads `role` / `roles`. The owner signal
  is:
  - `MASTER_ADMIN_EMAILS` on the owner's own sign-in, **or**
  - a `super_admin` grant row (`resolveAdminStanding`, unchanged).

The header comments say what was removed and why.

## Shown failing first

- [`red-before.txt`](red-before.txt): with the trunk sources for both modules,
  **15 of 168** fail across the twelve updated suites. All 15 are new or
  inverted. In each, a membership role (`super_admin`, `platform_admin` or
  `support`) with no grant is let through:
  - the guard (×4);
  - Master Admin, both SCIM consoles, the tenant list, the chain verify and
    navigation (×6);
  - the owner signal, through the role, `roles[]`, SAML and the request
    adapter (×5).
- [`green-after.txt`](green-after.txt): 168 of 168 pass. All 85 suites that
  touch platform or business standing pass (1,192 tests, 17 skipped).
- [`mutants.txt`](mutants.txt): each mutant turns the suites red:
  - the guard reads the request role again (10 fail);
  - the owner signal reads it again (3);
  - standing ignores the grant row (59).

## Live, on the running app

Run on the local `clinicalsage` database (migrated, runtime role `c2c`).
Dana Reyes was added through user administration. Her membership row was set
to `super_admin` by SQL, standing in for the legacy or hand-edited row. See
[`live-before-after.jsonl`](live-before-after.jsonl):

| Dana Reyes, signed in | before (trunk sources) | after |
|---|---|---|
| membership `super_admin`, no grant: `/api/admin/master/overview` | **200** | **403** |
| the same: `/api/admin/master/tenants` (every organisation) | **200** | **403** |
| the same: `/api/admin/master/users` (every organisation's users) | **200** | **403** |
| the same: navigation standing | **platformAdmin true, masterAdmin true** (the owner grant) | false, false |
| a plain member holding an active `support` grant: `/overview` | 200 | 200 |
| the same: navigation standing | platformAdmin true, masterAdmin false | platformAdmin true, masterAdmin false |

The membership row and the grant were reset after each run. The same local
database caveat applies as in the Business Center evidence.

## Test harnesses updated

Ten other suites gave platform identity through the request role. Each now
gives it the way production does, a `platform_role_grants` row keyed by the
user's id, and says why in a comment. Inverted assertions are listed:

- `server/routes/admin/__tests__/master-admin.test.ts`: the admin holds a
  `super_admin` grant. A test was added for a membership role with no grant.
- `scim-ip-allowlist-admin.test.ts` and `scim-tenants-admin.test.ts`: the auth
  stub sets `req.userId`, as `server/auth.ts` does, and the caller holds a
  grant. A refusal test was added to each.
- `master-admin-designation.test.ts`: **inverted** "a request role of
  super_admin is the owner with no query". It is now refused, and the grant
  table is consulted.
- `chain-head-on-demand.test.ts`: the platform admin is a grant holder with
  tenant role `member`. Before, the estate-wide unreadable-anchor case passed
  without reaching the estate path. A test was added.
- `clinical-regulatory-evidence-ingest.test.ts`, `tenants-simple-purge-audit.test.ts`:
  each caller holds a grant row.
- `tenant-isolation-tenants-simple.contract.test.ts`: the two cross-tenant read
  cases use the owner's allowlisted sign-in, because those routes call the
  synchronous `isPlatformAdmin`. A test was added: a membership role of
  `super_admin` does not get the cross-tenant list.
- `module-subscriptions-platform-admin.test.ts`: **inverted** "a super_admin:
  platformAdmin true". It is now a membership role with no grant, refused. The
  positive case remains through the in-app designation test.
- `access-management.test.ts`: each user holds the grant for what they are.
  The two business-tier refusals for support and platform_admin now assert
  that the business-tier check refused them. Before, the router guard refused
  them first, so those tests passed for the wrong reason.

Source comments in `scim-tenants.ts` and `scim-ip-allowlist.ts` said the gate
read roles. They are corrected.

## Found here, handed on (board item 3)

Seven routes call the **synchronous** `isPlatformAdmin`:

- `tenants-simple.ts` (×2);
- `audit-trail-routes.ts` (×2);
- `vault-legal-holds.ts`;
- `services/audit/audit-api-authority.ts`;
- `src/routes/control-plane.router.ts`.

It never consults grants, so a grant-holding staff member never passed them,
before or after this change. They now admit only the owner's own sign-in.
This refuses no real user who was admitted before. Moving them to
`resolvePlatformAdmin` belongs with the six cross-tenant staff powers on the
board.

## Gates

- `tsc`: 0 errors.
- ESLint ratchet `--since HEAD`: no file changed its warning count.
- `ci:server-error-leaks`, `ci:tenant-isolation`, `ci:tenant-entry-points`,
  `check:security-patterns` (0 violations) and `ci:db-test-isolation` pass.
