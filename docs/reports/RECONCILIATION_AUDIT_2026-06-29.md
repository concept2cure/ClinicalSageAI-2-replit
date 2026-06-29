# Reconciliation Audit — 4 Pre-Existing Services

**Date:** 2026-06-29
**Scope:** End-to-end audit of `m2-summary-builders`, `submission-package-orchestrator`, `ectd-validator-hardening`, `csr-tabulation-builders` + the route that wires them. Methodology: read each file end-to-end, trace imports one hop, grep for callers, compare against this session's Phase 1/2/3 commits.

**Why this matters:** the 2026-04-27 verification and the earlier audit declared Plans 3/4/5 missing. They are not. ~2,650 LOC of working pipeline already exists. The work remaining is integration + scoping + one consolidation pass, not greenfield. This document corrects the GA path estimate from ~12 weeks down to **~13 working days (2.5 calendar weeks)** with one engineer.

---

## A. What each service actually does

### 1. `server/services/m2-summary-builders.ts` (606 LOC)
Pure transforms — no I/O. Exports `buildM23QualityOverallSummary`, `buildM24NonclinicalOverview`, `buildM25ClinicalOverview` (bonus over my plan), `buildM27ClinicalSummary`. Consumes `ComposedSection[]` from M3, typed nonclinical study lists, and CSR summary input. Produces M2 narrative + gap arrays.
- **No tenant scoping.** Zero `organizationId`/`projectId` references.
- **No AI.** Deterministic template-based narrative.
- **Tests:** happy paths in `server/services/__tests__/m2-summary-builders.test.ts` + `server/__tests__/services/submission-orchestrator.test.ts`.

### 2. `server/services/submission-package-orchestrator.ts` (574 LOC)
11-step pipeline coordinator: M3 → M2 → CSR → assemble → validate. Exports `runOrchestrator`, `getRun`, `getRunAudit`, `markDownstreamStale`, `regenerateAffected`.
- **No tenant scoping.** `OrchestratorInputs` has no `organizationId`; `submission_orchestrator_runs` table has no `organization_id` column. **P0 GxP blocker.**
- **Raw SQL.** `pool.query` against `submission_orchestrator_runs` / `submission_orchestrator_steps` — not ported to Drizzle.
- **Region drift.** Migration `0018` CHECK accepts 4 regions; route Zod accepts 13. `KR`/`CN`/`UK` etc. silently fail at persist time (caught by try/catch, warned only — run still proceeds).
- **`package.validate` step is a deferred stub.** Returns `{ deferred: true, outputRef: 'package.validate:deferred-to-route-handler' }`. Validation only happens via the standalone `/validate/hardened` route.
- **Persistence failures are swallowed** with `console.warn` — non-fatal.
- **Tests:** end-to-end with DB mocked. `regenerateAffected` is **not** tested.

### 3. `server/services/ectd/ectd-validator-hardening.ts` (587 LOC)
Wraps `validatePackage` with package-level gateway checks. Exports `validateEctdPackageHardened` (composite entry), `validateDtdConformance`, `enforceMd5Checksums`, `auditStudyIdTagging`, `detectSequenceGaps` (async, DB-backed), `flattenFindings`.
- **No tenant scoping.** Sequence query filters only by `application_number`. A colliding application string across orgs leaks sequence history.
- **DB errors swallowed as warnings.** `detectSequenceGaps` returns `gatewayReady: true` even when Postgres is down. Green submission on outage.
- **Raw SQL.** Two tables: `ectd_compilations`, `ectd_submissions`.
- **Imports `ectd/ectd-regional-rules.ts`** (640 LOC, 13 regions) — different file from my Phase 1 `regional-rules.ts`.
- **Tests:** DTD + MD5 + study-id covered. **`detectSequenceGaps` (DB-backed) is NOT tested. `validateEctdPackageHardened` composite is NOT tested. `flattenFindings` is NOT tested.**

### 4. `server/services/csr-tabulation-builders.ts` (533 LOC)
ICH E3 §10–§12 data tables from a typed `StudyData` extract (CDISC-shaped). Pure transform. Exports `buildCSRTables` + 10 sub-builders + `renderTablesAsMarkdown`.
- **No tenant scoping** (pure function — scoping is the caller's responsibility).
- **No AI.**
- **Tests:** disposition / demographics / efficacy / AE happy paths. Untested: `buildExposureTable`, `buildAETopPT` threshold edges, `buildLabShiftsTable`, `renderTablesAsMarkdown`.

---

## B. Dependency graph

```
[express] register-document-routes.ts:105
            │  mounts /api/submission-orchestrator
            ▼
routes/submission-orchestrator.ts (356 LOC)
            ├──▶ submission-package-orchestrator.ts
            ├──▶ m2-summary-builders.ts            (standalone /m2/* routes)
            ├──▶ csr-tabulation-builders.ts        (POST /csr/tabulate)
            └──▶ ectd/ectd-validator-hardening.ts  (POST /validate/hardened)

submission-package-orchestrator.ts (574 LOC)
            ├──▶ db.js (pool, raw SQL UPSERT)
            ├──▶ module3-extensions.ts  → module3Composer.ts (deterministic only)
            ├──▶ m2-summary-builders.ts
            ├──▶ csr-tabulation-builders.ts
            └──▶ TYPE-ONLY: ectd-validator-hardening.ts
                NB: package.validate step is a deferred stub.

ectd-validator-hardening.ts (587 LOC)
            ├──▶ db.js (raw SQL UNION on ectd_compilations, ectd_submissions)
            ├──▶ ectd/ectd4-validator.js
            └──▶ ectd/ectd-regional-rules.js   ← NOT regional-rules.ts (the one I shipped)

csr-tabulation-builders.ts (533 LOC)  — TYPE-ONLY deps
m2-summary-builders.ts (606 LOC)       — TYPE-ONLY deps
```

**Critical absence:** orchestrator does NOT import `csr-builder.ts`, `csr-job-runner.ts`, or `module3-narrative-builder.ts`. The AI path is invisible to the pipeline.

---

## C. Overlap matrix vs this session's commits

| Session capability | Pre-existing twin | Verdict |
|---|---|---|
| Phase 1 `CHECKSUM_MISMATCH` | `MD5_MISMATCH` in `enforceMd5Checksums` | **Duplicated.** Different finding codes for same failure. Hardening also has `MD5_INVALID_FORMAT` and `MD5_WRONG_TYPE` that Phase 1 lacks. UI sees both if both run. |
| Phase 1 `MISSING_STUDY_ID` (m5.3.* only) | `STF_MISSING_STUDY_ID` (m4.2.* + m5.3.*) | **Different codes, partitioned scope.** Hardening is broader (warning); Phase 1 is stricter for m5.3 subset (error). Not strictly redundant. |
| Phase 1 `detectSequenceGaps(string[])` sync | `detectSequenceGaps(appNum, newSeq)` async DB-backed | **Same export name, different sig, different behavior.** Phase 1 takes a caller-supplied array; hardening queries DB. Hardening supersedes when data is in DB. TS collision risk if both imported. |
| Phase 1 `INVALID_LIFECYCLE_TARGET` | — | **Net-new.** No analog in hardening. |
| Phase 1 `regional-rules.ts` (87 LOC, FDA/EMA/PMDA) | `ectd-regional-rules.ts` (640 LOC, 13 regions, used by hardening) | **Hardening is superset.** Phase 1 only checks "is there a leaf under m1/<region>/". Hardening validates app-number format, gateway size limits, ASCII filename, STF per leaf, J-NDA M1.13 — for US/EU/JP/CA/CN/KR. **Phase 1's regional file is functionally obviated.** |
| Phase 3 `csr/csr-job-runner.ts` (async, state-persisted, AI narrative) | Orchestrator's `csr.tabulate` step → `buildCSRTables` (sync table builder) | **Different layers — not competing.** Tables = ms, sync. Narrative = minutes, async. Complementary. Today: orchestrator does neither narrative drafting nor enqueue. |
| Phase 2 `module3-narrative-builder.ts` (AI-grounded refinement, hallucination guard) | Orchestrator's `m3.compose` via `composeFullModule3` | **ORPHAN — not consumed.** `buildModule3WithNarrative` has zero callers outside its own test. Orchestrator + `/m2/qos` use the deterministic composer only. The AI refinement, prompt-injection scan, and hallucination guard are all unused in production paths. |

---

## D. Integration gaps

1. **`runOrchestrator` does not know about `csr-job-runner`.** No narrative-drafting step in the pipeline. To wire: add `csr.draft-narrative` step between `csr.tabulate` and `m2.7.clinical`; new step status `awaiting-async`; resume-on-completion path (webhook or poll).
2. **`runOrchestrator` does not call `module3-narrative-builder`.** Add `m3.refine` step between `m3.compose` and `m2.3.qos`; thread tenant context through `OrchestratorInputs`.
3. **`runOrchestrator` does not call the hardened validator.** Step `package.validate` is a deferred stub. Two validation surfaces with no orchestrator-side decision over which runs when.
4. **Duplicate code-path risk.** If a downstream service runs Phase 1 `validatePackage` AND then the route runs hardening, MD5 violations produce two finding codes per file. No de-duplication.
5. **Zero tenant scoping in any of the 4 services.** `OrchestratorInputs` lacks `organizationId`. Persistence is org-blind. **P0 blocker** for 21 CFR Part 11.
6. **Region schema drift.** Route Zod accepts 13; migration 0018 CHECK accepts 4. `KR`/`CN`/`UK`/etc. silently fail at persist time.
7. **No orphan routes.** Both `submission-orchestrator.ts` and `csr-jobs.ts` (Phase 3b) are mounted.

---

## E. Test coverage gaps (untested critical paths)

- **`detectSequenceGaps` (hardening, async DB-backed)** — the rule the FDA ESG gateway enforces hardest. Untested. Postgres outage produces green `gatewayReady: true`.
- `validateEctdPackageHardened` composite entry.
- `flattenFindings`.
- `regenerateAffected` (orchestrator change-impact).
- Region-CHECK violation behavior.
- `buildExposureTable`, `buildAETopPT` thresholds, `buildLabShiftsTable`, `renderTablesAsMarkdown` (CSR tables).
- `buildM27ClinicalSummary` integrated-AE aggregation.

---

## F. Recommended reconciliation moves (priority order)

**1 — Tenant-scope the orchestrator (P0).**
Why: persisting multi-tenant data with no `organization_id` propagates the bug to any new wiring on top. Do this *first*.
Blast radius: `ALTER TABLE submission_orchestrator_runs ADD COLUMN organization_id`, `OrchestratorInputs` interface, route Zod, unit fixtures (~6 files).
Execution: single PR.

**2 — Rename Phase 1 `detectSequenceGaps` to avoid collision with hardening.**
Why: two same-name exports with different signatures is a foot-gun. Hardening's DB-backed version is canonical.
Blast radius: rename in `ectd4-validator.ts`, update caller in `validatePackage` `options.priorSequenceNumbers` path, update tests.
Execution: surgical edit.

**3 — Make `validateEctdPackageHardened` the canonical FDA-ESG entry; keep Phase 1 MD5 + study-id as leaf-creation pre-checks.**
Why: hardening has DTD conformance I deferred, broader STF coverage (M4 + M5), and finer MD5 finding codes.
Blast radius: wire orchestrator's `package.validate` step to actually call `validateEctdPackageHardened`. Requires `package.assemble` to emit a leaf manifest.
Execution: single PR. Depends on Move 1.

**4 — Replace Phase 1 `regional-rules.ts` (87 LOC) with `ectd-regional-rules.ts` (640 LOC) at the `ectd4-validator.ts` call site.**
Why: smaller file is strict subset. Two definitions for same agency invites drift.
Blast radius: `ectd4-validator.ts:23` import, the `region: 'FDA'|'EMA'|'PMDA'` literal becomes the `RegulatoryRegion` union. Delete `regional-rules.ts` after.
Execution: surgical edit.

**5 — Wire `module3-narrative-builder` into orchestrator as opt-in `m3.refine` step.**
Why: Phase 2 work is dead code in production. Hallucination guard + Part-11 prompt-version capture only have value if invoked.
Blast radius: add `m3.refine` to `ORDERED_STEPS` and `STEP_DEPENDENCIES`; add `useAI`, `userId` to `OrchestratorInputs`; surface `refinementMeta` on route response.
Execution: workflow (post-Move-1, schema change, test additions).

**6 — Wire `csr-job-runner` for narrative; keep `csr-tabulation-builders` for tables.**
Why: pipeline produces tables but no §1–§9 narrative. AI drafting blocks for minutes; right shape is enqueue via `launchCSRBuildAsync`, record `jobId`, transition to `awaiting-async`, resume on job complete.
Blast radius: new `StepStatus = 'awaiting-async'`, new `csr.draft-narrative` step, resume-on-completion mechanism.
Execution: workflow. Post-Move-1.

**7 — Fix region CHECK in migration 0018 to match Zod (13 regions).**
Why: 9 of 13 regions silently fail today.
Blast radius: one migration file.
Execution: surgical edit.

---

## G. Re-estimated GA path

| # | Work | Days | Blocking |
|---|---|---|---|
| 1 | **Move 1 — tenant-scope orchestrator** | 3 | everything below |
| 2 | Move 7 — region CHECK fix | 0.5 | parallel |
| 3 | Move 2 — rename Phase 1 `detectSequenceGaps` | 0.5 | parallel |
| 4 | Move 4 — collapse to one regional-rules file | 1 | parallel |
| 5 | Move 3 — wire hardened validator into `package.validate` | 2 | after 1 |
| 6 | Move 5 — wire `m3.refine` (AI narrative) | 2 | after 1 |
| 7 | Move 6 — wire `csr.draft-narrative` + `awaiting-async` | 3 | after 1 |
| 8 | Test coverage gap (DB seq gaps, hardened composite, regenerate, exposure/lab-shifts) | 2 | parallel |
| 9 | End-to-end smoke (IND + NDA + MAA) | 2 | after 5/6/7 |
| 10 | UI surface for orchestrator runs (out of audit scope) | 3–5 | after 9 |

**Critical-path total (no UI):** ~13 working days (~2.5 calendar weeks).
**With UI:** ~3.5 calendar weeks.
**MVP-shippable subset** (defer Moves 5/6 to post-GA — deterministic + hardened-validator only): ~**8 working days**.

---

## What surprised me

- **Orchestrator imports hardened validator type only.** The actual validate step is a `deferred` stub. The earlier reconciliation report implied wiring; there is none.
- **`csr-tabulation-builders` and `csr-job-runner` operate on disjoint data shapes.** Tables consume a typed `StudyData` extract; the job runner produces AI narrative. Integrating them is net-new pipeline code, not a refactor.
- **Zero tenant scoping across all four pre-existing services.** Not flagged in any prior report. For a regulated multi-tenant system this is the most serious finding in this audit.
- **`module3-narrative-builder` (Phase 2) is an orphan.** Hallucination guard + Part-11 prompt-version capture I built are unused in production today.
- **Hardening's `detectSequenceGaps` swallows DB errors as warnings.** A Postgres outage today produces a green submission.
