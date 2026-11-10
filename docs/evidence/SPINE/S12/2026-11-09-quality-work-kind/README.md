# P-111, slice 1: Quality is a work kind, and a Quality work project opens the Quality area

**Package:** S12 (founder decision P-111, item 5). **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`. The inventory and
the slices are in `../2026-11-09-p111-what-already-exists/README.md`. They were sent to the coordinating session before
this code.

## What already exists (RULE 3)

| Piece | Path | Did | Did not |
|---|---|---|---|
| Work kinds | `server/services/c2c/program-project-anchor.ts` `WORK_KINDS` | Six kinds, checked by the one intake (POST `/api/c2c/projects`) | Accept `quality`: refused 400 `INVALID_WORK_PROJECT` (`db-red.log`) |
| Labels and doors | `client/src/concept2cure/v2/surfaces/ProjectCoreWork.tsx` `WORK_KIND_LABEL`, `WORK_KIND_AREA` | Name a kind; map `cmc`, `biostatistics` and `rbm` to their areas | Name or map Quality |
| Which rows are doors | `ProjectHome.tsx` `ProjectHeaderDoors` | A row is a door to an area its track offers (`workAreasFor`) | Reach Quality, which is the organisation's QMS and is in no track's list |
| The Quality area | `registryModel.ts` `quality` (a rail work area); `QualityModule.tsx` | SOP register, change control, CAPA and the other records | (Unchanged here) |

## What changed

There is no new screen, route, table or work-areas card row.

- **`program-project-anchor.ts`.** `quality` is added to `WORK_KINDS`. The intake accepts it, and the child's
  `metadata.workKind` is `quality`.
- **`ProjectCoreWork.tsx`.**
  - `quality` is labelled "Quality" and maps to the `quality` area. It is offered in "Kind of work".
  - `workProjectOpenable` decides whether a work project's row is a door. A row is a door to:
    - an area the project's track offers; or
    - an organisation work area. Quality is the only one: it serves every project, whatever the track.

    In either case, the person must be allowed to open the area.
  - The project's own work-areas card is unchanged.
- **`ProjectHome.tsx`.** `ProjectHeaderDoors` uses that rule.

**Not in this slice** (P-111 items 1 to 4):
- The area opening *bound to* the work project, and its task list. The Quality area opens on the project, as the CMC
  door does today (`../2026-11-09-work-project-opens-its-area/`).
- Producers filing on the work project.
- Roll-up.
- Subtasks.

These wait on the coordinating session's answers on the parent column, child admission and the CMC and Quality holds.

## Red first

- **`tests/db/work-projects.dbtest.ts`** gains "adds a Quality work project (P-111 item 5)". It runs on native
  PostgreSQL, under a restricted role with row-level security.
  - On trunk it fails: 400 `INVALID_WORK_PROJECT`, and the other 11 pass (`db-red.log`).
  - With the change, all 12 pass (`db.log`).
- **`client/src/concept2cure/v2/__tests__/projectWorkProjects.test.tsx`** checks three things:
  - "Quality" is offered as a kind;
  - a Quality row reads "Quality · JM Smith" and opens `quality`;
  - `workProjectOpenable` opens Quality whatever the track, but not for a person without it, and an area the track
    lacks stays no door.

  On trunk's screen code 3 cases fail and 6 pass (`ui-red.log`). With the change, all 9 pass (`ui.log`).

## In the running app

`walk.cjs` (`walk.log`, `walk.json`, `screenshots/`) runs on C2C-101:

1. "Drug product QA" is added through the one intake with `workKind: 'quality'`.
2. The Work areas card lists it as "Quality · JM Smith", a door titled "Open Quality on this project"
   (`quality-door-1440-light.png`).
3. Clicking it opens `/concept2cure/quality?program=<C2C-101>`, the Quality area under the C2C-101 breadcrumb
   (`quality-opened-1440-light.png`).
4. At 390 dark the row is the same door, with no sideways scroll (`quality-door-390-dark.png`).

The first walk caught the row as a plain row: `ProjectHeaderDoors` admitted only the track's areas. That is why
`workProjectOpenable` exists.
