# Reporting library recovery — client evidence

W1 / D2. This completes the existing Schedules and Bundles controls in the canonical reporting canvas. Starting commit: `df869f2815533a2fb6c5174b87a02c21c8a28e87`. Exact verified runtime, changed test fixtures, imported helpers and the final 32 test files are pinned in [source-pins.json](source-pins.json).

## What already exists

- `client/src/concept2cure/v2/surfaces/insightsLibraryModel.ts` already owns schedule creation, explicit enablement and bundle creation. Its existing functions now validate the returned identity, requested scope/recurrence/delivery or exact selected run set before confirming a write.
- `InsightsSchedulesPanel.tsx` and `InsightsBundlesPanel.tsx` already own these forms and registers. Recovery extends their existing notice/button furniture, preserves attempted inputs, and disables repeated dispatch while a matching request is pending or unconfirmed.
- `Insights.tsx` already owns the account session, reporting context and bundle selections. The small `insightsLibraryActions.tsx` hook keeps pending/unconfirmed knowledge and minimal validated completion metadata inside that owner across tab changes. Its context guards extend `reportAccessCurrent`; no second session mechanism or persistent store is introduced.
- `apiCall.ts`, `lib/queryClient.ts#errorCodeOf` and `mutationOutcome.ts#mutationUnconfirmed` remain the API normalizer, code decoder and shared uncertainty classifier. Recovery reads use the existing API normalizer to inspect the raw envelope before permitting review. Ordinary register reads retain `useLiveData`.
- Existing reporting tests and `_insights-library-fixture.tsx` provide the regression boundary. Mutation fixtures now return the actual route shape: a matching 201 record for creation and a 200 row with the requested enablement state. Path-limited deleted-history searches found no retired implementation of these controls to restore; the parent design records the search result.

## Verified behavior

- Missing, malformed, contradictory or mismatched positive receipts remain unconfirmed. Transport errors and generic server failures say the request may have completed. Precise authorization/configuration refusals and the known pre-write bundle size refusal remain precise. A 503 rollback is trusted only with the coherent new negative metadata; an old code alone does not prove absence.
- Ref guards prevent same-batch repeated creates and per-row enablement requests. No mutation automatically retries.
- Unknown outcomes survive library tab changes with the attempted draft/name/selection. Check schedules / Check bundles performs a fresh read. A successful coherent, unique-row register permits a separate deliberate review action; it never automatically releases a hold. Null, malformed, contradictory, duplicate-identity, pending-store and failed reads do not permit review. Absence from a bounded register does not establish failure.
- Review eligibility clears synchronously when another check starts, so an earlier rendered Review control cannot bypass an in-flight or failed newer read.
- Matching confirmations arriving after tab unmount/remount are consumed once in the current original context. Completed restored drafts do not become writable duplicate requests. Late old-program/account completions do not toast or clear replacement selections. Ordinary bearer refresh in the same session remains valid.
- Existing entitlement checks, table/card layout, exports and signature ceremony remain in place. The recovery notice groups its content vertically and lets its review control wrap.

## Execution evidence

| Phase | Observed result | Retained proof |
| --- | --- | --- |
| Corrected product RED on unchanged implementation | 20 failed, 3 passed; exit 1 | `product-red.json.gz`, `product-red.txt.gz`, `product-red-test.tsx.gz` |
| Same-batch Check + stale Review RED before its ref guard | 1 failed, 45 skipped; exit 1 | `review-race-red.json.gz`, `review-race-red.txt.gz`, exact test/runtime snapshots |
| Final bounded reporting integration on frozen corrected runtime | **323 passed across 32 files**, exit 0; 57.36s | `integration-final.json.gz`, `integration-final.txt.gz` |
| Changed-file lint, all eight client runtime/test files | 0 errors; 7 existing warnings in `Insights.tsx`, 0 in every other changed/new file | `lint-baseline.json.gz`, `lint-final.json.gz` |
| `git diff --check` and frozen runtime pin verification | Passed | commands and source pins |

The final integration includes all **46** tests in `reportingLibraryRecovery.test.tsx`; these are not an additional count on top of 323. Its exact file manifest excludes the temporary layout-capture instrumentation. Earlier 23/41/45-case development greens and the earlier 322-test integration are retained privately and are not pooled into the final result.

The first preliminary RED had one bundle-selection fixture setup error. The fixture was corrected and the unchanged product was replayed; only that corrected product RED appears in this packet. The separate race RED is a product assertion failure: an earlier review incorrectly enabled Save while a newer check was being performed.

Exact arguments, working directory, Node 22.22.0 toolchain and 4096 MiB heap are recorded in [commands.json](commands.json). JSON/log/source artifacts are lossless gzip copies; [artifact-manifest.json](artifact-manifest.json) records compressed and original SHA-256 values. The baseline lint reads the four previously existing runtime files from the starting commit via ESLint stdin with their original filenames; it reports the same seven warnings. The new hook and changed/new tests have zero warnings.

## Boundaries

These tests exercise the real client canvas and request/response handling with bounded HTTP fixtures. They do not establish hosted authentication acceptance, live approved-model/provider acceptance, native database behavior, global regulatory qualification or every independent server writer's serialization. Backend transaction evidence, final build/compiler checks, rendered-layout observations and publication are owned by the parent work packet.

## Post-merge verification

The separate [shared API compatibility phase](post-api-merge/README.md) records verification after canonical commit `9f8cae7f0` introduced the optional fourth `apiCall` callback. It preserves this phase’s 323/32 result and pins; its own 335/33 result covers the same reporting files plus the existing API helper tests after an explicit non-null parameter type reconciliation.

The later [workflow discovery reconciliation](post-discovery/README.md) records a bounded 115/4 pass after canonical workflow discovery/navigation merged. It makes no implementation changes and retains its own before/after shared-registry, Shell, API and reporting pins.
