# Post-merge shared API compatibility

Separate verification phase after synchronizing canonical commit `9f8cae7f06df2d1b4c9200bb33b949e7aa30aa50`. The earlier **323 tests / 32 files** result, raw artifacts and source pins remain unchanged and describe their own source. This phase verifies the incoming shared API overload and one type annotation reconciliation.

## What already exists

- `client/src/concept2cure/v2/apiCall.ts` already normalizes responses for reporting. The incoming canonical change adds an optional fourth owner callback that can return null; its existing three-argument overload retains the non-null `ApiResult<T>` contract used by this reporting module.
- `surfaces/insightsLibraryModel.ts#refusedWrite` already classifies normalized reporting refusals. Its parameter formerly inferred `Awaited<ReturnType<typeof apiCall>>`; TypeScript selects the last overload, which now includes null. The existing function now explicitly accepts the canonical non-null `ApiResult<unknown>` type. There are no runtime branches, casts or global API changes in this reconciliation. [api-result-annotation.patch](api-result-annotation.patch) contains the exact two-line type/import diff.
- The earlier 32-file reporting integration and existing `apiCall.test.ts` supply the regression boundary. No additional product behavior or tests were introduced for this type-only change.

## Verified result

**335 tests passed across 33 files**, exit 0, in 76.46 seconds. This is the same 32 reporting files plus the existing 12 tests in `apiCall.test.ts`, including guarded handoffs and unchanged three-argument normalization. Counts overlap the earlier packet and are not pooled.

All **44** pinned changed-source, imported-helper and test-file hashes match before and after execution. The exact 33-file manifest excludes layout-capture instrumentation. Changed-file lint reports **0 errors** and the same **7 existing `Insights.tsx` warnings**, with zero warnings in every other changed/new file. `git diff --check` passed. This agent did not run a compiler/build or commit/push; those remain parent gates.

[command.json](command.json) records the exact test command, working directory, Node 22.22.0 toolchain, heap and file manifest. [before-source-pins.json](before-source-pins.json) and [after-source-pins.json](after-source-pins.json) pin the source, incoming API helper and tests separately from the original phase. Lossless gzip copies retain raw integration JSON/logs and scoped lint output; [artifact-manifest.json](artifact-manifest.json) records original and compressed SHA-256 values.

This remains fixture-backed client verification. It does not establish live hosted authentication, native database behavior, approved-model acceptance or global regulatory qualification.
