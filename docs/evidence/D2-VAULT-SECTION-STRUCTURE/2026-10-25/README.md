# Vault passages carry their section — D2 (launch catalog, Vault)

A statistic in a table stays mapped to its narrative block. Each chunk the Vault
writes now stores the section it starts in (`section_title`), the path of
numbered sections above it (`section_hierarchy`), and whether it is a table
(`chunk_type`). A retrieved passage reaches the RAG reader with its section
title, and its locator keeps the page beside it: `p.2 · 11.4.1 Primary Efficacy
Endpoint`.

## What already existed

- The three columns, since the table was created
  (`migrations/20260905b_vault_document_chunks.sql`): `chunk_type TEXT NOT NULL
  DEFAULT 'TEXT'`, `section_title TEXT`, `section_hierarchy TEXT[]`. The
  column's vocabulary is documented in
  `db/migrations/_legacy/042_gcc_evidence_vault.sql` (TEXT, TABLE, FIGURE,
  HEADING). The writer's INSERT (`server/services/vault/document-chunking.service.ts`)
  named none of them, so every chunk was `'TEXT'` with a NULL section.
- The reader. `server/services/advancedRAGPipeline.ts` already selects
  `section_title` in the dense and lexical vault arms and maps it to
  `sectionTitle` and the locator. It was always NULL.
- `parseHeading` (`server/import/docx-to-authoring.ts`), the section-code
  grammar the Word import files sections under ("3.2.S", "2.7.3"). The new
  detector uses it to split a number from its title. It does not duplicate it.
- Two looser line detectors for AnA's outline and search tools:
  `detectHeading` in `server/services/document-analysis.ts` and
  `extractHeadingOutline` in `server/services/ana/document-search-core.ts`. They
  are not reused here. They accept any numbered line up to 118–120 characters,
  ALL-CAPS lines and table rows such as `45 (23.1%)`, and they do not recognise
  lettered CTD numbers or captions. Every false heading would relabel all the
  stored passages after it. They are outside this slice and unchanged (see
  "Not done").
- `git log --all --diff-filter=D` shows no earlier detector of this kind in
  the repository.

## What changed

- **New:** `server/services/vault/document-section-structure.ts`. This is a pure,
  deterministic detector.
  - **Section heading:** a section number at the start of a line, followed by
    a title. The number is digits and dots, with capital-letter CTD segments
    (`2.7.3`, `3.2.S.4.2`, `3.2.P.5.1`, `11.4.1`). Its depth is its number of
    segments. The title must:
    - start with a capital letter;
    - not end in `. , ; : ! ?`;
    - contain no tab (a tab means table cells);
    - have no dot leader;
    - not be half numbers.

    The whole line is at most 120 characters. A one-segment number (`1.`,
    `9`) also needs a title-cased title. `1)` and `1:` are list markers.
  - **Caption:** `Table 14.2.1 …`, `Figure 3: …`, or `Table 11-3` alone, on
    a line of at most 160 characters.
  - **Contents list:** three or more heading lines with only blank lines or
    bare page numbers between them are a table of contents. They are dropped
    unless each line is a subsection of the one before it. A repeated number
    ends the run.
  - **Offsets and pages:** every heading has its exact span, and its page
    when the page spans are verified.
- **Per chunk:**
  - `section_hierarchy` is the numbered path at the chunk's first character.
    Ancestors are found by number, not by depth.
  - `chunk_type` is `'TABLE'` when tab-separated rows (at least two, of two
    or more cells each) hold at least half the chunk's non-blank characters.
    Otherwise it is `'TEXT'`.
  - `section_title` is the last entry of the path. The exception is a TABLE
    chunk whose nearest heading is a table caption: the caption names it, and
    the caption is appended to the path.
  - A caption never names a TEXT chunk, because the text does not say where
    a table ends. A figure caption names nothing.
  - With no heading, the title and path are NULL.
- `document-chunking.service.ts`: the INSERT writes the three columns as
  `$10`–`$12::text[]`. The vector moves from `$10` to `$13`.
- `advancedRAGPipeline.ts` `buildLocator`: the locator shows the page and the
  section together. Before, the section replaced the page. This also changes
  the `rag_chunks` locator wherever both are recorded.
- Fixtures: the minimal PGlite chunk tables in
  `document-chunking-unicode-storage.test.ts` and
  `document-chunking-backfill-source-basis.pglite.integration.test.ts` gain the
  three columns, in the migration's types.

## Evidence

- `red/vitest-red-unchanged-source.txt`: the three new test files run against
  unchanged source. Four tests fail on the stored values (sections NULL, type
  `TEXT`, sectionTitle NULL). The detector file cannot import a module that
  does not exist yet. Two controls pass.
- `red/vitest-red-locator-drops-page.txt`: the run with the writer fixed and
  `buildLocator` not yet changed. The section arrives, and the locator becomes
  `11.4.1 Primary Efficacy Endpoint` with the page gone.
- `red/mutations.txt`: nine rules weakened one at a time, each showing the test
  that fails. The first tab-rule mutation survived (62/62), because every row
  case was also caught by the numbers rule. Two rows made of words were added,
  and the rerun fails 2.
- `green-summary.txt`: 70/70 new tests. The second run is 208/208 across 20
  files: 204 tests in 19 existing suites (writer, backfill, Unicode, tenancy,
  vault reader, passage tools, `parseHeading`), plus the new writer test, which
  its glob also matched. eslint, tsc and CI-gate results are recorded there.

The writer test creates `vault.document_chunks` by executing the real migration
(twice). The citation test runs the real writer, then the real lexical SQL.
Both run on PGlite as owner, with no native RLS and no embeddings. No real
PostgreSQL server was running locally, so `tests/db/vault-passage-search.dbtest.ts`
was neither extended nor run.

## Not done, and why

- **No backfill.** Chunks written before this change keep NULL sections. A
  document is re-chunked only when it is ingested again (`vault-ingest.service.ts`
  → `chunkDocumentForIngest`), or when `scripts/backfill-vault-chunks.mjs` /
  `backfillVaultChunksForTenant` selects it. The backfill selects only:
  - documents never chunked;
  - failed documents, with `--retry-failed`;
  - documents chunked without vectors, once the tenant's embedding is on.

  A document already chunked is not selected otherwise. A re-chunk-all option
  is a separate change.
- **No reader for `section_hierarchy` or `chunk_type`.** The reader carries
  only `section_title`. Adding the path would mean changing the reader's
  strict row decoder.
- **Headings it misses (they read as the previous section):**
  - unnumbered headings: "Introduction", ALL-CAPS lines, and the spreadsheet
    renderer's `## Sheet:` lines;
  - Word automatic numbering, which mammoth's raw text drops;
  - a number and title split onto two lines;
  - TOC entries without dot leaders that do not form a run.

  These are left out because a looser rule mislabels everything after a false
  hit.
- **DOCX tables.** Mammoth raw text has no tabs, so they are never `TABLE`.
- **Out of slice, should follow.** `document-analysis.ts` `detectHeading` and
  `document-search-core.ts` `extractHeadingOutline` are parallel heading
  detectors. Under "zero duplication" they should move onto
  `detectHeadingLine`. Those are AnA tool files, and this session did not
  edit them.
