# Actor-scoped AnA retrieval

This implements the retrieval owner of [CONTRACT.md](CONTRACT.md). It qualifies the existing AnA adapters when they receive the canonical `sourceReadScope`. Trusted internal/raw callers remain available; this evidence does not qualify every MCP or platform reader.

## Behavior

- The lexical Vault count and page, semantic catalog count and candidates, recorded passage ledger, dense materialized candidates and sparse candidates all apply the server-admitted allowed programme set before count, rank and limit. An empty allowed set searches no programmes.
- Sources require their actual recorded organization, an owned live parent, current family version and eligible disposition. Catalog and passage ledger rows must match the current source byte hash. `keep_data` remains eligible retained extracted data; the binary is not reopened.
- Actor reads use the canonical current membership/project policy through short stamped executors. No transaction spans an optional provider call. Authority is re-admitted after awaits; selected identities are checked against current source programme/hash before results are returned.
- The lexical page and total are reread before the assistant returns so a changed unselected source cannot leave a stale total. The passage ledger is refreshed after asynchronous retrieval. Missing or malformed ledger state is unknown, not zero. The independent null-count adversary was observed failing before the strict number/digit-string parser closed it.
- Context expansion and candidate revalidation keep actor programme, organization, live-parent, currentness and disposition constraints. The existing retrieval router, strategies, index and ranking remain in use.
- Missing optional vector SQL is rolled back to a savepoint before a lexical fallback. The named missing `vector` type is included; other undefined objects and absent chunk relations remain unavailable.

`sourceReadScope` is server context, never request-body authority. Discovery counts describe the evaluated actor scope; passage coverage describes the recorded index ledger. Neither becomes proof of current extraction fidelity, table completeness, scientific qualification or provider delivery.

## Evidence

The initial [fail-first report](retrieval-fail-first.json) contains nine failed controls and one passing unknown-ledger control. The failing controls covered missing allowed-set predicates, organization/parent/source-byte checks, executor use and dropped filter propagation. [The final regression report](retrieval-regression-final.json) records **102 passed tests across 12 files** on Node 22. Selected-target type checking reports **zero diagnostics across 15 roots**. Lint reports **zero errors and the same nine existing pipeline warnings** as the tracked baseline.

The regression includes actual sequential PGlite lexical paging with a permitted document below private tied matches, an empty allowed set, wrong recorded organization and canonical lineage/semantic compatibility. PGlite does not establish production PostgreSQL role or concurrent behavior; independent owned PostgreSQL evidence is tracked by the lead/reviewer.

[Selected-target type checking](retrieval-target-typecheck.txt) uses repository compiler options, ambient declarations and imported dependencies. It reports selected roots, not a whole-repository typecheck. [Lint output](retrieval-eslint.json) is compared with [the tracked baseline](retrieval-eslint-baseline.json); the existing large pipeline warnings are retained.

No live provider call, new dependency, alternate index, backfill, table, migration, deployment, commit or push was performed by this owner. Checks are bounded point-in-time fences; an already dispatched remote request cannot be recalled by these database checks.

[The reproducible verification runner](run-retrieval-checks.mjs) writes [exact commands](retrieval-check-commands.json) and the [owned source manifest](retrieval-source-manifest.json).
