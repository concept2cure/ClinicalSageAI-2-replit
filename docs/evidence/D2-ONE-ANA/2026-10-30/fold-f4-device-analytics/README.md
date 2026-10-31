# Fold F4: device analytics into Reporting & analytics (D2, 2026-10-30)

Launch row: **D2** (one AnA, one product: the remaining in-shell device "apps" fold into core).
Decision: **P-61 item 3** (`docs/LAUNCH_DEFINITION_OF_DONE.md`, "### P-61"): device analytics joins Reporting &
analytics at its tier (standard); Reporting reads accessible projects only. Grant continuity: **P-61 item 4**.
Plan: `docs/design/DEVICE_FOLDS_2026-10-29.md`, F4 and the common checklist.

The work is a **convergence**: device analytics' three real figures are moved into the one Reporting overview,
and the device screen, its hook and its kit aggregate are deleted. Nothing is built beside an existing reader.

## What already exists (Rule 3)

Searched by every name the capability could have: `device-analytics`, `AnalyticsSurface`, `useAnalytics`,
`AnalyticsReportLibrary`, `/api/mdx/analytics`, `mdx-analytics`, `actual_submission_date`, `draft_source`,
`acceptance rate|acceptanceRate|acceptRate`, `pace24m|submission pace`, `byStatus|status counts`,
`workstreamSqlCase`, `device` over `server/services/report-os`, `server/routes/insights*`,
`server/routes/report-os*` and `client/src/concept2cure/v2/surfaces/Insights*` (`what-exists-searches.txt`), and
every deleted file by name (`history-search.txt`).

| Piece | Path | What it did before this fold | What it did not do |
|---|---|---|---|
| The device analytics screen | `client/src/concept2cure/mdx/surfaces/AnalyticsSurface.tsx` (with `mdx/hooks/useAnalytics.ts`, `mdx/data/analytics.ts`, `mdx/components/AnalyticsReportLibrary.tsx`) | KPI cards (projects, active, approved, submitted), the AnA draft acceptance rate, a 24-month submission pace, open blockers by cause with Ask AnA, a saved-reports list, three facets drawn as unavailable | Read only the projects its reader could open; tell device from drug programs |
| Its read | `server/routes/mdx-analytics.ts`, `GET /api/mdx/analytics` (the kit aggregate) | Counted **every** `regulatory_programs` row of the organization, drug programs included, and every AnA-drafted `cerv2_510k_sections` row; open `c2c_blockers` by type | Scope to accessible projects (`getAccessibleReportProjectIds` was never called) |
| Its facets | the same file, `/analytics/portfolio`, `/submissions`, `/cycle-times`, `/blockers`, `/clinical`, `/ana-usage` | Organization-wide aggregates; **no client caller** | Scope to accessible projects |
| The saved-reports panel | `AnalyticsReportLibrary.tsx` | A copy of Reporting's run register (`GET /api/report-os/runs`), linking to `/concept2cure/insights` | Anything Insights' Run history tab (`v2/surfaces/InsightsRunsPanel.tsx`) does not |
| The target | `client/src/concept2cure/v2/surfaces/Insights.tsx` over `GET /api/insights-canvas/overview` (`server/routes/insights-canvas-routes.ts`) | The reporting canvas, scoped by `getAccessibleReportProjectIds` (`server/services/report-os/project-access.ts`) | Any device figure: none of `actual_submission_date`, `draft_source`, a status count or a pace was read anywhere under report-os or the canvas at HEAD |
| The device classification | `workstreamSqlCase` (`shared/constants/domain/product-types.ts`), used by Projects' MDX filter (`server/services/c2c/project-portfolio.ts`) | The one vocabulary that says a program is MDX | — |
| Catalogue | `db/migrations/20260810_reconcile_module_catalog.sql`, `20260823_module_catalog_commercial_packaging.sql` | `device-analytics` live, packaged at **professional** (`catalogue-at.txt`) | — |

The history search finds no analytics screen, hook or route ever deleted before (`history-search.txt`; the clone
is shallow, 1,646 commits reachable). This fold is the first, so nothing is rebuilt beside a deleted one.

## What changed

**Converged into Reporting.** One deterministic reader, `server/services/report-os/device-portfolio.ts`
(`readDevicePortfolio`), computes the section over the projects the reader can open:

- each recorded status (`regulatory_programs.status`) with its count, over device projects only (the Projects MDX
  filter's `workstreamSqlCase`), never a drug, deleted or other-tenant project;
- the submission pace: recorded `actual_submission_date` in each of the 24 calendar months to now;
- the AnA draft acceptance rate: AnA-drafted kit sections recorded against those projects through their eSTAR
  document (`cerv2_510k_sections.document_id → fda_510k_documents.project_id`), accepted over all.

Every figure is a row count or a ratio of two counts; no model is asked for anything (Rule 2). An unreadable programs
source throws, and the route says `{ state: 'unavailable' }` without withdrawing the rest of the canvas; a missing
drafts table or column withholds only the rate; a genuine zero is zero; no draft recorded is no rate, never 0%.

`GET /api/insights-canvas/overview` carries it as `device`, read on the request's own connection
(`readDevicePortfolio(requestPgClient(req), organizationId, accessibleProjectIds, now)`), on every tier.
`v2/surfaces/InsightsDevicePortfolio.tsx` shows it on the Report tab's landing canvas of `v2/surfaces/Insights.tsx`,
with or without a project open; it draws nothing for a reader with no device project.

**What the reader sees change, honestly.** The old figures were the organization's; the new ones are the reader's
accessible device projects'. A kit section with no eSTAR document (`document_id` null, which is how
`write_kit_section` writes today) belongs to no project, so it is not counted: an organization whose AnA drafts are
all organization-level sees "No AnA draft is recorded against a device project you can open". That is the figure the
decision asks for, not a regression to hide.

**Not carried, by decision.** Open blockers by cause and its Ask AnA: there is no organization-wide blocker list
(P-61 item 2). Reviewer velocity, per-tool AnA usage and phase timing were always null (no source). The pathway
filter only ever offered "All".

### Deleted, with the reachable replacement

| Deleted | Replacement (path) | Reachability proof |
|---|---|---|
| `mdx/surfaces/AnalyticsSurface.tsx` (the screen) | the device section of `v2/surfaces/Insights.tsx` (`InsightsDevicePortfolio.tsx`), at `insights` | `v2/__tests__/foldDeviceAnalytics.test.ts` (the old id resolves to `insights` from a URL, an in-app move and AnA, with and without a project; the canvas mounts the section); `v2/__tests__/insightsDevicePortfolio.test.tsx` (the canvas shows it) |
| `mdx/hooks/useAnalytics.ts`, `mdx/data/analytics.ts` | `server/services/report-os/device-portfolio.ts` via the overview | `server/routes/__tests__/insights-canvas-device-section.test.ts`, `server/services/report-os/__tests__/device-portfolio.pglite.test.ts` |
| `mdx/components/AnalyticsReportLibrary.tsx` | Insights' Run history tab (`v2/surfaces/InsightsRunsPanel.tsx`), the register it copied | the existing Insights library suites |
| `GET /api/mdx/analytics` (the kit aggregate handler in `server/routes/mdx-analytics.ts`) | `GET /api/insights-canvas/overview`'s `device` | `server/routes/__tests__/mdx-analytics-availability.test.ts` (404, reads nothing) |
| `mdx/hooks/__tests__/useAnalytics.qa.test.ts`, `mdx/surfaces/__tests__/AnalyticsSurface.availability.test.tsx` | their honesty cases moved: unavailable is never zero, a genuine zero is zero, no shared pool, a failed read is said (`device-portfolio.pglite.test.ts`, `insightsDevicePortfolio.test.tsx`) | — |

### Kept and handed on

The facet routes in `server/routes/mdx-analytics.ts` stay, organization-wide and with no caller, as the reference
the parity table names. **Until this change they were served in production**: `device-analytics` (a launch Projects
feature) claimed `/api/mdx/analytics`, which covered them. Nothing claims the family now (only `labeling-pi`,
outside the launch catalogue, claims the `/api/mdx` root), so production's launch-scope gate refuses all seven
paths. Pinned by a new case in `server/middleware/__tests__/launch-scope-device-features.test.ts`, which asks the gate
production builds. A screen that wants one reads it over the projects its reader can open first.

## The checklist (`DEVICE_FOLDS_2026-10-29.md`)

| Step | Done |
|---|---|
| 1. Delete the source component and what only it imported | the six files above; importers checked first |
| 2. `MdxSurfaceHost.tsx` | import, meta, publish call and case removed; `ORGANIZATION_VIEWS` is empty, so it is gone and `viewScopeNotice` returns null for every other id |
| 3. Ids | `mdx/surfaceIds.ts`, `v2/surfaceViews.ts`, `ui-surface-registry.ui-v2.ts`; the claim `/api/mdx/analytics` is dropped (no screen calls it; `insights` already claims `/api/insights-canvas`); `launch-scope-device-features.test.ts` HOOKS loses `useAnalytics.ts` |
| 4. `v2/registryModel.ts` | `DEEP_LINK_ALIASES['device-analytics'] = 'insights'`; off the medtech rail (Reporting is a `RAIL_CORE` work area on every segment); it was in no `NAV_GROUP_OF`, `NAV_HIDDEN`, focus list or `SURFACE_ACTIONS` |
| 5. Scope lists | `launch-scope.ts` Projects surfaces and `mdx-project-features.ts`, with the guard "the folded device analytics" in `launch-scope.test.ts` |
| 6. Catalogue (Rule 1) | amended in place with dated headers: 20260810's keep-list and upsert, 20260823's packaging row; no DELETE, no appended DROP; fresh and replay cases in `catalog-module-claims.contract.test.ts` (the three near-identical retirement blocks of F5 and F4 now share one helper, `retiredByFoldCases`, which also keeps the file under `max-lines`) |
| 7. AnA target | `shared/navigation/index.ts` keeps `device-analytics`, resolving through the alias, described as Reporting |
| 8. Tours | no tour stopped at `device-analytics` |
| 9. CI | `ID_BASELINE` 101 → 100 for F4 (98 with F6 and the agency-meetings retirement, `508b2b7a8`, which left it one high; see F6); `REAL.components` loses `AnalyticsSurface`; `dump-v2-surfaces.spec.tsx`; `ProjectMdxWorkflow.test.tsx` `NO_PROJECT_DOOR` |
| Grant mapping | `FOLDED_MODULE_SUCCESSORS['device-analytics'] = 'insights'` (`folded-module-successors.ts`) and its pin (`folded-module-grant-continuity.test.ts`, tier `professional`); `insights` is packaged at standard, below it, with no industry list |
| 10. Fold guard | `v2/__tests__/foldDeviceAnalytics.test.ts` |
| Parity | `.design/client-journey/FUNCTION_PARITY.md`, "From `device-analytics`" and the `insights` table |

No migration is added and `scripts/db/migration-set.mjs` is not touched.

## Evidence

- `red.txt`: the four new suites at `d581eba7a`, tests only: 5/5, module missing, 3/4 and module missing. The fold
  guard was amended after this red, when the facet routes were kept rather than deleted: its route case now asks that
  the aggregate handler is gone and that no launch screen claims the family; M18 and M19 show that case red.
- `green.txt`: 12 suites, 170 tests; 109 neighbouring suites, 1,089 tests, all passing (15:35 UTC, on `d581eba7a`).
  **Re-run after the upstream merge (base `4323b9149`) with F6**: 222 files, 3,076 tests, 3,038 passing; the 38 that
  fail are upstream's and fail the same way on a clean export of HEAD (`../fold-f6-device-workstream/green.txt`).
- `mutations.txt`: 21 of 21 red, every file restored byte for byte (sha256); re-run after the merge, with two anchors
  moved (`tools/mutation-spec-f4-postmerge.json`): 21 of 21 red, every file restored.
- `gates.txt`: after the merge every listed gate passes, `ci:sql-interpolation` included. Before it (15:20 UTC) that
  gate named two files of another lane's in-progress audit work and none of this fold.
- `eslint.txt`: no file above its HEAD count; every new file clean. `typecheck.txt`: scoped tsc, no error in a changed
  file. `catalogue-at.txt`: the replay at HEAD and after. `tools/`: the specs and scripts, renamed `.txt`.
