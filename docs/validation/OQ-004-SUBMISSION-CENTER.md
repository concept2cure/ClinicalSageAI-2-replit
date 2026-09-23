# OQ-004 — Operational Qualification protocol: Submission Center

| Field | Value |
|---|---|
| Document ID | OQ-004 |
| Version | 0.3 |
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
| OQ-SUBC-04 | URS-SUBC-004 | scripted | Place leaf `m1.2` → `vault_documents`; then `not_a_table` | 200 and listed; 400 with the allowed list |
| OQ-SUBC-05 | URS-SUBC-005 | scripted | draft→assembling; assembling→dispatched | 200; refused; status `assembling` |
| OQ-SUBC-06 | URS-SUBC-006 | scripted | generic transition to `frozen`; freeze without signature | `GOVERNED_REQUIRED`; 400 |
| OQ-SUBC-07 | URS-SUBC-007 | scripted | `POST /api/c2c/actions/sign` without `reauth` | 4xx; no `actionId` |
| OQ-SUBC-08 | URS-SUBC-007 | **credentialed** (`OQ_SIGNER_EMAIL` / `OQ_SIGNER_PASSWORD`, and `OQ_SIGNER_TOTP_SECRET` for a signer with a second factor enrolled, as OQ-006 §1; deviation *not executed — credential not supplied* when absent) | as the signer: when a second factor is enrolled, first sign with `reauth:{password}` only (v0.3); then `POST /api/c2c/actions/sign {target:"ectd-sequence:<id>", reason, payload:{intent:"freeze"}, reauth:{password, totp}}`; read signatures by target; `POST /sequences/:id/freeze {signatureActionId}` | with a second factor enrolled the password-only signature is refused 401 `REAUTH_TOTP_REQUIRED` and writes no row; sign 200 with `actionId`; exactly one `electronic_signatures` row by the signer, `second_factor_verified` true when a code was presented; freeze of the never-validated sequence (status `assembling` after OQ-SUBC-04) refused 409 `INVALID_STATE` by the state machine — a valid signature is necessary, not sufficient; status unchanged. A frozen outcome needs a validated, shadow-reviewed sequence and is outside this fixture |
| OQ-SUBC-09 | URS-SUBC-008 | scripted | `GET /capabilities` | every gateway `configured:false` |
| OQ-SUBC-10 | URS-SUBC-009 | scripted | `GET /api/dossier-map?projectId=<program uuid>` | 200 with per-module data |
| OQ-SUBC-11 | URS-SUBC-010 | unscripted | compile FDA initial; status | <500; observation recorded |
| OQ-SUBC-12 | URS-SUBC-012 | scripted | transmit without signature | 400 `VALIDATION` |
| OQ-SUBC-13 | URS-SUBC-011 | unscripted (browser) | Open `/concept2cure/submission-center` | Submission title visible; screenshot |
| OQ-SUBC-14 | URS-SUBC-011 | ad-hoc (browser) | Open `/concept2cure/ectd-compile`, `/concept2cure/ectd-publishing` | Render; screenshots |

## 4. Acceptance

As OQ-001 §4. OQ-SUBC-08 is executed by a tester holding a second identity's password (`OQ_SIGNER_EMAIL` / `OQ_SIGNER_PASSWORD`; the signer must not be the sequence's creator — separation of duties). Protocol text updated 2026-09-21 (WF) to the credentialed form and the honest freeze expectation; the step was exercised locally into a scratchpad evidence root (`docs/evidence/WF/2026-09-21/oq-subc-scratch.transcript.txt`: sign 200, one signature row, freeze 409 `INVALID_STATE`, status `assembling` unchanged — 15 pass) but the OQ-004 record under `docs/evidence/W3/` was **not** regenerated in that session; the record below is the baseline.

## 5. Result of the local execution (2026-09-22, production posture — VSR-001 §12)

**15 pass, 0 fail, 0 deviation, 0 not-executed** (record `docs/evidence/W3/2026-09-22/OQ-SUBMISSION-CENTER/`, executed 2026-09-22T22:36:28Z UTC at `e2d910d6f`). Installation: a database provisioned from empty by `npm run up`; the server booted from the checkout with `RLS_ENFORCE=on` as runtime role `app_service` (not superuser, no BYPASSRLS, owns no table — IQ-07 and IQ-08 pass, `docs/evidence/W3/2026-09-22/IQ/`); no AI provider configured. This is the first execution with RLS enforcing and as a role that owns no table. The executions filed before it record `RLS_ENFORCE=off` (IQ-DEV-003), under which the tenant-isolation policies are inert, and runtime role `c2c` on `clinicalsage`, which owns 61 RLS-enabled tables without FORCE — `vault.documents` among them — whose policies therefore never applied to it (VSR-001 §12). OQ-SUBC-08 executed with the credentialed second signer — user 11, provisioned into this database only through `scripts/seed-admin.mjs` as in `docs/evidence/WF/2026-09-21/`, password never in the tree (`transcripts/provision-signer.transcript.txt`): one `electronic_signatures` row, and the freeze from `assembling` refused 409. OQ-SUBC-10: 200 `PROGRAM_UNANCHORED` (F-7 closed, VSR-001 §10.3).

### 5.1 Result of the first local execution (2026-09-21, W3a — superseded; later executions: VSR-001 §8.2, §10.2)

13 pass, 1 fail, 1 deviation. Fail: OQ-SUBC-10 — the dossier-map route requires an integer `projectId` (`server/routes/dossier-map.routes.ts:46-53`) while the shell supplies the program UUID; `parseInt` of a UUID beginning with digits yields an unrelated integer id (observed 500 on one run, 400 `PROJECT_REQUIRED` on another depending on the UUID's leading characters) — finding F-7. Deviation: OQ-SUBC-08 (no password credential). Passed: role gate, validation, submission + sequence + audit outcome, leaf vocabulary, state machine, governed-transition guards, re-auth refusal, honest gateway capabilities, compile answers without 500 (`OQ-SUBC-11` observation recorded), transmit refusal, surfaces render.

## Signature block

| Role | Name | Signature | Date |
|---|---|---|---|
| Executed by (automation owner) | | *unsigned* | |
| Reviewed by (qualified validation contractor) | | *unsigned* | |
| Approved by (founder / system owner) | | *unsigned* | |
