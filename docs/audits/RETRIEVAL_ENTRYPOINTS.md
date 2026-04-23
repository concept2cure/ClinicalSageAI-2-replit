# Retrieval Entrypoints — Truth Table

**Established:** 2026-04-22 (Phase 2 of the Architecture Consolidation)
**Branch:** `concept2cure-v2`
**Owner:** this doc is the authoritative list of retrieval surfaces in the
repo. If you add a new retrieval surface, you MUST update this table. Tests
in Phase 7 will enforce that no new surface imports the deleted legacy files.

## Classification

| Status | Meaning |
| --- | --- |
| **canonical** | The sanctioned production retrieval path. Use this by default. |
| **parallel** | Different architecture (different backend, different domain, different table). Not a legacy concern, but not interchangeable with canonical. Treat as its own owned surface. |
| **compatibility shim** | Wraps a canonical surface for historic callers; will be removed when the last caller is migrated. |
| **fallback** | In-memory or degraded-mode path used only when a dependency is unavailable. |
| **deleted legacy** | Previously existed, now removed. Listed here so git-history-readers know where it went. |

## Retrieval surfaces (as of 2026-04-22)

### canonical

| Surface | File | Backing store | Notes |
| --- | --- | --- | --- |
| `enhancedEmbeddingService` | `server/services/enhancedEmbeddingService.ts` | `lumen_data_atoms` + cache | The canonical production retrieval layer. Hybrid search over atoms. |
| `advancedRAGPipeline` | `server/services/advancedRAGPipeline.ts` | `lumen_data_atoms` via `enhancedEmbeddingService` + `vault.document_chunks` for re-rank | Enterprise RAG (HyDE, multi-query, reranking, MMR, compression). Thin layer on top of canonical. |

### parallel (different architecture / different domain — not legacy)

| Surface | File | Backing store | Why it's parallel, not legacy |
| --- | --- | --- | --- |
| `opensearchClient` / `opensearchAdapter` | `server/services/search/opensearchClient.ts`, `server/services/search/opensearchAdapter.ts` | OpenSearch index | Full-text + vector search for governance / governed documents. Different backend from canonical; not a pgvector replacement candidate. |
| `semanticEmbeddingService` | `server/services/semanticEmbeddingService.js` | `documentVectors` | Separate pgvector surface for a different domain (component embeddings, not data atoms). Flagged for a future phase to decide whether to merge into canonical. |
| `SemanticSearchService` (in-memory) | `server/services/semantic-search-service.ts` | In-memory index | Academic resources only. Not a general retrieval surface. |
| `client-intelligence-memory` semantic helpers | `server/services/client-intelligence-memory.ts` | `client_memory_entries` (embeds via canonical) | Uses canonical embedder under the hood; domain-specific wrapper for client-level intelligence. |
| `knowledgeGraphService` | `server/services/knowledgeGraphService.ts` | `lumen_data_atoms` direct | Atom-level operations. Not retrieval per se; mentioned for completeness because it queries the same table. |

### fallback

| Surface | File | Backing store | Trigger |
| --- | --- | --- | --- |
| `conversation-os/retrievalService` | `server/services/conversation-os/retrievalService.ts` | In-memory | Used by conversation kernel when real retrieval is unavailable. |

### deleted legacy (2026-04-22)

| File | Reason for deletion |
| --- | --- |
| `server/services/semanticSearch.js` | OpenAI-direct + pgvector on `study_document` table that never existed in the Drizzle schema. Only callers were two dead pipeline scripts. |
| `server/brain/vaultRetriever.js` | Embedding-based retrieval over a bare `document_chunks` query that doesn't resolve in the real schema (real table is `vault.document_chunks`). Only production caller was `server/brain/draftGenerator.js`, itself dead. |
| `server/brain/draftGenerator.js` | Legacy draft generator. Zero external callers. Transitively dead once `vaultRetriever` was gone. |
| `server/brain/vaultIndexer.js` | Orphan indexer — zero references anywhere in the repo. |
| `server/brain/embeddings.json` | Static data file for the deleted indexer chain. |
| `server/pipelines/bulk_import.js` | Bulk import pipeline for the nonexistent `study_document` table. Zero runtime references (not in package.json scripts, not in CI, not in cron). |
| `server/pipelines/indexDocs.js` | Same as bulk_import.js — targeted a nonexistent table. |
| `server/test-retrieve-api.js` | Ad-hoc test script for `vaultRetriever`. Zero references. |

The orphan directories `server/brain/` and `server/pipelines/` were removed by git as a result of the above deletions.

## Governance

- **Do not reintroduce.** Phase 7 will add an import-sentinel test that fails if any file re-imports the deleted paths.
- **Adding a new retrieval surface?** It must be added to this table with a `status` before the PR merges. If it's another pgvector path over `lumen_data_atoms`, strongly reconsider — canonical is the right answer.
- **Migrating a parallel surface to canonical?** Open a Phase 2.x sub-phase scoped to that single surface; do not fold into unrelated work.
