# Bundle export session ownership

W1 / D2, Reporting & analytics, `concept2cure-v2`, 2026-10-14. This bounded follow-up protects both bundle PDF modes from a response that belongs to an earlier client session. The [prior 44-case UI evidence](../ui/README.md), source pins and raw logs remain unchanged. It follows the existing auth service's session read-guard contract; auth service source is unchanged.

An export captures `authService.captureSessionReadGuard()` before issuing its API request. The helper checks `sameRevision()` after the API response, after Blob or error-JSON reads, and in its catch path. An observed session change returns no result, performs no download and produces no success or error toast. The caller checks the same guard again after its await before firing the toast. Its existing `finally` always releases the pending bundle. A legitimate bearer refresh within the same session revision remains eligible to complete; credentials equality is deliberately not substituted for session ownership.

No styles, icons, shell or other reporting interaction changed. This scope changes only `Insights.tsx`, the dedicated bundle export suite and this new evidence folder. It does not add a platform-wide session-ownership claim or change individual-run export behavior.

## Red and green controls

| Run | Outcome | Meaning |
| --- | --- | --- |
| Prospective session baseline on unchanged export source | 9 failed, 2 passed; 10 prior bundle cases intentionally skipped; 4.98 seconds | Six delayed response cases downloaded a file after actual logout, organization adoption or replacement-account transition. A delayed Blob also downloaded after adoption. Delayed error JSON and transport rejection showed an old-session error toast. Both same-revision bearer refresh controls passed. |
| Final complete reporting regression | 55 passed in 3 files; no failures or skips; 20.59 seconds | All 44 prior cases plus 11 session controls pass. |
| Final scoped ESLint | 0 errors, 7 existing Insights warnings; 0 test warnings | No warning count growth, suppression or baseline edit. |

The session cases use the actual `authService` singleton and real revision transitions. Logout and organization adoption call the existing auth API client through a bounded fetch transport. Replacement-account setup uses its public `setToken` operation. The delayed response, Blob and transport rejection cases exercise the real production `apiRequest` function through deferred fetch/body promises. The error-JSON case supplies a deferred non-OK response directly to reach the export helper's error-body await. The two refresh controls invoke the real `refreshToken` operation through the bounded transport and verify that `sameRevision()` stays true while `credentialsCurrent()` becomes false. They verify the refresh operation, not the scheduling timer.

All cases wait for the pending controls to become available again before checking that no late download or toast occurred. Both default manifest and reports mode are covered after each of the three session transitions. The original ten bundle export case bodies remain byte-identical; only test cleanup scaffolding changed to release the singleton state and stubbed transport. The thirty library and four individual-run tests remain in the complete regression.

Canonical final test invocation under Node 22:

```sh
NODE_OPTIONS=--max-old-space-size=4096 node node_modules/vitest/vitest.mjs run --config vitest.config.ts client/src/concept2cure/v2/__tests__/insightsLibraryReachesBackend.test.tsx client/src/concept2cure/v2/__tests__/insightsBundleExport.test.tsx client/src/concept2cure/v2/__tests__/insightsExportProducesFile.test.tsx
```

Scoped lint covers the two owned files. No compiler, index, commit, push, provider or native-database operation was performed in this follow-up.

## Evidence boundary

[The manifest](source-and-artifact-manifest.json) pins eight relevant source/test files, the baseline source pins, [all 55 passing cases](test-inventory.json), and every prior UI evidence file without rewriting it. Its prior artifact hashes were revalidated against the original manifest. Each raw log is preserved losslessly as a deterministic gzip archive; readable logs only normalize terminal blank lines. Raw and readable byte counts and digests are recorded, and archive decompression was verified.

These are client ownership checks with bounded fetch responses and a download-helper spy. They do not establish native server access, complete PDF content, seal coherence, exact-byte audit persistence, a real browser download, production authentication, universal cancellation of other requests, scientific or clinical qualification, dossier completeness or deployment. The earlier export may still complete server-side; this change suppresses delivery and feedback in the changed client session. Whole-tree release checks and publication belong to the control tower. Source pins describe this freeze and remain historical when later sequential reporting work changes the source.
