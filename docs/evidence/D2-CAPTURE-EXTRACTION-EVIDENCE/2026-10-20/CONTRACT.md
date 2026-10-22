# D2 / W2 — retain existing capture extraction evidence

Baseline: `e79626c0849f0f8c2338b32f85d4bc69bccef8f5`, 2026-10-20.
Root owns production and Git. Test owners have disjoint files. Work completes
the existing Data Room extraction/provenance path; no new product surface,
schema, provider, model, dependency or extraction engine.

## What already exists

- `server/services/ocr/extractDocumentText.ts` returns text/method, verified
  `pageSpans`, actual aggregate OCR confidence and OCR coverage. Its PDF path
  selects the better text layer or OCR result; no new extraction is needed.
- `server/services/ocr/page-offsets.ts` aligns actual extractor page text to
  half-open UTF-16 spans. `ocrService.ts` has richer per-page details that this
  first completion does not extend through the extractor.
- `server/services/clinical-regulatory-evidence/data-room-processing.ts`
  runs the canonical budgeted extraction, pins original bytes, validates cached
  pre-extraction, claims/revalidates processing authority and writes derived
  text and provenance. `extractCapture` currently drops spans and confidence,
  keeping only span count. `processingProvenance` stores method/words/coverage.
  `recordSourceProcessing` already distinguishes replacement text from a failed
  re-read that retains old text and its coverage. Extend that same CASE.
- The processing state/store/sweep modules and PGlite recovery/coverage suites
  already prove durable claims, source identity, tenant/lifecycle fencing,
  retries, partial coverage and failed-read text retention. Preserve them.
- `evidence-spine.service.ts` and `data-room-search.ts` already carry existing
  provenance JSON through source projections. This completion preserves evidence
  there; it introduces no page-citation UI or new source authority.
- Japanese window selection and exact neighboring passage contexts are delivered.
  Multilingual semantic/OCR accuracy still needs representative expert-labelled
  qualification. It is not established by retaining extractor metadata.

Root and auditors searched OCR/extraction/capture/page-span/confidence names,
services/routes/schema/readers/tools and evidence. Deleted-history searches found
old OCR Python/orphan routes and memory extraction, not a replacement capture
evidence path. Targeted deleted searches for capture-extraction-evidence,
data-room-processing and page-offsets found no removed replacement.

## Approved interface

`ExtractedCapture` gains optional `extractionEvidence` with this version-1 shape:

```ts
{
  version: 1;
  sourceSha256: string;
  extractedTextSha256: string;
  method: string;
  pageSpans?: Array<{ page: number; start: number; end: number }>;
  ocrConfidence?: number;
}
```

1. Fresh readable extraction returns a receipt bound to the original bytes and
   exact unnormalized extracted text (SHA-256 UTF-8). Ill-formed UTF-16 gets no
   receipt, avoiding lossy identities; extraction text behavior otherwise stays.
2. Preserve only already-returned spans: positive safe-integer, strictly
   increasing page numbers; safe-integer offsets within text; non-overlapping
   ordered `[start,end)` spans, including blank pages. Boundaries cannot split
   a surrogate pair. Empty/malformed page maps are omitted, never repaired or
   inferred. Valid spans are detached copies. No new page count semantics.
3. `ocrConfidence` is only the extractor-reported finite 0–100 value for
   `pdf-ocr` or `image-ocr`, including zero. Missing, malformed or non-OCR
   confidence is omitted. It is an aggregate engine score, not per-page,
   calibrated scientific confidence or verification. No invented engine identity.
4. A supplied cached receipt must match version, original hash, exact text hash,
   method and valid optional fields. Invalid receipts cause fresh extraction;
   legacy pre-extractions without receipts remain supported. Snapshot nested
   receipt/spans and coverage synchronously before asynchronous admission so
   caller mutation cannot change the value reused later.
5. Persist the receipt in existing `provenance.extractionEvidence` only for its
   matching text. Replacement text strips stale evidence before merging the new
   receipt (or no receipt for a legacy cached extraction). A failed re-read that
   keeps readable old text keeps its old receipt and rejects incoming evidence.
   Empty/failed extraction with no retained text has no receipt. Unrelated
   provenance and all original/claim/tenant/current-source guards stay intact.
6. No change to OCR budgets, coverage, `pageCount`, text normalization, scientific
   classification, source hashes, stage semantics or generated/saved authority.
   Pure validation helpers may live beside the existing processor; no second
   extraction implementation.

## Fail-first proof and release

Freeze test files/hashes and raw meaningful baseline failures before production
edits. Exercise actual `extractCapture`, actual processing SQL under embedded
PGlite, replacement/retention and cached extraction across deferred admission.
No missing-module/import false reds. Preserve negative source/claim controls and
no-evidence legacy compatibility. No live OCR engine, external database/provider.

Final Node22 canonical Vitest, one worker, 4 GiB heap; scoped ESLint without
warning/baseline growth; normal Git hooks and whole-project TypeScript 0.
Independent review, exact source/artifact bindings, ordinary canonical merges,
direct incremental pushes to `concept2cure-v2`, clean/local=remote verification.
Raw output remains byte-preserved. No PR, force push or hook bypass.
