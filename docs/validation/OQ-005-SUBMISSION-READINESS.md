# OQ-005 — Operational Qualification protocol: Submission Readiness

| Field | Value |
|---|---|
| Document ID | OQ-005 |
| Version | 0.2 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 §5; requirements URS-005 |
| Runner (the executable protocol) | `tests/validation/oq/submission-readiness/run.mjs` — `npm run validation:oq -- submission-readiness` |
| Record | `docs/evidence/W3/<date>/OQ-SUBMISSION-READINESS/OQ-005-execution-record.md`, `result.json`, `steps/*` (generated; never edited) |

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | First protocol; executed locally (see record). |
| 0.2 | 2026-09-21 | WF | OQ-SRDY-03 rewritten for the deterministic dispatch-QC contract (VSR-001 F-9, fixed in the product 2026-09-21): the verdict must equal the `GET …/dispatch-readiness` gate; without a provider the step passes and the narrative is recorded as not executed. A gateway error on the route is now a fail, not a deviation. Re-executed locally (§3). |

## 1. Method

As OQ-001 §1. OQ-SRDY-00 builds the fixture through the public API: program, vault PDF, submission, sequence `0000`, one leaf `m5.3.5`.

## 2. Steps

| Step | URS | Kind | Action | Expected result |
|---|---|---|---|---|
| OQ-SRDY-00 | — | prerequisite | Build the fixture | all created |
| OQ-SRDY-01 | URS-SRDY-001 | scripted | dispatch-readiness anonymous | 401/403 |
| OQ-SRDY-02 | URS-SRDY-002 | scripted | `GET /sequences/:id/dispatch-readiness` | numeric counts; `gate.cleared=false` with blockers for a fresh sequence |
| OQ-SRDY-03 | URS-SRDY-003 | scripted | `POST /:id/dispatch-qc` with `sequenceId` and client zeros; `GET /sequences/:id/dispatch-readiness` | 200 `{clearedToDispatch, blockers, warnings, checklist, verdictSource:"assess-dispatch-readiness", narrative, narrativeUnavailable}`; `clearedToDispatch` and `blockers` equal the GET gate (client zeros do not clear it); with no provider `narrative` is `null` and `narrativeUnavailable.code` is `PROVIDER_UNAVAILABLE` — verdict **pass**, narrative recorded as *not executed — no provider*; with a provider the narrative is advisory prose and the verdict is unchanged |
| OQ-SRDY-04 | URS-SRDY-004 | scripted | templates; execute without projectId | template with 5 steps; 400 |
| OQ-SRDY-05 | URS-SRDY-005 | unscripted | execute readiness review; read execution | 2xx; status readable |
| OQ-SRDY-06 | URS-SRDY-006 | scripted | contradiction scan | 200 |
| OQ-SRDY-07 | URS-SRDY-007 | scripted (browser) | Open `/concept2cure/dispatch-readiness` with the program selected | sequence `0000` and its gate visible |
| OQ-SRDY-08 | URS-SRDY-008 | ad-hoc (browser) | Open `/concept2cure/orchestration`, `/concept2cure/inconsistency` | Render; screenshots |

## 3. Result of the local execution (2026-09-21, version 0.2 — worker WF)

**9 pass, 0 fail, 0 deviation, 0 not-executed** (record regenerated under `docs/evidence/W3/2026-09-20/OQ-SUBMISSION-READINESS/`). OQ-SRDY-03: HTTP 200, `clearedToDispatch=false` equal to `gate.cleared`, the three blockers byte-identical to the GET gate, `verdictSource=assess-dispatch-readiness`, 7-item checklist, `narrative: null` with `narrativeUnavailable.code PROVIDER_UNAVAILABLE` — narrative not executed (no provider), verdict qualified. OQ-SRDY-07 now passes (F-8 fixed in the product since the WD re-execution: the surface shows the open program's sequence `0000`). OQ-SRDY-06 passes (IQ-DEV-001 closed).

### 3.1 Result of the local execution (2026-09-21, version 0.1 — W3a, superseded)

6 pass, 1 fail, 2 deviation. Fail: OQ-SRDY-07 — the Dispatch Readiness surface showed "No submission sequence to gate yet" although the open program's sequence exists: `DispatchReadiness.tsx:79-84` gates the **first** submission in the organisation (`subs[0]`), not the open program's — finding F-8. Deviations: OQ-SRDY-03 — dispatch QC answered 502 `INVALID_AI_RESPONSE`: the QC path calls the model, so with no provider it cannot run, and a QC verdict that depends on a model is itself an observation under CLAUDE.md Rule 2 (finding F-9); OQ-SRDY-06 (IQ-DEV-001 on the assumption/contradiction tables). Passed: access gate; the deterministic dispatch gate correctly refused a never-validated, never-shadow-reviewed, unsigned sequence with three named blockers; template registry and input validation; readiness review executed and readable; orchestration and inconsistency surfaces render.

## Signature block

| Role | Name | Signature | Date |
|---|---|---|---|
| Executed by (automation owner) | | *unsigned* | |
| Reviewed by (qualified validation contractor) | | *unsigned* | |
| Approved by (founder / system owner) | | *unsigned* | |
