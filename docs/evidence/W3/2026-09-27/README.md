# W3: the validation package at head, its identities created the way a customer creates them (2026-09-27)

**Row moved:** D4 (validation package). **Workstream:** W3.

**State:** D4 is **not green**. This set executes IQ-001 and all six OQ
protocols at one commit, across the 1,550 commits since the 2026-09-23c set,
which include the P0/P1 security tranches.

It also does the local half of D4's owed "real second account". Every identity
except the run identity was created through the product's user
administration: the run identity added each colleague, and each set its own
password through the activation link and enrolled its own authenticator. The
first attempt found two defects:
- F-41, which that way of creating an account exposes;
- F-42, which two accounts sharing a display name expose.

It also found three places where the package had not kept up with correct
product changes. What is still owed is at the end of this file and in
VSR-001 §18.

## What was executed

| | |
|---|---|
| Installation | **Fresh.** `c2c_oq_w3_20260927`, provisioned from empty by `C2C_DB_NAME=c2c_oq_w3_20260927 npm run up` (`transcripts/provision.transcript.txt`, redacted). The migration set was then re-applied at the run commit as a deploy does it: 316 of 316 files, readiness contract 8 of 8 (`transcripts/deploy-migrate.transcript.txt`) |
| Server | `npx tsx server/index.ts`, booted from the env files `npm run up` wrote, with no database variable exported: `RLS_ENFORCE=on NODE_ENV=development ALLOW_DEV_AUTH=0 AUTH_BOUNDARY_MODE=enforce SKIP_DB_STARTUP_TEST=true LAUNCH_SCOPE_ENFORCE=on PORT=5200`, plus `MFA_ENCRYPTION_KEY`. The IQ runs on one fresh process and the OQ on another. **New since 2026-09-23c:** the auth boundary enforces, as production does by default. In its non-production warn mode an idle session is told it has ended, not that it was left idle (`second-attempt/README.md`) |
| Runtime role | `app_service`: not superuser, no BYPASSRLS, owns no table (IQ-07) |
| AI provider | None. OQ-AUTH-16 is a deviation; nothing was simulated |
| Identities | All in organisation 1 (Concept2Cure Therapeutics); detail below and in OQ-001 v0.9 §1:<ul><li>User 1, `oq-runner@validation.local`: the run identity, an organisation admin, seeded by `npm run up`.</li><li>User 3, `oq-signer@validation.local`: the second signer, added as an admin.</li><li>User 4, `oq-platform@validation.local`: OQ-PROJ-18's platform administrator, added as a member; its `platform_role_grants` row was written as the database owner, because no product path grants the first platform role (`transcripts/platform-role-grant.transcript.txt`).</li><li>User 5, `oq-standing@validation.local`: the account OQ-PROJ-18 suspends and restores, added as a member.</li><li>User 2 is the demo administrator the development posture seeds at boot (`server/db/bootstrap/seed-default-org.ts`; production seeds it only when `SEED_DEMO_USER` is explicitly on). No step uses it, and its address is redacted from these files. Its display name, "JM Smith", is the one `npm run up` gives user 1, which is how F-42 was found.</li></ul> |
| User administration | `transcripts/user-administration.transcript.txt`:<ul><li>The run identity added each colleague with `POST /api/tenant-users`: 201, a new account, seat ok. With no mail server, the product handed the admin the one activation link (`delivery: link`, valid 21 days).</li><li>Each colleague set its own password through the link: `POST /api/auth/reset-password`, 200.</li><li>A second use of the same link was refused 400 `AUTH_006` twice. The third reuse met the password-reset limiter (429) before the token was read, so it shows nothing about reuse.</li><li>Each colleague then enrolled its authenticator through the production sign-in: the password, the emailed code from the development mail sink, then `/mfa/setup` and `/mfa/enable` (`transcripts/authenticator-enrolment.transcript.txt`).</li><li>The ledger shows each addition, chained ("User Invited", `transcripts/ledger-after-user-administration.transcript.txt`). It did not show the colleagues setting their passwords. That was F-41.</li></ul> |
| Secrets | Passwords, TOTP secrets and the MFA encryption key exist only in the session scratchpad. The folder was searched for each of them, and for JWTs, bearer tokens, any six-digit value in a factor field, and local paths: nothing found (the scan covers every file in this folder, its first and second attempts included). Every `password`, `pin`, `totp` and `mfaToken` field in a step file reads `[REDACTED]` |
| Commit | IQ and all six OQ records at `89ee3a81` |
| Runner | `VALIDATION_USER_EMAIL`, `VALIDATION_USER_PASSWORD`, `VALIDATION_USER_TOTP_SECRET`, `OQ_SIGNER_EMAIL`, `OQ_SIGNER_PASSWORD`, `OQ_SIGNER_TOTP_SECRET`, `OQ_AUTHOR_EMAIL`, `OQ_PLATFORM_ADMIN_*`, `OQ_STANDING_*`, `VALIDATION_RUN_DATE=2026-09-27`. Commands: `node scripts/validation/run-iq.mjs`, then `node tests/validation/run-all.mjs` |

## Results

All records are at `89ee3a81` on a clean tree, written by the runners and never
edited.

| Record | Pass | Fail | Deviation | Not executed |
|---|---|---|---|---|
| IQ-001 (`IQ/`) | 12 | 0 | 3 | 0 |
| OQ-001 Projects (`OQ-PROJECTS/`) | 20 | 0 | 0 | 0 |
| OQ-002 Vault (`OQ-VAULT/`) | 12 | 0 | 0 | 0 |
| OQ-003 Authoring (`OQ-AUTHORING/`) | 23 | 0 | 1 | 0 |
| OQ-004 Submission Center (`OQ-SUBMISSION-CENTER/`) | 15 | 0 | 0 | 0 |
| OQ-005 Submission Readiness (`OQ-SUBMISSION-READINESS/`) | 10 | 0 | 1 | 0 |
| OQ-006 QMS controlled documents (`OQ-QMS/`) | 21 | 0 | 0 | 0 |
| **OQ total** | **101** | **0** | **2** | **0** of 103 |

**IQ deviations:** the same three as 2026-09-23c:
- IQ-DEV-002: local environment variables are not all set;
- IQ-DEV-004: no AI provider;
- IQ-DEV-005: CSP is report-only in a development build.

**OQ deviations:**
- OQ-AUTH-16: no AI provider.
- OQ-SRDY-06b: with launch scope enforced, the contradiction scan belongs to
  a board outside this release (VSR-001 §16.5).

**TM-001**, regenerated from these records: 71 requirements, 69 pass, 2
partial, 0 fail, 0 open, 0 uncovered. The partials are URS-AUTH-012 (no
provider) and URS-SRDY-006 (its positive half needs launch scope off).

What the records show that no earlier execution could:
- **OQ-PROJ-18.** The refusal of the suspended colleague is on the
  organisation's ledger, chained (F-41). The colleague was added through user
  administration and has no default organisation.
- **OQ-PROJ-06b.** The entry for the program's creation names the run
  identity's account (`actorRef` `user:1`), not only "JM Smith", a name two
  accounts carry (F-42).
- **OQ-PROJ-19.** An idle session is refused `SESSION_IDLE`, with the boundary
  enforcing as in production.
- **OQ-SUBC-08 and OQ-QMS-05.** They sign with the second signer created
  through user administration, using its own password and authenticator.
- **The sign-in limiter.** It refused the signer's first sign-in once, the
  eleventh from this IP in fifteen minutes. The harness waited the 653 s the
  server named and signed in once more (`transcripts/oq.transcript.txt`).

## The two attempts before this one, and what changed because of them

`first-attempt/README.md` holds the four failures of the execution at
`d224ecff`, head before anything was changed, with their causes:
- OQ-PROJ-18: F-41, a product defect, fixed in `f339a445` and `81eb7491`
  (`red/F-41/`).
- OQ-PROJ-19: the sign-in limiter. The harness now waits out its window.
- OQ-SUBC-04 and OQ-SUBC-08: the protocol had not kept up with PF-11 and
  P1-21. OQ-004 is now v0.4.

F-42 was found by reading the first attempt's ledger, not by a failing step.
OQ-PROJ-06b now checks it, and the check fails on the first attempt's recorded
response (`red/F-42/`).

`second-attempt/README.md` holds the execution at `af305e8a`, after F-41, F-42
and the protocol changes. The first attempt's four failures were gone, and
three others appeared, none a defect of the product as production runs it:
- OQ-SUBC-08 and OQ-QMS-05: the second signer's session, signed in when the
  run started, had ended idle before its first use. The harness now signs it
  in when first needed, and treats an ended session as none.
- OQ-PROJ-19: the local server ran its auth boundary in the non-production
  warn mode, where an idle session is told `SESSION_ENDED`. The server now
  enforces, as production does.

All of it is in `89ee3a81`.

## Observations filed for other rows

VSR-001 §18.

## Owed, and not closable by another local run

1. Staging execution of IQ-001 and all six OQ protocols with the production
   image (`NODE_ENV=production`: the dev-login refusal on that branch, the HMAC
   seal, enforcing CSP and HSTS). Its second account must be created through
   user administration as here, but with a real mail server, and there must
   be a witness.
2. A PQ-passed AI provider, for OQ-AUTH-16 / URS-AUTH-012.
3. A release signature applied by a real signer on the IND sequence.
4. The qualified contractor's review. Then signatures.
