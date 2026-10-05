# D6 — cross-tenant staff powers read platform standing, never a tenant membership role (2026-10-05)

**Row:** D6 (security posture). This is board item 3 from
`docs/evidence/D6/2026-10-05-platform-standing/`, and the third change in this
class after the Business Center and Master Administration.

## What was wrong

Eight places gave an **across-organisations** power from the request role or
from the synchronous allowlist-only check:

| Site | Power | Role read |
|---|---|---|
| `organizations-routes.ts` | list every organisation; read and write any one, in the system scope | `platform_admin`, `super_admin`, `superadmin` |
| `tenant-config.ts` | read and write any tenant's settings, in the system scope | `super_admin` |
| `tenant-users.ts` | administer any organisation's users | `super_admin` |
| `clients-routes.ts` | load any organisation's client workspace | `super_admin` |
| `tenantLifecycleGuard.ts` | pass a suspended or offboarded tenant's block | `super_admin`, `app_super_admin`, `platform_admin` |
| `part11-compliance.ts` seal-integrity | estate-wide audit verification, with hash material | `super_admin`, `platform_admin` |
| `audit-trail-routes.ts` chain monitor | the estate-wide integrity monitor | synchronous `isPlatformAdmin` (no grant lookup) |
| `tenants-simple.ts` | the tenant list, and any tenant's user directory | synchronous `isPlatformAdmin` |

Behind the auth gate, the request role is the caller's **tenant membership
role** (`organization_users.role`). That column has no CHECK. So a membership
row naming one of these roles crossed tenants, and the opposite also held:
staff designated in Access Management, who hold `platform_role_grants` rows,
were treated as members on every one of these paths.

## What changed

- **One decision, `holdsPlatformRole(req, roles)`, in `requirePlatformAdmin.ts`.**
  - Standing is the owner's own sign-in on `PLATFORM_ADMIN_EMAILS` (never
    SAML), which holds every role, or an active grant row for one of `roles`.
  - It is memoised per request and role set, so a guard and its handler cost
    one lookup.
  - It fails closed on a lookup error.
  - It takes the verified id from `req.userId`, or from `req.user.id` behind
    `middleware/auth.ts`, which sets only `req.user`.
  - `resolvePlatformAdmin` delegates to it.
- **Each site keeps its own role set**, now checked as standing. The legacy
  `superadmin` and `app_super_admin` spellings are not grant roles and go with
  the read.
- **`staffCrossOrgScope` accepts an async staff test.** It asks the test only
  when the URL names another organisation, so own-organisation requests cost
  no lookup.
- **The lifecycle guard asks for standing only on its three refusing paths**:
  the posture refuses, the posture is unreadable, or the guard crashes. A
  request the posture admits makes no lookup. The override's audit row gains
  `overrideBasis: 'platform_standing'`, because `actorRole` is the membership
  role.
- **`tenant-config` writes:** the tenant's own `admin`, or staff. A membership
  `super_admin` could write its own tenant before. No product path writes that
  value, so no user loses access.

**Left as they are, measured:** `audit-api-authority` (the audit reader),
`vault-legal-holds` and the control plane's org-admin check. Each acts in the
caller's own organisation, so none crosses tenants. They keep the synchronous
owner check beside their tenant roles.

## Shown failing first

- [`red-before.txt`](red-before.txt): with the ten source files at trunk,
  **69 of 287** fail across the twelve changed or new suites.
  - In `requirePlatformAdmin.test` (7), the shared check does not exist at
    trunk.
  - Every other failure is a behaviour assertion. The membership role crosses
    tenants (200 or a system scope where 403 is due), or the grant holder is
    refused.
  - Both agents also checked their suites against the old routes in a
    separate copy of the tree, and every new failing test failed there for a
    behaviour reason.
- [`green-after.txt`](green-after.txt): 287 of 287 pass. All 106 suites that
  touch platform, business or cross-tenant standing pass (1,784 tests). Three
  files fail identically on trunk in this container and are not counted:
  `passwordResetAuditTrail`, `authEnterprise-audit-organisation` and
  `audit-compliance-reports`.
- [`mutants.txt`](mutants.txt): six mutants, each red:
  - standing reads the request role again (25);
  - standing ignores the grant row (58);
  - no per-request memo (1);
  - organisations staff from the request role (14);
  - the lifecycle guard asks for standing on every request (2);
  - the cross-org scope opens for anyone (8).

**Tests updated.** Inverted, with the reason in each:

- `tenantLifecycleGuard` "recognises a platform role carried in the roles
  array";
- `part11TenantScoping` "still admits a genuine platform role";
- `tenant-users` "super_admin may list any org";
- `clients-routes` "super_admin can fetch any workspace".

`master-admin-designation`'s revocation case used one request object for two
requests. With the memo, each request is its own object.

The `clients-routes` test double returned the staged rows whatever the WHERE
clause said, so "fetch a foreign workspace" passed whether or not the org
filter ran. It now applies the WHERE.

## Live, on the running app

Run on the local `clinicalsage` database (migrated, runtime role `c2c`).
**Northwind Bio** (organisation 7) and a client workspace in it were added as
the database owner with triggers off. Self-service sign-up answers 500 on this
database: legacy objects from an earlier bootstrap (an `identity` schema sync
trigger, from files not in the deploy set) call `audit.log_event` without
EXECUTE. This is the same pre-provisioned database whose readiness contract
fails.

Dana Reyes (a member of Concept2Cure Therapeutics) signed in each time. See
[`live-before-after.jsonl`](live-before-after.jsonl):

| | membership `super_admin`, no grant: before | after | plain member with a `super_admin` grant: before | after |
|---|---|---|---|---|
| `GET /api/organizations` | **200, 2 organisations** | 200, 1 | 200, 1 | **200, 2** |
| `GET /api/organizations/7` | **200** | 403 | 403 | **200** |
| `GET /api/tenant-config/7/settings` | **200** | 403 | 403 | **200** |
| `GET /api/tenant-users/7` | **200** | 403 | 403 | **200** |
| `GET /api/tenants` | 200, 1 | 200, 1 | 200, 1 | **200, 2** |
| `GET /api/tenants/7/users` | 403 | 403 | 403 | **200** |
| `GET /api/audit/chain-monitor/status` | 403 | 403 | 403 | **200** |
| `GET /api/part11/audit-trail/seal-integrity` | **503, past the gate** | 403 | 403 | 503, past the gate |
| `GET /api/clients/<Northwind workspace>` | 404 | 404 | 404 | 404 |

- A membership `platform_admin` behaved the same, before and after, on
  organisations and the seal check.
- The 503 is the verifier behind the gate failing on this database, so a 503
  means the gate admitted the caller.
- The row membership and the grant were reset after each run.

## Found here, handed on

**`clients-routes` staff path.** The route admits staff, but it never opens
the system scope. Row-level security therefore hides another organisation's
workspace, 404 before and after. That is the safe direction. For staff to use
it, the route needs `staffCrossOrgScope` (or an equivalent read in the system
scope), as `organizations-routes` and `tenant-config` have.

## Gates

- `tsc`: 0 errors.
- ESLint ratchet `--since HEAD`: no file changed its warning count. One
  test-file describe was split to stay under `max-lines-per-function`.
- `ci:server-error-leaks`, `ci:tenant-isolation`, `ci:tenant-entry-points`,
  `check:security-patterns` (0 violations), `ci:db-test-isolation` and
  `audit-requestdb-coverage --strict-no-regression` pass.
