# S1 (D2): AnA searches the Vault's passages with no AI key and no flag

Founder direction 2026-10-01, repeated 2026-10-08: *"Vault search should not depend on an OpenAI key or a Claude key or any key as AnA should have the capability to do that search on her own."* Plan: `docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md` §5.

## Before

Document-level search was already keyless (`docs/evidence/D2/2026-10-01-vault-search-no-key/`). Passage search was not.

- **The index was written only when both flags were on.** These are `ana.document_catalog` and `ana.vault_chunking`, and both are off by default in production (`vault-ingest.service.ts`).
- **An embedder that could not embed left zero chunks** and a `chunk_failed` row (`document-chunking.service.ts`), even though `vault.document_chunks` has a full-text index on `chunk_text`.
- **The vault retrieval arm embedded the query first** (`advancedRAGPipeline.ts` `searchVaultSimilar`) and threw with no provider.
- **`search_document_passages` refused outright** with the catalog flag off.

## After

- **Every ingest records the extraction tier and writes the passages.** `ana.vault_chunking` now decides only whether passages are also *embedded*, which means sent to the embedding provider.
- **Without an embedder, chunks are written with no vector, all or none.** A partial set of vectors is never kept. A provider's failure is stated on the ledger's `chunk_error` ("Not embedded: …"), so the backfill does not re-spend on it unless `retryFailed` is asked for.
- **When the query cannot be embedded, the vault arm answers from the text index** (`vaultLexicalArm`: any of the terms, `ts_rank_cd` normalised). The same applies when the database has no pgvector (42703/42883). Every such hit is marked `lexicalOnly`.
- **`search_document_passages` needs no flag.** It reports `ranking: 'text' | 'meaning_and_text'` and tells the model the search matched words, not meaning.
- **The backfill indexes legacy documents too.** That includes ones ingested with the catalog off, which have no catalog row; it records their extraction tier from the stored text first. When embedding is turned on, it re-indexes passages written without vectors.
- **The startup line and the empty-index note now state the new truth.**

## Evidence

| File | Shows |
|---|---|
| `01-red.txt` | `tests/db/vault-passage-search-keyless.dbtest.ts` against HEAD, with no provider and both flags at their production default. All 6 fail: no chunks, a null ledger, and the tool refuses. |
| `02-green-unit.txt` | 84 unit suites: chunking, passage tools and search, the RAG pipeline and filters, vault ingest, catalog gating, the startup line and the backfill. The one failure is `threads-program-list`, which fails identically at HEAD and is unrelated. tsc 0; the ratchet is net -1. |
| `03-green-real-postgres.txt` | PostgreSQL 16 with pgvector and `RLS_ENFORCE=on`, as `app_service`: every vault, chunk, passage, catalog and RAG dbtest passes (35 files, 299 tests), plus the founder-path walk (15/15). |

The tests updated to the new contract are `document-catalog-recall` (an embedding failure, and the backfill), `vault-chunking-off` and `document-chunking.tenancy`. Each says what changed and why.

## Not this slice's

`tests/db/retrieval-floor.dbtest.ts` (Lumen atoms, `searchHybrid`) fails 3 of 4 with a statement timeout on a freshly installed database, identically at HEAD and with this change.
