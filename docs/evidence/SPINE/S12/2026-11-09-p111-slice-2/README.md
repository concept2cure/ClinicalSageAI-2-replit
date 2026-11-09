# P-111 slice 2, part 1: a work project's tasks panel, bound by its door (not yet mounted)

**Package:** S12 (founder decision P-111, items 1 and 2). **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`. The
inventory and the coordinating session's rulings are in `../2026-11-09-p111-what-already-exists/README.md`.

**Not done yet, and not claimed here:**
- **Not mounted.** The panel is in no area yet. Mounting it in `CmcModule.tsx` waits on the CMC session's answer to
  the lines sent to it. Mounting it in `QualityModule.tsx` follows the coordinating session's take-over ruling. So it
  is not yet reachable in the running app, and no walk is filed.
- **The admission clause is held.** A filing project's writer, one direction only (ruling (b)). It lives in
  `tasking/task-project.ts`, with native-PG cases under RLS, and waits on RIM's answer on its tasking file.
- **Reading through the filing project is held.** The coordinating session chose roll-up in `unified-work-view.ts`.
  The route is untouched, and `project-schedule-admission.test.ts`'s "no SQL after an exact denial" pin stays. How the
  reader reaches the roll-up is with the coordinating session. Until then the panel reads the work project directly,
  by the exact rule.
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
