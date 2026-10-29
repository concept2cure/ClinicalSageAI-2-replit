# Device features inside the project

Launch row D2, workstream "one AnA, one project". Date 2026-10-29. Working tree over `86610174`.

**Status: blocked on the doors. The finding and its guard are done.**

None of the 13 unreached features can be given an honest project door from the files this slice owns. Nine
fold into a place the project already reaches, and one is the old device home. The other four belong in the
project, but their screens do not yet read the open project. A door to any of those four would open an
organisation-wide or empty screen. This slice adds a test that proves the placement against the rendered Plan.
It also records exactly what each blocked feature needs.

## The finding, re-verified

On 2026-10-23 (`62a8d5e7`) the founder made 21 MDX surfaces features of the client's project. They are listed in
`MDX_PROJECT_FEATURE_SURFACE_IDS` in `shared/constants/mdx-project-features.ts`, and the Projects app in
`shared/constants/launch-scope.ts` is pinned to that list.

Plan's device workflow (`client/src/concept2cure/v2/surfaces/ProjectMdxWorkflow.tsx`, `PATHWAY_FEATURES` and
`WORK_DESTINATIONS`, with door names in `client/src/concept2cure/v2/projectDoors.ts` `DEVICE_DOORS`) opens eight of
them: device-510k, device-pma, device-cer, device-diagnostics, device-clinical-studies, device-software,
device-engineering and device-postmarket.

The new test renders the workflow for every recorded route (510(k), De Novo, PMA, MDR, IVDR, and HDE, which has
no route), each device product type (device, samd, ivd, cdx), and each added filing (none, MDR, IVDR). It presses
every door and collects every surface opened. The result is exactly those eight. Nothing else in a project opens the
other 13:

- `onNav('<id>')` and `surface: '<id>'` over `client/src` find no caller.
- Subscription & features (`WorkflowCatalog.tsx`, `MdxCatalogSolution`) is an administrator's view. Its MDX
  section opens Projects, not the feature.
- ⌘K (`Shell.tsx`, the `UI_SURFACES` filter near line 838) lists them by search.

Note: `projectDoors.ts` is at `client/src/concept2cure/v2/projectDoors.ts`, not under `surfaces/`.

## What already exists

The map is `.design/client-journey/FUNCTION_PARITY.md`, the carry-over sections. Together with
`INFORMATION_ARCHITECTURE.md` (IA) section 5, convergences 3, 7, 8, 11 and 12, and slices 12, 19 and 20, it is the
accepted placement. `A2_8_MDX_PROJECT_DESTINATION.md`, `A2_10_REMAINING_FOLDS.md` and `SLICE_A2_PLAN.md` cover
device-workstream.

The device-* surfaces render through `client/src/concept2cure/v2/surfaces/DeviceSurfaces.tsx` into
`client/src/concept2cure/mdx/MdxSurfaceHost.tsx`. The host refuses to mount any of them, except device-workstream,
without an open device project. Being able to mount does not mean the screen reads that project.

| id | Component | Reads the open project? | Where the map places it |
|---|---|---|---|
| device-workstream | `mdx/surfaces/Overview.tsx` (host `:411`) | No. It is the organisation's device portfolio. | Fold into Projects. A2.8 moved the `mdx` alias. The screen, target and catalogue row wait for A2.10 parity (FUNCTION_PARITY "Into Projects"; IA §5 row). |
| device-vault | `mdx/surfaces/VaultSurface.tsx` (host `:396`) | Yes. `useVault(program.id)` calls `/api/mdx/vault?program_id=`. | Fold into Vault (FUNCTION_PARITY "Into Vault"; IA convergence 3, slice 4). |
| device-tasks | `TasksSurface`, `mdx/workbench/Workbench.tsx` (host `:399`) | No. The host labels it "Organization-wide view" (`ORGANIZATION_VIEWS`, `:182`). | Fold into Tasks. Marked safe to fold (FUNCTION_PARITY "Safe to fold today"; convergence 12). |
| device-validation | `ValidationSurface`, `Workbench.tsx` (host `:402`) | No. Labelled organisation-wide. | Fold into Submission Center (FUNCTION_PARITY "Into Submission Center"; convergence 7, slice 14). |
| device-submission | `SubmissionsSurface`, `Workbench.tsx` (host `:405`) | No. Labelled organisation-wide. | Fold into Submission Center (same section; slice 14). |
| device-analytics | `mdx/surfaces/AnalyticsSurface.tsx` (host `:408`) | No. Labelled organisation-wide. | Fold into Reporting & analytics, `insights` (FUNCTION_PARITY "Into Reporting & analytics"; convergence 11, slice 26). |
| design-controls | `v2/surfaces/DesignControls.tsx` | No. `GET /api/design-controls` reads the organisation's design inputs. | Fold into device-engineering (FUNCTION_PARITY "Into device engineering"; convergence 8, slice 19). |
| risk | `v2/surfaces/Risk.tsx` | No. `GET /api/mdx/risk-items` returns the organisation's hazard register. | Fold into device-engineering (same section; slice 19). |
| ivd-completeness | `v2/surfaces/IvdCompleteness.tsx` | No. `GET /api/ivd-completeness/completeness` is an organisation-scoped read model. | Fold into device-diagnostics' readiness panel (FUNCTION_PARITY "Into device diagnostics"; convergence 8, slice 19). |
| device-presub | `mdx/presub/PreSubManager.tsx` (host `:393`) | No. `usePresubList()` (`mdx/hooks/usePresub.ts:215`) calls `/api/q-sub` with no program. Labelled organisation-wide. | In the project: a Plan destination in `WORK_DESTINATIONS` (IA §5 row, slice 12). |
| device-udi | `mdx/surfaces/UdiSurface.tsx` (host `:387`) | No. It calls `useUdi()` with no program. Labelled organisation-wide. | In the project: the `registration-udi` package, at the check step (IA §5 row, slice 20). |
| labeling | `v2/surfaces/Labeling.tsx` | No. It reads `/api/mdx/labeling?program_id=` only when given `programId`, and no caller passes one, so it reads nothing (`:130-148`). | In the project: the `labeling` package, at the draft step (IA §5 row, slice 20). |
| human-factors | `v2/surfaces/HumanFactors.tsx` | No. `GET /api/human-factors` returns the organisation's first file (`server/routes/human-factors.ts:92`). The screen hides its panels unless the response says `meta.scope === 'program'` (`:124`), and the route never says that. | In the project: the `human-factors-usability` package (IA §5 row, slice 19). |

Searches run:

- The 13 ids, their components and hooks across `client/src`, `server/routes` and `shared`.
- `MDX_PROJECT_FEATURE_SURFACE_IDS` and `isMdxProjectFeature` callers.
- `onNav('<id>')` and `surface: '<id>'` for all 13.
- `git log --all -S` for each id over ProjectMdxWorkflow, projectDoors, ProjectPlan and ProjectHome. Only
  `'design-controls'` matched, in `62a8d5e7`, and that hit is the work-package key that already opens
  device-engineering.
- `git log --all --diff-filter=D` over the HumanFactors, Labeling, Udi, PreSub, DesignControls, Risk, IvdCompleteness,
  projectDoors, ProjectMdxWorkflow, DeviceWorkstream and `mdx/**` names. Only `0fc2fc29` was found, which deleted the
  MDX TemplatesSurface.

This checkout is shallow (1,029 commits). A2.10's `2895218b8` (the older DeviceWorkstream shell) is not in it, so the
deleted-history search does not prove anything about older history. No earlier project door to any of the 13 was
found.

## Placement

| Group | Ids | Door from the project? |
|---|---|---|
| (a) project discipline, by the map | device-presub, device-udi, labeling, human-factors | Not yet. Each screen's read does not take the open project (see the table above). |
| (b) a copy of a place the project already reaches, to be folded | device-tasks, device-vault, device-analytics, device-validation, device-submission, design-controls, risk, ivd-completeness | No. A door would keep the duplicate. design-controls and risk fold into device-engineering, and ivd-completeness folds into device-diagnostics. Plan already opens both. |
| (c) the old device home | device-workstream | No. The `mdx` alias reaches filtered Projects (A2.8). The screen, AnA target and catalogue row stay until A2.10's remaining parity rows are carried. |

design-controls, risk and ivd-completeness looked like project disciplines in the starting finding. The map folds
them into device-engineering and device-diagnostics instead. Their reads are also organisation-wide.

## What each blocked feature needs before it gets a door

None of these files is in this slice. The server routes for three of them already filter by program.

- **device-presub.** `usePresubList(programId)` calls `/api/q-sub?program_id=`. The route already filters, at
  `server/routes/q-sub.ts:80,122`. `PreSubManager` takes the program, and the host passes `programForContext` at
  `MdxSurfaceHost.tsx:393`. Remove it from `ORGANIZATION_VIEWS`. Then give it a door in `WORK_DESTINATIONS`, offered
  only for a recorded FDA route (510(k), De Novo, PMA), never for MDR or IVDR. Add its name to `DEVICE_DOORS`
  ("Prepare a Pre-Sub for FDA", IA §5).
- **device-udi.** `UdiSurface` takes the program and calls `useUdi(program.id)`. The hook supports it
  (`useUdi.ts:60-66`) and the route filters (`server/routes/mdx-udi.ts:133-205`). The host passes the program at
  `:387`. Remove it from `ORGANIZATION_VIEWS`. Then point `registration-udi` here instead of Author.
- **labeling.** `Labeling` reads the open project. Either it calls `useShellProject()` (`v2/shellProject.ts:302`)
  when no `programId` is passed, or the shell passes one. The route already filters
  (`server/routes/mdx-labeling.ts:82-101`). Then point the `labeling` package here.
- **human-factors.** Add `program_id` to `hf_engineering_files`. Per Rule 1, the change is additive and goes in
  `IF NOT EXISTS` or into the creating migration. The route reads by program and reports `meta.scope: 'program'`,
  which the screen already gates on, and the screen sends the open project. Then map `human-factors-usability`
  here. Today it falls through to Evidence.

When one of these lands, its door must be checked against what the slice asked for:

- it is gated on `available(id)`;
- it shows only on a device project, since `mdxProjectPlan` returns null for a drug;
- it shows only for the pathway or product type it applies to.

The guard below then needs its id moved from `NO_PROJECT_DOOR` to `REACHED_FROM_PLAN` in the same change.

## Fold list for group (b)

Each fold is recorded in FUNCTION_PARITY with every function to carry. The summary below says what each fold needs.

| Fold | Into | What it needs |
|---|---|---|
| device-tasks | Tasks (`TaskBoard.tsx`) | Already safe. Delete only `TasksSurface` and retarget `demo-scripts.ts:290`. Its other functions are optional. |
| device-vault | Vault | The AnA-draft branch across the device project's documents. Status, version and author on each leaf. Folder rail by CTD module. Hash and author in the detail pane. Version history and audit trail there too. Retire the catalogue entry. Drop the unbacked retention subtitle and the prompt-only buttons. |
| device-analytics | Reporting & analytics | Program KPI counts scoped to accessible projects. AnA acceptance rate and 24-month pace. Blockers by root cause, with Ask AnA. The uncalled server facets routed to their homes. The feature list and the Projects app list change in one commit. |
| device-validation | Submission Center | Readiness and KPIs already have homes. The organisation-wide blocker list, its severity filter, CSV and triage go to Reporting, if kept. The "Pass" defect for low-severity blockers is not carried. |
| device-submission | Submission Center | One store for device filings, with migration, in the Portfolio device-filings table. A transmit gate on each eSTAR row. A milestone event history. AnA's `create_submission_package` retired or repointed. Drop the invented target labels. |
| design-controls | device-engineering | An additive `program_id` on `c2c_design_controls`. The trace matrix, gaps and §7.3 checklist (`server/services/regulatory/design-controls.ts`). An add-input form that records the program. AnA context. |
| risk | device-engineering | Writes that send the program, with orphaned rows assigned. The 5×5 matrix, hazard drawer and metrics (`iso-14971-risk.ts`). Add hazard, add control, and accept residual risk as a governed act. AnA screen actions re-registered. |
| ivd-completeness | device-diagnostics | The completeness verdict read per project in the IVDR readiness panel. Classification and GSPR items. Per-study, PER and PMPF panels. The Annex VIII save, with `20260610_ivd_assessments.sql` put on `C2C_MIGRATION_FILES`. The FSN draft goes to device-postmarket. Grants mapped and the id removed. |

## What changed

- `client/src/concept2cure/v2/__tests__/ProjectMdxWorkflow.test.tsx` gains the block "device features inside the
  project". It checks three things:
  - each of the 21 features is placed exactly once, either opened from Plan or listed with its reason;
  - a device project's Plan opens exactly the eight, over every recorded route, product type and added filing;
  - each of the 13 has no door, and a failure prints the reason.
- No product code changed. `ProjectMdxWorkflow.tsx` differs from HEAD only by the lead's `export const
  PATHWAY_FEATURES`, which this slice kept.

## Proof

- There is no red-first run, because no behaviour was added.
- `green.txt`: five suites, 83 tests, all passing. At head before the change there were 68.
- Mutations, each restored from a scratch copy and confirmed with `cmp`. `git diff` on the product files then shows
  only the lead's export line.
  - `mutation-M1-udi-door.txt` points `registration-udi` at device-udi. Two tests fail; one names the
    organisation-wide read.
  - `mutation-M2-design-controls-fold-door.txt` points the design-controls package at the fold source. Three tests
    fail, including the existing door test.
  - `mutation-M3-labeling-door.txt` points the labeling package at labeling. Two tests fail.
  - `mutation-M4-unplaced-feature.txt` leaves one project feature unplaced. The placement test fails.
- The slice's own mutations do not apply, because no door was added: dropping the availability gate, showing doors on
  a drug project, and showing an IVD-only door on a non-IVD device. The existing suite already covers the first two
  for current doors ("never offers a locked feature"; `mdxProjectPlan` returns null for a drug).
- `eslint.txt`: zero problems on the test file, both at head and now.
