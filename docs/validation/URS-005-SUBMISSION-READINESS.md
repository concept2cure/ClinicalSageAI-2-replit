# URS-005 — User Requirements Specification: Submission Readiness

| Field | Value |
|---|---|
| Document ID | URS-005 |
| Version | 0.1 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 |
| Verified by | OQ-005 (`tests/validation/oq/submission-readiness/run.mjs`) |

**App:** Submission Readiness

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | Drafted from `server/services/ectd/assess-dispatch-readiness.ts` (via `server/routes/submissions.ts:1590`), `server/routes/submissions.ts:1040-1066` (dispatch QC), `server/routes/orchestration.ts`, `server/services/orchestration/templates/submission-readiness-review.ts`, `server/routes/assumption-decision-contradiction.ts` and the `DispatchReadiness`, `Orchestration`, `Inconsistency` surfaces. |

## 1. Intended use

Submission Readiness tells the regulatory user whether a sequence is cleared to dispatch and why not: a deterministic gate over validation findings, shadow-review criticals and the release signature; an orchestrated readiness review over the program's documents; and a contradiction scan across assumptions and decisions. Per CLAUDE.md Rule 2 every verdict here must come from a deterministic engine — the model may narrate, never decide.

## 2. Requirements

| URS id | Requirement | Part 11 | Risk | Source |
|---|---|---|---|---|
| URS-SRDY-001 | Readiness endpoints require an authenticated regulatory author; anonymous requests are refused. | §11.10(d) | high | `server/routes/submissions.ts:1590-1602` |
| URS-SRDY-002 | The dispatch-readiness assessment of a sequence is computed server-side from stored facts and returns numeric `validationErrors` and `unacknowledgedShadowCriticals`, the release-signature verdict and a `gate.cleared` boolean with the list of blockers; a never-validated, never-shadow-reviewed, unsigned sequence is not cleared. | none | high | `server/routes/submissions.ts:1590-1602`, `server/services/ectd/assess-dispatch-readiness.ts` |
| URS-SRDY-003 | Dispatch QC uses the server-side assessment for the sequence (client-supplied counts do not override it) and returns a deterministic QC record without a model in the decision path. | none | high | `server/routes/submissions.ts:1040-1066` |
| URS-SRDY-004 | The `submission_readiness_review` orchestration template is registered with its five orchestrator-logic steps; execution validates that a project id is supplied. | none | medium | `server/routes/orchestration.ts:99-141`, `server/services/orchestration/templates/submission-readiness-review.ts` |
| URS-SRDY-005 | Executing the readiness review for a program starts an execution whose status and steps are readable. | none | medium | `server/routes/orchestration.ts:99, 159` |
| URS-SRDY-006 | A contradiction scan for a project returns a deterministic result (possibly zero findings) from the assumption and decision registries. | none | medium | `server/routes/assumption-decision-contradiction.ts:346` |
| URS-SRDY-007 | The Dispatch Readiness surface shows the open program's newest sequence and its gate verdict — the sequence the user is working on, not another submission's. | none | high | `client/src/concept2cure/v2/surfaces/DispatchReadiness.tsx:79-117` |
| URS-SRDY-008 | The Orchestration and Inconsistency surfaces render; an unavailable store is shown as an error or empty state, never as data. | none | low | `client/src/concept2cure/v2/surfaces/Orchestration.tsx`, `Inconsistency.tsx` |

## 3. Assumptions and constraints

- The contradiction scan reads `assumption_records` / `contradiction_links` / `decision_records`; on an installation where the runtime role lacks the grant (IQ-DEV-001) URS-SRDY-006 cannot be verified.

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| System owner (founder) | | *unsigned* | |
| Qualified validation contractor | | *unsigned* | |
