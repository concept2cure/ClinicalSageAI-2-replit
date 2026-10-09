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

## The job itself, replicated

The same result on the database this lane already had leaves one question:
does it hold on a database the job builds itself? So the job's own steps
were run in order on a database created empty for this purpose
(`green/blank-db-job-replicated.txt`):
- the database is blank;
- deploy-migrate refuses it (exit 3, as the job expects);
- install-fresh and deploy-migrate succeed.

**The ratchet (step 13).**
- With the parser before this change: exit 1, and `expected` is the one new
  absence.
- With the fix: exit 0.

**The steps the job never reached.** On CI the job stopped at step 13, so
nothing after it had run since the red began:
- Steps 8 to 12 pass: replay rebuilds nothing, RLS coverage, parent-scope
  delegates, the readiness contract, post-deploy invariants.
- **Step 14, `ci:purge-coverage`, fails.** Two org-keyed tables are ones a
  tenant purge cannot reach: `ana_turn_records` and `ana_record_blobs`. Both
  are the D5 turn-record lane's (`migrations/20260926_ana_turn_records.sql`,
  `f7597c2c`, 2026-09-26), and they landed while this step was hidden. They
  are immutable, chained records. Whether a purge erases them or keeps them
  with the audit records it already retains is that lane's decision; it bears
  on its own append-only hand-on. Handed on through the work-orders board, not
  edited here.

## Still owed

- **CI's own result.** On CI the job `needs: lint`, and Lint has been red
  since `a75e3845` on the ESLint warning ratchet (handed on through the
  board, item 3 of this lane's hand-ons). So CI has not run this job on any
  push since.
- **After Lint is green,** expect the job to reach step 14 and fail there
  until the purge decision above is made.

This README claims the local result only.
