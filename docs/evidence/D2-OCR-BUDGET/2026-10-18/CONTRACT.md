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
