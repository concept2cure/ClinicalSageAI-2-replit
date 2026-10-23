# Backfill source-basis SQL qualification scope

## What already exists

The existing `document-chunking-unicode-storage.test.ts` supplies an owner-mode PGlite pool adapter. The canonical `backfillVaultChunks`, chunk writer, chunk-outcome ledger SQL, `buildPassageContext` and `draftSourceIdentityForText` already exist. The new `document-chunking-backfill-source-basis.pglite.integration.test.ts` reaches them together; it implements no chunker, source remapping or production path.

## Authored cases and seams

Nine cases cover two expected fail-first source-basis regressions plus seven controls. The first two preserve BOM/CRLF/NBSP/edge whitespace and Japanese/scientific supplementary text through actual candidate SELECT, canonical DELETE/INSERT/transaction SQL, chunk outcome UPDATE, exact source slices, Unicode UTF-8 round trips and rederived passage references. Controls cover unchanged keyless metadata, dry-run/source/catalog preservation, named NULL/empty/whitespace skips, oldest-first bounded resumability, an already-chunked historical mismatch left untouched, organization/deleted-document filtering and explicit retry selection.

The database pool is substituted with isolated owner-mode PGlite. Every document has a catalog row; the unrelated first-catalog-upsert exports are refusing mocks and that path is not qualified here. The actual chunk-status/count/error UPDATE runs unchanged. Embeddings stay explicitly off; the provider seam refuses any unexpected use. Minimal fixture tables model only columns used by these statements. Native PostgreSQL RLS, pgvector/planner behavior, live providers, tenant CLI admission, races, deployment and automatic historical repair are not claimed.

## Pre-freeze transport correction

Root's initial authoring run exposed that this PGlite query decoder drops a U+FEFF at the beginning of a returned text value, including a dry-run control before backfill could mutate anything. Its original output remains under `root/red*`. Before the qualified fail-first freeze, fixtures move that BOM behind their initial CRLF and assert exact source round-trip before applying backfill. No pool result, expected source, production behavior or normalization rule is patched. The SQL suite therefore proves a trim-sensitive BOM after leading whitespace, not preservation of an initially decoded BOM. Separate handoff and synthetic-writer coverage establishes initial-BOM argument preservation. Root owns rerunning and recording the qualified baseline after this fixture correction.

No production or existing test file was edited. No tests, lint, compilers or Git mutations were run by this worker; root owns execution, freeze and publication. This file records authorship/scope only; actual results belong to root's captured commands and outputs.
