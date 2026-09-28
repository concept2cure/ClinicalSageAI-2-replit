# W3: the validation package executed on a fresh installation at one commit carrying every fix (2026-09-23, third execution)

**Row moved:** D4 (validation package). **Workstream:** W3.

**State:** D4 is **not green**. This set executes IQ-001 and all six OQ
protocols at one commit that carries everything VSR-001 §16 records: the one
signing ceremony, the account-standing checks and OQ-PROJ-18, and the fixes
for F-24 to F-33, #53 and #27. What is still owed is at the end of this file
and in VSR-001 §16.10.

`2026-09-23c` is the third execution on 2026-09-23. The run date is only a
folder key; the `2026-09-23` and `2026-09-23b` sets stay in the tree,
unchanged.

## What was executed

| | |
|---|---|
| Installation | **Fresh.** The container that held the §12 database was replaced during this work. The database `c2c_oq_w3_20260923c` was provisioned from empty by the documented path, `C2C_DB_NAME=c2c_oq_w3_20260923c npm run up` (`transcripts/provision.transcript.txt`, redacted), then the migration set re-applied at the run commit as a deploy does it: 307 of 307 files, readiness contract 8 of 8, runtime role refreshed (`transcripts/deploy-migrate.transcript.txt`) |
| Installation steps caught on the way | (1) The new container had no pgvector. `install-fresh` refused to report success ("Install INCOMPLETE", three areas; `transcripts/provision-first-attempt-no-pgvector.transcript.txt`). pgvector was installed (`apt-get install -y postgresql-16-pgvector`, as the script's message says) and the database provisioned again, empty. (2) The validation toolchain was not installed. The first IQ attempt recorded IQ-15 **fail**, "playwright-core not installed under tests/validation", and every OQ protocol stopped at launch (`first-attempt/`). It was installed from its lockfile (`npm ci` in `tests/validation`) and the whole set executed again |
| Server | `npx tsx server/index.ts`, booted from the env files `npm run up` wrote, with no database variable exported: `RLS_ENFORCE=on NODE_ENV=development ALLOW_DEV_AUTH=0 SKIP_DB_STARTUP_TEST=true LAUNCH_SCOPE_ENFORCE=on PORT=5200`, plus `MFA_ENCRYPTION_KEY`. The IQ on one fresh process and the OQ run on another: the OQ run makes ten sign-ins, the IQ one more, and the server allows ten per address in fifteen minutes (OQ-001 §1) |
| Runtime role | `app_service`: not superuser, no BYPASSRLS, owns no table (IQ-07) |
| AI provider | None. OQ-AUTH-16 is a deviation; nothing was simulated |
| Identities | All in organisation 1 (Concept2Cure Therapeutics), each with a TOTP authenticator enrolled through the production sign-in: the password, then the emailed code (with no SMTP configured, the development mail sink writes it to the server log), then `/api/auth/mfa/setup` and `/mfa/enable`. User 1, `oq-runner@validation.local`, the run identity, organisation admin, seeded by `npm run up`. User 2, `oq-signer@validation.local`, the second signer, organisation admin, `scripts/seed-admin.mjs`. User 3, `oq-platform@validation.local`, OQ-PROJ-18's platform administrator: a member, not an administrator, of the organisation, with an active `platform_role_grants` row. User 4, `oq-standing@validation.local`, the account OQ-PROJ-18 suspends and restores, a member |
| Secrets | Passwords, TOTP secrets and the MFA encryption key exist only in the session scratchpad. The folder was searched for each of them, JWTs, bearer tokens, any six-digit value in a factor field, and local paths: nothing found. Every `password`, `pin`, `totp` and `mfaToken` field in a step file reads `[REDACTED]` |
| Commit | IQ and all six OQ records at `bfdb0a08` |
| Runner | `VALIDATION_USER_EMAIL`, `VALIDATION_USER_PASSWORD`, `VALIDATION_USER_TOTP_SECRET`, `OQ_SIGNER_EMAIL`, `OQ_SIGNER_PASSWORD`, `OQ_SIGNER_TOTP_SECRET`, `OQ_AUTHOR_EMAIL`, `OQ_PLATFORM_ADMIN_EMAIL`, `OQ_PLATFORM_ADMIN_PASSWORD`, `OQ_PLATFORM_ADMIN_TOTP_SECRET`, `OQ_STANDING_EMAIL`, `OQ_STANDING_PASSWORD`, `OQ_STANDING_TOTP_SECRET`, `VALIDATION_RUN_DATE=2026-09-23c`. Commands: `node scripts/validation/run-iq.mjs`, then `node tests/validation/run-all.mjs`, each with the server's `ALLOW_DEV_AUTH`, `RLS_ENFORCE`, `NODE_ENV` and `LAUNCH_SCOPE_ENFORCE` |

## Results

| Record | Pass | Fail | Deviation | Not executed |
|---|---|---|---|---|
| `IQ/` IQ-001 v0.4 | 12 | 0 | 3 | 0 |
| `OQ-PROJECTS/` OQ-001 v0.7 | 19 | 0 | 0 | 0 |
| `OQ-VAULT/` OQ-002 v0.3 | 12 | 0 | 0 | 0 |
| `OQ-AUTHORING/` OQ-003 v0.4 | 23 | 0 | 1 | 0 |
| `OQ-SUBMISSION-CENTER/` OQ-004 v0.3 | 15 | 0 | 0 | 0 |
| `OQ-SUBMISSION-READINESS/` OQ-005 v0.5 | 11 | 0 | 0 | 0 |
| `OQ-QMS/` OQ-006 v0.6 | 20 | 0 | 0 | 0 |

- Every OQ record names `authentication: password+totp`.
- The one OQ deviation is OQ-AUTH-16: no provider.
- The IQ deviations are the development-install ones: IQ-DEV-002, 004 and
  005.
- OQ-SRDY-05b and 06b executed and passed. In `2026-09-23b` both were
  deviations for want of a project anchor; every organisation now holds its
  own client workspace (`a264e291`), so intake anchors each program.
- OQ-PROJ-18 passed. The platform administrator, who is not an
  organisation admin, suspended the subject. The subject's session was then
  refused by the API and the session check, and its password step answered
  403 with no challenge. The refusal was read back on the ledger, chained.
  Once restored, the same session read projects 200.
- Every step is recorded with the kind its protocol gives it: 81 scripted,
  9 unscripted, 6 ad-hoc, 5 prerequisite.
- The OQ server's log shows 10 password attempts and 8 code verifications,
  and no 429. The IQ server's log shows one of each.
- Neither log shows a row-level-security refusal, a permission denial or a
  500. The only errors are OQ-AUTH-16's two 503s.
- TM-001 was regenerated from this set: 70 requirements, 69 pass,
  1 partial (URS-AUTH-012, no provider), 0 fail, 0 uncovered.
- Transcripts are in `transcripts/`. The first attempt, whose IQ recorded
  IQ-15 failing and whose OQ protocols stopped at launch for want of the
  validation toolchain, is in `first-attempt/`.

## Observations filed for other rows

VSR-001 §16.6.

## Changes made to get here

The commits since the `2026-09-23b` set, and the folders that show each fix
failing first, are indexed at the end of `../2026-09-23b/README.md`.
VSR-001 §16 dispositions them.

## Owed, and not closable by another local run

1. Staging execution of IQ-001 and all six OQ protocols with the production
   image (`NODE_ENV=production`: the dev-login refusal on that branch, the HMAC
   seal, enforcing CSP and HSTS), a real second account created through user
   administration, and a witness.
2. A PQ-passed AI provider, for OQ-AUTH-16 / URS-AUTH-012.
3. A release signature applied by a real signer on the IND sequence.
4. The qualified contractor's review. Then signatures.
