# P1-4 — a guarded request honoured the role minted into the token, not the one the user holds (IAM-10, Medium)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-10. **Plan item:** P1-4.

## What was wrong

`server/middleware/auth.ts` `admitLiveSession` built `req.user.role` and `req.user.roles` from the JWT claims minted at
login, and `requireRole` read those, so a user demoted from `admin` to `member` kept every `requireRole('admin')` route
for the token's remaining day, and a promotion needed a new sign-in. The membership check that already ran on every
request (`enforceOrgMembership`, `server/middleware/orgMembership.ts`) selected `organization_users.role` from the very
row it confirmed and discarded it. The other authenticator, `server/auth.ts` `authMiddleware`, has resolved its role
from that row since its membership query was added; the two disagreed.

Found alongside: behind `authenticateToken` the request's numeric `userId` was never set (only `server/auth.ts` set
it), so `requirePlatformAdmin`'s `platform_role_grants` fallback, keyed by `req.userId`, never ran on that path; a
platform administrator whose authority is a database grant was refused there.

## What is true now

- `orgMembership.ts` carries the row's `role` through the lookup and the 60 s cache (additive: `role` on the query
  result and the cache entry; `attachOrgRole` sets `req.user.organizationRole` beside `organizationUuid` on both the
  cached and the fresh member paths; nothing in the module reads it; the WO-3 lane's "enrichment" scope is untouched
  in shape).
- `admitLiveSession` applies it after membership is confirmed: `req.user.role` and `req.user.roles` (expanded through
  the same `expandRoleClaims` grants the token path used) come from the database, so a demotion takes effect on the
  next request (within the cache TTL, which role changes invalidate) and a promotion needs no new sign-in. A membership
  with no role value leaves the token's claims (the column is `NOT NULL DEFAULT 'member'`, so this does not occur).
- `admitLiveSession` sets `req.userId` from the verified subject, as `server/auth.ts` does, so the platform-grant
  fallback runs behind `authenticateToken` too.

| | File | Result |
|---|---|---|
| red | `red/role-from-database-before-fix.txt` | HEAD `f47aa229`, middleware unchanged: a token claiming `admin` for a user whose row says `member` passes `requireRole('admin')`; a promotion is not seen; `roles` stays the token's; the grants-backed platform admin is refused (no `req.userId`); 4 of 5 fail |
| green | `green/role-from-database-after-fix.txt` | 5 of 5, and 40 neighbouring cases (`auth-carries-provider`, `auth-session-currency`, `requirePlatformAdmin`, `tenant-scope-org-guc`, the second authenticator's session-currency suite) unchanged |
| gates | `green/gates.txt` | `check:security-patterns`, `ci:jwt-verify-pinned`, `ci:tenant-isolation:no-regression` exit 0 |

Test: `server/middleware/__tests__/auth-role-from-database.test.ts` (new; the real `authenticateToken`,
`enforceOrgMembership` and `requireRole` over a drizzle-shaped double that answers the membership query with a chosen
role).

## Not done here

- Platform roles remain a separate vocabulary (`platform_role_grants`, `PLATFORM_ADMIN_EMAILS`); a platform role
  written into `organization_users.role` is honoured as before, since the row is the authority.
- `server/auth.ts` needed no change for the role; it was already the database's.
