# Existing CSR worker coverage correction

## What already exists

`server/services/csr/csr-job-runner.ts` owns asynchronous section persistence, explicit resume, progress, placeholder refusal and dependent continuation. Its existing canonical target structure and placeholder detector come from `server/services/csr-builder.ts`; this is the operational report subset, not a claim of full119-heading E3 editor coverage. `server/services/authoring/workflow-source-import.ts` already refuses missing selected output; this increment corrects misleading worker completion without weakening that intake. Existing worker placeholder tests and private-project PGlite fixtures are extended, with no parallel engine, schema, route or UI.

## Behavior completed

A retained selection containing unsupported headings fails before drafting. Empty arrays retain the existing full-build meaning; supported duplicates are drafted once. Only nonblank saved rows for current targets count toward progress and skip drafting. Explicit resume retries missing/blank targets while preserving nonblank saved rows, including their original content and provenance. Progress is seeded from actual current targets, including zero, and never counts unrelated rows.

Before completion the worker rereads saved targets. Missing/blank target rows fail with `missing_section_outputs` and exact missing codes; saved rows remain available for explicit resume. Existing nonblank target placeholders retain `unresolved_placeholders` behavior. Unrelated placeholder rows do not block an otherwise covered explicit subset. Dependent continuation is called only after durable complete status. This gate establishes saved-output coverage and placeholder absence, not scientific or regulatory correctness.

## Actual evidence

- `red.json`, `red.log.gz`, `red-inputs.json`, `red-source-*.gz`: genuine prepatch worker behavior,7 failed/4 passed. Empty and whitespace outputs were complete; saved blanks were skipped; unrelated rows inflated progress; unsupported selections vacuously completed; an unrelated placeholder blocked a covered subset. Existing three original tests remained unchanged and passed.
- `green.json`:10 passed/1 failed. The remaining assertion incorrectly required `error:null` on the final UPDATE payload instead of the resulting saved job state; the existing drafting transition already clears it. `green-assertion-correction.json` records the correction. No production change was made for that assertion.
- `settled.json`:13 passed, no drift, before the subsequent zero-progress observation.
- `progress-red.json`, raw log/source pins: actual stale100 progress observed at draft entry when current targets were only blank/missing (1 failed/13 skipped). The worker now seeds zero in this case.
- `bounded-regression.json`:36 passed across4 suites before durable SQL case was added.
- `qualified.json`:37 passed across4 suites, no source drift. The14 coverage/placeholder tests execute the actual worker with a scripted Drizzle persistence fixture and scripted drafter/continuation. The extended private-project PGlite suite executes actual worker SQL and durable state: failed66 with only sections1/13 retained, no continuation, then explicit missing-section6-only resume to complete100. Entire retained rows, including IDs, hashes, lineage and generation metadata, are unchanged. Drafter and dependent-continuation functions remain scripted; no live provider or agency calls.
- `lint.json` preserves the initial helper failure: it assumed ESLint input ordering, and the added describe callback exceeded its line warning ceiling. `lint-correction.json` records file-path mapping and test grouping; no warning allowance/baseline was changed. `qualified-lint.json` passes with source warning growth0 and both test files warning/error0. `lint-details.json` retains actual before/current ESLint results.
- `qualified-inputs.json` and `qualified-source-*.gz` pin the final worker, both changed worker tests and the scoped lint helper. Earlier epoch pins remain immutable. Root's merged-source qualification additionally covers shared dependencies and publication.

Human acceptance, model competence, clinical/statistical validation and filing readiness remain pending or outside this fixture scope. No global build/compiler/gates or Git mutations were run by this worker.
