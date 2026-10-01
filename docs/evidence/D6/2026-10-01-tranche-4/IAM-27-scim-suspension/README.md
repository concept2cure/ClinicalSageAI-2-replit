# IAM-27: a SCIM write never lifts or replaces a platform suspension

Date: 2026-10-01. Lane: D6 (security tranche 4). Found by the control tower while registering the P1-49 verifier's
residuals; re-read at head before it was fixed.

## What was wrong

P0-5 (IAM-05) confined a SCIM tenant's writes to its own membership, except when the tenant is the user's only
organisation: then `users.status` and `users.name` are its to write. `users.status` holds three values (`active`,
`inactive`, `suspended`), and `suspended` is a platform administrator's hold
(`server/routes/admin/master-admin.ts`, `PATCH /users/:id/status`). On a sole-organisation account:

- `PATCH` with `active: true` wrote `status = 'active'` over `suspended`;
- `PUT` with `active: true` did the same, and so did a `PUT` that left `active` out, because the handler read an
  omitted `active` as true (`body.active === false ? 'inactive' : 'active'`);
- `PATCH`/`PUT` with `active: false` and `DELETE` wrote `inactive` over `suspended`, after which an `active: true`
  lifted it in a second step.

So an organisation's identity provider could undo a platform suspension, the control a platform administrator uses
on a compromised or abusive account. A `PUT` that left `active` out also reactivated an account the same IdP had
deactivated.

## What changed (`server/routes/scim.ts`)

- SCIM owns `active` and `inactive` only (`SCIM_OWNED_STATUSES`). A sole-organisation account whose status is
  anything else is held by the platform, and is treated as a shared account is for its status: activation is a no-op
  (logged, no audit row, since nothing is written), and deactivation (`PATCH`/`PUT` `active: false`, `DELETE`) removes
  this organisation's membership, with its record, and leaves the hold in place. The record says so
  (`the account stays suspended by the platform`, `platformHold` in its details). The name stays the sole
  organisation's to change.
- A `PUT` that leaves `active` out changes no status, on every path (`statusAsked`).
- The sole-organisation writes moved into helpers (`replaceSoleOrgAccount`, `patchSoleOrgAccount`,
  `writeHeldAccount`, `replaceOwnedAccount`, `patchOwnedAccount`), each with its record in the write's transaction
  as P1-49 left it. The file's ESLint warnings stay at five, as at head.

## Tests

`server/__tests__/security/scim-tenant-scoped-writes.contract.test.ts`, assertions on the SQL the pool received:

| Case | Red (head) | Green |
|---|---|---|
| suspended sole-org account: `PATCH active=true`, `PUT active=true`, `PUT` with no `active` write no status | fail (status written) | pass |
| suspended sole-org account: `PUT` renames, status untouched | fail (`name, status` written) | pass |
| suspended sole-org account: `PATCH active=false`, `PUT active=false`, `DELETE` remove the membership, write no status, record a deactivation | fail (status written, no membership removed) | pass |
| deactivated sole-org account: `PUT` with no `active` does not reactivate | fail | pass |
| shared account: `PUT` with no `active` removes nothing (added during the fix, see below) | n/a | pass |
| control: `PATCH active=true` still reactivates an account SCIM deactivated | pass | pass |

- `red/scim-tenant-scoped-writes.txt`: 8 failed, 13 passed (head).
- `green/scim-tenant-scoped-writes.txt`: 22 passed.
- `red/mutant-shared-omitted-active.txt`: during the fix the shared path briefly read the omitted `active` as the
  stored status, so a shared account stored `inactive` would have lost this organisation's membership on a plain
  `PUT`. The case added for it fails on that mutant (1 failed) and passes on the fix.
- `red/mutant-scim-owns-suspended.txt`: with `suspended` added to the statuses SCIM owns, 7 cases fail.
- `green/scim-neighbours.txt`: every SCIM unit suite and the tenant-scope middleware, 82 passed.
- `green/scim-dbtests.txt`: `account-standing`, `session-termination`, `role-config-change-audit` and
  `compliance-review-fix-round` on PostgreSQL as `app_service` with RLS on, 75 passed (the sole-organisation
  `DELETE` that `account-standing` relies on still writes `inactive`).

## What remains

- A platform suspension lifted by the platform after an IdP deprovisioned a held sole-organisation account leaves
  an account with no membership: it can sign in to nothing. That is the intended result.
- SCIM writes no audit row for a rename, as before this change.
