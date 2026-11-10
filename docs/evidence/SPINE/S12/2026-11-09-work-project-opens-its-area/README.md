# S12: a work project opens on its work area

**Package:** S12 (founder decisions P-83, P-109). This closes gap 2 of the inventory
(`../2026-11-08-what-already-exists/README.md`). **Plan:** S12, with its CSS under D3.
**Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`, 2026-11-09.

## What already exists (RULE 3)

| Piece | Path | Does | Did not |
|---|---|---|---|
| Work-area doors | `client/src/concept2cure/v2/surfaces/ProjectCoreWork.tsx` `workAreasFor`, `ProjectCoreWork` | Rows in Project knowledge's Work areas card. Each opens an existing area (Study & protocol, Biostatistics, CMC / Module 3, Risk-based monitoring) on the open project, as the project's track offers it | — |
| Work projects list | the same file, `ProjectWorkProjects` (S12 slice 2, `804956d0d`) | Lists the project's work projects with their kind and owner, and adds one through the one intake | **A work project was text only. It did not open anything.** |
| Work-area screens | `registryModel.ts:175–177` (`cmc`, `biostatistics`, `rbm`, group `work-areas`) | CMC / Module 3, Biostatistics and Risk-based monitoring | There is no screen for data management, clinical pharmacology or nonclinical. `app-registry.ts`'s `nonclinical` entry is a catalog entry, not a screen |
| Opening an area on the project | `ProjectHome.tsx` `ProjectHeaderDoors` → `onNav` | The shell's project channel. The area opens with `?program=` | — |

## What changed

There is no new screen, route, card or table.

- **`ProjectCoreWork.tsx`:**
  - `WORK_KIND_AREA` maps three kinds to the existing areas: `cmc` → `cmc`, `biostatistics` → `biostatistics` and
    `rbm` → `rbm`.
  - In `ProjectWorkProjects`, a work project of one of those kinds is drawn as a row like the areas above it: its name
    over its kind and owner, with a chevron. The row's title is "Open CMC / Module 3 on this project".
  - The row is a door only where this project's track offers that area and the person may open it (`openable`).
    Elsewhere it stays text.
  - A kind with no work area is not a door. Its row says "No work area for this kind yet", instead of a door that leads
    nowhere.
- **`ProjectHome.tsx`:** `ProjectHeaderDoors` passes `openable` (the project's track areas from `workAreasFor`, and the
  person's access through `available`) and `onOpen` (the same `onNav` the area rows use).
- **`project-home-v2.css` (D3):** one rule stacks the door's name over its kind.

**What it does not do yet.** The area opens on the program. It does not open on the work project itself. The CMC,
Biostatistics and RBM screens read the program, as before, and none of them is told which work project opened it. Its
deliverables (the next S12 slice, a Vault version family) are where a work project's own records will come in.

## Red first

- **The new case.** `client/src/concept2cure/v2/__tests__/projectWorkProjects.test.tsx` gains one case with four
  work projects: CMC, biostatistics, an RBM area this project does not offer, and nonclinical.
  - The CMC and biostatistics rows are doors that open `cmc` and `biostatistics`.
  - The RBM row is text.
  - The nonclinical row is text and says it has no work area.
- **The result.** On trunk's component the new case fails, and the other 4 pass (`ui-red.log`). With the change, all 5
  pass (`ui.log`).
- **The page's other suites.** The project page's 80 test files, 879 tests, pass. ESLint gained no warning.

## In the running app

`walk.cjs` (`walk.log`, `walk.json`, `screenshots/`) runs on C2C-101:

1. A nonclinical work project is recorded through the one intake (`POST /api/c2c/projects`, 201, under anchor 1).
2. At 1440 light, the Work areas card shows the CMC work projects as doors titled "Open CMC / Module 3 on this
   project". The nonclinical row has no button and reads "Nonclinical · JM Smith · No work area for this kind yet"
   (`card-1440-light.png`).
3. Clicking a CMC work project opens `/concept2cure/cmc?program=6065271c-…`.
   - The CMC / Module 3 screen opens on the same project. Its back link names C2C-101 (`cmc-opened-1440-light.png`).
   - The capture waits for the screen, not its loading line. The Module 3 board's own read was still in progress when
     it was taken; that read is CMC's.
4. At 390 dark, the same doors and row show, with no sideways scroll (`card-390-dark.png`).

## Next in S12

Deliverables: a work project's deliverable is a Vault version family, linked to the filing section it feeds through
`c2c_artifact_section_map`, through S6's holder. Then a filing section is flagged when a newer approved version lands.
