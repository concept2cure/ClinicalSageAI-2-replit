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

## Triage

Each failure is one of three things:
- **(A)** a protocol step overtaken by a recorded product decision: the protocol is revised, with a change-impact
  row naming the decision;
- **(B)** a runner or set-up defect: fixed in the runner or the set-up;
- **(C)** a product regression: fixed under F1 by the file's holder, or here if the file is unheld.

**Every failure is A or B. No product regression was found.** Each was read from the step's own record (its
request, its answer, its screenshot) and traced to the commit that changed the behaviour.

| Step | Class | Cause | Revision |
|---|---|---|---|
| OQ-PROJ-04 | A | Intake has refused an IND with no product class since `4f53d90f3b` (2026-10-08): "State whether the product is a drug or a biologic" | OQ-001 v0.11: `productType:"drug"` |
| OQ-PROJ-11 | A | `/api/program-journey` left the launch scope on 2026-10-08 (`bcc457edb8`, CPO decision): 403 `LAUNCH_SCOPE` is the designed answer | OQ-001 v0.11: expects 403 `LAUNCH_SCOPE`; URS-PROJ-007 withdrawn from the release |
| OQ-PROJ-13, -14 | A | The steps use Risk-based monitoring as their example of a surface outside the release. RBM entered the launch scope by P-76 (`b602ecad97`, 2026-10-30) | OQ-001 v0.11: the program journey is the example; CMC, RBM and Biostatistics added to the launch surfaces checked |
| OQ-PROJ-18 | A | Since P0-4b (`f8d4047454`, 2026-10-01) a session ends durably at suspension; the step expected the old session to work again after the restore | OQ-001 v0.11: the old session reads 401 `SESSION_ENDED`; a new sign-in reads 200 |
| OQ-VAULT-09 | A | Since `2e4a9fe677` (2026-11-01) the Vault opens on its library, the filing's binder; the upload is on the "Uploads · 1" tab (screenshot) | OQ-002 v0.16: opens the Uploads tab |
| OQ-AUTH-13 (d) | B | (d) is refused at the object gate only for a reviewer who is not an organisation admin: an admin passes it (`allowed-global-admin`). This run added the signer as an admin, as OQ-001 §1 v0.9 said; OQ-003 v0.5 was executed with a reviewer | Signer changed to approver through user administration (transcript); OQ-001 v0.11 §1, OQ-003 v0.6 §2; the runner names the cause if the signer is an admin |
| OQ-AUTH-15, -16 | A | Since `8013c94575` (2026-10-30) a draft of a section with no recorded jurisdiction is refused 409 `DRAFT_REGION_REQUIRED` before the provider is asked | OQ-003 v0.6: the request names `region:"US"` |
| OQ-AUTH-18 | A | The template library left the launch scope on 2026-10-08 (`bcc457edb8`) | OQ-003 v0.6: the library 403 `LAUNCH_SCOPE`, the global reference 200 |
| OQ-SUBC-10 | B | The runner was written against the dossier at `8b192f1e75`; `117a3591ac` and `01dbd4eb38` (the same day, before it ever ran) moved `artifactReadiness` to the top and named its outcomes. A failed read is still `unavailable` with a code and a reason | OQ-004 v0.8: reads the dossier as answered |
| OQ-SUBC-13 | A | Since `b1d7d85ec8` (2026-10-08) Submission Center lists the open project's submissions; the step opened a project other than the submission's | OQ-004 v0.8: opens the submission's own project |
| OQ-SUBC-16 | B | The inline-input refusal is closed only when `config.isDevelopment` is false. The runner inferred development from dev-login, which this posture refuses on a development server | OQ-004 v0.8: `serverIsDevelopment` reads the server's report-only CSP, set by the same flag; a deviation on development, a failure elsewhere |
| OQ-SRDY-04, -05b | A | `/api/orchestration/templates` and `/execute` were claimed by the AnA command surface (left 2026-10-08, `bcc457edb8`) and the Orchestration board (kept out by P-33, 2026-10-17) | OQ-005 v0.8: both 403 `LAUNCH_SCOPE`; URS-SRDY-004/005 withdrawn from the release |
| OQ-QMS-04b | B | OQ-006 v0.8 §1 needs the signer to hold the Approver role (no QMS approver designated); it was an admin: 409 `MEMBER_NOT_QMS_APPROVER` | The signer is an approver (as OQ-AUTH-13) |
| OQ-QMS-12 | A | Quality-management plans left the launch scope on 2026-10-08 (`bcc457edb8`) | OQ-006 v0.9: create and list 403 `LAUNCH_SCOPE`; OQ-QMS-15 the gate; URS-QMS-011 withdrawn from the release |
| OQ-CMC-02 | B | It read `GET /api/cmc/specifications`, which is no route (the list is `/:projectId`); and it read with the run session, never as the viewer, and made no write | OQ-008 v0.11: the viewer's reads at the right paths, and the viewer's write |
| OQ-CMC-12 (and -20) | B | Acted with the run session (an admin) instead of `OQ_MEMBER` | OQ-008 v0.11: `requireIdentity('OQ_MEMBER')` |
| OQ-CMC-13 | B | Matched binding basis `cmc-module3-section-version`; the product writes `…-sha256` (since 2026-08-14). It also required a digest the by-target read does not return | OQ-008 v0.11: the real basis; OQ-CMC-14 recomputes the digest as the runtime role |
| OQ-CMC-22 | B | The release route requires `decision` (approved / rejected / conditional), as it has since before OQ-008 | OQ-008 v0.11: sends `decision` |
| OQ-CMC-23 | A | Since `d9060a85e2` (2026-11-08) and P-110 item 1, a specification is approved only on a method in the register, matched by name, validated or shown suitable under signature | OQ-008 v0.11: the specification names the method's title; the step validates it under signature first |
| OQ-CMC-33, -35, -40 | B | The run identity's own signatures sent no authenticator code: 401 `REAUTH_TOTP_REQUIRED` before the control under test | OQ-008 v0.11: `runReauth`, a fresh code per attempt |
| OQ-CMC-36 | A | Since `ef71545c8e` (2026-10-22) the composition boundary holds at every CMC entry point: a project with no drug substance is 409 `CMC_MODALITY_NOT_ESTABLISHED` | OQ-008 v0.11: each Q1E programme records its drug substance first |

**Deviations.**
- **OQ-CMC-17:** the fixture raises no critical contradiction, so the resolve has nothing to act on. Only `batch_rejected` is critical. A fixture for it is owed.
- **OQ-CMC-26:** no AI provider.
- **OQ-CMC-29:** the posture set no `LAUNCH_SCOPE_API_UNATTRIBUTED`, which is `report` in development. The re-execution sets `enforce`, production's default.
- **OQ-CMC-30:** a development build; see OQ-SUBC-16.
- **OQ-CMC-42:** `DATABASE_URL_RUNTIME` was not supplied; the re-execution supplies it.
- **OQ-SRDY-06b:** the contradiction scan is the Inconsistency board's, which is outside the release (VSR-001 §16.5), as on 2026-09-27.

**For the Part 11 owner (not changed here):** `GET /api/part11/signatures/by-target` does not return
`bound_payload_digest`. A reviewer can see that a row binds something, but not what, without the database.

## Re-execution at head

The revised package, executed again, with OQ-007 (Reporting & analytics) added. Record: `re-execution/`.

| | |
|---|---|
| Server code | `97a0fec5cf` on `concept2cure-v2` (one process for the IQ and every OQ execution below) |
| Installation | The same database, `c2c_oq_w3_20261110`, migrated to that commit (468 of 468 migration files). It holds the first execution's records |
| Posture | `RLS_ENFORCE=on` as `app_service`; `NODE_ENV=development` with dev-login refused; auth boundary and launch scope enforced; **`LAUNCH_SCOPE_API_UNATTRIBUTED=enforce`**, production's default, which the first execution left at development's `report`; `DATABASE_URL_RUNTIME` supplied (OQ-CMC-14, -21, -42); no AI provider; a development build (report-only CSP) |
| Identities | As the first execution, with the signer's role changed from admin to approver through user administration (OQ-001 v0.11 §1) |
| Added to the installation | `fonts-noto-core`, which the production image installs (`Dockerfile.optimized`) and the reporting PDF embeds. Without it the run export answered 503 `REPORT_PDF_FONTS_UNAVAILABLE` (OQ-007 §4.1). One more database-owner fixture: another organisation's report run (`setup/fixtures-reporting.mjs`, `transcripts/fixtures-reporting.transcript.txt`) |

### What each folder holds

| Folder | Execution |
|---|---|
| `re-execution/IQ/` | IQ-001, 2026-11-10T02:41:53Z |
| `re-execution/OQ-AUTHORING/`, `OQ-SUBMISSION-CENTER/`, `OQ-SUBMISSION-READINESS/` | The whole-package run, 02:41:53Z to 03:01:06Z (`transcripts/oq-re-execution.transcript.txt`). No step failed; not re-run |
| `re-execution/first-pass/OQ-PROJECTS/`, `OQ-VAULT/`, `OQ-QMS/`, `OQ-CMC/` | The same whole-package run, for the four protocols that had a failure. Superseded by the folders below; kept as the red record |
| `re-execution/OQ-PROJECTS/`, `OQ-VAULT/`, `OQ-QMS/` | Re-run after their revision, 03:05:58Z onward (`transcripts/oq-rerun-1-projects-vault-qms-cmc.transcript.txt`) |
| `re-execution/OQ-REPORTING/` | OQ-007's execution, 03:35:45Z (`transcripts/oq-rerun-3-reporting-cmc.transcript.txt`) |
| `re-execution/OQ-CMC/` | OQ-008's fourth run of this re-execution, 03:39Z to 03:48:04Z (the same transcript). Its second and third runs (`oq-rerun-1…`, `oq-rerun-2-cmc.transcript.txt`) each still had OQ-CMC-19 or -20 red; their transcripts are kept, their step records are not |

Each `result.json` records the checkout's HEAD when it ran: `3088335238` for the whole-package run, `644657a825` for
the re-runs. Neither changes server code. The re-runs executed the runners as this record's commit carries them,
which were uncommitted changes to `tests/validation/` at the time.

### Results

**IQ-001: 12 pass, 0 fail, 3 deviation** (IQ-04, IQ-09, IQ-12, as before).

**OQ, final: 170 pass, 0 fail, 8 deviation, 2 not executed, of 180 steps.**

| Protocol | Version | Pass | Fail | Deviation | Not executed | First execution | Whole-package run |
|---|---|---|---|---|---|---|---|
| OQ-001 Projects | 0.12 | 20 | 0 | 0 | 0 | 9 / 5 / 0 / 6 | 17 / 3 / 0 / 0 |
| OQ-002 Vault | 0.17 | 24 | 0 | 0 | 0 | 23 / 1 / 0 / 0 | 23 / 1 / 0 / 0 |
| OQ-003 Authoring | 0.6 | 25 | 0 | 1 | 0 | 19 / 4 / 0 / 3 | 25 / 0 / 1 / 0 |
| OQ-004 Submission Center | 0.8 | 16 | 0 | 1 | 0 | 14 / 3 / 0 / 0 | 16 / 0 / 1 / 0 |
| OQ-005 Submission Readiness | 0.8 | 10 | 0 | 1 | 0 | 8 / 2 / 1 / 0 | 10 / 0 / 1 / 0 |
| OQ-006 QMS | 0.10 | 22 | 0 | 0 | 0 | 7 / 2 / 0 / 13 | 21 / 1 / 0 / 0 |
| OQ-007 Reporting & analytics | 0.1 | 17 | 0 | 1 | 0 | no protocol | no protocol |
| OQ-008 CMC / Module 3 | 0.12 | 36 | 0 | 4 | 2 | 19 / 9 / 5 / 9 | 31 / 3 / 5 / 3 |
| **Total** | | **170** | **0** | **8** | **2** | 99 / 26 / 6 / 31 of 162 | 143 / 8 / 8 / 3 of 162 |

### The whole-package run's eight failures

Each was read from its step record and traced. **Every one is A or B. No product regression was found.**

| Step | Class | Cause | Revision |
|---|---|---|---|
| OQ-PROJ-06, OQ-VAULT-08 | A | The steps read `GET /api/c2c/actions/verify-chain`. No launch screen calls it and no surface claims it (`launchScopeApiVerdict`: `unmapped`). This run set `LAUNCH_SCOPE_API_UNATTRIBUTED=enforce`, production's default since the D2 API-scope measurement of 2026-09-25, and the route answered 403 `LAUNCH_SCOPE`. In production it has always been refused; the first execution's `report` posture served it | OQ-001 v0.12, OQ-002 v0.17: the chain verdict is read from the Audit trail integrity attestation (`GET /api/audit/reports/audit-trail-integrity`, `tests/validation/lib/chain-verdict.mjs`), which the release serves. Observed `intact` |
| OQ-PROJ-10 | A | Since `958c213e03` (2026-10-31) the Tasks board opens filtered to the open project. OQ-PROJ-09 created its task with no project, so the board did not list it (screenshot) | OQ-001 v0.12: the task is created under the program's tracking record, as *New task* does |
| OQ-PROJ-12 | A | The step's fixture is an IND with no product class, refused since `4f53d90f3b` (as OQ-PROJ-04). It was not executed on the first execution, so the refusal was first met here | OQ-001 v0.12: `productType:"drug"` |
| OQ-QMS-10 | A | Since decision P-51 (`cd95dc9e6c`, 2026-10-29) a retirement is signed with the meaning `retirement`, not `APPROVED`. Not executed on the first execution | OQ-006 v0.10: signs `retirement` and expects it on the stamp, the signature and the row |
| OQ-CMC-18 | B | The step looked for *approv* in the gate's sentence. The sentence names the first blocker in the gate's precedence (since 2026-09-05); `data` carries every count. The gate refused 409, 1 of 21 sections approved | OQ-008 v0.12: reads the unapproved count from `data` |
| OQ-CMC-33 | B | Took the first unapproved section, an incomplete one: the completeness refusal (409) comes before the separation of duties | OQ-008 v0.12: a complete section |
| OQ-CMC-41 | B | The close-out sent the password with no authenticator code: 401 `REAUTH_TOTP_REQUIRED` | OQ-008 v0.12: a fresh code, as OQ-CMC-33, -35, -40 |

Three more runner defects were behind deviations and steps not executed:
- **OQ-CMC-29 (B).** Its "unclaimed" probe, `/api/cmc/projects/:id/process-capability`, is claimed, so it was served,
  and the step called that `LAUNCH_SCOPE_API_UNATTRIBUTED=report`. The server ran `enforce`. Every route the core CMC
  router registers is claimed at `97a0fec5cf` (66 of 66), so the probe is now a path under `/api/cmc` that names no
  register. It answered 403 `LAUNCH_SCOPE`. A served probe is now a failure, not a deviation.
- **OQ-CMC-19 (B).** It matched a submission to its programme by `projectId` (the field is `programId`) and sent the
  sequence without its submission (400). With both fixed the placement is refused 409 by the final-export gate with no
  leaf written, which is the designed answer; see the deviations.
- **OQ-CMC-20 (B).** It named `OQ_MEMBER` as the identity without the regulatory-author role. A member holds that role
  (`ORG_ROLE_FUNCTIONAL_GRANTS`, `server/middleware/auth.ts`, since 2026-09-02), passed it, and was answered by the
  gate (409). The step is the viewer's: 403, no leaf.

### Deviations and steps not executed, final

| Step | Reason | What it needs |
|---|---|---|
| OQ-AUTH-16, OQ-CMC-26 | No AI provider is configured | A PQ-passed model |
| OQ-SUBC-16, OQ-CMC-30 | A development build allows inline run inputs by design; the refusal is a production control | A production build |
| OQ-SRDY-06b | The contradiction scan is the Inconsistency board's, which is outside the release | Nothing in this release |
| OQ-CMC-17 | The reference records raise no critical contradiction (only `batch_rejected` is critical) | A fixture |
| OQ-CMC-19 | The placement is refused 409 by the final-export gate (1 of 21 sections approved, 3 without source lineage), with no leaf. The reference records compose sections the compiler scores incomplete, which cannot be approved | A fixture whose every section can be approved |
| OQ-CMC-27, -28 (not executed) | They need the sequence OQ-CMC-19 places into | The same fixture |
| OQ-RPT-16 | The organisation is on the enterprise plan, which covers every report type | An organisation on a lower plan |

### OQ-007, Reporting & analytics

The seventh launch app had no URS and no protocol. `docs/validation/URS-008-REPORTING-ANALYTICS.md` (15 requirements,
with what already exists) and `docs/validation/OQ-007-REPORTING-ANALYTICS.md` (18 steps) were written from the code,
and `tests/validation/oq/reporting/` executes them: **17 pass, 0 fail, 1 deviation**. Observed: a run's figures are
the engine's and a request's are not stored; another organisation's run is not found; the finalize is a signature by
someone other than the requester, with password and authenticator code; the seal verifies `intact` on four checks; the
export's `X-Export-Sha256` is the SHA-256 of its bytes; a compliance report is sealed and stops verifying when one
character changes. The runner's first run failed OQ-RPT-14 on its own expectation and is not kept.

### Observations for other rows (not dispositioned here)

- **The Part 11 owner.** `GET /api/c2c/actions/verify-chain`, which `server/routes/audit-trail-ledger.routes.ts` calls
  the authoritative verdict, is not served in production. The reachable verdicts are the attestation report and the
  ledger's `meta.chain`. On this installation the attestation verifies the `audit_logs` chain walk and reports the
  `audit_events` linkage and the HMAC seals as *not verified* (no entries; no seal key), with no anchor store.
- **The CMC owner.** The final-export gate's sentence names one blocker; URS-CMC-010 says each blocker is named. The
  counts in `data` name the rest. OQ-CMC-18's and -19's rows named cases no runner version has executed (the gate with
  a contradiction open, with a stale section, all clear; a placement into another submission's sequence).
- **The security owner (D6).** `POST /api/audit/export/verify` has no role gate, compares no organisation and writes
  no audit row (URS-008 §3).
- **The installation owner (D1).** IQ-001 has no check for the report fonts. A sealed report snapshot
  (`report_snapshots`) is a row the runtime role may update; a change is detected on read, not prevented.

What stands between the package and signature is in VSR-001 §21.
