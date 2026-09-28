# Trunk CI, 2026-09-28: Blank DB Provisioning red on a CTE that names its columns

**Row:** D4, as a follow-up of the W3 lane (`…01TTTQ1h`). The lane met this red
on its own pushes and fixed it at its cause, as VSR-001 §16.7 records.
**Scope:** `cteNames` in `scripts/ci/check-migration-reachability.mjs` and its
contract test. No product code changed.

## What was red

CI's Blank DB Provisioning job failed on every run this lane read on 2026-09-27
and 28 (`red/ci-runs.txt`: `00870fe4`, `d224ecff`, `7ddc0638`). The one step
that failed each time was "Server SQL resolves against the LIVE provisioned
schema (ratchet)", which is `npm run ci:tables-live-schema`. `d224ecff` changed
only the work-orders board, so the red predates this lane's code.

## The cause

The guard takes every table name the server's raw SQL references and resolves
it against a database built from nothing. A CTE is a name the query binds for
itself, so the parser drops those names (`cteNames`). It knew two forms:
- `WITH x AS (`;
- `WITH x AS [NOT] MATERIALIZED (`, added by `5fd4b79b` on 2026-09-24 for the
  same symptom.

It did not know a CTE that names its columns.
`server/services/audit/audit-immutability-triggers.ts` (`e8724680`, D6,
2026-09-25) probes the catalogue with this query:

```sql
WITH expected(schema_name, table_name, trigger_name) AS (VALUES …)
SELECT … FROM expected e LEFT JOIN pg_namespace n … LEFT JOIN pg_class c … LEFT JOIN pg_trigger t …
```

The guard read `expected` as a table that no database has.

Before the fix, the same command was run against this lane's database, which
was provisioned from empty (`npm run up`, then deploy-migrate). It fails with
`expected` as the only new absence: 753 references, 41 absent, exit 1
(`red/live-schema-guard-local.txt`).

CI's own list is not in this folder. The Actions API returns only a job's
last 5,000 lines, and in this job those are the database container's log. The
run's log archive is on a host this session's network policy refuses.

While the step is red, the job cannot show a real regression: any new absence
it exists to catch lands on an already red job.

## Shown failing first

Four cases were added to
`tests/schema-contract/migration-reachability-guard.contract.test.ts`:

| Case | Before the fix | After |
|---|---|---|
| binds a CTE that names its columns (the query's own shape) | fails: `expected [] to deeply equal ['expected']` | passes |
| binds RECURSIVE and later column-list CTEs, however they are spaced | fails | passes |
| still reports the storage a column-list CTE reads: the name is bound, the body's `no_such_store` is still reported | fails: `counted` reported as a table | passes |
| does not bind a function call or a column alias | passes | passes |

Before the fix the file had 3 failures and 14 passes (`red/unit-contract-test.txt`).
After it, the file and the two other guard contract suites pass 48 of 48
(`green/unit-contract-tests.txt`).

## The change

The regex accepts an optional column list between the name and `AS`:
`(?:\s*\([^()]*\)\s*|\s+)AS`. A name must still follow `WITH` or a comma, and
`AS` must still be followed by `(`.

## Green

- **The same command against the same database:** 752 references, 40 absent,
  all baselined, exit 0 (`green/live-schema-guard-local.txt`).
- **The whole reference set, before and after:** exactly one name leaves it,
  `expected`, from `audit-immutability-triggers.ts`, and none joins it
  (`green/reference-set-diff.txt`).
- **The other guards on this parser:** `ci:migration-reachability`,
  `ci:column-reachability`, `ci:insert-columns-declared` (and its self-test),
  `ci:duplicate-table-ddl` and `ci:model-migration-agreement` each give
  byte-identical output with the parser before and after
  (`green/shared-parser-guards.txt`).
- **Mutants:** four, each caught by its own case (`green/mutants.txt`):
  - the regex before this change;
  - `(` no longer required after `AS`, which binds `lower` and `unnest`;
  - `RECURSIVE` not accepted;
  - a space required before `AS` after the column list.

## Still owed

The Blank DB job going green on CI, on the push that carries this. The job
builds its own database with install-fresh, not this lane's `npm run up`.
Until CI shows the result, this README claims the local result only.
