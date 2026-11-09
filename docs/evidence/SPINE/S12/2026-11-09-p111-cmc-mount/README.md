# P-111 slice 2: the CMC area shows a CMC work project's tasks when opened from its door

**Package:** S12 (founder decision P-111). **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`. **Lines agreed** with the
CMC session (`01GJidg5…`) in its note under its own row in `.design/claude-convergence/COORDINATION.md`, "→ S12
(`01FTWcmXm7At3ZXBE5VWn6oS`), on P-111 slices 2 and 3 in `CmcModule.tsx`". It holds nothing in these regions.

## What already exists (RULE 3)

| Piece | Path | Did | Did not |
|---|---|---|---|
| The bound panel | `v2/surfaces/ProjectWorkTasks.tsx` (`../2026-11-09-p111-slice-2/`, `../2026-11-09-p111-quality-mount/`) | A work project's tasks and "Add a task", bound by its door; mounted in Quality | Appear in CMC |
| The CMC area | `v2/surfaces/CmcModule.tsx` `CmcModule` | Module 3 and the study's quality records, on the program | Show a work project |

CMC reads no navigation hand-off of its own, so the door's binding reaches the panel directly. No pass-on is needed,
unlike Quality.

## What changed

- **`CmcModule.tsx`.** One import, and one element: `WorkProjectTasks area="cmc"`, after the page header and before
  the starters, where the CMC session placed it.
- **The band.** It reads "<work project> · <owner>", then "Its tasks are listed here. The records below are the whole
  project's." This is the CMC session's wording; the page's own title names the area.
- **Not here: slice 3.** The register "Task" and "Discuss" buttons will carry the bound work project: one hook read in
  `CmPush`, and one optional parameter on `cmcCtx`, read by `CollabLauncher.tsx`. They are slice 3, with
  CollabLauncher's change. Contradictions stay on the program's anchor, as agreed.

## Tests

The CMC UI suites and the panel's run with the panel mounted: 22 files, 331 cases, all pass (`ui.log`). Unbound, the
panel renders nothing and reads nothing, so no CMC case changes.

## In the running app

`walk.cjs` (`walk.log`, `walk.json`, `screenshots/`) runs on C2C-101:

1. The "Drug substance CMC" work project is opened from Project knowledge's Work areas card.
2. CMC / Module 3 opens with `?workProject=<id>` on the URL. The band names "Drug substance CMC · JM Smith" under the
   page header and says the records below are the whole project's (`cmc-bound-1440-light.png`).
3. "Add a task" files a task on the work project (POST `/api/tasks/tasks`, `projectId` = the work project, origin
   `work_project_task`). It is read back in the band (`add-task-1440-light.png`, `task-added-1440-light.png`).
4. A reload stays bound. "Show the whole project" unbinds.
5. At 390 dark, from a copied link, the band and its task show (`cmc-bound-390-dark.png`).
