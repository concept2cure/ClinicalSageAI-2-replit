# Shards 21–24 of 24: failures before any fix

Trunk `51502476` (2026-11-05), recorded before any fix in this sweep.
Command: `npx vitest run --config vitest.config.ts --shard=N/24 --maxWorkers=2 --reporter=dot`.
Every log was also searched for `heap out of memory` and `Worker exited unexpectedly`: none in any shard.

| Shard | Files | Tests | Result |
|---|---|---|---|
| 21 | 251 passed, 1 skipped (252) | 3608 passed, 4 skipped (3612) | green |
| 22 | 252 passed (252) | 3516 passed (3516) | green |
| 23 | 1 failed, 251 passed (252) | 4 failed, 3040 passed (3044); 1 unhandled error | **red** |
| 24 | 252 passed (252) | 3216 passed, 1 skipped (3217) | green |

The skips are `it.skip`/`describe.skip` already in the files. This sweep added none.

## Shard 23

### `server/services/report-os/pdf/__tests__/bundle-pdf.test.ts`: 4 cases

- `buildBundlePdf > states each report's status now beside what it was bundled at, and how many are final`
- `buildBundlePdf > labels the bundle's time as when it was bundled, never as generated, and names who bundled it`
- `buildBundlePdf > lists every report, onto further pages, with the export on every page`
- `buildBundlePdf > a report that can no longer be read says so`

All four fail with `Reporting PDF fonts are unavailable on this deployment. Nothing was exported.`, thrown at
`server/services/report-os/pdf/writer.ts:117`.

### Unhandled error, attributed to `server/startup/__tests__/shutdown-ana-runs.test.ts`

`Error: process.exit unexpectedly called with "0"` at `server/startup/shutdown.ts:157` (`gracefulShutdown`).
The file's own cases pass, but the run exits 1 because of this error.
