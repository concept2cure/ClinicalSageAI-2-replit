# OQ-005 — Operational Qualification protocol: Submission Readiness

| Field | Value |
|---|---|
| Document ID | OQ-005 |
| Version | 0.1 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 §5; requirements URS-005 |
| Runner (the executable protocol) | `tests/validation/oq/submission-readiness/run.mjs` — `npm run validation:oq -- submission-readiness` |
| Record | `docs/evidence/W3/<date>/OQ-SUBMISSION-READINESS/OQ-005-execution-record.md`, `result.json`, `steps/*` (generated; never edited) |

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | First protocol; executed locally (see record). |

## 1. Method

As OQ-001 §1. OQ-SRDY-00 builds the fixture through the public API: program, vault PDF, submission, sequence `0000`, one leaf `m5.3.5`.

## 2. Steps

| Step | URS | Kind | Action | Expected result |
|---|---|---|---|---|
| OQ-SRDY-00 | — | prerequisite | Build the fixture | all created |
| OQ-SRDY-01 | URS-SRDY-001 | scripted | dispatch-readiness anonymous | 401/403 |
| OQ-SRDY-02 | URS-SRDY-002 | scripted | `GET /sequences/:id/dispatch-readiness` | numeric counts; `gate.cleared=false` with blockers for a fresh sequence |
| OQ-SRDY-03 | URS-SRDY-003 | scripted | `POST /:id/dispatch-qc` with client zeros | 200; server-side assessment used; no model in the decision |
| OQ-SRDY-04 | URS-SRDY-004 | scripted | templates; execute without projectId | template with 5 steps; 400 |
| OQ-SRDY-05 | URS-SRDY-005 | unscripted | execute readiness review; read execution | 2xx; status readable |
| OQ-SRDY-06 | URS-SRDY-006 | scripted | contradiction scan | 200 |
| OQ-SRDY-07 | URS-SRDY-007 | scripted (browser) | Open `/concept2cure/dispatch-readiness` with the program selected | sequence `0000` and its gate visible |
| OQ-SRDY-08 | URS-SRDY-008 | ad-hoc (browser) | Open `/concept2cure/orchestration`, `/concept2cure/inconsistency` | Render; screenshots |

## 3. Result of the local execution (2026-09-21)

6 pass, 1 fail, 2 deviation. Fail: OQ-SRDY-07 — the Dispatch Readiness surface showed "No submission sequence to gate yet" although the open program's sequence exists: `DispatchReadiness.tsx:79-84` gates the **first** submission in the organisation (`subs[0]`), not the open program's — finding F-8. Deviations: OQ-SRDY-03 — dispatch QC answered 502 `INVALID_AI_RESPONSE`: the QC path calls the model, so with no provider it cannot run, and a QC verdict that depends on a model is itself an observation under CLAUDE.md Rule 2 (finding F-9); OQ-SRDY-06 (IQ-DEV-001 on the assumption/contradiction tables). Passed: access gate; the deterministic dispatch gate correctly refused a never-validated, never-shadow-reviewed, unsigned sequence with three named blockers; template registry and input validation; readiness review executed and readable; orchestration and inconsistency surfaces render.

## Signature block

| Role | Name | Signature | Date |
|---|---|---|---|
| Executed by (automation owner) | | *unsigned* | |
| Reviewed by (qualified validation contractor) | | *unsigned* | |
| Approved by (founder / system owner) | | *unsigned* | |
