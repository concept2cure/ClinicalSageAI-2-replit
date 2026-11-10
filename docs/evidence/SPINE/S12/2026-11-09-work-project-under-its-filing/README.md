# S12 slice 2: a work project is added under its filing project, through the one intake

**Package:** S12 (founder decisions P-83, P-109). The coordinating session ruled on 2026-11-09 (anchor and kind)
and again the same day (ruling (B), one door). **Plan:** S12. **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`.

## The decision this builds to

- **The row.** A work project is a `projects` row. Its `parent_project_id` is the filing project's anchor row or one
  of the anchor's descendants.
- **No program of its own.** Its `regulatory_program_id` is NULL. PF-08's `projects_one_anchor_per_program`
  (`migrations/20261001b_projects_one_anchor_per_program.sql`) keeps one anchor row per program, so governed
  artifacts, exports and the Vault stay filed under that row. The child reads its program through its root ancestor.
- **Its kind.** `type` stays `'regulatory'`. The kind is `metadata.workKind`, one of P-83's six: `cmc`,
  `biostatistics`, `rbm`, `data_management`, `clin_pharm`, `nonclinical`.
- **One door (ruling (B)).** Canonical intake, `POST /api/c2c/projects`, stays the one creator (A2.9).
  - A work project is a branch inside that door, not a second door.
  - Its row is written by the anchor module's one `projects` writer. `ci:project-creation-owners` is unchanged and
    passes: one program writer and three bounded PM writers.
- **What was withdrawn.** The first version of this slice added `POST /api/project-hierarchy/:parentId/children`.
  That route was a retired creator, and the gate refused it. It is not in this change.

## What already exists (RULE 3)

See `../2026-11-08-what-already-exists/README.md`. For this slice:

| Piece | Path | Does | Did not |
|---|---|---|---|
| The tree | `projects.parent_project_id`, `depth`, `path` (`shared/schema.ts:5714–5716`) | A self-referencing tree, indexed | Nothing wrote a child at intake |
| The one intake | `server/routes/c2c/projects.ts` `POST /` | Creates a program with its anchor, quota, pathway, workspace, scaffold and audit row | Could not create a work project |
| The one `projects` writer | `server/services/c2c/program-project-anchor.ts` `ensureProgramProjectAnchor` | Writes a program's root anchor row | Could not write a child |
| The hierarchy read | `server/routes/project-hierarchy.ts` `GET /:projectId/children` | Listed any project's children | Had no program or project admission, used the shared pool, and had no client caller |
| The retired creator | `POST /api/project-hierarchy/:parentId/children` (A2.9, 2026-10-26; `scripts/ci/check-project-creation-owners.mjs`) | — | Retired; stays retired |
| Governed write pattern | `server/routes/evidence.ts` `mutateEvidence` | A request-scoped client and transaction, the role, program and project admission, a chained audit row, and "outcome unknown" when a commit is not acknowledged | — |

## What changed

### `program-project-anchor.ts`

- **The one writer, extended.** The file's single `INSERT INTO projects` now lives in `insertProjectRow`. It takes a
  program or a parent, never both and never neither. `ensureProgramProjectAnchor` calls it with the program, no
  parent and depth 0 (the column's default), so an anchor is written as before.
- **`ensureWorkProjectUnderAnchor`** calls the same writer with a parent and no program. On the caller's transaction
  it:
  - locks the parent;
  - proves the parent is the program's anchor or below it (`isWithinProgramAnchor`);
  - refuses a fourth level;
  - returns the existing child with the same name (case- and space-insensitive) and kind, or writes a new one with the
    parent's workspace and priority, the depth, `metadata.workKind` and the materialized path.

  It refuses by name: `PARENT_NOT_IN_PROGRAM`, `WORK_PROJECT_TOO_DEEP`, `WORK_KIND_UNKNOWN`,
  `WORK_PROJECT_NAME_REQUIRED`.
- **`programOfProject`** reads a project's program from its root ancestor, inside the organization.

### `projects.ts`, `POST /`

- **The branch.** A body with `parentProjectId` or `workKind` takes the work-project branch, after intake's existing
  creation-role check. Its body is `{ parentProjectId, name, workKind }`.
- **What it skips.** The program, quota, pathway, workspace and scaffold steps belong to a program, so the branch does
  not run them.
- **Its transaction.** It runs on the request's tenant-scoped connection, in one transaction:
  1. the creation role again, under a share lock;
  2. the program, read from the parent's root;
  3. the program admitted for writing (`requireCurrentProgramAccess`), and its project for editing
     (`requireProjectAdmission`);
  4. the writer;
  5. the chained audit row `project.work_project.create`.
- **Replies.**
  - 201 when added; 200 with `created: false` when the child already exists.
  - 400 `INVALID_WORK_PROJECT`.
  - 403 for a role that cannot create a project.
  - 404 `PARENT_NOT_IN_PROGRAM`, which includes another organisation's project.
  - 409 `WORK_PROJECT_TOO_DEEP`.
  - 503 `WORK_PROJECT_OUTCOME_UNKNOWN` when the commit is not acknowledged; the connection is then discarded.
- **A body without either field** takes intake's existing path, unchanged.

### `project-hierarchy.ts`

- **`GET /:projectId/children?programId=` is now governed.** It:
  - requires the program;
  - admits the program and the project for reading;
  - proves the project is the program's anchor or below it;
  - reads on the request's tenant-scoped connection;
  - returns only the columns the page uses.
- **No create.** The router has no create route; `POST /:parentId/children` answers 404.

### The page

- **Where it shows.** `ProjectWorkProjects` (`client/src/concept2cure/v2/surfaces/ProjectCoreWork.tsx`) is in Project
  knowledge's **Work areas** card, under the area rows. There is no new card or screen.
- **What it reads.** It reads by the project's verified integer id and draws nothing until that id is known. Each row
  shows the name, the kind in words and the owner. A failed read says so; it never says "None yet".
- **Adding.** "Add a work project", for a person who may change the project, opens D0's form. It posts
  `{ parentProjectId, name, workKind }` to `/api/c2c/projects`, says the outcome (a refusal in the server's own
  words), and reads again.

## Red first

**On real PostgreSQL, under row-level security.** `tests/db/work-projects.dbtest.ts` runs on an isolated database:

- with a restricted runtime role (`rolsuper` and `rolbypassrls` false);
- with RLS forced on every table it touches;
- with the request's connection bound by production's own `establishRequestTenantScope`. The test first proves that
  the connection runs as tenant 9 with `app.rls_enforce = 'on'`.

It mounts the real intake router and the real hierarchy router. The 11 cases:

1. The child is added under the anchor with no program id and with its kind. Its audit row has the same `xmin` (one
   transaction), and the program still has one anchor row.
2. A repeat is the same child, with no second audit row.
3. Nesting under a work project reaches depth 3, and a fourth level is refused `WORK_PROJECT_TOO_DEEP`.
4. A parent with no program is refused `PARENT_NOT_IN_PROGRAM`, and nothing is written.
5. **Cross-organisation, under RLS.**
   - Organisation 9's editor naming organisation 10's anchor gets 404 `PARENT_NOT_IN_PROGRAM`, and the reply does not
     name organisation 10's program.
   - Organisation 10's member naming organisation 9's anchor is refused.
   - Nothing is written in either case.
6. A viewer is refused with 403. An unknown kind, an empty name and parent 0 are refused with 400.
7. **One door.** `POST /api/project-hierarchy/11/children` answers 404 and writes nothing.
8. When the chained audit row cannot be written, the child rolls back, and the reply names no constraint.
9. The read lists the anchor's work projects with their kind.
10. The read refuses a project outside the program, another organisation's member, and a member not on a private
    project. No reply names the child.
11. The read needs the program named.

Against trunk's server files, 9 of 11 fail (`dbtest-red.log`). The two that pass on trunk are the refusals: trunk's
intake also refuses those bodies, as an incomplete program. With the change, 11 of 11 pass (`dbtest.log`).

**The page.** `__tests__/projectWorkProjects.test.tsx` has 4 cases. All 4 fail on trunk, where the component does not
exist (`ui-red.log`), and pass with the change (`ui.log`).

- The refusal case now gives its mock reply the JSON content type. Without that header, the old mock threw before the
  server's message was read, and the case passed on "not added" alone.
- The case now asserts that the server's sentence reaches the person.

## Intake is unchanged

- **Tests.** The intake suites (`projects-create*`, `projects-rbm-choice`, `projects-add-market-route`,
  `organization-default-workspace`, `programme-profile-write`, `projects-registry-context-backfill`) pass: 15 files.
- **The founder-path lineage test fails.** `tests/lineage/founder-path-lineage.pglite.test.ts` fails 11 of 15 cases.
  It fails the same 11 on trunk's server files in this container, so this change did not cause it.
- **In the running app** (`intake-checks.log`):
  - A program with its workspace named is created as before: 201, its anchor written, 92 sections scaffolded. The
    anchor row has its program, no parent and depth 0.
  - Without a workspace named, intake refuses as it always has, because this organisation has two active workspaces.
  - A malformed work project is refused 400 before anything is written.
  - The retired hierarchy POST answers 404.

## In the running app

`walk.cjs` (`walk.log`, `walk.json`, `screenshots/`) runs on C2C-101:

1. At 1440 light, the Work areas card shows "Work projects" and "Add a work project".
2. The form takes the kind (CMC) and a name (`add-form-1440-light.png`).
3. `POST /api/c2c/projects` answers 201.
4. The card's own list then shows the row, without a reload (`added-1440-light.png`).
5. The card is captured fresh at 1440 dark and at 390 light and dark, with no sideways scroll at 390 (`card-*.png`).

The database holds project 9:

- `parent_project_id` 1 (C2C-101's anchor), `depth` 1, `path` `1/9`;
- `regulatory_program_id` NULL and `metadata.workKind` `cmc`;
- its chained audit row, `project.work_project.create`, with `record_id` 9 and `chain_seq` 746.

Rows 7 and 8 are from this slice's first walks, through the withdrawn hierarchy POST, on the local disposable
database.

## Gates

- `ci:project-creation-owners` passes unchanged. `npm run typecheck` reports 0 errors.
- ESLint gained no warning: `projects.ts` has 3 (trunk 4) and `project-hierarchy.ts` has 2 (trunk 3).

## Next in S12

1. **A work project opens on its work area** (P-83 (b)): the work area reads the work project from the shell,
   through the existing doors.
2. **Deliverables:** a Vault version family linked to the filing section it feeds (`c2c_artifact_section_map`),
   through S6's holder. Then the stale flag when a newer version is approved.
