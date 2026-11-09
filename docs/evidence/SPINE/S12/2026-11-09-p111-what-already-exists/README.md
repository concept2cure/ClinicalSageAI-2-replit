# P-111: a CMC or Quality work project manages its own smaller tasks, inside its own work area. What already exists

**Package:** S12 (founder decision P-111, 2026-11-09). **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`. This is the
RULE 3 inventory and the proposed slices. It was sent to the coordinating session before any code.

P-111's own entry (`docs/LAUNCH_DEFINITION_OF_DONE.md`, "P-111") carries a "What exists today" list. This search
agrees with it and adds paths and lines.

## What already exists

| Piece | Path | Does today | Does not |
|---|---|---|---|
| Work kinds | `server/services/c2c/program-project-anchor.ts:491` `WORK_KINDS` | `cmc`, `biostatistics`, `rbm`, `data_management`, `clin_pharm`, `nonclinical` | `quality`: a Quality work project is refused, 400 `WORK_KIND_UNKNOWN` |
| Work project | `program-project-anchor.ts` `ensureWorkProjectUnderAnchor`, `programOfProject` | A child `projects` row under the filing project; its program is read by walking to the root | Create or hold tasks |
| Work project's labels and doors | `client/src/concept2cure/v2/surfaces/ProjectCoreWork.tsx` `WORK_KIND_LABEL`, `WORK_KIND_AREA`, `WorkProjectItem` | `cmc` opens the CMC / Module 3 area via `onOpen(area)` | Pass the work project's id: the area opens on the program (`../2026-11-09-work-project-opens-its-area/`); no Quality kind or door |
| Owner and due date | `ProjectCoreWork.tsx` `buildWorkProjectTaskBody` → POST `/api/tasks/tasks` | One "Deliver: <name>" `unified_tasks` row per work project, filed on the **filing** project | Any task list of the work project's own |
| The canonical task store | `shared/schema.ts:7568` `unified_tasks` | `project_id` (FK to `projects.id`, indexed), `linked_tasks` ("linked task IDs across modules"), `dependencies`, `blocked_by`, `blocks` (ordering edges, each with a `task.link` ledger row: `taskManagement.routes.ts:753`, `:974`) | A parent task. Reusing `linked_tasks` or `dependencies` would mix a parent with cross-module links and ordering |
| Task creation and admission | `server/routes/taskManagement.routes.ts:247` POST `/tasks`; `server/services/tasking/task-project.ts:120` `admitTaskCreationProject` | Admits any `projects.id` the actor may write, by membership, owner or creator on that exact row | Inherit access from the parent project; list tasks by project |
| The project's work panel | `server/services/unified-work/unified-work-view.ts:423` `loadUnifiedWork`; GET `/projects/:id/unified-work` (`project-schedule-of-events.ts:177`); client `ProjectHome.tsx:902` `useProjectWork` | Reads the project's `unified_tasks` (and `project_tasks`, work items, eSTAR) on the exact `project_id` | Roll a work project's tasks up |
| A person's tasks | `server/services/tasking/my-work.ts:92`; Tasks board `TaskBoard.tsx`, `taskBoard.routes.ts:673` | By assignee, whatever the project; the board filters by project on the client | Group a child under its parent |
| CMC area | `client/src/concept2cure/v2/surfaces/CmcModule.tsx:3215`; project from `cmcShared.tsx:31-45` (the program, `shellProject.ts:98`) | Registers read `?projectId=<program>`; per-register "Task" (`cmcTask`, `:542`, `:571`) opens `CollabLauncher.tsx`, which POSTs a task on the context project | A task list; any work-project binding |
| CMC contradictions | `server/services/cmc/contradiction-tasks.ts:98-183` | One `unified_tasks` row per program and contradiction type, on the program's anchor | File on a work project |
| Quality area | `QualityModule.tsx` → `client/src/concept2cure/quality/App.tsx:55-70` | SOP register, change control, CAPA, deviations, nonconforming, suppliers, audits, reviews | A task list; any project or work-project binding |
| Quality's tasks | `capa-mdr/capa-tasks.ts`, `qms/qms-record-tasks.ts`, `qms/periodic-review-task.ts`, `qms/training-task.ts`, placed by `tasking/source-task.ts:158-212` `nativeTaskPlacement` | Source-linked `unified_tasks` rows (`moduleType 'Quality'`), placed on the program's anchor or the organisation | Placement on a work project |
| CAPA action items | `quality/CapaActions.tsx:27`; `capa_actions` (`shared/schema/capa-mdr.ts:456`) | A CAPA's own actions, mirrored one task each into `unified_tasks` | (Kept: the source; the task is its mirror) |
| Legacy WBS | `project_tasks` (`shared/schema.ts:7332`, `parent_task_id`); `server/routes/c2c/tasks.ts:179-533` | Subtasks | Any v2 caller. P-111 rules it out |
| Others with no v2 caller | `project_milestones`, `cdisc_task_deliverables`, `project_sections` assign and deadline | — | Reported earlier for R1's reach-or-retire, not S12's to touch |

Searches run included `git log --all --diff-filter=D --name-only` for task, Task, workstream, WorkProject and
quality-tasks. Nothing came back, but the clone is shallow (1,142 commits), so it may hide older deletions.

## Proposed slices (for the coordinating session; nothing built yet)

1. **Quality is a work kind.**
   - `quality` in `WORK_KINDS`, with its label and its door to the existing `quality` area in `ProjectCoreWork.tsx`.
2. **The area opens bound to the work project.**
   - The door passes the work project's id with the area.
   - CMC and Quality each name it ("Working in <name>") and list its tasks: owner, due date, status, one level of
     subtasks.
   - The list is the work project's `unified_tasks`, read through the existing work read (`loadUnifiedWork` on the
     child's `projects.id`). No new route.
   - Adding a task is the existing POST `/api/tasks/tasks` with `projectId` = the child.
3. **The producers file there when they act within a work project.**
   - CMC's "Task" push (`CollabLauncher.tsx` takes the bound work project);
   - contradictions and Quality's producers through `nativeTaskPlacement`, when the source carries a work project.
   - Each keeps its source key and reconciliation.
4. **Roll-up.**
   - `loadUnifiedWork` for a filing project also reads its work projects' tasks, each marked with its work project.
   - A person's Tasks already shows them, by assignee.
5. **Subtasks.**
   - A nullable `unified_tasks.parent_task_id` (integer, FK to `unified_tasks.id`), added by an additive,
     `IF NOT EXISTS`-guarded migration (RULE 1).
   - The write path holds it to one level, the same organisation and the same project.
   - `linked_tasks` and `dependencies` keep their meanings.

## Open questions for the coordinating session

- **The parent column.** Is `parent_task_id` approved under P-111 item 4, or does it need a ledger `approvedAdditions`
  entry? It touches `shared/schema.ts`, which is edited by one session at a time.
- **Child admission.** `admitTaskCreationProject` admits only on the child row itself. Should a filing project's
  writer be admitted on its work projects? Today a work project's members are its creator.
- **Holds.** The CMC session holds `CmcModule.tsx`, `cmcShared.tsx` and `CollabLauncher.tsx` (if it is theirs). The
  Quality lane holds `QualityModule.tsx`, `quality/App.tsx`, `capa-mdr/**`, `qms/**` and `tasking/source-task.ts`.
  Slices 2 and 3 need named lines in each, through `COORDINATION.md`.

## The coordinating session's rulings (2026-11-09, under P-107)

Slices 1 to 5 are approved, in that order.

- **(a) The parent column.** `parent_task_id` is covered by P-111 ("one level of subtasks"), so it needs no
  `approvedAdditions` entry.
  - One additive migration: `ADD COLUMN IF NOT EXISTS`, with the FK guarded so it replays safely. It goes before the
    final pair.
  - The write path enforces one level, the same organisation and the same project. Each refusal is tested.
  - The `shared/schema.ts` and `migration-set.mjs` turns are taken for slice 5's one commit and released with it.
- **(b) Child admission, one direction only.** A filing project's writers may read and add on its work projects'
  tasks.
  - A work project's members gain nothing on the parent or on siblings, and another organisation gains nothing.
  - It is implemented once, in `tasking/task-project.ts`, and respects a restricting `project_visibility_settings` on
    the work project.
- **(c) Holds.**
  - **CMC** (`CmcModule.tsx`, `cmcShared.tsx`, `cmc/contradiction-tasks.ts`): lines agreed with the CMC session
    (`01GJidg5…`).
  - **Quality** (`QualityModule.tsx`, `quality/App.tsx`, the `capa-mdr` and `qms` producers): only P-111's lines,
    taken over from an unreachable holder (hold of 2026-11-06).
  - **`tasking/source-task.ts`**: lines told to RIM first.
  - **`CollabLauncher.tsx`**: claimed, with no recorded holder.
