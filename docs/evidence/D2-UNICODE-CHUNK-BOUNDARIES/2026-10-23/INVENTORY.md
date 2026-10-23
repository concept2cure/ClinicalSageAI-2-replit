# Existing Vault Unicode chunk boundaries — D2 / W2

## What already exists

- `server/services/vault/document-chunking.service.ts` is the canonical deterministic paragraph/sentence/word-aware chunker and atomic, tenant-fenced chunk writer. Exact half-open UTF-16 offsets feed page attribution and citation checks. Hard ends and overlap starts can split a valid surrogate pair; UTF-8 transport then replaces the halves.
- The same service's `chunkDocumentForIngest` reaches Vault ingest; `server/services/vault/document-chunking-backfill.service.ts` invokes the same writer for backfill. Neither needs a parallel chunker.
- `server/services/vault/passage-context-span.ts` already checks exact chunk/source equality and safe context edges, then uses `server/services/ana/draft-source-identity.ts`. It correctly refuses previously corrupted chunks; it must keep refusing them.
- `server/services/ana/draft-project-sources.ts` already has a local inward start++/end-- source-window policy; `server/services/ana/builtin-template-reference.ts` already moves split text-part ends backward. `server/services/authoring/authoring-read-render.ts` already protects authoring windows. Neither is a reusable dependency-free boundary utility; importing their complete renderers into ingestion would add unrelated dependencies. The JavaScript codePointAt primitive identifies the pair at a cut without another boundary subsystem.
- Existing pure chunking, tenancy, backfill, page-offset, passage-context, passage-search and exact-source identity tests supply regression controls. New tests will call the actual chunker and actual writer, with PGlite for SQL/UTF-8 and existing identity checks.
- `read_project_document` lives in `server/services/ana/document-catalog-tools.ts`; generic `fitReadWindow` lives in `read-receipts.ts`. Split read-window spans are a separate reproduced follow-up because their rendered bounds and deferred receipt must agree. No change to read coverage is made here.

## Search evidence

Searches covered chunkExtractedText, chunkAndEmbedDocument, chunkDocumentForIngest, document_chunks, char_start/char_end, UTF-16, surrogate, codePointAt, split helpers, passage identities, read_project_document and fitReadWindow across services, routes, schema, migrations and client surfaces. All production chunk-writer consumers converge onto the canonical service. `git log --all --diff-filter=D -- '*document-chunk*' '*read*project*document*' '*passage*' '*surrogate*'` found only an unrelated deleted upstream browse test at 7df89f4f7, not a removed Vault correction. Prior `docs/evidence/D2-PASSAGE-CONTEXT/2026-10-19/README.md` explicitly records the open surrogate-split defect.

## Reproduction

With maxChars=500 and overlapChars=0, 499 ASCII characters followed by a valid supplementary character produce a first chunk ending on the high surrogate and a next chunk starting on the low surrogate. At maxChars=500/overlapChars=250, placing the pair at offset249 splits the next overlap start. The default 4000-character hard end reproduces with the Japanese supplementary character 𠮷 at offset3999. These strings are valid before chunking and fail exact UTF-8 round-trip afterwards.
