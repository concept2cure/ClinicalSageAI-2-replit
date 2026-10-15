# IAM-30: the enterprise second factor bounds guessing per account

Date: 2026-10-01 (evening). Lane: D6 (security tranche 4). Found by the security-auditor review of this evening's
commits (finding 1, Medium). Re-read at head and shown failing before it was changed.

## What was wrong

The enterprise sign-in (`POST /api/auth/enterprise/verify-password`, then `POST /api/auth/enterprise/verify-mfa`,
`server/routes/authEnterprise.ts`) is a second door beside `/api/auth`. At its second factor:

- a wrong authenticator or recovery code wrote a `user_login_mfa_failed` row and nothing else: no lockout count;
- the account's lock was never consulted;
- the only limit was 10 requests per 15 minutes per client address (memory store, per task);
- and the password step cleared the lockout count on every correct password, before the second factor.

So someone holding an account's password, with an authenticator enrolled (the emailed code has its own cap), could
take a partial token and guess six-digit codes from rotating addresses without limit, re-taking a partial token as
needed. At `/api/auth/mfa/verify` the same guesses stop at the account's lock and at the per-account limiter
(`signInLimits.secondFactor`, 10 wrong codes per 15 minutes per account). 21 CFR 11.300(d); HIPAA 164.312(d);
NIST SP 800-63B §5.2.2.

## What changed

The enterprise door now follows the `/api/auth` door's rules exactly:

- `server/routes/authEnterprise.ts` `/verify-mfa`:
  - mounts `signInLimits.secondFactor`, the same limiter instance as `/api/auth/mfa/verify`, so the count is one count
    per account across both doors, and guesses at one are not a fresh allowance at the other;
  - refuses a locked account before any code is tried: 423 `ACCOUNT_LOCKED`, an `account_locked` row;
  - counts a wrong authenticator or recovery code toward the lockout (`recordFailedLogin`), with
    `invalid_code_threshold_exceeded` on the row when that failure locks the account; a wrong emailed code keeps its
    own cap and is not counted here, as at `/api/auth`;
  - clears the count once the second factor is right.
- `/verify-password` clears the count on a right password only for an account whose second factor is the emailed
  code (`routes/auth.ts` has done this since P1-2).
- `server/middleware/sign-in-limits.ts` `secondFactorAccountKey` reads the enterprise `partialToken` as well as the
  `/api/auth` `challengeId`, each only when this server signed it as a challenge (`mfaPending`). A forged or
  non-challenge token falls back to the client address, as before.

## Tests

| Test | Red (head) | Green |
|---|---|---|
| `server/routes/__tests__/authEnterprise-second-factor-lockout.test.ts` (new, 9 cases): a locked account is refused 423 before any code is tried, and audited; a wrong authenticator code is counted; the locking failure says so; the count is cleared once the code is right; a right password does not clear it for an authenticator account; the account key reads a verified partial token and refuses a forged one; the eleventh wrong code for one account is refused 429, each from a new address. Controls: a wrong emailed code is not counted here; a right password clears the count for an emailed-code account | `red/authEnterprise-second-factor-lockout.txt`: 7 failed, the 2 controls passed | `green/authEnterprise-second-factor-lockout.txt`: 9 passed |
| The limiter is load-bearing: the same suite with `signInLimits.secondFactor` not mounted | — | `red/mutant-limiter-unmounted.txt`: 1 failed (the eleventh code is 401, not 429) |

Every request in the suite comes from its own address, so the per-address limiter never decides a case.

Neighbours: `green/neighbour-units.txt`, eighteen sign-in suites (every `authEnterprise-*` suite, the `/api/auth`
challenge, sign-in limits, refresh, sign-up, the auth surface), 107 passed; `auth-mfa-totp-lockout` (PGlite) 8 passed;
`green/neighbour-dbtests.txt`, `sign-in-audit-trail`, `session-termination`, `one-time-credentials` and
`sign-in-posture` on PostgreSQL as `app_service` with RLS on, 64 passed. ESLint: `authEnterprise.ts` 10 warnings and
`sign-in-limits.ts` 0, as at head; the new suite 0.

## What remains

- The limiter's store is per task, as at `/api/auth` (no Redis in the production stack yet: P1-46). With several tasks
  the per-account bound is 10 wrong codes per task per 15 minutes; the lockout count, in the `users` row, is shared by
  every task and is the durable bound.
- The review's other findings (DP-76, DP-77, DP-65 scope, the delete gate's heuristics, document corrections) are
  handled in their own commits.
