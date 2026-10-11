# Trunk CI on 2026-10-11: the red Lint, Blank DB and proof-tier steps

**Row:** D6 (security gates) and D3 (tenant isolation).
**Head read:** `275707c7a`, then merged forward.

Semgrep is GREEN on this head, and its blocking scan named `664196f13` — a
2026-10-05 green commit in trunk's history. The baseline resolver fixed in
`35f688fde` has held across 499 commits.

Six jobs were red. What this session did with each:

## Fixed here

| Step | Cause | Fix |
|---|---|---|
| `test:proof-tier` (Lint) | `tests/schema-contract/biopharma-programs-router-columns.contract.test.ts` named `sponsor_address` and `ind_type` TWICE in its CREATE TABLE. Two sessions added the pair on 2026-10-08 and the merge kept both, so every case in the file failed to load with 42701 — 6 tests that could not run. | The duplicate pair is removed; the survivor sits where `shared/schema/programs.ts` puts it. 6 of 6 pass; the tier is 121 of 121 files. |
| `ci:purge-coverage` (Blank DB) | `stats_computation_runs` (2026-10-08) is org-keyed, its organization FK has no CASCADE and its other FKs are ON DELETE SET NULL, so a purged tenant kept every engine run — inputs, outputs and hashes. | In `PURGE_CHILD_TABLES` before the two tables it references. Reproduced on a database provisioned from empty (`install-fresh` + `deploy-migrate`, 372 files), since the gate measures a live schema: `red-purge-coverage.txt` → `green-purge-coverage.txt`. |
| — (found while reading the gate, not a red step) | `getJobStatus` took the organisation as optional over `($2::int IS NULL OR organization_id = $2)`, and `GET /jobs/:id/stream` passed `undefined`, so a caller with no resolvable organisation streamed any tenant's job by id. | The organisation is required, the predicate unconditional, and both routes refuse first. `red-deep-research-job-scope.txt` → `green-deep-research-job-scope.txt`. |

## Fixed in parallel by another session — mine withdrawn

Four Lint gates (`ci:requestdb-coverage`, `ci:tenant-isolation`,
`ci:step-presentation`, `ci:error-envelope`) were fixed independently by
`d3e303611` while this session was working, in the same way, down to the same
`(req: Request) => RunsQuery` seam signature. `de0fceff8` had already recorded
the overlap. On the merge this session took trunk's five files and withdrew its
own, so there is one implementation of each. All four gates pass on the merged
tree.

## Open, for their owners

- **`Nightly Governance Strict`** has failed every scheduled run since at least
  2026-10-05. Its two steps are zero-baseline promotion targets, and all seven
  strict gates are above zero: `duplicate-table-ddl`, `migration-prefix-collisions`
  (3), `unbacked-tables`, `tenant-isolation` (7), `unreferenced-modules` (82),
  `unkeyed-request-tables` and its `unreviewed` arm (99). Standing debt across
  lanes, not a regression from any one commit.
- **The remaining 6 `ci:tenant-isolation:strict` candidates** are reads whose org
  predicate is conditional (`($1::int IS NULL OR …)`) or whose tables the
  detector does not recognise, in `module-access-requests.ts` (the `all` mount
  lifts it for platform staff, by decision), `kernel-observability.ts` (4) and
  `kernel-adaptive-policy.ts`. Each was read; none lifts a predicate the way
  the deep-research one did.
- **`Test` / `Integration Tests` / `Coverage (ratchet)`** were not reached in
  this session.
