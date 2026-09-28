# D6 — the owner grant: no address in source, inside platform administration (2026-09-28)

**Row:** D6 security posture. **Finding:** 43 (launch surface-truth sweep,
2026-09-23, high), deferred there as a security decision. **Related:** security
audit 2026-09-24 INF-27 (the master-admin half) and IAM-03. **Fix:** `d57bff619`.

## What was wrong

One account got two answers in one session. `GET /api/module-subscriptions/navigation`
said `masterAdmin: true` and unlocked every module, while `GET /api/admin/master/licensing`,
the console that grant belongs to, refused the same person with 403.

The owner grant (`server/services/entitlements/master-admin.ts`) was decided
**beside** the platform guard, not inside it. It was keyed on an e-mail
allowlist, and that allowlist's default was one personal address hard-coded in the module.
The default applied whenever `MASTER_ADMIN_EMAILS` was unset, which is every
stack Terraform provisions: `terraform/stack/main.tf` sets neither
allowlist.

The grant is more than a nav-rail unlock. `server/services/entitlements/access-requests.ts`
exempts a master admin from the tenant boundary, so the grant also answers
module access requests for every organization. The e-mail check did not look at how
the session was issued, either. A federated (SAML) session whose tenant identity provider
asserted the address therefore qualified. `requirePlatformAdmin` already refuses
that case for `PLATFORM_ADMIN_EMAILS` (IAM-03).

## What changed

| Before | After |
|---|---|
| `DEFAULT_MASTER_ADMIN_EMAILS = [<a personal address>]`, applied when `MASTER_ADMIN_EMAILS` was unset | Deleted. Unset or blank is an empty list. A test fails if an e-mail literal returns to the module. |
| Owner grant decided beside `resolvePlatformAdmin` | `resolveAdminStanding(req)` decides platform administration first, using the guard's own function. It reads the owner signals only inside it. `masterAdmin` is never true where `platformAdmin` is false. |
| `/navigation` resolved the two independently, in parallel | `/navigation` reads both from one `resolveAdminStanding` call, so they cannot disagree. |
| E-mail signal honoured for any session | E-mail signal ignored for a federated session. It reads the provider with `requirePlatformAdmin`'s `tokenProvider`, which is now exported rather than copied. |
| `resolvePlatformAdmin` queried with `NaN` for a non-numeric user id | It refuses without a query. |

## Shown failing first, then passing

**Unit tests** ([`fail-before.txt`](fail-before.txt)). The three test files were
run against the sources at `15f89362e`, then against the fix. Before: 13 failed and 34 passed.
After: 47 of 47 passed.

The 13 failures include:

- an address on `MASTER_ADMIN_EMAILS` alone is not the owner, and both answers say no;
- no address is the owner by default, and the source names no address;
- a federated session carrying the allowlisted address is not the owner, even
  when that account also holds a `support` designation;
- a sweep of all 64 combinations (role × platform grant × owner grant × each
  allowlist) in which `masterAdmin` never exceeds `platformAdmin`.

**Live, same server, same account** ([`live-navigation-vs-console.jsonl`](live-navigation-vs-console.jsonl)).
`npm run dev` was restarted for each row. The run signed in as `jm.smith@concept2cure.pro`, an org admin in the
local demo organization, using a password-type session, then read both endpoints:

| Run | Code | `MASTER_ADMIN_EMAILS` | `PLATFORM_ADMIN_EMAILS` | nav `masterAdmin` | nav `platformAdmin` | surfaces unlocked as owner | licensing console |
|---|---|---|---|---|---|---|---|
| 1 | before (`15f89362e`) | that address | unset | **true** | false | **87** | **403** — finding 43 reproduced |
| 2 | fixed | that address | unset | false | false | 0 | 403 — the two agree |
| 3 | fixed | that address | that address | true | true | 87 | 200 — the configured owner works |
| 4 | fixed | unset | unset | false | false | 0 | 403 — no owner by default |

**Real database** ([`dbtests.txt`](dbtests.txt)). The run used `RLS_ENFORCE=on` on a database built
the way CI's deploy-shaped job builds it (`install-fresh` + `deploy-migrate`).
Three files passed, 98 of 98: `entitlement-grants-resolution`, `module-access-requests`
and `master-enterprise-requests`. They cover the Access Management `super_admin` designation making
someone the owner, a revoked designation not doing so, and the owner answering
another organization's request on the console mount.

The unit suites that touch these modules: 28 files, 378 of 378 passed. `tsc`: 0 errors.

## How the founder is the owner now

There is no default, so an unconfigured deployment has no owner. That is the
fail-closed direction. There are two ways to name the owner, and both are documented in `.env.example`:

1. **Configuration.** Put the owner's address in both `PLATFORM_ADMIN_EMAILS` and
   `MASTER_ADMIN_EMAILS` in the task environment. It applies to that
   account's own password sign-in only.
2. **In-app designation.** In Master Administration → Access Management, grant `super_admin`.
   The grant is audited and requires a reason. The caller must be a Business Center
   administrator (`BUSINESS_CENTER_EMAILS`, or a business role).

**Open, not done here:** `terraform/stack/main.tf` passes neither allowlist to
the container. Adding them needs a Terraform variable (for example
`platform_owner_emails`, default empty) that feeds both lists. The change was
not made in this session because the provider registry is unreachable from
here, so `terraform validate` and `terraform test` could not run. Until that
variable exists, a production deployment names its owner through option 2.
Option 2 needs a platform administrator to exist first, so the first one has to be
provisioned by setting the environment variables on the task definition.
