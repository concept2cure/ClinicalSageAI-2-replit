# D2 / W2 — bounded automatic PDF OCR with honest coverage

Date: 2026-10-18. Baseline: `cd00f5fe` (plus the docs-only follow-up).
Need: priority 4 of the
[remaining-needs assessment](../../../reports/data-room-research-2026-10-14/remaining-needs-2026-10-18.md):
"page/pixel/time budgets, honest partial-coverage receipts, … report
unprocessed pages explicitly."

No new surface, engine, model, schema or route. Coverage is written into the
existing `cre_evidence_sources.provenance` JSONB.

## Observed defects at baseline (measured; investigation by subagent)

1. `extractDocumentText` → `ocrService.ocrPdfToText(buffer)` passes **no
   page, pixel or time budget**. Every page is rasterized into memory before
   OCR starts (about 5.3 s per page measured here). A large scanned PDF blocks
   the upload request, or outlives the 15-minute processing lease and is
   discarded and retried.
2. `ocrPdfToText` forwards dpi, pages and region to the rasterizer, but
   **drops `maxPixels`** even though its option type accepts it. The rasterizer
   then has no cap: one 3000×3000 pt page added 715 MB.
3. **Partial coverage is invisible.** If OCR fails on a thin-text PDF, the
   capture is recorded as `extracted` from the thin text layer and the error is
   only logged. Nothing records how many pages were read.

## Interfaces (exact)

`server/services/ocr/pdfRasterizer.ts`
- `export const DEFAULT_MAX_PAGE_PIXELS = 40_000_000;`. `ana/page-render.ts`
  re-exports it as `MAX_PAGE_PIXELS` (same value, one definition).
- `export async function rasterizePdfDocument(data, options): Promise<{ numPages: number; pages: RasterizedPage[] }>`.
  `rasterizePdfPages` returns `(await rasterizePdfDocument(...)).pages`,
  unchanged.

`server/services/ocr/ocrService.ts`, `ocrPdfToText(data, options)`
- `options` also accepts `deadlineAt?: number` (epoch ms).
- It forwards `maxPixels: options?.maxPixels ?? DEFAULT_MAX_PAGE_PIXELS`.
- Before OCR of each page after the first, if `Date.now() >= deadlineAt`, it
  stops. At least one page is always attempted.
- `OcrPdfTextResult` gains `coverage: { pageCount: number; pagesSelected:
  number; pagesRead: number; limitedBy: 'page_budget' | 'time_budget' | null }`.
  - `pageCount` is the document's pages.
  - `pagesSelected` is the number of pages after the range and `maxPages`.
  - `pagesRead` is the number of pages OCR'd.
  - `limitedBy` is `'time_budget'` when `pagesRead < pagesSelected`, else
    `'page_budget'` when `maxPages` cut the selection, else `null`. An explicit
    caller range is a request, not a limit.

`server/services/ocr/extractDocumentText.ts`
- `export const AUTOMATIC_PDF_OCR_BUDGET = { maxPages: 100, maxDurationMs: 600_000 } as const;`.
  The automatic fallback calls
  `ocrPdfToText(buffer, { maxPages, deadlineAt: Date.now() + maxDurationMs })`.
- `export interface ExtractionCoverage { pageCount: number | null; pagesRead: number | null; limitedBy: 'page_budget' | 'time_budget' | 'ocr_failed' | null }`.
- `ExtractedDocumentText` gains `coverage?: ExtractionCoverage`:
  - **OCR result used** (`pdf-ocr`): `{ pageCount, pagesRead, limitedBy }` from
    OCR coverage.
  - **OCR threw, thin text layer returned** (`pdf-text`): `{ pageCount:
    pdf-parse pages or null, pagesRead: null, limitedBy: 'ocr_failed' }`. The
    scanned content was not read.
  - **OCR threw, no text at all** (`none`): the same coverage.
  - Text-layer PDFs with enough text, and non-PDF formats: no `coverage`
    (unchanged).

`server/services/clinical-regulatory-evidence/data-room-processing.ts`
- `ExtractedCapture` gains `coverage?: ExtractionCoverage`, copied from
  extraction. `pageCount` semantics are unchanged.
- `processingProvenance` writes `extractionCoverage` when coverage is present.
  The UPDATE strips any stale `extractionCoverage`, the same way it strips
  `extractionError`.
- `boundExtraction` accepts a well-formed `coverage` and rejects a malformed one.
- A capture with text whose `coverage.limitedBy` is not null completes with
  `reasonCode: 'EXTRACTION_PARTIAL'`. The upload, adopt and spreadsheet
  responses already pass `reasonCode` through. The stage record's `reasonCode`
  and `extraction_status` are unchanged: the sweep requires `null` for
  completed, and readers accept only extracted, reconciled or verified.

## Proof required

Fail-first against baseline bytes, then green with the same test bytes:
- the facade's default `maxPixels` and explicit override;
- the deadline stopping after page 1 with `time_budget`;
- `maxPages` truncation with `page_budget`, and an explicit range not counted
  as a limit;
- the fallback passing the budget;
- OCR failure recorded as `ocr_failed`;
- capture provenance carrying `extractionCoverage`, and `EXTRACTION_PARTIAL`;
- `boundExtraction` refusing malformed coverage.

The existing OCR, intake, recovery-PGlite and upload-durability suites still
pass. Scoped ESLint and the normal pre-push gate.

## Limits

One page's OCR cannot be interrupted, so the deadline is checked between
pages. The 100-page and 10-minute values are a judgment against the measured
5.3 s per page and the 15-minute lease, not a qualified throughput figure. The
upload route still extracts inside the request, now bounded. Pages beyond the
budget are reported, not queued for later OCR. Per-page confidence and page
spans are not newly persisted. Japanese OCR accuracy is unqualified.
`ocrmypdf` and the system `tesseract` binary are absent from this container.

## Amendment A — after the honest-state audit (2026-10-18)

The audit of `f6c84641` found that the budget and coverage were correct
inside the Data Room path but not honest end to end:

- **B1.** Coverage was dropped when OCR hit a budget but returned no more
  text than the thin layer.
- **B2.** The budget silently applied to every other `extractDocumentText`
  caller (Vault ingest, client memory, AnA `search_large_document` and
  `read_uploaded_document`). None of them reads coverage, and before this
  change they read every page.
- **B3.** The recovery CLI reported a partial read as `clean`.
- **B4.** No read model exposed coverage.
- **B5.** The upload response said `indexedWholeFile: true` for a partial
  read. No client rendered a partial read.

These interfaces replace the corresponding ones above:

- **Opt-in budget.** `extractDocumentText(buffer, mime, filename, options?:
  { pdfOcrBudget?: { maxPages: number; maxDurationMs: number } })`. Only with
  `pdfOcrBudget` does the fallback call `ocrPdfToText(buffer, { maxPages,
  deadlineAt })`. Without it, the call is `ocrPdfToText(buffer)` as at
  baseline. The facade's default pixel cap still applies, which lowers dpi
  only for oversized pages and drops no page. `extractCapture` passes
  `{ pdfOcrBudget: AUTOMATIC_PDF_OCR_BUDGET }`. The other callers are
  unchanged until they can report coverage.
- **Coverage whenever OCR ran,** for every caller (an additive field):
  - OCR text used: OCR coverage.
  - OCR ran but its text was not used: OCR coverage, including its
    `limitedBy` (B1).
  - OCR threw: `ocr_failed`, as before.
- **One vocabulary.** `ExtractionCoverage`, `EXTRACTION_COVERAGE_LIMITS`,
  `readExtractionCoverage` and `DATA_ROOM_RESULT_REASON_CODES` (the stage
  codes plus `EXTRACTION_PARTIAL`, result-only) live in
  `shared/data-room-processing-status.ts`. `extractDocumentText` re-exports
  the type, and `boundExtraction` uses the reader.
- **Retained text keeps its coverage.** When a re-read yields no text and the
  persisted text is kept, the previous `extractionCoverage` is kept with it.
  Otherwise it is replaced or removed.
- **Read model (B4).** The Data Room source shape gains
  `extractionCoverage: readExtractionCoverage(provenance.extractionCoverage)`.
- **Upload (B5).** The response gains `extractionCoverage` (or `null`), and
  `retrieval.indexedWholeFile` is false when coverage is limited.
- **CLI (B3).** Item reason codes are read against
  `DATA_ROOM_RESULT_REASON_CODES`. The report gains `partial` (items with
  `EXTRACTION_PARTIAL`), and `outcome` is `partial` when nothing is
  unresolved but something is partial.
- **Client (B5).** The ready-attachment label says how many of the
  document's pages OCR read when coverage is limited, and that scanned pages
  were not read when OCR failed.

Still not addressed: a duplicate adopt (`already_complete`) carries no
partial signal in its response, though the source listing shows coverage.
The other `extractDocumentText` callers remain unbounded.

## Amendment B — after the correctness review (2026-10-18)

The review confirmed B2 (resolved by Amendment A's opt-in budget). It also
found that every selected page was rasterized before OCR began, so the
deadline bounded neither rendering time nor memory: 100 noisy 300-dpi pages
took 125 s to rasterize and raised RSS by 2.27 GB. It also recommended
deleting the facade's copy of the page-selection count.

- `rasterizePdfDocument(data, options, visit?)`. With `visit: (page) =>
  Promise<'stop' | void>`, each selected page is rendered and handed to
  `visit` at once, in order, and not accumulated (`pages: []`). If `visit`
  returns `'stop'`, no further page is rendered. It returns `{ numPages,
  pagesRequested, pagesSelected, pages }`, where `pagesRequested` is the
  caller's range or list before `maxPages` and `pagesSelected` is after it.
  The selection logic lives only in the rasterizer.
- `ocrPdfToText` always passes `visit`: OCR the page, then return `'stop'`
  if the deadline has passed. Page 1 is always rendered and read. The deadline
  now bounds rendering too, and at most one page image is held at a time.
  Coverage semantics are unchanged.
- `pageDetails[]` gains `dpi`, the dpi actually rendered. The `ocr_pdf` tool
  reports each page's rendered dpi, because the default pixel cap can lower it
  below the requested dpi.
