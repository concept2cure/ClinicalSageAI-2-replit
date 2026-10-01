# P0-4b residuals: the enterprise second factor, the audit sentences, the client's sign-out answer

Date: 2026-10-01. Lane: D6 (security tranche 4). The residuals `docs/evidence/D6/2026-10-01-tranche-4/P0-4b/README.md`
left open ("What remains" 3, 4, 5, 7 and the optional bootstrap line), each re-read at head before it was changed.
Residuals 1 (`shared/schema.ts` `sessionsEndedAt`) and 2 (the faked-clock dbtests' membership start) were already
applied on trunk; checked, not redone.

## R3: the enterprise second factor asks whether the account's sessions were ended

**What was wrong.** `POST /api/v1/auth/enterprise/verify-mfa` (`server/routes/authEnterprise.ts`) completed a
challenge with no question about what happened since the first factor, beyond the account's status. A password
change, a sign-out everywhere or a removal from the organisation between the password and the code left the
challenge able to become a session. `routes/auth.ts` `/mfa/verify` has asked since P0-4b
(`refuseAccountAtSecondFactor`).

**What changed.** One reading of the standing (`readAccountStanding(userId, organizationIdOfClaims(decoded))`),
before the code is checked so a refused sign-in spends none. An active account whose sessions were ended after the
challenge was issued (`sessionEndedByStanding`, the rule every door applies) is refused 401 `SIGN_IN_ENDED`, "This
sign-in has ended. Sign in again.", with a `user_login` failure row, reason `sign_in_begun_before_sessions_ended`
(the reason the other door records). An inactive account is refused as before.

| Test | Red (head) | Green |
|---|---|---|
| `server/routes/__tests__/authEnterprise-inactive-account.test.ts`: a challenge issued before `sessions_ended_at` is refused 401 `SIGN_IN_ENDED`, no code is spent, the refusal is audited; control: a challenge issued after it still completes | `red/authEnterprise-inactive-account.txt`: 1 failed, 5 passed (head answered 200 and opened a session) | `green/authEnterprise-inactive-account.txt`: 6 passed |

## R5: the audit ledger names the two new events

**What was wrong.** `server/services/audit/auth-event-audit.ts` had no sentence for a sign-out of every session or
for the refusal above, so the ledger showed the fallback ("user logout: success (signed out of every session)").

**What changed.** Two entries in `EVENT_DESCRIPTIONS`: "Signed out of every session of the account" and "Sign-in
refused: begun before the account's sessions were ended".

| Test | Red (head) | Green |
|---|---|---|
| `server/services/audit/__tests__/auth-event-audit.test.ts`: both events read as sentences | `red/auth-event-audit.txt`: 1 failed, 19 passed | `green/auth-event-audit.txt`: 20 passed |

## R4 (first round): the client says whether every session ended

**What was wrong.** `authService.logout(true)` (`client/src/services/portal/authService.tsx`) wrapped the request
in `try {} catch {}` and returned nothing. The server ends every session only for a live access token
(`signOutEverywhere` answers 401 otherwise), so a sign-out everywhere that ended nothing looked exactly like one that
ended everything. A user acting on a lost laptop would have been told nothing.

**What changed.**

- `logout(terminateAllSessions)` returns `LogoutResult`, `{ everySessionEnded: boolean | null }`: `true` only when
  the server answered success, `false` when it refused or could not be reached, `null` when only this browser's
  session was asked for. This browser's session ends either way, as before. `AuthContext.logout` returns the same.
- `getSessions`, `terminateSession`, `terminateAllOtherSessions` and the `AuthSession` type are deleted. They called
  `GET /sessions`, `DELETE /sessions/:id` and `DELETE /sessions/others` under the auth base URL, which no server
  route has ever served, and nothing called them. `git log --all --diff-filter=D -- 'client/**/*Session*'
  'client/**/*session*'` finds no deleted session surface. The reachable path for ending the account's other
  sessions is `authService.logout(true)` → `POST /api/auth/logout {terminateAllSessions: true}` →
  `signOutEverywhere` (`server/routes/auth.ts`), proven by `tests/db/session-termination.dbtest.ts`; a password change
  ends them too. Listing sessions has no replacement because it never existed.

No UI calls `logout(true)` today. A surface that offers "sign out everywhere" must show `everySessionEnded: false`
as "the other sessions were not ended; sign in again and retry", never as success.

| Test | Red (head) | Green |
|---|---|---|
| `client/src/services/portal/__tests__/authService-logout.test.ts`: a refused sign-out everywhere answers `{ everySessionEnded: false }` and this browser is still signed out; a served one answers `true`; a plain logout answers `null` | `red/authService-logout.txt`: 3 failed, 2 passed | `green/authService-logout.txt`: 5 passed |

## Decisions (product owner and CSO)

- **No bootstrap copy of `users.sessions_ended_at`.** `server/db/bootstrap/auth-schema.ts` does not add the column.
  One creator, `migrations/20261001_users_sessions_ended_at.sql`, in the set every deploy applies before it serves.
  A database that has not run the set fails closed: every authenticated request answers 503 `SESSION_UNCHECKED`.
  That is the precedent `email_otp_resends` set.
- **select-organization stays fail-closed (residual 4).** The route continues the presented session into the
  organisation chosen. When that membership began after the session, the gates refuse the new token ("This session
  has ended. Sign in again.") and the person signs in again. That is the intended behaviour, not a gap: a sign-in to
  the organisation applies that organisation's own sign-in policy (its authenticator requirement, P1-2), which a
  continued session from another organisation would skip. No client calls the route today.

## Neighbours and gates

See `green/neighbours.txt` and the commit message for the suites run beside these (every unit suite under
`server/routes/__tests__/auth*`, the audit-event suites and `client/src/services/portal/__tests__`), ESLint and the
typecheck.
