# D4: spreadsheets were read to row 300, and a blank row or column hid the rest

**Row:** D4 (Validation package), the honest-state behaviour of document
extraction. **Workstream:** the AnA client-files lane. **Date:** 2026-09-24.
**Reach:** every `.xlsx` that enters the product through `extractDocumentText`:
Vault ingest (`vault.documents.extracted_text`, the catalog extraction tier,
the passage index), chat uploads, and AnA's `read_uploaded_document`,
`inspect_uploaded_document` and `search_large_document`. AnA's `read_spreadsheet` tool is also affected,
through `readWorksheet`. None of this is behind a toggle.

## The defects

**1. A 300-row cap, presented as the whole file.** `workbookToText` renders a
workbook as text, and it is the only text the pipeline keeps for an `.xlsx`. It
stopped at 300 rows per sheet (clamped to 2,000 even if a caller asked for
more). PDF, Word and CSV are all extracted in full. A 1,000-lot batch listing
was therefore stored, chunked and searched as its first 299 lots, and a search
for lot 0300 found nothing. The catalog records a document as `cataloged`
("AnA read 100% of the text", `migrations/20260905_document_catalog.sql`) once
AnA has been served every character of that text. So "read in full" was true of
the rendering and false of the file. The only trace of the cut was a line inside
the text, `… N more rows not shown (use read_spreadsheet …)`. That line names a
tool that reads chat uploads, not Vault documents.

**2. Counts used as positions.** Both `workbookToText` and `readWorksheet`
looped `1..ws.actualRowCount` and `1..ws.actualColumnCount`. In exceljs those
properties count the rows and columns that hold values
(`node_modules/exceljs/lib/doc/worksheet.js:321`, `:378`). They are not the
last row and last column. One blank spacer row under a header therefore cost the
sheet its last row, and one blank column between groups cost it its last column.
Real batch records and stability tables are laid out exactly like that. The test
fixture is a stability table with its impurity column after a blank column: the
column header and the T12 result were both missing from the extracted text.
`readWorksheet` also reported `truncated: false` at that point, so AnA was told
it had read to the end of the sheet while the last row could not be paged to.

## The fix

- `valueExtent(ws)` returns the row and column numbers of the last value. Every
  loop is now bounded by it, not by the counts.
- `workbookToText` renders every row that holds a value, across every column up
  to the last one. There is no cap, and the unused `maxRowsPerSheet` option is
  removed; its only caller passed `undefined`. Every consumer of the extracted
  text pages it (`read_uploaded_document`: `offset` / `max_chars`), searches it,
  or chunks it, so none places a whole workbook in a prompt.
- `readWorksheet` and `inspectWorkbook` still return the counts
  (`totalRows` / `rowCount` …), now documented as counts. They also return
  `lastRow` / `lastColumn`. `truncated` is `endRow < lastRow`. The
  `read_spreadsheet` description tells AnA to keep paging while `truncated` is
  true, and that a sheet with blank rows ends after `totalRows`.

## Evidence

| File | Result |
|---|---|
| `red/unit-spreadsheet.txt` | 5 failed, 12 passed. The failures: row 300 of a 1,000-row sheet is absent (the rendering ends at `L0299`), the column after a blank column is absent (`Impurity B %`), the pipeline's stored text lacks `L1000`, `readWorksheet` cannot reach row 4 of a sheet with a blank row 3, and a page ending at row 3 reports `truncated: false`. |
| `green/unit-spreadsheet.txt` | 49 passed: the spreadsheet service, the OCR and extraction suites, and `document-intake-tools`. The 12 cases that already passed still pass. |

Lint for the four changed files is unchanged against HEAD.

## Not done here

- **Documents already ingested keep their truncated text.** A Vault `.xlsx`
  admitted before this change has `extracted_text` cut at row 300, or missing
  its trailing row and column. Any catalog row or passage index built from that
  text inherits the same gap. Those rows can be found with `mime_type` =
  the xlsx type plus `extracted_text LIKE '%more rows not shown%'`, but that
  query finds only the row cap, not the gap loss. The honest repair is to
  re-extract from the stored bytes, which voids any comprehension through the
  catalog's hash-keyed staleness, and re-chunk. That is an operator job: it
  rewrites governed records, so it needs its own review. `ana.document_catalog`
  and `ana.vault_chunking` are off in every deployment, so no catalog or
  passage rows exist in production to inherit the gap.
- **No format has a size budget.** A pathological workbook (hundreds of
  thousands of rows) now extracts in full, just as a 2,000-page PDF always has.
  The 50 MB upload cap bounds the input. If a budget is wanted, it needs a
  `partial` extraction status that the catalog can record and the coverage gate
  honours. A silent cap is the defect removed here.
