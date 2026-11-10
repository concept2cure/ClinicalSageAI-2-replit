# P-111 slice 2: the Quality area shows a Quality work project's tasks when opened from its door

**Package:** S12 (founder decision P-111), and D3 for one CSS rule. **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`.
**Ruling:** the coordinating session, 2026-11-09. The Quality lines are taken over from an unreachable holder (hold of
2026-11-06), only P-111's. The wording follows the CMC session's note in `COORDINATION.md`.

## What already exists (RULE 3)

| Piece | Path | Did | Did not |
|---|---|---|---|
| The bound panel | `v2/surfaces/ProjectWorkTasks.tsx` (`WorkProjectTasks`; `../2026-11-09-p111-slice-2/`) | A work project's tasks and "Add a task", bound by its door | Appear anywhere |
| The Quality area | `v2/surfaces/QualityModule.tsx` → `quality/App.tsx` | The QMS registers, its tabs and its own top bar | Show a work project |
| Quality's hand-off | `QualityModule.tsx` `consumeNavParams('quality')` | Opens a tab or a document | Leave the hand-off for anyone else: reading it clears the one-shot entry, so the door's binding was lost |

## What changed

There is no new screen, route, table or store.

- **`ProjectWorkTasks.tsx`.**
  - **The pass-on.** `keepWorkProjectBinding` lets an area that reads its own hand-off pass the binding on. It
    keeps `?workProject=` on the URL and tells the panel (`WORK_PROJECT_BINDING_EVENT`), whether the panel mounts
    after the hand-off or is already showing.
  - **The band** (the CMC session's wording). It reads "<work project> · <owner>", then "Its tasks are listed here.
    The records below are the whole project's." It no longer names the area to itself.
- **`QualityModule.tsx`.** The two places that consume Quality's hand-off pass the binding on.
- **`quality/App.tsx`.** `WorkProjectTasks area="quality"` sits at the top of the page, above the register, hidden
  while a document is being edited.
- **`project-home-v2.css` (D3).** `.pj-work-project-bound` sets the band apart from the area's own header: a space and
  a divider.

## Red first

- **On trunk's panel:** the pass-on case and the new wording fail, and 4 pass (`ui-red.log`).
- **With the change:**
  - the panel, work-project and Quality suites run 330 cases (`ui.log`);
  - every case passes except 4 in `quality/__tests__/ChangeControlProject.test.tsx`;
  - those 4 fail identically on trunk without this change: its `authService` mock lacks the `authService` export.
    That is not this change; it is reported to the coordinating session.
- **Gates:**
  - the CSS gates pass (undefined classes, selector shadowing, design system);
  - the full typecheck reports 0 errors (at `TYPECHECK_HEAP_MB=12000`; this host has 15 GB).

## In the running app

`walk.cjs` (`walk.log`, `walk.json`, `screenshots/`) runs on C2C-101:

1. The "Drug product QA" Quality work project is opened from Project knowledge's Work areas card.
2. Quality opens with its own tabs, and with `?workProject=<id>` on the URL. The band names "Drug product QA · JM
   Smith" and says the records below are the whole project's (`quality-bound-1440-light.png`).
3. "Add a task" uses the one task create (`add-task-1440-light.png`). POST `/api/tasks/tasks` files it with
   `projectId` = the work project and origin `work_project_task`. It is read back in the band
   (`task-added-1440-light.png`).
4. A reload stays bound. "Show the whole project" unbinds, and the band goes.
5. At 390 dark, from a copied link, the band and its task show, with no sideways scroll
   (`quality-bound-390-dark.png`).

The first walk showed the band running into Quality's own header. The D3 rule above is the fix.
