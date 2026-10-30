# Fold F5: device filings into Submission Center (D2, 2026-10-29)

Launch row D2 (one AnA; the device folds). Item 2 was built over `96a9ecf58` and committed as `041880cbd`; item 1 over `041880cbd`.

- Decision: `docs/LAUNCH_DEFINITION_OF_DONE.md` P-61, items 1 and 2 (store, blocker list) and 4 (grant continuity).
- Plan: `docs/design/DEVICE_FOLDS_2026-10-29.md`, the common checklist and "F5".

| Item | What | State |
|---|---|---|
| 2 | `device-validation`, the organization-wide blocker list, retires | **done** (`041880cbd`) |
| 1 | `device-submission` into Submission Center over `estar_submissions` | **done** (see "Item 1") |

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

### Decisions (item 2), as ruled by the lead

1. **No signed waiver.** A condition that does not apply belongs in the readiness rules; a person's signed "not
   applicable", if customers need it, is a later decision of its own.
2. **`/api/submission-ops/blockers` stays refused.** What still reads `c2c_blockers` is under item 1, "What still
   reads it".

## Item 1: one device-filing store, `estar_submissions` (P-61 item 1)

The decision: one device-filing store, `estar_submissions`, which is on the deploy set and admits the project.
`c2c_submission_packages`, whose creator (`migrations/0002_phase15_submission_ops.sql`) is on no applier, is migrated
behind `to_regclass` guards and retired. Then, in order: a status filter, a per-row gate from EstarFilingPanel's
readiness, an event history, and AnA's `create_submission_package` repointed.

Built over `041880cbd` (item 2 committed).

### What already exists (item 1)

| Piece | Path | What it does today | What it did not do |
|---|---|---|---|
| The retired screen | `client/src/concept2cure/mdx/workbench/Workbench.tsx` `SubmissionsSurface`, `mdx/hooks/useSubmissions.ts`, `mdx/data/workbench.ts` | Every `c2c_submission_packages` row of the organization (all families, IND included), a 7-stage pipeline from `metadata.stage`, a package gate from `/packages/:id/readiness`, a milestone log from `/packages/:id/milestones`, a status filter, a "Transmit" button that only prompted AnA | Read `estar_submissions`; admit a project; transmit anything |
| The package store | `c2c_submission_packages` (`shared/schema.ts:6764`; created by 0002, on no deploy applier, and by drizzle push on install-fresh) | Written by POST `/api/submission-ops/packages` and AnA's `create_submission_package`; read by the submission-ops package routes (sections, readiness, assemble, publish, preflight), the package transmit's author check (`governed-transmit-checks.ts`), AnA's ESG transmit (`mdx-command-handlers.ts`), Submission Twin (`tool-record-scope.ts`), the eCTD content-change fingerprint, `mdx-analytics`, `mdx-health` and the tenant purge | — |
| Package milestones | `c2c_milestones` (0002) | The retired screen's activity log | — |
| **The filing store** | `estar_submissions` (`migrations/20260730_estar_submission.sql`, `_project_link.sql`, `20260908b`, all on the set); `server/services/pathway-engines/estar/estar-submission-service.ts`; `server/routes/510k-estar-routes.ts` `/submissions` | Start tracking (POST, editor, admits the project), list and read (admit each row's project), advance (PATCH), the signed filing (`applySignedFiling`: vault artifact, ledger, electronic signature on one transaction) | A history: the only trace of a change was the §11.10(e) audit row, written after the commit (`recordAuditRow`, which may not persist) |
| **Submission Center's device table** | `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx` (head `:200-315`, `:584-620`, `:1579-1680`) | Every tracked filing (GET `/api/510k/estar/submissions`), with status, FDA tracking number, review clock, "Open recorded filing" (`TrackedFilingDetail.tsx` over `/api/task-management/filings/:id`) and "Open 510(k) surface"; one 510(k) assembly verdict for the header | A status filter; a per-row gate; a history |
| **EstarFilingPanel's readiness** | `mdx/surfaces/EstarFilingPanel.tsx` → POST `/api/510k/estar/filing-readiness` → `assessEstarFilingReadiness` | The deterministic verdict and blockers for one submission type against the project's governed content (`programId` required) | Run per tracked filing |
| The project → program resolver | `server/services/tasking/task-home-programs.ts` `loadTaskHomePrograms` | Resolves a `projects.id` to its anchored regulatory program on the request client | — |
| AnA's command | `server/services/ana-ri/command-executor.ts` `createSubmissionPackage` (+ `command-rbac.ts`, `part11-governance.ts`) | Inserted a `c2c_submission_packages` row (ind/510k/cer/nda/bla/pma) and signed the creation on one transaction | Write the store Submission Center lists |
| Other histories | `audit_logs` (`ESTAR_SUBMISSION_CREATED`/`ADVANCED`); `ectd_submission_status_history` (`db/migrations/082`, for the legacy `ectd_submissions` store) | — | A filing's own history, written with the change |

Searches run: `device-submission`, `SubmissionsSurface`, `useSubmissions`, `useSubmissionDetail`, `c2c_submission_packages`,
`c2cSubmissionPackages`, `c2c_milestones`, `submission-ops/packages`, `create_submission_package`, `estar_submissions`,
`estarSubmissions`, `createEstarSubmission`, `advanceEstarSubmission`, `filing-readiness`, `EstarFilingPanel`,
`TrackedFilingDetail`, `loadTaskHomePrograms`, `status_history`, `_events`, `submission.*event`, `filing.*event` (over
`client/src`, `shared`, `server`, `scripts`, `tests`, `migrations`, `db/migrations`). History: `history-search.txt`
(nothing deleted under `*package*`, `*milestone*`, `*TrackedFiling*`, `*DeviceFiling*`, `*submission*event*`,
`*filing*event*`, `*Submissions*`, `*estar*`, `*filing*`; shallow clone).

Nothing is built beside an existing piece:
- the device table **moved** from `SubmissionCenter.tsx` to `v2/surfaces/DeviceFilings.tsx` unchanged, and gained the
  filter and the gate there (SubmissionCenter 2,149 → 1,967 lines);
- the row gate is the **same assessment** as the panel's: the body of POST `/filing-readiness` became
  `assessFilingReadinessFor`, which both routes call;
- the one insert of a tracked filing is `insertTrackedFiling`, which the HTTP route and AnA's command both use;
- the history is new, because nothing recorded a filing's changes on the change's transaction (the brief names the
  table; the audit row stays where it is).

### What changed

1. **The migration** (`migrations/20261030_estar_filing_one_store.sql`, on the set just before
   `UUID_TENANT_ISOLATION_NONPUBLIC`, after `20261029k`):
   - `public.estar_submission_events` (`organization_id INTEGER NOT NULL`, held to its filing's organization by a
     composite key `(submission_id, organization_id)` → `estar_submissions (id, organization_id)` ON DELETE CASCADE,
     a CHECK on the event type, UPDATE and TRUNCATE refused by trigger). The sweep gives it its policy (checked on a
     deploy-shaped database: RLS on, one policy).
   - `estar_submissions.source_package_id` (unique where present) and `estar_submissions_id_org_uq`.
   - Only where `c2c_submission_packages` exists: each package of family 510(k), De Novo or PMA, on a project of the
     package's own organization, becomes one tracked filing (`510k`, `de_novo`, `pma_original`; variant `ivd` where the
     project's program is an IVD or CDx), at **draft**, or **withdrawn** where the package was cancelled. A filing is a
     signed act the package never carried, so nothing is migrated as filed; the package's own status, family, target
     date and description are in its `imported_package` event, and each milestone is an `imported_milestone` event.
     IND, NDA, BLA, CER, IVDR or MDR technical documentation stay where they are. Package rows are not changed. A
     partial migration raises and fails the deploy. Replays add nothing.
2. **The service** (`estar-submission-service.ts`): `insertTrackedFiling` (the row and its `created` event on the
   caller's transaction); `createEstarSubmission` runs it on a transaction; a status change writes `status_changed` on
   its transaction; `applySignedFiling` writes `filed` on the signing transaction, after the signature;
   `listEstarSubmissionEvents` (organization first, then the history with each actor's recorded name);
   `reviewGoalDaysOf` (a migrated filing with no review goal is clocked by its catalogue entry when filed).
3. **The routes** (`510k-estar-routes.ts`): GET `/submissions/:id/readiness` (the filing's gate: admits the project,
   resolves its program, runs `assessFilingReadinessFor`; a filing with no project, or whose project anchors no
   program, answers `assessed: false` with the reason) and GET `/submissions/:id/events`. Both are claimed by
   `submission-center` (`/api/510k/estar/submissions`).
4. **The screen**: `DeviceFilings.tsx` (the moved card, the status filter offering the statuses the list holds with
   counts, and each **draft** filing's gate: "Can file now" only from an assessment that said so, every blocker
   named, not assessed with its reason, a failed read an error with a retry; past draft: "Filed: readiness is
   assessed before filing"); the filing's history (in order, who and what, an unknown
   person as "—", an empty history said to be empty, a failed or malformed read said to have failed) in its own
   card, `TrackedFilingHistory.tsx`, which Submission Center mounts under the record; `TrackedFilingDetail.tsx` is
   unchanged.
5. **AnA's `create_submission_package`**: tracks a device filing through `insertTrackedFiling` on its signed
   transaction (signature target `estar-submission:<id>`, payload `projectId, catalogKey, variant, title`); takes
   `510k`, `de_novo`, `pma` or any eSTAR catalogue key; refuses IND, NDA, BLA and CER by name (`NOT_A_DEVICE_FILING`,
   naming where each is made); writes no package.
6. **The fold of `device-submission`**, by the checklist: alias → `submission-center`; deleted `Workbench.tsx`,
   `useSubmissions.ts`, `data/workbench.ts` (the `mdx/workbench/` directory is gone); the host (import, meta,
   `ORGANIZATION_VIEWS`, publish, case: twelve publishes now), `surfaceIds`, `surfaceViews`, the registry entry, the
   device rail, both scope lists (guard in `launch-scope.test.ts`), `collab-data.ts`, the AnA handle ("Device
   filings", resolving through the alias), both medtech tours (to `submissions`), `ID_BASELINE` 102 → 101,
   `REAL.components`, `dump-v2-surfaces`, `NO_PROJECT_DOOR` (14 project features remain), `HOOKS`,
   `surfaceRouting.test.ts`, `dataGateContract.test.tsx`; catalogue 20260810 and 20260823 amended in place with dated
   headers; `FOLDED_MODULE_SUCCESSORS['device-submission'] = 'submission-center'` (the replay shows it was a catalogue
   module at standard, `catalogue-at.txt`); the parity map.
7. **The purge** (lead's ruling): `'estar_submission_events'` in `PURGE_CHILD_TABLES` (`tenant-offboarding.ts`), one
   line, nothing else in that file.

### Parity (`FUNCTION_PARITY.md`, "From `device-submission`", updated)

| Function of the retired screen | Where now |
|---|---|
| List device submission packages | Submission Center's device filings, over `estar_submissions`; device packages migrated into it |
| Filter by status | The status filter on the device filings |
| Pipeline counts across seven stages | Not carried: nothing recorded a stage; the status chips stand |
| Transmit gate per package | Each draft filing's gate, from its own readiness (the panel's assessment) |
| Milestone activity log | Each filing's history (`estar_submission_events`); a migrated package's milestones are its first events |
| AnA's `create_submission_package` | Repointed onto the filing store |
| Transmit / View receipt | Not carried: the button only prompted AnA. Filing is the signed act on EstarFilingPanel |
| Ask AnA what is blocking | Not carried as a button; the row's gate names every blocker, and AnA's `assemble_device_submission` reads the same engine |
| Its invented receiving authority, cover letter and e-signature "gates" | Not carried (pinned absent on the device filings) |

### Deletions (working agreement)

| Deleted | Replacement, by path | Reachability test |
|---|---|---|
| `mdx/workbench/Workbench.tsx` (`SubmissionsSurface`), `mdx/hooks/useSubmissions.ts`, `mdx/data/workbench.ts` | `v2/surfaces/DeviceFilings.tsx` mounted by `v2/surfaces/SubmissionCenter.tsx` (alias `device-submission` → `submission-center`), with `v2/surfaces/TrackedFilingHistory.tsx` under each opened filing | `foldDeviceSubmission.test.ts` (alias from a link, a move and AnA; the card, the gate read, the filter, the history mount); `deviceFilingsGateAndHistory.test.tsx`; `submissionCenterDeviceFilings.test.tsx` |
| `mdx/workbench/__tests__/SubmissionsSurface.noInventedTarget.test.tsx` | Its rules moved onto the device filings (`deviceFilingsGateAndHistory.test.tsx`, "what the retired screen pinned"): a gate read in flight or malformed is no verdict; a failed read is an error; no invented authority, transmitter, cover letter or signature; the history's failed, malformed, empty and in-flight reads. Status from the record: `submissionCenterDeviceFilings` ("never fabricates a status"). The package bundle, stage and cover-letter cases pinned the retired screen's own fields | — |
| `mdx/hooks/__tests__/useSubmissions.milestoneActor.test.ts` | The history's actor: the recorded name, else "User #id", else "—", never a stand-in (`deviceFilingsGateAndHistory`, "lists the events in order") | — |
| `mdx/hooks/__tests__/useSubmissions.sendsAuth.test.ts` | The device filings read through `useLiveData` and `apiRequest`, which carry the session for every screen; the hook's hand-built headers went with it | — |
| `mdx/workbench/__tests__/workbenchNoFixtures.test.tsx` | Its module (`data/workbench.ts`) is deleted; nothing holds a fixture to pin | — |

### Red, green, make the check fail (item 1)

- **Red** (`item1/red.txt`): every pin run before the product change it pins: **37 failed** across six steps (the
  migration: its suite could not start; the history 6 of 18; the routes 6 of 6; AnA 3 of 24; the screen 7 of 7; the
  fold 13 of 101). The purge line's red is `item1/purge-coverage.txt`.
- **Green** (`item1/green.txt`): the 36 suites the change edits, **448 of 448**. Every suite naming what the change
  edits, 511 files in one run: 8,485 passed; the failures were the tracked-filing detail suite (22, the history first
  drawn inside the detail; fixed by giving it its own card, after which the suite is green unchanged) and six in
  files of other lanes or failing at head, each failing alone the same way (listed in `green.txt`).
- **Mutations** (`item1/mutations.txt`, spec `tools/mutation-spec-item1.json`): **31 of 31 red**, each restored byte
  for byte, `sha256sum -c` over the 12 mutated files after.

| Id | Mutation | Red on |
|---|---|---|
| S1 | the migration takes a package on another organization's project | the migration's completeness check raises |
| S2, S3 | a cancelled package becomes a draft; a completed one becomes *filed* | migration pin |
| S4 | an IND is migrated as a device filing | migration pin (4) |
| S5 | the insert is not guarded against a replay | the unique index raises on replay |
| S6, S7 | the history accepts UPDATE; an event is held to its filing only | migration pin |
| S8, S9, S10 | a filing, a status change, a signed filing without its event on the same transaction | history pins |
| S11, S12 | the history read skips the organization; a migrated filing takes no review clock | history pins |
| S13–S16 | a filing with no project assessed; the gate or the history read without admission; the gate on the project's integer id | route pins |
| S17, S18 | AnA maps an IND onto a 510(k); AnA's filing outside its signed transaction | AnA pin |
| S19–S23 | the gate for every status; the filter offering absent statuses; a failed gate drawn as not assessed; a failed history drawn empty; an unknown actor named "System" | screen pins |
| S24–S28, S31 | no alias; back on the rail; a tour stops there; the mapping drops it; left in the Projects list; a client reads the package store | fold guard, grant pin, scope guard |
| S29, S30 | 20260810 upserts it; 20260823 keeps its packaging row | the catalogue suite cannot start (a deploy would fail) |

### Gates (item 1, `item1/gates.txt`)

All 28 pass: `ci:launch-scope` (7 apps, 43 surfaces, 12 modules) and its selftest; `ci:launch-scope-api` (563 paths,
none refused) and its selftest; `ci:ana-surface-context` (101 of 105, baseline 101 exact); `ci:surface-discoverability`
(107); `ci:migration-drop-safety` and its selftest; `ci:migration-set-order`; `ci:migration-deploy-path` and its
selftest; `ci:migration-guard-order`; `ci:migration-reachability`; `check:catalog-copy`; `ci:undefined-css-classes`;
`ci:unreferenced-modules`; `ci:program-ownership-single-source`; `ci:sql-interpolation`; `ci:sign-ceremony` and its
selftest; `ci:discarded-audit-write`; `ci:drizzle-tenant-scope`; `ci:duplicate-table-ddl`; `ci:fabricated-identity`;
`ci:tenant-resolvers`; `ci:unauthenticated-fetch`; `ci:proof-tier`; `ci:rls-allowlist-sync`.

- **`ci:purge-coverage`** (`item1/purge-coverage.txt`), on a deploy-shaped database built from blank on a private
  PostgreSQL (`tools/build-db.sh.txt`, port 55473, stopped after): green, new 0; red without the purge line, naming
  `estar_submission_events`.
- **eslint** (`item1/eslint.txt`): every changed file at or below head; the new files 0. Two new warnings on the way
  were removed: `applySignedFiling` over 100 lines (the filed event moved to `recordFiledEvent`) and the AnA suite
  over 500 lines.
- **tsc**, scoped (`item1/typecheck.txt`): 8 errors over 4,200 files, none in a changed file.

**`scripts/db/migration-set.mjs`, my lines exactly** (just before `UUID_TENANT_ISOLATION_NONPUBLIC`, after
`20261029k`):

```
  // One device-filing store, estar_submissions (D2, fold F5 item 1, P-61 item 1,
  // 2026-10-30; docs/evidence/D2-ONE-ANA/2026-10-29/fold-f5-device-filing/):
  // public.estar_submission_events, a tracked filing's append-only history
  // (UPDATE and TRUNCATE refused; DELETE is its filing's cascade or the tenant
  // purge's, PURGE_CHILD_TABLES), held to its filing's organization by a
  // composite key; estar_submissions.source_package_id; and, only where
  // c2c_submission_packages exists (to_regclass; its creator 0002 is on no
  // applier), each device package (510(k), De Novo, PMA) on its own
  // organization's project migrated once into a draft or withdrawn tracked
  // filing with its import event and milestones. After the three
  // estar_submissions creators (20260730, its project link, 20260908b),
  // 20260524 and 20260814. Public with organization_id INTEGER NOT NULL, so the
  // sweeps below police the history. Every statement guarded; no DROP, no DELETE.
  'migrations/20261030_estar_filing_one_store.sql',
```

### What "retired" means for `c2c_submission_packages`, and what still reads it

No screen reads it, AnA no longer writes it, and its device packages are tracked filings. The table is not dropped
(its creators, 0002 and drizzle push, re-create it on install-fresh: Rule 1). Still reading or writing it on the
server: POST and GET `/api/submission-ops/packages*` (sections, readiness, milestones, assemble, publish, preflight;
no client caller, but still claimed by the Vault, Tasks and Communication, whose registry notes say so now), the
package transmit's author check and AnA's ESG transmit (`mdx-command-handlers.ts`), Submission Twin, the eCTD
content-change fingerprint, `mdx-analytics`, `mdx-health` and the tenant purge.

**`c2c_blockers`** (the lead's question): it is still read as correspondence intake writes it, by AnA's risk watch
(`server/services/ana/risk-watch.ts`: the `scan_project_risks` tool, the session briefing and since-last-visit), by
`server/routes/mdx-analytics.ts` (device analytics' blocker counts), by the package readiness engine
(`server/submission-ops/readiness-engine.ts`), by separation of duties (`governance/separation-of-duties.ts`) and by
the governed-action target check (`routes/c2c/actions.ts`); the automation runner (`submission-ops/automation-runner.ts`)
writes it too, reached only through POST `/api/submission-ops/automation/run`, which has no client caller.

### Not carried, not done (item 1)

- **Filings started from EstarFilingPanel are tracked under no project.** Its "Start tracking" sends no `projectId`
  (`EstarFilingPanel.tsx` `onStartTracking`), so each such filing's gate in Submission Center says "Not assessed:
  tracked under no project". Sending the project is a change to the panel (its `programId` is the program's uuid; the
  route takes the integer project), not built here.
- **Packages that are not device filings** (IND, NDA, BLA, CER, IVDR or MDR technical documentation) are not migrated
  and no screen lists them now; the retired screen listed every family.
- A migrated package's **bundle, stage and sections** are not carried; its family, status, target date and
  description are in its import event, and its milestones are events.
- **`/api/submission-ops/*`** routes and their Vault/Tasks/Communication claims stay (see above).
- **AnA's `create_submission_package`** no longer takes `targetDate`: a tracked filing has no target date.
- **The tracked-filing purge line** was proven red once by removing it and restoring the file (sha256 checked). The
  custody lane owns `tenant-offboarding.ts`; afterwards the working tree differs from that lane's staged copy by this
  one line only (`git diff`), so nothing of theirs was overwritten.
- Not run here: the real-PostgreSQL `tests/db/*.dbtest.ts` suites, and the whole-tree typecheck.
- `DEVICE_FOLDS_2026-10-29.md` and `INFORMATION_ARCHITECTURE.md` are not edited; `FUNCTION_PARITY.md` is.

### Decisions (item 1)

1. Whether EstarFilingPanel should start tracking under its project, so every new filing has a gate (recommended;
   small).
2. What happens to non-device packages: leave them in `c2c_submission_packages` unlisted, or migrate IND/NDA/BLA ones
   into Submission Center's `submissions` store.
3. Whether to close `/api/submission-ops/packages*` and narrow the Vault, Tasks and Communication claims, now that no
   screen calls them.
