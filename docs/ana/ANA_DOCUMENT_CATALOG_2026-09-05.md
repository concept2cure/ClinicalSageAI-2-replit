# AnA Document Catalog — remember, consume, contextualize client files

**Date:** 2026-09-05
**Feature flag:** `ana.document_catalog` (FeatureToggleService, off by default, fails closed) · env override `ANA_DOCUMENT_CATALOG_FORCE_ON=true`
**Migration:** `migrations/20260905_document_catalog.sql` (in `C2C_MIGRATION_FILES`)

## The problem this closes

A client uploads a file into the project vault. Before this change:

- **AnA could not see the project folder.** No tool queried `vault.documents` —
  `list_vault_documents`/`read_vault_document` read `concept2cure_artifacts`, a
  different store. She could only reach files a user hand-attached to a single
  chat turn, so a file uploaded in one session was invisible in the next: never
  listed, never re-opened, never referenced.
- **Nothing ever comprehended the document.** Filing classification read the
  filename, the title, and the first 4,000 characters. There was no durable
  record of what a document *is*, what it is *for*, or the data inside it.
- **Nothing proved a real read.** An agent could sample one page and speak as
  if it had reviewed the file, and nothing stopped a "review" that was
  metadata-only. Scanned PDFs were OCRed at ingest, but a reader could still
  treat the file as an opaque image.
- **An extraction failure looked like an empty document** (`extracted_text`
  silently null).

## What exists now

### Two tables (`migrations/20260905_document_catalog.sql`)

- **`vault.document_catalog`** — one row per vault document, two tiers:
  - *Extraction tier*, written in the **same transaction** as the ingest
    (`server/routes/vault-ingest.ts`): method (`pdf-text`/`pdf-ocr`/`docx`/…),
    OCR confidence, char/word counts — or `catalog_status='extraction_failed'`
    with the recorded reason. An extraction failure is a row that says so,
    never an absent row rendering as "nothing here".
  - *Comprehension tier*, written by AnA only after a full read:
    `document_kind`, `purpose`, `summary`, `key_data` (JSONB — study IDs,
    dates, doses, endpoints, N's as stated in the text), plus a 1536-d
    embedding (`embedding_status` records `embedded`/`failed`/`skipped`
    honestly; the column itself exists only where pgvector does).
  - A re-upload with different bytes voids the old comprehension in the same
    upsert (content-hash keyed) — stale understanding is never carried onto
    new content.
- **`vault.document_read_receipts`** — every read records the exact character
  span served, keyed to the content hash it was served from.

### The read-coverage gate (`server/services/vault/document-catalog.service.ts`)

`catalog_project_document` is **refused** unless the union of read receipts
covers the *entire* extracted text — exact integer span arithmetic, not a
percentage heuristic. The refusal names the uncovered ranges so the agent
knows precisely what is left to read. This is the mechanism that makes "a
sampled page recorded as reviewed" impossible, and the tests exercise the
refusal first (`server/services/vault/__tests__/document-catalog.service.test.ts`).

### Three AnA tools (`server/services/ana/document-catalog-tools.ts`)

| Tool | What it does |
|---|---|
| `list_project_documents` | Enumerates the vault (program-scoped via `projects.regulatory_program_id`, else org-wide): filed location, catalog state per document. Uncataloged and extraction-failed files are labeled as exactly that. |
| `read_project_document` | Serves the extracted text in windows, records a receipt per window, reports coverage + remaining unread ranges. On extraction failure it says so with the recorded reason instead of returning empty text. |
| `catalog_project_document` | Writes the comprehension tier — refused below full coverage; embeds the record for semantic recall. |

Definitions are in `ALL_ANA_TOOLS_RAW` (registry-consistency suite holds
def ↔ handler parity); handlers registered via the inject-and-sibling pattern;
UI step labels in `agentic-loop.ts` `TOOL_LABELS`.

### Session recall (`server/services/ana-session-bootstrap.ts`)

Session bootstrap now includes **"Project files on record"**: up to 12 vault
documents with filed location and what each is for — or, honestly, "not yet
studied" / "extraction FAILED". This is what makes AnA open a session already
knowing the client's files exist, where each one is, and what it is for,
instead of rediscovering them by accident. Gated on the same flag; degrades to
nothing like every other bootstrap source.

## Fail-closed properties (each verified by a failing test first)

1. A partial read cannot be cataloged — the gate refuses and names the gaps.
2. Empty extraction is `extraction_failed` with a reason — never
   "extracted, 0 chars", never `complete` coverage.
3. Flag off / toggle store unreachable → feature off; tools answer with an
   explicit disabled message, never a simulated listing.
4. The migration is pinned to the durable applier and re-applies cleanly
   (`tests/schema-contract/document-catalog-migration.contract.test.ts`).

## Rollout

1. Deploy (migration applies via `deploy-migrate` / `apply-c2c-migrations`).
2. Enable per tenant: `FeatureToggleService.enableFeature('ana.document_catalog', <orgId>)`,
   or globally via the toggle row; `ANA_DOCUMENT_CATALOG_FORCE_ON=true` for dev.
3. New vault ingests write the extraction tier immediately; legacy documents
   are backfilled lazily on first `read_project_document`.

## Known gaps / next steps (deliberately out of scope here)

- **Chat-upload convergence:** files uploaded through chat (`file_uploads` /
  `cre_evidence_sources`) still have no join to `vault.documents`; the catalog
  covers the vault path. The Data Room's checksum join remains read-time only.
- **Vault chunk-level RAG:** `vectorization-worker.ts` is still unreferenced
  and reads a column that does not exist (`content_text` vs `extracted_text`);
  vault documents remain unchunked in the `'vault'` retrieval corpus. The
  catalog embedding gives document-level semantic recall in the meantime.
- **`vault.documents.page_count`** is still never populated at ingest
  (`pageCount` is declared and stays null); the catalog records char/word
  counts and carries `page_count` for when ingest starts supplying it.
- **Semantic retrieval over catalog embeddings** (query-time search across
  `document_catalog.embedding`) — the column is populated; a retrieval hook in
  `ragRouter` is the natural next slice.
