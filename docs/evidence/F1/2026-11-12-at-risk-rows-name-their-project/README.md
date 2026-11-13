# "Which projects are at risk this week": each row names its project and opens it

Package F1. The panel was restored by P-122 §3.2 (2026-11-10). It listed Sentinel's findings, the open blockers and
the work due, but no row said which project it belonged to, and no row opened one. Released to this lane by the
coordinating session on 2026-11-12, with one approved column on the project list read.

## What already exists (RULE 3)

| Path | What it does today | What it did not do |
|---|---|---|
| `client/src/concept2cure/v2/surfaces/ProjectsAtRisk.tsx` | The panel: reads the three engines only while open, lists each answer in the server's order, says an empty answer and a failed read as themselves | Name a row's project, or open it |
| `client/src/concept2cure/v2/surfaces/Projects.tsx` `openProj` | The one opener every card and row on Projects uses (`openProjectHome`) | The panel was not given it |
| `server/services/c2c/project-portfolio.ts` `PROJECT_CARD_SELECT` | The one card projection, shared by the list and the creator's 201. Already joins the program's anchor row in `projects` | Carry that row's numeric id. `id` is the program's uuid |
| `GET /api/sentinel/findings`, `GET /api/submission-ops/blockers`, `GET /api/submission-ops/due-soon` | Rows limited to the projects the person can open, each carrying a numeric project id (`project_id`, `projectId`, `project_id`) | Name the project |
| `client/src/concept2cure/v2/paletteProjects.ts` `PALETTE_PROJECTS_URL` | The whole project list, at the route's cap of 200, read by the palette and the Vault | — |
| `client/src/concept2cure/v2/surfaces/vaultSponsors.ts` `vaultProjectOf` | The exported parser of one row of that list | — |
| `client/src/concept2cure/v2/styles/app-v2.css` `.ana-work-link` | A quiet button that reads as a link; AnA's work panel opens a project with it | — |
| `GET /api/c2c/projects/:id/team` | Already answers the same number under the same name, `project_id` | One read per project, so it cannot name a list |

Nothing is added: no screen, route, service, table, style rule or AnA tool. `git log --all --diff-filter=D` for
`*AtRisk*`, `*RiskPanel*` and `*PortfolioRisk*` under `client/` finds no earlier version.

## What changed

- **One column on the project card: `project_id`**, the numeric id of the program's anchor row, from the join the card
  already makes. It is in the shared projection, so the list card and the creator's 201 card keep the same keys.
  `id` stays the program's uuid.
- **The panel reads the whole project list while it is open** and matches each row to a listed project by that
  number. It does not use the page Projects shows: that page is filtered on the server (client, client type, pathway)
  and holds 50 projects, while the three engines answer for every project the person can open.
- **Each row ends with its project's name as a quiet link.** The link opens the project through `openProj`, by the
  program's id.
- **A finding about several projects names each of them.** Sentinel's cross-project finding carries one `project_id`
  (the first of several) and the rest in `affected_items`. The panel reads the ids from both and takes every name
  from the list. It never shows the label stored beside an id: until the repair filed in
  `../2026-11-12-sentinel-over-allocation-pairs/`, those labels were on the wrong ids.
- **A row whose project the list does not hold gets no name and no reason.** The list cannot tell an archived
  project from a work area inside a project, a deleted one, or one past the cap of 200, so any reason would be a guess.
- **A failed read of the list is said once**, as a failed read: "The project list could not be read, so the rows
  below do not name their projects. The rows themselves are complete." The three answers still stand.
- Only the mount line of `Projects.tsx` changes (`onOpenProject={openProj}`). No stylesheet changes.

## Red, then green

| File | What |
|---|---|
| `01-red.txt` | The new cases against the unchanged panel and card: 8 fail (7 on the screen, 1 on the card), the 9 earlier cases pass |
| `03-mutations.txt` | Six parts of the change broken in turn; each time a named test fails |
| `04-walk.json` and the pictures | The screen used in the running app (below) |

Tests after the change, 17 of 17 in the two files:
- `client/src/concept2cure/v2/__tests__/p122ProjectsAtRisk.test.tsx`, 12 (7 new): the names are read only once the
  person asks; a finding, a blocker and a due item each name their project; a row opens its project by the program's
  id; a cross-project finding names every project and never a stored label; an unknown project gets no name and no
  reason; a failed list read is said once and the answers stand; a card with no number names nothing.
- `server/services/c2c/__tests__/project-portfolio-card-facts.pglite.test.ts`, 5 (1 new), on PGlite with the real
  DDL: the card carries the anchor row's number in the list and in the 201, and both cards have the same keys.

Neighbours, 87 of 87 in 9 files: `projects-create-anchor.pglite`, `projects-list`, `project-portfolio-vocabulary`,
`foldDeviceValidation` (the panel is still the only client reader of the blockers), `projectsDirectory`,
`projectsHonestCounts`, `projectsCardStatusReadiness`, `p122ProjectsRestoreArchived`, `railRecents`.

ESLint: no warning added (the panel, its test, the card projection and its test are at 0; `Projects.tsx` stays at 6).

## Used in the running app (RULE 4)

Chromium, signed in as an administrator, on the local stack with the demo projects (`04-walk.json`):

1. Projects opened. The whole list was not read (0 requests).
2. "Which projects are at risk this week?" pressed. The list was read once. All 17 findings name their project
   (`05-answer-1440.png`); the six "spread across 5 active projects" findings (three people, found on Nov 9 and
   again on Nov 12) each name five (`07-several-projects-1440.png`), with the names the list gives those ids.
3. The link on "2 overdue tasks in Xanomeline TTS Phase 2 (CDISCPILOT01)" pressed: the project's page opened, at
   `/concept2cure/project-home?program=ec15f653-…` (`06-opened-project-1440.png`).
4. Client type set to "Medical device & IVD", which leaves one project on the page. Asked again: the rows still name
   seven projects.
5. The list read made to fail: the one sentence above is shown, no row is named, and the 17 findings are still
   listed (`08-list-read-failed-1440.png`).
6. At 390 wide: no sideways scroll, and the names wrap (`09-answer-390.png`).

No console error and no API response of 400 or above, apart from the failed read made on purpose in step 5.

## Seen, not changed

- **A work area's rows are not named.** A finding, blocker or due item on a work area inside a project (a child row
  of `projects`, with no program of its own) carries the child's number, and no card carries it. Naming it needs the
  server to resolve a row to its filing project. Told to the coordinating session, who put it to the session that
  owns work areas.
- **Rows of a deleted project can reach the three answers.** The projects a person can open are read with no status
  filter (`server/services/report-os/project-access.ts`). Such a row is listed and not named. Routed by the
  coordinating session to Reporting.
- **The same finding is listed once per scan.** In the local data each open finding appears twice, found on Nov 9 and
  on Nov 12: Sentinel stores a finding again once the earlier one is more than 24 hours old. Not changed here.
- **The name read is the heaviest list read.** It measures readiness for up to 200 projects to return their names, as
  it does for the palette. A lighter read would be a new server shape, which this change was not given.
- **The local stack had no blocker and no due work**, so those two lists were walked only in the screen test.
