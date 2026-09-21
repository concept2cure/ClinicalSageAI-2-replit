# OQ-004 — Operational Qualification protocol: Submission Center

| Field | Value |
|---|---|
| Document ID | OQ-004 |
| Version | 0.1 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 §5; requirements URS-004 |
| Runner (the executable protocol) | `tests/validation/oq/submission-center/run.mjs` — `npm run validation:oq -- submission-center` |
| Record | `docs/evidence/W3/<date>/OQ-SUBMISSION-CENTER/OQ-004-execution-record.md`, `result.json`, `steps/*` (generated; never edited) |

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | First protocol; executed locally (see record). |

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
| OQ-SUBC-08 | URS-SUBC-007 | **credentialed** (`OQ_SIGNER_EMAIL` / `OQ_SIGNER_PASSWORD`, as OQ-006 §1; deviation *not executed — credential not supplied* when absent) | as the signer: `POST /api/c2c/actions/sign {target:"ectd-sequence:<id>", reason, payload:{intent:"freeze"}, reauth:{password}}`; read signatures by target; `POST /sequences/:id/freeze {signatureActionId}` | sign 200 with `actionId`; exactly one `electronic_signatures` row by the signer; freeze of the never-validated sequence (status `assembling` after OQ-SUBC-04) refused 409 `INVALID_STATE` by the state machine — a valid signature is necessary, not sufficient; status unchanged. A frozen outcome needs a validated, shadow-reviewed sequence and is outside this fixture |
| OQ-SUBC-09 | URS-SUBC-008 | scripted | `GET /capabilities` | every gateway `configured:false` |
| OQ-SUBC-10 | URS-SUBC-009 | scripted | `GET /api/dossier-map?projectId=<program uuid>` | 200 with per-module data |
| OQ-SUBC-11 | URS-SUBC-010 | unscripted | compile FDA initial; status | <500; observation recorded |
| OQ-SUBC-12 | URS-SUBC-012 | scripted | transmit without signature | 400 `VALIDATION` |
| OQ-SUBC-13 | URS-SUBC-011 | unscripted (browser) | Open `/concept2cure/submission-center` | Submission title visible; screenshot |
| OQ-SUBC-14 | URS-SUBC-011 | ad-hoc (browser) | Open `/concept2cure/ectd-compile`, `/concept2cure/ectd-publishing` | Render; screenshots |

## 4. Acceptance

As OQ-001 §4. OQ-SUBC-08 is executed by a tester holding a second identity's password (`OQ_SIGNER_EMAIL` / `OQ_SIGNER_PASSWORD`; the signer must not be the sequence's creator — separation of duties). Protocol text updated 2026-09-21 (WF) to the credentialed form and the honest freeze expectation; the step was exercised locally into a scratchpad evidence root (`docs/evidence/WF/2026-09-21/oq-subc-scratch.transcript.txt`: sign 200, one signature row, freeze 409 `INVALID_STATE`, status `assembling` unchanged — 15 pass) but the OQ-004 record under `docs/evidence/W3/` was **not** regenerated in that session; the record below is the baseline.

## 5. Result of the local execution (2026-09-21)

13 pass, 1 fail, 1 deviation. Fail: OQ-SUBC-10 — the dossier-map route requires an integer `projectId` (`server/routes/dossier-map.routes.ts:46-53`) while the shell supplies the program UUID; `parseInt` of a UUID beginning with digits yields an unrelated integer id (observed 500 on one run, 400 `PROJECT_REQUIRED` on another depending on the UUID's leading characters) — finding F-7. Deviation: OQ-SUBC-08 (no password credential). Passed: role gate, validation, submission + sequence + audit outcome, leaf vocabulary, state machine, governed-transition guards, re-auth refusal, honest gateway capabilities, compile answers without 500 (`OQ-SUBC-11` observation recorded), transmit refusal, surfaces render.

## Signature block

| Role | Name | Signature | Date |
|---|---|---|---|
| Executed by (automation owner) | | *unsigned* | |
| Reviewed by (qualified validation contractor) | | *unsigned* | |
| Approved by (founder / system owner) | | *unsigned* | |
