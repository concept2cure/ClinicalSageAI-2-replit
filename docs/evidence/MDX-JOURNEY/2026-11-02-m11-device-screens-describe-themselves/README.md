# MDX journey M11: the device screens describe themselves truly. M12, re-verified, is not a defect

From `.design/client-journey/MDX_JOURNEY_2026-11-01.md` M11 and M12. Plan: F1.

## What already exists (RULE 3)

- **The registry notes.** The `notes` field of `UI_SURFACES` (`shared/constants/ui-surface-registry.ts`) is read by
  the screens that list surfaces (`Coverage.tsx`, the project journeys' capability tooltips). The module catalog was
  seeded from the same notes, and `scripts/ci/check-catalog-copy.mjs` forbids their build-status phrases there. The
  catalog's copy was repaired by `db/migrations/20260823_module_catalog_customer_copy.sql`; the registry's was not.
- **What the screens do today.**
  - `device-cer` (`CerSurface.tsx`): six tabs over live backends. Its Generator opens a section in the one editor
    (`onOpenEditor`) and exports through the governed CER export.
  - `device-510k` (`K510Surface.tsx`): predicate table, SE matrix, eSTAR section list, `OfficialEstarPanel`,
    `EstarFilingPanel`. Its sections open in the one editor.
- **Sample mode.** It was removed from the MDX surfaces with every dataset it served (`8067332317`).

## M11: the defect and the change

| Where | Said | Now says |
|---|---|---|
| `device-cer` note | "… export. Dashboard only today." | Its tabs, and that the generator's sections open in the one editor and the CER leaves through the governed export |
| `device-510k` note | "eSTAR section tree · content editor · predicate/SE intelligence panel. In progress." | Its panels, the filing readiness, the draft package and the official eSTAR, and that sections open in the one editor |
| `CerSurface.tsx` header | kit fixtures "reachable only through the explicit sample-mode guard" | no tab renders fixture data |

`client/src/concept2cure/mdx/__tests__/deviceScreensDescribeThemselvesTruly.test.ts` pins every `device-*` note and
the CER header against the catalog gate's build-status phrases, plus "sample mode". Red before (`red.txt`, 4 failing),
green after (`green.txt`).

Handed to the coordinator: `projects`'s note says "Partially built in ui_kits/home and ui_kits/mdx.", the same
build-status copy, outside this lane.

## M12, re-verified: not a defect

The study said `device-clinical-studies` lists every study in the organization, not the project's. That holds only
with no project open, where it is the documented portfolio. With a project open, `MdxSurfaceHost` passes
`programForContext` (`MdxSurfaceHost.tsx:438`), and `ClinicalStudiesSurface` calls `useClinicalStudies(program.id)`
(`ClinicalStudiesSurface.tsx:116-117`). That requests `?program_id=`, and the server filters by it
(`server/routes/mdx-clinical-studies.ts:119-122`). The study's row is corrected, not fixed.
