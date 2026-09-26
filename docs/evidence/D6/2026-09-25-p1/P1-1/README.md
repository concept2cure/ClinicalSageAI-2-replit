# P1-1 — sessions did not end: no inactivity logoff, no lifetime (IAM-06, High)

**Row:** D6 (D4 for the OQ step). **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-06. **Plan item:** P1-1.
**This folder:** the server half. The client's idle timer and warning, and the OQ step, follow in their own commits.

## What was wrong

A 24-hour access token opened the API for its whole life whether or not anyone was at the keyboard; the client's
answer to a 401 was a refresh, which minted a fresh day from a seven-day refresh token that itself rolled on every
use; nothing read the tenant's `sessionTimeoutMinutes`. Annex 11 §12.4 and HIPAA §164.312(a)(2)(iii) expect a
session left alone to end, and a session to have an end.

## What is true now

`server/services/session-inactivity.ts` is the rule; every place that turns a token into an identity applies it.

- **A session** is the pair of tokens a sign-in mints. Both carry `sid` (the session id, kept through every refresh
  and rotation), `sst` (the second the sign-in happened) and `idl` (the idle window in seconds, fixed at sign-in from
  the tenant's `settings.security.sessionTimeoutMinutes`; 15 minutes when unset; clamped to 1 minute … 24 hours).
  Every mint carries them: the two login paths, MFA completion, signup and `/refresh` in `routes/auth.ts`; MFA
  completion, organisation selection and `/refresh-token` in `routes/authEnterprise.ts`; both SAML paths in
  `routes/sso.ts` (default window; the organisation's setting is not read there).
- **Every authenticated request records the session's activity** (Redis, shared by every task, with the in-memory
  tier behind it). A request that finds the session idle for longer than its window is answered 401 `SESSION_IDLE`
  and the token is revoked; a session that began more than **12 hours** ago is answered 401 `SESSION_LIFETIME`
  whatever its activity. Both authenticators (`middleware/auth.ts` `authenticateToken`, `server/auth.ts`
  `authMiddleware`) and `verifyLiveToken` (the session probe, the users routes, the enterprise routes, the two socket
  namespaces, the collaboration server) apply the same rule.
- **A refresh is not activity.** `POST /api/auth/refresh` reads the session's record and refuses with the same codes;
  the enterprise `/refresh-token` and the socket server's periodic re-check verify with `activity: false`, so an open
  tab, a background poll of the refresh endpoint, or a rotation cannot keep an unattended session alive. A refused
  refresh revokes the refresh token.
- **A session found idle is not touched by being asked**, so the answer does not change with retries.
- `GET /api/auth/session` now states the session as its token does: `session.id` (`sid`), `createdAt` (`sst`),
  `expiresAt` (the end of the lifetime), `idleMinutes` and `lifetimeHours`, for the client's own timer.

What the rule measures: requests. The client's idle timer (next commit) is what turns *no user input* into a
sign-out while pollers run; the server rule is the floor beneath it, and the one a stolen or abandoned token meets.

Tokens minted before this change carry no `sid`: their activity is keyed by the token itself, so a session older than
its window at the deploy ends at its next request (one sign-in), and their refresh tokens are checked for their
lifetime only until they expire (seven days at most).

Without Redis the activity tier is per task: a session's first request on a task that has never seen it is measured
from its token's issue, so it can be refused as idle there while alive elsewhere. Production runs Redis (P1-3).

Not in this commit: the concurrent-session limit (the plan row keeps it; it needs a per-user session registry that
this activity store is not), the client timer and warning, and the OQ step.

## Evidence

- `red/gate-before-fix.txt` — `authenticateToken` against the unchanged middleware: a session 16 minutes idle, one
  13 hours old and a legacy token 20 minutes old all reached the handler (4 of 5 failing; the tenant-window case
  passes trivially on code that refuses nothing).
- `red/refresh-before-fix.txt` — `POST /api/auth/refresh` against the unchanged handler minted for the idle and the
  13-hour-old session, and carried no session claims (4 of 4 failing).
- `green/after-fix.txt` — 23/23 across `session-inactivity.test.ts`, `auth-inactivity-logoff.test.ts` and
  `auth-refresh-inactivity.test.ts`.
- Neighbours after the change: the eight auth suites (`auth-session-currency`, `auth-role-from-database`,
  `auth-carries-provider`, `auth-establishes-scope`, `authSurfaceSecurity`, `auth-mfa-challenge-factors`,
  `authEnterprise-inactive-account`, `token-revocation-expiry`) 74/74 once two cases in `auth-session-currency` that
  signed hours-old tokens were given the widest window and an eleven-hour age (they test the password-change rule,
  not this one); `ssoRoutes`, `ana-realtime-auth`, `socket-main-namespace-session`, the three enterprise suites 50/50;
  the four suites that drive `authMiddleware` unmocked 54/54. ESLint ratchet: no file changed its warning count
  (the second authenticator's checks moved into `refusedEndedSession` to keep its complexity where it was).
  `check:security-patterns` 0 violations.
