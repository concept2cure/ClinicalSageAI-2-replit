# D3: any tenant scope could read and rewrite every account's credentials

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-28. The row was claimed before any change (`c40d3cca`). The
item was handed on by `…013CtPf8` on 2026-09-26 ("→ D3, unclaimed:
`public.users` is readable from any tenant scope").
**Database:** `c2c_d3u`, PostgreSQL 16.13, provisioned from empty by
`scripts/db/provision-test-db.sh` (install-fresh, then deploy-migrate). The
runtime connects as `app_service`, which is not a superuser and has no
BYPASSRLS, with `RLS_ENFORCE=on` (`posture.txt`).

**What this is not:** the row's closing evidence. That is the contract run
against staging with the production image, which is owed with D1.

## The defect

`public.users` holds every account's `password_hash`, `mfa_secret`,
`mfa_backup_codes`, `reset_token` and `email_otp_hash`, and it had no row-level
security. Only `identity.users` had any (`db/migrations/053_gcc_rls_policies.sql`).

Measured as `app_service` in tenant A's request scope, with RLS enforcing
(`red/before.txt`, 3 of 7 fail):

- A read tenant B's user row by id, by email, and by scanning on
  `mfa_secret = …`, with every credential column in the result.
- A overwrote B's `password_hash`, `mfa_secret` and `reset_token` (1 row).
- A's `DELETE` of B's user reached the row. Only a foreign key held elsewhere
  stopped it.

`scripts/db/rls-coverage-check.sql` classified the edge
`users.default_organization_id` as "a preference pointer, not tenancy", so an
install from blank would pass. Its own note said this was a classification, not
a clearance.

## The change

**`migrations/20260928_users_membership_rls.sql`** is in `C2C_MIGRATION_FILES`,
directly after `20260926_organization_users_own_writes.sql` and above the final
isolation pair (`ci:migration-set-order` OK). It converges on every run: ALTER
POLICY when the policy exists, CREATE when it does not, and CREATE OR REPLACE
for the function. It drops nothing (Rule 1).

The policy follows the shape of the `organization_users` policy. **Membership
is what it reads.**

| Command                  | Allowed when                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SELECT, UPDATE, DELETE   | enforcement off (owner connections), **or** a tenant-less scope (`app.current_tenant_id = '0'`), **or** `app_super_admin`, **or** the row's user has an `organization_users` row in the scope's organization |
| UPDATE (`WITH CHECK`)    | the same                                                                                                                                                      |
| INSERT                   | any scope. A new row reaches no existing account.                                                                                                             |

- **The two tenant-less scopes keep the whole table.** Both are defined in
  `server/db/tenantStore.ts`.
  - The pre-auth scope (tenant `'0'`, no role) covers sign-in by email, password
    reset and change, email OTP, MFA, token refresh, signup and verify-email.
  - The system scope (tenant `'0'`, `app_super_admin`) covers SCIM, SAML
    just-in-time provisioning, first-run setup and platform user administration.
  - The comment on `runWithPreAuthScope` said `users` had no RLS. It now says
    what is true.
- **The caller's own row is covered by the membership arm.** A tenant scope is
  opened only for a token that its membership admitted (`authenticateToken`, then
  `enforceOrgMembership`, then `establishRequestTenantScope`). No session
  variable carries the user id, so a separate "own row" arm could not be
  written. `app.current_user_id` is read by old defaults and set by nothing.
- **RLS is enabled and FORCEd.** `users` has no tenant column, so the sweep
  neither covers it nor heals it, and its policies are named separately.
- **`public.user_id_for_email(text)`** answers one question for a tenant scope:
  does this address already have an account? It returns the id and nothing
  else. It is SECURITY DEFINER, and its body runs with
  `app.current_user_role = 'app_super_admin'`, so it gives the same answer on
  any owner. EXECUTE is revoked from PUBLIC and granted to `app_service`.
  tenant-users needs it because an existing account in another organization
  gets a consent invitation, not a membership. That behaviour was already there
  (decision-register item 12, #727). This function is how the check reaches the
  account.

**Writers moved so they work under the policy.** Every reader and writer of
`users` was mapped across `server/` first, by scope.

| Writer / reader | Under the policy alone | Now |
| --- | --- | --- |
| `atomicCreateUser`, new account (`server/services/atomicQuotaService.js`) | `INSERT … RETURNING id` is held to the SELECT policy, and the new user is not yet a member, so the call fails with **42501**. tenant-users answers 400 `DATABASE_ERROR`. | The id comes from the sequence first and is inserted explicitly. The membership follows in the same transaction. |
| `atomicCreateUser`, existing account in another organization | The row is invisible, so the code takes the insert branch. The email is unique, so the call answers **400 `DATABASE_ERROR`** instead of 202 plus a consent invitation (`red/M1-…`). | `SELECT public.user_id_for_email($1)` |
| tenant-users invitation token (`issueInvitation`, now `server/services/tenant/invitation-delivery.ts`) | For an administrator of two organizations acting on the one they are not signed into, the token UPDATE ran in the session's scope. It matched **0 rows silently**, so the setup link was dead while the response said it had been issued (`red/M2-…`). | The UPDATE runs in the verified organization's scope (`inVerifiedOrgScope`, as the create already did). Anything other than one row is an error, so delivery reads `failed` and is never shown as a success. The function moved out of the route file unchanged apart from this, so the ESLint warning ratchet does not grow. |
| `GET /api/tenant-users/:tenantId` for the other organization | Showed an **empty organization** (`red/M3-…`). | Runs in the verified organization's scope. |

Everything else was already in a scope the policy admits:

- The pre-auth routes: `auth.ts` login, reset, change, verify-email and
  last_login; `mfaService`; `emailOtpService`; `auth-security-service` lockout.
- The system routes: SCIM (all statements), `sso.ts` JIT (its router opens the
  system scope), `setup.ts`, `admin/master-admin` and `admin/access-management`.
- Tenant-scope writes that target only a member: signer re-verification
  (`recordFailedLogin` on self), and GDPR erasure (`EXISTS organization_users`).
- The boot seed, which runs on an owner connection.

**`scripts/db/rls-coverage-check.sql`:** the `users` to `organizations`
carve-out is gone.

- `users` now has row security, so that edge passes on its merits. The check
  flags it again as soon as the row security is removed
  (`green/rls-coverage-check.txt`).
- `public.users` joins `identity.users` in the "a row that names a user is that
  user's" clause. Before this change its children were never flagged, because
  their parent had no RLS. So nothing that used to be flagged is now exempt.
- `install-fresh` does not apply the C2C set, and `organizations` gets its RLS
  from the same set. On a blank install neither table has RLS at step 8/8. After
  deploy-migrate, both do.

## The contract

`tests/db/users-rls.dbtest.ts` runs on the shared two-tenant fixture, through
the application pool (app_service, RLS enforcing, asserted by the fixture). The
route cases go through production's `createAuthBoundary` and the tenant-users
router.

| #  | Case | Before | After |
| -- | --- | --- | --- |
| 1  | A reads none of B's user rows (by id, by email, by scanning `mfa_secret`) | **fail**: all credentials returned | pass |
| 2  | A cannot update B's password hash, MFA secret or reset token, nor delete B's user | **fail**: `{updated: 1, deleted: 1}` | pass |
| 3  | A reads its own members only | **fail**: saw B's user | pass |
| 4  | A updates its own member's profile (positive control) | pass | pass |
| 5  | Pre-auth scope: sign-in lookup by email finds any tenant's user and writes it | pass | pass |
| 6  | System scope reads and writes every tenant's users | pass | pass |
| 7  | A raw `INSERT … RETURNING` of a non-member in a tenant scope is refused (why the id is drawn first) | n/a | pass |
| 8  | `user_id_for_email` gives an existing account's id, or null, and nothing else | n/a | pass |
| 9  | An admin creates a new member: 201, membership in A, setup token stored, delivery `link` | pass | pass |
| 10 | An admin adds another tenant's account: 202, consent invitation, no credential in the response | pass | pass |
| 11 | An admin of two orgs lists the other org's members, then invites into it: token stored | pass | pass |

`red/before.txt` is the first seven cases, at trunk `c40d3cca` before the
migration. Cases 7 and 8 describe the fix and were added with it. Case 7 at
first asserted that `RETURNING` works, and it went red as soon as the policy
applied. That red is why `atomicCreateUser` was changed.

**Each code change was made to fail its own case.** The mutations were run
with the policy in place:

| File | Mutation | Fails |
| --- | --- | --- |
| `red/M1-existing-account-read-in-tenant-scope.txt` | `atomicCreateUser` back to `SELECT id FROM users WHERE email = $1` | case 10: **400 `DATABASE_ERROR`**, expected 202 |
| `red/M2-setup-token-in-session-scope.txt` | the token UPDATE outside `inVerifiedOrgScope` | case 11 |
| `red/M3-member-list-in-session-scope.txt` | the member list outside `inVerifiedOrgScope` | case 11 |

## Green

| File | Shows |
| --- | --- |
| `green/after.txt` | `users-rls.dbtest.ts` 11/11 |
| `green/affected-suites.txt` | 14 files, **178/178**: this contract, plus the suites for the paths the policy touches. See the list below. |
| `green/deploy-migrate-twice.txt` | Through the real applier, twice. Both runs apply the file and complete. |
| `green/rls-coverage-check.txt` | 0 rows. With `users` row security disabled (rolled back), the `users` edge is flagged again. |
| `green/full-db-tier-summary.txt` | The whole `tests/db` tier: 753/766. The 13 failures are listed. |
| `green/preexisting-failures-with-users-rls-off.txt` | The same 13 fail, by name, with `users` RLS **disabled**, so none is caused by this change. |
| `posture.txt` | RLS and FORCE on, the four policies as stored, the function's `SECURITY DEFINER` / `proconfig`, and `app_service` NOSUPERUSER NOBYPASSRLS. |

The suites in `green/affected-suites.txt`:

- Sign-in: `sign-in-posture` (password, then TOTP and email OTP) and
  `sign-in-audit-trail` (enterprise sign-in, select-organization).
- `one-time-credentials`: MFA races, email OTP, two resets racing one token.
- `account-standing`: suspended and deprovisioned accounts, SCIM and admin
  states.
- `second-factor-binding`, `signing-lockout`, `signup-launch-catalog`.
- `memberships`: signup, persona, and cross-org tenant-users.
- `organizations-writes`, `gdpr-service-runtime-role`, `control-plane-access`,
  `tenant-purge`, `two-tenant-application-rls`.

The 13 pre-existing failures are in `document-catalog`, `document-catalog-role`,
`document-catalog-recall`, `vault-placement` and
`run-control-cross-instance`. None of them reads `users` through the changed
paths.

**Gates:**

- `ci:migration-set-order` OK (318).
- `ci:migration-drop-safety` OK, and its `:selftest` passes 12/12.
- `ci:rls-allowlist-sync` OK (6 entries, 4 consumers).
- `ci:tenant-isolation:no-regression` OK (8 findings, the same as the baseline).
- The mocked contracts whose SQL matchers named the old statements were
  updated to match the new ones: `tenant-isolation-tenant-users.contract`,
  `atomic-quota-organization-ceilings`. Both pass 31/31, and they passed 31/31
  at trunk before the change.
- ESLint on the changed files gives 4 warnings, the same count and rules as at
  trunk.

## Consequences, recorded rather than hidden

- **Display joins show a null name for users outside the organization.** A
  `LEFT JOIN users` for an actor's name now returns null for a former member,
  and for platform staff who acted in the organization. Examples:
  - the audit-trail ledger (`audit-trail-ledger.routes.ts`);
  - project owners (`c2c/projects.ts`);
  - review assignees (`c2c/reviews.ts`).

  `actor_id` is still returned, so the audit record itself is unchanged; only
  the display lost the name. This is handed on. Whether the name belongs as a
  snapshot on the audit row, or behind an id-to-name resolver limited to the
  tenant's own records, is a product decision.
- **Two routes now answer differently for a non-member.**
  - `concept2cure.ts` project member upsert returns 404 "Target user not found"
    for a non-member, where it returned 400 `ORG_MEMBERSHIP_REQUIRED`. It is
    still a refusal.
  - `clients-routes.ts:115` counts users by `default_organization_id`, and now
    counts only those who are also members.
- **The pre-auth scope reads every account, as it did before.** Narrowing it
  would mean moving each pre-auth lookup behind a function that answers only
  what that step needs. That is recorded as a further step, not done here.
- **`public.users`' own children have no RLS:** `platform_role_grants`,
  `user_presence`, `notification_preferences`, `drafting_tasks`. They are
  unchanged by this work. `platform_role_grants` is handed on to be checked for
  writability from a tenant scope.
