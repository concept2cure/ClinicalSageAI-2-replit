# OQ-005 — Operational Qualification protocol: Submission Readiness

| Field | Value |
|---|---|
| Document ID | OQ-005 |
| Version | 0.5 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 §5; requirements URS-005 |
| Runner (the executable protocol) | `tests/validation/oq/submission-readiness/run.mjs` — `npm run validation:oq -- submission-readiness` |
| Record | `docs/evidence/W3/<date>/OQ-SUBMISSION-READINESS/OQ-005-execution-record.md`, `result.json`, `steps/*` (generated; never edited) |

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | First protocol; executed locally (see record). |
| 0.2 | 2026-09-21 | WF | OQ-SRDY-03 rewritten for the deterministic dispatch-QC contract (VSR-001 F-9, fixed in the product 2026-09-21): the verdict must equal the `GET …/dispatch-readiness` gate; without a provider the step passes and the narrative is recorded as not executed. A gateway error on the route is now a fail, not a deviation. Re-executed locally (§3). |
| 0.3 | 2026-09-22 | W3 | §3 records the 2026-09-22 execution under the production posture (RLS enforcing, non-owner runtime role, credentialed second signer); earlier results are kept below it as superseded. No step changed. |
| 0.4 | 2026-09-23 | W3 | OQ-SRDY-05 is scripted and can fail. It had executed the readiness review for the program and passed on any 2xx, and this protocol called it unscripted while the record called it a scripted pass. The review completed for a program none of whose data it could read, with "No critical issues found" (VSR-001 F-23). The step now requires a program id the engine cannot read to be refused or to fail with the reason. OQ-SRDY-05b is new: the review of the program's anchored project must name the program; without an anchor it is a deviation naming the reason intake gave. On the code before F-23's fix OQ-SRDY-05 fails; after it, it passes (`docs/evidence/W3/2026-09-23b/OQ-005-v0.4/`). |
| 0.5 | 2026-09-23 | W3 | OQ-SRDY-06 requires the scan of the program id (400) and of a project the organisation does not hold (404) to be refused. It had scanned project 1 and passed on 200 with zero findings, in an organisation that holds no project 1 (VSR-001 F-25). OQ-SRDY-06b is new: the scan of the program's anchored project must run; without an anchor it is a deviation. OQ-SRDY-08 is scripted: both boards must be locked by launch scope and their deep links must show the launch-scope gate (launch scope decided, VSR-001 §16). |

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
| OQ-SRDY-05 | URS-SRDY-005 | scripted | `POST /api/orchestration/execute {templateId:"submission_readiness_review", projectId:<the program id>}`. The review reads `projects.id`; a program id is a uuid (v0.4) | refused with a 4xx and no run, or a run that ends failed and says why; never a completed review of a project the engine did not read |
| OQ-SRDY-05b | URS-SRDY-005 | scripted | When intake anchored the program (`meta.projectAnchorId`): execute the review for the anchored project; `GET /executions/:id` (v0.4) | the run completes, its `inspect_project_state` step names the program, and the execution is readable. No anchor: deviation naming the reason intake gave |
| OQ-SRDY-06 | URS-SRDY-006 | scripted | `POST /api/governed-intelligence/contradictions/scan/<the program id>`; the same for a project id the organisation does not hold (v0.5) | 400 and 404 respectively; neither 200 with findings |
| OQ-SRDY-06b | URS-SRDY-006 | scripted | When intake anchored the program: scan the anchored project (v0.5) | 200 with a deterministic result. No anchor: deviation naming the reason intake gave |
| OQ-SRDY-07 | URS-SRDY-007 | scripted (browser) | Open `/concept2cure/dispatch-readiness` with the program selected | sequence `0000` and its gate visible |
| OQ-SRDY-08 | URS-SRDY-008 | scripted (browser) | `GET /api/module-subscriptions/navigation`; open `/concept2cure/orchestration`, `/concept2cure/inconsistency` (v0.5) | both not entitled, source `launch-scope`; `dispatch-readiness` entitled; each deep link shows "not in this release" |

## 3. Result of the local execution (2026-09-23b, one commit carrying every fix — VSR-001 §14)

**9 pass, 0 fail, 1 deviation, 0 not-executed** (record `docs/evidence/W3/2026-09-23b/OQ-SUBMISSION-READINESS/`, executed 2026-09-23T05:20:41.105Z UTC at `0d7b85e50`). Same installation, posture and identities as the 2026-09-23 execution below: database `c2c_oq_w3_20260922b` with the migration set re-applied by `deploy-migrate` first, `RLS_ENFORCE=on`, runtime role `app_service`, dev-login refused, and every session opened by password and authenticator code. Each step is recorded with the kind this protocol gives it (OQ-001 §1, v0.6). Protocol v0.4, executed on its own first (`docs/evidence/W3/2026-09-23b/OQ-005-v0.4/`): on the code before F-23's fix OQ-SRDY-05 fails, the review having completed for "Project" with 0 documents; on the fix it passes. In this execution, OQ-SRDY-05: the review of the program id was refused, HTTP 400 "projectId must be a positive integer", with no run. OQ-SRDY-05b is the one deviation: intake did not anchor the program to a project (`NO_CLIENT_WORKSPACE`), so the review has no project to assess for it (URS-SRDY-005 partial; URS-005 §3). OQ-SRDY-03: the verdict equals the gate; the narrative was not executed, no provider.

### 3.1 Result of the local execution (2026-09-23, production posture with production authentication — VSR-001 §13; superseded by the 2026-09-23b execution)

**9 pass, 0 fail, 0 deviation, 0 not-executed** (record `docs/evidence/W3/2026-09-23/OQ-SUBMISSION-READINESS/`, executed 2026-09-23T02:51:18Z UTC at `0e2b3a971`). Same installation and RLS posture as the 2026-09-22 execution below: database `c2c_oq_w3_20260922b`, `RLS_ENFORCE=on`, runtime role `app_service`, no AI provider configured. It adds the authentication production requires. The server refuses dev-login (`ALLOW_DEV_AUTH=0`; IQ-10 pass, `docs/evidence/W3/2026-09-23/IQ/`). Every session was opened by a password sign-in that completed the TOTP challenge of the identity's enrolled factor, once per identity per run (OQ-001 §1; VSR-001 §13). Run identity: user 17 `oq-runner@validation.local`. Second signer: user 11 `oq-signer@validation.local`. Both enrolled their authenticator through the product's own enrolment endpoints. No step of this protocol signs. The verdicts are the same as the 2026-09-22 execution's.

### 3.2 Result of the local execution (2026-09-22, production posture — VSR-001 §12; superseded by the 2026-09-23 execution)

**9 pass, 0 fail, 0 deviation, 0 not-executed** (record `docs/evidence/W3/2026-09-22/OQ-SUBMISSION-READINESS/`, executed 2026-09-22T22:36:55Z UTC at `e2d910d6f`). Installation: a database provisioned from empty by `npm run up`; the server booted from the checkout with `RLS_ENFORCE=on` as runtime role `app_service` (not superuser, no BYPASSRLS, owns no table — IQ-07 and IQ-08 pass, `docs/evidence/W3/2026-09-22/IQ/`); no AI provider configured. This is the first execution with RLS enforcing and as a role that owns no table. The executions filed before it record `RLS_ENFORCE=off` (IQ-DEV-003), under which the tenant-isolation policies are inert, and runtime role `c2c` on `clinicalsage`, which owns 61 RLS-enabled tables without FORCE — `vault.documents` among them — whose policies therefore never applied to it (VSR-001 §12). OQ-SRDY-03: `clearedToDispatch=false` equal to the gate, two blockers identical to the gate, `verdictSource=assess-dispatch-readiness`, seven checklist items; the narrative is not executed (no provider). OQ-SRDY-07: sequence 0000 visible.

### 3.3 Result of the local execution (2026-09-21, version 0.2 — worker WF, superseded)

**9 pass, 0 fail, 0 deviation, 0 not-executed** (record regenerated under `docs/evidence/W3/2026-09-20/OQ-SUBMISSION-READINESS/`). OQ-SRDY-03: HTTP 200, `clearedToDispatch=false` equal to `gate.cleared`, the three blockers byte-identical to the GET gate, `verdictSource=assess-dispatch-readiness`, 7-item checklist, `narrative: null` with `narrativeUnavailable.code PROVIDER_UNAVAILABLE` — narrative not executed (no provider), verdict qualified. OQ-SRDY-07 now passes (F-8 fixed in the product since the WD re-execution: the surface shows the open program's sequence `0000`). OQ-SRDY-06 passes (IQ-DEV-001 closed).

### 3.4 Result of the local execution (2026-09-21, version 0.1 — W3a, superseded)

6 pass, 1 fail, 2 deviation. Fail: OQ-SRDY-07 — the Dispatch Readiness surface showed "No submission sequence to gate yet" although the open program's sequence exists: `DispatchReadiness.tsx:79-84` gates the **first** submission in the organisation (`subs[0]`), not the open program's — finding F-8. Deviations: OQ-SRDY-03 — dispatch QC answered 502 `INVALID_AI_RESPONSE`: the QC path calls the model, so with no provider it cannot run, and a QC verdict that depends on a model is itself an observation under CLAUDE.md Rule 2 (finding F-9); OQ-SRDY-06 (IQ-DEV-001 on the assumption/contradiction tables). Passed: access gate; the deterministic dispatch gate correctly refused a never-validated, never-shadow-reviewed, unsigned sequence with three named blockers; template registry and input validation; readiness review executed and readable; orchestration and inconsistency surfaces render.

## Signature block

| Role | Name | Signature | Date |
|---|---|---|---|
| Executed by (automation owner) | | *unsigned* | |
| Reviewed by (qualified validation contractor) | | *unsigned* | |
| Approved by (founder / system owner) | | *unsigned* | |
