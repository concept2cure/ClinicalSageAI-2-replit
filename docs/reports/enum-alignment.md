# Enum Alignment Report — pgEnum ↔ TypeScript union drift

**Date:** 2026-07-01
**Guard:** `tests/schema/enum-alignment.test.ts` (vitest)
**Scope:** `shared/schema.ts`, `shared/schema/*.ts`, `shared/types/*.ts`

## Summary

- **pgEnums found:** 65 (across 7 schema files)
- **Matched pairs now guarded by the test:** 6 (all in `shared/schema/resolution.ts` ↔ `shared/types/resolution.ts`)
- **Real drift discovered (pgEnum vs mirroring TS union):** 0 among guarded pairs
- **Drift-adjacent findings that a maintainer should note:** see "Findings" below (two `SequenceStatus` TS unions disagree with each other; orchestration TS unions intentionally diverge from their look-alike pgEnums)

The overwhelming majority of pgEnums have **no** mirroring TS union at all — they are consumed via drizzle's generated column types (`typeof enum.enumValues[number]`) rather than a hand-written union, so there is nothing to drift against. Those are listed under "Unmirrored pgEnums".

## Method

1. Extracted every `pgEnum('name', [...])` from `shared/schema.ts` and `shared/schema/*.ts` and recorded its value array.
2. Scanned `shared/types/*.ts` and `shared/schema/*.ts` for `export type X = 'a' | 'b' | ...` unions and `as const` value arrays, matching to pgEnums by name similarity and value overlap.
3. Guarded only pairs where **both** a `pgEnum` and a mirroring TS union exist and are importable. For those, the test declares a local sample array `... as const satisfies readonly TheUnion[]` (compile-time guard: if the union changes, the test file fails to type-check) and asserts the sample's set equals `pgEnum.enumValues` (runtime membership guard).

## Guarded pairs (6)

All in `shared/schema/resolution.ts` (pgEnum) ↔ `shared/types/resolution.ts` (union). Verified aligned — no drift.

| pgEnum (db name) | TS union | Values |
|---|---|---|
| `resolutionTriggerTypeEnum` (`resolution_trigger_type`) | `ResolutionTriggerType` | 7 |
| `resolutionPathEnum` (`resolution_path`) | `ResolutionPath` | 6 |
| `resolutionConfidenceEnum` (`resolution_confidence`) | `ResolutionConfidence` | 4 |
| `resolutionStateEnum` (`resolution_state`) | `ResolutionState` | 7 |
| `bundleStateEnum` (`bundle_state`) | `BundleState` | 8 |
| `supersessionStateEnum` (`supersession_state`) | `SupersessionState` | 3 |

The compile-time guard was verified by inserting a bogus member into a sample array: `tsc --noEmit` failed with `TS2322: Type '"BOGUS_DRIFT"' is not assignable to type 'SupersessionState'`. Reverted after verification.

> Note: `shared/types/resolution.ts` also defines `BundleItemStatus`, `BundleItemActionType`, and `ImpactState`, which have **no** backing pgEnum (they describe JSON payload fields, not DB columns). They are listed under "Unmirrored TS unions".

## Findings (drift-adjacent, not guarded)

No true pgEnum↔union drift exists among importable mirror pairs. The following are surfaced for a maintainer but were intentionally **not** forced into the test, because they are not clean pgEnum/union mirror pairs:

### 1. Two `SequenceStatus` TS unions disagree with each other (no pgEnum on either side)

- `shared/types/submission-constants.ts:70` — `SequenceStatus = 'draft' | 'assembling' | 'validated' | 'frozen' | 'dispatched'`
- `shared/schema/living-record-spine.ts:114` — `SequenceStatus = (typeof SEQUENCE_STATUSES)[number]` where `SEQUENCE_STATUSES = ['planning','compiling','validated','submitted','superseded']`

These two same-named types share only the value `validated`. **Neither is backed by a `sequence_status` pgEnum** (searched — none exists; sequence status columns are stored as `text`). This is a TS-vs-TS naming collision, not pgEnum drift, so it is out of scope for this guard. A maintainer should consider (a) renaming one, and (b) whether either should become a pgEnum.

### 2. Orchestration TS unions look like pgEnum mirrors but are a different abstraction

`shared/schema/orchestration.ts` and `shared/types/orchestration.ts` both define workflow-status types, but they do **not** mirror each other:

- pgEnum `workflow_run_status` = `pending, running, paused, awaiting_approval, completed, failed, cancelled` (7)
  vs TS `WorkflowExecutionStatus` = `pending, running, paused, completed, failed, cancelled` (6) — TS is missing `awaiting_approval`.
- pgEnum `workflow_step_status` = `proposed, awaiting_review, approved, executed, failed, skipped` (6)
  vs TS `WorkflowStepStatus` = `pending, running, completed, failed, skipped` (5) — largely disjoint.

The TS unions are the orchestrator's in-memory/logical status vocabulary; the pgEnums are the persisted DB vocabulary. They are deliberately separate, so guarding them for equality would be a bogus (always-failing) assertion. Documented here so a future maintainer does not mistake the name similarity for an intended mirror. If they are *supposed* to be mirrors, that is a real bug to fix in source (out of scope for this detection task).

## Unmirrored pgEnums (no hand-written TS union to link)

These pgEnums have no mirroring TS union in `shared/types/*` or their schema file — they are used via drizzle column types. A maintainer wanting typed client-side unions could add mirrors (and then extend `enum-alignment.test.ts`). Notably this includes all the task-called-out CSR and biostatistics enums.

**`shared/schema.ts` (17):** `generalStatusEnum` (12), `complianceStatusEnum` (7), `batchStatusEnum` (9), `submissionStatusEnum` (10), `sourceTypeEnum` (4), `estimandStrategyEnum` (5), `adaptationTypeEnum` (7), `biostatNodeTypeEnum` (9), `biostatEdgeTypeEnum` (8), `claimSupportStrengthEnum` (6), `driftTypeEnum` (7), `reviewerLensEnum` (7), `twinFindingSeverityEnum` (5), `twinAssessmentStatusEnum` (4), `reportDomainEnum` (12), `sealStatusEnum` (5), `regulatoryBodyEnum` (17)

**`shared/schema/csr-knowledge-db.ts` (13):** `studyPhaseEnum` (`csr_study_phase`, 14), `studyDesignEnum` (`csr_study_design`, 12), `blindingTypeEnum` (5), `armTypeEnum` (8), `endpointCategoryEnum` (8), `aeSerousnessEnum` (4), `aeCausalityEnum` (6), `aeOutcomeEnum` (6), `ctdModuleEnum` (5), `regulatoryAgencyEnum` (11), `signalStatusEnum` (6), `moleculeTypeEnum` (`csr_molecule_type`, 13), `therapeuticAreaEnum` (`csr_therapeutic_area`, 19)

**`shared/schema/operating-system.ts` (12):** `assumptionCategoryEnum` (12), `assumptionValueTypeEnum` (5), `assumptionSourceTypeEnum` (5), `assumptionConfidenceEnum` (4), `assumptionStatusEnum` (5), `decisionContextTypeEnum` (8), `decisionActionStateEnum` (5), `decisionApprovalStateEnum` (4), `decisionEscalationStateEnum` (4), `decisionConfidenceEnum` (4), `governanceBoundaryEnum` (5), `domainTrackEnum` (5)

**`shared/schema/orchestration.ts` (8):** `workflowRunStatusEnum` (7), `workflowStepStatusEnum` (6), `approvalGateTypeEnum` (4), `triggerSourceEnum` (5), `actorTypeEnum` (4), `evidenceClassEnum` (3), `confidenceLevelEnum` (5), `readinessRuleTypeEnum` (5)
_(Two of these — `workflowRunStatusEnum`, `workflowStepStatusEnum` — have same-named-but-divergent TS unions; see Finding #2.)_

**`shared/schema/unified_workflow.ts` (5):** `documentStatusEnum` (6), `workflowStatusEnum` (4), `approvalStatusEnum` (3), `approvalTypeEnum` (3), `moduleTypeEnum` (6)

**`shared/schema/support-admin.ts` (4):** `supportTicketStatusEnum` (7), `supportTicketPriorityEnum` (4), `supportTicketCategoryEnum` (8), `supportArticleStatusEnum` (3)

## Unmirrored TS unions (no backing pgEnum to link)

A large number of TS unions in `shared/types/*` describe API/JSON/UI vocabularies with no DB pgEnum. Highlights relevant to this task:

- `SequenceStatus` × 2 (`submission-constants.ts`, `living-record-spine.ts`) — see Finding #1. No `sequence_status` pgEnum exists.
- `WorkflowExecutionStatus`, `WorkflowStepStatus` (`shared/types/orchestration.ts`) — see Finding #2.
- `BundleItemStatus`, `BundleItemActionType`, `ImpactState` (`shared/types/resolution.ts`) — JSON payload fields, no pgEnum.
- Numerous others (e.g. `ArtifactStatus`, `DocumentStatus`, `SubmissionFamily`, `Pathway`, `LanguageCode`, `TranslationStatus`, predicate-intelligence unions) — these are API/UI contracts, not DB columns, and are out of scope for pgEnum alignment.

## How to extend this guard

When you add a hand-written TS union that mirrors a pgEnum:
1. Ensure both are exported and importable from `shared/`.
2. Add an `it(...)` to `tests/schema/enum-alignment.test.ts` with a local `... as const satisfies readonly YourUnion[]` sample and an `expectSameMembers(yourEnum.enumValues, sample, 'db_name')` assertion.
3. The `satisfies` gives compile-time drift detection; the assertion gives runtime membership detection.
