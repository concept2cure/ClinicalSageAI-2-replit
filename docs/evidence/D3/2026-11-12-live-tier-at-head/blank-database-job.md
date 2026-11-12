# D3: CI's blank-database job, run by hand at head, 2026-11-12

**Row:** D3 (tenant isolation proven); the job also serves D1. **Package:** F1 for the repair. **Base:** `da35d66fc1`.
**Session:** `session_01UrPzGsENAo1PbcH1GQGRvX`. Same lane and day as `README.md` in this directory.

`README.md` is the Integration Tests job (the real-database tier). This is the job beside it, "Blank DB Provisioning +
Deploy Migration" (`.github/workflows/ci.yml:1846`). It is where the live-database tenant checks run: row-security
coverage after the first deploy and after a replay, the parent-scope delegates, and the purge ratchet. `purge-coverage.md`
ran one of its steps and found it red, so the rest were run too.

**Result.** At `da35d66fc1`, 11 of the job's 12 steps exit 0. One was red, `ci:tables-live-schema`, on three names
that are not tables. It is repaired in the parser, and the job is green at every step.

## What already exists

Searched before changing anything (RULE 3): `tables-live-schema`, `referencedTables`, `relationsIn`, `cteNames`,
`project-portfolio`, across `scripts/ci/`, `tests/`, `server/` and the coordination file.

| Piece | Path | What it does today | What it did not do |
|---|---|---|---|
| The job | `.github/workflows/ci.yml:1846-2082` | From an empty database: refuses to deploy, provisions, deploys, checks row-security coverage twice, replays, checks the delegates, the readiness contract and the post-deploy invariants, then two ratchets: server SQL against the live schema, and what a purge cannot reach. | Had not run at head. CI is about two days behind, and no database could be built from empty until `dfa9927bc`. |
| The live-schema guard | `scripts/ci/check-tables-against-live-schema.mjs` (`ci:tables-live-schema`), baseline `scripts/ci/tables-live-schema-baseline.json` (29) | Resolves every table the server's raw SQL names against the provisioned database. | Nothing wrong. It imports its parser. |
| The parser | `scripts/ci/check-migration-reachability.mjs` (`referencedTables`, `relationsIn`, `cteNames`) | Reads each SQL-looking string literal and binds the CTE names that literal declares. Its header and tests record four earlier phantoms of this family (`MATERIALIZED`, a column-list CTE, a comment, prose). | Read each literal alone, so a CTE declared in one literal and used in another was a table. |
| The parser's tests | `tests/schema-contract/migration-reachability-guard.contract.test.ts` | 28 cases pinning the helpers. | No case for a CTE kept in a constant. |
| The query | `server/services/c2c/project-portfolio.ts` (`81fdef65dd`, 2026-11-11 23:45 UTC, P-122 §3.2) | Keeps one WITH clause in `PORTFOLIO_SELECTED_CTE` and opens two queries with it. Correct SQL, and one copy of the clause. | — |
| The sibling guard | `scripts/ci/check-unbacked-tables.mjs` (`ci:unbacked-tables`, no database) | Green on the same file. | Not changed and not investigated further. |

No second parser or guard was written. The parser gains one rule and five test cases.

## The job at `da35d66fc1`

Every step was run with the job's own commands on an empty database named `c2c_blank_proof`, as the job names it
(`red/T-blank-database-job-at-da35d66fc1.txt`):

| Step | Exit |
|---|---|
| The database is blank | 0 |
| `deploy-migrate` refuses an unprovisioned database (exit 3, no table created) | 0 |
| `install-fresh` | 0 |
| `deploy-migrate` | 0 |
| **Row-security coverage after the first deploy** (`scripts/db/rls-coverage-check.sql` returns nothing) | 0 |
| `ci:replay-rebuilds-nothing` | 0 |
| **Row-security coverage after the replay** | 0 |
| **Parent-scope delegates** (`scripts/db/rls-parent-scope-delegates-check.sql` returns nothing) | 0 |
| The readiness contract (`green/W-readiness-contract.txt`) | 0 |
| `deploy-smoke-assert` | 0 |
| `ci:tables-live-schema` | **1** |
| **`ci:purge-coverage`** (`green/X-purge-coverage-in-the-job.txt`) | 0 |

Two differences from a CI run, both stated: the readiness step was run after the others, not in its place; and every
step was run whatever the one before it returned. In CI the job stops at the first red step. So with
`ci:tables-live-schema` red, **the purge ratchet after it never runs**, which is the D3 reason this repair is here.

The three row-security steps and the purge ratchet are the tenant ones, and all four pass at head: every org-keyed
table carries the tenant policy after a first deploy, no parent-scope helper falls through, and the purge reaches both
tables `purge-coverage.md` listed.

## The red step

`red/U-tables-live-schema-at-da35d66fc1.txt`:

```
❌ 3 table(s) referenced by server SQL do not exist on the provisioned database:
  server/services/c2c/project-portfolio.ts
      portfolio
      selected
      workstream
```

They are CTE names. The file declares the clause once and opens two queries with it:

```ts
const PORTFOLIO_SELECTED_CTE = `WITH portfolio AS (…), workstream AS (…), selected AS (…)`;
const PORTFOLIO_COUNTS_SQL = `${PORTFOLIO_SELECTED_CTE}
SELECT json_build_object('total', (SELECT count(*) FROM selected), …`;
```

The parser read each literal alone. In the second, `FROM selected` has no `WITH selected AS (` beside it, so it was a
table. Nothing is missing from any database, and the query is unchanged.

## The change

`scripts/ci/check-migration-reachability.mjs`, one rule beside `cteNames`:

- `fragmentCteNames(src)`: for each template-literal constant a file declares, the CTE names its text binds, and those
  of a constant it is built from.
- `borrowedCteNames(raw, fragments)`: the names a segment takes from the fragment it **opens** with.
- `relationsInSource(src)`: one file's relations, each segment read with what it borrows. `referencedTables` now reads
  each file through it.

The rule is narrow on purpose, because every name borrowed is a name the guard stops asking the database about. Only a
constant declared in the same file lends names, and only to a segment that opens with it: a WITH clause scopes the
statement it opens. A fragment interpolated anywhere else lends nothing, and neither does a name that is merely bound
somewhere in the file.

## Proof, each shown failing first

| Stage | Result | File |
|---|---|---|
| The gate at `da35d66fc1` | **exit 1**, the three names | `red/U-tables-live-schema-at-da35d66fc1.txt` |
| The gate after, same database | exit 0: 796 referenced, 29 absent, 29 baselined | `green/V-tables-live-schema-after.txt` |
| Every referenced relation and the files naming it, before against after | 799 to 796; the only difference is those three lines | `green/Y-referenced-relations-diff.txt` |
| The parser's contract test, after | 33 of 33 (28 as before, 5 new) | run after the change |
| M3: `borrowedCteNames` returning nothing | **the test fails 3 of 33, and the gate exits 1 again** | `red/M3-fragment-rule-removed.txt` |
| `ci:migration-reachability`, which uses the same parser | exit 0, 0 findings | run after the change |
| The parser's other consumers (`column-reachability-guard.contract.test.ts`, `ind-amendment-sql-guidance.test.ts`, `recorded-lineage-query-bindings.test.mjs`) | 30 of 30, 3 of 3 | run after the change |

The diff of the full listings is the check that the rule hides nothing else: across the server tree it removes those
three names and changes no other relation or attribution.

The two new cases that M3 does not fail are the two that pin the limits: a query that does not open with the fragment,
and a constant the file does not declare. Both must report `selected` as a relation, with or without the rule.

## Not done

- **Production Boot Smoke** (`ci.yml:2109`) and **Production Image Boot** (`:2387`) were not run. Both need containers
  (PostgreSQL with TLS, the pinned virus scanner, the built image), and this container has a Docker client and no
  daemon. They are the jobs closest to D3's own "done when" and have not run at head either.
- **Why `ci:unbacked-tables` is green on the same file** was not established. It has its own parser. If it reaches
  this case by skipping the literal, it under-reports there; that is a separate question.
- **No hosted run.** Local PostgreSQL 16.15; CI's job uses `pgvector/pgvector:pg15`.
