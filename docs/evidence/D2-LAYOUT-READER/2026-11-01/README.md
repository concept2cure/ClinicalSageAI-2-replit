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
  - **Three tables:** every cell's text stands in its own row's line, at its own column; every rendering is a
    `TABLE` chunk; the header rows are marked; the page header is left out.
- **The transport** (`server/integrations/docling/__tests__/docling-client.test.ts`), against a stand-in that
  answers only what docling-serve's v1 file endpoint answers.
  - **The request:** the multipart form and its fields, the file part, the key header, and no header without a key.
  - **The failures:** each refusal and its reason.
  - **`parse()`:** returns the document's text.
- **The reach** (`server/services/ocr/__tests__/extractDocumentTextLayout.test.ts`). The PDF is a real PDF in this
  repository (`csrs/A0081186_Synopsis.pdf`), read by the real pdf-parse when the reader is not used.
  - With the flag on, the PDF is the reader's reading (`pdf-layout`), and its tables are `TABLE` chunks.
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
