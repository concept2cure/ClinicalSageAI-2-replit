# 6 — Evidence search spent its timeout JIT-compiling: the runtime pool turns JIT off

**A product defect found under a red test.** `tests/db/atom-search.dbtest.ts`
and `tests/db/retrieval-floor.dbtest.ts` timed out intermittently (`57014
canceling statement due to statement timeout`). The first diagnosis blamed the
local pgvector version. An independent refuter disproved that and found the
real cause, which reaches CI and production too.

## Cause

`searchHybrid` (`server/services/enhancedEmbeddingService.ts`) grounds every
Authoring AI draft and AnA evidence ask. It composes the data-eligibility
fragments (`document-data-disposition/eligibility.ts`) twice, plus the
original-file fragment, into a statement of about 92 KB with a plan of about
920 nodes.

When the planner's cost estimate crosses `jit_above_cost` (100,000),
PostgreSQL LLVM-compiles about 1,600 functions before executing. That happens
on a freshly written, not-yet-analyzed table, and at any real data volume. The
refuter measured it on PostgreSQL 16 with EXPLAIN ANALYZE, same plan, same
data:

| Setting | Time |
|---|---|
| JIT on, statistics stale | 26.2 s |
| `jit=off` | 11 ms |
| `jit_above_cost=0` | 1.86 s (1,587 JIT functions) |
| all JIT thresholds 0 | 25.2 s |

The pool's `statement_timeout` is 30 s, so a search either timed out or
consumed most of it. The `pgvector/pgvector:pg15` image CI uses is built on the
official Debian postgres image, which ships JIT on by default. At real data
volumes the estimate stays above the threshold, so in production every
evidence search would pay the same compile cost.

## Fix

- `server/db/runtimeStartupOptions.ts` (new): `buildRuntimeStartupOptions` is
  RLS enforcement (still composed only by `buildRlsStartupOptions`) plus
  `-c jit=off`.
- `server/db/runtime.ts`: the request-serving pool opens every connection with
  those options.
- JIT is off for every runtime connection, not per query, because the RAG and
  Vault searches compose the same fragments.
- Migrations and admin tooling keep the server default.
- Not done, as the refuter advised against them: raising the timeout, adding
  retries, or pre-ANALYZE in the tests. Each would mask the defect.

## Red → green, same database, same tests

| | atom-search | retrieval-floor |
|---|---|---|
| Before (`06-jit-red.txt`) | 2 timed out; the passing searches took 24.7–29.9 s | 3 of 4 failed (`57014`); the 4th took 34.1 s |
| After (`06-jit-green.txt`) | 5/5, 15–1,767 ms | 4/4, 96–258 ms |

`server/db/__tests__/runtimeStartupOptions.test.ts` (new, 2 cases) pins the
option string with and without RLS enforcement, and with PGOPTIONS kept first.
`rlsEnforcement.test.ts` is unchanged and passes: 35 tests across both files.
