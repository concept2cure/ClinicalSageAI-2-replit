# Bundle export type fixtures

W1 / D2, Reporting & analytics, `concept2cure-v2`, 2026-10-14. The control tower's completed compiler run reported three TS2352 errors in the dedicated bundle export suite. Three intentionally partial Response doubles now cross their explicit test boundary with `as unknown as Response`, consistent with other partial doubles in these suites. They provide only the Blob or JSON read surface exercised by the relevant client path; no production cast, data decoder or access policy changes.

A source comparison verifies exactly those three type-only conversions and no other test change. Production `Insights.tsx` is byte-identical to this slice's baseline. The [earlier 55-case session proof](../ui-session-revision/README.md) and [original 44-case UI proof](../ui/README.md), including their source pins and raw logs, remain unchanged; 25 prior evidence files were verified.

The required single replay passed all **55 cases across 3 suites**, with no failures or skips, in **10.07 seconds**. Its passing case inventory matches the earlier session follow-up exactly. Scoped ESLint on the changed test file exited zero with no output, errors or warnings. No compiler was run in this fixture slice; the control tower owns the corrected whole-tree compilation and final verdict.

Canonical test invocation under Node 22:

```sh
NODE_OPTIONS=--max-old-space-size=4096 node node_modules/vitest/vitest.mjs run --config vitest.config.ts client/src/concept2cure/v2/__tests__/insightsLibraryReachesBackend.test.tsx client/src/concept2cure/v2/__tests__/insightsBundleExport.test.tsx client/src/concept2cure/v2/__tests__/insightsExportProducesFile.test.tsx
```

[The manifest](source-and-artifact-manifest.json) pins seven relevant files, the prior evidence snapshots, the baseline source pins, and [the same 55 cases](test-inventory.json). Raw test and empty lint stdout are retained losslessly in deterministic gzip archives. The readable test log only normalizes terminal blank lines; empty lint stdout remains empty. All byte counts/digests and archive round-trip checks are recorded. No index, commit, push, compiler, provider or native-database operation was performed.

This fixture-only follow-up adds no browser, server, regulatory or deployment qualification to the earlier evidence. Source pins identify this test freeze and remain historical after later sequential changes.
