# /api/projects holds to the projects the person can open

**Package:** F1. **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`. **Found by:** the coordinating session, verified at
`534a8f2b79`, 2026-11-13. **Status:** fixed, tested on real SQL, exercised over HTTP and walked on the Tasks board as a
member who is not on a private project.

## The defect

`GET /api/projects` (`server/routes/projects-management.ts`) selected every `projects` row of the organisation,
narrowed only by a client workspace id the caller chose to send (`x-client-workspace-id` or `clientWorkspaceId`), and
answered whole rows. The organisation comes from the verified session, so nothing crossed a tenant. Inside one
organisation:

- a member who cannot open a project still read its name, description, settings and budget fields;
- a member working in one sponsor's workspace read the other sponsors' private projects by leaving the header off;
- `GET /:projectId` answered any project of the organisation; `PATCH /:projectId` let **any member, a viewer
  included, rename or re-status any project**; `DELETE /:projectId` asked for a writing role but not for the project.

## What already exists (RULE 3)

| Piece | Path | Does | Did not |
|---|---|---|---|
| The legacy list and its three per-project handlers | `server/routes/projects-management.ts` | Resolve the organisation from the session | Ask whether the person can open the project |
| The project sharing policy | `server/services/report-os/project-access.ts` `getAccessibleReportProjectIds`, `canAccessReportProject`; `server/services/project-sharing-access.ts` | Decides what a member can open (an open project; a private one for its team and the organisation's managing roles) and change (its owner or an edit member; managing roles) | — |
| The session's member | `server/services/c2c/current-program-access.ts` `readCurrentProgramActor` | The person's current role in the organisation, or a refusal | — |
| The canonical list | GET `/api/c2c/projects` (`getCurrentAccessibleProgramScope`) | Admits each program by that same policy | — |
| Other reads already on that policy | `/api/submission-ops/blockers`, `/due-soon`, reporting, tasks, the four listing doors of 2026-11-05 | The same two calls | — |
| The callers | `client/src/concept2cure/v2/surfaces/TaskBoard.tsx` (:554, :2066, :2272), `CollabLauncher.tsx` (:181); demo packs `portfolio.mjs`, `project-management.mjs`, `work-areas.mjs` | Read `id`, `name`, `code`, `regulatoryProgramId` (CollabLauncher declares `status`) | Read any other column |

Nothing new was needed: the route now asks the policy every other list asks.

## What changed (one file)

- **List:** the readable project ids come from `getAccessibleReportProjectIds`; the query selects those, in the
  session's organisation, optionally narrowed by the named client workspace (it can only narrow). It answers
  `id, name, code, status, regulatoryProgramId` and no other column. The debug line that logged every project row is
  gone with the query it logged.
- **Read one, rename, delete:** `projectAdmission` asks `canAccessReportProject` for read, then for write. A project
  the person cannot open answers `404 Project not found`, the answer a missing project gets. One they can open but
  not change answers `403 PROJECT_WRITE_DENIED` on rename and delete. Each statement is also bound to the
  organisation.
- **Failures:** no session user or no current membership is the policy's own refusal (403); an access read that
  fails is `503 PROJECT_ACCESS_UNAVAILABLE`, never an empty list.

**No client change.** Neither caller reads a field that went away, so Wave B's W6 row for `TaskBoard.tsx` is
untouched. (`CollabLauncher.tsx` reads `projectType`, which no row ever carried: the column is `type`. It was empty
before and is empty now; reported, not changed.)

## Red first, then green

`server/routes/__tests__/projects-management-project-scope.pglite.test.ts`: the router on PGlite, `projects` created
from the shared schema, the real policy with no access stub, two members of one organisation.

- On trunk: **8 of 12 fail** (`red.log`). The member receives the private project (`[10, 12]`, expected `[10]`);
  naming the other sponsor's workspace returns it; the row has 36 fields; the private project is read (200) and
  **renamed (200)** by a member who cannot open it; a reader renames an open project (200); a failed access read
  answers 200.
- With the change: **12 of 12**, and the route's existing suites with them, 90 of 90 (`green.log`); the founder-path
  lineage test, which mounts this router, 15 of 15. Typecheck 0 errors. No lint warning in the file before or after.

## On the running server (`live-api.log`)

A temporary local member (role `member`, on no project's team) and one sweep-leftover project marked private, both
removed afterwards.

| Call | Organisation admin | The member |
|---|---|---|
| GET `/api/projects` | 105 rows, the private one among them | 104 rows, without it |
| The same, naming workspace 2 / 3 / 53496 | — | 91 / 4 / 2, never the private one |
| GET `/api/projects/197807` (private) | 200 | 404 |
| PATCH it | — | 404, nothing written |
| PATCH an open project they are not on | — | 403 `PROJECT_WRITE_DENIED` |
| DELETE the private one | — | 404, the row remains |

Every row carries `code, id, name, regulatoryProgramId, status` and nothing else.

## Walked on the Tasks board (`walk.log`, `tasks-board-member.png`, `new-task-member.png`)

As the member: the board loads with no read error and no failed request; its project filter offers 104 projects and
the New task dialog's project picker the same 104; neither names the private project. As the admin: 105 in both,
the private one among them.

## Said plainly

- **What this does not change.** A project is open to its organisation unless it is marked private. So a CRO member
  still reads the names of the open projects of every sponsor workspace in their organisation, here as on the
  canonical list. That is the sharing policy's default, not this route's, and whether a CRO's projects should be
  private by default is a product decision; it is reported to the coordinating session, not decided here.
- **Rename and delete are tighter than before.** An ordinary member who is not the owner or an edit member of a
  project could rename it through this route; now they cannot. No screen in the product calls these two handlers,
  so nothing a person could do on screen is removed; a script that relied on it will be refused with the reason.
- `tests/routes/projects-management-tenant-boundary.test.ts` ("a fresh install is not a 403") still passes, but its
  hand-built request carries no session user and its database mock no pool, so it now exercises the 503 path. The
  fresh-organisation case it was written for is covered on real SQL by the new test, whose database has no
  `licenses` table at all.
- The write check for rename runs before the update, not in one transaction with it; delete's too. A membership
  revoked in that instant is not re-read. The same is true of the handlers this replaces.
