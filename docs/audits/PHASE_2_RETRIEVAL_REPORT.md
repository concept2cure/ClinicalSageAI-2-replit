# Phase 2 — Converge Retrieval to One Active Path

**Branch:** `concept2cure-v2`
**Date:** 2026-04-22
**Status:** Complete.

## Goal

Make `server/services/enhancedEmbeddingService.ts` plus the
`lumen_data_atoms` hybrid search path the single canonical retrieval layer
in production. Deal with the two named legacy retrieval files by deleting,
quarantining, or hard-blocking them.

## What actually happened

After a full caller inventory across the repo, the entire legacy retrieval
chain turned out to be **transitively dead**. There were no live consumers
anywhere — neither in production code, nor in `package.json` scripts, nor in
CI, nor dynamically imported. The legacy pgvector queries also targeted
tables (`study_document` and unqualified `document_chunks`) that don't exist
in the current schema, so the files would have errored out had anything
called them.

Given the work order's explicit instruction "remove them if unused", the
chain was deleted rather than quarantined under `server/legacy/`. A
quarantine directory for files nothing imports would have added ceremony
without adding safety.

## Files deleted (8)

| File | Reason |
| --- | --- |
| `server/services/semanticSearch.js` | Named legacy retrieval surface. Queries a `study_document` table that doesn't exist in the Drizzle schema. Only callers were two dead pipeline scripts. |
| `server/brain/vaultRetriever.js` | Named legacy retrieval surface. Queries bare `document_chunks` (the real table is `vault.document_chunks`). Only production caller was `draftGenerator.js`, itself dead. |
| `server/brain/draftGenerator.js` | Transitively dead. Zero external callers anywhere in the repo. |
| `server/brain/vaultIndexer.js` | Orphan indexer. Zero references anywhere in the repo. |
| `server/brain/embeddings.json` | Static data file for the deleted indexer chain. |
| `server/pipelines/bulk_import.js` | Pipeline for nonexistent `study_document` table. Not referenced in `package.json`, CI, or any runtime caller. |
| `server/pipelines/indexDocs.js` | Same as `bulk_import.js`. |
| `server/test-retrieve-api.js` | Ad-hoc test script for `vaultRetriever`. Zero references. |

Orphan directories `server/brain/` and `server/pipelines/` were removed by
git as a result of the deletions above.

## Files modified

| File | Change |
| --- | --- |
| `server/prisma/client.js` | Updated header + two interior comments that incorrectly advertised "used by semanticSearch.js / bulk_import.js". The `study_document` and `$queryRaw` stubs on the default export are no-ops and stay as-is (they log warnings and do no harm) — this whole module has zero current consumers and is flagged below as an orphan for a future cleanup pass. |

## Caller-inventory evidence

The following non-trivial verification was performed before deletion:

1. **Static import search:** `grep -rn` across `server/`, `client/`, `tests/`, `scripts/` for `draftGenerator`, `vaultRetriever`, `semanticSearch.js`, `bulk_import`, `indexDocs`, `test-retrieve-api` — zero matches outside the files themselves.
2. **Dynamic import search:** regex search for `import\(['\"]...<name>` — zero matches.
3. **String reference search:** matched bare filenames in all source + JSON — only hits were two self-referential comments in `server/prisma/client.js`, which were updated.
4. **Package manifest / CI search:** `bulk_import` / `indexDocs` — zero hits in `package.json` or any CI config.
5. **Transitive chain:** once `draftGenerator.js` was shown to have zero consumers, the call to `vaultRetriever.retrieveContext` from `draftGenerator.js` ceased to be live. Same for `bulk_import → semanticSearch`, `indexDocs → semanticSearch`, `test-retrieve-api → vaultRetriever`.

## Canonical retrieval path — now documented

See [`RETRIEVAL_ENTRYPOINTS.md`](RETRIEVAL_ENTRYPOINTS.md) for the authoritative
surface-by-surface table. Summary:

- **Canonical:** `enhancedEmbeddingService.ts` + `advancedRAGPipeline.ts` (both hit `lumen_data_atoms` / canonical path)
- **Parallel (own architecture, not legacy):** OpenSearch stack; `semanticEmbeddingService.js` over `documentVectors`; in-memory academic search; in-memory conversation-os fallback; `client-intelligence-memory` semantic helpers (which themselves route through canonical).

## Behavior preserved

- No changes to `enhancedEmbeddingService.ts` or its 12 production callers.
- No changes to `advancedRAGPipeline.ts`.
- No changes to any governed-document or chat-upload flow.
- No changes to the AI gateway.
- No changes to the RIM intelligence layer.
- All `register*Routes` bootstrap manifests untouched.

## Tests run

```text
$ npx vitest run tests/routes/ai-entry-point-contract.test.ts
  ✅ 33/33 pass

$ npx vitest run tests/routes/chat-governed-upload.test.ts
  ⚠️ pre-existing load failure (documented in Phase 1 report; not a regression)
```

No retrieval-specific unit tests existed for the deleted files (one more
signal they were dead). A sentinel test will be added in Phase 7 to fail
any future reimport of the deleted paths.

## Legacy code deleted, moved, or quarantined

- **Deleted:** 8 files enumerated above. Directories `server/brain/` and `server/pipelines/` removed by git.
- **Quarantined:** none. Every candidate for quarantine turned out to be dead, so quarantine would only add noise.
- **Comment-cleaned:** `server/prisma/client.js` header + two inline comments.

## Remaining risks

1. **`server/prisma/client.js` is orphan.** Zero external consumers. The
   file is a Drizzle-over-Prisma shim; none of its exports (`audit_log`,
   `document`, `signature`, `study_document`, `$queryRaw`) are imported
   anywhere. Recommend a dedicated cleanup commit in a future phase — not
   rolled in here to keep Phase 2 scoped.
2. **`semanticEmbeddingService.js` and the `/api/semantic` route family.**
   This is a separate pgvector surface over `documentVectors`. It is NOT
   a legacy file per the Phase 2 scope (different backing table, different
   domain). Flagged in `RETRIEVAL_ENTRYPOINTS.md` as parallel for future
   consideration — a Phase 2.x sub-phase could evaluate whether to merge
   it into canonical.
3. **No Phase 7 sentinel test yet.** Phase 7 will add a test that fails if
   any file re-imports `semanticSearch.js`, `vaultRetriever.js`, or the
   other deleted paths. Until Phase 7 lands, the guardrail is human
   review against `RETRIEVAL_ENTRYPOINTS.md`.
4. **OpenSearch vs. pgvector strategy.** Two pgvector surfaces and an
   OpenSearch surface coexist. This is architecturally intentional
   (governance search on OpenSearch, intelligence atoms on pgvector) but
   worth a formal strategy memo at some point.

## Commit

See follow-up commit on `concept2cure-v2`.
