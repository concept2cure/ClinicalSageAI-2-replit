# D6 — the Business Center reads platform standing, never a tenant membership role (2026-10-05)

**Row:** D6 (security posture). The latent finding was recorded on 2026-09-29
beside the Terraform owner hand-on (`docs/work-orders/README.md`). Live
measurement showed it is exploitable by any membership that carries the role.
**Claim:** the board row of 2026-10-05.

## What was wrong

The Business Center (`/api/admin/business/*`) shows cost, revenue and margin
for **every client**. Its guard (`server/middleware/requireBusinessAdmin.ts`
`isBusinessAdmin`) admitted any request whose role was `owner`,
`business_admin` or `super_admin`.

On this router, the request role is the **tenant membership role**:
`server/auth.ts` reads `organization_users.role` for the token's account and
organisation. And `owner` is a tenant administrative role throughout the
codebase:

- `tenant-users.ts` admits it as an admin;
- `tenant-export.ts` and `ana-tool-policy.ts` treat it as an admin;
- `ORG_ROLE_FUNCTIONAL_GRANTS` expands it like `admin`.

So a membership row that says `owner` gave that tenant every client's
financials. No current writer produces one: SCIM and `tenant-users.ts` take
`admin|manager|member|viewer`, and sign-up and SSO write `admin` or `member`.
But the column has no CHECK constraint, and older versions, a future writer,
or a hand edit can produce one.

The same read had two more consequences:

- **Access Management.** "Only a business administrator designates finance
  personnel" (`access-management.ts`) used the same synchronous check. A
  platform administrator whose own membership said `owner` could grant
  business roles, to themselves among others. Meanwhile a holder of an actual
  business grant was refused unless their request role also matched.
- **The access roster.** `GET /api/admin/business/access`, "who can reach the
  Business Center", listed holders of tenant membership roles from
  `organization_users`. So it named tenant owners as designated finance
  personnel.

## What changed

- **One decision, `hasBusinessStanding(req)`:**
  - the owner's own sign-in on `BUSINESS_CENTER_EMAILS` (never a SAML
    identity, unchanged), **or**
  - an active `platform_role_grants` row for a business role.

  No request role is read.
- `requireBusinessAdmin` and Access Management's business-tier check both use
  it, so the two cannot disagree.
- The roster lists active `platform_role_grants` holders: what the guard
  enforces.

Standing still comes from the paths that exist for it. The stack sets
`BUSINESS_CENTER_EMAILS` from `platform_owner_emails` (`terraform/stack`), and
Access Management writes grants, audited and with a reason.

## Shown failing first

- [`red-before.txt`](red-before.txt): with the trunk sources for the guard, the
  roster and Access Management, 8 of 56 fail. All 8 are the new or inverted
  tests:
  - a tenant `owner`, `business_admin` or `super_admin` is platform standing
    (×3);
  - a tenant owner is let through the guard;
  - `/cost-accounting` and `/access` answer 200;
  - the roster reads `organization_users`;
  - Access Management lets a platform admin whose membership says `owner`
    grant `business_admin`.
- [`green-after.txt`](green-after.txt): 56 of 56 pass. All 8 suites that touch
  business standing pass (123 tests).
- [`mutants.txt`](mutants.txt): each mutant turns the suites red:
  - the guard reads the request role again (7 fail);
  - standing ignores the platform grant (19);
  - the roster lists tenant roles again (1);
  - Access Management uses the allowlist-only check (2).

Tests updated, with the reason in each file:

- `requireBusinessAdmin.test.ts` "accepts business role %s" pinned the defect.
  It is inverted.
- The route harnesses gave their finance user standing through the request
  role. Standing is now a grant row for that user, as in production.

## Live, on the running app

Run on the local `clinicalsage` database:

- The repository's own `deploy-migrate` was applied (all 357 files).
- The runtime role is `c2c`, which is non-superuser and NOBYPASSRLS.
- Dana Reyes was added as a member through user administration
  (`POST /api/tenant-users`, 201; [`live-setup.jsonl`](live-setup.jsonl)).
- Her membership row was then set to `owner` by SQL. No product path writes
  that value, so this stands in for the legacy or hand-edited row that is the
  latent case.

See [`live-before-after.jsonl`](live-before-after.jsonl):

| Dana Reyes, signed in | before (trunk sources) | after |
|---|---|---|
| membership `owner`, no platform grant: `/cost-accounting` | **200** | **403** |
| the same: `/access` (the roster) | **200** | **403** |
| the same: `/executive-summary` | **200** | **403** |
| plus an active `business_admin` platform grant: `/cost-accounting` | 200 | 200 |
| what the roster lists | Dana Reyes, `owner`, from `organization_users` | Dana Reyes, `business_admin`, from `platform_role_grants` |

The membership row and the grant were reset after each run.

**Caveat on this local database:** `deploy-migrate`'s readiness step reports
that in this container's database the runtime role owns some append-only
tables. That database was provisioned before this session. It has no bearing
on these checks, which read and write no append-only store.

## Not in this change, measured

`requirePlatformAdmin` (Master Administration) has the same shape. It admits a
request role of `super_admin`, `platform_admin` or `support`. Those names are
platform-only vocabulary: no tenant code treats them as tenant roles, and no
membership writer produces them. So the exposure is lower than `owner`'s.

Moving that guard off the request role touches the 27 server files that use it
and the 22 test files that give platform identity through it. That is a
separate change, recorded on the board as a hand-on.

## Gates

- `tsc`: 0 errors.
- ESLint ratchet `--since HEAD`: no file changed its warning count.
- `ci:server-error-leaks`, `ci:tenant-isolation`, `ci:tenant-entry-points`
  and `check:security-patterns` (0 violations) pass.
