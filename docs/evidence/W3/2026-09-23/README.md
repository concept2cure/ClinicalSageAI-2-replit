# W3: the validation package executed with the authentication production requires (2026-09-23)

**Row moved:** D4 (validation package). **Workstream:** W3.

**State:** D4 is **not green**. This set closes the last gap between local
execution and staging on the authentication side: the harness now works
against a server that refuses dev-login and challenges every sign-in. The
execution exposed two Part 11 defects. Both are fixed: F-18 before this set was
filed, F-19 after it (VSR-001 §13.7). What is
still owed is listed in VSR-001 §13.6 and at the end of this file.

## What was executed

| | |
|---|---|
| Database | `c2c_oq_w3_20260922b`, the §12 database (provisioned from empty by `npm run up`) |
| Server | `npx tsx server/index.ts`, booted from the env files with no database variable exported: `RLS_ENFORCE=on NODE_ENV=development ALLOW_DEV_AUTH=0 SKIP_DB_STARTUP_TEST=true LAUNCH_SCOPE_ENFORCE=on PORT=5200`, plus `MFA_ENCRYPTION_KEY`. Dev-login answers 404, and every password sign-in is challenged |
| Runtime role | `app_service`: not superuser, no BYPASSRLS, owns no table (IQ-07) |
| AI provider | None. OQ-AUTH-16 is a deviation; nothing was simulated |
| Identities | Run identity (author): user 17, `oq-runner@validation.local`. Second signer: user 11, `oq-signer@validation.local`. Both are org 1 and were provisioned into this database only by `scripts/seed-admin.mjs` (`transcripts/provision-runner.transcript.txt` is redacted). Both enrolled a TOTP factor through the product's own endpoints: `POST /api/auth/mfa/setup`, then `POST /api/auth/mfa/enable` |
| Secrets | Passwords and TOTP secrets exist only in the session scratchpad. The whole folder was searched for each of them, the MFA encryption key, any six-digit code in a factor field, bearer tokens and local paths. Nothing was found |
| Commit | IQ and OQ both at `0e2b3a971` |
| Runner | `VALIDATION_USER_EMAIL`, `VALIDATION_USER_PASSWORD`, `VALIDATION_USER_TOTP_SECRET`, `OQ_SIGNER_EMAIL`, `OQ_SIGNER_PASSWORD`, `OQ_SIGNER_TOTP_SECRET`, `OQ_AUTHOR_EMAIL`, `VALIDATION_RUN_DATE=2026-09-23`. Commands: `node scripts/validation/run-iq.mjs` and `node tests/validation/run-all.mjs`, each run with the server's `ALLOW_DEV_AUTH`, `RLS_ENFORCE`, `NODE_ENV` and `LAUNCH_SCOPE_ENFORCE` |

## Results

| Record | Pass | Fail | Deviation | Not executed |
|---|---|---|---|---|
| `IQ/` IQ-001 v0.4 | 12 | 0 | 3 | 0 |
| `OQ-PROJECTS/` | 16 | 0 | 0 | 0 |
| `OQ-VAULT/` | 12 | 0 | 0 | 0 |
| `OQ-AUTHORING/` | 23 | 0 | 1 | 0 |
| `OQ-SUBMISSION-CENTER/` | 15 | 0 | 0 | 0 |
| `OQ-SUBMISSION-READINESS/` | 9 | 0 | 0 | 0 |
| `OQ-QMS/` | 20 | 0 | 0 | 0 |

- Every OQ record names `authentication: password+totp`.
- IQ-10 passes: dev-login answers 404.
- IQ-11 passes on a session opened by password and code.
- TM-001 was regenerated from this set: 67 requirements, 66 pass, 1 partial
  (URS-AUTH-012, no provider), 0 fail.
- Transcripts are in `transcripts/`.

## The defects, each shown failing before its fix

| Folder / file | Shows |
|---|---|
| `red/harness-dev-login-only.transcript.txt` | P-6. The harness before `9b77ee3d8`, against this server: `dev-login failed (404)`. No protocol reached its first step |
| `red/first-mfa-run.transcript.txt` | The first run with enrolled signers, at `9b77ee3d8`. OQ-QMS-05 is refused `MFA_TOKEN_REQUIRED`; OQ-PROJ-02 cannot sign in through Demo Access. OQ-SUBC-08 *passes*, because the route let it sign with the password alone |
| `red/F-18/OQ-SUBC-08.password-only-sign.api-1.json`, `…signature-row.api-2.json` | F-18. Signer 11, who has a TOTP factor enrolled, signs `ectd-sequence:3` with `reauth: {password}` only → 200. The Part 11 row reads `second_factor_verified: false, is_valid: true` |
| `red/F-18/OQ-QMS-05.password-only-refused.api-1.json` | The same signer at the same commit, refused by the QMS approval: 401 `MFA_TOKEN_REQUIRED` |
| `red/F-18/unit-before-fix.txt`, `unit-after-fix.txt` | `server/routes/c2c/__tests__/reauth-second-factor.test.ts` against the `verifyReauth` of `9b77ee3d8`: 3 fail / 6 pass. The password-only signature is accepted; an unreadable enrolment state is waved through; a signer with no stored password gets `REAUTH_USER_NOT_FOUND`. At `828faf809`: 9 / 9 |
| `red/F-19/dbtest-before-fix.txt`, `dbtest-after-fix.txt` | F-19. `tests/db/sign-in-audit-trail.dbtest.ts` drives production's route registration as a non-superuser role with RLS enforcing. Before the fix: 6 fail / 2 pass. The challenge, the wrong password and the logout are refused by the `audit_logs` policy (4 refusals); the wrong code and the session are never written. After: 8 / 8, 0 refusals |
| `red/F-19/dbtest-scope-without-logout-check.txt` | F-19. The scope fix without `/logout` verifying its token: a token signed with a foreign key writes `user_logout` into the organisation's chain (3 fail). The final fix attributes a logout only from a token the server signed |
| `red/F-19/unit-without-scope.txt`, `unit-after-fix.txt` | F-19. The scope rule, in the default CI job: 2 fail / 8 pass with the write unscoped; 10 / 10 with it |
| `red/F-19/live-after-fix.json`, `live-logout-after-fix.json` | F-19. The fixed server, live: sign-in events recorded in org 1's chain, 0 refusals. On the final code, a forged-token logout is recorded as tenant 0, and the genuine logout as org 1 / user 17. The chain verifier reads `ok` (273 rows) |
| `OQ-001-v0.4/before-F-19-fix/`, `after-F-19-fix/` | OQ-PROJ-16 (URS-PROJ-010), the step added after F-19, at `5a53d2db2`. On the pre-F-19 auth code: **fail**, 0 ledger entries added by 5 sign-in attempts. On the fixed code: 17 / 0 / 0 / 0. Its first draft passed on the unfixed code, because it read entries an earlier run had left (VSR-001 §13.8) |
| `red/login-limit.transcript.txt` | P-9. A re-run inside 15 minutes. OQ-PROJ-02's sign-in through the form never reaches the code step. Every protocol after it fails to open its session: 429 `RATE_LIMIT` |
| `IQ-falsification/v0.3-dev-login-closed/` | P-10. The v0.3 runner (`c33e43d26`) on this server records IQ-10 as a deviation, "cannot be exercised on a development install", while observing the refusal. IQ-11: "no session (IQ-10)" |
| `IQ-falsification/v0.3-dev-login-open/` | P-10. The same runner on a server with dev-login open, configured to refuse it, also records a deviation: the check cannot fail |
| `IQ-falsification/v0.4-dev-login-open/` | P-10. The v0.4 runner (`0e2b3a971`) on that server: IQ-10 **fail**, "this configuration must answer 404" |

P-8 is not filed as a record. The first complete run under production
authentication (at `ebd0edd42`) wrote the QMS approvals' `mfaToken` into four
step files (`OQ-QMS-05.api-4`, `-05.api-5`, `-06c.api-2`, `-06d.api-1`). That
run was discarded rather than redacted by hand. The harness was fixed
(`52e3acc94`), and the set in this folder was produced by re-executing.

## Observations filed for other rows

| File | Shows |
|---|---|
| `observations/sign-in-audit-refused.log.txt` | F-19, before its fix. Every password sign-in logs `user_login_mfa_challenge`, then `new row violates row-level security policy for table "audit_logs"`, 6 of 6. `audit_logs` holds no such row. `/api/auth/mfa/verify` writes no audit event at all |
| `observations/totp-replay.json` | D6. One TOTP code opens two sessions for one identity inside one time step. Only status codes are recorded, never the code |
| `observations/login-limit-forwarded-for.txt` | D1/D6. Login attempts claiming twelve different clients in `X-Forwarded-For` share one rate-limit bucket. No `trust proxy` is set, so behind the ALB every user shares the proxy's bucket |

## Changes made to get here

| Commit | What |
|---|---|
| `9b77ee3d8` | P-6. Password + TOTP sessions (`tests/validation/lib/totp.mjs`, `harness.mjs` `passwordLogin`) |
| `828faf809` | F-18. `verifyReauth` goes through the canonical signer re-verification. The e-sign modal asks for the code |
| `ebd0edd42` | P-7. OQ-SUBC-08 and OQ-QMS-05 prove password-only signing is refused, then sign with the code. OQ-PROJ-02 signs in through the form |
| `52e3acc94` | P-8. `mfaToken` is redacted |
| `c33e43d26` | P-9. One sign-in per identity per run |
| `0e2b3a971` | P-10. IQ-10 can pass and fail; IQ-11 signs in without dev-login |
| the change that adds `red/F-19/` | F-19. Authentication events are written in the scope of the organisation they record (`server/services/audit/auth-event-audit.ts`). `/mfa/verify` records its outcome. `/logout` attributes only a token the server signed |

## Owed, and not closable by another local run

1. Staging execution of IQ-001 and all six OQ protocols with the production
   image (`NODE_ENV=production`: the dev-login refusal on that branch, the HMAC
   seal, enforcing CSP and HSTS), a real second account created through user
   administration, and a witness.
2. A PQ-passed AI provider, for OQ-AUTH-16 / URS-AUTH-012.
3. A release signature applied by a real signer on the IND sequence.
4. The qualified contractor's review. §11.5 item 5 now also covers the
   Authoring PIN signature (VSR-001 §13.3 item 3). Then signatures.
5. **The F-15 decision** (VSR-001 §12.2).
6. A full execution that includes OQ-PROJ-16. This set predates the step, so TM-001 shows URS-PROJ-010 uncovered.
