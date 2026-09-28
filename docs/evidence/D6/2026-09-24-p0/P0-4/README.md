# P0-4 — session termination did not last (IAM-04, High)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-04. **Plan item:** P0-4 (the
`session_version` column and `terminateAllSessions` are P0-4b, handed on; see "Not done here").
**HEAD at the red run:** `dac69d76`. No migration, no schema change, no new dependency.

## What was wrong

Four defects, one outcome: a session the holder ended, or that a password change should have ended, kept working.

1. `server/services/token-revocation.ts` wrote every revocation with a fixed 24-hour life (Redis `setex`,
   `revoked_tokens.expires_at`), and the read side honours `expires_at > NOW()`. Refresh tokens live 7 days
   (`server/routes/auth.ts` `REFRESH_TOKEN_EXPIRES_IN`), so a refresh token revoked at logout came back to life
   after a day, for the remaining six. Only the memory tier, which never expires, held it.
2. `client/src/services/portal/authService.tsx` `logout()` posted `{ terminateAllSessions }` alone. The server
   revokes the bearer and `body.refreshToken` and nothing else, so the refresh token stored under
   `trialsage_refresh_token` survived every logout.
3. `server/routes/authEnterprise.ts` `POST /refresh-token` verified the presented access token, minted a fresh
   24-hour one, and revoked nothing: any live access token renewed itself forever, a day at a time. (No client
   calls it; the exposure was the endpoint.)
4. Password reset and password change both stamp `users.password_changed_at`, and nothing on the request path
   read it (its only reader was `isPasswordExpired`), so every token issued before the change kept working. The
   `terminateOtherSessions` flag the client sends was destructured and unused.

## What is true now

- **A revocation lasts the later of 24 hours and the token's own `exp`** (`revocationExpiryFor`, decoded with
  `jwt.decode`, never verified: a token that does not verify is refused before the list is consulted). Both the
  DB `expires_at` and the Redis TTL come from it; the memory tier is unchanged. There was no existing test that
  asserted the 24-hour figure — `tests/founder-critical-path-proof.test.ts` (durable across reads) and
  `tests/build-order-14-governed-export-and-ops.test.ts` (three tiers present) pin properties that still hold and
  are green — so no assertion was rewritten for the new rule.
- **The client logout names the refresh token**: `logout()` reads it from storage first (a session whose access
  token has lapsed is never loaded into memory but its refresh token is still live), settles the bearer with
  `getValidAccessToken()` so a refresh that is due rotates before the body is built rather than out from under it,
  then posts `{ terminateAllSessions, refreshToken }` with `retryOnUnauthorized: false`. The server side
  (`POST /api/auth/logout` revoking `body.refreshToken`) was already correct and is now pinned by a test.
- **The enterprise `/refresh-token` rotates**: `revokeToken(oldToken, 'rotated')` after the successor is minted, so
  a failed mint spends nothing. The token-class refusal was already there as `requireAccessTokenReason` (stricter
  than the `nonAccessTokenReason` the plan names: it also refuses a token that declares no class) and is kept; the
  new test re-pins refresh, `mfa_challenge` and MFA-partial tokens beside the rotation.
- **A session minted before the account's last password change is over.** `server/services/account-standing.ts`
  gains `readAccountStanding(userId) → { active, passwordChangedAtSeconds }`, one statement that returns the
  status and `floor(extract(epoch FROM password_changed_at))` (computed in SQL so the timestamp-without-time-zone
  column never passes through the driver's local-time parsing), plus the pure rule
  `sessionPredatesPasswordChange(iat, changedSeconds, env)` and the sibling `isSessionCurrent(userId, iat)`.
  `isAccountActive` keeps its boolean signature and is built on the same read. The status subquery is still the
  literal `SELECT status FROM users …` that a dozen request-path test doubles key on, so none of them changed.
  Applied in `verifyLiveToken` (`SessionEndedError('password-changed')`, same message as a signed-out session;
  this covers `/api/auth/session`, the users routes, the enterprise routes, both socket handshakes and the `/ana`
  namespace), in `authenticateToken` (401 `SESSION_ENDED`, read in the same statement as the standing, so no extra
  round trip), and in `POST /api/auth/refresh` (401 `AUTH_006`) — without the last, the client's next 401 would
  refresh and carry on and the change would have ended no session.
  - Same-second rule: `iat` and the stamp are compared as whole seconds, so the sign-in that follows a change is
    current; a session minted in the same second as the change is admitted (a one-second window).
  - **A token without `iat` is refused in production and admitted elsewhere.** jsonwebtoken stamps `iat` on every
    token it signs and no first-party issuer turns it off, so in production such a token is not one this server
    minted; outside production, test fixtures build claims by hand. The rule takes `env` explicitly and is pinned
    both ways in `account-standing-session-currency.test.ts`.
  - The changing session ends too: after `POST /password/change` the caller's own bearer predates the stamp, so
    its next request answers 401 and the client must sign in again. This is the fail-closed reading of "sessions
    minted before the change are refused"; keeping the changing session alive means minting fresh tokens in the
    change response, which is a client-visible contract change and is left with P0-4b.
  - `password_changed_at` reaches every deployed database through `db/migrations/20260725_users_signing_lockout_columns.sql`
    (in `C2C_MIGRATION_FILES`, `scripts/db/migration-set.mjs:385`, `ADD COLUMN IF NOT EXISTS`) and again through
    the boot repair `server/db/bootstrap/auth-schema.ts:79`. The read fails closed on a database without it
    (`verifyLiveToken` throws; `authenticateToken` answers 503 `SESSION_UNCHECKED`).

| | File | Result |
|---|---|---|
| red | `red/server-before-fix.txt` | 15 of 30 fail on HEAD `dac69d76`: a 7-day refresh token is kept 24 h (DB and Redis); a bearer whose `iat` precedes `password_changed_at` is admitted by `verifyLiveToken`, by `authenticateToken` and renewed by the enterprise `/refresh-token`; `/api/auth/refresh` mints from a pre-change refresh token; the enterprise route revokes nothing; the new helpers do not exist. The 15 that pass are controls and the behaviour that was already right (logout revokes `body.refreshToken`; the token-class refusal; the 24-hour floor). |
| red | `red/client-logout-before-fix.txt` | 2 of 2 fail: the logout body carries no `refreshToken` (loaded session, and lapsed session with the token only in storage) |
| green | `green/server-after-fix.txt` | 30 of 30 |
| green | `green/client-logout-after-fix.txt` | 2 of 2 |
| green | `green/existing-suites.txt` | 250 of 281 across the 17 suites that exercise these paths, including every pool double keyed on `SELECT status FROM users` (`auth-establishes-scope`, `tenant-isolation-global-compliance`, `reauth-second-factor`, `users-me-preferences`, `authSurfaceSecurity`, `esignature-sign`, the MDX gateway suites), `ana-realtime-auth`, the founder proof and build-order-14 source pins, `authToken`. The 31 red are the three PGlite fixtures listed under "Not done here"; each models `users` as `(id, status)` without `password_changed_at`, so the new read fails closed against them. |
| green | `green/gates.txt` | `ci:jwt-verify-pinned` OK; `ci:tenant-isolation:no-regression` OK (8 current, 9 baseline); `check:security-patterns` 0 violations across 2837 files; `ci:client-ip-single-source` exit 0 |
| green | `green/typecheck-scoped.txt` | scoped `tsc` (repo `tsconfig.json` options, changed files + their import graph): nothing in the changed files; the two lines it prints are the pre-existing untyped `tests/validation/lib/totp.mjs` import in the two dbtests |

Tests added: `server/services/__tests__/token-revocation-expiry.test.ts` (a), `server/services/__tests__/account-standing-session-currency.test.ts`
(c: the rule, the read, `verifyLiveToken`), `server/middleware/__tests__/auth-session-currency.test.ts` (c: `authenticateToken`),
`server/routes/__tests__/authEnterprise-refresh-token-rotation.test.ts` (b), `server/routes/__tests__/auth-refresh-session-currency.test.ts`
(`/api/auth/refresh` after a change; logout revokes `body.refreshToken`), `client/src/services/portal/__tests__/authService-logout.test.ts` (d, jsdom).

Existing assertion changed: none. One existing fixture changed: `server/routes/__tests__/authSurfaceSecurity.test.ts`
`accessToken()` now carries a per-call `jti`, because the helper minted byte-identical tokens within one second
and `/refresh-token` now revokes the token it is given, which ended the `/session` test's copy. (The same property
holds in production: first-party tokens carry no `jti`, so two sign-ins by one account in the same second are the
same bytes and share a revocation; pre-existing for logout, and noted rather than changed here.)

The full-tree typecheck was not run (three concurrent runs were OOM-killed on this host; the control tower runs it
at push). `tests/db/sign-in-audit-trail.dbtest.ts` and `tests/db/account-standing.dbtest.ts` compile under the
scoped check and were not executed (no PostgreSQL here).

## Not done here

- **Three test fixtures outside this lane need one column each, or 31 cases stay red.** Each creates
  `CREATE TABLE users (id INTEGER PRIMARY KEY, status TEXT NOT NULL DEFAULT 'active')` for the F-29 standing read and
  must become `CREATE TABLE users (id INTEGER PRIMARY KEY, status TEXT NOT NULL DEFAULT 'active', password_changed_at TIMESTAMP)`:
  `server/services/collab/__tests__/collab-governance.pglite.integration.test.ts:143` (21 cases),
  `tests/socket-tenant-isolation.contract.test.ts:79` (7), `tests/field-sync-auth.contract.test.ts:112` (3).
- **`server/auth.ts` `authMiddleware` (the `/api` gate's other authenticator) does not apply the password-change
  rule.** It reads revocation at `server/auth.ts:172-173` and the standing through `refusedAccountOutOfUse`
  (`:118-135`, `isAccountActiveBeforeTenant`). The same change as `middleware/auth.ts`: replace the standing read
  with `readAccountStandingBeforeTenant(parsedUserId)`, refuse `!standing.active` as today, then refuse
  `sessionPredatesPasswordChange(issuedAtOfClaims(decoded), standing.passwordChangedAtSeconds)` with
  `401 { error: 'This session has ended. Sign in again.', code: 'SESSION_ENDED' }`; `decoded`'s type needs `iat?: number`.
  Out of this lane's file list.
- **P0-4b:** `terminateAllSessions` / `terminateOtherSessions` (a per-user `session_version` bumped on demand,
  needs a column and therefore a migration), and whether the password-change response mints fresh tokens for the
  changing session. The plan's dbtest ("refresh after logout → 401 at t+25 h; a password reset invalidates the
  user's other sessions") needs PostgreSQL and belongs with it.
- Idle logoff, absolute lifetime and concurrent-session limits (IAM-06) are untouched.
