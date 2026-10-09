# P1-2 (third part) — sign-up hands out no session until the address is confirmed (IAM-17)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-17 ("signup returns a 24 h admin token
with no email verification"). **Plan item:** P1-2, the sign-up half. The recovery-code and emailed-code parts are in
`../P1-2/`.

## What was wrong

`POST /api/auth/signup` created an organisation and its administrator and answered with a day-long administrator
session for whatever address it was given. Nothing showed the address was the holder's: an account could be bound to
someone else's address, and a regulated tenant's first administrator was whoever typed the form. 21 CFR 11.100(b) and
NIST SP 800-63A expect the identity an account is bound to be established before the account acts.

## What is true now

- **Sign-up creates the account in `pending_verification`** (`services/account-standing.ts`), mails a link, and
  answers 201 with `verification: { required: true, email }` and no token. The link
  (`services/email-verification.ts`) carries a signed, single-purpose token — the account, the address it was created
  with, `type: 'email_verification'`, 24 hours — in the URL fragment, which browsers never send to a server. No
  authenticator admits that class (`middleware/tokenType.ts` requires `type: 'access'`).
- **`POST /api/auth/verify-email`** moves the account to `active` from `pending_verification` only: a link used twice
  answers the same confirmation and writes nothing; a suspended account is not revived by an old link; anything
  unsigned, expired or of another class is one refusal (`AUTH_VERIFY_INVALID`). The welcome mail goes out here, not at
  sign-up. It never signs the person in: the link proves the address, the password and second factor prove the person.
- **Sign-in for a pending account** is refused after the password, at both doors (`routes/auth.ts`,
  `routes/authEnterprise.ts`), as `AUTH_EMAIL_UNVERIFIED`, and recorded (`user_login | failure | email_unverified`).
  Every other check the account already had (revocation, standing, refresh) refuses a non-active status as before.
- **`POST /api/auth/resend-verification`** answers 202 for every address and mails only an account that is still
  pending, so it tells nobody which addresses are registered. Both routes share a limiter of ten per hour per address.
- **A deployment that cannot mail the link, or has no public origin to build it on, refuses sign-up (503
  `AUTH_SIGNUP_UNAVAILABLE`)** before any database work, rather than create an account nobody can activate. A
  development server with dev auth allowed (`NODE_ENV=development` and `ALLOW_DEV_AUTH=1`) skips verification and
  keeps the previous behaviour; staging and production never do.
- **The client**: the sign-up form's last step says the link was sent (`SignupVerifyStep`, resend with a cooldown,
  a way to the sign-in page) and stores nothing; the link opens `/concept2cure/verify-email` (`VerifyEmail`), which
  drops the token from the address bar, posts it, and says confirmed or not, with a way to request a new link. The
  eighteen locales carry the strings.
- Auth-event descriptions for the new events read in the ledger surface (`services/audit/auth-event-audit.ts`).

## Not in this commit

- The real-database tests that drive sign-up (`tests/db/signup-launch-catalog.dbtest.ts`,
  `tests/db/entitlement-grants-resolution.dbtest.ts`) observe the mail service instead of reaching an SMTP host; they
  are not executed here (no PostgreSQL in this container) and run in CI's Test job.
- The two remaining P1-2 parts: the org-level "require an authenticator app" policy (its settings key lives in
  `server/routes/tenant-config.ts`, inside another lane's window until 02:42 UTC 09-27) and the breached-password
  check.

## Evidence

- `red/before-fix.txt` — the new route and client cases against the previous code: failing (no verification module,
  a token handed out at sign-up).
- `green/after-fix.txt` — the same files after the change, with the neighbouring auth suites and the
  locale-integrity test: passing.
- Gates in the commit message.
