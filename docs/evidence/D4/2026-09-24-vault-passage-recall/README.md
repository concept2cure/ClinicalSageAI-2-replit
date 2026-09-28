# D4 — passage search could return nothing while every document was indexed

**Row:** D4 (Validation package) — the honest-state behaviour of the Vault's
retrieval path. **Workstream:** the AnA client-files lane. **Date:** 2026-09-24.
**Reach:** `search_document_passages` is gated behind `ana.vault_chunking`,
off by default; the reader it calls, `AdvancedRAGPipeline.searchVaultSimilar`,
is the `vault` corpus of the RAG router every retrieval path uses.

## The defect

The dense arm of the vault reader was one statement:

```sql
SELECT … FROM vault.document_chunks c JOIN vault.documents d …
 WHERE c.embedding IS NOT NULL AND <distance threshold> AND <this tenant>
 ORDER BY c.embedding <=> $1 LIMIT $3
```

`vault.document_chunks` carries an approximate `ivfflat` index on the
embedding. When the planner chooses it, the scan takes its candidates from ONE
list (`ivfflat.probes` = 1 by default) and the `WHERE` filters them afterwards.
When that list holds another tenant's chunks — or none that pass the threshold
— the arm returns nothing, while this tenant's matching passages sit in lists
it never probed. pgvector documents this as the filtered-search caveat.

`search_document_passages` then answered "No passage matched" beside a coverage
line saying every document was in the passage index: a miss presented as an
exhaustive search, which is the thing the coverage line exists to prevent.

Whether the planner picks the index depends on table statistics. On a
near-empty test database it prefers a sequential scan, which is why
`tests/db/vault-passage-search.dbtest.ts` passed for weeks — including in this
lane's CI-shaped run at 00:49 the same day — and then failed 3 of 3 once enough
rows had come and gone. Production, with every tenant's chunks in one table, is
the index-scan case. The suite passes 7/7 with `ivfflat.probes=100` or with
index scans disabled, which isolates the cause.

This was found while verifying an unrelated change: the lane's db run showed the
case failing, and it failed identically on the parent commit with that change
stashed. A subagent had labelled it "pre-existing" and moved on; it was
pre-existing, and it was also this lane's to fix.

## Red

`red/vault-passage-search.red.txt` — the suite with the planner forced onto the
index (`-c enable_seqscan=off`, for its own connections only), as `app_service`
with `RLS_ENFORCE=on` on a CI-shaped database: **1 failed / 6 passed**,
`expected 0 to be greater than 0` on "returns the passage that answers the
question". `red/HEAD.txt` is the commit it ran at.

## Fix

`server/services/advancedRAGPipeline.ts`, `searchVaultSimilar`, dense arm only:
a `MATERIALIZED` CTE selects the tenant's chunks first (through the btree
indexes, with the same explicit tenant predicate and document filters as
before), and only then orders them by distance — exactly, over rows that are
all this tenant's. The approximate index cannot short-circuit a sort over a
materialized CTE. For a regulatory answer recall is not a tunable; the cost is
one distance computation per chunk the tenant holds. The lexical arm, the
tenant refusal and the `tenant-isolation-safe` marker are unchanged, and the
marker still sits directly above its query.

## Green

| File | Result |
|---|---|
| `green/vault-passage-search.green.txt` | **7/7** with the planner forced onto the index |
| `green/lane-dbtests-as-app_service.green.txt` | the lane's eight real-PostgreSQL suites as `app_service`, **69/69** |

Also: the 13 RAG unit suites, 113/113; `ci:tenant-isolation` 8 candidates
before and after (no-regression mode OK, 8 against a baseline of 9); ESLint 10
warnings before and after in the pipeline, 0 in the test.

## Owed

- **The same shape on other corpora, not this lane's.** `searchRagChunksSimilar`,
  `searchClientMemorySimilar` and `searchProjectMemorySimilar` in the same file
  also put a filter in the `WHERE` of an `ORDER BY embedding <=> $q LIMIT k`.
  Where those tables carry an approximate index and the filter is a tenant, the
  same miss is possible. Recorded in `docs/work-orders/README.md` for their
  owners.
- **The `ivfflat` index on `vault.document_chunks`** is now unused by its only
  reader and costs every chunk write. Removing it means amending
  `migrations/20260905b_vault_document_chunks.sql` in place (Rule 1); left for a
  deliberate decision rather than folded into a recall fix.
