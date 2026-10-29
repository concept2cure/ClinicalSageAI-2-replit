# RULE 2 / G5 (Module 2 part): the Module 2 QC grades what a run would build from saved records

Row: D2 (W1). This is slice G5 of `docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md`, its Module 2 part. Benchmark: Weave AutoReview.

## What already exists

- **The QC engine.** `runM2SummaryQc` (`server/services/authoring/m2-summary-qc.ts`) checks presence, traceability, content, completeness and the builders' own gaps. It was reachable only as `POST /api/authoring-pdf/m2-summary/qc`, over summaries in the request body. That route was unmapped (refused in production) and had no caller.
- **The builders.** `buildM23QualityOverallSummary`, `buildM25ClinicalOverview` and `buildM27ClinicalSummary` (`m2-summary-builders.ts`). The orchestrator's program run (`POST /api/submission-orchestrator/runs/for-program`) builds with them from:
  - approved CMC sources (`loadApprovedCmcSourcesForProject`), composed by `composeFullModule3` within the composition boundary (`applicationRefusal`);
  - completed CSR builds (`loadCsrInputsForProject`);
  - no nonclinical studies, pending R-1.
- **Not stored.** A run persists only each step's output hash and ref, never the summary, so no saved M2 summary exists to read back.

## What changed

- **Service.** `readSavedModule2Qc` (`server/services/authoring/module2-saved-qc.ts`) reads the run's inputs and builds with the same builders and arguments. That includes the run's placeholder indication and product, because the run records none.
  - It grades the result with `runM2SummaryQc` over the expected 2.3, 2.4, 2.5 and 2.7.
  - Each summary a run would not build is named in `notBuilt` with its reason:
    - 2.3: the CMC gate's own words, the composition refusal, or an uncomposable region;
    - 2.4: R-1;
    - 2.5 and 2.7: no completed CSR build.
  - Nothing is persisted.
- **Route.** `GET /api/submissions/:id/module2-qc` reads the submission and its project under the caller's access, and is claimed by Submission Center's existing `/api/submissions`.
- **Screen.** `SubmissionModule2Qc.tsx` shows the result under the consistency findings in the submission workspace.
  - Its heading says what was checked, never "ready" over nothing.
  - A failed read is the failure.
- **Retired route.** `POST /api/authoring-pdf/m2-summary/qc` now answers 410 and names the reachable replacement.
- **Style fix.** `.rd-chip.tone-err` was undefined, so the consistency panel's conflict chip and this panel's blocking chip rendered unstyled. It is now defined.

## Not in this slice

- **Module 4 QC.** It waits on R-1: no store links nonclinical studies to a project.
- **Module 5 QC.** It needs each CSR's 5.3.x placement and E3 required-section status. The CSR record does not carry them: `load-csr-inputs-for-project.ts` marks every stored section `required: true, status: 'drafted'`. Feeding the M5 check from that would grade invented fields.
  - `POST /m4-nonclinical/qc`, `/m5-clinical/qc` and `/ctd-readiness` stay as they are: body-graded, unmapped and refused in production. Each is owed the same treatment when its inputs exist.

## Proof

- `server/services/authoring/__tests__/module2-saved-qc.test.ts` passes 3 of 3. The loaders are mocked; the builders and the QC are real.
  - **Completed CSR builds:** 2.5 and 2.7 are built from them. 2.3 (CMC gate closed) and 2.4 (R-1) are named and reported missing, and the verdict is not ready.
  - **No project workspace:** nothing is built or read, and every summary is named.
  - **An NDA with the CMC gate open:** 2.3 is refused by the composition boundary.
  - **Shown failing first:** with the composition refusal removed, the NDA case fails (1 failed, 2 passed). Restored, all pass.
- `client/src/concept2cure/v2/__tests__/submissionModule2Qc.test.ts` passes 2 of 2. The guard accepts only the saved-content shape, and the status never says ready over nothing.
- The Submission Center suites that render the workspace (17 files) pass, with no failure.
- Gates:
  - `ci:launch-scope-api`: 541 paths, none refused;
  - `ci:undefined-css-classes`;
  - the ESLint warning ratchet: unchanged;
  - full `tsc -p tsconfig.json`: clean.
