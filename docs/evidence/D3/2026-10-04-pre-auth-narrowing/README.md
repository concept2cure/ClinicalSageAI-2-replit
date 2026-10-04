# D3: the pre-auth scope reaches one account, not the whole of `public.users`

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-10-04. The structural step recorded as unclaimed on the board
under the 2026-09-29 pre-auth map (`../2026-09-29-pre-auth-scope/`).
**Database:** `c2c_d3x`, PostgreSQL 16, provisioned from empty at this head by
`scripts/db/provision-test-db.sh`. The runtime connects as `app_service`, which
is not a superuser and has no BYPASSRLS, with `RLS_ENFORCE=on`.

**What this is not:** the row's closing evidence. That is the contract run
against staging with the production image, owed with D1.

## The defect

Since 2026-09-28 the `public.users` policy admitted the tenant-less scopes
(`app.current_tenant_id = '0'`) to every row. The system scope did not need that
arm: it carries the platform role, which has its own. **The pre-auth scope did**,
and it read and wrote every account, password hash, MFA secret and reset token
included. The 2026-09-29 map found that no current handler could be steered to
another person's row. But only application code held that line, and the next
handler would have had nothing under it.

`public.actor_name` had the same arm. Inside it the platform role is set for the
function body, so the arm could not tell pre-auth from system. It also ran its
"acted in this organization" test against tenant 0, which is no organization:
sign-in events are audited under tenant 0, so that test named anyone who had
ever tried to sign in.

## The change

**The policy.** `migrations/20260928_users_membership_rls.sql`, amended in place
with a dated note (Rule 1):

- The tenant-less arm is removed.
- An **account** arm takes its place: `users.id = app.current_account_id`.

**The variable.** `app.current_account_id` is set on every scoped statement by
`server/db/poolInstrumentation.ts`, transaction-local, from the scope's
`accountId`. It is empty unless the server has bound one. The name is new on
purpose: `app.current_user_id` is already a uuid in the gcc identity layer, and
the first run with an integer in it failed signup with `22P02`.

**The binding** (`server/db/tenantStore.ts`):

- `bindPreAuthAccount(id)` binds the request's own pre-auth scope.
- A pre-auth request can be bound to **at most one** account. Rebinding to
  another id throws.
- Inside a tenant or system scope it throws, because that scope already
  decides.
- With no scope at all it does nothing.
- `runAsAccount(id, …)` opens a bound scope for a service that was handed an id.

**Where accounts are bound:**

| Path | Bound to |
| --- | --- |
| Any request on a pre-auth mount holding a live token (`/me`, preferences, persona, notifications, session, MFA setup/enable/disable, password change, select-organization, refresh-token, sign-out) | the token's account, inside `verifyLiveToken` (`services/token-revocation.ts`) |
| Sign-in, dev sign-in, resend verification, forgot password, enterprise verify-password | `public.user_id_for_email`, through `services/auth/pre-auth-account.ts` |
| Password reset confirmation | `public.user_id_for_reset_token` (new, in the same migration; reviewed in `scripts/db/security-definer-allowlist.json`) |
| Signup | the new id, taken from the sequence and bound **before** the transaction opens, because the pool applies the scope at `BEGIN` |
| Email verification, token refresh, MFA verify and resend, enterprise verify-MFA | the subject of the server-signed link, refresh token, challenge or partial token |
| Account standing before a tenant; the MCP connector's membership backstop | `runAsAccount` (`services/account-standing.ts`, `mcp/auth/store.ts`) |

**`actor_name`.** `migrations/20260929_actor_names.sql`, amended in place: the
tenant-less arm is removed, and the membership and actor arms refuse tenant 0.

## The contract

`tests/db/pre-auth-narrowing.dbtest.ts`. The red column is trunk's two
migration files on the same database, with this commit's code:

| # | Case | Trunk | After |
| - | --- | --- | --- |
| 1 | Unbound pre-auth reads no row by email, by id, or by scanning | **fail**: B's credentials returned | pass |
| 2 | Unbound pre-auth writes no account | **fail**: B's password hash and reset token overwritten | pass |
| 3 | `actor_name` names nobody in a tenant-less scope, though B acted in tenant 0's trail | **fail**: B's name and email | pass |
| 4 | A sign-in by email binds that account, reads and writes it, and no other | **fail**: B's row read and written too | pass |
| 5 | A verified access token binds its account; another's row is not read | **fail**: read | pass |
| 6 | A request bound to one account cannot be rebound to another | pass (application rule) | pass |
| 7 | A reset finds the account holding the token, by its hash only | **fail** (case 2 had erased B's token) | pass |

`red/before.txt`: 6 of 7 fail.

**Mutations:**

- `red/M1-no-account-arm.txt`: the policy without the account arm. Cases 4, 5
  and 7 fail, because a bound sign-in can no longer read its own account. The
  arm is what admits it.
- `red/M2-token-does-not-bind.txt`: `verifyLiveToken` without the bind. Case 5
  fails.

## What else moved

These suites called the old reach directly and now model production:

- `tests/db/users-rls.dbtest.ts`: the tenant-less case now asserts both sides,
  unbound reaching nothing and bound reaching one account.
- `session-termination.dbtest.ts` and `mcp-account-standing.dbtest.ts`: they
  ran sign-out-everywhere in an unbound scope. Its only caller is bound by its
  token, so they now use `runAsAccount`.

Mocked suites updated for the fourth variable and the definer lookups:

- `poolInstrumentation-tenant-scope`, `withTenantConnection-scope-before-checkout`
  and `ana-capability-registry-seed-scope`;
- `auth-signup-verification`, whose database double now answers the two
  lookups and the sequence.

## Results

- `green/db-tier.txt`: the whole real-database tier at this head.
- Trunk baseline: 1,537 of 1,537 passed. The first narrowed run failed 16:
  signup and reset (the `app.current_user_id` collision), the two tests that
  ran sign-out unbound, `users-rls`' old case, and the definer allowlist. All
  are fixed above.
- Mocked suites touching anything changed: 2,692 pass. The one failure,
  `tests/founder-critical-path-proof.test.ts` ("Sign-out is wired", a check on
  client source), fails identically on trunk and is not in this change.
- `ci:migration-set-order`, `ci:migration-drop-safety` (and selftest),
  `ci:rls-allowlist-sync` and `ci:tenant-isolation:no-regression` all pass, as
  does a full `tsc --noEmit`.

## What stays

- **The email oracle is unchanged.** Sign-in must find an account by the
  address typed. `user_id_for_email` answers an id, which the request then
  binds. The response timing that hides whether an address is enrolled is
  unchanged (`padUnknownEmailTiming`).
- **A bound request can still be wrong about who it is.** That is now one
  explicit call per path, greppable, rather than a table-wide grant.
