# P-111 slice 2: a work project's tasks panel, its admission, and its roll-up (panel not yet mounted)

**Package:** S12 (founder decision P-111, items 1 and 2). **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`. The
inventory and the coordinating session's rulings are in `../2026-11-09-p111-what-already-exists/README.md`.

**Not done yet, and not claimed here:**
- **Not mounted.** The panel is in no area yet. Mounting it in `CmcModule.tsx` waits on the CMC session's answer to
  the lines sent to it. Mounting it in `QualityModule.tsx` follows the coordinating session's take-over ruling. So it
  is not yet reachable in the running app, and no walk is filed.
- **Contradictions stay on the program's anchor** (`services/cmc/contradiction-tasks.ts`). They are computed per
  program and carry no work-project context, so do not move them onto a work project.

## What already exists (RULE 3)

| Piece | Path | Reused for |
|---|---|---|
| The one navigation hand-off | `client/src/concept2cure/v2/navParams.ts` (`stashNavParamsForTarget`, `consumeNavParams`, `NAV_PARAMS_EVENT`) | The door hands the work project's id to its area |
| The program on the URL | `shellProject.ts` (`?program=`, other params kept) | The area keeps `?workProject=` beside it |
| Work project proof and name | GET `/api/project-hierarchy/:id/children?programId=` (S12) | Refuses a project outside the open program; names the work project |
| A project's work | GET `/api/concept2cure/projects/:id/unified-work` (`loadUnifiedWork`, `board` = `unified_tasks`) | The work project's own tasks, on its projects.id |
| The one task create | `editor/AssignReviewDialog.tsx` `createAssignedTask`, `useAssigneeRoster`; POST `/api/tasks/tasks` | "Add a task", filed on the work project |
| The work project's owner and due date | `ProjectCoreWork.tsx` `WORK_PROJECT_TASK_ENTITY` (`work_project`) | Kept apart: a small task's origin is `work_project_task`, so it is never read as the "Deliver" task |

There is no new route, table, store or screen. `ProjectWorkTasks.tsx` is split from `ProjectCoreWork.tsx` (RULE 6).

## What changed

- **`ProjectCoreWork.tsx`.** A CMC or Quality work project's door calls `bindWorkProject(area, id)` before it opens
  the area. Other areas open as before, with nothing handed off.
- **`ProjectWorkTasks.tsx`.**
  - **The binding.**
    - `useBoundWorkProject` reads the door's hand-off, or `?workProject=`, and keeps the binding on the URL.
    - "Show the whole project" unbinds the area.
  - **The panel.**
    - It proves the binding with the open program before it reads any task.
    - Its heading is "Working in <name> · CMC · <owner>". It lists the work project's `unified_tasks` as
      "title · person · due date · status".
    - It says, in words, when the binding is refused, when the tasks cannot be read, and when the list is partial.
  - **"Add a task".** Offered to a person who may write. It files the task with `projectId` = the work project and
    `moduleType` CMC or Quality.

## Red first

- **Red.** `__tests__/workProjectTasks.test.tsx` cannot load without the panel (`panel-red.log`). With the change, it
  and the work-project suite pass, 14 cases (`panel.log`). The cases are:
  - nothing shown or read when unbound;
  - the door binds, the URL keeps the binding, and the work project's own tasks are listed (proof first);
  - a reload stays bound, and unbinding works;
  - a task is added on the work project, never as its Deliver task;
  - a refused binding and a failed task read are said, never as none;
  - no add for a person who may not write;
  - only CMC and Quality are bound.
- **Mutations.** Three each fail their case (`panel-mutations.log`):
  - tasks read before the proof;
  - every work item listed, not only the task rows;
  - every area bound.

## Part 2: the admission and the roll-up (the coordinating session's rulings (b) and A1, 2026-11-09)

**What already exists.**
- `tasking/task-project.ts` `admitTaskCreationProject` admits on the exact `projects.id` only, through
  `canAccessReportProject` (report-os, which also governs reports and is untouched).
- `unified-work/unified-work-view.ts` `loadUnifiedWork` reads one project exactly and rolls up nothing.
- GET `…/projects/:id/unified-work` (`project-schedule-of-events.ts`) admits through `admitRouteProject`, which guards
  all six schedule routes.

**What changed.**
- **`task-project.ts` (S12, tasking cleared by RIM).**
  - `canWorkOnProjectTasks`: the exact project's access decides first, with exactly today's call. Then one clause:
    a writer on the work project's filing project, unless the work project has its own private visibility row.
    `admitTaskCreationProject` uses it.
  - `workProjectsReadableBy` applies the same rule to all of a filing project's work projects at once, in three
    reads whatever their number.
- **`unified-work-view.ts` (S12).** An opt-in `rollUpFor` rolls up the readable work projects' open tasks in one
  more select. Each is marked `workProject: { id, name }`. The filing project's own items are unchanged.
  - A roll-up that cannot be decided or read is said as an unread `unified_tasks` source (`summary.partial`), never
    as no work.
  - Callers that pass nothing get exactly what they got before: the task board, submission-ops, the cross-object
    resolver.
- **`project-schedule-of-events.ts` (S9, held for one commit and released with it).**
  - Only the unified-work handler passes `rollUpFor`: the actor the route has just admitted (its user id and the role
    from the same read) and the request's own connection.
  - `admitRouteProject` and the six routes' admission are otherwise unchanged. The "no SQL after an exact denial"
    pin is untouched and passes.
  - Four exact call-shape pins gain `rollUpFor` and stay exact (`project-schedule-admission.test.ts`, three;
    `project-schedule-of-events.test.ts`, one).

**Red first, on native PostgreSQL under row-level security** (`tests/db/work-projects.dbtest.ts`, as a restricted
role).

- **On trunk** 4 cases fail and 17 pass (`db-red.log`). With the change all 21 pass (`db.log`). The P-111 cases:
  - **The admission:**
    - a filing project's writer adds on its work project;
    - a work project's own member gets nothing on the filing project or on a sibling;
    - another organisation gets nothing;
    - a private work project refuses the filing project's writer.
  - **The roll-up:**
    - a filing project's writer sees each work project's tasks, marked with where each one lives;
    - a private work project's tasks are left out for that writer;
    - a reader who is not a writer gets exactly what the exact rule gives;
    - a work project's own member reads it directly and gets nothing from its siblings;
    - another organisation gets nothing.
- **Mutations** (`rollup-mutations.log`):
  - Ignoring the private flag fails its case.
  - Dropping the exact rule fails three.
  - A third mutation, "any reader of the filing project, not only its writers", survives, and must: a work project
    with no private row is readable by the organisation's members under the exact rule anyway. The reader case
    states that, and that a private one stays hidden.
- **Opt-in** (`unified-work-rollup-opt-in.test.ts`, `rollup-opt-in.log`):
  - with no reader, no decision is asked for and the four selects are unchanged;
  - with a reader, it decides once and makes one more select;
  - an undecidable roll-up is said as partial.
- **The existing suites pass:** the schedule route, the admission and the unified-work view, 203 cases
  (`route-suites.log`).
- **Gates:**
  - `ci:sql-interpolation` passes (`sql-gate.log`).
  - The full typecheck reports 0 errors. It runs at `TYPECHECK_HEAP_MB=12000`, because this host has 15 GB and the
    default 24 GB heap is killed for memory.

## Correction (2026-11-09, found by slice 5)

The proof above was incomplete, and slice 2 made trunk red. The suites listed passed, but the suites that exercise the
task admission's denials were not run.
- **The cause.** `canWorkOnProjectTasks` (`06a416517`) walked to the filing project after every exact denial.
- **What broke.**
  - The no-SQL pin: `unifiedTasks.routes.test.ts` pins that an exact denial runs no SQL beyond `BEGIN`/`ROLLBACK`.
  - Hand-built harnesses: `_unified-tasks-pglite-harness.ts` and `tests/db/workflow-project-native-fixture.ts` build a
    `projects` table with no `parent_project_id`, so a 403 there became a 503. That is 1 case in
    `unifiedTasks-governed.pglite.integration.test.ts` and 11 in `workflow-project-admission.dbtest.ts`.
- **What this session wrongly said.** In its message to the coordinating session, it called `unifiedTasks-governed`
  "trunk-red, not mine". That was wrong: with the helper from before slice 2, the suite passes 25/25.
- **Fixed in slice 5** (`91939f245`). `admitTaskCreationProject` reads `parent_project_id` in its existing locked row
  read, and runs the filing-project clause only for a row with a parent. An ordinary denial runs exactly the SQL it ran
  before P-111. The rule is unchanged.
- **Test-only changes that go with it** (`F1`): the two harnesses gain the real column, and two stand-ins accept the
  read's added column.
- **The run now.** All 39 non-db suites that reach task admission pass, 513 cases. Two lock-wait timing cases in
  `workflow-project-admission` fail identically before slice 2; they are not this change.
- **Evidence:** `../2026-11-09-p111-slice-5/README.md`, under "A slice 2 regression".
