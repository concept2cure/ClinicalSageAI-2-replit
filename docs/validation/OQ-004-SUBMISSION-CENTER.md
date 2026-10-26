# OQ-004 — Operational Qualification protocol: Submission Center

| Field | Value |
|---|---|
| Document ID | OQ-004 |
| Version | 0.7 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 §5; requirements URS-004 |
| Runner (the executable protocol) | `tests/validation/oq/submission-center/run.mjs` — `npm run validation:oq -- submission-center` |
| Record | `docs/evidence/W3/<date>/OQ-SUBMISSION-CENTER/OQ-004-execution-record.md`, `result.json`, `steps/*` (generated; never edited) |

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | First protocol; executed locally (see record). |
| 0.2 | 2026-09-22 | W3 | §5 records the 2026-09-22 execution under the production posture (RLS enforcing, non-owner runtime role, credentialed second signer); earlier results are kept below it as superseded. No step changed. |
| 0.3 | 2026-09-23 | W3 | OQ-SUBC-08 presents the signer's authenticator code and first shows that a password-only signature from a signer with a second factor enrolled is refused with no row written. The route accepted that signature until 828faf809 (VSR-001 §13, F-18); v0.2 could not have seen it, because no signer had a second factor. |
| 0.4 | 2026-09-27 | W3 | Two steps follow product changes that the 2026-09-27 first attempt showed failing (VSR-001 §18). OQ-SUBC-04 places a document ingested into the submission's own program and adds the refusal of another project's document (409 `CROSS_PROJECT`, PF-11, 2026-09-26). Since LX-22, OQ-SUBC-03 gives the submission a program of its own, so the step's former document, OQ-SUBC-00's, was another project's and was refused. OQ-SUBC-08's signature states its meaning, `approval`, as the Submission Center's modal proposes for a freeze: without one, a sign is refused 400 `SIGNATURE_MEANING_REQUIRED` (P1-21, 2026-09-25) before the second-factor check the step exists to show. |
| 0.5 | 2026-10-15 | D2 | OQ-SUBC-15 is new (URS-SUBC-013, decision P-34): a Shadow Review waiver is offered only after a provider outage and recorded only by signature. On an installation with no AI provider the run fails as `no_provider_configured`, which is not an outage, so the step shows the waiver not offered, the presence gate blocking, and an unsigned waive refused with nothing recorded. The positive path cannot be produced on demand on an installation; it is proven over the real act in `server/services/ectd/__tests__/shadow-review-waiver.pglite.integration.test.ts`. **Not yet executed at this version.** |
| 0.6 | 2026-10-26 | D2 | OQ-SUBC-16 is new (URS-SUBC-014, CLAUDE.md Rule 2): a submission run refuses inline clinical and nonclinical figures and a `ctdProgramId` outside development. A development server allows both by design (the fixture door), so there the step records a deviation, never a pass; the refusal is a production control and is observed under the W3 posture, as OQ-CMC-30's is. **Not yet executed at this version.** |
| 0.7 | 2026-10-26 | D2 A2.7 | OQ-SUBC-10 now reads the canonical UUID dossier endpoint and cites revised URS-SUBC-009a. It checks independent artifact and tracking states rather than a retired standalone map route. Earlier OQ-SUBC-10 passes remain historical; this revised formal protocol is not yet executed. Focused SQL/HTTP/browser evidence is in D2 A2.7. |

## 1. Method

As OQ-001 §1. The governed sign step needs the tester's password; the runner never guesses credentials and records the positive case as a deviation when none is available.

## 2. Pre-conditions

IQ-001 executed; OQ-SUBC-00 creates a program and ingests one PDF to serve as a leaf source.

## 3. Steps

| Step | URS | Kind | Action | Expected result |
|---|---|---|---|---|
| OQ-SUBC-00 | — | prerequisite | Program + vault document | created |
| OQ-SUBC-01 | URS-SUBC-001 | scripted | `GET /api/submissions` anonymous | 401/403 |
| OQ-SUBC-02 | URS-SUBC-002 | scripted | Create with region `mars` | 400 `VALIDATION` |
| OQ-SUBC-03 | URS-SUBC-002, 003 | scripted | Create IND/biotech/fda submission; sequence `0000` original; list | 201/201; audit outcome reported; listed as draft |
| OQ-SUBC-04 | URS-SUBC-004 | scripted | Ingest a cover letter into the submission's own program; place it as leaf `m1.2` → `vault_documents`; then OQ-SUBC-00's document, another program's; then `not_a_table` | 200 and listed; another project's document refused 409 `CROSS_PROJECT`; 400 with the allowed list |
| OQ-SUBC-05 | URS-SUBC-005 | scripted | draft→assembling; assembling→dispatched | 200; refused; status `assembling` |
| OQ-SUBC-06 | URS-SUBC-006 | scripted | generic transition to `frozen`; freeze without signature | `GOVERNED_REQUIRED`; 400 |
| OQ-SUBC-07 | URS-SUBC-007 | scripted | `POST /api/c2c/actions/sign` without `reauth` | 4xx; no `actionId` |
| OQ-SUBC-08 | URS-SUBC-007 | **credentialed** (`OQ_SIGNER_EMAIL` / `OQ_SIGNER_PASSWORD`, and `OQ_SIGNER_TOTP_SECRET` for a signer with a second factor enrolled, as OQ-006 §1; deviation *not executed — credential not supplied* when absent) | as the signer: when a second factor is enrolled, first sign with `reauth:{password}` only (v0.3); then `POST /api/c2c/actions/sign {target:"ectd-sequence:<id>", reason, payload:{intent:"freeze", meaning:"approval"}, reauth:{password, totp}}`; read signatures by target; `POST /sequences/:id/freeze {signatureActionId}` | with a second factor enrolled the password-only signature is refused 401 `REAUTH_TOTP_REQUIRED` and writes no row; sign 200 with `actionId`; exactly one `electronic_signatures` row by the signer, `second_factor_verified` true when a code was presented; freeze of the never-validated sequence (status `assembling` after OQ-SUBC-04) refused 409 `INVALID_STATE` by the state machine — a valid signature is necessary, not sufficient; status unchanged. A frozen outcome needs a validated, shadow-reviewed sequence and is outside this fixture |
| OQ-SUBC-09 | URS-SUBC-008 | scripted | `GET /capabilities` | every gateway `configured:false` |
| OQ-SUBC-10 | URS-SUBC-009a | scripted | `GET /api/c2c/projects/<program uuid>/dossier` | 200 for an accepted project, with independent governed figure, artifact section rollup and tracked module states; no substituted zero on failed supporting reads |
| OQ-SUBC-11 | URS-SUBC-010 | unscripted | compile FDA initial; status | <500; observation recorded |
| OQ-SUBC-12 | URS-SUBC-012 | scripted | transmit without signature | 400 `VALIDATION` |
| OQ-SUBC-13 | URS-SUBC-011 | unscripted (browser) | Open `/concept2cure/submission-center` | Submission title visible; screenshot |
| OQ-SUBC-14 | URS-SUBC-011 | ad-hoc (browser) | Open `/concept2cure/ectd-compile`, `/concept2cure/ectd-publishing` | Render; screenshots |
| OQ-SUBC-15 | URS-SUBC-013 | scripted | `POST /sequences/:id/shadow-review`; `GET …/shadow-review`; `GET …/dispatch-readiness`; `POST …/shadow-review/waive {signatureActionId:"oq-not-a-signature", failedRunId:<newest run>}`; `GET …/shadow-review` (v0.5) | `shadowReviewWaiver.state` `none`. No completed review: `shadowReviewWaivable` present, `eligible` true only when the newest run failed as `provider_unavailable` or `provider_overloaded` (no provider configured: `no_provider_configured`, eligible false, with the reason), and the `shadowPresence` gate blocks with no note. A completed review: nothing offered, the gate clears with no note. Either way the waive is refused 403 `GOVERNED_REQUIRED` or 409 `SHADOW_WAIVER_NOT_ELIGIBLE`, and no run reads `waived` |
| OQ-SUBC-16 | URS-SUBC-014 | scripted | `POST /api/submission-orchestrator/runs` with a non-empty `csrInputs`; then with a `projectId` and a `ctdProgramId` (v0.6) | 400 `INLINE_RUN_INPUTS_REFUSED` with `field` `csrInputs`, naming `/runs/for-program`, and the refused figure is not in the response; then 400 `CTD_PROGRAM_INPUTS_REFUSED`. A development server answers otherwise by design: recorded as a deviation |

## 4. Acceptance

As OQ-001 §4. OQ-SUBC-08 is executed by a tester holding a second identity's password and, when that identity has a second factor enrolled, its authenticator (`OQ_SIGNER_EMAIL` / `OQ_SIGNER_PASSWORD` / `OQ_SIGNER_TOTP_SECRET`). The signer must not be the sequence's creator (separation of duties). Protocol text updated 2026-09-21 (WF) to the credentialed form and the honest freeze expectation; the step was exercised locally into a scratchpad evidence root (`docs/evidence/WF/2026-09-21/oq-subc-scratch.transcript.txt`: sign 200, one signature row, freeze 409 `INVALID_STATE`, status `assembling` unchanged — 15 pass) but the OQ-004 record under `docs/evidence/W3/` was **not** regenerated in that session; the record below is the baseline.

## 5. Result of the local execution (2026-09-23b, one commit carrying every fix — VSR-001 §14)

**15 pass, 0 fail, 0 deviation, 0 not-executed** (record `docs/evidence/W3/2026-09-23b/OQ-SUBMISSION-CENTER/`, executed 2026-09-23T05:20:12.334Z UTC at `0d7b85e50`). Same installation, posture and identities as the 2026-09-23 execution below: database `c2c_oq_w3_20260922b` with the migration set re-applied by `deploy-migrate` first, `RLS_ENFORCE=on`, runtime role `app_service`, dev-login refused, and every session opened by password and authenticator code. Each step is recorded with the kind this protocol gives it (OQ-001 §1, v0.6). OQ-SUBC-08: the password-only signature was refused 401 `REAUTH_TOTP_REQUIRED` with no row written; the signature with password and authenticator code wrote one `electronic_signatures` row.

### 5.1 Result of the local execution (2026-09-23, production posture with production authentication — VSR-001 §13; superseded by the 2026-09-23b execution)

**15 pass, 0 fail, 0 deviation, 0 not-executed** (record `docs/evidence/W3/2026-09-23/OQ-SUBMISSION-CENTER/`, executed 2026-09-23T02:50:50Z UTC at `0e2b3a971`). Same installation and RLS posture as the 2026-09-22 execution below: database `c2c_oq_w3_20260922b`, `RLS_ENFORCE=on`, runtime role `app_service`, no AI provider configured. It adds the authentication production requires. The server refuses dev-login (`ALLOW_DEV_AUTH=0`; IQ-10 pass, `docs/evidence/W3/2026-09-23/IQ/`). Every session was opened by a password sign-in that completed the TOTP challenge of the identity's enrolled factor, once per identity per run (OQ-001 §1; VSR-001 §13). Run identity: user 17 `oq-runner@validation.local`. Second signer: user 11 `oq-signer@validation.local`. Both enrolled their authenticator through the product's own enrolment endpoints. OQ-SUBC-08 (v0.3): signer 11 has a TOTP factor enrolled. Its password-only signature is refused 401 `REAUTH_TOTP_REQUIRED`, and no row is written. Signed with password and code, it writes one `electronic_signatures` row: id 11, `governed-action`, `second_factor_verified` true. Before `828faf809` the same password-only request signed, and wrote a row with `second_factor_verified` false (F-18; `docs/evidence/W3/2026-09-23/red/F-18/`).

### 5.2 Result of the local execution (2026-09-22, production posture — VSR-001 §12; superseded by the 2026-09-23 execution)

**15 pass, 0 fail, 0 deviation, 0 not-executed** (record `docs/evidence/W3/2026-09-22/OQ-SUBMISSION-CENTER/`, executed 2026-09-22T22:36:28Z UTC at `e2d910d6f`). Installation: a database provisioned from empty by `npm run up`; the server booted from the checkout with `RLS_ENFORCE=on` as runtime role `app_service` (not superuser, no BYPASSRLS, owns no table — IQ-07 and IQ-08 pass, `docs/evidence/W3/2026-09-22/IQ/`); no AI provider configured. This is the first execution with RLS enforcing and as a role that owns no table. The executions filed before it record `RLS_ENFORCE=off` (IQ-DEV-003), under which the tenant-isolation policies are inert, and runtime role `c2c` on `clinicalsage`, which owns 61 RLS-enabled tables without FORCE — `vault.documents` among them — whose policies therefore never applied to it (VSR-001 §12). OQ-SUBC-08 executed with the credentialed second signer — user 11, provisioned into this database only through `scripts/seed-admin.mjs` as in `docs/evidence/WF/2026-09-21/`, password never in the tree (`transcripts/provision-signer.transcript.txt`): one `electronic_signatures` row, and the freeze from `assembling` refused 409. OQ-SUBC-10: 200 `PROGRAM_UNANCHORED` (F-7 closed, VSR-001 §10.3).

### 5.3 Result of the first local execution (2026-09-21, W3a — superseded; later executions: VSR-001 §8.2, §10.2)

13 pass, 1 fail, 1 deviation. Fail: OQ-SUBC-10 — the dossier-map route requires an integer `projectId` (`server/routes/dossier-map.routes.ts:46-53`) while the shell supplies the program UUID; `parseInt` of a UUID beginning with digits yields an unrelated integer id (observed 500 on one run, 400 `PROJECT_REQUIRED` on another depending on the UUID's leading characters) — finding F-7. Deviation: OQ-SUBC-08 (no password credential). Passed: role gate, validation, submission + sequence + audit outcome, leaf vocabulary, state machine, governed-transition guards, re-auth refusal, honest gateway capabilities, compile answers without 500 (`OQ-SUBC-11` observation recorded), transmit refusal, surfaces render.

## Signature block

| Role | Name | Signature | Date |
|---|---|---|---|
| Executed by (automation owner) | | *unsigned* | |
| Reviewed by (qualified validation contractor) | | *unsigned* | |
| Approved by (founder / system owner) | | *unsigned* | |
