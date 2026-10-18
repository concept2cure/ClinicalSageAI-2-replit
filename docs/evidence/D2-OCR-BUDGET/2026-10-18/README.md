# D2 / W2 — bounded automatic PDF OCR with honest coverage

Baseline: `c821b0a7b87c0615665f5220a1d8c13989567026`.
Contract: [CONTRACT.md](CONTRACT.md), including Amendments A and B, which
were written after two independent reviews. Need: priority 4 of the
[remaining-needs assessment](../../../reports/data-room-research-2026-10-14/remaining-needs-2026-10-18.md).

## What changed

| Before | After |
| --- | --- |
| A thin-text PDF was OCR'd with no page, pixel or time limit. Every page was rendered into memory before OCR began. | Data Room capture OCRs at most 100 pages within 10 minutes. Pages are rendered and read one at a time, so the deadline also bounds rendering and one page image is held at once. Every page is capped at 40 Mpx unless the caller sets its own cap. |
| A partial or failed OCR looked complete. | Every OCR attempt reports `coverage`: pages held, pages read, and `limitedBy` (`page_budget`, `time_budget`, `ocr_failed`, or `null`). |
| — | Captures record `provenance.extractionCoverage`. Retained text keeps the coverage it was read with. Partial captures complete with `reasonCode: EXTRACTION_PARTIAL`. |
| Upload said `indexedWholeFile: true` for a partial read. | The upload response carries `extractionCoverage`. `indexedWholeFile` is false when coverage is limited. |
| The recovery CLI called a partial read `clean`. | It reports `partial` and `outcome: 'partial'`. |
| No read model or UI showed coverage. | The Data Room source shape carries `extractionCoverage`. The upload chip says, for example, "text extracted via OCR from 12 of 40 pages", or "text layer only; scanned pages not read". |
| `ocr_pdf` reported only the requested dpi. | Each page reports the dpi actually rendered. |

The budget is **opt-in**. Vault ingest, client memory and AnA's
`search_large_document` / `read_uploaded_document` keep reading every page,
because they cannot yet report coverage. Capping them silently would hide
pages, which is the exact defect this change exists to prevent.

## How it was built and checked

Five subagents worked in parallel. All commits and pushes were made by one
session to `concept2cure-v2`, with no worktree and no branch.

1. **Investigation (read-only).** Traced the call chain and measured the
   defects: about 5.3 s per page of OCR, and +715 MB for one uncapped
   oversized page.
2. **Independent test author.** Wrote the tests from the contract alone,
   without the implementation. It ran them in a pristine `git archive`
   export of the baseline: not a worktree, and with `node_modules` linked.
   It updated them for each amendment.
3. **Honest-state audit (read-only).** Found the gaps B1–B5 in
   `f6c84641` (Amendment A).
4. **Correctness review (read-only).** Fuzzed the page-selection counts
   (1,500 cases, 0 mismatches) and measured rasterization cost
   (Amendment B).
5. **Client change.** The upload chip, with red-then-green tests and the
   microcopy and design gates run.

## Evidence files

- `initial-red.txt`: the final test bytes (`frozen-tests.sha256`, four
  files) against baseline production bytes. **99 tests: 85 intended failures,
  14 labelled controls passing.**
- `final-green.txt`: **357 tests in 16 suites pass.** These are the four new
  or updated suites plus the existing intake, page-offset, live OCR,
  native-canvas, rasterizer honesty, capture-recovery PGlite, recovery CLI,
  upload durability and three client suites. Command: `test-command.json`.
  The client subagent also ran `composerAttachWorks` and
  `conversationRailTwins` green.
- `live-probe.mts` → `live-probe.steps.jsonl` (`live-probe.raw.jsonl` is the
  full log). On the real pdfjs and WASM Tesseract engine, with a 3-page scan:
  - no budget: 3 of 3 pages read;
  - a 2-page budget: 2 of 3, `page_budget`;
  - a passed deadline: 1 of 3, `time_budget`, and the rasterizer's own log
    shows **1 page rendered**, not 3;
  - capture: coverage carried through.

  Importing the processor opens the application's database pool, but the
  probe performs no database query.
- `lint.json` / `lint-comparison.txt`: zero errors, and no warning increase
  in any file. Two complexity warnings raised during the work were removed by
  extracting `ocrScannedPdf` and `optionalCoverage`, not by suppression.
- `sql-interpolation-before-baseline.txt` / `-after-baseline.txt`: the
  first push was refused by `ci:sql-interpolation`. The retained-coverage
  guard adds a fifth `${persistedTextAvailableSql()}` to the processing
  UPDATE, where the baseline allowed four. That function takes no argument
  and returns fixed SQL, and the same statement already interpolates it four
  times; no value enters the SQL text. Per the gate's documented route, this
  file's baseline is raised from 4 to 5 in the same change, with the reason.
  Computing the predicate once through a CTE or join was rejected: it would
  read state apart from the locked target row inside a lease-guarded write.
- The existing recovery test pinned the extractor's exact arguments. It now
  also expects the Data Room budget, the intended contract change.

## Limits

- One page's recognition cannot be interrupted. The deadline is checked
  between pages.
- 100 pages and 10 minutes are a judgment against the measured throughput and
  the 15-minute lease, not a qualified figure.
- Pages beyond the budget are reported, not queued for later OCR.
- A duplicate adopt (`already_complete`) carries no partial signal in its
  response; the source listing shows coverage.
- `page_count` still counts aligned page spans; the document's page count is
  in `extractionCoverage.pageCount`.
- The other `extractDocumentText` callers remain unbounded until they can
  report coverage.
- A PDF with 200 or more characters of text layer still skips OCR.
  Mixed scans are a pre-existing gap.
- Japanese OCR accuracy is unqualified. `ocrmypdf` and the system
  `tesseract` binary are absent from this container.
- This is not deployment, performance qualification or validation.
