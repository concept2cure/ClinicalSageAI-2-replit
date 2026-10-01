# U17: wrong authenticator codes at sign-in now count toward the account lockout

Launch rows D1 (production runs as configured: 2 API tasks, no shared store) and
D6 (account security). Date: 2026-10-01. Working tree based on `9a0c11174`
(`server/routes/auth.ts` unchanged at HEAD since `c8fb0f36c`).

Finding: `audit-findings.json`, the entry titled "Sign-in throttles on the
second-factor step are kept in each task's memory, so the per-IP TOTP guessing
budget doubles, and nothing counts wrong authenticator codes per account".

## The defect

`POST /api/auth/mfa/verify` (`server/routes/auth.ts:1620` before this change)
handled a wrong code at `server/routes/auth.ts:1695` by writing an audit row
and answering 401. For an account whose second factor is an authenticator, it
never called `isAccountLocked` and never called `recordFailedLogin`. So no
per-account lockout ever followed second-factor guessing. The only limits were
express-rate-limit counters in each task's memory (`signInLimits.secondFactor`,
10 failures per account per 15 minutes since `c8fb0f36c`). Production runs two
API tasks behind a round-robin load balancer with no shared store, so each task
kept its own count. A task started by a deploy or a scale-out began at zero.

There was a second hole behind the first. The password step cleared the
lockout count on every right password (`server/routes/auth.ts:530-531` before
this change). If wrong codes had simply been counted, someone holding the
password could have signed in again after every four wrong codes, and the
count would never have reached five.

The password step and the e-signature checks already used the lockout in
`server/services/auth-security-service.ts`: five failures, a 30-minute lock,
stored in the `users` row (`failed_login_attempts`, `locked_until`). The
e-signature path uses it through `signerReverificationDeps()`, described there
as "one count, one threshold, one duration per account".

## The fix (server/routes/auth.ts only)

- **A locked account is refused before any code is checked.** The new helper
  `refuseAccountAtSecondFactor` (line 1621) takes over the existing
  inactive-account check and adds `isAccountLocked`. A locked account gets the
  password step's answer word for word: 423,
  `{ success: false, error: { code: 'AUTH_002', message: 'Account temporarily locked due to too many failed attempts. Try again later.' } }`.
  Both steps now share that answer as `ACCOUNT_LOCKED_BODY` (line 211). The
  refusal is audited as the password step audits it: `user_login`, failure,
  `account_locked`. The code is not checked, so a locked account spends no
  authenticator step and no emailed code. This applies to every account. An
  emailed-code account locked at the password step can no longer finish
  sign-in with a challenge issued before the lock.
- **A wrong authenticator or recovery code calls `recordFailedLogin(userId)`**
  (`refuseWrongSecondFactor`, line 1636). It uses the same count, threshold and
  duration as the password step, in the users row. The audit reason is
  `invalid_code_threshold_exceeded` on the code that locks the account and
  `invalid_code` otherwise, matching the password step's
  `wrong_password_threshold_exceeded`. The 401 answer is unchanged and does not
  say that the account is now locked.
- **Wrong emailed codes are not added to the lockout.** They keep their
  existing caps in `emailOtpService`: 5 guesses per code and 3 re-issues per
  challenge, in the users row. That behaviour was verified and left alone, and
  a control test pins it.
- **The count is cleared when a sign-in completes.** On a right code, the
  route now calls `resetFailedLogins(userId)` (line 1713) in place of the bare
  `lastLogin` update. `resetFailedLogins` also stamps `lastLogin`, as before.
  The password step still clears the count for an account whose second factor
  is an emailed code, or on the development path where the password step
  creates the session (line 531). For an authenticator account it no longer
  clears the count, because the code still to come counts toward it.
- **Unchanged:** the challenge-token checks, `verifyLoginSecondFactor` (with
  its `consumeTotpStep` replay guard), the emailed-code path, and the
  per-account in-memory limiters. `auth-security-service.ts` is not modified.

ESLint on `auth.ts` gives 21 warnings before and after: no new warning. The
`/mfa/verify` handler went from 165 to 132 lines, and its complexity stayed at
28. The login handler's complexity went from 40 to 42, which is the same
single existing warning. `auth.ts` is 99,555 bytes, under the repo-health scan's
100,000-byte ceiling (98,589 before).

## Proof

New test:
`server/routes/__tests__/auth-mfa-totp-lockout.pglite.integration.test.ts`. It
drives the real router over HTTP, with the real `auth-security-service` and the
real drizzle handle over PGlite. The `users`, `organizations` and
`organization_users` tables are generated from `shared/schema.ts`. A "task" is a
fresh module graph (`vi.resetModules()`), which gives it its own router and its
own in-memory limiters while sharing one database. Only the authenticator check
(`verifyLoginSecondFactor`) is a double, and it accepts exactly one code.

### Fail before (unmodified `auth.ts`)

`npx vitest run server/routes/__tests__/auth-mfa-totp-lockout.pglite.integration.test.ts`

```
 × an authenticator account (U17) > 5 wrong codes lock the account in its users row; the right code is then refused 423 AUTH_002 without being spent
   → wrong authenticator codes were not counted against the account: expected +0 to be 5
 × an authenticator account (U17) > the count is one per account across tasks: wrong codes on two tasks lock it, and a third task refuses the right code
   → each task kept its own count: expected +0 to be 5
 × an authenticator account (U17) > the last wrong code is audited as the one that locked the account
   → expected 'invalid_code' to be 'invalid_code_threshold_exceeded'
 × an authenticator account (U17) > a right password does not clear what the second factor counted, so signing in again buys no fresh guesses
   → expected +0 to be 4
 × an authenticator account (U17) > [then titled "control: …"] a completed sign-in clears the count
   → expected +0 to be 2
 × an authenticator account (U17) > wrong passwords and wrong codes are one count, one threshold: the password step refuses an account the codes locked
   → expected 200 to be 423
 × an emailed-code account > a locked account completes no sign-in with a challenge issued before the lock, even with a code that would verify
   → a locked account was signed in with an emailed code: expected 200 to be 423
 ✓ an emailed-code account > control: wrong emailed codes keep their own cap (emailOtpService) and are not added to the account lockout
      Tests  7 failed | 1 passed (8)
```

### Pass after

```
 ✓ … 5 wrong codes lock the account in its users row; the right code is then refused 423 AUTH_002 without being spent
 ✓ … the count is one per account across tasks: wrong codes on two tasks lock it, and a third task refuses the right code
 ✓ … the last wrong code is audited as the one that locked the account
 ✓ … a right password does not clear what the second factor counted, so signing in again buys no fresh guesses
 ✓ … a completed sign-in (right code) clears the count the wrong codes built
 ✓ … wrong passwords and wrong codes are one count, one threshold: the password step refuses an account the codes locked
 ✓ … a locked account completes no sign-in with a challenge issued before the lock, even with a code that would verify
 ✓ … control: wrong emailed codes keep their own cap (emailOtpService) and are not added to the account lockout
      Tests  8 passed (8)
```

The cross-task case puts three wrong codes on task A and two on task B. The
account locks in the users row, and task C, whose memory has seen none of
those codes, refuses the right code with 423.

### Each part of the fix is pinned (mutants, each restored after)

| Mutant | Cases that fail |
|---|---|
| M1: drop the `isAccountLocked` check at the second step | 4 (lock refusal, cross-task, re-login, emailed-code locked) |
| M2: never call `recordFailedLogin` on a wrong code | 6 |
| M3: the password step clears the count unconditionally again | 1 (re-login buys no fresh guesses) |
| M4: success stamps `lastLogin` only, without clearing the count | 1 (completed sign-in clears the count) |
| M5: count wrong emailed codes too | 1 (the emailed-code control) |

### Existing suites

I ran 25 files, 299 tests, all passing. These were every test file that drives
`routes/auth.ts` or `/mfa/verify`, including `auth-mfa-challenge-factors`,
`auth-sign-in-limits`, `sign-in-office-address`, `authSurfaceSecurity`,
`passwordResetAuditTrail`, `auth-event-audit`, `mfa-enrolment` and
`account-lockout-atomic.pglite.integration`.

`npx tsc --noEmit -p tsconfig.json` reported 0 errors (exit 0).

## Residuals: not closed by this change

1. **The enterprise sign-in door has the same defect, and it can undo this
   fix.** `server/routes/authEnterprise.ts` belongs to the D6 P0 tranche lane
   and was not touched. `/api/auth/enterprise/verify-mfa` (line 494) neither
   checks nor counts the lockout. `/api/auth/enterprise/verify-password`
   clears the count on every right password (line 388). As long as that is
   true, someone holding the password can guess authenticator codes there
   without a per-account lockout. They can also clear the count built at
   `/api/auth/mfa/verify` by signing in through the enterprise door before it
   reaches five. Once the account is locked, the enterprise password step does
   refuse it (it checks `isAccountLocked`), but its `verify-mfa` does not. The
   enterprise door needs the same two changes made here: refuse a locked
   account at `verify-mfa`, call `recordFailedLogin` on a wrong authenticator
   code, and clear the count when the second factor succeeds rather than at
   the password. Until then U17 is closed for `/api/auth` and open for
   `/api/auth/enterprise`.
2. **The in-memory limiters are still per task.** That part of the finding
   (the per-address and per-account express-rate-limit budgets multiply with
   the task count) is unchanged. The DB lockout is now the brake that holds
   across tasks.
3. **The audit ledger has no sentence of its own for the new reason
   `invalid_code_threshold_exceeded`.** `describeAuthEvent` falls back to its
   generated text ("user login mfa failed: failure
   (invalid_code_threshold_exceeded)"). A sentence belongs in
   `server/services/audit/auth-event-audit.ts`, which is outside this lane.
4. **Clearing the count at sign-in logs and continues on a write error.** The
   `lastLogin` stamp now goes through `resetFailedLogins`, which does this,
   where the bare update it replaced answered 500. If the write fails, the
   count stays where it was, which is the conservative direction.
5. **Behaviour change for authenticator accounts.** Wrong passwords and wrong
   codes share one count of five, and a right password alone no longer clears
   it; a completed sign-in does. A person with three wrong passwords and two
   wrong codes is locked for 30 minutes. This is the same rule the e-signature
   path already applies.
