# P-122: the project page shows the work, and reaches the project-management engines

Founder decision P-122 (§3.3 and §3.5, 2026-11-10). Inventory:
`shell-projects` items 4 (project-management engines refused in production), 7 (the project page) and 8 (Tasks).

## What already exists (Rule 3)

| Piece | Path | What it did before this work | What it did not do |
|---|---|---|---|
| Step guidance | `fixtures/project-home-data.tsx` `PJ_LIFECYCLE[].now` | Held each step's "what to do" sentence | Rendered nowhere since `a9819177d` deleted `StageBand` |
| Step control | `surfaces/ProjectStages.tsx` `StageTracker` | The six steps as a segmented control, the blurb as one line under it | Say what to do on the step, or lead to the next |
| Records card | `surfaces/ProjectRecords.tsx` `ProjectRecords` | One card, each store a **closed** disclosure with its count (`8225e3075`) | Show any record without a click |
| Activity | `surfaces/ProjectHome.tsx` `ProjectActivity` | The Records card's last **closed** disclosure (`e84c4f1ef`) | Show the audit trail open |
| Tasks and approvals | `surfaces/ProjectHome.tsx` `ProjectWorkPanel` | On Plan only (`d50c5f07e` removed Review's copy) | Appear on Review |
| Dossier readiness | `surfaces/ProjectDossier.tsx` `DossierReadinessCard`, `GET /api/c2c/projects/:id/dossier` | The server's figure, on Author's Module completion and the Filing card | Appear on Review (`d50c5f07e` removed the ring) |
| Section tracking | `server/routes/project-sections.ts` (summary, timeline, milestones); client `ProjectSectionTracking.tsx` reads `project_sections` statuses through the dossier only | Owners, deadlines, milestones, timeline on the server | Any screen; refused in production (out-of-scope) |
| Project task list | `server/routes/c2c/tasks.ts` (list, summary, bulk generator, catalogue, assessment) | Served; its rows reach Plan through the unified work view's Schedule source | Show milestone order, the task engine's counts, the catalogue or the generator; the catalogue was refused in production |
| Hierarchy roll-up | `server/routes/project-hierarchy.ts` `/:id/rollup`, `/tree` | Served (project-home claims the namespace) | Any screen; it answered for any project of the organization |
| Risk engines | `server/routes/sentinel-routes.ts`, `server/routes/submission-ops.ts` | Running (Sentinel scans at boot) | Any screen; refused in production; organization-scoped only |

Searches run: `git grep` in `client/src` for `project-sections`, `schedule-of-events`, `tasks/bulk`,
`submission-milestones`, `/rollup`, `/tree'`, `sentinel`, `submission-ops` (no client caller of any); `git log -S` on
`StageBand`, `pj-stageband`, `What to do now`; the inventory's revert tests.

## Commits

| Commit | Plan | What |
|---|---|---|
| `280035bd9` | R1 | Production admission (first, for the Home/Projects session's at-risk action). See `admission/README.md`. |
| `639e4ba74` | D3 | The step's guidance line with "Next: <step>"; Records stores and Activity open; Review's readiness. |
| `2cc497793` | S9 | A project with no tasks has no health score or completion rate (was 100 / 100% and 100 / 0%). |
| `34d66b559` | R1 | Plan's "Schedule": section owners, deadlines and milestones; the milestone tasks; the hierarchy roll-up. |
| `62271ab8e` | D3 | Review lists the whole "Tasks and approvals" panel again (639e4ba74 had filtered it to review threads, which said "none waiting" while Plan listed approval tasks). |

## Red and green

| Item | Red | Green | Files |
|---|---|---|---|
| Admission (DB, RLS on, two organizations) | 9/15 on HEAD; 6/15 with the claim alone | 15/15 | `admission/` |
| Guidance, Records and Activity, Review | 9/9 on HEAD | 9/9 | `page/red.txt`, `page/green.txt` |
| Review's full panel | 3/20 on 639e4ba74 | 20/20 | `page/review-panel-*.txt` |
| Task summary and assessment figures | 1/10, then 1/11 | 44/44 with the parity and CMC-home suites | `server-figures/` |
| Plan schedule | 7/7 on HEAD | 7/7 | `plan-schedule/` |

Project suites (87 files, `project-suites-final.txt`): 1,034 of 1,037 pass after the last commit; the 3 failures are other sessions' work in the
shared tree: the retired-name ratchet counts `CmcModule.tsx`'s committed `<strong>What to do now:</strong>` and its
`cm-meta` uses (`24603881c`), and `projectCreationDoors` reads `Vault.tsx` (`cc1af9221`).

## Screenshots

`screenshots/before-*` (HEAD before this work) and `screenshots/after-*` (after `62271ab8e`), at 1440 and 390, light
and dark, on the demo project C2C-101 (organization 5), signed in through the form as the demo author. For each:
`plan-steps` (the step control and the line under it), `plan-schedule` (before: Tasks and approvals, where the page
ended; after: the Schedule section), `review`, `records`, `activity`. `shots-before.json` and `shots-after.json` hold
what the page said. Before: nine closed disclosures in Project knowledge (six Records stores and Activity among them).
After: two (Memory and Instructions, outside this scope). No failed request and no horizontal scroll in either walk.

## Found, not fixed

- `project_milestones.project_id` references `cer_projects`, not `projects` (`shared/schema.ts`,
  `migrations/0000_sweet_joseph.sql`): no milestone can be recorded on a project through `/api/project-sections`.
  The timeline reads none. A schema change under Rule 1, not a reach.
- `GET /api/project-hierarchy/:id/tree|rollup` writes each node's roll-up into `projects.metadata` as a side effect,
  and its risk figure reads "medium" where none is recorded. The Plan step shows only its counts.
- The demo data has no `project_sections`, `project_tasks`, work projects, `c2c_blockers` or
  `c2c_project_work_items`, so on every demo project the Schedule says each is empty, in words. Seeding them is the
  DATA package's. The milestone generator was not clicked in the shared demo database.
- The full typecheck (`tsc -p tsconfig.json`) is killed for memory in this shared container (three attempts, exit 137,
  no build cache). The changed files were typechecked in scoped projects: no error in any of them.
