# W2 / D4 — IND safety authoring route and timing corrections

Checked 2026-10-07 against FDA primary sources:

- https://www.fda.gov/drugs/investigational-new-drug-application-ind/ind-application-reporting-ind-safety-reports — current reporting categories, clocks, follow-up and submission format.
- https://www.fda.gov/regulatory-information/search-fda-guidance-documents/sponsor-responsibilities-safety-reporting-requirements-and-safety-assessment-ind-and — final December 2025 sponsor guidance.
- https://www.fda.gov/regulatory-information/search-fda-guidance-documents/providing-regulatory-submissions-electronic-format-ind-safety-reports-guidance-industry — final April 2024 electronic-format guidance.

The targeted `ind_safety_report` lifecycle record and `US_IND_SR` drafting branch now read the checked route facts from the shared registry's `moduleAuthority`, also used by inquiry/package work in this tranche. The record does not repeat an independent route table. Drafting requires source-supported report subtype and commercial/noncommercial status before selecting AEMS E2B(R3), eCTD or exempt-report handling; it does not assign every report to Module 5 or treat MedWatch/CIOMS as a substitute for a required E2B message.

The targeted lifecycle record distinguishes the 15-day initial clock from sponsor determination, the 7-day clock from initial receipt, and relevant follow-up as soon as available. It removes the false universal 15-day follow-up allowance. Cover/transmittal prompts are route dependent and cannot assert completion of submission or notification from absent records. Existing case-based components are not evidence that every findings or increased-rate report needs an ICSR. All component generation prompts carry the same checked route context; current final sponsor guidance replaces the stale draft citations only within this safety-report record.

Actual section requirements now use the existing lifecycle components. The six-row legacy numeric section scaffold remains compatible by record order, with route limits carried before content. Its numeric keys are preserved, all groups use standalone Module 0 grouping, and case, causality, expectedness, aggregate and follow-up groups are conditional with unresolved applicability explicitly distinct from a waiver. Only report identification is baseline; it does not imply a universal cover letter or Form FDA 1571. Shared labels are checked against the rich lifecycle record without a shared-to-server import. An unknown CTD or other section returns an explicit unindexed answer.

## Verification

- `protocol-ind-safety-red.txt`: three semantic checks failed before the change; 25 existing/protocol checks passed.
- `protocol-ind-safety-fixture-transition.txt`: after the semantic correction, 63 checks passed and only the expected byte-contract fixture check failed. Its diff showed exactly the two case-insensitive `ind_safety_report` fingerprints changed.
- The two exact fingerprints were refreshed from `1c52f0d0d06c1025` to `56e1c4d14b99d796` after semantic verification; the resolver gate and all other inputs remain intact.
- `protocol-ind-safety-green.txt`: 64 tests in four files passed (regional/current protocol/safety drafting, blueprint drafting, CTD/lifecycle depth, full requirements resolver contract).
- `protocol-drafting-lint.txt`: zero errors, eight pre-existing warnings across the large drafting service and lifecycle record.

This provides authoring guidance and explicit route/applicability gaps. It does not classify an actual safety case, calculate its due date, build or validate E2B messages, transmit reports, or demonstrate production pharmacovigilance qualification. Those remain dependent on approved safety records, the applicable technical workflow and accountable review.

## Scaffold follow-through

`protocol-ind-safety-scaffold-red.txt`: actual library check failed on the inherited Module 5 grouping before correction (one failed, 37 passed). `protocol-ind-safety-scaffold-green.txt`: final library and current regional/protocol/safety drafting checks passed 66 tests in two files. `protocol-ind-safety-scaffold-lint.txt`: zero errors, three existing shared bootstrap warnings. Readiness/package applicability qualification is owned by the lead session's catalog integration; this test verifies the scaffold does not assert universal case components or placement.
