# D3: an invitation to another organization could not be accepted under enforcement

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-28. The row was claimed before any change. This was the open
item recorded under the `organization_users` hand-ons: "accepting an invitation
to another organization is broken under enforcement … Needs a decision on how
an invitee reads an invitation across tenants (a narrow definer lookup by
token, or the platform scope for that one read)". The decision is below.
**Database:** `c2c_d3u`, PostgreSQL 16, provisioned from empty by
`scripts/db/provision-test-db.sh`. The runtime connects as `app_service`, which
is not a superuser and has no BYPASSRLS, with `RLS_ENFORCE=on`
(`posture.txt`).

**What this is not:** the row's closing evidence. That is the contract run
against staging with the production image, owed with D1.

## The defect

When an administrator of organization B adds an account that already belongs
to organization A, the result is a **pending invitation** in B, not a
membership. Membership needs the invitee's consent (decision-register item 12,
#727). The invitee, signed into A, then lists it, accepts it or declines it
(`server/routes/tenant-users.ts`, `/invitations/*`).

`organization_invitations` carries the FORCEd tenant isolation policy, so in
A's request scope B's invitation does not exist. Measured through the
production routes behind the production auth boundary (`red/before.txt`,
3 of 5 fail):

- **The invitee's list was empty.**
- **Accept answered 404** `NOT_FOUND`.
- **Decline answered 404.**

Under the production posture, a person could be invited and never join.

## The decision, and the change

Of the two options recorded, I took the **narrow definer lookup**, narrowed
further. The platform scope was rejected: it would hand the whole
`app_super_admin` bypass to a user-facing request path for one read.

- **`migrations/20260928_invitations_for_member.sql`** (in
  `C2C_MIGRATION_FILES` after the `platform_role_grants` file) adds
  `public.invitations_for_member(p_user_id)`.
  - It returns the invitations naming `p_user_id`, whichever organization
    issued them, but **only when `p_user_id` is a member of the calling scope's
    own organization**. A tenant scope can ask about its own members and nobody
    else. The route asks about the verified caller.
  - It is SECURITY DEFINER, and its body runs with the platform role so that it
    answers on any owner. The membership test reads `app.current_tenant_id`,
    which that SET does not touch.
  - EXECUTE is revoked from PUBLIC and granted to `app_service`.
  - The table's own policy is unchanged.
- **`GET /invitations/mine`** lists through the function.
- **Accept and decline** first find the caller's own invitation through the
  function, then write inside the **inviting organization's scope**. The
  helper is `inVerifiedOrgScope`, the one tenant-users already used for a
  two-organization admin, now documented for this case too. In that scope, the
  table's policy admits the invitation row, the membership write
  (own-organization policy), the quota lock on the organization row, and the
  status update. `atomicAcceptInvitation` is unchanged, and it re-reads and
  re-checks the invitation inside its transaction.
- **Another person's invitation answers 404, not 403.** The lookup finds only
  the caller's own invitations, so the existence of anyone else's is not
  disclosed. The mocked contract's two stranger cases now pin 404.
- **A decline must reach its row.** A decline that matches nothing now answers
  409. Before this change it answered 200 after writing nothing, and M3 below
  shows exactly that case.

## The contract

`tests/db/invitation-acceptance.dbtest.ts` runs on the two-tenant fixture,
through the production tenant-users and organizations routers behind
`createAuthBoundary`.

| # | Case | Before | After |
| - | --- | --- | --- |
| 1 | The invitee, signed into A, sees the invitation to B | **fail**: `[]` | pass |
| 2 | The invitee accepts: membership in B written, the invitation marked accepted, and a token for B then admitted by the organizations route (200) | **fail**: 404 | pass |
| 3 | The invitee declines: no membership, the invitation kept as declined | **fail**: 404 | pass |
| 4 | Another member of A cannot see, accept or decline it | pass | pass |
| 5 | The lookup answers only about the calling organization's own members (A asks about its member: found; B, the issuer, asks about a non-member: nothing) | n/a | pass |
| 6 | B's scope reads none of A's invitations directly (the table's policy, unchanged) | pass | pass |

**Each part was made to fail its own case:**

| File | Mutation | Fails |
| --- | --- | --- |
| `red/M1-lookup-without-membership-clause.txt` | the function without its membership clause | case 5: the lookup answered about a non-member |
| `red/M2-accept-in-session-scope.txt` | accept outside the inviting organization's scope | case 2: 404 `NOT_FOUND` |
| `red/M3-decline-in-session-scope.txt` | decline outside it | case 3: 409, the update reached nothing (this was a silent 200 before) |

| File | Shows |
| --- | --- |
| `green/after.txt` | This contract plus `memberships`, `users-rls` and `organizations-writes`: **33/33** |
| `green/mocked-contracts.txt` | `tenant-isolation-tenant-users.contract` and `atomic-quota-organization-ceilings`: **31/31**. The first was updated: its SQL mock serves the function, and its stranger cases expect 404. |
| `green/deploy-migrate-twice.txt` | Through the real applier, twice. Both runs apply the file and complete. |
| `green/full-db-tier-summary.txt` | The whole `tests/db` tier: 774/787. The 13 failures are the same pre-existing ones, by name, recorded in `../2026-09-28-users-rls/`. |
| `posture.txt` | The function (SECURITY DEFINER, its `proconfig`, EXECUTE grants), the table's FORCEd policy unchanged, and `app_service` NOSUPERUSER NOBYPASSRLS. |

**Gates:**

- `ci:migration-set-order` OK (320).
- `ci:migration-drop-safety` OK.
- `ci:rls-allowlist-sync` OK.
- `ci:tenant-isolation:no-regression` OK (8, the same as the baseline).
- `rls-coverage-check.sql` returns 0 rows.
- ESLint on the changed files gives the same warning count as trunk.

## Not done here

- The response still names the inviting organization by id only.
  Showing its name would be a further, deliberate cross-organization read,
  and is left to the D2 surface that renders the list.

## Amended 2026-09-29: the migration halted the set on a database without the table

`migrations/20260928_invitations_for_member.sql` created its function
unconditionally. PostgreSQL validates a `LANGUAGE sql` body when the function
is created, so on a database without `organization_invitations` the whole set
stopped at this file.

- **Where it showed:** `tests/schema-contract/tenant-isolation-sweep.contract.test.ts`
  applies the set to a minimal base, and it has been red since `7347a3e2`
  (`amend-2026-09-29/red-unguarded.txt`).
- **The fix:** the function is now created only when both tables it reads
  exist; otherwise it is skipped with a NOTICE, like its siblings. The file is
  amended in place with a dated note (Rule 1). The contract passes 19/19
  (`amend-2026-09-29/green-guarded.txt`).
- **The same latent defect in `20260928_users_membership_rls.sql`** (`user_id_for_email`)
  is guarded the same way.
- **Checks on the result:**
  - Both files skip cleanly on an empty database.
  - On the provisioned database, `invitation-acceptance`, `users-rls` and
    `memberships` pass 27/27.
  - The full `tests/schema-contract` suite passes 91/91. One mid-run failure
    came from the red reproduction swapping the file under it; re-run, 19/19.
