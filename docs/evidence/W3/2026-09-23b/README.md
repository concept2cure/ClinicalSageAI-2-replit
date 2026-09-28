# W3: the validation package executed at one commit carrying every fix (2026-09-23, second execution)

**Row moved:** D4 (validation package). **Workstream:** W3.

**State:** D4 is **not green**. This set closes the local gap the 2026-09-23 set
left: that set predates the fixes for F-19 to F-22 and the two steps that
cover them, so TM-001 built from it left URS-PROJ-010 and URS-PROJ-011
uncovered. This set runs IQ-001 and all six OQ protocols at one commit that
carries all of them. Its first attempt exposed F-23 and P-11; both are fixed
and shown failing first. What is still owed is in VSR-001 §14.6 and at the end
of this file.

`2026-09-23b` is the second execution on 2026-09-23. The run date is only a
folder key; the `2026-09-23` set stays in the tree, unchanged.

## What was executed

| | |
|---|---|
| Database | `c2c_oq_w3_20260922b`, the §12 database. Before the run, trunk was merged and the migration set re-applied as a deploy does it: `deploy-migrate` as owner, runtime role refreshed, 302 of 302 files, readiness contract verified (`transcripts/deploy-migrate.transcript.txt`) |
| Server | `npx tsx server/index.ts`, booted from the env files with no database variable exported: `RLS_ENFORCE=on NODE_ENV=development ALLOW_DEV_AUTH=0 SKIP_DB_STARTUP_TEST=true LAUNCH_SCOPE_ENFORCE=on PORT=5200`, plus `MFA_ENCRYPTION_KEY`. A fresh process, so a fresh sign-in rate limit |
| Runtime role | `app_service`: not superuser, no BYPASSRLS, owns no table (IQ-07) |
| AI provider | None. OQ-AUTH-16 is a deviation; nothing was simulated |
| Identities | As 2026-09-23: run identity user 17, `oq-runner@validation.local`; second signer user 11, `oq-signer@validation.local`; both org 1, both with a TOTP factor enrolled through the product's own endpoints |
| Secrets | Passwords and TOTP secrets exist only in the session scratchpad. The folder was searched for each of them, the MFA encryption key, JWTs, bearer tokens, any six-digit value in a factor field, and local paths: nothing found. Every `password`, `pin`, `totp` and `mfaToken` field in a step file reads `[REDACTED]` |
| Commit | IQ and all six OQ records at `0d7b85e50` |
| Runner | `VALIDATION_USER_EMAIL`, `VALIDATION_USER_PASSWORD`, `VALIDATION_USER_TOTP_SECRET`, `OQ_SIGNER_EMAIL`, `OQ_SIGNER_PASSWORD`, `OQ_SIGNER_TOTP_SECRET`, `OQ_AUTHOR_EMAIL`, `VALIDATION_RUN_DATE=2026-09-23b`. Commands: `node scripts/validation/run-iq.mjs`, then `node tests/validation/run-all.mjs`, each run with the server's `ALLOW_DEV_AUTH`, `RLS_ENFORCE`, `NODE_ENV` and `LAUNCH_SCOPE_ENFORCE` |

## Results

| Record | Pass | Fail | Deviation | Not executed |
|---|---|---|---|---|
| `IQ/` IQ-001 v0.4 | 12 | 0 | 3 | 0 |
| `OQ-PROJECTS/` OQ-001 v0.6 | 18 | 0 | 0 | 0 |
| `OQ-VAULT/` | 12 | 0 | 0 | 0 |
| `OQ-AUTHORING/` | 23 | 0 | 1 | 0 |
| `OQ-SUBMISSION-CENTER/` | 15 | 0 | 0 | 0 |
| `OQ-SUBMISSION-READINESS/` OQ-005 v0.4 | 9 | 0 | 1 | 0 |
| `OQ-QMS/` | 20 | 0 | 0 | 0 |

- Every OQ record names `authentication: password+totp`.
- The OQ deviations:
  - OQ-AUTH-16: no provider.
  - OQ-SRDY-05b: intake did not anchor the program to a project, `NO_CLIENT_WORKSPACE`. See VSR-001 §14.3.
- Every step is recorded with the kind its protocol gives it: 78 scripted, 9 unscripted, 7 ad-hoc, 5 prerequisite.
- The server log shows:
  - 8 password attempts and 7 code verifications, and no 429;
  - no row-level-security refusal, no 500, and no failed read;
  - only two errors, OQ-AUTH-16's 503s.
- TM-001 was regenerated from this set: 69 requirements, 67 pass, 2 partial (URS-AUTH-012, URS-SRDY-005), 0 fail, 0 uncovered.
- Transcripts are in `transcripts/`.

## The defects, each shown failing before its fix

| Folder / file | Shows |
|---|---|
| `red/F-23/first-run-OQ-SRDY-05.*` | F-23, as the first attempt at `af798a862` recorded it. OQ-SRDY-05 executed the readiness review for the program's uuid and passed. The review completed all five steps for "Project", 0 documents, and recommended "No critical issues found … All analyzers returned no critical or high findings" |
| `red/F-23/first-run-server-log.txt` | The same moment in that server's log: five reads failed on the program's uuid, then the review answered 200 |
| `red/F-23/unit-red.txt`, `unit-green.txt` | `server/services/orchestration/__tests__/cross-object-resolver.fail-closed.test.ts`. Before: 3 fail / 1 pass; the pass is the zero-rows control. After: 4 / 4 |
| `red/F-23/route-red.txt`, `route-green.txt` | `server/routes/__tests__/orchestration-project-id.test.ts`. Before: 6 fail / 2 pass. The engine was called with project 1 for program `1d3c…`, and `/execute` started a run for the uuid. After: 8 / 8 |
| `red/F-23/dbtest-red.txt`, `dbtest-green.txt` | `tests/db/cross-object-resolver.dbtest.ts`, real PostgreSQL as a freshly minted NOBYPASSRLS role with RLS enforcing. Before: 4 fail / 2 pass. After: 6 / 6. Its healthy-project cases prove every read the payload makes succeeds on the migrated schema, so failing closed does not refuse a real review |
| `OQ-005-v0.4/before-F-23-fix/`, `after-F-23-fix/` | OQ-SRDY-05 v0.4, runner at `ec76f693c`. On the pre-fix server: **fail**, "ended "completed" for "Project" with 0 document(s): a project it could not read was assessed". On the fix: pass, refused 400. Each folder's `server-code.txt` states the server's tree |
| `red/P-11/gate-before-runners-declared-kinds.txt`, `gate-after.txt`, `gate-selftest.txt` | P-11. `ci:validation-traceability`, extended to compare every runner step with its protocol. Before: 22 steps recorded with a kind their protocol does not give them. After: none. Self-test: 15 cases, every mutation caught |

## Observations filed for other rows

See VSR-001 §14.3.

1. **Submission Readiness cannot see a launch program in any organisation signup creates.** Its readiness review, Orchestration board and Inconsistency board read the integer project spine. A program reaches that spine only through an anchor intake writes when the organisation has exactly one client workspace; signup creates none. This is a decision for the system owner.
2. `GET /api/data-origins/document?documentTable=authoring_sections` answers 400 during OQ-003. This is the attribution coverage gap already recorded as open.

## Changes made to get here

| Commit | What |
|---|---|
| `d3556910a` | OQ-PROJ-17 (URS-PROJ-011): signing out ends the session |
| `af798a862` | Run date `2026-09-23b` in the three runners |
| `79217254f` | F-23. The cross-object payload fails, naming its failed reads, instead of answering them with empty results. A project the organisation does not hold is refused. One strict project-id parser serves the ten orchestration routes |
| `ec76f693c` | P-11. The runners declare each step's kind, and the traceability gate enforces it. OQ-005 v0.4 (OQ-SRDY-05 scripted, OQ-SRDY-05b new), URS-005 v0.2, RA-001 v0.4, OQ-001 v0.6 |
| `bf0731823` | OQ-SRDY-05 v0.4 shown failing on the pre-fix server and passing on the fix |
| `0d7b85e50` | Trunk merged (no migration changes). The commit this set was executed at |

## Owed, and not closable by another local run

1. Staging execution of IQ-001 and all six OQ protocols with the production
   image (`NODE_ENV=production`: the dev-login refusal on that branch, the HMAC
   seal, enforcing CSP and HSTS), a real second account created through user
   administration, and a witness.
2. A PQ-passed AI provider, for OQ-AUTH-16 / URS-AUTH-012.
3. A release signature applied by a real signer on the IND sequence.
4. The qualified contractor's review. Then signatures.
5. **The F-15 decision** (VSR-001 §12.2).
6. **The Submission Readiness anchor decision** (VSR-001 §14.3), for
   OQ-SRDY-05b / URS-SRDY-005.

## After this set: defects found and fixed later on 2026-09-23

The folders below were added to this set's `red/` after it was executed.
Each holds the evidence that a defect was reproduced before its fix and
gone after it. The fixes are executed together in
`docs/evidence/W3/2026-09-23c/`; VSR-001 §16 dispositions them.

| Folder | Shows |
|---|---|
| `red/F-15/` | The F-15 decision, option (a): `npm run up` writes `RLS_ENFORCE=on`. `tests/dev-up-env-local.test.ts` 4 fail / 1 pass before, 5 / 5 after (`7f41a3eb`) |
| `red/F-24/` | One trusted proxy hop in production. Unit 1 fail / 13 pass before, 14 / 14 after; live before and after, including the audit rows' addresses (`eefac757b`) |
| `red/F-25/` | A contradiction scan refuses a program id and an unheld project. Unit 2 fail / 1 pass before, 3 / 3 after; the first run's OQ-SRDY-06 scan of project 1 (`1b6dc0fab`) |
| `OQ-005-v0.5/` | OQ-005 v0.5 on the server before F-25 and the launch-scope change: 7 pass, 2 fail (OQ-SRDY-06, OQ-SRDY-08), 2 deviation; after: 9 pass, 0 fail, 2 deviation (`f4b88dd26`) |
| `red/F-26/` | A session alone can no longer replace an enrolled authenticator. `second-factor-binding.dbtest.ts` 7 fail / 2 pass before, 9 / 9 after (`0c912e67e`) |
| `red/F-27/` | A wrong factor at signing counts against the account, and a locked account cannot sign. `signing-lockout.dbtest.ts`: signing 4 fail / 4 pass and the dialog's checks 3 fail before, 11 / 11 after (`c3e891bba`) |
| `red/signing-ceremony/` | Every signing path on the one ceremony: routes 13 fail before, task sign-off 7 fail / 7 pass, client 5 fail / 8 pass, the QMS approval against the twin verifier 9 fail / 3 pass, the release 6 fail / 12 pass, the AnA rewrite and the document lock; each after-file green, and the IND authoring journey signing end to end (`6f79a000f`, `204c11347`, `759489424`, `ccccd4645`) |
| `red/F-28-F-29/` | An account taken out of use signs nothing and opens nothing. Unit 3 fail / 23 pass before, 26 / 26 after; `account-standing.dbtest.ts` 8 fail / 5 pass before, 13 / 13 after; `mutations.txt`, each check shown to catch its own removal (`759489424`, `171e02dfc`) |
| `OQ-001-v0.7/` | OQ-PROJ-18 on the server without F-29: 18 pass, 1 fail ("a suspended account's session read projects: 200"), with the server's own log of the suspended session's answers; on the fix: 19 / 19 (`63f579e6d`) |
| `red/F-30/` | An unreadable lockout refuses. Unit 2 fail / 1 pass before, 3 / 3 after (`bb5588d10`) |
| `red/F-31/` | The `/api/admin` org-admin gate guards its own route. OQ-PROJ-18's first execution, refused 403 before Master Administration's gate, with the server log; unit 6 fail / 4 pass before, 18 / 18 after with the security-health suite; three mutants (`916027a98`) |
| `red/F-32/` | The Doc Orchestration gate covers `/api/510k` only. Live before: Stripe's webhook, the pricing figures, `/api/v1` and `/api/cortex/health` 401; after: each reaches its handler. Unit 6 fail / 2 pass before, 8 / 8 after; one mutant (`2dd78265d`, `e482106bc`) |
| `red/F-33/` | A limiter counts a request once. Live: 15 counts per request before, 1 after; unit 2 fail / 1 pass before, 3 / 3 after; two mutants (`c16c3cb6d`) |
| `red/attribution-coverage/` | Authoring sections have attribution coverage. Unit 2 fail / 7 pass before, 9 / 9 after; live 400 before, 200 with 24 of 24 characters attributed after; one mutant (`591b48ac3`) |

Items 5 and 6 of the list above are decided: VSR-001 §16.5.
