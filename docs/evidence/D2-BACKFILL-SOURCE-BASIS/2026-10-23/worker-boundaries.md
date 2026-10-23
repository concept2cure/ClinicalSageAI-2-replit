# Writer-boundary test scope — D2 / W2

## What already exists

The existing `backfillVaultChunks` invokes the canonical `chunkAndEmbedDocument`, which owns the splitter, MAX_CHUNKS refusal, tenant/current-binary eligibility query, embedding scope, fallback to keyless indexing, transaction sequence and chunk outcome SQL. This suite reaches those implementations; it adds no writer or splitter.

## Authored evidence

`server/services/vault/__tests__/document-chunking-backfill-source-boundaries.test.ts` authors six cases. Three are intended semantic fail-first cases: raw edge whitespace crossing the unchanged chunk cap; exact raw text dispatched to a scripted embedding seam; and exact raw text retained after a scripted embedding refusal. Three controls exercise an unchanged source exactly at the cap, a selected candidate refused by the current writer eligibility lookup before provider dispatch, and INSERT failure followed by ROLLBACK/named ledger failure.

Backfill selection, splitting, writer behavior, tenant scope, fallback and outcome statement construction are production implementations. Pool/query replies and provider replies are synthetic. Transaction assertions establish the real writer's issued statement sequence; this suite does not qualify physical PostgreSQL rollback, RLS, pgvector, live-provider delivery or production behavior. The separately assigned PGlite suite supplies actual SQL storage/context evidence.

All candidates already have catalog rows, so the uncatalogued extraction-upsert wrapper is mocked and unused. Every call explicitly sets embedding policy. The embedding seam records the actual text, model and tenant scope used by the canonical writer; it invokes no external provider.

No tests, lint, compiler or Git mutations were run by this worker. Root will establish actual fail-first counts, freeze hashes and qualification results. Only the assigned new test and this scope record were authored.
