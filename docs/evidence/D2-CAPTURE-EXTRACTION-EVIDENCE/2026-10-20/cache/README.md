# Cached capture extraction — frozen fail-first proof

## What already exists

`server/services/clinical-regulatory-evidence/data-room-processing.ts` already
verifies original bytes, checks a cached extraction's source checksum/revision,
supports legacy receipt absence and records processing through the real
claim/authorization store. Its initial cache copy and later reuse copy are
shallow; it does not yet validate the optional extraction receipt.

`data-room-processing-store.ts` already refuses foreign, superseded, unavailable
and changed sources, verifies the original upload relationship, and fences writes
by the live processing lease. These controls remain exercised here.

The existing `data-room-processing-recovery.fixture.ts` bootstraps the real
migrations and audit fixture into embedded PGlite. This suite extends that
fixture's cache trust and admission-race coverage; it does not replace the
processor or SQL. The parent `CONTRACT.md` records existing-code/deleted-history
searches and the exact optional receipt contract.

## Frozen baseline

Production baseline: `e79626c0849f0f8c2338b32f85d4bc69bccef8f5`.
Contract: `d2920b45d`. Node `v22.23.3`, canonical `vitest.config.ts`, one worker,
no parallel files, 4 GiB heap.

Final unchanged-production baseline: **22 failed, 5 passed, 27 total; exit 1**.
`baseline-command.json` records exact argv, environment overrides, timestamps,
and all eight test/production/fixture/configuration hashes before and after;
all hashes match. `baseline-red.txt` preserves unmodified combined output.

The intended failures are:

- Nineteen invalid supplied receipts are reused by the baseline instead of
  forcing fresh extraction: wrong original/text/method/version, invalid source
  page labels or coordinates, split UTF-16 surrogate pair, invalid OCR scores,
  empty map, malformed receipt shapes, and a non-OCR method claiming an OCR score.
- Three held-connection admission races expose the shallow snapshot: receipt,
  nested page spans and coverage can be changed by the caller after processing
  begins. Each expects reuse of the original detached cache, not a late fresh
  extraction or mutated metadata.

Five passing controls establish valid receipt reuse, legacy receipt absence,
foreign-tenant refusal, superseded-source refusal and verified-original refusal.
The latter three refuse before derived text can be written; a matching cached
receipt grants no source authority.

The suite invokes actual `processCapturedSource`, claim/revalidation and SQL
under embedded PGlite. Extractor, original-file access, classifier and dataset
profile boundaries are synthetic. It uses no live OCR engine, external
database/provider, compiler or Git mutation, and claims no OCR accuracy or
production deployment.

## Test hygiene

The first baseline also had 22 intended failures and 5 passing controls. Its
raw output and command are retained as `first-baseline-*`. Scoped lint then
found one warning for the bare `structuredClone` global; spelling it
`globalThis.structuredClone` preserves Node behavior and satisfies the existing
configuration. The final frozen baseline was rerun after that change.

Final scoped ESLint with `--max-warnings=0`: **exit 0, no warnings/errors**.
`frozen-test.json` binds final test bytes and counts. The test is frozen for
root's production implementation and final green qualification.
