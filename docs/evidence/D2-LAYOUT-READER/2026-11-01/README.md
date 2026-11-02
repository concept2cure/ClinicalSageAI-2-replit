# D2: Vault reads a PDF's tables cell by cell with the self-hosted layout reader (P-90), 2026-11-01

**Row:** D2, the launch catalog (Vault). **Package:** L1. **Decision:** P-90 (`docs/LAUNCH_DEFINITION_OF_DONE.md`).

The founder answered "Yes" to: *should the self-hosted Docling layout reader be enabled?* Vault ingestion now
reads a PDF with the reader when the deployment turns it on (`OSS_INGESTION_DOCLING_PRIMARY=true`). The reader
supplies reading order, headings and each table cell by cell. It stays off by default.

## What already exists

| Path | What it did | What it did not do |
|---|---|---|
| `server/integrations/docling/client.ts` `DoclingClient` | POSTed raw bytes to `${DOCLING_BASE_URL}/parse` and read `{ text, sections, confidence }`. | docling-serve has no `/parse` and returns no such shape, so against a real reader every call came back empty ("docling_unavailable"). Its default address, `localhost:8070`, is GROBID's port in this repository's `docker-compose.yml`. |
| `server/config/ossStackFeatureFlags.ts` `oss.ingestion.docling_primary` | A flag, off by default, read from `OSS_INGESTION_DOCLING_PRIMARY`. | — |
| `server/services/ingestion/parserFeatureFlags.ts` `resolveParserFeatureFlags` | Reads the flag. | Nothing called it, outside a test. |
| `server/services/documentIntelligence/intakePipeline.ts` | Tika, then OCRmyPDF, then Docling, then Unstructured. | Nothing calls it, outside a test. It is left as it is: its Docling step now works. |
| `server/services/ocr/extractDocumentText.ts` | The platform's one text extractor: pdf-parse, OCR recovery, mammoth, exceljs. Vault, AnA uploads and Shadow Review all use it. | It had no layout reader. A table came out as runs of numbers with no rows or columns. |
| `server/services/vault/document-section-structure.ts` `chunkTypeOf` | Classifies a chunk as `TABLE` when most of its lines are tab-separated cells, and names it by a "Table 14.2.1 …" caption. | — |
| `server/services/vault/vault-inline-extraction.ts`, `server/jobs/vaultProcessingSweep.ts` | Vault ingestion's two reads: the upload request (text layer, 10-second budget) and the sweep (OCR, budgeted). | — |

**Searches run:**
- "docling", "DOCLING_", "docling_primary", "layout", "table_cells", "LlamaParse", "unstructured" across `server/`,
  `shared/`, `client/`, the compose files, `terraform/` and `.env.example`;
- `git log --all --diff-filter=D -- '*docling*' '*layout*'`.

Nothing else reads layout.

## The change

1. **The client speaks docling-serve's v1 interface.** This is docling-serve's own documentation (`docs/usage.md`,
   `docs/configuration.md`) as served on 2026-11-01.
   - **The request.** `POST /v1/convert/file`, as a multipart form: `files`, `to_formats=json`,
     `image_export_mode=placeholder`, `do_ocr=false` (the platform's own OCR keeps its page budget),
     `do_table_structure=true`.
   - **The key.** `X-Api-Key` when the deployment set one.
   - **Failures.** A refused key, a failed conversion, an unreachable reader and a slow one are each a
     `DoclingReaderError` with its reason.
2. **The reading** (`layoutFromDoclingDocument`) walks the DoclingDocument's `body` in reading order:
   - Each heading stands on its own line.
   - Paragraphs are separated by a blank line.
   - A table is its caption, then one line per row, with its cells separated by a tab. That is the convention the
     Vault chunker already reads as a table.
   - Page headers, page footers and other furniture are left out.
   - Each page's span is built from where its blocks were placed and verified by `alignPageSpans`. A map that does
     not verify is not returned.
   - Each table's cells (row, column, spans, header flags) are returned with where the table stands in the text.
3. **Vault ingestion asks for it** (`extractDocumentText(…, { layout: true })`, from the upload request and the
   sweep).
   - **When it is used.** With the flag on, a PDF the reader reads is recorded as `pdf-layout`.
   - **When it fails.** If the reader cannot read the file, the PDF is read as before. The result says why
     (`layoutNotUsed`). The extractor logs it, and the sweep's chained `vault.document.extracted` row carries it. An
     unreachable reader is never a silent downgrade. The upload request's own record is not changed:
     `vault-ingest.service.ts` sits at the 500-line limit, and a PDF its budget leaves is read again by the sweep.
   - **Who never reaches it.** A chat upload and a Shadow Review do not ask, so they never reach the reader.
4. **The service.** `docker-compose.yml` defines `docling`, under the `ingestion` profile:
   - the CPU image, pinned by digest: `ghcr.io/docling-project/docling-serve-cpu:v1.37.0`, released 2026-10-13;
   - no host port, on the app's `c2c` network only;
   - its key from `DOCLING_API_KEY`;
   - remote services and external plugins off.

   The app's environment carries the flag (default `false`), the address (`http://docling:5001`) and the key.
   `.env.example` documents all three.

## What was not built

- **A hosted parser.** Text never goes to a third party, and none is admitted.
- **Production.** The flag stays off until a deployment turns it on and shows its reader running (P-90). Running the
  reader in the hosted Terraform stack is D1's to decide. Nothing in `terraform/` changes.
- **New storage.** No new table or column. The cell structure reaches retrieval through the text's rows and
  columns, which the existing chunker reads. The header flags are in the extraction result only.
- **Other formats.** Word and spreadsheet files stay with mammoth and exceljs.

## Proof

All red runs are from the same tests, against the code before this change.

- **The mapping, on real Docling output.** Two DoclingDocuments copied unchanged from Docling's own test data (MIT;
  `server/integrations/docling/__tests__/fixtures/README.md`).
  - **Five pages:** every page span verifies, and the eleven headings are the eleven sections, on their own pages.
  - **Three tables:** every cell's text stands in its own row's line, at its own column; each table's own span reads
    as a table (`chunkTypeOf` on that span; see the correction below for the chunker's real cuts); the header rows
    are marked; the page header is left out.
- **The transport** (`server/integrations/docling/__tests__/docling-client.test.ts`), against a stand-in that
  answers only what docling-serve's v1 file endpoint answers.
  - **The request:** the multipart form and its fields, the file part, the key header, and no header without a key.
  - **The failures:** each refusal and its reason.
  - **`parse()`:** returns the document's text.
- **The reach** (`server/services/ocr/__tests__/extractDocumentTextLayout.test.ts`). The PDF is a real PDF in this
  repository (`csrs/A0081186_Synopsis.pdf`), read by the real pdf-parse when the reader is not used.
  - With the flag on, the PDF is the reader's reading (`pdf-layout`), and each table's span reads as a table.
  - The upload request asks too.
  - A refusing or unreachable reader leaves pdf-parse's reading, and says why.
  - With the flag off, or for a caller that does not ask, nothing is sent.
- **One expectation changed on purpose.** `vault-inline-extraction.test.ts` now expects the upload request's options
  to be `{ ocr: false, layout: true }`.
- **Regression:** the 29 suites that use the extractor, the Vault ingest paths, the parser flags or the intake
  pipeline pass (500 tests). Two other suites fail the same way without this change:
  - `run-pdf.test.ts`: the reporting fonts are not in this container;
  - `founder-path-lineage.pglite.test.ts`: known before this session.
- **Red** (`red/without-p90.txt`). Before the change:
  - the old client met the stand-in's 404 at `/parse` and returned empty text;
  - the extractor never asked the reader.

## Flag off, Vault ingestion is byte-identical (`flag-off-identity/`)

The coordinating session asked for this: with `OSS_INGESTION_DOCLING_PRIMARY` off, which is the default, ingestion
must be exactly what it was.

**The run.** 40 PDFs in this repository (`pdfs.txt`, every tracked PDF under 3 MB) were each read twice: as the
sweep reads them (OCR budget, `layout: true`) and as the upload request reads them (`ocr: false`, `layout: true`).
Each read was done three ways:
- by `extractDocumentText.ts` as it was at `08debf4e0`, before these commits (`before-08debf4e0.json`);
- by the new code with the flag unset (`after-flag-unset.json`);
- by the new code with the flag `false` (`after-flag-false.json`).

**What was compared.** For each read: the method, the length, the SHA-256 of the text, the SHA-256 of the whole
result (text, method, page spans, coverage, every field) and the result's keys.

**Result.** 160 comparisons (40 files × 2 reads × 2 flag settings), 0 differences. 39 files were read as `pdf-text`
and one as `none`, as before.

**The check fails when it should** (`red-flag-true-reader-unreachable.json`). With the flag `true` and the reader
unreachable, all 10 reads of the first five files differ. The text is the same, because the fallback is the
platform's own extractor, but each result gains `layoutNotUsed`.

**The sweep's chained row.** `vault.document.extracted` adds `layoutDetails(read.extracted)`
(`server/jobs/vaultProcessingSweep.ts`). That returns `{}` unless the result carries `layout` or `layoutNotUsed`.
The results above are identical to before and carry neither, so with the flag off the row's details are the same
keys and values as before.

**How to run it.** The script is `identity.ts`, run from the repository root; its header gives the command.

## Correction, found in the running app (2026-11-02, `live/`)

**What was overstated.** The proof above showed that each table's own span reads as a table. It did not show that
the Vault chunker cuts there, and it does not: `chunkExtractedText` cuts by size, 4,000 characters at a paragraph
break. A table becomes a `TABLE` chunk only when a chunk happens to be mostly table.

**How it was found.** The app ran locally on a database provisioned from empty, with the reader turned on and
pointed at the docling-serve stand-in (`stand-in-requests.txt`). A real PDF from this repository was filed through
`POST /api/vault/ingest`.
- The catalog recorded `pdf-layout`, 1,660 characters: the reader's reading.
- But the three tables and the text around them became **one `TEXT` chunk** (`chunks-in-the-running-app.txt`, the
  first document).

**The fix** (`server/services/vault/document-chunking.service.ts`):
- `chunkExtractedText` takes the layout's table spans (`tableSpans`). It cuts at each table's edges, so every table
  starts and ends its own chunks.
- A table longer than a chunk is cut between rows, never inside a cell.
- Whitespace between runs joins the run before it, so every character is still in a chunk.
- Vault's upload request and its sweep pass `layout.tables`. The upload passes them on its existing call line;
  `vault-ingest.service.ts` sits at its line limit.

**After the fix, in the running app.** A second real PDF read the same way gives **seven chunks**. Three are
`TABLE` chunks whose spans are exactly the reader's tables (360–503, 1054–1119, 1160–1269), with `TEXT` chunks
between them (`chunks-in-the-running-app.txt`, the second document). The stand-in's log also shows the first PDF
sent a second time: Vault read it, then refused the bytes as a duplicate (409 `DUPLICATE_CONTENT`), as it should.

**Tests** (`server/services/vault/__tests__/document-chunking-tables.test.ts`).
- **Red first** (`red/tables-not-own-chunks.txt`): 3 of 5 fail.
  - The tables are not their own chunks.
  - A captioned table is not named by its caption.
  - A long table is cut mid-row.
- **The two controls passed** before and after: full coverage, and unchanged chunking without spans.
- **Green:** 5 of 5. The 38 existing chunking, section, Vault ingest and layout suites pass (503 tests).

**Flag off, chunks are unchanged** (`flag-off-identity/chunks-*.json`, `chunk-identity.ts`).
- **The check.** The texts of the same 40 PDFs, read with the flag off, were chunked by the chunker at `HEAD` before
  this change and by the new one. 209 chunks, 0 differences.
- **It fails when it should** (`red-chunks-with-injected-span.json`). With one table span injected into each text,
  39 of 39 non-empty texts differ. The 40th, `server/tests/fixtures/testdoc.pdf`, has no text, so no chunks either
  way.

**What the stand-in is and is not.** The real docling-serve image was not pulled here: its layers are served from a
host this environment's network refuses. Every reader answer in these runs came from the stand-in, which serves real
DoclingDocuments from Docling's own test data. What is proven is everything on the platform's side of the reader:
the request, the reading, the catalog, the chunks and the fallback. The reader itself is not proven.

**Chunks already stored still resolve** (`downstream-chunk-readers.txt`).
- **Nothing stored is rewritten.** The change rewrites no stored chunk: there is no migration and no re-chunking.
  Chunk ids, spans and citations of documents ingested before it are untouched. In the running app, the first
  document, ingested before the fix, still has its one chunk.
- **The backfill is unchanged.** It re-chunks through `chunkAndEmbedDocument` with no spans, so it chunks exactly as
  before.
- **The suites that read chunks pass:** 48 files and 587 tests, covering RAG retrieval, citation locators and
  section citations, passage search and its context spans, the citation engine, disposition, tenant scope and purge.

## Owed

- **A real reader.** Running the reader on a real study report, and reading the result in Vault's chunks. It was
  tried here on 2026-11-01:
  - GHCR answered: the tag list and the pinned digest were read from `ghcr.io`.
  - Docker ran.
  - The image's layers are served from `pkg-containers.githubusercontent.com`, which this environment's network
    policy refuses (403), as it refuses `quay.io` and `huggingface.co`.

  The stand-in answers with real Docling output, but it is not the reader. The first deployment that turns the flag
  on owes this run.
- **The hosted stack.** A task definition for the reader in the hosted stack (D1).
- **A test of the sweep's audit detail.** The sweep now asks for layout and writes `layout` / `layoutNotUsed` into
  its chained row (`vaultProcessingSweep.ts` `layoutDetails`). That is typechecked, but the sweep has no test
  harness, and none was built for this.
