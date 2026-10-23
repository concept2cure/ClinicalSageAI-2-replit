# Correct backfill source preservation — D2 / W2

## What already exists

The existing Vault backfill invokes the canonical chunk writer, exact-source context verifier and tenant CLI wrapper. This increment corrects the caller's trimmed source argument, preserving all existing gates and policies. [INVENTORY.md](INVENTORY.md) records discovery and [CONTRACT.md](CONTRACT.md) specifies behavior and limits.

## Initial evidence status (historical)

Discovery and contract are recorded before test/production edits. Independent approval, fail-first tests, qualification and normal direct canonical publication are pending. This initial record claims no implementation, test pass, production repair, deployment or agency acceptance.

## Qualified fail-first freeze

Three independently authored new suites execute **27 cases: 10 semantic assertion failures and 17 passing controls**, zero skips, on unchanged production. `root/red-qualified*` retains exact commands, hashes, JSON/raw output and exit status; `frozen-tests.json` pins all three files. All 24 selected baseline inputs remain unchanged. New tests have zero lint warnings/errors.

The earlier authoring run (`root/red.command.json`, `root/red.results.json`, `root/red.txt`) contained three PGlite leading-BOM transport fixture failures, including a dry-run control. It is not the qualifying baseline. `root/pglite-leading-bom-probe.json` independently proves SQL UTF-8 bytes retain the leading BOM while the PGlite returned field omits it; a BOM behind CRLF round-trips. Before freeze, SQL fixtures moved the BOM behind leading CRLF and added pre-apply source round-trip assertions, with no pool-result normalization or removed assertions. SQL proof therefore covers a BOM after leading whitespace; initial-BOM handoff remains separately covered through controlled writer/provider seams. Worker evidence identifies actual versus synthetic boundaries. No native RLS or live-provider result is claimed.

## Qualified correction

Only `server/services/vault/document-chunking-backfill.service.ts` changes production: the stored source remains untrimmed and the equivalent trim-based blank predicate remains in the guard. No writer, SQL, model, tool, schema, dependency or policy changes. The current run (`root/final*`) passes **219 tests in 19 files**, including all 27 unchanged frozen tests, zero failures/skips. All four changed TypeScript files have zero lint errors/warnings, no growth (`root/lint-final.json`). `qualification-source-manifest.json` pins selected inputs plus one-hop imports, not an exhaustive dependency closure. Two independent implementation reviews and the downstream-consumer audit are CLEAR (`root/implementation-reviews.json`).

The original unqualified SQL fixture is archived in `root/initial-sql-fixture.ts.txt`; its hash exactly matches `root/red.command.json`. No authoring failure or fixture correction was erased. The qualified baseline and all frozen tests remain unchanged. Normal code publication and whole-project TypeScript are pending.

## Limits and remaining needs

This corrects future selected backfill indexing; it adds no automatic historical repair policy. Existing embedding-upgrade reselection remains allowed. Already-chunked misaligned rows may remain hit-only until an explicit governed reindex. Page numbers remain unknown because backfill supplies no page spans. Catalog counts retain the builder's trimmed convention. Preserving edge whitespace can increase chunk totals or invoke the unchanged MAX_CHUNKS refusal. Existing indexing-await races, candidate-filter boundaries and the already-filed checksum cache race remain separate. SQL runs in owner-mode PGlite and provider replies are scripted; initial-BOM native SQL transport, native RLS, production latency, deployment, complete platform readiness and agency acceptance are not qualified here.
