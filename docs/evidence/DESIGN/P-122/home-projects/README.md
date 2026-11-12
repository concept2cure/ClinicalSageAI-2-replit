# P-122: what came back to Home, Projects and the top bar

This covers founder decision P-122 §3 items 1, 2 and 4, the Unarchive control from §3.5, and "Which projects are at risk this week?". The source is `docs/LAUNCH_DEFINITION_OF_DONE.md`, P-122. The inventory of what was hidden is `docs/evidence/DESIGN/P-122/inventory/` (rows A1, B1, B2, C1, C2 and C3, and the section 3 rows for `/unarchive`, Sentinel and submission-ops).

Each item went red first: a test that fails on the HEAD before its commit. The fix followed in its own commit. The red and green output for each item is under `red/` and `green/`.

| # | Item | Commit | Plan | Red at HEAD | Green |
|---|---|---|---|---|---|
| 1 | Home: projects and due tasks in view at 1440×900 | `fc0eb748d` | D1 | 3 of 3 fail (`red/1-home.txt`) | 3 of 3 pass; 20 of 20 in 4 Home suites (`green/1-home.txt`) |
| 3 | Top bar: Search and Help | `46712cea6` | D1 | 4 of 4 fail (`red/3-topbar.txt`) | 4 of 4 pass; 212 of 212 in 14 shell suites (`green/3-topbar.txt`) |
| 2 | Projects: figures, card facts, remembered view | `38ae15e1d` | D2 | 7 of 7 fail (`red/2-projects.txt`) | 7 of 7 pass; 131 of 131 in 17 suites (`green/2-projects.txt`) |
| 4 | Projects: archived projects and Restore | `2f27f43a7` | R1 | 6 of 6 fail (`red/4-unarchive.txt`) | 6 of 6 pass; 118 of 118 in 15 suites (`green/4-unarchive.txt`) |
| 5 | Projects: "Which projects are at risk this week?" | `a0a8d3ed0` | R1 | 5 of 5 fail (`red/5-at-risk.txt`) | 5 of 5 pass; 93 of 93 in 17 suites (`green/5-at-risk.txt`) |

## What already exists (RULE 3)

Nothing here is new. Each item restores or reaches something that was already built.

- **Home.**
  - `client/src/concept2cure/v2/surfaces/Surfaces.tsx` (`Home`), `HomeSections.tsx` (`HomeProjects`, `HomeTasks`), `HomeSetup.tsx` and `styles/surfaces-v2.css`.
  - The sections were all present. `4a5cc0d22` had moved them under a composer that started 22vh down the page.
  - The change re-lays out the existing sections and adds no new section.
- **Top bar.**
  - `client/src/concept2cure/v2/Shell.tsx` (`TopBar`). The palette is opened by `onPalette` (`V2App.tsx` passes `setCmdkOpen(true)`), and Help goes to `HELP_SURFACE`, the account menu's "Get help".
  - `f7b11e77a` removed both buttons and kept the handlers. ⌘K, the sidebar's Search row and Recents are unchanged.
- **Projects.**
  - `client/src/concept2cure/v2/surfaces/Projects.tsx` and `ProjectPortfolioFilters.tsx`.
  - The figures are `meta.counts` of `GET /api/c2c/projects` (`server/services/c2c/project-portfolio.ts`, `readPortfolioCounts`).
  - Each card's readiness is the server's dossier readiness for that row (`readinessFields`, `client/src/concept2cure/v2/dossierReadiness.ts`).
  - The card layout comes from `git show 78842ee08^:client/src/concept2cure/v2/surfaces/Projects.tsx`, restyled to §2's quiet card: a line of words, with no bar and no chips.
  - The remembered view follows the deleted device Overview's `mdx.viewMode` and `pdev/surfaces/Workstream.tsx` (`pdev.viewMode`).
- **Restore.**
  - `POST /api/c2c/projects/:id/unarchive` (`server/routes/c2c/projects.ts`) had no caller.
  - The governed confirmation is the archive's own: `GovernedConfirmDialog` with `GOVERNED_REASON_MIN` and a typed word, as in `ProjectSettings.tsx` `ArchiveControl`.
  - The request is the archive's (`projectSettingsRequest.ts`), now shared by archive and unarchive (`requestCloseOut`).
- **At risk.**
  - `GET /api/sentinel/findings` (`server/routes/sentinel-routes.ts`; Sentinel's scheduler writes `sentinel_findings` at boot), `GET /api/submission-ops/blockers` and `GET /api/submission-ops/due-soon` (`server/routes/submission-ops.ts`).
  - None had a client caller. `280035bd9`, by the project-page lane, admitted them for Projects and scoped them to the projects the person can open.
  - The header button that `78842ee08` removed only asked AnA, which had no risk data.

## The fold, measured

Measured in Chromium against this tree's running app (signed in as the RR5 author, organisation 5).

| | Before (HEAD `98d2f1975`) | After |
|---|---|---|
| Home 1440×900: composer top | 316 px | 135 px |
| Home 1440×900: first project row | 748 px | 551 px |
| Home 1440×900: "Your open items" | **1032 px (below the fold)** | 510 px, beside Your projects |
| Projects 1440: portfolio figures | not shown (list view only) | 129 px, in grid and list |
| Projects: grid or list remembered | no | yes: List was chosen, the page was reloaded, and List was still pressed |
| Top bar: Search, Help | absent | both at 1440 and at 390 (Search as its icon) |

The raw measurements are in `screenshots/before/before-measurements.json` and `screenshots/after/after-measurements.json`.

## Screenshots (`screenshots/`)

All at 1440×900 and 390×844, in light and dark.

- **Before:** `before/before-{home,projects}-{1440,390}-{light,dark}.png`.
- **After:**
  - `after/after-{home,projects}-{1440,390}-{light,dark}.png`;
  - `after/after-projects-list-1440-{light,dark}.png` (the List view, figures above the table);
  - `after/after-projects-at-risk-{1440,390}-{light,dark}.png` (Sentinel's 11 open findings; "No blockers recorded."; nothing due);
  - `after/after-projects-archived-{1440,390}-{light,dark}.png` (organisation 5 has no archived project, so the honest empty answer shows; nothing was archived or restored on the shared demo data).

The restore flow itself is pinned by `p122ProjectsRestoreArchived.test.tsx`.

## Not restored, and why

- **Average readiness**
  - The server sends no portfolio figure for it.
  - The figure D2-1 showed under the list was the browser's mean over the loaded page (`portfolioMean`), so it was left out of the figures (Rule 2) and that code is gone.
  - Each project's own dossier readiness, which the server measures, is on its card and its list row.
  - A server portfolio figure would have to measure dossier readiness for every program, while the list route bounds that measurement to the page. That is server work, outside this session's files.
- **Browser fallbacks for the other two figures**
  - The "2+" page floor and the browser's count of filing dates were removed as well.
  - A read without `meta.counts` now says "The portfolio figures could not be read."
- **Project names on blockers and due work in the at-risk answer**
  - Those rows carry a numeric `projects.id`. The portfolio read carries program ids and no `projects.id`, so each row is shown by its own title.
  - Sentinel's findings name their project in their titles.
- **Not used:** `/api/submission-ops/workload`, `/approval-bottlenecks` and `/hotspots`, and Sentinel's `/status`, `/scan` and `/config`. They are still refused in production.

## Tests changed because they pinned what P-122 reverses

- **Shell tests.**
  - `shellQuietChrome.test.tsx`, `shellChromeTruth.test.tsx` and `shellQuietChromeRules.test.ts` pinned the bar without Search and Help.
  - They now pin them present, and hold `.tb-search` to the bar's rules: no orange, nothing under 12px.
- **Projects tests.**
  - `projectsCardLine`, `projectsCardStatusReadiness`, `projectsDirectory`, `projectsHonestCounts`, `projectsPathwayCounts`, `projectsPortfolioEmptyMean` and `projectsPortfolioTruncation` pinned three things: the figures as the list's footing, cards with no readiness, and the browser's mean and floors.
  - They now pin the server's counts above the projects, readiness as words on the card, and no browser figure.
  - Their honesty cases stay: no figure over a failed or in-flight read, "Not recorded" and "unavailable" never read as 0, singular and plural.
  - Those suites and `projectsActivity` and `projectsPortfolioLine` now reset the remembered view before each case.
- **`foldDeviceValidation.test.ts`** pinned "no client code reads `/api/submission-ops/blockers`". It now admits the one read-only caller, `ProjectsAtRisk.tsx`, with no "Pass" and no PATCH.

## Gates

- `node scripts/ci/check-one-design-plan.mjs` printed OK on each commit.
- **Lint ratchet.**
  - Each changed file has the same number of warnings as HEAD's version.
  - `Projects.tsx` stays at 7, after the archived link's branch moved into `ArchivedProjectsLink`.
  - The new files have none.
- **Typecheck.**
  - The full command could not finish while another lane's uncommitted `server/services/ana/AnaToolExecutor.ts` had syntax errors (TS1128 at line 17871). The first two attempts were also killed for memory while other lanes ran suites.
  - The client and shared code was checked on its own, with `include: client/src/**, shared/**`: no error in any client or shared file (`green/typecheck-client-and-shared.txt`). The 11 errors listed there are in server files that the client program pulls in without the server's ambient types.
- **CSS gates.**
  - `ci:surface-text-ramp` passes.
  - `ci:undefined-css-classes` passes for these files. Its one failure is `shelf` in another lane's uncommitted `cmcStabilityChart.tsx`.
- **Not caused by this work:** `projectCreationDoors.contract.test.ts` ("Vault.tsx lists the projects…") also fails at HEAD, with Vault in another lane.
