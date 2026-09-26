# P1-1 — sessions did not end: no inactivity logoff, no lifetime (IAM-06, High)

**Row:** D6 (D4 for the OQ step). **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-06. **Plan item:** P1-1.
**This folder:** the server half (first commit), the client half (second commit) and the OQ step (third commit).

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

Not in the server commit: the concurrent-session limit (the plan row keeps it; it needs a per-user session registry
that this activity store is not), and the OQ step.

## The client half

- `client/src/services/portal/idleSession.ts` is the person's clock: pointer, key, touch, wheel and scroll on the
  window, and the tab becoming visible, are activity (throttled to once a second). A minute before the window ends it
  warns; while the warning stands only "Stay signed in" extends the session, so a pointer moving to "Sign out now"
  cannot cancel the warning under it; at the end of the window it fires once and stops.
- `client/src/concept2cure/components/session/IdleSessionGuard.tsx`, mounted once inside the authenticated shell
  (`ZenRouter.tsx` `ProtectedZenApp`), reads the session's clocks from `GET /session` (`idleMinutes`, `expiresAt`;
  15 minutes and no lifetime until the server answers), shows the warning as an `alertdialog` with the seconds left,
  signs out at the end of the window or of the lifetime with the reason kept, and reports activity to the server at
  most every five minutes while the person works without API traffic (the server measures requests).
- The two fetch wrappers end the session on the server's answer instead of refreshing: `authService.tsx`'s client
  (`SESSION_IDLE` / `SESSION_LIFETIME` on a call, or on the refresh it would have tried) clears storage, keeps the
  reason and raises `session_expired` with it; `lib/queryClient.ts`'s `apiRequest` cannot import the auth service
  without a cycle, so it announces on the window and the auth provider ends the session. The provider's start-up
  probe keeps the reason too.
- The sign-in page (`Concept2CureLogin.tsx`) reads the reason once and says why the last session ended, in all
  eighteen languages (`auth.json` `signedOut.*`; the warning's strings in `common.json` `session.*`; the
  locale-integrity test holds the eighteen bundles to one key set).

Evidence: `red/client-before-fix.txt` (the auth client refreshed an idle session; the shared wrapper announced
nothing; no policy on the client; the guard did not exist), `green/client-after-fix.txt` (the five new suites, the
logout suite and the locale-integrity test).

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

## The OQ step

`URS-001` v0.5 gains URS-PROJ-013 (a session left alone ends, and a session has an end), `RA-001` v0.8 assesses it
(high, scripted, with the rule pinned by the three unit suites above), and `OQ-001` v0.8 gains OQ-PROJ-19, implemented
in `tests/validation/oq/projects/run.mjs`: the run session (an organisation administrator) sets the organisation's
`sessionTimeoutMinutes` to 1, the step opens a session of its own, reads projects, leaves it alone for 65 seconds, and
expects projects 401 `SESSION_IDLE`, the refresh 401 `SESSION_IDLE` with no tokens, and the session check signed out,
while the run's own session, in use, keeps reading; the setting is restored in every outcome. A run identity that is
not an organisation administrator records a deviation rather than a pass. `check-validation-traceability` passes
(every citation resolves; the protocol and the runner agree on the step and its kind).

**Not yet executed.** The protocol says so in its revision row; the next credentialed execution runs it and updates
§5 and the VSR. This session has no live server or run identity to execute it against.
