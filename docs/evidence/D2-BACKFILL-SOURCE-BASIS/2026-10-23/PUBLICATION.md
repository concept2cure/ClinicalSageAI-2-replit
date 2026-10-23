# Published backfill source preservation — D2 / W2

## What already exists

[INVENTORY.md](INVENTORY.md) identifies the existing sweep, tenant CLI admission, canonical chunk writer, exact-source verifier and Data Room/AnA consumers. This correction extends the backfill caller; it adds no alternate implementation, dependency, schema, tool, provider or historical repair policy.

## Accepted correction

Normal direct canonical push **f0ec738b118353f97977de4f10af62176d55c68a** succeeded with **every mandatory gate passed**, including actual whole-project TypeScript **0 errors / tsc exit 0**. No PR, alternate branch, force push, bypass or baseline relaxation was used. Initial synchronization preserved 48 incoming canonical commits; a later normal merge preserved two more, without conflicts or changes to the 55 qualified inputs.

Only the existing backfill service changes production. It uses trimming solely to recognize blank documents, then passes nonblank stored extraction unchanged to the existing writer. Leading/trailing whitespace, CRLF, BOM and Unicode therefore retain the source basis used by chunk coordinates. The writer, candidate SQL, tenant checks, embedding policy, transactions, reports and catalog count convention remain unchanged.

## Verification and provenance

The current exact-source run (`root/final*`) passes **219 tests in 19 files**, including all **27 new cases**, zero failures/skips. All three frozen test files remain byte-identical. All four changed TypeScript files have **zero lint errors and warnings**, no growth. The 55-input manifest includes selected inputs plus one-hop relative imports, not exhaustive dependency closure. Current verdict: `root/published-qualification.json`.

Before production edits, qualified baseline 5ba464eb5 recorded **10 semantic failures / 17 passing controls** on unchanged production. Actual backfill selection, canonical writer transaction/INSERT/DELETE, chunk outcome SQL, stored slices and context identities execute in owner-mode PGlite. Controlled writer/provider seams separately verify exact initial-BOM handoff, actual writer cap refusal/rollback/eligibility and embedding fallback. Uncatalogued handoff invokes the real metadata builder while its database wrapper is controlled; full uncatalogued SQL is not qualified by the minimal PGlite fixture.

The initial authoring run is retained, including its three SQL fixture failures. A direct SQL hex probe demonstrates PGlite's result decoder strips an initial BOM although SQL UTF-8 bytes retain it. Before freeze, those fixtures moved the BOM behind leading CRLF and added pre-apply round-trip checks. SQL assertions cover that source exactly; initial-BOM handoff uses controlled seams. No result normalization or removed assertion hid the difference. `root/initial-sql-fixture.ts.txt` reproduces the initial fixture's recorded hash.

Two independent implementation reviews and a downstream-consumer/evidence audit are CLEAR. Fresh `root/code-verification.json` matches 55 current inputs, three frozen tests, 24 historical baseline inputs, four original authoring inputs and 37 evidence artifacts against remote Git bytes or the pinned original archive. It verifies **110 retained ancestors** and local/remote equality at the accepted code head. `publication-manifest.json` pins the final evidence set except itself; a final read-only remote check follows its normal evidence-only push without creating recursive artifacts.

## Limits

No production backfill was run and no automatic historical reindex policy was added. Existing embedding upgrades may still reselect eligible keyless rows. Historical misaligned chunks can remain until explicit governed reindexing. Backfill supplies no page spans, so page numbers remain unknown. Catalog counts retain independently trimmed semantics. Raw whitespace can increase chunk totals and correctly trigger MAX_CHUNKS refusal; no prefix is indexed to evade it. Existing indexing-await races and candidate-policy boundaries remain unchanged. Native PostgreSQL/RLS/pgvector, initial-BOM native transport, live providers and production latency are not qualified here. This is code publication, not deployment, full launch readiness or agency acceptance. The already-filed checksum cache race remains separate.
