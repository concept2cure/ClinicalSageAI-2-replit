# Reporting bundle write recovery

W1 / D2, canonical base `df869f2815533a2fb6c5174b87a02c21c8a28e87`.

## What already exists

The existing `server/routes/report-os.ts#inTenantTransaction` already enlists every project copy and the chained audit event on one tenant-stamped connection. The existing bundle writer, current-access policies, subscription writer and `server/routes/__tests__/_report-os-route-harness.ts` remain authoritative. The prior helper could not distinguish an acknowledged rollback from lost COMMIT acknowledgement or cleanup failure. No second writer, schema, grant, report engine or automatic retry was added.

The transaction helper now records whether COMMIT was attempted and whether pre-COMMIT rollback was acknowledged. Bundle creation states `REPORT_BUNDLE_NOT_RECORDED` only after that acknowledged rollback, with `recordingOutcome: "not-recorded"` and `retryAllowed: true`. The pre-write size refusal carries the same metadata at HTTP 413. Lost COMMIT acknowledgement, failed rollback and cleanup failure after COMMIT produce HTTP 503 `REPORT_BUNDLE_OUTCOME_UNKNOWN`, `recordingOutcome: "unconfirmed"`, `retryAllowed: false` and safe check-Bundles copy. No positive receipt or bound SQL values accompany these failures. Suspect connections are released with an error for discard; a cleanup failure attempts discard again without replacing the original authorization or callback error. Read/export bundle errors gain no creation-outcome assertion.

## Observed checks

| Phase | Result | Vitest duration |
| --- | --- | --- |
| Original product RED | 17 passed, 5 assertion failures in one file | 17.24 s |
| First focused successor | 22 passed in one file | 20.03 s |
| Bounded integration | 151 passed in eight files | 59.90 s |
| Exact final report-pack test successor | 52 passed in one file | 18.14 s |

These overlapping phases are separate observations; their counts are not pooled. None contains skipped, pending or TODO cases. Integration and final-successor before/after selected source pins are identical within each run. Their process elapsed times, exact commands and phase-specific pins are in [checks.json](checks.json).

The meaningful RED contains actual SQL COMMIT-then-throw and post-COMMIT release failures: both retained two project copies and one enlisted audit marker while the old route falsely returned `REPORT_BUNDLE_NOT_RECORDED`. The other failures cover acknowledged audit rollback metadata, failed rollback falsely asserting absence and pre-write size metadata. Ordinary SQL success and all original cases passed during RED. [red-test-source.ts.gz](red-test-source.ts.gz) preserves the exact new tests for replay against the pinned original route.

The bounded integration includes bundle recording, audit recording, report-pack export, delivery recording, subscription access, subscription attribution, subscription lifecycle and subscription service. Two export cases additionally retain the precise current-access HTTP 403 when release fails, with either acknowledged or failed rollback. All other original success/refusal expectations remain intact. The harness was not changed.

After integration, two test-only lines were compacted to avoid adding a max-lines warning. [formatting-delta.json.gz](formatting-delta.json.gz) and [integration-report-pack-test-source.ts.gz](integration-report-pack-test-source.ts.gz) retain the exact earlier source. The final successor reran all 52 tests in that file. Scoped final lint reports zero errors and the existing five route warnings; both changed test files have zero warnings. No suppression or baseline increase was used.

## Evidence limits

PGlite executes the actual route/Drizzle inserts and SQL COMMIT/rollback. The existing chained-audit writer seam writes an enlisted SQL marker in this fixture. This demonstrates atomic SQL effects and real retained rows after lost acknowledgement; it does not establish cryptographic chain integration, native multi-connection PostgreSQL behavior, live provider acceptance or global regulatory qualification. Root performs integrated compiler/build/publication gates separately. The single-report PDF late-source revalidation gap remains outside this bounded change.

[archives.json](archives.json) records compressed and uncompressed hashes for every lossless raw log, JSON result, command, source manifest and replay source. Private originals remain under `/workspace/.codex-notes/reporting-library-recovery-20261023/backend`.

The [post-MDX Projects compatibility packet](post-mdx-project/README.md) records the separate incoming interface review and six-file successor check.
