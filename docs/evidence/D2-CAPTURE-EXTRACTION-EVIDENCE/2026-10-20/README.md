# Retain existing Data Room capture extraction evidence

D2 / W2, 2026-10-20. Baseline
`e79626c0849f0f8c2338b32f85d4bc69bccef8f5`; contract commit `d2920b45d`.
This completes evidence retention in the existing capture processing path.

## What already exists

- `server/services/ocr/extractDocumentText.ts` already returns verified page
  spans, actual aggregate OCR confidence, method and coverage. `page-offsets.ts`
  aligns extractor page text to exact UTF-16 coordinates. `ocrService.ts` has
  richer per-page detail; it is not widened by this increment.
- `server/services/clinical-regulatory-evidence/data-room-processing.ts`
  already budgets extraction, pins original bytes, reuses bound pre-extraction,
  classifies/describes captures and records derived text/provenance. Its
  `extractCapture` dropped spans and confidence, retaining only span count.
- The processor's state/store/sweep and processing authorization already fence
  tenant, original identity, current source, claim and lease. Its SQL CASE keeps
  prior readable text and coverage after a failed re-read. Those are preserved.
- `data-room-search.ts` already selects provenance; `evidence-spine.service.ts`
  preserves it through the source mapper. No schema or public page-citation UI
  is needed to retain the receipt in that existing source record.
- Existing OCR budget/coverage, processing recovery, timestamp/read-model and
  upload tests cover adjacent behavior. Japanese selection and neighboring
  passage contexts were already delivered. They are not rebuilt here.

The [contract](CONTRACT.md) records current-code, synonym, reader and deleted
history searches. There was no replacement capture receipt implementation to
reach. The work extends the existing processor and its provenance update.

## Completion

Readable fresh extraction retains a version-1 `extractionEvidence` receipt with
SHA-256 of original bytes, SHA-256 of the exact unnormalized extracted text and
the extraction method. Already-located page spans are detached and retained only
when their source page labels and UTF-16 bounds are valid, ordered and do not
split an astral character. Blank and nonconsecutive source pages remain valid.
Malformed maps are omitted, not repaired or inferred. Existing `pageCount`
semantics stay unchanged.

Only an actually reported finite 0–100 score on `pdf-ocr`/`image-ocr` is retained
as `ocrConfidence`, including zero. No default, rescaling, per-page score,
engine identity, scientific confidence or verification is invented. Ill-formed
UTF-16 receives no lossy UTF-8 receipt; existing text processing remains intact.

Cached receipts must match original hash, exact text hash, method, version and
valid optional metadata. Explicitly malformed receipts cause fresh extraction;
legacy bound caches with no receipt remain compatible. The processor snapshots
nested receipt/spans and coverage before admission awaits. Persistence validates
the receipt against the authorized claim's original SHA. Replacement text clears
stale receipts; a failed re-read that retains old text keeps its old receipt.
The receipt includes its own method, independent of legacy attempt metadata.

The receipt is descriptive data. Existing private processing authorization and
source/lease checks remain the write authority. It grants no approval, source-use
authority or permission to save generated content.

## Qualification

Three file-scoped test owners froze **84 tests: 63 expected failures and 21
passing controls** on unchanged production before root edited implementation.
`frozen-tests.json` binds their exact bytes. Each owner's directory retains
raw baseline output, exact command/environment, before/after input pins and
boundaries: `extractor/`, `persistence/`, `cache/`. Initial fixture/lint-only
diagnostics are retained separately, not substituted for final baseline runs.

The first normal pre-push compiler gate caught an unknown-typed receipt in the
unauthorized-write fixture. An explicit erased cast fixed that test boundary;
production and assertions were unchanged. `test-type-correction.json` binds the
original frozen and final test hashes and verifies identical emitted JavaScript.
`initial-*` records retain the first green run and refused hook honestly. The
final cohort and lint below were repeated after this annotation-only correction.
Historical initial manifests refer to the original paths in Git `7efdd69d4`;
the final manifests bind current paths/bytes.

Final Node 22.23.3, canonical `vitest.config.ts`, one worker, 4 GiB heap:

| Check | Result | Evidence |
| --- | --- | --- |
| Frozen suites plus existing budget, page-map, capture coverage, recovery, timestamps, source read model and upload suites | **274 tests, 11 suites passed** | `green-command.json`, `green-tests.txt`, `green-result.json` |
| Scoped ESLint on both production files and three new suites | **0 errors, 0 warnings**, no baseline growth | `lint-baseline.json`, `lint-final.json` |
| Independent contract, final identity/snapshot and SQL/projection reviews | No findings; final source hashes bound | `independent-review.json` |

Embedded PGlite exercises the actual processing claims/store/SQL. Synthetic
extractor, original-file loader and classification/profile boundaries avoid live
OCR engines, external databases and providers. Engineering Japanese/emoji cases
prove identity/coordinate behavior, not language recognition accuracy.

`source-input-pins.json` binds selected source/test/configuration inputs, not an
exhaustive dependency graph. `artifact-manifest.json` binds implementation
evidence. Normal hooks and whole-project TypeScript gate direct publication;
the publication supplement records the actual result and remote Git-byte checks.
Raw `.txt` output is byte-preserved. ESLint summaries explicitly omit duplicated
full-source fields and are not presented as raw logs.

## Remaining qualification

Per-page OCR confidence/engine persistence, multilingual OCR/semantic accuracy
with representative expert labels, and public page-citation presentation remain
separate needs. This increment establishes local receipt retention and existing
persistence behavior, not live deployment, scientific validity or agency acceptance.
