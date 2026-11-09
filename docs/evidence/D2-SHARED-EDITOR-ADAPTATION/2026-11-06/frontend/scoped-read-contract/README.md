# Canonical scoped-list fixture compatibility

The latest canonical `useScopedDocuments` project read requires `success: true` and the exact `program_id` on each document row. The two stale Vault integration fixtures were correctly refused: **2 suites, 19 failed / 7 passed** before correction.

Only one response line in `workbenchFileToVault.test.tsx` and one in `workbenchProjectFiles.test.tsx` changed. Each now supplies the existing list envelope confirmation and recorded project ID. Every assertion and production guard remains unchanged. The focused GREEN passed **3 suites / 43 tests**, including the unchanged real source-document start flow.

All 13 selected production/test inputs stayed unchanged during GREEN. The only selected differences from RED are the two authorized fixture lines. Exact commands, hashes, patch and selected input manifests are recorded in `receipt.json`; the large RED log uses deterministic gzip with mtime zero.

The Sources-rail suite already passed unchanged in the other agent’s current cohort and was not repeated here. Standalone Vault/dialog/transport suites do not exercise this ordinary project list and were excluded. The results use synthetic HTTP/session records and do not establish backend durability, deployed acceptance or complete MDX scientific automation. RED and GREEN overlap; do not sum them as unique coverage.
