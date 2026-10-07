# Catalog disposition fixture parity

2026-10-07; W3/D4. Root-approved fixture-only contract before editing:
restore the canonical catalog `content_hash` column in the shared PGlite
disposition harness and seed it with the same recorded source digest already
used by its Vault document. Preserve all production readers, policy predicates,
data identities, migration guards, approval gates and zero baselines.

The unchanged consumer suite has three inherited `42703` errors for missing
`c.content_hash`, also recorded in [PRIOR-SOURCE-GITHUB.md](PRIOR-SOURCE-GITHUB.md).
The CMC agent's broader actual-SQL run reproduced those three failures while
105 other tests passed. Root will independently capture the five-test
consumer RED before the fixture edit, then run its GREEN and the shared
disposition regressions. This corrects the fixture to the existing production
reader contract; it adds no production capability or qualification claim.

## Actual RED

Root reproduced the unchanged consumer suite before the fixture edit:
three failed, two passed (five total), exit 1, 6.07 seconds; start 10:06:50 UTC
(Vitest's runtime-local 06:06:50 EDT). All three failures were the same
`column c.content_hash does not exist` query error. The failed cases were
starts-readable-source, retained-extracted-text/original-file-pins and
withdrawn-grounding/historical-identity. No production file was changed to
obtain this result.

## GREEN and scope

The fixture now includes the production migration's `content_hash CHAR(64)
NOT NULL` column. Its named catalog INSERT uses the existing `HASH` value
already seeded into the Vault and captured source; no digest is inferred from
metadata and no production column or reader is altered.

The same five-test consumer command passed, exit 0, 7.76 seconds; start
10:07:19 UTC (runtime-local 06:07:19 EDT). Shared-fixture ESLint passed with
zero errors and zero warnings. The control tower's final integrated manifest
also includes shared-harness consumers, admission, retained-data and CMC gates.
PGlite fixture parity is not runtime-role, provider, live-audit or intended-use
qualification evidence. The inherited three errors are fixed locally; full
main-CI status must be evaluated against the subsequently published source.
