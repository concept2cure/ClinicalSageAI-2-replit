# D3 — any tenant could make itself a member of another tenant, or platform staff

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-26. Claimed before any change (`0fc8e490`). Found while
filing `../2026-09-26-organizations-writes/`.
**Database:** `c2c_d3b`, PostgreSQL 16, provisioned from empty by
`scripts/db/provision-test-db.sh`. The runtime connects as `app_service` (not
superuser, no BYPASSRLS) with `RLS_ENFORCE=on`. See `posture.txt`.

**What this is not:** the row's closing evidence, which is the contract against
staging with the production image, owed with D1.

## The defect

`public.organization_users` decides tenancy:

- `authMiddleware` (`server/auth.ts`) admits a token for an organization on
  exactly one row of it;
- "platform staff" is a staff role on that row, and staff reach every
  system-scoped path (`server/middleware/staffCrossOrgScope.ts`, the admin
  consoles).

It had **no RLS**, and `app_service` may write it. As `app_service` in a plain
**member's** tenant scope (`red/psql-membership-write.txt`):

- its user was written an `admin` membership in another tenant;
- its own membership was changed to `super_admin`.

Through the production routes (`red/before.txt`), once that row existed, the
organizations route's own `authMiddleware` admitted the member's token into the
other tenant (**200**, the other organization's record). No application code
is known to write such a row, so this takes SQL running as the runtime role.
What it would give is the whole of another tenant.

**Why it was open.** It is on `RLS_ALLOWLIST` (`server/db/rlsAllowlist.ts` and
its three synced copies), which exempts it from the tenant **read** policy.
Several readers need that exemption:

- the membership check, which runs in the pre-auth scope;
- login, token refresh and `/me`, which list a user's organizations across
  tenants;
- the organization list.

The exemption was read as covering writes too.

## The change

**`migrations/20260926_organization_users_own_writes.sql`** (in
`C2C_MIGRATION_FILES` above the final isolation pair; it converges on every
run, and nothing is dropped):

- **SELECT stays open**, as the allowlist requires.
- **INSERT, UPDATE and DELETE:** the membership's own organization, or the
  platform scope (`app_super_admin`). This is the canonical expression, keyed
  on `organization_id`. RLS is enabled and FORCEd.
- **A staff role is minted only by the platform scope.** The four staff roles
  are `super_admin`, `superadmin`, `platform_admin` and `app_super_admin`.
  - It is a trigger, not `WITH CHECK`, because `WITH CHECK` cannot see the old
    row. It would have refused every write to an existing staff member's row,
    a persona change for example.
  - The trigger refuses an INSERT of a staff role, or an UPDATE that changes a
    role **to** one.
  - Every application writer is already limited to `admin`, `manager`,
    `member` and `viewer`.
- The policy names differ from `tenant_isolation_policy`, the only name the
  sweep's heal pass drops from an allowlisted table. The table stays on the
  allowlist, and its stated reason is rewritten to say reads only.
  `ci:rls-allowlist-sync` passes: 6 entries across 4 consumers.

**Writers moved into the membership's own organization.** Every writer's scope
was mapped first, across `server/`:

| Writer                                                                                                           | Was                        | Under the policy alone                                       | Now                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/signup` (`auth.ts`)                                                                              | Pre-auth scope             | **500 `AUTH_010` on every sign-up**                          | The transaction enters the new organization first, through the same `drizzleWorkspaceStore(tx).enterOrganizationScope` binding the workspace step after it already used |
| `PUT /api/users/me/persona` (`users.ts`)                                                                         | Pre-auth scope             | **404 "No membership in this organization"** to every member | The one UPDATE runs in the verified token's own organization, awaited inside the scope                                                                                  |
| `tenant-users` create, role change, removal, for an admin of two organizations acting on the one not signed into | The session's organization | **404 "User not found"**                                     | `authorizeOrgAccess` returns the role it verified in the target organization; the write runs in that organization's scope (`inVerifiedOrgScope`)                        |

The last row also repairs a regression that
`../2026-09-26-organizations-writes/` introduced. Creating a member in another
organization you administer locks that organization's row `FOR UPDATE`, and the
`organizations` write policy filters that lock outside the organization's own
scope. So it had been answering 404 `ORGANIZATION_NOT_FOUND` since `85b67b50`
(`red/M2-no-verified-org-scope.txt` shows exactly that).

Everything else already writes in the right scope, and the policy allows it:

- setup, SCIM (all three statements), SAML just-in-time provisioning and tenant
  purge run in the system scope;
- the boot seed runs on an owner connection without `app.rls_enforce`.

## The contract

`tests/db/memberships.dbtest.ts` runs on the shared two-tenant fixture, through
the application pool. It uses the organizations router, which authenticates
itself, as the end-to-end probe. The global boundary is **not** a probe: outside
production it runs in warn mode and answers a request with no token at all
(measured while writing this). An earlier draft of this contract used it and
was wrong, so it was replaced before any evidence was filed. Signup and persona
go through production's own `registerPlatformRoutes`, the pre-auth mount.

| #   | Case                                                                  | Before (trunk table)                 | Fixed |
| --- | --------------------------------------------------------------------- | ------------------------------------ | ----- |
| 1   | A's own organization admits A (positive control)                      | pass                                 | pass  |
| 2   | A's scope cannot place its user in B, and B's route refuses A's token | **fail**: row written, route **200** | pass  |
| 3   | A's scope cannot change or remove B's members                         | **fail**: 1 changed, 1 removed       | pass  |
| 4   | A's scope cannot make its own member staff (four roles)               | **fail**: `super_admin` written      | pass  |
| 5   | A manages its own members' ordinary roles (insert, update, delete)    | pass                                 | pass  |
| 6   | The platform scope writes any organization, staff roles included      | pass                                 | pass  |
| 7   | Self-serve signup gives the new organization its admin                | pass                                 | pass  |
| 8   | A member sets their own persona                                       | pass                                 | pass  |
| 9   | A two-org admin adds a member to the other organization               | pass (code moved)                    | pass  |
| 10  | A two-org admin changes a role in the other organization              | pass                                 | pass  |

| File                                  | Shows                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `red/before.txt`                      | The table as on trunk, with the final code: **3 fail** (cases 2–4).                                                                                     |
| `red/policy-without-writer-moves.txt` | The policy with the writers not yet moved: signup **500**, persona **404**, cross-org role change **404**. This run predates case 9, so it has 9 cases. |
| `red/M1-no-staff-role-trigger.txt`    | The trigger disabled: case 4 fails.                                                                                                                     |
| `red/M2-no-verified-org-scope.txt`    | `inVerifiedOrgScope` made a pass-through: cases 9 and 10 fail. Case 9's `ORGANIZATION_NOT_FOUND` is what trunk answers today.                           |
| `red/psql-membership-write.txt`       | Plain SQL as `app_service`, rolled back. Before, both writes land. After, the first is refused by RLS, and the run stops there.                         |
| `green/fixed.txt`                     | **10 of 10.**                                                                                                                                           |
| `green/tests-db-tier.txt`             | The whole tier: **715 of 732**. All 17 failures fail identically without this change (listed in the file); none is new.                                 |
| `posture.txt`                         | RLS, FORCE, the four policies and the trigger.                                                                                                          |

**Unit tests.** The 43 unit files that touch these routes, the scope middleware or the allowlist pass, 497 tests, on the
tree merged with trunk (an `auth-refresh-session-currency` failure seen before the merge, which also failed with
this change stashed, was fixed on trunk meanwhile). `auth-signup-verification.test.ts` mocked
`drizzleWorkspaceStore` as an empty object; its mock gains the one method signup now calls, the only edit to that file.
`green/final-four-contracts.txt`: this contract with the other three D3 contracts on the merged tree, **29 of 29**.
The helper lives in `server/services/tenant/verified-org-scope.ts`, which keeps `tenant-users.ts` under the
file-length limit; the ESLint ratchet reads one warning fewer than trunk.

## Handed on, not fixed here

- **Accepting an invitation from another organization is broken under
  enforcement, before and after this change.** `organization_invitations`
  carries the FORCEd `tenant_isolation_policy`, so an invitee whose session is
  in organization X cannot read an invitation to Y (404). It needs a decision
  about how an invitee reads an invitation across tenants.
- **Fixture passwords refused by `dd6632dd`** (the password rule that bars the
  account's own words) turn `signup-launch-catalog.dbtest.ts` (7) and
  `one-time-credentials.dbtest.ts` (1) red. They belong to the D6 lane.
- **Reads of `organization_users` stay open to every tenant scope.** Narrowing
  them first needs every cross-organization reader moved: the pre-auth
  membership check, login, refresh and `/me`, the organization list,
  `authEnterprise`'s role lookups and the MCP OAuth membership check.
- **Staging.** The row closes there, with the production image, owed with D1.
