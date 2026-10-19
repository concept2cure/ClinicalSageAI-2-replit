# Retained report-pack client controls

W1 / D2, Reporting & analytics, `concept2cure-v2`, 2026-10-14. This bounded client implementation follows [the approved report-pack contract](../../../../../design/RETAINED_REPORT_PACK_PDF.md). Whole-tree release gates and publication belong to the control tower.

Bundle cards retain **Export manifest PDF** and add **Export reports PDF**. The manifest keeps its default GET URL and existing filename. Reports mode requests `/api/report-os/bundles/:id/export.pdf?content=reports` and uses `report-pack-<id-prefix>.pdf`. Both use the canonical download helper with the returned Blob; the client assembles no PDF and sends no finalization request.

The parent owns a Set of pending bundle IDs and a synchronous ref guard. Both controls disable during either export, duplicate clicks issue one request, a tab change retains the pending state, and a different bundle remains exportable. A successful download produces the existing success toast; backend refusals, transport errors and browser download refusals produce its error tone and release the pending guard. Existing `rl-card-run`, wrapping `rl-head-acts`, download icon and cream/terracotta theme tokens are reused. No stylesheet, icon, shell, catalog or persona change is included.

The descriptions distinguish the manifest index from retained report bodies and their recorded status, signature and seal facts. Exporting a pack does not finalize its reports.

## Verification

| Run | Outcome | Qualification |
| --- | --- | --- |
| Prospective external UI baseline | 9 failed, 1 passed; 30 existing cases intentionally skipped; 11.30 seconds | Only `/tmp` test/config files changed. The default manifest URL/filename control passed. The nine new behavior cases stopped at the absent reports action; they do not individually establish failing busy/error behavior. Four repository source hashes were unchanged before/after. |
| First canonical integration | 41 passed, 3 failed; 9.10 seconds | Three new assertions queried all status regions and collided with the existing sidebar live region. Assertions were scoped to the actual toast/card; production behavior required no correction. |
| Final canonical regression | 44 passed across 3 files, no failures or skips; 12.83 seconds | 30 original library cases, 10 retained-bundle export cases, 4 unchanged individual-run export cases. |
| Final scoped ESLint | 0 errors, 7 existing Insights warnings; 0 test warnings | The old source is independently checked by stdin under its canonical filename: 7 warnings. No warning count growth, baseline edit or suppression. |

The ten cases verify precise reports/default URLs and filenames, one returned Blob reaching the canonical download helper, success/error tone, no POST/finalization, same-frame duplicate suppression for both modes, separate-bundle availability, pending state after a tab change, a non-OK response, the actual API's typed thrown refusal, browser refusal, and transport failure/retry.

The thirty original library test bodies compare byte-identically with the prospective baseline. Their fixture definitions now live once in `_insights-library-fixture.tsx`; the ten new cases live in `insightsBundleExport.test.tsx`. Splitting the tests removes two new test-size lint warnings without relaxing the lint rules. The unchanged individual-run export suite remains part of final verification. [The inventory](test-inventory.json) records each passing case.

Canonical final test invocation under Node 22:

```sh
NODE_OPTIONS=--max-old-space-size=4096 node node_modules/vitest/vitest.mjs run --config vitest.config.ts client/src/concept2cure/v2/__tests__/insightsLibraryReachesBackend.test.tsx client/src/concept2cure/v2/__tests__/insightsBundleExport.test.tsx client/src/concept2cure/v2/__tests__/insightsExportProducesFile.test.tsx
```

Scoped ESLint covers the three owned production files, both library/export test files and their shared fixture. No compiler, index, commit or push operation was performed in this UI slice.

## Evidence boundary

[The manifest](source-and-artifact-manifest.json) pins ten source/dependency files and the artifacts. Each raw terminal log is preserved without loss in a deterministic gzip archive. The corresponding readable `.log` only removes terminal blank lines and retains the final newline; both raw and readable byte counts/digests are recorded, and decompression was verified. The prospective source proof is retained unchanged. Historical published evidence was not rewritten.

These tests use bounded API/download facades. The retained PDF bytes are represented by a test Blob; identity checks establish that the client passes that exact Blob through without constructing a replacement. This evidence does not establish native database admission, complete report content, seal coherence, exact-byte audit persistence, a real browser download, mobile rendering, PDF/A, scientific or clinical qualification, dossier completeness, agency readiness or deployment. Those require the backend/PDF/control-tower evidence. Source pins describe this freeze; later sequential reporting changes do not retroactively change these results.
