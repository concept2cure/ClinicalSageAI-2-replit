# P1-2 (recovery-code half) — recovery codes were issued and never redeemable (IAM-08, Medium)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-08. **Plan item:** P1-2, the recovery-code
half. The org-level "require an authenticator" policy, the emailed-code fallback for TOTP accounts and signup e-mail
verification are the other parts and are not done here (below).

## What was wrong

`enableMfa` (`server/services/mfaService.ts`) issued ten recovery codes, hashed into `users.mfa_backup_codes`, and no
verifier accepted them: `verifySecondFactor` refused anything that was not six digits, so the codes a person was told to
keep opened nothing. The login screen (`client/src/concept2cure/auth/ZenLogin.tsx`) already offers "Use a recovery
code" and posts `{ method: 'backup_code', code }`; the server answered `AUTH_004` every time. The D6 note of 2026-09-23
(`docs/evidence/D6/2026-09-23/README.md`, item 1) recorded the decision to take: redeem them at the login challenge only,
or stop issuing them.

## What is true now

- `verifyLoginSecondFactor(userId, token)` is the login challenge's verifier: an authenticator code, or a recovery code
  the enrolment issued, each consumed on acceptance; it says which (`'totp' | 'recovery' | null`).
- Redemption is one conditional `UPDATE … RETURNING` that removes the code's hash from `mfa_backup_codes` only if it
  is there and the enrolment is enabled: a second presentation, and the second of two concurrent presentations, gets
  nothing; another account's code and a disabled enrolment's code are refused; the code is accepted as people type it
  (either case, with or without the dash); anything of neither shape is refused without a query.
- `verifySecondFactor` and `verifyToken` (what the signing ceremony, enrolment and disablement call) still refuse a
  recovery code and leave it unconsumed: a recovery code signs a person in, it never signs a record.
- The enterprise login challenge (`server/routes/authEnterprise.ts`) calls the new verifier and records the method as
  `backup_code`.

| | File | Result |
|---|---|---|
| red | `red/recovery-codes-before-fix.txt` | HEAD `e715ea1a`, service unchanged: no verifier redeems a recovery code (8 failed); the authenticator-only entry points already refused one (2 passed) |
| green | `green/recovery-codes-after-fix.txt` | 116 / 116 across the new PGlite suite, `tests/services/mfaService.test.ts` (which pins that `verifyToken` refuses a recovery code), the enterprise refresh and surface suites, `reverifySigner`, the action route's re-auth and the e-signature route |
| green | `green/gates.txt` | `check:security-patterns` 0 violations |

Test: `server/services/__tests__/mfa-recovery-code-redemption.pglite.integration.test.ts` (real PGlite behind the
drizzle handle).

## Not done here

- **The main login challenge** (`POST /api/auth/mfa/verify`, `server/routes/auth.ts` ~1447-1458) still calls
  `verifyToken`, so the recovery-code mode the login screen offers keeps failing there until that call becomes
  `verifyLoginSecondFactor` (and the success event records the method). `routes/auth.ts` is inside another lane's
  24-hour window until 2026-09-26 01:07 UTC; the change is one call site and this session wires it when the window
  closes, or the next D6 session does.
- **TOTP accounts falling back to emailed codes** (`/mfa/resend` and the `email` branch of `/mfa/verify`, both in
  `routes/auth.ts`) and the org-level "require an authenticator" policy: the same file and a tenant setting; open on P1-2.
- **Re-issuing recovery codes** after some are spent: `authService.generateBackupCodes()` exists on the client; the
  server route it calls should require the authenticator (`verifyToken`), which is unchanged here.
