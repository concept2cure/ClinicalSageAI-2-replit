# P0-5 — SCIM writes from one tenant changed the global identity row (IAM-05, High)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-05. **Plan item:** P0-5 (the no-migration
form: the plan names `organization_users.status` and a per-org display name; neither column exists, the migration set is
inside another lane's window today, so the rule is enforced on the membership row that does exist).

## What was wrong

`users` is a global table; tenancy is the `organization_users` row (`organization_id, user_id, role, persona, permissions`
— no per-org status or display name). Each SCIM Users handler in `server/routes/scim.ts` checked that the calling org
had a membership row for the user and then wrote the global row:

- `DELETE /Users/:id` and `PATCH active=false` ran `UPDATE users SET status = 'inactive'` — org A's IdP offboarding an
  employee deactivated an account that was also a member of org B, platform-wide.
- `PUT /Users/:id` and `PATCH displayName` ran `UPDATE users SET name = …` — org A's IdP renamed the user everywhere,
  and `users.name` is the printed signer name on §11.50 signature manifests
  (`server/services/part11/signature-persistence.ts:673-679`).
- `POST /Users` with an e-mail that already had an account ran `UPDATE users SET status = $1` before adding the
  membership — re-provisioning reactivated an account a platform administrator had suspended; `active:false` in the
  body deactivated it everywhere.
- `PATCH active=true` set `users.status = 'active'` — an IdP could reactivate a platform-suspended shared account.

## What is true now

One rule, `membershipScope()` (`server/routes/scim.ts:355-428`): a SCIM tenant may change `users.status` or `users.name`
only when it is the user's **sole** organisation (`SELECT COUNT(*) FROM organization_users WHERE user_id = $1` is 1;
every caller has just verified its own membership row, so that one is the caller's). When the count is not exactly 1 —
including when it cannot be read — the tenant is not assumed to own the account and its effects stop at its membership:

| Request | Sole-organisation user | User in other organisations too |
|---|---|---|
| `DELETE`, `PATCH`/`PUT` `active=false` | today's global `UPDATE users SET status = 'inactive'` (the contract `tests/db/account-standing.dbtest.ts:92-97` replays), plus `invalidateOrgMembershipCache(userId, orgId)` | `DELETE FROM organization_users WHERE user_id = $1 AND organization_id = $2` (the `server/routes/tenant-users.ts:625-661` precedent), cache invalidated, `users.status` untouched; audited `scim.user.deactivated` with the reason "membership removed from this organization; the account remains active for its other organisations" and metadata `{membershipRemoved, accountStatusUnchanged, organizationCount}`; the response says `active:false` because in this tenant the user is gone (a following `GET` is 404) |
| `PUT`/`PATCH` rename | renamed as before | refused: 403, `scimType: mutability`, "displayName is managed by the account's owning organisation; this user belongs to other organisations". Compared against the **stored** name, so a full-profile `PUT` that restates the name (Okta's deactivation shape) still deprovisions instead of being refused |
| `POST` for an existing e-mail | membership added; `users.status` never written; 201 reflects the stored status (`active:false` for a suspended account); `active:false` in the body deactivates nobody | same |
| `PATCH`/`PUT` `active=true` | `users.status = 'active'` as before | no-op on status, info log naming why, response reflects the stored status, no "activated" audit row (nothing was activated) |

`refuseIfNotEntitled`, the response shapes, the 404s and the asymmetric suspended-tenant behaviour are unchanged. `PUT`
additionally writes the `scim.user.deactivated` / `scim.user.activated` audit row when it changes a sole-org user's
status; it wrote none before.

| | File | Result |
|---|---|---|
| red | `red/scim-tenant-scoped-writes-before-fix.txt` | 10 of 12 fail on HEAD `dac69d76` with `scim.ts` unchanged: multi-org DELETE, PATCH `active=false`, PUT and PATCH rename, PUT same-name `active=false`, PATCH `active=true` on a suspended account, both POST-existing cases, the fail-closed unknown-count case; the sole-org DELETE fails only on the missing cache invalidation (its global-UPDATE assertion passes). The two that pass are the sole-org PATCH `active=false` and PUT rename, today's behaviour, which stays |
| green | `green/scim-tenant-scoped-writes-after-fix.txt` | 34 of 34: the 12 new cases and the 22 existing `scim-provisioning.contract.test.ts` cases |

Tests: `server/__tests__/security/scim-tenant-scoped-writes.contract.test.ts` (new; asserts on the SQL and parameters
the mocked pool received, not on the response alone; `invalidateOrgMembershipCache` is mocked and asserted). No
assertion in `scim-provisioning.contract.test.ts` pinned the defect and none was changed; note that its "DELETE
deactivates a member" case answers every query with `{rows:[{id:100}]}`, so under the new code it exercises the
membership-scoped path (count unreadable → not sole-org) and its 204 + audit assertions still hold. The sole-org global
contract is pinned by the new file.

Gates: `ci:tenant-isolation:no-regression` OK (8 current, 9 baseline; `scim.ts` is whole-file allowlisted and
contributes no finding — the intentionally unscoped count query asks the cross-tenant question "is this account shared?"
and is covered by that entry); `ci:discarded-audit-write` no new occurrences; `check:security-patterns` 0 violations;
`npx tsc --noEmit -p tsconfig.check.json` reports nothing for the two files.

## Not done here

- The plan's acceptance dbtest ("org A's SCIM DELETE of a user also in org B leaves B's membership and `users.status`
  unchanged") is not run: real-database tests cannot run in this container (no pgvector for the migration set). The
  contract test pins the exact statements; the dbtest against PostgreSQL remains to be filed.
- A per-org display name is not modelled (no migration today), so a shared account's name is refused rather than
  stored per tenant. If the product wants a per-tenant display name, that is a schema change under Rule 1.
- `PUT` is still gated by `refuseIfNotEntitled` unconditionally, so a `PUT active=false` on a suspended tenant is refused
  while the equivalent `PATCH` and `DELETE` go through; pre-existing asymmetry, untouched.
- `POST` does not invalidate the membership cache after adding a membership (negative entries live up to 60 s);
  pre-existing, untouched.
