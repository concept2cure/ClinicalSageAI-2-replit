# IAM-18 item 8 at the enterprise door, and P1-3's per-challenge resend cap (Low / Medium)

**Row:** D6. **Findings:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-18 (8) (login timing reveals which
e-mails exist) and IAM-09 (the emailed-code budget refilled by asking for the code again). **Plan items:** P1-2 part 2
(the main door, closed `e93c7878`) and P1-3 (its last engineering residual, "a per-challenge resend cap"). Audited
head for the line references below: `7fbe51c5`.

## What was wrong

**(a) The timing oracle was closed at one door of two.** `server/routes/auth.ts:405-416` defined
`padUnknownEmailTiming` (a cost-12 bcrypt comparison against a hash nobody can sign in with) and called it at `:437`
for an unknown e-mail, so the main login answered an unknown address in the time a wrong password takes. The
enterprise password step, `server/routes/authEnterprise.ts:272-286` (`POST /api/auth/enterprise/verify-password`),
returned 401 `INVALID_CREDENTIALS` for an unknown e-mail with no bcrypt call at all: the response time still said
whether an address was enrolled, a few milliseconds against roughly a quarter of a second. Both doors also skipped
the comparison for a known account whose `password_hash` is null (`auth.ts:482`; `authEnterprise.ts:345-347`), the
same gap for a provisioned-but-never-set account. The register (IAM-18 row) and the evidence index recorded "(8)
closed" on the strength of the main door alone.

**(b) Nothing counted the codes one sign-in challenge minted.** `POST /api/auth/mfa/resend` (`auth.ts:1854-1919`)
verified the five-minute `mfa_challenge` JWT (`server/services/mfaService.ts:634-656`, no jti, no revocation) and
called `emailOtpService.createEmailOtp` (`auth.ts:1894`; `server/services/emailOtpService.ts:67-93`). P1-3 had made
`createEmailOtp` keep the guesses already spent while a code was pending, but the only server-side challenge state was
`users.email_otp_hash / _expires_at / _attempts` (`shared/schema.ts:2599-2601`), so:

- inside its five minutes a challenge could be mailed codes without limit, bounded only by `mfaLimiter`
  (`auth.ts:169-178`: 10 per 15 minutes per IP, in a per-process `MemoryStore`, shared with `/mfa/verify`);
- a sixth wrong guess matched no row and `clearOtp` (`emailOtpService.ts:130-133, 156-165`) nulled the hash and
  zeroed the attempts, so the next resend found nothing pending and started a fresh budget of five guesses. Repeat.

## What is true now

**(a)** `server/services/login-timing-pad.ts` is the one copy of the pad (`padUnknownEmailTiming`, and
`PASSWORD_HASH_COST = 12`, which the three `bcrypt.hash` sites in `auth.ts` now use so the pad and the stored hashes
cannot drift apart). `auth.ts` imports it in place of its local function and calls it on the unknown-e-mail branch
and on the null-hash branch; `authEnterprise.ts` calls it on its unknown-e-mail branch, before the audit write, and
on its null-hash branch. An unknown address and an account without a password each pay exactly one comparison at
cost 12 at either door; a known account with a hash pays its own comparison and never the pad. The module lives
outside `auth-security-service.ts` because both route harnesses mock that module with a fixed export list.

**(b)** `users.email_otp_resends INTEGER DEFAULT 0` counts the codes re-issued to the current challenge.
`emailOtpService.reissueEmailOtp(userId)` is one conditional `UPDATE … RETURNING`: new hash and expiry, the spent
attempts carried over (the same `CASE` `createEmailOtp` uses, now a shared helper), `email_otp_resends + 1`, `WHERE
coalesce(email_otp_resends, 0) < MAX_RESENDS`; no row updated means capped, and the function returns `null` with the
pending code and its expiry untouched. **`MAX_RESENDS = 3`** — the code that comes with the challenge is not counted,
so a challenge can be mailed four codes in all. `createEmailOtp` (what `/login` and the enterprise password step
call) sets the count to 0: a fresh budget of codes costs the password. `clearOtp` and the consume leave the count
alone, so the exhaust-then-resend path still counts against the challenge and the cap still binds. `/mfa/resend`
calls `reissueEmailOtp`; `null` answers **429** `{ code: 'MFA_RESEND_LIMIT', message: 'This sign-in has already
received its limit of emailed codes. Sign in again to request a new one.' }`, mails nothing, and records
`user_login_mfa_challenge | failure | resend_limit` against the account in the organisation the server signed into the
challenge; the ledger sentence is "Emailed code not re-sent: this sign-in has already received its limit of emailed
codes". Client: the sign-in pages render the message the `ApiClient` hands them, but `ApiClient.request` (`client/src/services/portal/authService.tsx`) read `code` and `message` at the top level of the body while every `/mfa/resend` refusal nests them under `error` (found by the verifier), so the sentence would have fallen back to the generic one; `apiErrorOfResponse` now reads both shapes (test `authService-api-error.test.ts`, red first).

**Migration route chosen: in-place amendment of `migrations/20260923_users_mfa_totp_last_step.sql`** (the set's
other `users` MFA column, already registered at `migration-set.mjs:2550` with the C-20 ordering note), with a dated
header note saying what was added, why, and by which change, and one additive `ALTER TABLE IF EXISTS users ADD COLUMN
IF NOT EXISTS email_otp_resends INTEGER DEFAULT 0`. Not a new file: that needs a line in `scripts/db/migration-set.mjs`,
which the D1 lane held until 2026-09-27 12:31 UTC, and Rule 1 permits an additive in-place amendment precisely because
every set file re-runs on every deploy. The column has one creator, like its `email_otp_*` siblings
(`0009_email_otp_fields.sql`, on no applier; `server/db/bootstrap/auth-schema.ts` carries none of them); deploy runs
the set before the new image serves. The schema column and the migration ship in the same change: a schema-only
column breaks every sign-in with 42703, because both doors do a bare `select().from(users)`.

## Evidence

| | File | Result |
|---|---|---|
| red | `red/before-fix-enterprise-timing.txt` | HEAD `7fbe51c5`, sources unchanged: unknown e-mail → `bcrypt.compare` called 0 times; null-hash account → 0 times. 2 failed / 1 passed |
| red | `red/before-fix-resend-cap-service.txt` | `MAX_RESENDS` undefined, `reissueEmailOtp is not a function`. 5 failed / 6 passed (the P1-3 cases still green) |
| red | `red/before-fix-resend-routes.txt` | `/mfa/resend` went through `createEmailOtp`; a capped challenge was answered 200 with mail. 2 failed / 6 passed |
| red | `red/before-fix-ledger-sentence.txt` | `describeAuthEvent` fell back to "user login mfa challenge: failure (resend_limit)". 1 failed / 18 passed |
| red (did not fail) | `red/gates-schema-only.txt` | With the column only in `shared/schema.ts` and no migration, `ci:column-reachability` and `ci:model-migration-agreement` both **pass**: the drizzle push surface vouches for any column of a public table (`check-column-reachability.mjs`, "drizzle push creates public tables only"). The gate cannot see the deploy path's difference, so it is not the check that proves the migration; the next row is |
| red | `red/before-fix-migration-contract.txt` | The real `20260923` file applied to the pre-2026-09-26 `users` shape (column dropped), then `createEmailOtp`: **42703** `email_otp_resends` — the C-20 mode a deploy would hit. 1 failed |
| green | `green/after-fix-enterprise-timing.txt` | 3 / 3 |
| green | `green/after-fix-resend-cap-service.txt` | 12 / 12: MAX reissues then `null` with hash and expiry unchanged and the last code still verifying; spent attempts kept; clearing guess then reissue still capped; `createEmailOtp` resets; ten concurrent reissues change exactly 3 rows and exactly one minted code is the pending one; the amended set file adds the column, is re-runnable, and `createEmailOtp` then writes |
| green | `green/after-fix-resend-routes.txt` | 8 / 8: 200 through `reissueEmailOtp` with mail, never `createEmailOtp`; 429 `MFA_RESEND_LIMIT`, no mail, one audit row; `/login` control through `createEmailOtp`; the P1-2 cases and the unknown-e-mail pad through the shared module |
| green | `green/after-fix-ledger-sentence.txt` | 19 / 19 |
| green | `green/gates.txt` | `ci:column-reachability` OK; `ci:migration-set-order` OK (315 migrations); `ci:migration-drop-safety` OK (no DROP added); `check:security-patterns` 0 violations across 2857 files |
| green | `green/neighbouring-suites.txt` | the other suites that load `routes/auth.ts` or `routes/authEnterprise.ts` with fixed-list mocks of `emailOtpService` |

ESLint: `login-timing-pad.ts` and `authEnterprise-unknown-email-timing.test.ts` 0 problems; every edited file at its
HEAD count (`auth.ts` 21 warnings, `authEnterprise.ts` 10, `schema.ts` 2, the rest 0).

## Re-run

```
NODE_OPTIONS=--max-old-space-size=1536 npx vitest run \
  server/routes/__tests__/authEnterprise-unknown-email-timing.test.ts \
  server/routes/__tests__/auth-mfa-challenge-factors.test.ts \
  server/services/__tests__/account-lockout-atomic.pglite.integration.test.ts \
  server/services/audit/__tests__/auth-event-audit.test.ts
npm run --silent ci:column-reachability && npm run --silent ci:migration-set-order && \
  npm run --silent ci:migration-drop-safety && npm run --silent check:security-patterns
```

To see the migration contract fail: remove the `email_otp_resends` ALTER from
`migrations/20260923_users_mfa_totp_last_step.sql` and run the PGlite file with `-t 'migration the set runs'`.

## Left open

- **The column gates cannot see a drizzle-only column on a push-created public table.** `ci:column-reachability` treats
  every `shared/schema.ts` column of a public table as durable, while deploy runs `deploy-migrate.mjs` only. The
  PGlite contract case is this change's proof; a gate that asks "does a durable set file ADD every `users` column
  the model declares" would make it general. An observation for the gate owners, not this item's.
- **A resend that mints records no audit event** (the 200 path recorded nothing before and records nothing now);
  only the refusal is recorded. A `user_login_mfa_challenge | success | mfa_code_resent` row is a small follow-up.
- **The enterprise door re-mints a fresh challenge per correct-password call** (`authEnterprise.ts:414`,
  `createEmailOtp`): each is a new challenge, so the cap does not apply; bounded by `enterpriseAuthLimiter` and the
  password. Outside this item.
- **Redis in production** for the per-IP limiters and the idle store (P1-3 hand-off, founder). The cap itself is on
  the `users` row and holds across ECS tasks; the limiters remain per task.
- The register's IAM-18 row says "(8) closed by the P1-2 part-2 commit"; that was the main door only. Proposed
  wording is in this change's structured result (shared documents are the control tower's).
