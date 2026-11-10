# Docling fixtures (P-90 tests)

Two DoclingDocuments that Docling itself produced, copied unchanged from Docling's test data. They let the
mapping in `../../client.ts` be tested on the reader's real output, not on a shape typed for the test.

| File here | Source in docling-project/docling at `07154cdc82500058ad9377bac92beed3de820458` | What it exercises |
|---|---|---|
| `multi_page.docling.json` | `tests/data/pdf/groundtruth/multi_page.json` | Five pages, eleven section headings, list items: reading order and page spans. |
| `masked_tables.docling.json` | `tests/data/pdf/groundtruth/table_misidentified_as_form.json` | Three tables with column-header rows, and a page header in the furniture layer. |

**Licence.** The Docling repository is MIT licensed ("Copyright The Docling Contributors"). The text of
`multi_page` is an essay written for Docling's tests. Docling's maintainers replaced the text of the
document behind `masked_tables` with `a` and `0` characters, so neither carries third-party content.

DoclingDocument schema version: 1.10.0 (`docling-core`).
