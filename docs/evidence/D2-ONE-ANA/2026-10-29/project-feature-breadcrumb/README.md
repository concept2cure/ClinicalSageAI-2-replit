# Project features are crumbed under the open project

Row D2 (one AnA, one shell). 2026-10-29.

On 2026-10-23 (62a8d5e7) the founder made the MDX device disciplines and pathways
features of the client's project. They sit under the Projects app in
`shared/constants/launch-scope.ts`, pinned to `MDX_PROJECT_FEATURE_SURFACE_IDS`
in `shared/constants/mdx-project-features.ts`. Only the `mdx` deep-link alias
moved then. The shell's breadcrumb and ⌘K still presented the features as the old
"Medical Device & IVD" app, and the breadcrumb did not name the project.

This change fixes the labels only. Every surface keeps its id, route and entitlement.

## What already exists

Searches run: `NAV_TIERS_V2`, `NAV_GROUP_OF`, `navGroupOf`, `breadcrumbTierOf`,
`surfacesByTier`, `crumb-tier`, `crumbs`, `Medical Device & IVD`,
`MDX_PROJECT_FEATURE_SURFACE_IDS`, `isMdxProjectFeature`, `useShellProject`,
`shellProjectName`, `Projects ›` and `crumb` across `client/src`, `shared`, `server`,
`scripts` and `docs`. `SEGMENT_MODULES`, `getSegmentModules` and `SEGMENTS[].focus`
were searched for callers.

- `shared/constants/mdx-project-features.ts`: the 21 project-feature ids and
  `isMdxProjectFeature`. `shared/constants/launch-scope.ts` lists the same ids under
  the Projects app, and `shared/constants/__tests__/mdx-project-features.test.ts` pins
  the two lists together.
- `client/src/concept2cure/v2/registryModel.ts`:
  - `NAV_TIERS_V2` (mdx, biopharma, admin) and `NAV_GROUP_OF`. `NAV_GROUP_OF` puts five
    ids in `mdx`: device-workstream, labeling, risk, design-controls and human-factors.
  - `navGroupOf` (`?? 'both'`) already fixed a similar mislabel, launch sweep finding
    128: the breadcrumb used to default to "Biotech & Pharma".
  - `breadcrumbTierOf` is the one function the breadcrumb's parent crumb and ⌘K's
    hint column both read.
- `client/src/concept2cure/v2/Shell.tsx`:
  - `TopBar` draws `Concept2Cure.RI › <tier> › <here>`. On the project page, `<here>`
    is the open project's name from `shellProjectName(useShellProject())`.
  - `ProjectChip` names the project the same way: its code, or its title when it has
    no code.
  - In `CmdK`, `navResult` sets the hint to `breadcrumbTierOf(s)?.label`.
- `client/src/concept2cure/v2/shellProject.ts`: the shell's one open-project channel
  (`useShellProject`, `publishShellProject`).
- `client/src/concept2cure/mdx/MdxSurfaceHost.tsx` reads the same channel, so the
  features are already project-scoped.
- `client/src/concept2cure/v2/catalogWorkflows.ts` and `surfaces/WorkflowCatalog.tsx`
  already group these features under Projects with `isMdxProjectFeature`.

What the shell did at HEAD 5b541627, re-verified by the red run below:

| Surface | Breadcrumb | ⌘K hint |
|---|---|---|
| risk, project NPX-510 open | Concept2Cure.RI › Medical Device & IVD › Risk management | Medical Device & IVD |
| design-controls, labeling, human-factors | the same: the old tier, no project | Medical Device & IVD |
| device-workstream | Concept2Cure.RI › Medical Device & IVD (its own registry label; the same-name rule dropped the tier) | none |
| the other 16 features, e.g. device-510k | Concept2Cure.RI › 510(k) and eSTAR (grouped "both", so no parent) | none |
| project-home | Concept2Cure.RI › NPX-510 | none |

Other readers of the tier data. These were left alone:

- `surfaces/Surfaces.tsx:406`, the `KitSurfaceScaffold` eyebrow, reads `NAV_TIERS_V2`
  and `NAV_GROUP_OF` directly, with its own `?? 'biopharma'` default. That is the
  finding-128 default, still present there. It renders only for a surface with no
  view (`V2App.tsx:1194`). The MDX features have views. Because of this reader, the
  `mdx` entry in `NAV_TIERS_V2` stays.
- `surfacesByTier` (registryModel.ts:1060) has no caller outside tests
  (`registryModel.test.ts`, `shellChromeTruth.test.tsx`).
- `SEGMENT_MODULES` (:645) and `getSegmentModules` (:932) have no caller outside
  `registryModel.ts`.
- `SEGMENTS[].focus` (registryModel.ts:225-232 and each other segment's list) is never read.

## What changed

- `registryModel.ts`:
  - New `PROJECTS_CRUMB`: id `projects`, with the label of the `projects` registry
    surface.
  - `breadcrumbTierOf` returns `PROJECTS_CRUMB` first for any
    `isMdxProjectFeature(id)`. So the breadcrumb and ⌘K now name Projects as the
    parent of all 21 features, and no surface is crumbed "Medical Device & IVD".
  - A note on `NAV_TIERS_V2` says why its `mdx` entry stays.
  - `NAV_GROUP_OF` and the `NAV_TIERS_V2` data are unchanged.
- `Shell.tsx`, `TopBar`: when the parent is Projects, a project crumb follows it. It
  uses the existing `crumb-tier` class and the same `shellProjectName` the chip and
  the project page use. With no project open, or one opened by id alone (no name in
  the channel), there is no project crumb and the trail is `Projects › <feature>`.
- `Shell.tsx`, `CmdK`: a comment only. The hint already read `breadcrumbTierOf`, so
  it now says Projects.
- `__tests__/shellChromeTruth.test.tsx`: the finding-128 block pinned the old
  decision, and now follows the 2026-10-23 one:
  - device-510k and device-pma are out of the "belongs to both" list.
  - The risk → "Medical Device & IVD" assertion is gone.
  - device-workstream's parent is Projects.
  - The rail-consistency check skips Projects, as it skips Admin, because Projects is
    not a client category.
  - The device-510k header reads `Concept2Cure.RI › Projects › 510(k) and eSTAR`.
- New `__tests__/projectFeatureBreadcrumb.test.tsx` (16 tests).

The project is named by `shellProjectName`: its code, or its title when it has no
code. This is the name the chip beside the breadcrumb and the project page's crumb
already show, so one project is never named two ways in one top bar.

The project page's own crumb is unchanged (`Concept2Cure.RI › NPX-510`, with no
Projects crumb). A test pins that.

## Red, green, mutations

- `red.txt`: the new test against unchanged source fails 13 of 16. It shows the
  trail as `Concept2Cure.RI › Medical Device & IVD › Design controls (DHF)`, no
  project crumb, four surfaces crumbed with the old tier, and ⌘K hinting
  "Medical Device & IVD". The three tests that pass are the ones guarding
  unchanged surfaces.
- `green.txt`: 16 of 16 pass with the fix.
- `mutation-1-old-tier.txt`: removing the project-feature branch in
  `breadcrumbTierOf` fails 13.
- `mutation-2-no-project-name.txt`: dropping the project's name from the crumb fails 6.
- `mutation-3-invented-name.txt`: falling back to "This project" when the channel has
  no name fails 2.

Each mutation was restored from a byte copy, and its sha256 matched the fixed file.
`git diff` afterwards shows only the intended change.

## Existing suites

`related-suites.txt`:

- Before the change: 22 files, 1 red. It is `navTargets.test.tsx`
  (`ProjectBiotechPlan.tsx → 'document'`, a dead navigation target). It is committed
  in HEAD and outside this slice's files. It stays red.
- With the fix, before the test update: shellChromeTruth's five finding-128 tests
  failed, as described above.
- Final: 30 files, 328 of 329 tests. The one red is the same navTargets test.
- Seven shell-rendering suites were run only after the change:
  accountMenuMasterLicensing, accountPanel, liveDriveBackToConversation,
  liveDriveDefaults, liveDriveShell, organizationAccess and projectHomeStepReturn.

## Lint, typecheck, CSS classes

- `eslint.txt`: every changed file is at its HEAD count. Shell.tsx has 0 errors and 5
  warnings, registryModel.ts 0 errors and 1 warning. The two test files are clean.
- `typecheck.txt`: no type error on a changed line. The full project run needs a
  24 GB heap and this machine has 15 GB, so the changed files were checked through a
  scoped config.
- `npm run ci:undefined-css-classes` passes. The project crumb uses the existing
  `crumb-tier` class.

## Left for a later slice

- device-workstream's own registry label is "Medical Device & IVD"
  (`shared/constants/ui-surface-registry.ui-v2.ts`), so its page is still named
  that, now under `Projects › <project>`.
- The project page's crumb has no Projects crumb, while a project feature's crumb
  does.
- The `KitSurfaceScaffold` eyebrow still defaults to "Biotech & Pharma" (see above).
