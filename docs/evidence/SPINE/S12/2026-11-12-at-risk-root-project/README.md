# A row of "Which projects are at risk" names the project a card carries (server half)

**Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`. **Asked by:** the coordinating session, 2026-11-12, from the CSR lane's
critic: child work projects (`parent_project_id` set, no program) appear in the at-risk answer under the child's id,
which no project card carries, so those rows cannot be named or opened. **Status:** server half done and tested. The
screen (`ProjectsAtRisk.tsx`) is not changed here; who shows the project on the row is the coordinating session's call.

## What already exists (RULE 3)

| Piece | Path | Does | Does not |
|---|---|---|---|
| The at-risk answer | `client/src/concept2cure/v2/surfaces/ProjectsAtRisk.tsx` (P-122 §3.2, `a0a8d3ed0c`) | Lists Sentinel's findings, the open blockers and the work due in 7 days, for the projects the person can open | Name or open the project of any row |
| Blockers read | `server/routes/submission-ops.ts` GET `/blockers` | Open blockers of the readable projects, most severe first, each with its own `projectId` | Say which project that is, or which filing project a work project belongs to |
| Due-soon read | GET `/due-soon`; `readCanonicalDueSoonAndWorkload` (`server/services/regulatory-correspondence/operating-layer.ts`) | Work items due within 7 days, each with its own `project_id` | The same |
| The walk to a root | `server/services/c2c/program-project-anchor.ts` `programOfProject`, `isWithinProgramAnchor`; `server/services/tasking/task-project.ts` `canWorkOnProjectTasks` | One project at a time: up `parent_project_id` to the root, inside the organization, bounded | Many projects in one read; the root's name |
| The access rule | `task-project.ts` (P-111) | A work project's member gains nothing on its parent | — |

Searches run: `projects at risk|atRisk`, `parent_project_id|parentProjectId`, `rootProject|root_project|WITH RECURSIVE`
across `server/`, `client/src/concept2cure/`, `shared/`. No batch resolver existed. Nothing deleted was found under
those names.

## What changed

- `program-project-anchor.ts`: `namedProjectsWithRoot(client, orgId, projectIds, openable)`, the batch form of
  `programOfProject`'s walk (one recursive read, inside the organization, at most ten levels). For each project: its
  name, and its root's id, name and program. The root is given only when it is in `openable`.
- `submission-ops.ts`: both reads add `project: { id, name, root: { id, name, programId } | null } | null` to each row
  (`withNamedProjects`). Every field a row had, and the order, are unchanged. No new route, table or query parameter.

## What a caller reads

| Case | `project` |
|---|---|
| Row on a filing project | itself, and itself as `root` with the program a card opens |
| Row on a work project, any depth | the work project, and the filing project as `root` |
| Reader can open the work project, not the filing project | the work project, `root: null` |
| Parent is in another organization, or no root within ten levels | the project, `root: null` |
| Ordinary project with no program | itself as `root`, `programId: null` |

## Red first, then green

- `tests/submission-ops-at-risk-root-project.test.ts` (the router on PGlite, real SQL): on trunk 5 of 7 fail, each
  because the row carries no `project` (`red.log`); with the change 7 of 7 pass, and the existing
  `submission-ops-blocker-resolver` cases with them, 22 of 22 (`green.log`).
- Neighbours: `submission-ops-section-routes`, `launch-reproof-narrowing`, `p122ProjectsAtRisk`: 259 of 259.
- Typecheck: 0 errors. Lint: no file gained a warning (`submission-ops.ts` 13 before and after).

## Against the local Postgres database (`live-postgres.log`)

The function run against this container's real `projects` table (15 work projects): work projects 7, 8, 9 and 11 each
name "[Demo · Biotech] C2C-101 … (IND)" (project 1) and its program as their root; with only the work project openable
the root is withheld; asked as another organization, nothing is returned.

## Not done, said plainly

- **Not opened in the running app.** No screen changed, and the two reads were exercised through the router in the
  test and through the function on Postgres, not over HTTP on a running server.
- **Sentinel's findings** (GET `/api/sentinel/findings`), the third read on that screen, are untouched: asked of the
  coordinating session.
- **The screen** does not yet show `project`. Until it does, the customer sees no difference.
