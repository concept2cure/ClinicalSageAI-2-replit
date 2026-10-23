# SQL test author scope

## What already exists

`AdvancedRAGPipeline.vaultLexicalArm`, `revalidateCandidates` and `expandContext` already perform canonical Vault retrieval, current eligibility and source-context checks. The existing disposition PGlite harness applies actual disposition and catalog-attribution migrations twice. The existing production chunker establishes stored chunk text and UTF-16 coordinates. This suite extends their coverage rather than implementing a second policy.

## Authored tests

`server/services/__tests__/rag-vault-freshness.pglite.integration.test.ts` contains 14 cases. It executes actual lexical mapping, repeated candidate SQL and selected actual context expansion against PGlite-persisted rows. Every initial candidate is returned by the actual lexical mapper; snapshot metadata is never hand-constructed. Same-original-file re-extraction, surrounding-source replacement, already-stale text, same-ID chunk replacement, coordinates, NULL transitions, literal Unicode/metacharacter membership, honest NULL-offset/trimmed-basis fallback, foreign organization and retained/withdrawn data are covered.

The minimal harness schema gains only fields required by existing production queries. Its source/chunk fixtures use actual production chunking. No query return values, actor wrappers or freshness methods are mocked in this suite. It runs in owner-mode PGlite and does not qualify native RLS, live providers, concurrent readers or deployment. NULL source and misaligned coordinates intentionally prove hit-only legacy behavior; they do not establish an exact source span. Root owns execution, fail-first freeze, production edits, compilation and Git; this worker authored files only and claims no test pass.
