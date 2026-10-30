# Submit holds a device project's filing (D2, 2026-10-29)

Launch row D2, workstream "one AnA, one project". The working tree is over `a395292a`. None of the files below
changed between `5b541627`, where the red was taken, and `a395292a`.

Founder direction, today: move most "app" into the core of the product. The founder's request of 2026-10-23
(`62a8d5e7`, `shared/constants/launch-scope.ts`) made device disciplines and pathways features of the client's
project.

The slice in one line: a device project's Submit step tells it to assemble its filing, and it now offers the door to
do that. It is the same door Plan already offers.

## What already exists

- **The promise.** Submit's device guidance reads "Assemble the eSTAR or technical documentation from the approved
  documents." It is `PJ_LIFECYCLE` `nowDevice` in `client/src/concept2cure/v2/fixtures/project-home-data.tsx:352`,
  added in `2246406e`. The step's device blurb in `ProjectHome.tsx:1545` reads "Assemble eSTAR or the applicable
  technical documentation".
- **The door, on Plan only.** `client/src/concept2cure/v2/surfaces/ProjectMdxWorkflow.tsx`:
  - `PATHWAY_FEATURES` (`:30-35`) maps each pathway to its feature and door names: 510k to device-510k, pma to
    device-pma, mdr to device-cer, ivdr to device-diagnostics. De Novo has no entry.
  - `packageDestination` (`:79-85`) gives the submission-assembly workstream that pathway's feature and its
    `doors.assembly` name. With no pathway feature, it gives Author.
  - `Workstream` (`:99-140`) draws the button only when `available(surface)` is true (`:109`). Otherwise it
    offers the Evidence door.
  - The names are in `client/src/concept2cure/v2/projectDoors.ts:75-81`, `DEVICE_DOORS.pathway`. That file is in
    `v2/`, not `v2/surfaces/`.
  - The pathway comes from `mdxProjectPlan` (`:42-63`): `primary` is the filing type, else the regulatory path. Plan
    calls it only when `deviceFiling && prog` (`ProjectPlan.tsx:123`).
- **Submit before this change.** In `client/src/concept2cure/v2/surfaces/ProjectMarkets.tsx:438-465`, a device
  project got no Compile door and no Add a market. A note said it files "on their own pathways". It kept
  "Check what stops sending" and "See every sequence in Submission Center". `ProjectMarkets` received no project row,
  only booleans (`ProjectHome.tsx:1851`). So it could not know the pathway.
- **The door rule.** `client/src/concept2cure/v2/surfaceAvailable.ts` `useSurfaceAvailable()`. `ProjectHome.tsx:1421`
  passes it down as `available`.
- **The four features read the open project.** `client/src/concept2cure/mdx/MdxSurfaceHost.tsx:360-376` passes
  `programForContext` to `K510Surface`, `PmaSurface`, `CerSurface` and `IvdSurface`. The host refuses to mount them
  without an open device project (`:448-461`).
- **The three device-filing stores, not touched.** Submission Center's eSTAR tracker (`SubmissionCenter.tsx:580-600`,
  `/api/510k/estar/submissions`, `POST /api/510k/estar/assemble`). `device-submission`
  (`client/src/concept2cure/mdx/workbench/Workbench.tsx:572`, `/api/submission-ops/packages`, over
  `c2c_submission_packages`). And device-510k's own eSTAR panel. Choosing one store is
  `.design/client-journey/FUNCTION_PARITY.md:171-181`, and it is not this slice.
- **Accepted placement.** No accepted design contradicts a Submit door:
  - `.design/client-journey/INFORMATION_ARCHITECTURE.md` section 0, item 9 (`:215-217`), records "door only on Plan"
    for device-510k, device-pma and device-cer as today's gap.
  - Journey G (`:521-523`) runs Plan, then the eSTAR assembly, then Submit.
  - FUNCTION_PARITY `:463` places the MDR technical documentation at an MDR project's Submit step, and `:739` places
    the IVDR completeness verdict at the IVD Submit step.
  - `A2_8_MDX_PROJECT_DESTINATION.md` moves the `mdx` alias to filtered Projects. It does not touch Submit.
- **Today's sibling slices.** `../f16-device-door/` fixed the gate on Submission Center's device row door.
  `../device-features-in-project/` maps the 13 device features with no project door. Plan opens 8, and these four
  are among them.

Searches run:
- `DEVICE_DOORS`, `PATHWAY_FEATURES`, `doors.assembly`, "Assemble the eSTAR" and "file on their own pathways" over
  `client/src`;
- `'device-510k'` over `client/src` and `shared/`. `shared/navigation/callable-apps.ts` `ALIASES` maps mention
  handles, not pathways, and has no ivdr entry;
- `shared/regulatory/work-packages.ts`, whose `WorkPackage` has no surface field.

Deleted history: `git log --all --diff-filter=D` finds no deleted file matching submit, estar, assembl, 510k or
pathway. The clone is shallow (1029 commits, 58 deletions). `git log -S` finds the door name in `2246406e`,
`4626be1f`, `a70d06c5` and `b3661f72`, the device note in `06474618`, and `PATHWAY_FEATURES` in `62a8d5e7` and
`a70d06c5`.

## What changed

This slice reaches Plan's existing door from Submit. No new door, name or store.

- `client/src/concept2cure/v2/surfaces/ProjectMarkets.tsx`:
  - It takes an optional `project?: MdxWorkflowProject | null` (`:436`). That is the value Plan's `prog` takes.
  - `IndFormsDoor` becomes `FeatureDoor` (`:387`). It asks `available(surface)` first. A surface this release
    cannot open draws no button. It draws the `unavailable` words where they are given, and nothing otherwise.
    The IND forms door works as before.
  - `pathwayAssembly` (`:408`) uses Plan's rule: `deviceFiling && project`, then `mdxProjectPlan(project).primary`,
    then `PATHWAY_FEATURES`. It is imported, not copied.
  - `featureDoors` (`:415`) lists the step's feature doors. Moving the list out of `ProjectMarkets` keeps eslint's
    complexity at head (see `eslint.txt`).
  - When the feature cannot be opened, the step says "{feature label}, where this filing is assembled, is not part
    of this release." The label comes from `getSurfaceMeta`.
- The lead's edits, outside this slice's files:
  - `ProjectMdxWorkflow.tsx:30` now reads `export const PATHWAY_FEATURES`. No behaviour change.
  - `ProjectHome.tsx:1851` passes `project={prog?.id === pid ? prog : null}`, the same value as Plan's `prog` at
    `:1818`.
- New tests:
  - `client/src/concept2cure/v2/__tests__/projectSubmitDeviceFiling.test.tsx` renders the real ProjectHome on
    Submit. Locked surfaces come from mocked `useNavEntitlements` verdicts, so the door goes through
    `useSurfaceAvailable`.
  - `client/src/concept2cure/v2/__tests__/projectMarketsDeviceAssembly.test.tsx` renders `ProjectMarkets` directly
    with a project.
  - Both write each pathway's feature id as a literal expectation, so a door that opens the wrong feature fails.

What the door does, by case:

| Project | Submit offers |
|---|---|
| 510(k) / PMA / EU MDR / EU IVDR recorded | One door, `DEVICE_DOORS.pathway[p].assembly`, opening device-510k / device-pma / device-cer / device-diagnostics |
| Pathway only in the regulatory path ("510(k)") | The 510(k) door |
| Its feature locked in this release | Words, no button |
| De Novo, or no pathway recorded | No door, no words |
| Not yet read (even with the shell saying MDX) | No door until the read lands |
| A drug project | No device door |

## Red, then green

| | File | Result |
|---|---|---|
| Red, at `5b541627` plus the `PATHWAY_FEATURES` export, `ProjectMarkets.tsx` unchanged | `red.txt` | 10 failed, 3 passed. Every door and every "not part of this release" case fails. The 3 that pass are the no-door guards (De Novo, no pathway, drug), which hold at head by design. |
| Green, both new files | `green.txt` | 26/26 |
| Mutations | `mutations.txt` | 4/4 turn both files red. `ProjectMarkets.tsx` was restored byte-for-byte each time (sha256 `de2db6d4…` before and after). |
| Existing suites | `suites.txt` | 22 files, 269/269. None was red at head. |
| eslint | `eslint.txt` | `ProjectMarkets.tsx` 0 problems at head, 0 now. The new tests have 0. |
| Typecheck | `typecheck.txt` | Scoped `tsc`: exit 0. A probe passes Plan's `prog` type into `project`. It fails when given a wrong type. |

The mutations:

- **M1, the door dropped.** 19 tests fail.
- **M2, the availability gate dropped.** 8 fail: every locked case draws a button.
- **M3, the wrong pathway opened.** Every pathway gets the 510(k) feature. 14 fail.
- **M4, a pathway guessed.** 510(k) when none is recorded. 2 fail.

## Not done, and why

- **Pathways from the project's markets get no door.** Plan offers only the recorded filing's assembly door, so
  Submit does the same. A 510(k) project with an EU MDR market recorded gets the 510(k) door only. Giving the
  market's pathway a door too would need `filingToken` exported from `ProjectMdxWorkflow.tsx`. It would also go
  beyond what Plan offers.
- **De Novo gets no door.** Plan sends a De Novo assembly to Author through `onStage`, and `ProjectMarkets` has no
  `onStage`.
- **A recorded 510(k) with product type "drug" gets no door, on Plan or on Submit.** `mdxProjectPlan` returns null
  for a non-device product. The step still shows the device note, as before.
- **The MDR Annex II/III technical documentation is not reached.** FUNCTION_PARITY `:463` points it at the existing
  manifest and assemble routes. The MDR door opens device-cer ("Export the CER"), as Plan's does.
- **The destination screens are not fixed here.** IA `:604` and `:737` record untrue states in device-pma and
  device-diagnostics.
- **One store for device filings** is a founder decision (FUNCTION_PARITY `:171-181`).
