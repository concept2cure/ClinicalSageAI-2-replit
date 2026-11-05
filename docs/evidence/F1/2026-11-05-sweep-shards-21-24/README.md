# F1 sweep: unit shards 21–24 of 24 (2026-11-05)

Command: `npx vitest run --config vitest.config.ts --shard=N/24 --maxWorkers=2 --reporter=dot`
(`*.dbtest.ts` are excluded by `vitest.config.ts`). Every log was searched for `heap out of memory` and
`Worker exited unexpectedly`; there were none in any run. The failures before any fix are in [FAILURES.md](FAILURES.md).

## What already exists

Session_011Dpx…'s local sweep had already fixed the shard 21–24 failures it saw. They are on trunk:
- `35ea145e`: unreferenced-modules count;
- `d3fc295d`: draft region;
- `09cd9ac2`: prose-as-SQL parser;
- `c23e3f25`: E3 builtin snapshot;
- `c97f4d09`: Vault sponsor column.

This sweep ran on trunk `51502476`, which already had those fixes, and fixed only what was still red.

## Totals

| Shard | Before (`51502476`) | After |
|---|---|---|
| 21 | 251 files passed, 1 skipped; 3608 tests passed, 4 skipped | unchanged, green |
| 22 | 252 files passed; 3516 tests passed | unchanged, green |
| 23 | 1 file failed; 4 tests failed, 3040 passed; 1 unhandled error (exit 1) | 252 files passed; 3044 tests passed; 0 errors |
| 24 | 252 files passed; 3216 tests passed, 1 skipped | unchanged, green |

The skips are `.skip` markers that were already in the files. This sweep added none.

## Causes

1. **`server/startup/__tests__/shutdown-ana-runs.test.ts`: the unhandled `process.exit unexpectedly called with "0"`.**
   This was a **test defect; the product is right.**
   - The INF-41 deadline case started `gracefulShutdown` with `void` and returned. `afterEach` then restored the
     real `process.exit`.
   - The shutdown then ran on to `process.exit(0)` (`server/startup/shutdown.ts:157`), which is correct after the
     drain, and vitest's guard caught the call.
   - The case now awaits the exit while the spy is still installed, as the first case already does.
   - Fixed in commit `f7247df1`. The shallow clone's history does not reach the commit that added the case, so
     that commit is not cited.
   - Red before: shard 23 exited 1 with the unhandled error. Green after: the file passes 2/2 with 0 errors, and
     shard 23 passes in full.
   - ESLint on the file: 0 warnings, both at HEAD and after the change.

2. **`server/services/report-os/pdf/__tests__/bundle-pdf.test.ts`: 4 cases with `REPORT_PDF_FONTS_UNAVAILABLE`.**
   The cause was **this container, not the code.**
   - `server/services/report-os/pdf/writer.ts:117` refuses to export when the Noto fonts are missing. That
     refusal is fail-closed and was not changed.
   - CI's test jobs install `fonts-noto-core fonts-noto-cjk` (`.github/workflows/ci.yml:1266`, `:1422`, `:1653`),
     and so does the production image (`Dockerfile.optimized:83`). This cloud container did not have them.
   - With those packages installed, all 4 cases pass, and the PDF suites pass 38/38.
   - There was no commit: nothing in the repository was wrong.

## Left

Nothing in shards 21–24. Note for anyone running these suites locally: without `fonts-noto-core` and
`fonts-noto-cjk`, the report PDF suites fail by design.
