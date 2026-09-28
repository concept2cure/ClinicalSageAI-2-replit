# Every task a project or an assessment puts on the board has its task.create row

**Row:** D5 (Part 11: every governed change leaves a record). **Session:**
`…01P6GWSv`. **Date:** 2026-09-28. **Claimed and released in**
`docs/work-orders/README.md`. It follows
`docs/evidence/D5/2026-09-28-ana-cascade-ledger/`, and the same sweep: writers of
`unified_tasks` outside the governed paths.

## What was wrong

Two production paths put tasks on the regulated board with no guaranteed
§11.10(e) record.

- **Project creation** (`POST /api/concept2cure/projects`,
  `server/routes/concept2cure.ts`) seeds the registry blueprint's milestones as
  board tasks (IND: seven). It did so with one `pool.query` per milestone and
  no lineage row. Every new project began with tasks that no record said anyone
  had created. A failure part-way through left some milestones on the board and
  the rest missing.
- **Tasks raised from a statistical assessment**
  (`POST /api/biostat-bridge/designs/:studyId/tasks`, `createTasksForDesign`)
  inserted each task on its own. It then wrote the `task.create` row through the
  best-effort branch of `auditTaskAction` and discarded the outcome (baselined
  in `ci:discarded-audit-write`). A ledger that could not be written left the
  tasks on the board unrecorded, and the route answered them "created". A
  failure part-way through the selection kept the ones before it. No raised
  task named its creator: `created_by_id` was never set.

## The change

- **One seeder for blueprint milestones.** `server/services/tasking/blueprint-milestones.ts`
  (`seedBlueprintMilestones`) runs one transaction on a pool client:
  - Each milestone the board does not already hold is inserted, then its
    `task.create` row is written on the same connection.
  - A row that is not recorded throws `TaskAuditNotRecordedError`. This
    includes a creator who cannot be named. Everything then rolls back.
  - The route calls it where the loop was. Project creation still does not
    fail on a seeding failure (the contract since D22); it now leaves no
    milestones rather than some.
- **The bridge raises its selection in one transaction.**
  - `createTasksForDesign` runs every `createUnifiedTask` and its
    `auditTaskActionInTx` on one Drizzle transaction.
  - Each task carries `createdById`.
  - A ledger failure or an unnamed caller throws, nothing is raised, and the
    route answers 500 rather than "created".
  - The `ci:discarded-audit-write` entry for the file is removed (1 → 0).

Nothing else is on this path: the rules engine's `create_task` is the one other
production `INSERT INTO unified_tasks` outside the governed paths. It cannot
run today, since no rule can be created, so it is handed on (work-orders
README, "Found by the D5 lane's CI check", item 5) rather than fixed here.

## Proof

| Suite | HEAD | Change |
|---|---|---|
| `server/services/tasking/__tests__/blueprint-milestones.pglite.integration.test.ts` (PGlite: `unified_tasks` as the migration set builds it, the governed writer's two stores) | red 5/5 | green 5/5 |
| `tests/routes/concept2cure.test.ts`, *"seeds the blueprint's milestones through the ledgered seeder"* | red: *"the milestones did not go through the ledgered seeder"* | green |
| `server/services/biostatistics-bridge/__tests__/bridge-tasks-ledger.pglite.integration.test.ts` (PGlite; the assessment, blueprint, board write and ledger are production code; only the design load is stubbed) | red 4/4 (its precondition, "the design proposes at least two tasks", passes: 7) | green 5/5 |

The properties, in both suites:
- each task has its row, in order, naming the creator;
- no creator, no task;
- no ledger, no task, and no "created" answer;
- one failed task takes back the rest;
- a re-run of the seeder adds nothing.

`red.txt` runs the seeder suite against HEAD's route code, lifted verbatim into
a function (`head-seeding-shim.ts.txt`), since the module is new. It runs the
other two against HEAD's own files.

`green.txt` records:
- the three suites, 20/20;
- `server/services/tasking`, `server/services/biostatistics-bridge`,
  `tests/routes/concept2cure*` and the governed-command-vocabulary contract,
  222/222;
- the gates: all pass, except the requestDb coverage audit. That fails only on
  `server/routes/study-design-planning.ts`, which another lane added at 17:00
  (handed on, item 4).

Scoped type check: no errors on any changed line. ESLint:
- `concept2cure.ts` drops from 15 warnings to 14;
- the other changed files gain none, and the new files have none.
