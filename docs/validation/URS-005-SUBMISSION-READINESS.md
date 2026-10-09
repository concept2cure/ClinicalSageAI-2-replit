# URS-005 — User Requirements Specification: Submission Readiness

| Field | Value |
|---|---|
| Document ID | URS-005 |
| Version | 0.4 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 |
| Verified by | OQ-005 (`tests/validation/oq/submission-readiness/run.mjs`) |

**App:** Submission Readiness

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | Drafted from `server/services/ectd/assess-dispatch-readiness.ts` (via `server/routes/submissions.ts:1590`), `server/routes/submissions.ts:1040-1066` (dispatch QC), `server/routes/orchestration.ts`, `server/services/orchestration/templates/submission-readiness-review.ts`, `server/routes/assumption-decision-contradiction.ts` and the `DispatchReadiness`, `Orchestration`, `Inconsistency` surfaces. |
| 0.2 | 2026-09-23 | W3 | URS-SRDY-005 requires the review to state what it read, and is high risk. The review had completed, for a program none of whose data it could read, with "No critical issues found", and the requirement asked only that the execution be readable (VSR-001 F-23). |
| 0.3 | 2026-09-23 | W3 | Launch scope decided (VSR-001 §16): the app is the dispatch gate; the Orchestration and Inconsistency boards are not in this release, because both read the integer project spine that no program in an organisation created by signup reaches. URS-SRDY-008 now requires them to be locked by launch scope. URS-SRDY-006 requires a scan never to report a project it cannot read as clean, and is high risk (F-25). |
| 0.4 | 2026-09-25 | WO-16C / D2 | URS-SRDY-008: "not in this release" holds at the API. The locked boards' routes answer 403 `LAUNCH_SCOPE`, not only their navigation entries and deep links (`docs/evidence/D2-API-SCOPE/2026-09-25/`). With launch scope enforced, URS-SRDY-006's positive half is executable only on an installation with launch scope off (§3). |

## 1. Intended use

Submission Readiness tells the regulatory user whether a sequence is cleared to dispatch and why not: a deterministic gate over validation findings, shadow-review criticals and the release signature. Two engines behind it are reachable through AnA rather than a board of their own in this release: an orchestrated readiness review and a contradiction scan across assumptions and decisions. Both read the integer project spine (§3). Per CLAUDE.md Rule 2 every verdict here must come from a deterministic engine — the model may narrate, never decide.

## 2. Requirements

| URS id | Requirement | Part 11 | Risk | Source |
|---|---|---|---|---|
| URS-SRDY-001 | Readiness endpoints require an authenticated regulatory author; anonymous requests are refused. | §11.10(d) | high | `server/routes/submissions.ts:1590-1602` |
| URS-SRDY-002 | The dispatch-readiness assessment of a sequence is computed server-side from stored facts and returns numeric `validationErrors` and `unacknowledgedShadowCriticals`, the release-signature verdict and a `gate.cleared` boolean with the list of blockers; a never-validated, never-shadow-reviewed, unsigned sequence is not cleared. | none | high | `server/routes/submissions.ts:1590-1602`, `server/services/ectd/assess-dispatch-readiness.ts` |
| URS-SRDY-003 | Dispatch QC uses the server-side assessment for the sequence (client-supplied counts do not override it) and returns a deterministic QC record without a model in the decision path. | none | high | `server/routes/submissions.ts:1040-1066` |
| URS-SRDY-004 | The `submission_readiness_review` orchestration template is registered with its five orchestrator-logic steps; execution validates that a project id is supplied. | none | medium | `server/routes/orchestration.ts:99-141`, `server/services/orchestration/templates/submission-readiness-review.ts` |
| URS-SRDY-005 | Executing the readiness review starts an execution whose status and steps are readable, and the review states what it read: it names the project it assessed, and a project it cannot read is refused or fails with the reason, never assessed as clear. | none | high | `server/routes/orchestration.ts`, `server/services/orchestration/cross-object-resolver.ts`, `server/services/orchestration/workflow-orchestrator.ts` |
| URS-SRDY-006 | A contradiction scan of a project the organisation holds returns a deterministic result (possibly zero findings) from the assumption and decision registries. A scan of a project the organisation does not hold, or of an id that is not a project id, is refused and never answered as clean. | none | high | `server/routes/assumption-decision-contradiction.ts`, `server/services/contradiction-engine-service.ts` |
| URS-SRDY-007 | The Dispatch Readiness surface shows the open program's newest sequence and its gate verdict — the sequence the user is working on, not another submission's. | none | high | `client/src/concept2cure/v2/surfaces/DispatchReadiness.tsx:79-117` |
| URS-SRDY-008 | The Orchestration and Inconsistency boards are not in this release: with launch scope enforced, the navigation payload marks both not entitled with source `launch-scope` while the dispatch gate's surface is entitled, a deep link to either renders the launch-scope gate instead of the board, and their APIs (the contradiction scan, the execution history) answer 403 `LAUNCH_SCOPE`. | §11.10(d) | medium | `shared/constants/launch-scope.ts`, `server/services/entitlements/navigation-entitlements.ts`, `client/src/concept2cure/v2/LaunchScopeGate.tsx`, `server/services/entitlements/launch-scope-api.ts`, `server/middleware/moduleEntitlementGate.ts` |

## 3. Assumptions and constraints

- The contradiction scan reads `assumption_records` / `contradiction_links` / `decision_records`; on an installation where the runtime role lacks the grant (IQ-DEV-001) URS-SRDY-006 cannot be verified.
- With launch scope enforced (production), the contradiction scan's API is locked with its board (URS-SRDY-008), so the positive half of URS-SRDY-006 is executable only on an installation with launch scope off. Its refusals stay verifiable in either posture: a locked scan is refused, which is never an answer of clean.
- The contradiction scan, like the readiness review, reads the integer project spine, so the positive halves of URS-SRDY-005 and URS-SRDY-006 can be executed only for a program intake anchored to a project (OQ-SRDY-05b, OQ-SRDY-06b); the refusals can always be (OQ-SRDY-05, OQ-SRDY-06).
- The readiness review reads the integer project spine (`projects.id`). A program reaches it only through the anchor intake writes (`server/services/c2c/program-project-anchor.ts`), which intake writes only when the organisation has exactly one client workspace; signup creates none. In such an organisation the positive half of URS-SRDY-005 cannot be verified (OQ-SRDY-05b is a deviation), and the negative half can (OQ-SRDY-05).

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| System owner (founder) | | *unsigned* | |
| Qualified validation contractor | | *unsigned* | |
