# Fold F5: device filings into Submission Center (D2, 2026-10-29)

Launch row D2 (one AnA; the device folds). The working tree is over `96a9ecf58`.

- Decision: `docs/LAUNCH_DEFINITION_OF_DONE.md` P-61, items 1 and 2 (store, blocker list) and 4 (grant continuity).
- Plan: `docs/design/DEVICE_FOLDS_2026-10-29.md`, the common checklist and "F5".

| Item | What | State |
|---|---|---|
| 2 | `device-validation`, the organization-wide blocker list, retires | **done** (this section) |
| 1 | `device-submission` into Submission Center over `estar_submissions` | see "Item 1" |

## Item 2: no organization-wide blocker list (P-61 item 2)

The decision: blockers belong to a filing, from that filing's deterministic readiness (EstarFilingPanel).
`device-validation` and its `c2c_blockers` list retire. Its "Pass" for a low-severity blocker is not carried: a
blocker is closed by fixing it, or by a named person's signed waiver.

**There is no signed waiver of a filing blocker in the product today, and none is built here.** The eSTAR filing
readiness (`assessEstarFilingReadiness`, `server/services/pathway-engines/estar/estar-filing-readiness.ts:256-340`)
has no severity and no waiver: `canFileNow` is the conjunction of registration, content, template, version and
request-specific automation, and every failing dimension is a blocker. A blocker closes only when its cause is fixed.
The one signed waiver in the product is Shadow Review's (P-34, `server/services/ectd/shadow-review-waiver.ts`), and it
waives a failed Shadow Review run on an eCTD sequence, not a device filing blocker. Whether a filing blocker may be
waived, and by whom, is the lead's decision (see "Decisions").

### What already exists

| Piece | Path | What it does today | What it does not do |
|---|---|---|---|
| The retired screen | `client/src/concept2cure/mdx/workbench/Workbench.tsx` `ValidationSurface` (head `:132-363`), mounted by `mdx/MdxSurfaceHost.tsx` | Lists the open `c2c_blockers` rows of every project (GET `/api/submission-ops/blockers`), recorded progress per project, four KPI cards, a severity filter, a CSV export and an AnA triage prompt | Attributes a blocker to a program (the store names a project only); assesses a filing; draws an open `low` blocker as a blocker (it was "Pass" before slice 0, then "warn") |
| Its hook | `client/src/concept2cure/mdx/hooks/useWorkbench.ts` `useWorkbenchValidation` | Adapts the rows, derives the KPI cards | — |
| Its shapes | `client/src/concept2cure/mdx/data/workbench.ts` `ValidationSummary`, `ValidationProgram`, `ValidationRule` (severity `'err' \| 'warn' \| 'ok'`) | — | — |
| The blocker store | `c2c_blockers` (`shared/schema.ts:7019`; created by `migrations/0002_phase15_submission_ops.sql`, on no deploy applier, and by drizzle push on install-fresh) | One live writer: correspondence intake opens a blocker for an issue flagged as blocking when the project has an open package (`INFORMATION_ARCHITECTURE.md:898`) | — |
| The list route | `server/routes/submission-ops.ts:1247` GET `/blockers`, `:1297` PATCH `/blockers/:blockerId` | Lists and updates `c2c_blockers` for the organization | — |
| **A filing's readiness (the replacement)** | `client/src/concept2cure/mdx/surfaces/EstarFilingPanel.tsx`, mounted by `K510Surface.tsx:822`, `PmaSurface.tsx:316`, `IvdSurface.tsx:636` for the open project; POST `/api/510k/estar/filing-readiness` (`server/routes/510k-estar-routes.ts:1845`) | Assesses one eSTAR submission type against the project's own authored content (`programId` required since the org-wide read was found); "Can file now" or "Blocked" with every blocker named | Persist the verdict; take a waiver |
| **The filings list (where the alias lands)** | `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx` "Device filings · eSTAR" (`:584-595`, `:1579-1680`) | Lists every tracked filing (`estar_submissions`, GET `/api/510k/estar/submissions`, which admits each row's project), with the 510(k) device assembly verdict in the header and "Open 510(k) surface" on each row | A per-row gate (item 1) |
| Grant continuity | `server/services/entitlements/folded-module-successors.ts` | Carries a folded module's live grant to its target | — |
| AnA | `shared/navigation/index.ts:210` (`device-validation` target, "The device validation workbench") | — | — |
| The tour | `shared/navigation/demo-scripts.ts:319-322` (`training-medtech`) | Said "The validation center is where V&V evidence lands and its completeness is tracked against the plan" over a screen that read `c2c_blockers` | — |

Searches run: `device-validation`, `ValidationSurface`, `useWorkbenchValidation`, `Validation center`, `Submission
blockers`, `c2c_blockers`, `submission-ops/blockers`, `val-prog-card`, `waiv` (over `client/src`, `shared`, `server`,
`scripts`, `tests`, `migrations`, `db/migrations`); `EstarFilingPanel`, `filing-readiness`, `assessEstarFilingReadiness`.
History: `git log --all --diff-filter=D` over `*Validation*`, `*Workbench*`, `*blocker*`, `*Submissions*`,
`*submission-ops*`, `*estar*`, `*filing*` (`history-search.txt`): no earlier blocker list or validation screen was
deleted. The clone is shallow (1,447 commits).

Nothing is built beside an existing piece: the replacement is the existing filing readiness and the existing filings
list; the alias, the scope lists and the grant mapping are the existing mechanisms.

### Parity (`.design/client-journey/FUNCTION_PARITY.md`, "From `device-validation`", updated)

| Function | Where now |
|---|---|
| Organisation-wide list of open blockers, its severity filter, CSV export, KPI cards, triage prompt | Not carried (P-61 item 2) |
| Filter by program | Not carried; it always returned nothing |
| Recorded progress by project | Not carried here; Insights and the Project home dossier read it |
| Each filing's blockers | EstarFilingPanel's readiness, on the 510(k), PMA and IVD screens for the open project |
| "Pass" for an open low-severity blocker | Not carried (the defect) |

### The checklist, as done

1. **Deleted:** `ValidationSurface` and its constants (`Workbench.tsx`), `mdx/hooks/useWorkbench.ts`,
   `mdx/workbench/__tests__/ValidationSurface.whatItReads.test.tsx`, and the three validation shapes in
   `mdx/data/workbench.ts`. Nothing else imported them. `noFavourableDefaults.test.tsx` loses its
   `useWorkbenchValidation` case (it pinned the retired hook's honesty; the filing verdict is the engine's,
   `estar-filing-readiness.test.ts`). `PanelState` went with its only user.
2. **The host** (`MdxSurfaceHost.tsx`): the import, the meta entry, `ORGANIZATION_VIEWS`, the publish call (thirteen
   now) and the switch case.
3. **The registry:** the id leaves `mdx/surfaceIds.ts`, `v2/surfaceViews.ts` and `ui-surface-registry.ui-v2.ts`. Its
   claim `/api/submission-ops/blockers` has no client caller; `device-submission` claimed it too only because both
   screens shared one file, so `device-submission` now claims nothing (its screen calls `/api/submission-ops/packages`,
   which the Vault, Tasks and Communication claim). The route has no claimant now (`tools/claimants.mts.txt`), so the
   production gate refuses it. `launch-scope-device-features.test.ts` `HOOKS` loses `useWorkbench.ts`.
4. **`registryModel.ts`:** alias `device-validation` → `submission-center`; out of the device rail's "Submit & file".
   It was in no `NAV_GROUP_OF`, `NAV_HIDDEN`, focus list or `SURFACE_ACTIONS`.
5. **Scope lists:** out of `launch-scope.ts` (Projects) and `mdx-project-features.ts`; guard in `launch-scope.test.ts`,
   "the retired organization-wide blocker list".
6. **Catalogue (Rule 1):** `db/migrations/20260810_reconcile_module_catalog.sql` (keep-list and upsert) and
   `db/migrations/20260823_module_catalog_commercial_packaging.sql` (packaging row), each amended in place with a dated
   header. No DELETE, no DROP; subscriptions kept. A fresh database holds no row; a deployed one keeps it, deprecated,
   with its tier and subscriptions (`catalogue-at.txt`; contract cases "Retired organization-wide blocker list").
7. **AnA:** the `device-validation` target stays, resolves through the alias, and says what is there now ("Device
   filing readiness": Submission Center, and each filing's own readiness on its pathway screen).
8. **The tour:** `training-medtech`'s stop speaks a filing's own readiness and navigates to `submissions` (Submission
   Center).
9. **CI:** `ID_BASELINE` 103 → 102; `REAL.components` loses `device-validation`; `dump-v2-surfaces.spec.tsx`;
   `ProjectMdxWorkflow.test.tsx` `NO_PROJECT_DOOR` (15 project features remain).
10. **Fold guard:** `client/src/concept2cure/v2/__tests__/foldDeviceValidation.test.ts`.
11. **Grant continuity:** `FOLDED_MODULE_SUCCESSORS['device-validation'] = 'submission-center'`. Found by replaying the
    catalogue writers (`catalogue-at.txt`): `device-validation` was a catalogue module at standard, and
    `submission-center` is a live catalogue module at standard, with no industry list, so a plan that included the
    source includes the target and only a grant carries. The pin's `CARRIED` table gains the row.

### Deletion (working agreement)

| Deleted | Replacement, by path | Reachability test |
|---|---|---|
| `ValidationSurface` (`mdx/workbench/Workbench.tsx`), `mdx/hooks/useWorkbench.ts` | Each filing's readiness: `mdx/surfaces/EstarFilingPanel.tsx`, mounted by `K510Surface.tsx`, `PmaSurface.tsx`, `IvdSurface.tsx`; the filings list: `v2/surfaces/SubmissionCenter.tsx` (alias `device-validation` → `submission-center`) | `foldDeviceValidation.test.ts` (the alias from a link, a move and AnA, with or without a project; Submission Center reads `estar_submissions`; the panel assesses for the project and is mounted by all three); `EstarFilingPanel.render.test.tsx` |

### Red, green, make the check fail

- **Red** (`item2/red.txt`): the four pins written first, at head: **13 failed of 97**. The fold guard 4 of 5 (its
  "lands on Submission Center" case passes at head, as the replacement exists); the grant pin 6 (no carried grant:
  a free-plan organization holding only `device-validation` was refused Submission Center's paths); the scope guard
  1; the catalogue cases 2. After the red, the guard's name check was narrowed to the retired identifiers, because an
  unrelated `ValidationSummary` exists in `v2/fixtures/intelligence.ts`; V9 below is its red.
- **Green** (`item2/green.txt`): the 9 suites the change edits, 155 of 155. Every suite naming a list the change edits,
  204 files in one run: 3,075 passed, 34 skipped, 5 failed in two files of the CSR draft lane (an `authService` mock in
  `v2/editor/authoringCurrentRead.ts`, and a CSR entry point), each failing alone the same way; neither touches a
  file of this change.
- **Mutations** (`item2/mutations.txt`, runner `tools/mutate.py.txt`, spec `tools/mutation-spec-item2.json`): **13 of
  13 red**, each restored byte for byte, and `sha256sum -c` over the 25 changed files after the run.

| Id | Mutation | Red on |
|---|---|---|
| V1 | no alias | fold guard, grant pin |
| V2 | left in the Projects scope list | scope guard, fold guard |
| V3 | left in the project features | scope guard, fold guard |
| V4 | the host publishes `device-validation` | fold guard |
| V5 | a client file lists `/api/submission-ops/blockers` | fold guard |
| V6 | back on the device rail | fold guard |
| V7 | the tour stops there again | fold guard |
| V8 | AnA's handle describes the retired workbench | fold guard |
| V9 | the kit keeps a `ValidationRule` shape | fold guard |
| V10 | the mapping drops it | grant pin (4) |
| V11 | 20260810 upserts it again | catalogue suite cannot start: "catalog modules with no tier assigned: device-validation" (a deploy would fail) |
| V12 | 20260810 keeps it on the keep-list | catalogue replay case |
| V13 | 20260823 keeps its packaging row | catalogue suite cannot start: "packaging names modules that are not in available_modules" |

### Gates (`item2/gates.txt`)

All pass: `ci:launch-scope` (7 apps, 44 surfaces, 12 modules) and its selftest; `ci:launch-scope-api` (563 paths,
none refused) and its selftest; `ci:ana-surface-context` (102 of 106 routable ids, baseline 102 exact);
`ci:surface-discoverability` (108 renderable); `ci:migration-drop-safety` and its selftest; `ci:migration-set-order`;
`ci:migration-deploy-path` and its selftest; `check:catalog-copy`; `ci:undefined-css-classes`;
`ci:unreferenced-modules`; `ci:program-ownership-single-source`.

- **eslint** (`item2/eslint.txt`): every changed file at or below head; `Workbench.tsx` 4 → 2; the new guard 0.
- **tsc**, scoped (`item2/typecheck.txt`, `tools/tsconfig.item2.json.txt`): 10 errors over 2,381 files, none in a
  changed file (CSS-module declarations and the Express `Request` augmentation the scoped include does not load).
- **`scripts/db/migration-set.mjs`: no lines of mine in item 2.** No table is added, so `ci:purge-coverage` does not
  apply.

### Not carried, not done (item 2)

- `GET /api/submission-ops/blockers` and `PATCH /blockers/:blockerId` stay on the server with no claimant, so the
  production gate refuses them; `c2c_blockers` keeps its correspondence-intake writer, and nothing lists it. Closing
  the routes and the writer is a separate decision.
- The `.val-*` rules in `mdx/app.css` have no user now; the stylesheet is shared, and is left alone.
- `docs/design/DEVICE_FOLDS_2026-10-29.md` and `INFORMATION_ARCHITECTURE.md` are not edited; `FUNCTION_PARITY.md` is.
- Not run here: the real-PostgreSQL suites and the whole-tree typecheck.

### Decisions (item 2)

1. **A signed waiver of a filing blocker.** P-61 allows "a named person's signed waiver"; none exists for a device
   filing. Whether to build one (on the filing readiness, through `signGovernedAct`, as Shadow Review's waiver is) is
   the lead's call. Until then a blocker closes only when it is fixed.
2. **The blocker routes and the correspondence-intake writer:** keep (refused by the gate, unlisted) or close.
