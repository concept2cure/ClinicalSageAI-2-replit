# P-111 slice 3: a task made in a work area bound to a work project is filed on it

**Package:** S12 (founder decision P-111, item 2), with F1 for `CollabLauncher.tsx`. It has no recorded holder, and
the coordinating session ruled "claim it in your row". **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`.

## What already exists (RULE 3)

| Piece | Path | Did | Did not |
|---|---|---|---|
| The one quick-task form | `v2/surfaces/CollabLauncher.tsx` (the shell's "New task from this screen", CMC's register Task and Discuss through `cmcTask`, `cmcCollab`) | Starts on the open project (`taskProjectFor`: the `projects` row anchored to the open program); POST `/api/tasks/tasks` | Know about a work project |
| The task's project list | GET `/api/projects` (`projects-management.ts`) | Every project of the organisation, work projects included (no parent filter) | — |
| The bound panel | `v2/surfaces/ProjectWorkTasks.tsx` (`../2026-11-09-p111-slice-2/`, mounted in CMC and Quality) | Proves the binding with the open program; its own "Add a task" files on the work project | Tell the rest of the area |
| CMC contradictions | `server/services/cmc/contradiction-tasks.ts` | One task per program and contradiction type, on the program's anchor | — (stays; computed per program, no work-project context; agreed with the CMC session and the coordinating session) |
| Quality's producers | `tasking/source-task.ts` `nativeTaskPlacement`; `capa-mdr/capa-tasks.ts`, `qms/*-task.ts` | Place on the program's anchor, read from the source's `program_id` | — (see "Not done" below) |

## What changed

- **`CollabLauncher.tsx` (F1).**
  - The context gains an optional `workProjectId`.
  - `contextTaskProject` answers the bound work project when it is a listed project. Otherwise it answers the open
    project, exactly as before (`taskProjectFor`).
  - Both the quick-task form and Discuss's follow-up task use it.
  - The form still shows the project and still lets the person change it.
- **`ProjectWorkTasks.tsx` (S12).**
  - While a binding is proven, the panel puts `workProjectId` into the shell's task context.
  - It clears the context on "Show the whole project" and when the area closes.
  - A refused binding never reaches the context.
  - So every task made in the area starts on the work project: the top bar's, and CMC's register Task and Discuss.
  - `CmcModule.tsx` needs no change for this. The CMC session had proposed a parameter on `cmcCtx`. The panel's context
    write covers Task and Discuss together, with no hook in its module-level functions.

## Not done, and why

**Quality's own producers do not place on a work project.** Their sources carry no work project.
- `capa_records` and `capa_actions` carry `program_id`, and so do the QMS records (`source-task.ts:106-110`,
  `:150-169`).
- So "file on the work project when the source carries one" has no case to act on today.
- Placing them there needs a work-project field on those sources: a column, and the founder's or the coordinating
  session's call. It is reported there, not built here. `source-task.ts` is unchanged, so RIM has no lines to review.

A task made by hand in a bound Quality area (its band's "Add a task", or the shell's Task) is filed on the work
project.

## Red first

- **On trunk's files** the three new cases fail (`ui-red.log`):
  - the form opens on a bound, listed work project, and on the open project once it is unbound;
  - an unlisted bound work project falls back to the open project;
  - only a proven binding enters the task context, and unbinding clears it.
- **With the change**, the collab, task-board, shell and panel suites pass, 60 cases (`ui.log`).
- **Mutations** (`ui-mutations.log`). Each fails its case:
  - an unlisted work project used anyway;
  - the context bound before the binding is proven.

## In the running app

`walk.cjs` (`walk.log`, `walk.json`, `screenshots/`) runs on C2C-101 at 1440 light:

1. CMC is opened from the "Drug substance CMC" work project's door.
2. The shell's "New task from this screen" opens with Project = "Drug substance CMC"
   (`task-form-bound-1440-light.png`; the dialog is caught mid-fade).
3. The task is filed with `projectId` = the work project, and read back in the band after a reload
   (`task-listed-1440-light.png`).
4. After "Show the whole project", the same form starts on the filing project again
   (`task-form-unbound-1440-light.png`).
