# P1-3 — the per-account limits did not hold under concurrency, on error, or on the v1 path (IAM-09, Medium)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-09. **Plan item:** P1-3 (the parts this
session owns: the lockout counter, the emailed-code guess budget, the v1 mount; Redis in production is the founder's).

## What was wrong

- `recordFailedLogin` (`server/services/auth-security-service.ts`) read `users.failed_login_attempts`, added one in
  JavaScript and wrote the sum back. Twenty wrong passwords sent at once each read 0 and each wrote 1: the account never
  locked, so the limit of five held only against an attacker who tried one password at a time. On a write error it
  answered `{ locked: false }`, an unrecordable failure counted as no failure.
- `createEmailOtp` (`server/services/emailOtpService.ts`) set `email_otp_attempts` to 0 on every call. `/mfa/resend`
  calls it for the pending challenge, so each resend refilled the five guesses.
- `applySecurityMiddleware` (`server/middleware/enterprise-security.ts`) mounted the failures-only sign-in limit on
  `/api/auth` only, while `register-platform-routes.ts` mounts the same auth router at `/api/v1/auth` as well. The same
  sign-in with `/v1` in the path had no edge limit.

## What is true now

- The failure is one conditional `UPDATE … RETURNING`: the increment and the lock are computed from the row's value at
  the moment of the write, under the row lock, so concurrent failures each count and the fifth locks. A failure that
  cannot be recorded throws; sign-in answers 500 and the signing ceremony refuses, the posture `isAccountLocked` already
  had. The `lockedUntil` value is serialized the way the drizzle column serializes a `Date`, so the read side is unchanged.
- A code re-issued while one is pending and unexpired keeps the attempts already spent; a fresh challenge (nothing
  pending, or the pending code expired) starts at 0. No route changed: `/mfa/resend`, `/login` and the enterprise login
  call the same function and get the rule from it.
- The sign-in limit is mounted on `/api/v1/auth` beside `/api/auth`.

| | File | Result |
|---|---|---|
| red | `red/lockout-otp-limiter-before-fix.txt` | HEAD `5f1e35b0`, sources unchanged: 20 parallel failures leave the count at 1 and the account unlocked; a dropped column answers `{ locked: false }`; a re-issue resets the count to 0; the v1 mount has no limit. 4 failed / 3 passed |
| green | `green/lockout-otp-limiter-after-fix.txt` | 98 / 98 across the two new files and the neighbouring lockout, limiter-key, password-reset, refresh-rotation, signature and signer-reverification suites |
| green | `green/gates.txt` | `check:security-patterns` 0 violations; `ci:client-ip-single-source` clean |

Tests: `server/services/__tests__/account-lockout-atomic.pglite.integration.test.ts` (real PGlite behind the real
drizzle handle: PGlite runs statements one at a time, which is exactly why the read-then-write form fails there too:
every concurrent call's SELECT runs before any call's UPDATE);
`server/middleware/__tests__/enterprise-auth-limiter-v1-mount.test.ts`.

## Not done here

- **A cap on resends per challenge.** The `users` row has no column for it and `/mfa/resend` (`server/routes/auth.ts`)
  is inside another lane's 24-hour window until 2026-09-26 01:44 UTC. The route's own `mfaLimiter` bounds resends per
  address; a per-challenge cap needs a counter column (an additive migration, Rule 1) or a resend count folded into the
  challenge token. Open on P1-3.
- **Redis in production** for the limiters and the revocation memory tier: a founder decision (Terraform sets no
  `REDIS_URL`); without it each ECS task keeps its own limiter and revocation memory.
- The lockout's `isAccountLocked` expiry reset is unchanged (two statements, both idempotent).
