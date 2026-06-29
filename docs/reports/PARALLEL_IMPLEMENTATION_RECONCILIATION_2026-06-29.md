# Parallel-Implementation Reconciliation — Document Assembly

**Date:** 2026-06-29
**Status:** 🔴 BLOCKING — surfaced after Phase 3 landed and before Phase 4/5 fired.
**Trigger:** Reading `server/routes/submission-orchestrator.ts` to design Phase 5 revealed it imports from FOUR services I assumed were missing.

---

## What I just discovered

The verification report (2026-04-27) and the build plans (2026-04-27) declared Plans 3/4/5 as "missing" or "schema-only." That conclusion was based on agent grep/excerpts. **It was wrong.** Reading the existing `server/routes/submission-orchestrator.ts` end-to-end shows it already imports working implementations of all five plans.

Files I assumed needed to be built, with actual sizes and exports:

| File | Lines | Exports | Status |
|---|---|---|---|
| `server/services/m2-summary-builders.ts` | 606 | `buildM23QualityOverallSummary`, `buildM24NonclinicalOverview`, `buildM25ClinicalOverview`, `buildM27ClinicalSummary` | **Plan 3 / Phase 4 — already built** |
| `server/services/submission-package-orchestrator.ts` | 574 | `runOrchestrator`, `getRun`, `getRunAudit`, `markDownstreamStale`, `regenerateAffected`, `StepKey`, `StepStatus` | **Plan 5 — already built** |
| `server/services/ectd/ectd-validator-hardening.ts` | 587 | `validateEctdPackageHardened`, `validateDtdConformance`, `enforceMd5Checksums`, `auditStudyIdTagging`, `detectSequenceGaps`, `flattenFindings` | **Overlaps with Phase 1 — already built** |
| `server/services/csr-tabulation-builders.ts` | 533 | `buildCSRTables`, `buildDispositionTable`, `buildAnalysisPopulationsTable`, `buildDemographicsTable`, `buildEfficacyTable`, `buildExposureTable`, ... | **CSR §10–§12 tabulation — already built** |
| `server/routes/submission-orchestrator.ts` | 356 | HTTP routes for runs, audit, regenerate, M2 standalone builders, CSR tabulate, hardened validate | **Plan 5 routes — already built** |

That's **~2,650 LOC** of existing infrastructure neither the audit nor the verification surfaced. Both relied on Explore/Grep agents reading excerpts; neither followed the orchestrator's imports.

---

## Why the verification missed it

The 2026-04-27 verification report focused on the file:line claims the audit made. The audit pointed at `csr-builder.ts`, `ectdExportService.ts`, `module3Composer.ts`, etc. — files that DO exist. The verification confirmed those files. Neither agent followed `import` statements to discover related services.

Lesson: ground-truth verification needs to grep for `import .* from` against the suspected-missing files, not just confirm cited file:line.

---

## Material consequences

### Phase 1 (eCTD validator extensions — already shipped in `ed5932be`)
There is now overlap between:
- **My `ectd4-validator.ts` extensions** (CHECKSUM_MISMATCH, MISSING_STUDY_ID, SEQUENCE_GAP, INVALID_LIFECYCLE_TARGET, regional-rules)
- **Pre-existing `ectd-validator-hardening.ts`** (`enforceMd5Checksums`, `auditStudyIdTagging`, `detectSequenceGaps`, `validateDtdConformance`)

Both implement many of the same checks. The hardened-validator file also has `validateDtdConformance` which I explicitly deferred. **The hardened-validator is more complete than what I just shipped.**

### Phase 2 (Module 3 narrative — shipped in `81b5e06f`)
No direct overlap found. `module3Composer.ts` + `module3-narrative-builder.ts` are net-new and don't conflict with the existing services.

### Phase 3 (CSR job-state wrapper — shipped in `dfb0f70e`/`8911d48d`)
No conflict with the orchestrator. The job runner is a NEW capability (async + state persistence) that complements the existing `csr-tabulation-builders.ts` (which produces tables, not state).

### Phase 4 (M2 builders — about to be planned)
**The M2 builders are already built.** Planning new ones would have duplicated 606 lines. The existing ones may not be wired to the new Module 3 narratives I shipped in Phase 2 — that's the actual integration gap.

### Phase 5 (orchestrator merge — about to be planned)
**The orchestrator is already built.** The plan-doc said "merge with existing"; that was directionally right. The actual remaining work is:
- Confirm `runOrchestrator` knows about the new `csr-job-runner` (likely not yet)
- Confirm `runOrchestrator` calls the new `module3-narrative-builder` (likely not yet)
- Confirm validation gate uses the hardened validator, not the in-progress one

---

## Revised plan

### Hold
- **Phase 4 implementation workflow** — schema design doc not needed; M2 builders exist
- **Phase 5 implementation workflow** — orchestrator exists

### Continue (already firing)
- **Phase 1b** — validator HTTP routes (already firing). My Phase 1 validator extensions can stay; they're a leaner alternative to the hardened validator. Phase 1b extends the existing route. No conflict.
- **Phase 3b** — CSR jobs HTTP routes (already firing). New routes for the new job runner. No conflict.

### New work surfaced by this finding
- **Phase 1c — validator consolidation.** Decide whether `ectd4-validator.ts` (my extensions) and `ectd-validator-hardening.ts` (existing) should be merged into one validator, or whether they serve distinct purposes (light-weight per-leaf checks vs full-package hardening). **The hardened validator has DTD conformance I deferred.** A real GA move would unify them or document the split.
- **Phase 4b — wire M3 narratives → M2 builders.** Phase 2 added an AI-grounded narrative layer for M3. The existing `buildM23QualityOverallSummary` reads structured M3 inputs but doesn't yet consume the AI-refined narratives. Confirm whether it should.
- **Phase 5b — wire job runner + module3 narrative builder into the orchestrator.** The orchestrator was built before my Phase 2/3 work. It needs to know the new services exist. This is the actual integration step that closes the loop.

### Reconciliation order
1. Let Phase 1b and 3b workflows complete (they're firing, no conflicts).
2. Audit the existing M2 builders + orchestrator + hardened validator end-to-end (one workflow, multiple lenses) to map their actual capability surface vs the new work shipped this session.
3. Based on the audit, decide consolidation moves with you in the loop — not autonomously.
4. Fire reconciliation workflows for whichever moves you approve.

---

## What I will NOT do without sign-off

- Delete or refactor any of the four existing services (deleting working code is high-risk; consolidation needs your call)
- Fire Phase 4 or Phase 5 implementation workflows (they would duplicate existing work)
- Modify `submission-orchestrator.ts` route to wire the new services without first auditing what it does today

---

## Open questions for you

1. **Validator strategy.** Do you want `ectd-validator-hardening.ts` (DTD-aware, ~600 lines) to be the canonical FDA-ESG-conformance validator, with my Phase 1 extensions to `ectd4-validator.ts` deprecated or merged in? Or are they intentionally separate (per-leaf live checks vs end-of-pipeline hardening)?

2. **M2 builders are already built.** Should we wire them to consume the new AI-grounded M3 narratives, or leave them on the deterministic M3 path they already use?

3. **Orchestrator integration.** Is the existing `runOrchestrator` the canonical pipeline you want me to extend with the new CSR job runner + module3 narrative builder, or are there reasons to keep the new services standalone for now?

4. **Phase 4/5 budget.** The original 12-week revised path assumed building from scratch. With ~2,650 LOC of working infrastructure I missed, the GA path may be much shorter — possibly weeks not months — IF the integration is clean. Want me to do a fresh end-to-end audit of the four existing services and re-estimate?
