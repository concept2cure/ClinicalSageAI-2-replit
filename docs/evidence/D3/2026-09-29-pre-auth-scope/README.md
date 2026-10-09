# D3: the pre-auth scope — what reaches every account, and the one handler that could be steered

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-29. This is the hand-on "the pre-auth scope still reads every
account", recorded with `../2026-09-28-users-rls/`.
**Database:** `c2c_d3u`, PostgreSQL 16, provisioned from empty. The runtime
connects as `app_service`, which is not a superuser and has no BYPASSRLS, with
`RLS_ENFORCE=on`.

**What this is not:** the row's closing evidence. That is the contract run
against staging with the production image, owed with D1.

## The map

Since 2026-09-28 the `public.users` policy admits the tenant-less scopes
(tenant `'0'`) to every row. The pre-auth scope is one of them. Every handler
that runs in it was read, and each statement it runs on `users` was classed by
what keys it.

**Mounts in the pre-auth scope** (`server/bootstrap/register-platform-routes.ts`):

- `/api/auth` and `/api/v1/auth` (`routes/auth.ts`)
- `/api/users` and `/api/user` (`routes/users.ts`)
- `/api/auth/enterprise` (`routes/authEnterprise.ts`)
- `/api/auth/sso`, whose router nests the **system** scope

**Handlers that need no identity yet.** They are keyed by email, by a hashed
reset token, or by the id inside a server-signed challenge, refresh or
verification token:

- login, signup, resend-verification and verify-email;
- refresh;
- MFA verify and resend;
- forgot and reset password;
- enterprise verify-password and verify-mfa.

These are what the pre-auth scope exists for. What they need on `users`:

- reads by email, reset-token hash or signed id;
- writes to lockout counters, `last_login`, `email_otp_*`, `reset_token`,
  `status`, and `password_hash` on reset;
- inserts on signup.

**Handlers that verify a token and still run pre-auth.** Every one is keyed on
the verified token's own user id: `/me` (read and patch), preferences,
persona, notifications, `/session`, MFA setup, enable and disable,
`/password/change`, enterprise select-organization, and refresh-token.
**Except one.**

## The defect: `GET /api/users/:id`

This handler (`routes/users.ts`) verified the token, then loaded **any user's
full row**, credentials included, by the id in the path, in the pre-auth
scope. What kept that row from the caller was an application check on
`users.default_organization_id`, which is a preference, not tenancy.

Measured through production's own `registerPlatformRoutes`
(`red/before.txt`, 2 of 5 fail):

- **A person removed from A whose default organization is still A** was
  returned to A's member (**200**, name and email).
- **A current member of A whose default organization is B** was refused
  (**404**).

The response was limited to id, email and name, so no credential left the
process. But the isolation lived only in application code, and it keyed on
the wrong column.

## The change

The lookup runs in the **verified token's organization scope**, the same way
`PUT /me/persona` already writes. There, the `users` policy admits only that
organization's members, so membership decides. It reads only id, email and
name, and reports the caller's organization as the one it shares with the
person. The `default_organization_id` check is gone, because the database now
makes that decision.

## The contract

`tests/db/pre-auth-user-lookup.dbtest.ts`:

| # | Case | Before | After |
| - | --- | --- | --- |
| 1 | A member of A finds another member of A (positive control) | pass | pass |
| 2 | A person removed from A is not found, whatever their default says | **fail**: 200 | pass |
| 3 | A current member of A is found, with another default | **fail**: 404 | pass |
| 4 | B's member is not found from A | pass | pass |
| 5 | The response carries no credential field | pass | pass |

**Mutation.** `red/M1-lookup-in-pre-auth-scope.txt` runs the same lookup back
in the pre-auth scope, without the old app check. Cases 2 and 4 fail: **B's
member is returned to A**. So the protection is now the `users` policy, not
application code.

**Results:**

- `green/after.txt`: this contract plus `memberships` (persona through
  `/api/users`), `users-rls`, `sign-in-posture`, `sign-in-audit-trail`,
  `one-time-credentials` and `account-standing`, **87/87**.
- The unit suites for these routes (`api-auth-gate`, `mfa-enrolment`,
  `users-me-preferences`, `orgMembership-degraded-enrichment`) pass **57/57**.
- ESLint gives the same warning count as trunk.

## What stays, and why

**The pre-auth scope still reads every account, by design.** Sign-in, reset
and OTP find an account before any tenant exists. After this change, no
handler in the pre-auth mounts can be steered by request input to another
user's row (the map above).

The structural next step would put each pre-auth statement behind a function
that answers only what that step needs: by email, by token hash, by signed id.
That would stop a *future* steerable handler at the database. It touches about
25 statements across `routes/auth.ts`, `routes/authEnterprise.ts` and three
services. It is recorded on the board as a separate item, not folded in here.

**Found and handed on, not D3:** the platform routes are registered before
`notification_routes.ts`, so `GET /api/user/:id` also captures
`GET /api/user/preferences` (`:id` = `'preferences'`). The route at
`notification_routes.ts:163` never runs.
