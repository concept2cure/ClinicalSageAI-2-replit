# Sentinel's over-allocation finding: each project's name stays with its own id

Package F1. Found on 2026-11-12 while making the Projects screen's "at risk this week" rows name their project
(`../2026-11-12-at-risk-rows-name-their-project/`), and routed to this lane by the coordinating session. No session
held `server/services/sentinel/sentinel.ts`.

## What was wrong

The cross-project analyzer reports a person with open work on more than three active projects. It read that person's
projects as two aggregates, `ARRAY_AGG(DISTINCT p.name)` and `ARRAY_AGG(DISTINCT p.id)`, and paired them by position.
`DISTINCT` sorts each aggregate by its own values, so the names came back alphabetical and the ids numeric. Whenever
those two orders differ, the finding's `affected_items` put one project's name on another project's id, and
`details.projectNames[i]` did not belong to `details.projectIds[i]`.

Under RULE 2 that is a stated fact with no record behind it: the engine said "project 5 is LMN-201" when project 5
was the NeuroPanel 510(k).

## What already exists (RULE 3)

| Path | What it does today | What it did not do |
|---|---|---|
| `server/services/sentinel/sentinel.ts` `analyzeCrossProject` | The over-allocation finding and the sibling-overlap finding | Keep a project's name with its id in the first |
| `SENTINEL_OVERDUE_TASKS_SQL`, `SENTINEL_PROJECT_HEALTH_SQL` in the same file | Two analyzer queries exported so a test runs the real text on a real engine | The over-allocation query was inline, so no test could run it |
| `server/services/sentinel/__tests__/sentinel-task-status.pglite.integration.test.ts` | The pattern: the exported query text on PGlite | — |

Nothing is added but a test beside the file's others.

## What changed

- The query is exported as `SENTINEL_OVER_ALLOCATION_SQL`, like the two beside it, and returns the projects as **one
  aggregate of {id, name} pairs**: `JSONB_AGG(DISTINCT JSONB_BUILD_OBJECT('id', p.id, 'name', p.name))`.
- `overAllocationProjects` reads those pairs, drops any without a project number or a name, and orders them by id.
- The finding's `projectId`, `affectedItems`, `details.projectIds` and `details.projectNames` are all read from those
  pairs. Their names and shapes are unchanged; `projectId` is still the lowest id.

## Red, then green

| File | What |
|---|---|
| `01-red-trunk-query-mispairs.txt` | Trunk's own query text on PGlite, four projects whose name order is the reverse of their id order: all four labels are on the wrong id |
| `02-red-stored-finding.txt` | A finding the analyzer stored in the local stack on 2026-11-09: three of its five labels are on the wrong project |
| `03-green-live-scan.txt` | The running app on PostgreSQL after the change, `POST /api/sentinel/scan/cross_project` as an administrator: 15 affected items in 3 findings, none mislabelled, and the two lists in `details` agree position by position |
| `04-green-tests.txt` | The new test file, 3 of 3 |
| `05-mutations.txt` | The ordering removed, then the pairing removed; each time a named test fails |

Tests: `npx vitest run server/services/sentinel`, 22 of 22 in 4 files (3 new, in
`sentinel-over-allocation-pairs.pglite.test.ts`). ESLint on `sentinel.ts`: 4 warnings, 5 before.

## Not in this change

- **Findings already stored keep the labels they were stored with.** The analyzer does not store a finding again
  while an open one with the same project, analyzer and title is under 24 hours old, so the repair shows in findings
  stored from now on. Nothing in the client or in AnA reads those labels: the only reader of `affected_items` is the
  Projects screen's panel, which takes the ids and names each project from the project list. Rewriting stored rows
  would be a data migration and is not made here.
- **`projectId` on this finding is still the lowest of several ids**, not "the finding's project". The panel names
  every project among the affected items for that reason.
- **The sibling-overlap finding** in the same analyzer was read and is correct: each of its two projects comes from
  its own columns of one row.
