# S3 (D2): the Data Room catalog describes the evidence, by rule and from the project's record

Plan: `docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md` §5. The rules follow §4: deterministic first, and a fact not found is left out, never guessed.

## Before

`cre_evidence_sources` has had product, indication, phase, application, agency, registry id and document date columns since the spine, and no Data Room writer filled one. Nothing said which study a document belonged to, or what data cut it reported. A CSV, a workbook or a define.xml was flat text.

## After

- **`catalog-facts.ts`**:
  - **The project's own record** supplies product, indication, phase, application type and number, and agency.
  - **Text rules, each requiring its label, recorded with the rule and offset** in `metadata.catalogEvidence`:
    - registry identifiers: NCT, EU CT / CTIS, EudraCT, ISRCTN, ANZCTR, jRCT, ChiCTR;
    - the protocol number;
    - a labelled document date;
    - the data cut-off, database lock or data lock point.
  - Dates are real calendar dates or nothing (31 February is declined).
  - **The study is the one study of this project** whose protocol or study id the document names. Two candidates are both named and neither is chosen, and another project's study is never considered.
- **`dataset-profile.ts`** profiles CSV, TSV, XLSX and define.xml. It records tables, column names and inferred types, row and column counts, and the CDISC standard and domain shown by the column signatures:
  - SDTM: STUDYID + DOMAIN + USUBJID, with the domain taken from the shared variable prefix;
  - ADaM: BDS and ADSL, from their required variables;
  - define.xml: ItemGroupDef Purpose and Domain.
  - **Structure only: no cell value is kept.** It is not a conformance check and not an `.xpt` reader; that is deferred to the founder, per §6.
- **The processing step records the facts**, filling a column only where it is empty (`recordSourceProcessing`). Upload, adopt and the spreadsheet edit all go through it.
- **`migrations/20261008d_cre_source_study_ref.sql`** adds `study_ref`, with a NOT VALID same-organization key to `cdisc_prm_studies (id, tenant_id)` (unique index added), ON DELETE SET NULL (study_ref). It is guarded and sits before the sweep, and has a preflight entry.
- **`GET /:id/sources`** returns `catalog`: study, registry id, protocol number, document date, data cut-off, product, and a dataset summary. The project page shows them as one line of facts per source.
- **Capacity:** one upload cap. A Data Room capture now takes 50 MB, as the Vault does (`CHAT_UPLOAD_MAX_BYTES`). The chat route's hand-written 25 MB multer limit now reads the constant.

## Evidence

| File | Shows |
|---|---|
| `01-red.txt` | `tests/db/data-room-catalog-facts.dbtest.ts` against HEAD, on a database without `20261008d`: all 6 fail. |
| `02-green-unit.txt` | 129 suites: the catalog-fact rules with a negative case each, the dataset profile (no value kept), the upload and chat routes, adopt and `/sources`, the upload cap, the project page, the same-organization key contracts and the walk. tsc 0; the ratchet and migration gates pass. |
| `03-green-real-postgres.txt` | PostgreSQL 16 under `RLS_ENFORCE=on` as `app_service`, migrated twice: 30 dbtest files, 224 tests. In the new suite: an adopted CSR inherits the project's facts, finds its NCT id, protocol, report date and data cut-off, and names its study; two candidate studies choose neither; the database refuses a foreign study (23503); deleting the study design detaches the source and keeps the capture; and an SDTM AE CSV is profiled with no subject value kept. |

## Not this slice's

- A page bound on OCR at upload is not done. Upload passes no `maxPages` to OCR; this needs the extractor to report a partial read honestly, and is listed for a later slice.
- `vault.documents` has no study key yet. The Data Room carries it, and the Vault copy will take it from the source it is filed from, in a later slice.
