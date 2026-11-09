# P-111 slice 5: one level of subtasks, and a slice 2 regression found and fixed

**Package:** S12 (founder decision P-111, item 4). Also S9 for one route commit, F1 for test harnesses and
`COORDINATION.md`, and D3 for two CSS rules. **Rulings:** the coordinating session, 2026-11-09:
- the column is covered by P-111;
- (a) the harnesses apply the migration;
- (b) is refused.

**Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`. **Turns held for this one push and released with it:**
`shared/schema.ts`, `scripts/db/migration-set.mjs`, and `server/routes/taskManagement.routes.ts` (S9; RIM told).

## What already exists (RULE 3)

| Piece | Path | Did | Did not |
|---|---|---|---|
| The canonical task store | `unified_tasks` (`shared/schema.ts`) | Every task. `linked_tasks` (cross-module links) and `dependencies`, `blocked_by`, `blocks` (ordering edges with ledger rows) | A parent. Reusing those would mix meanings |
| The legacy WBS | `project_tasks.parent_task_id` | Subtasks | Any v2 caller. P-111 rules it out |
| The one task create | POST `/api/tasks/tasks` (`taskManagement.routes.ts`); `tasking/task-project.ts` | Admits the project, then checks what the body names (`requireAssignedVaultFamily`) | A parent |
| The work view and roll-up | `unified-work/unified-work-view.ts` (`../2026-11-09-p111-slice-2/`) | A project's tasks, and its work projects' tasks for the admitted reader | Say which task a subtask belongs to |
| The bound panel | `v2/surfaces/ProjectWorkTasks.tsx` | A work project's tasks and "Add a task" | Subtasks |

## What changed

- **`migrations/20261109_unified_tasks_parent_task.sql`** (RULE 1). It is placed before the final sweeps;
  `ci:migration-set-order` and `ci:migration-drop-safety` pass.
  - The column: `parent_task_id integer`, nullable, added only if absent. `unified_tasks.id` is a serial integer, so
    the coordinating session's "uuid" was corrected to integer, and accepted.
  - The FK: `unified_tasks_parent_task_id_fk`, to `unified_tasks(id)`, `ON DELETE SET NULL`.
  - The check: `unified_tasks_parent_not_self`.
  - An index on the column.
  - The FK and the check are each added only when absent, by name. Nothing is dropped.
  - Applied twice to the local database, with no error (`apply-local.log`).
- **`shared/schema.ts`.** `unifiedTasks.parentTaskId`.
- **`tasking/task-project.ts` `admitParentTask`.** The parent must be:
  - in the same organisation;
  - in the same project;
  - live;
  - not itself a subtask (one level).

  It is read under a share lock in the writer's transaction. Every reason gives the same 409 `PARENT_TASK_REFUSED`.
- **`taskManagement.routes.ts` (S9).** POST `/tasks` takes `parentTaskId`. It is checked after the project is admitted,
  with the Vault-family check, in `admitTaskAttachments`. The audit row names the admitted parent.
- **`unified-work-view.ts`.**
  - Board items carry `rowId`, and a subtask carries `subtaskOf` (its parent's item id). The roll-up is included.
  - These come from rows already read, with no extra query.
- **`ProjectWorkTasks.tsx`.**
  - Subtasks list under their task, indented.
  - Each top-level task offers "Add a subtask", to a person who may write.
  - A subtask offers none: one level.
- **`project-home-v2.css` (D3).** The subtasks' indent and quiet rule, and each "Add a subtask" kept to its own width.

## A slice 2 regression, found by this slice's wider runs, and fixed here

Slice 2's `canWorkOnProjectTasks` (`06a416517`, on trunk) ran its filing-project walk after every exact denial. That
broke two things on trunk:
- `unifiedTasks.routes.test.ts` pins that an exact denial runs no SQL beyond `BEGIN`/`ROLLBACK`.
- Harnesses whose hand-built `projects` table has no `parent_project_id` turned a 403 into a 503:
  `_unified-tasks-pglite-harness.ts` and `tests/db/workflow-project-native-fixture.ts`. 11 cases regressed in
  `workflow-project-admission.dbtest.ts`, and 1 in `unifiedTasks-governed`.

The slice 2 report did not catch this. Its claim that `unifiedTasks-governed` was "trunk-red, not mine" was wrong: the
suite passes 25/25 with the helper from before slice 2.

**The fix (design, not harness).**
- `admitTaskCreationProject` reads `parent_project_id` in the row read it already makes under a share lock.
- The filing-project clause runs only for a row that has a parent.
- So an ordinary project's denial runs exactly the SQL it ran before P-111. Ruling (b)'s rule is unchanged.

**Test-only changes that go with it:**
- the two hand-built harnesses gain the real column;
- two stand-ins that match the admission's SQL by text accept the added column.

**Logs.**
- `regression-red.log`: the pin fails on trunk's helper. `regression.log`: with the fix, 83 cases pass.
- `admission-suites.log`: all 39 non-db suites that reach task admission pass, 513 cases.

## The harnesses that build `unified_tasks` (ruling (a))

Each applies `migrations/20261109_unified_tasks_parent_task.sql` right after it builds `unified_tasks`: one line,
nothing else changed. That is the closure contract's rule.

| Harness | Owner lane |
|---|---|
| `server/routes/__tests__/authoring-record-attribution.pglite.test.ts` | D4 / F1 (authoring) |
| `server/routes/__tests__/authoring-review-loop.pglite.integration.test.ts` | D4 / F1 (authoring, review) |
| `server/routes/__tests__/authoringDocAccess.pglite.integration.test.ts` | D4 / F1 (authoring) |
| `server/routes/__tests__/review-board-authoring-store.pglite.integration.test.ts` | D4 / F1 (review) |
| `tests/schema-contract/authoring-review-audit-comment.contract.test.ts` | D4 / F1 (review) |
| `server/routes/__tests__/route-task-guard-unified.pglite.integration.test.ts` | S9 (tasking) |
| `server/routes/__tests__/task-completion-cascade.pglite.integration.test.ts` | S9 (tasking) |
| `server/routes/__tests__/unifiedTasks-governed.pglite.integration.test.ts` | S9 (tasking) |
| `server/jobs/__tests__/taskDueSweep-route.pglite.test.ts` | S9 (tasking) |
| `server/services/tasking/__tests__/my-work.pglite.test.ts` | S9 (tasking) |
| `server/services/tasking/__tests__/seed-task-graph.pglite.integration.test.ts` | S9 (tasking) |
| `server/services/tasking/__tests__/task-project.pglite.test.ts` | S9 (tasking) |
| `server/services/ana-ri/__tests__/ana-task-cascade-ledger.pglite.integration.test.ts` | S9 / RIM (ana-ri) |
| `server/services/biostatistics-bridge/__tests__/bridge-tasks-ledger.pglite.integration.test.ts` | S9 / RIM (biostatistics) |

**Results.**
- On trunk, 1 of these 14 files fails: `unifiedTasks-governed`, the slice 2 regression above.
- With the schema field and no harness line, 13 more fail, 78 cases.
- With the lines and the fix, all 14 pass, 159 cases (`harness-closure.log`, run before the regression fix; the
  regression fix's own run is `regression.log`).

## Red first, and proof

- **Native PostgreSQL, under row-level security, as the restricted role** (`tests/db/work-projects.dbtest.ts`).
  - `db-red.log`: on trunk's decider and work view, the two new behaviour cases fail.
  - With the change, the three slice 5 cases pass:
    - a same-project parent is admitted, and the 4 other parents (a subtask, another project's, unknown, malformed)
      are refused alike, as is another organisation;
    - a subtask rolls up under its task;
    - the database refuses a task as its own parent, a deleted parent leaves its subtask a task, and replaying the file
      changes nothing.
  - `db.log`, with `workflow-project-admission` and `task-board-every-store`: every case passes except two
    lock-wait timing cases in `workflow-project-admission`. Those two fail identically before slice 2.
- **Mutations** (`db-mutations.log`). Each fails the admission case:
  - a subtask may be a parent;
  - the parent may be another project's.
- **The route** (`task-management-parent-task.test.ts`).
  - `route-red.log`: 3 of 3 fail on trunk's route.
  - `route.log`: they pass. The decider is asked on the request's transaction with the admitted project; a refusal
    is 409 with nothing written; no parent means no ask; a malformed parent is 400.
- **The panel** (`ui.log`): 55 panel, collab, unified-work and route cases pass. They include a subtask listed under
  its task, and "Add a subtask" posting `parentTaskId` on the same work project.
- **The rest of the run:**
  - the `tests/db` suites that build `unified_tasks` or reach admission (`db-suites.log`): every file that fails also
    fails before slice 2, by file;
  - `test:proof-tier`: 143 files, 1,792 cases, all pass (`proof-tier.log`);
  - the full typecheck: 0 errors;
  - no pushed file gained an ESLint warning.

## In the running app

`walk.cjs` (`walk.log`, `walk.json`, `screenshots/`) runs on C2C-101, with the migration applied locally:

1. CMC is bound to "Drug substance CMC". A task is added in its band.
2. "Add a subtask" opens on that task (`add-subtask-1440-light.png`). POST `/api/tasks/tasks` carries `parentTaskId` =
   the task's row.
3. The subtask lists under its task, indented. It offers no subtask of its own (`subtask-listed-1440-light.png`).
4. A parent from another project is refused: 409 `PARENT_TASK_REFUSED`, nothing written.
5. At 390 dark it is the same, with no sideways scroll (`subtask-390-dark.png`).

The first walk showed each "Add a subtask" stretched across the band. The D3 rule above fixes it.
