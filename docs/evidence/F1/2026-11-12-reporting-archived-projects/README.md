# An archived project leaves Reporting (S12 biotech sweep, finding 89)

**Package:** F1. **Session:** the reporting session (`session_011HLkYC…`, lane L11), routed by the coordinating session
on 2026-11-12. **The finding:** `docs/evidence/SPINE/S12/2026-11-09-biotech-sweep/defects.json`, position 89, "Duplicate
demo portfolio projects and tasks": archived projects stayed in Reporting's picker and roll-up.

## What already exists (RULE 3)

| Piece | Path | What it does | What it did not |
|---|---|---|---|
| Archive and restore | `server/routes/c2c/projects.ts` `POST /:id/archive`, `/unarchive` (`closeOut`) | Sets `regulatory_programs.status`, with the person's reason on the audit chain | Does not touch the project's anchor `projects` row |
| Delete | the same file | Sets `regulatory_programs.deleted_at` | The same |
| Reporting's list of projects | `server/services/report-os/portfolio/fetch.ts` `fetchOrgPrograms` | The organization's top-level projects the reader may open, for the picker (`programChoices`), the readiness board and its average, and the global schedule | Excluded only `projects.status = 'archived'`, which archiving never sets |

Nothing new was built: one condition was added to the existing read.

## Re-checked first, in the running app (`before-running-app.txt`, `recheck.mjs`)

A project was created and archived through the product. Projects reported it "archived" and left it out of its default
list. Reporting still listed it: in the picker (8 projects) and on the readiness board.

## The change

`fetchOrgPrograms` also leaves out a project whose `regulatory_programs` row is archived or deleted. A project with no
program record is kept.

## Red first, and green

| File | What it shows |
|---|---|
| `red.txt` | `org-programs-archived.pglite.test.ts` (real SQL on PGlite) on the old read: 3 of 3 fail. The archived and the deleted project are listed |
| `green.txt` | The portfolio tests and every canvas route suite: 10 files, 101 tests |
| `after-running-app.txt`, `after.mjs` | On the running app after the change: the archived project is in neither the picker nor the board (7 projects); restored, it is in both (8); archived again, it is gone |

## Not covered here

- **A project group's own roll-up** (`fetchGroupMembers`) still counts an archived member. No screen reaches it yet;
  it is noted for the project-groups reach (`docs/evidence/DESIGN/P-122/reporting/2026-11-12-project-groups/`).
- **The duplicate task cards and bell entries** the finding also mentions are those archived projects' tasks. They are
  not Reporting's and were not traced here.
