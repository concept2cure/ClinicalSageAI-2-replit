# Fold F6: the device workstream into Projects (D2, 2026-10-30)

Launch row: **D2** (one AnA, one product: the remaining in-shell device "apps" fold into core).
Decision: **P-61 item 5** (`docs/LAUNCH_DEFINITION_OF_DONE.md`, "### P-61"): the device workstream into Projects
shows only figures computed from the project's own records, and the Client Review Room admits the project.
Grant continuity: **P-61 item 4**. Plan: `docs/design/DEVICE_FOLDS_2026-10-29.md`, F6 and the common checklist.
It lands after F4 (`../fold-f4-device-analytics/`), as the plan's ordering asks.

The work is a **convergence and a reach**: the kit portfolio is retired into Projects, which already counted the
device portfolio on the server; Projects now draws the last activity the server already sent it; and the Client
Review Room, which already admitted the project, is reached from the project. Nothing is built beside an existing
reader, and the room's route is not changed.

## What already exists (Rule 3)

Searched by every name the capability could have: `device-workstream`, `surfaces/Overview`, `<Overview`,
`ClientReviewZone`, `/api/mdx/client-review`, `activity`, `AS activity`, `filingWithin60Days|60 days`,
`workstream: 'MDX'`, `HealthKpi|MDX_HEALTH`, `ProjectClientReview|ClientReviewRoom` over `client`, `server`,
`shared` and `scripts` at HEAD (`what-exists-searches.txt`), and every deleted file by name (`history-search.txt`).

| Piece | Path | What it did before this fold | What it did not do |
|---|---|---|---|
| The kit portfolio | `client/src/concept2cure/mdx/surfaces/Overview.tsx`, drawn by `mdx/MdxSurfaceHost.tsx` from `case 'device-workstream': default:` | Device project cards (pathway, stage, readiness, next blocker, last activity), a pathway and a status filter with counts over the loaded programs, a health strip (projects with a 510(k)/PMA/cleared split, average readiness, "Blockers open", "Submissions in flight"), New project doors, an Ask AnA chip per program, a readiness-report prompt, a remembered grid/list view, and the Client Review Room | Compute "Blockers open" or "Submissions in flight" in any engine: both were derived in the browser from a kit status mapping and a stage index (`p.status === 'blocked'`, `p.stageIdx >= 5`). Draw the room for a project: it drew `<ClientReviewZone />` with none, which is the organization's room |
| The target | `client/src/concept2cure/v2/surfaces/Projects.tsx` over `GET /api/c2c/projects` (`server/services/c2c/project-portfolio.ts`) | The MDX filter (`projects.filter {workstream: 'MDX'}`, which the `mdx` alias already applies, A2.8); server counts over every admitted project (`PORTFOLIO_COUNTS_SQL`: total, by workstream, by pathway, filing within 60 days); the pathway filter with counts (`ProjectPortfolioFilters.tsx`); the card and list row with stage, the readiness the server measured, the recorded blocker and the target date | Draw `activity`, which the server already sent on every row (`'Updated ' \|\| to_char(p.updated_at, 'Mon DD') AS activity`): it was typed and never rendered |
| The Client Review Room | `mdx/components/ClientReviewZone.tsx` (with `mdx/hooks/useClientReview.ts`) over `GET /api/mdx/client-review` (`server/routes/mdx-client-review.ts`) | Since `665873b2d` (P-61 item 5): `admitRoom` admits a `programId` through `admitProject` (`server/lib/admit-project.ts`, over `programInOrganization`) and an integer `project_id` against the organization and the program, before any task is read; 404 for another organization's or a deleted project, 503 when ownership cannot be checked (`server/routes/__tests__/mdx-client-review-admits-project.test.ts`, 11 cases) | Be reached from a project: its only caller was the kit portfolio, with no project |
| Project home's Review step | `client/src/concept2cure/v2/surfaces/ProjectHome.tsx` | The verified integer project (`sharingProjectId`, from `useProjectTeam`) and the device flag (`deviceFiling`) | Show the client what is shared with them |
| Catalogue | `db/migrations/20260810_reconcile_module_catalog.sql`, `20260823_module_catalog_commercial_packaging.sql` | `device-workstream` live, packaged at **standard**; `projects` at **free** (`catalogue-at.txt`) | — |
| AnA | `shared/navigation/index.ts`, `shared/navigation/demo-scripts.ts` | The `device-workstream` target ("portfolio health KPIs"); the training and sales device tours opened on it. Its two commands (`evidence_sufficiency.assess`, `reviewer_simulation.run`) were already independent of it (A2.10) | — |

The history search finds no portfolio, overview, workstream or review-room component ever deleted before
(`history-search.txt`; the clone is shallow, 1,879 commits reachable). This fold is the first, so nothing is rebuilt
beside a deleted one.

## What changed

**Projects draws the record's last activity**, on the card and on the list row, and none where the record holds
none (`v2/surfaces/Projects.tsx`; `v2/__tests__/projectsActivity.test.tsx`). That is the one portfolio function the
parity table sent to Projects that Projects did not already have.

**The Client Review Room is on the device project's Review step, for that project.** `v2/surfaces/ProjectClientReview.tsx`
is mounted there with the program and the verified integer project, and loads `mdx/ClientReviewRoom.tsx` lazily (the
kit's stylesheet comes with it, never in the entry chunk). The room draws `<ClientReviewZone projectId programId />`,
so the route admits both before anything is read or shared, and says "Scoped to the selected project". Without both
it reads and draws nothing. `/api/mdx/client-review` moved to `project-home`'s claims. **The route is unchanged**: its
admission since `665873b2d` is proved, not rebuilt (`mdx-client-review-admits-project.test.ts`, 11 of 11; mutation M18
turns it red). The organization-wide room is drawn nowhere now.

**The host never draws a portfolio.** `MdxSurfaceHost.tsx` loses the Overview import, its meta entry, its publish call,
`openProgram` and the portfolio branch. Its `default:` is now a compile-time exhaustiveness check
(`const unreachable: never = nav`), so every id it is given is a named case, and the project-required guard, which
skipped the portfolio, applies to every id.

**Figures (P-61 item 5).** Projects' summary line predates the fold and is unchanged: the total and "filing < 60 days"
are server counts over every admitted project, and the average readiness is a mean of the readiness the server
measured for each project on the page, which states how many it covers. Dropped, with the screen: "Blockers open"
and "Submissions in flight" (no engine computes either; Projects already says why it shows no "Blocked" figure),
and the status counts (the kit counted the loaded programs in the browser; no engine counts status across the
portfolio, so a count past the first page would be a guess).

**Not carried, by decision or as optional.** The Ask AnA chip per program (a project opens from its card, and Project
home carries AnA); the remembered grid/list view (optional in the parity table; AnA's `projects.set-view` sets it);
the kit's own New project doors (Projects' New project opens the wizard).

### Deleted, with the reachable replacement

| Deleted | Replacement (path) | Reachability proof |
|---|---|---|
| `mdx/surfaces/Overview.tsx` (the kit portfolio) | `v2/surfaces/Projects.tsx` with the MDX filter, at `projects`; the room on Project home (`v2/surfaces/ProjectClientReview.tsx`, `mdx/ClientReviewRoom.tsx`) | `v2/__tests__/foldDeviceWorkstream.test.ts` (the old id resolves to filtered Projects from a URL, an in-app move and AnA, with and without a project; both tours stop there; the room is mounted on the Review step); `projectDestination.test.ts`, `surfaceRouting.test.ts`, `navigationReachability.test.ts`; `projectsActivity.test.tsx`; `projectClientReview.test.tsx` |
| `mdx/surfaces/__tests__/Overview.pathwayReadiness.test.tsx` | its cases on Projects: an absent readiness is "Not recorded" with no bar (`projectsPortfolioEmptyMean.test.tsx`, `projectsCardStatusReadiness.test.tsx`); an absent figure is not averaged as zero and the cover is stated (`projectsPortfolioEmptyMean.test.tsx`); IDE, regional and Other projects are filterable (`projectsPathwayCounts.test.tsx`, over `ProjectPortfolioFilters.tsx`) | — |
| `HealthKpi` in `mdx/data/programs.ts` | none: it was the deleted strip's shape | scoped tsc |
| The overview case of `mdx/__tests__/k510HonestEmptyState.test.tsx` | `projectsPortfolioEmptyMean.test.tsx` (an empty portfolio states no figure) | — |
| The creation-door case of `mdx/__tests__/MdxSurfaceHost.test.tsx` | Projects' New project (`newProjectWizard*.test.tsx`); the host case now asserts it draws no door and sends the person to Projects | — |

`surfaceHostFailure.test.tsx` and `surfaceHostRenders.test.tsx` kept their cases and run them on a device feature
(`device-510k`): the host's one programs read is the one that verifies the open project.

## The checklist (`DEVICE_FOLDS_2026-10-29.md`)

| Step | Done |
|---|---|
| 1. Delete the source component and what only it imported | the files above; importers checked first. `ClientReviewZone` and `useClientReview` stay, drawn from one place |
| 2. `MdxSurfaceHost.tsx` | import, meta, publish call, `openProgram` and the portfolio branch removed; no fallthrough |
| 3. Ids | `mdx/surfaceIds.ts`, `v2/surfaceViews.ts`, `ui-surface-registry.ui-v2.ts`; of its claims only `/api/mdx/client-review` was the portfolio's own call, and it moved to `project-home` (`ui-surface-registry.ts`); the device families it also listed are claimed by the pathway screens that call them |
| 4. `v2/registryModel.ts` | `DEEP_LINK_ALIASES['device-workstream'] = 'projects'` and `ALIAS_APPLIES` with the MDX filter, as `mdx`; removed from `NAV_GROUP_OF`, the medtech focus list and the medtech rail |
| 5. Scope lists | `launch-scope.ts` Projects surfaces and `mdx-project-features.ts`, with the guard "the folded device workstream" in `launch-scope.test.ts` |
| 6. Catalogue (Rule 1) | amended in place with dated headers: 20260810's keep-list and upsert, 20260823's packaging row; no DELETE, no appended DROP; fresh and replay cases in `catalog-module-claims.contract.test.ts` |
| 7. AnA target | `shared/navigation/index.ts` keeps `device-workstream`, resolving through the alias, described as filtered Projects |
| 8. Tours | `training-medtech` and `sales-medtech` stop at `mdx` (filtered Projects) and say so |
| 9. CI | `ID_BASELINE` 101 → 98 (F4, F6, and the agency-meetings retirement `508b2b7a8` left it one high, so the gate failed at its head); `REAL.components` loses `Overview`; `ProjectMdxWorkflow.test.tsx`; `one-shell.test.ts` loses its portfolio exception; `dump-surface-markup.spec.tsx` |
| Grant mapping | `FOLDED_MODULE_SUCCESSORS['device-workstream'] = 'projects'` and its pin (`folded-module-grant-continuity.test.ts`, tier `standard`); `projects` is packaged at free, below it |
| 10. Fold guard | `v2/__tests__/foldDeviceWorkstream.test.ts` |
| Parity | `.design/client-journey/FUNCTION_PARITY.md`, "From `device-workstream`", every row now ticked with where it went or why it was not carried |

No migration is added and `scripts/db/migration-set.mjs` is not touched.

## Evidence

- `red.txt`: the three new suites with only the tests written, on the F4-complete tree, before any F6 product change
  (4/4, module missing, 1/2); then the F6 catalogue and grant cases before the amendments (5 red).
- `green.txt`: every suite the two folds wrote or edited, and every neighbouring suite, after the upstream merge
  (base `4323b9149`): 222 files, 3,076 tests, 3,038 passing. The 38 that fail (8 files) are upstream's: each fails the
  same way on a clean export of HEAD with no lane edit, and the file says which commit each comes from.
- `mutations.txt`: 22 of 22 red, every file restored byte for byte (sha256, and the whole set checked after the run).
  M10 and M11 show that 20260810's upsert and 20260823's packaging row are bound: either amendment without the other
  raises the catalogue's own guard on a fresh database, so they land together. M18 is the Client Review Room's
  admission, unchanged by this fold, shown guarded.
- `gates.txt`: every gate the brief and the checklist name passes. `eslint.txt`: no file above its HEAD count; every
  new file clean. `typecheck.txt`: scoped tsc, no error on a changed line. `catalogue-at.txt`: the replay at HEAD and
  after. `tools/`: the specs, the suite list and the scripts, renamed `.txt`.
