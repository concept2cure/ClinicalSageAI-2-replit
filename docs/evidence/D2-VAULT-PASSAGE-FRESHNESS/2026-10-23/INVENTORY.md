# D2 / W2 discovery: current Vault passage text

## What already exists

- `server/services/advancedRAGPipeline.ts` already maps dense and lexical Vault rows, revalidates candidates before/after asynchronous reranking, MMR, compression and generation, and refuses an answer whose sources disappear during generation. Its source snapshot checks document/program/original-file hash, not extraction or chunk replacement. Its auxiliary caches do not cache final grounded answers.
- The same file's `withVaultSpan` invokes the existing exact-span verifier. Unavailable context removes expandedContent, but leaves the candidate's content and compressedContent. Expansion is optional and occurs after some provider boundaries, so an expansion-only fix is incomplete.
- `server/services/vault/passage-context-span.ts` already verifies UTF-16 offsets, source slices, Unicode boundaries, neighboring chunk continuity and budgets. Available context carries `reference.extractedTextSha256`. Unavailable context is not itself evidence that the hit is stale: legacy NULL offsets, a bad neighbor and trimmed-backfill coordinates also withhold context.
- `server/services/vault/document-passage-search.ts` already exposes canonical retrieval results to Data Room and AnA. It forwards candidate content as hit text. The shared `retrieval-source-access.ts` already enforces actor/program/original-file identity; it is not an extraction-version store.
- `server/services/vault/vault-annotations-core.ts`, `vault-annotations.ts` and `vault-annotations-post.ts` already use PostgreSQL `encode(sha256(convert_to(extracted_text, 'UTF8')), 'hex')` to identify extraction text. Reuse that identity; no dependency, schema, tool or store is needed.
- `rag-disposition-revalidation.test.ts` exercises real pipeline fences with synthetic SQL/provider seams. `rag-vault-span.pglite.integration.test.ts` executes real Vault SQL with persisted extraction/chunks and actual chunking. Existing tenant, actor, generation, context and adapter suites are regression controls.

Two independent read-only inventories searched services, public consumers, fields, current tests and matching deleted-file history. No removed matching implementation was found. The preceding Unicode-read evidence explicitly records stale retrieval as an unfinished need. Existing trimmed backfill and already-filed checksum race remain separate work.

## Gap and scope

The original binary hash can remain constant while OCR/extracted text or a same-ID chunk changes. Current revalidation cannot detect either change. Extend the existing Vault mapper and candidate fence; preserve other corpora and access/disposition predicates. This is a correction to existing retrieval, not another search capability.
