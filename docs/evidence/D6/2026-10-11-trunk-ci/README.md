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

## The `Test` job: 10 files, 25 tests — all green

CI's run read 10 failed files / 25 failed tests out of 46,710. Two of them
(`artifact-status-lock-covers-approval`, `artifact-approval-ceremony`) were
already fixed on trunk by `5abe8101e`, so they are green on the merged tree
without any change here. The other eight:

| File | Cause | Fix |
|---|---|---|
| `biopharma-programs-router-columns.contract.test.ts` | `sponsor_address`/`ind_type` declared twice; the file could not load (42701) | the duplicate removed (`2274cf036`) |
| `report-os-audit-recording`, `report-os-delivery-recording`, `report-os-finalize-signature`, `setup` | Each pinned the tenant stamp as the literal `SELECT set_config('app.current_tenant_id', $1, true)`. `ac688076e` (D3, 2026-10-08) pins the isolation switches in the SAME statement, so `app.rls_enforce`, `app.bypass_rls` and `app.is_admin` cannot leak from one request to the next. The statement grew; the four fixtures did not. | each builds the expected statement from `switchPinTerms(true)` — its own source — so the next change to the stamp cannot leave them stale |
| `document-data-disposition/consumers.pglite` | The fixture built `vault.document_catalog` without the attribution columns `migrations/20261008e` adds, so the server's real query failed on `c.catalog_state` (42703) | the fixture adds those eight columns and the migration's CHECK |
| `newProjectWizardRegulatedChoices` | The helper read the request body from `apiRequest.mock.calls[0]`. Since `a3dd2889b` the wizard first reads `GET /api/submissions/market-support`, so call 0 is that GET and its body is `undefined` | the helper finds the call by method and path |
| `japan-us-nonclinical-outline-repairs` | It asserted BOTH "equal to the canonical 2.6 set" and a flat list of seven codes. `88fa1606c` promoted the seven M4S pharmacology leaves (2.6.2.x) into the authoring guidance after primary-source review, so the canonical subtree now has depth and the two assertions contradicted each other | the flat list becomes the TOP-LEVEL codes (what actually catches "all of Module 2" or a second tree) plus a check that every code is inside `2.6` |

All ten files together: 144 tests, exit 0 (`green-test-job-ten-files.txt`).

Every one was a test that had not followed a deliberate product change — none
was a defect in the shipped code.

## `Coverage (ratchet)`: not a coverage drop

The ratchet never compared anything. Its whole output was:

```
[ci:coverage-ratchet] ❌ no coverage summary at coverage/coverage-summary.json.

  This gate reads the report; it does not produce it. Run the suite with
  --coverage --coverage.reporter=json-summary first.
```

The "Measure coverage" step ran the suite, the suite exited 1 on the 25 failing
tests, and no summary was written (no text-summary table appears in the log
either). So the Coverage job is downstream of the `Test` failures above, not a
coverage regression. It should clear once those are green; this session did not
produce a coverage report to prove the ratchet passes.

### Correction, after the merge: these fixtures were fixed twice

While this session was fixing them, another session landed `010959e36`
("Trunk CI: 16 red tests from four stale fixtures, one of which had switched
off a gate") and `94c42b598` (the `regulatory_programs` fixture), covering the
same files. The merge conflicted in five of them.

Trunk's versions were taken for all five, and this session's were withdrawn, so
there is ONE fix per fixture. The `document-data-disposition` fixture needed a
further withdrawal: trunk added the catalog's attribution columns to the shared
harness, which is the better place, so the block this session had added to the
suite became a duplicate `ADD COLUMN` and failed with 42701.

What remains from this session in the end: the pushed `biopharma-programs`
duplicate-column fix (`2274cf036`, which `94c42b598` also addressed), and the
diagnosis recorded here. The ten files pass together on the merged tree: 144
tests, exit 0.

This is the third overlap of the day (after `d3e303611` on the scanner gates).
Two sessions reading the same red CI and fixing the same files is waste; the
board's claim section is the mechanism for avoiding it.
