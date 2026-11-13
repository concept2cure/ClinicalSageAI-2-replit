# The at-risk rows take each row's project from the row, work areas included

Package F1. This follows `../2026-11-12-at-risk-rows-name-their-project/` (`52dd515f5`), which named a row's project
by matching its number against the project list in the browser. That left one case unnamed: a row recorded on a work
area inside a project (CMC, biostatistics, quality), which is not a card on Projects. On 2026-11-12 the Project page
session landed the server half for two of the three reads (`ea181e30ed`), and the coordinating session asked this lane
to give Sentinel's findings the same.

## What already exists (RULE 3)

| Path | What it does today | What it did not do |
|---|---|---|
| `server/services/c2c/program-project-anchor.ts` `namedProjectsWithRoot`, `NamedProject` (`ea181e30ed`) | Each project with its root, the filing project a card on Projects carries, and the program that card opens, in one read inside the organisation. The root is named only when the reader can open it | — |
| `server/routes/submission-ops.ts` `withNamedProjects` (`ea181e30ed`) | `GET /blockers` and `GET /due-soon` rows carry `project` in that shape | — |
| `server/routes/sentinel-routes.ts` `GET /findings` | The findings the reader may see, limited to those whose every named project the reader can open | Carry the project's name: rows held `project_id` and `affected_items` only |
| `server/services/sentinel/sentinel.ts` `findingProjectIds` | The projects a finding names, read for one finding by id, for the update route's access check | Exist as a function the list read could use: the rule was written inline |
| `client/src/concept2cure/v2/surfaces/ProjectsAtRisk.tsx` (`52dd515f5`) | Named a row by matching its number against the whole project list, read while the answer was open | Name a row on a work area; and it made the heaviest list read (200 projects with their readiness) to get names |
| `server/services/c2c/project-portfolio.ts` `project_id` on the card (`52dd515f5`) | The number the panel matched by | It has no reader once the rows carry their project |

Nothing is added: no screen, route, service, table or AnA tool. One test file is new.

## What changed

- **A Sentinel finding carries the projects it names**, from the resolver the other two reads use: `project` for its
  own project, and `projects` for every project it names, its own first. The rule "the projects a finding names" is
  now one function, `findingNamedProjectIds`, used by the list read and by the update route's access check. The names
  come from `projects` by id. A label stored in `affected_items` is not used.
- **The panel reads each row's project from the row.** A row ends with its filing project's name as a link that
  opens it by the program's id. A row recorded on a work area says the work area after it: "LMN-201 … (CMC)". A
  finding about several projects names each filing project once.
- **What cannot be opened is said in words, with no link**: a work area whose filing project the reader cannot open,
  and a project with no program. A row with no project, or with something that is not one, says nothing.
- **Two things from `52dd515f5` have no reader left and are removed**: the panel's read of the whole project list,
  and the `project_id` column on the project card with its test case. The card is as it was before that commit.
- `openProj` in `Projects.tsx` takes a project with or without its code (one type), so the panel opens a project
  through the opener every card uses.

## Red, then green

| File | What |
|---|---|
| `01-red.txt` | The new cases against trunk: 12 fail (7 on the route and its helper, 5 on the screen) |
| `03-mutations.txt` | Nine parts of the change broken in turn. Eight were caught at once. The ninth showed a weak test, which was strengthened and then caught it |
| `04-walk.json` and the pictures | The screen used in the running app (below) |

Tests after the change, 107 of 107 in 12 files:
- `tests/sentinel-findings-name-projects.test.ts`, 9, new: a finding's own project in the shared shape; several
  projects once each, own first; every field, the order and the total kept; the names asked for once, inside the
  organisation, with the reader's own projects as the ones a filing project may be named among; a project the
  organisation does not hold; a failed read of the names fails the read; the shared rule.
- `client/src/concept2cure/v2/__tests__/p122ProjectsAtRisk.test.tsx`, 11 (6 on this): names and opens; says the
  work area; a cross-project finding names each filing project once and never a stored label; no link for what
  cannot be opened; nothing for a row with no project; and no read of the project list beyond Projects' own.
- Unchanged and passing: `tests/sentinel-finding-resolver.test.ts` (the update route's access check, through the same
  function), `tests/submission-ops-at-risk-root-project.test.ts`, `server/services/sentinel` (22),
  `project-portfolio-card-facts.pglite`, `projects-create-anchor.pglite`, `foldDeviceValidation`, `projectsDirectory`.

ESLint: no warning added on any of the six changed files.

## Used in the running app (RULE 4)

Chromium, signed in as an administrator, on the local stack. To have a real row on a work area, the product's own
routes were used first: a work area "CMC" was added inside LMN-201 (`POST /api/c2c/projects` with a parent), two
overdue tasks were recorded on it (`POST /api/tasks/tasks`), and Sentinel's deadline analyzer was run
(`POST /api/sentinel/scan/deadline_risk`). It stored "2 overdue tasks in "CMC"". Then (`04-walk.json`):

1. Projects, "Which projects are at risk this week?": 18 findings, every one names its project
   (`05-answer-1440.png`). The whole project list was not read (0 requests).
2. The row "2 overdue tasks in "CMC"" ends "LMN-201 — prevention of recurrent C. difficile infection (IND) (CMC)",
   the project's name a link (`06-work-area-row-1440.png`). Before this change that row had no name.
3. The link pressed: LMN-201's page opened, at `/concept2cure/project-home?program=4f29bace-…`
   (`07-opened-project-1440.png`).
4. The findings about one person spread across five projects each name five, once.
5. At 390 wide: no sideways scroll (`08-answer-390.png`).

No console error and no API response of 400 or above.

## Not in this change

- **A row of a project the person cannot open at all is not listed**, as before: the three reads are limited to the
  reader's projects on the server.
- **The same finding is still listed once per scan day** (Sentinel stores it again after 24 hours). Told to the
  coordinating session.
- **The local stack had no blocker and no due work.** Those two lists were exercised in the screen test with the
  server's shape, and on a real engine in `tests/submission-ops-at-risk-root-project.test.ts`.
