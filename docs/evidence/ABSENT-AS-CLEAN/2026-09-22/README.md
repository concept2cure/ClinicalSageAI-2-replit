# Absent-as-clean audit — corrected ledger (2026-09-22)

**Question.** Where does this codebase turn *absent or unrecorded* data into a
passing, zero or clean result? Examples: a percentage over only what ran, a
`?? false` on a decision input, a gate whose `catch` contributes nothing to its
blockers, a DB default that writes "No" for "nobody said".

**Method.** One workflow run, 267 agents. Eight blind sweep angles, and each
candidate went to three adversarial verifiers (a reachability lens and two
refute-by-default lenses). It needed 2 of 3 votes to be confirmed.

**What went wrong with the run, and how this ledger corrects it.**
114 of 267 agents failed on the account's monthly spend limit, including every
verifier for three whole angles and the completeness critic. The workflow
script then did the thing it was auditing for. Its rule was
`confirmed: cast.length > 0 && kept >= 2`, and everything else was counted as
"refuted", so a candidate with **zero votes cast** was reported as refuted.
The script's summary said "41 confirmed, 45 refuted". The real split, rebuilt
from the per-agent journal, is:

| State | Count | Meaning |
|---|---:|---|
| confirmed | 41 | at least 2 of 3 verifiers said real and reachable |
| **UNVERIFIED** | **36** | no verifier completed (or the only completed one said *real*). **Not refuted.** |
| refuted | 7 | a verifier completed and refuted it |
| duplicate | 6 | same `file:line` as a confirmed finding, found again by another angle |

Coverage by angle: `percentages`, `boolean-verdicts`, `nullish-defaults` and
`error-swallowing` were fully verified. `db-defaults` was mostly unverified.
`empty-set-vacuous`, `status-unions` and `claims-and-labels` had **no**
verification at all. The completeness critic did not run.

`ledger.json` holds every candidate with its state, votes, the claimed
absent→clean mapping, what it should be, and the consequence.

## Fixed

| Finding | Commit | Proof it was real |
|---|---|---|
| SoD owner lookup: any query error → `null` → signature **allowed** (`separation-of-duties.ts:105`) | `78420cb02` | 7 new tests fail on the old code; now 503 `SEPARATION_OF_DUTIES_UNVERIFIED` |
| Governance gates 3 and 4: empty `catch` → transition **allowed**, audit row `blockedReasons: []` (`governance-boundary-service.ts:341, :382`) | `78420cb02` | 6 fail on the old code; 2 healthy controls pass on both |
| Export gate: no `exportState` → `aiGenerated: false` → human-review check **absent**; `isStale ?? false` → "Document is current" | `78420cb02` | 3 fail on the old code, including a fixture that relied on the default |
| Amendment consent/risk: `?? false` + `NOT NULL DEFAULT false` → every product-created amendment "declared affects neither" | `3495d6c4f` | 3 fail on the old code; scratch-DB migration run: blank, old shape, re-run |

## Confirmed, still open (37)

The full text of each is in `ledger.json`. The most important on launch-catalog paths:

- `data-lineage-service.ts:418`: the coverage denominator is the set of
  sections that *have* lineage, so any artifact with one lineage row reports
  **100%, no gaps**.
- `readiness-scoring-engine.ts:454` and `:162`: nullable twin columns are
  coalesced to 70 / 0 / 180, so "never predicted" becomes a score.
- `submission-twin-service.ts:251`: evidence-integrity errors are swallowed.
- `protocol-deviations-service.ts:58`: an unassessed deviation is written as
  `minor` and *affirmatively non-reportable*, citing ICH E6(R2) §4.5.3. The DB
  column defaults to `'minor'` with no `not_assessed` value. This is the
  amendment defect's twin and should get the same treatment.
- `capaMdr.service.ts:299` / `triageEngine.ts:179`: unknown patient harm
  falls to "No harm reported — no MDR". The device stream is paused under
  Rule 2 (see `docs/handoff/HANDOFF_DEVICE.md`), so this waits for it.

## Found while fixing, not in the audit

- Governance gate 4 feeds the fabric **hard-coded**
  `hasContent/hasEvidence/hasProvenance: true`, and derives
  `hasBeenReviewed` from the boundary being requested. When the fabric runs,
  it judges facts nobody checked. Fixing this needs real document-state reads.
- SoD still allows when a modelled row records no owner.
- `classifyAmendmentImpact` has no production caller. Its "administrative →
  no IRB review" path is a regulatory judgment that needs review before
  anything user-facing uses it.

## Confirmed

| Severity | Location | Symbol | Angle | Votes | Status |
|---|---|---|---|---|---|
| critical | `db/migrations/20260730_cmc_change_control_store.sql:29` | cmc_change_controls (CREATE TABLE) | db-defaults | 3/3 | open |
| critical | `migrations/20260705_export_control.sql:29` | export_control_reviews (CREATE TABLE) | db-defaults | 3/3 | open |
| critical | `server/services/capa-mdr/capaMdr.service.ts:299` | createComplaint | boolean-verdicts | 3/3 | open |
| critical | `server/services/capa-mdr/capaMdr.service.ts:299` | createComplaint | nullish-defaults | 3/3 | open |
| critical | `server/services/capa-mdr/triageEngine.ts:179` | classify | boolean-verdicts | 3/3 | open |
| critical | `server/services/data-lineage-service.ts:418` | getLineageCoverage | percentages | 3/3 | open |
| critical | `server/services/governance-boundary-service.ts:341` | GovernanceBoundaryService.evaluateTransition (gate 3: contradiction gate; gate 4 at line 382) | error-swallowing | 3/3 | fixed 78420cb02 |
| critical | `server/services/governance/separation-of-duties.ts:105` | resolveTargetOwnerId / assertSignerIsNotAuthor | error-swallowing | 3/3 | fixed 78420cb02 |
| critical | `server/services/innovation/submission-readiness-twin-service.ts:898` | calculateDimensionScores | percentages | 2/3 | open |
| critical | `server/services/intelligence/readiness-scoring-engine.ts:454` | gatherTwinAssessment | percentages | 2/3 | open |
| critical | `server/services/protocol-amendments/protocol-amendments-service.ts:87` | createAmendmentTx | nullish-defaults | 3/3 | fixed 3495d6c4f |
| critical | `server/services/protocol-deviations/protocol-deviations-service.ts:58` | createDeviationTx | nullish-defaults | 3/3 | open |
| critical | `server/services/rbm/site-risk-engine.ts:87` | readProgramSites (consumed by recomputeSiteRisk, line 99) | error-swallowing | 3/3 | open |
| critical | `server/services/realTimeValidationService.ts:410` | RealTimeValidationService.analyzeContentWithAI (second swallow at performValidation, line 299) | error-swallowing | 3/3 | open |
| critical | `server/services/regulator-overlay-engine.ts:293` | RegulatorOverlayEngine.applyOverlays | error-swallowing | 3/3 | open |
| critical | `server/services/submission-twin-service.ts:251` | SubmissionTwinService.assessEvidenceIntegrity | error-swallowing | 3/3 | open |
| critical | `server/src/control-plane/governed-document-evaluator.ts:227` | evaluateGovernedDocument | nullish-defaults | 2/3 | fixed 78420cb02 |
| major | `server/routes/mission-control.ts:1050` | GET /programs/:programId/readiness | percentages | 2/3 | open |
| major | `server/services/ai-actions/action-history.ts:125` | getActionHistory | error-swallowing | 3/3 | open |
| major | `server/services/ana/project-readiness-aggregator.ts:185` | deriveProjectReadinessAggregate | percentages | 3/3 | open |
| major | `server/services/auth-security-service.ts:122` | checkPasswordHistory | error-swallowing | 3/3 | open |
| major | `server/services/benefit-risk/benefit-risk-knowledge.ts:529` | structureBenefitRiskFramework | nullish-defaults | 2/3 | open |
| major | `server/services/citi/citi-logic.ts:60` | trainingStatus | boolean-verdicts | 3/3 | open |
| major | `server/services/clinical-regulatory-evidence/index.ts:710` | getTrace | nullish-defaults | 3/3 | open |
| major | `server/services/contradiction-engine-service.ts:1392` | detectBodySpecificExpectationConflicts (per-section loop) | error-swallowing | 3/3 | open |
| major | `server/services/ectd/release-signature-status.ts:59` | isReleaseSignatureRequired | boolean-verdicts | 3/3 | open |
| major | `server/services/grants/grants-logic.ts:329` | costShareStatus | boolean-verdicts | 2/3 | open |
| major | `server/services/iacuc/iacuc-logic.ts:117` | reviewStatus | boolean-verdicts | 3/3 | open |
| major | `server/services/ibc/ibc-logic.ts:104` | registrationExpiration | boolean-verdicts | 3/3 | open |
| major | `server/services/ind-lifecycle/ind-sae-line-listing.ts:115` | buildSaeLineListing | boolean-verdicts | 3/3 | open |
| major | `server/services/intelligence/cross-artifact-consistency-scanner.ts:536` | getConsistencyAlertsSummary | percentages | 3/3 | open |
| major | `server/services/intelligence/readiness-scoring-engine.ts:162` | computeReadinessScore | percentages | 3/3 | open |
| major | `server/services/invention-disclosure/invention-disclosure-logic.ts:92` | evaluateBayhDoleCompliance | boolean-verdicts | 3/3 | open |
| major | `server/services/invention-disclosure/invention-disclosure-service.ts:103` | getCompliance | boolean-verdicts | 3/3 | open |
| major | `server/services/licensing/eula-service.ts:234` | getOutstandingAgreements (and getActiveAgreements, line 199) | error-swallowing | 3/3 | open |
| major | `server/services/regulator-overlay-engine.ts:373` | RegulatorOverlayEngine.getMatchingRules | error-swallowing | 2/3 | open |
| major | `server/services/regulatory/spl-fhir.ts:126` | validateFhirResource | nullish-defaults | 3/3 | open |
| major | `server/services/regulatory/submissionPackageBuilder.ts:105` | buildPackageManifest | nullish-defaults | 3/3 | open |
| major | `server/services/sap-generator-service.ts:570` | SapGeneratorService.updateSap | nullish-defaults | 2/3 | open |
| major | `server/services/validate-completeness-engine.ts:220` | ValidateCompletenessEngine.buildChecklist | percentages | 2/3 | open |
| minor | `server/services/documentQuality/qualityLintService.ts:67` | DocumentQualityLintService.runVale | error-swallowing | 3/3 | open |

## UNVERIFIED — the next session's first work

These were never checked. None may be treated as refuted, and none may be
treated as confirmed. Re-run verification (the workflow resumes from cache:
`resumeFromRunId: wf_81390a05-5f9`) once the spend limit resets.

**Fix the script's verdict rule first**, or the re-run repeats the error.
It must be three-valued: `confirmed` when at least 2 votes say real,
`refuted` when at least 2 say refuted, and `unverified` for everything
else (including any candidate with fewer than 2 votes cast). A verifier
that failed is not a vote.

| Severity | Location | Symbol | Angle | Votes | |
|---|---|---|---|---|---|
| critical | `client/src/concept2cure/v2/surfaces/DispatchReadiness.tsx:442` | DispatchReadiness | claims-and-labels | cast=0 refuted=0 failed=6 |  |
| critical | `migrations/20260504_capa_mdr.sql:60` | complaints (CREATE TABLE) | db-defaults | cast=1 refuted=0 failed=2 |  |
| critical | `migrations/20260705_research_agreements.sql:30` | research_agreements (CREATE TABLE) | db-defaults | cast=0 refuted=0 failed=3 |  |
| critical | `server/services/compliance/pharmacovigilanceService.ts:621` | generateICSR | status-unions | cast=0 refuted=0 failed=3 |  |
| critical | `server/services/external-control-arm-service.ts:856` | ExternalControlArmService.validateControl → overallQuality | empty-set-vacuous | cast=0 refuted=0 failed=6 |  |
| critical | `server/services/external-control-arm-service.ts:1027` | ExternalControlArmService.generateRegulatoryPackage → diagnosticsSummary | empty-set-vacuous | cast=0 refuted=0 failed=6 |  |
| critical | `server/services/regulatory/change-assessment.ts:96` | assessFdaChange | status-unions | cast=0 refuted=0 failed=6 |  |
| major | `client/src/concept2cure/v2/surfaces/ClientPortal.tsx:187` | ClientPortal | claims-and-labels | cast=0 refuted=0 failed=3 |  |
| major | `client/src/concept2cure/v2/surfaces/DispatchReadiness.tsx:491` | DispatchReadiness (lead) | claims-and-labels | cast=0 refuted=0 failed=6 |  |
| major | `client/src/concept2cure/v2/surfaces/ReviewThreads.tsx:225` | post | claims-and-labels | cast=0 refuted=0 failed=3 |  |
| major | `migrations/20260610_ibc_biosafety.sql:27` | ibc_registrations (CREATE TABLE) | db-defaults | cast=0 refuted=0 failed=3 |  |
| major | `migrations/20260618_coverage_analysis.sql:65` | coverage_analysis_items (CREATE TABLE) | db-defaults | cast=0 refuted=0 failed=3 |  |
| major | `migrations/20260629_protocol_amendments.sql:26` | protocol_amendments (CREATE TABLE) | db-defaults | cast=0 refuted=0 failed=3 |  |
| major | `migrations/20260704_other_support.sql:49` | other_support_entries (CREATE TABLE) | db-defaults | cast=0 refuted=0 failed=3 |  |
| major | `server/routes/mdx-imports.ts:509` | GET /api/mdx/onboarding/:tenantId | claims-and-labels | cast=0 refuted=0 failed=6 |  |
| major | `server/services/ana-ri/context-enrichment.ts:474` | enrichWithReadiness | claims-and-labels | cast=0 refuted=0 failed=3 |  |
| major | `server/services/ana/AnaToolExecutor.ts:4154` | registerToolHandler('check_regulatory_compliance') | empty-set-vacuous | cast=0 refuted=0 failed=3 |  |
| major | `server/services/authoring/revision-ledger.ts:151` | verifyLedger | empty-set-vacuous | cast=0 refuted=0 failed=3 |  |
| major | `server/services/cdisc/cdisc-conformance-service.ts:184` | validateSdtmDataset | empty-set-vacuous | cast=0 refuted=0 failed=3 |  |
| major | `server/services/clinical-regulatory-evidence/index.ts:704` | getTrace | status-unions | cast=0 refuted=0 failed=3 |  |
| major | `server/services/intelligence/judgment-framework.ts:175` | evaluateEvidenceSufficiency | status-unions | cast=0 refuted=0 failed=3 |  |
| major | `server/services/regulatory-precedent-intelligence/confidence-calibration-service.ts:343` | ConfidenceCalibrationService.getCalibrationReport | claims-and-labels | cast=0 refuted=0 failed=3 |  |
| major | `server/services/regulatory/change-assessment.ts:147` | assessEuSignificantChange | status-unions | cast=0 refuted=0 failed=6 |  |
| major | `server/services/regulatory/iec-62304-software.ts:46` | classifySoftwareSafety | status-unions | cast=0 refuted=0 failed=3 |  |
| major | `server/services/regulatory/registry/registryCoverage.ts:435` | getDocumentCoverage | empty-set-vacuous | cast=0 refuted=0 failed=3 |  |
| minor | `client/src/concept2cure/v2/surfaces/AuthoringCollab.tsx:184` | takeover | claims-and-labels | cast=0 refuted=0 failed=0 |  |
| minor | `client/src/concept2cure/v2/surfaces/ClientPortal.tsx:236` | ClientPortal | claims-and-labels | cast=0 refuted=0 failed=3 |  |
| minor | `client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx:395` | CmcModule3Build | claims-and-labels | cast=0 refuted=0 failed=0 |  |
| minor | `client/src/concept2cure/v2/surfaces/EctdCompile.tsx:482` | doValidate | claims-and-labels | cast=0 refuted=0 failed=0 |  |
| minor | `server/config/FDAFormsRegistry.ts:722` | checkFormDependencies | empty-set-vacuous | cast=0 refuted=0 failed=3 |  |
| minor | `server/routes/mdx-imports.ts:520` | GET /api/mdx/onboarding/:tenantId | claims-and-labels | cast=0 refuted=0 failed=6 |  |
| minor | `server/services/clinical-regulatory-evidence/index.ts:704` | getTrace | claims-and-labels | cast=0 refuted=0 failed=6 |  |
| minor | `server/services/pdev/pdev-workflow-bridge.ts:543` | decideCheckpoint | status-unions | cast=0 refuted=0 failed=3 |  |
| minor | `server/services/projects/schedule-of-events/health.ts:132` | assessScheduleHealth | status-unions | cast=0 refuted=0 failed=3 |  |
| minor | `server/services/regulatory-programs.service.ts:699` | getSafetySignals | status-unions | cast=0 refuted=0 failed=3 |  |
| minor | `server/services/regulatory/design-controls.ts:257` | assessDhfCompleteness | empty-set-vacuous | cast=0 refuted=0 failed=3 |  |

## Refuted

| Severity | Location | Symbol | Angle | Votes | |
|---|---|---|---|---|---|
| major | `server/services/clinical-regulatory-evidence/index.ts:704` | getTrace | nullish-defaults | cast=6 refuted=3 failed=0 |  |
| major | `server/services/innovation/submission-readiness-twin-service.ts:841` | evaluateCriterion | percentages | cast=9 refuted=4 failed=0 |  |
| major | `server/services/innovation/submission-readiness-twin-service.ts:886` | calculateDimensionScores | percentages | cast=9 refuted=4 failed=0 |  |
| major | `server/services/pdev/pdev-workflow-bridge.ts:543` | recordDecision | nullish-defaults | cast=6 refuted=5 failed=0 |  |
| major | `server/services/precedent-engine.ts:931` | PrecedentEngine.recommendStrategy | percentages | cast=3 refuted=2 failed=0 |  |
| minor | `server/services/ana/citation-section-coverage.ts:243` | deriveProjectSectionCoverage | percentages | cast=3 refuted=2 failed=0 |  |
| minor | `server/services/pdev/pdev-workflow-bridge.ts:524` | recordDecision | nullish-defaults | cast=6 refuted=5 failed=0 |  |
