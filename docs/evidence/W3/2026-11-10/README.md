# W3: the validation package re-executed at head, for GA (2026-11-10)

**Launch row D4, workstream W3.** Session `session_01QoxbLcnW5jPvJSjjKQtvTA`. The last full execution was 2026-09-27/28
(VSR-001 §18, `docs/evidence/W3/2026-09-27/`). Since then the product has had its convergence packages (D0–D7) and
the spine packages, and CMC / Module 3's protocol (OQ-008) was written but never executed under this posture.

## What was executed

| | |
|---|---|
| Commit | `83e61866d3` on `concept2cure-v2` (the IQ at this commit; the OQ at the same code) |
| Installation | **Fresh.** `c2c_oq_w3_20261110`, provisioned from empty by `DATABASE_URL=postgresql://postgres@127.0.0.1:5432/postgres C2C_DB_NAME=c2c_oq_w3_20261110 ADMIN_EMAIL=oq-runner@validation.local PORT=5200 npm run up`: the migration set 467 of 467, runtime role `app_service` (LOGIN, NOSUPERUSER, NOBYPASSRLS), UPDATE/DELETE/TRUNCATE withheld on 35 append-only stores, EXECUTE revoked on 40 unreviewed SECURITY DEFINER functions |
| Server | `npx tsx server/index.ts` with `APP_DATABASE_URL` (app_service), `RLS_ENFORCE=on NODE_ENV=development ALLOW_DEV_AUTH=0 AUTH_BOUNDARY_MODE=enforce SKIP_DB_STARTUP_TEST=true LAUNCH_SCOPE_ENFORCE=on PORT=5200`, `APP_URL` and `ALLOWED_ORIGINS` for port 5200, `MFA_ENCRYPTION_KEY`, `LOG_LEVEL=debug` (so the emailed sign-in code an unconfigured SMTP cannot send is in the log). No AI provider. The IQ and the OQ each ran on a freshly started process |
| Identities | Seven, in organisation 2 (Concept2Cure Therapeutics), every one but the run identity added by the run identity through user administration (`POST /api/tenant-users`), each setting its own password through the activation link and enrolling its own authenticator: `setup/identities.mjs`, `transcripts/user-administration.transcript.txt`. Run identity `oq-runner` (admin), signer (admin), approver (admin, the third identity OQ-VAULT-14 needs), platform administrator (member), standing subject (member), member (no signing authority), viewer |
| Exceptions, as the database owner | The platform administrator's platform role (no product path grants the first one; VSR-001 §18's exception). A program in organisation 1 ("Default", no member) as another tenant's record. The run identity's first enrolment, cleared once after the setup script lost its secret (stated in the transcript). `setup/fixtures.mjs`, `transcripts/fixtures.transcript.txt` |
| Runner | `node scripts/validation/run-iq.mjs`, then `node tests/validation/run-all.mjs`, with `VALIDATION_RUN_DATE=2026-11-10`, every identity's `*_EMAIL`, `*_PASSWORD`, `*_TOTP_SECRET`, `OQ_RUN_PASSWORD`, `OQ_FOREIGN_PROJECT_ID`, `OQ_QMS_PROGRAM_ID`, `CHROMIUM_PATH=/opt/pw-browsers/chromium`. No credential value is in any file here (scanned) |

## Results

**IQ-001: 12 pass, 0 fail, 3 deviation** (`IQ/`), as on 2026-09-27. The deviations are the development-install ones:
IQ-04 (configuration), IQ-09 (no AI provider, reported down) and IQ-12 (report-only CSP in development).

The first IQ attempt (`first-attempt/iq-first-attempt.txt`) was 7 / 3 / 5. Each cause was found and is recorded:
- **IQ-07, IQ-08, IQ-10:** the runner read the repository's development `.env`, not the server's posture. Both now
  read one posture file.
- **IQ-15:** `tests/validation` had no `npm ci` in this container.
- **IQ-03 was the protocol's own check.** Since OPS-19 (`ebda50531c`, 2026-10-22) every runtime COPY in
  `Dockerfile.optimized` is `COPY --chown=appuser:appuser --from=builder …`, and the check matched only
  `COPY --from=builder`. It reported the migrations, `scripts/db` and assets as not copied while all three are.
  The check now allows flags before `--from` (`scripts/validation/run-iq.mjs`).

**OQ: 99 pass, 26 fail, 6 deviation, 31 not executed** (`OQ-*/`). On 2026-09-27 it was 91 / 3 / 2 / 7 of 103.

| Protocol | Pass | Fail | Deviation | Not executed |
|---|---|---|---|---|
| OQ-001 Projects | 9 | 5 | 0 | 6 |
| OQ-002 Vault | 23 | 1 | 0 | 0 |
| OQ-003 Authoring | 19 | 4 | 0 | 3 |
| OQ-004 Submission Center | 14 | 3 | 0 | 0 |
| OQ-005 Submission Readiness | 8 | 2 | 1 | 0 |
| OQ-006 QMS | 7 | 2 | 0 | 13 |
| OQ-008 CMC / Module 3 | 19 | 9 | 5 | 9 |

Most of the not-executed steps follow one failed prerequisite: OQ-PROJ-04, OQ-AUTH-13, OQ-QMS-04b and OQ-CMC-13.

## Triage (in progress)

Each failure is one of three things:
- **(A)** a protocol step overtaken by a recorded product decision: the protocol is revised, with a change-impact
  row naming the decision;
- **(B)** a runner defect: fixed in the runner;
- **(C)** a product regression: fixed under F1 by the file's holder, or here if the file is unheld.

Classified so far, each from the step's own record:

| Step | Class | Cause |
|---|---|---|
| OQ-PROJ-04 | A | Intake has refused an IND with no product class since `4f53d90f3b` (2026-10-08): "State whether the product is a drug or a biologic". The step does not state one |
| OQ-PROJ-11 | A | `/api/program-journey` left the launch scope on 2026-10-08 (`bcc457edb8`, "Launch scope keeps only what is real", as a fixture demo): 403 `LAUNCH_SCOPE` is the designed answer |
| OQ-PROJ-13, -14 | A | The steps use Risk-based monitoring as their example of a surface outside the release. RBM entered the launch scope by P-76 (2026-10-30), so another out-of-scope surface is the example |
| OQ-PROJ-18 | A | Since P0-4b (`f8d4047454`, 2026-10-01, IAM-04 b) a session ends durably at suspension. The step still expects the suspended session to work again after the restore (it reads 401 0.3 s after the restore). The restored account must sign in again |
| OQ-VAULT-09 | A (to confirm in the browser) | The Vault opens on the filing's binder (the 72 required documents in their CTD folders, S6's Veeva-style binder), and the uploaded document is under the "Uploads · 1" tab |
| OQ-CMC-12 | B | The step acts with the run identity's session. OQ-008 §1 assumes a run identity that is an ordinary member, but OQ-001 needs an admin. It must act as `OQ_MEMBER` |
| OQ-CMC-33, -35, -40 | B | The signing calls send no authenticator code (401 `REAUTH_TOTP_REQUIRED`). OQ-008 was written on 2026-10-18 and never run with enrolled authenticators |

The rest (OQ-AUTH-13/15/16/18, OQ-SUBC-10/13/16, OQ-SRDY-04/05b, OQ-QMS-04b/12, OQ-CMC-02/13/22/23/36) are being read
the same way. VSR-001 §21 carries the dispositions as they are reached.
