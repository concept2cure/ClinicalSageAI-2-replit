# Incoming Reporting legal chooser reconciliation

Separate frozen verification on merge `728e7b9844b29df47b272682969df30f77a0d5b1`, preserving incoming canonical Reporting legal chooser work through `0b3aaa10c`. This phase makes no implementation changes. Earlier reporting/API/discovery/Authoring compatibility results retain their own evidence and are not pooled into this result.

## What already exists

- `surfaces/InsightsLegalPackage.tsx` already provides the bundle legal package controls; `InsightsPackageStationery.tsx` provides their stationery selection. Incoming canonical work completes chooser ownership and paging within these controls, which are reached from the existing Bundles panel.
- `surfaces/company-documents/PagedCompanyLegalPicker.tsx` is the shared legal picker. It reuses `useCompanyLegalResource.ts` and the existing owner/lease helpers in `companySession.ts`; this phase introduces no second chooser, register or session mechanism.
- The reporting canvas, library model, Schedules/Bundles panels and action hook remain the earlier implementation. All five reporting recovery runtime source hashes match the preceding qualified source. Existing reporting/API tests, the updated `insightsLegalPackage.test.tsx`, and the two incoming legal chooser suites provide the regression boundary.

## Verified result

**367 tests passed across 35 files**, exit 0, in **71.87 seconds**. The run contains all current `insights*` and `reporting*` test files plus `apiCall.test.ts`, including `reportingLegalChooserOwnership.test.tsx` and `reportingLegalChooserPaging.test.tsx`. The exact 35-file manifest is recorded with the command; temporary layout instrumentation is absent.

All **55** source/test hashes match before and after execution. Pins include the shared legal picker, companySession/resource hook, legal models, reporting module/runtime, API/session helpers and every selected test file. [before-source-pins.json](before-source-pins.json) and [after-source-pins.json](after-source-pins.json) retain that identity. [command.json](command.json) records the exact command, working directory, Node 22.22.0 and 4096 MiB heap. Lossless raw JSON/log gzip copies and original/compressed hashes appear in [artifact-manifest.json](artifact-manifest.json).

These are bounded fixture-backed component/request tests. They do not establish hosted authentication, native database behavior, live approved-model acceptance or regulatory qualification. No source edits, compiler/build, commit or push were performed by this agent; final release gates remain parent evidence.
