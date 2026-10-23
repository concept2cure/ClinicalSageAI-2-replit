# Worker: asynchronous retrieval freshness fences

## What already exists

`server/services/advancedRAGPipeline.ts` already runs candidate revalidation around reranking, MMR, optional context expansion and compression. `rag-disposition-revalidation.test.ts` already tests withdrawal at these seams. The new `rag-vault-freshness-boundaries.test.ts` extends this existing qualification seam for extraction/chunk freshness; it does not add a replacement engine.

## Authored scope

Twelve cases cover changed extraction with surviving own text, already-stale absent own text, same-ID row replacement, two unknown-derived-basis refusals, after-rerank/pre-MMR filtering, after-MMR/pre-compression refusal, cached compression return after changed extraction, changed coordinates after compression, unchanged complete transformation flow, first admission of plain legacy text, and guidance/project/memory controls.

The suite executes actual production `retrieve`, reranking, MMR and compression methods and their candidate fences. Initial candidates, SQL records, embedding/reranking providers and the auxiliary cache response are synthetic. A `cached: true` response establishes that an awaited cache-style result cannot bypass the surrounding production fence; it does not independently execute or qualify cache-key construction or provider delivery. Original-file hash stays constant in freshness cases. SQL membership/hash values are supplied by this fixture; real SQL calculation belongs to the separately owned PGlite suite.

The worker owns only this new test file and this evidence note. No production or existing-test edits, test runs, lint, compilers, Git changes or publication were performed by this worker. Root owns fail-first execution, freezing, qualification and publication; results are pending at handoff.
