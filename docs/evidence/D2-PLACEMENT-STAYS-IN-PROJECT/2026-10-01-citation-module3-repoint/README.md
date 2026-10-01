# PF-11, the rest (D2 for D7): a citation, a Module 3 placement and a re-pointed leaf stay inside one project

Plan: `docs/design/PROJECT_FIRST_PLAN_2026-09-26.md` §PF-11. The founder
decision PF-11 (2026-09-26): a cross-project reference is refused by default.
The placement half landed in `39dfd9b7`. A scouting workflow with a skeptic per
claim (`wf_39bf69be-ba3`) established what was still open at HEAD.

## What was open, and what changed

### 1. A section could cite another project's Data Room source

- **The defect.** `citeSource` (`source-usage.service.ts`) checked the section
  and the source by organization alone. So a project A section could cite
  project B's source, and the citation reached neither project's source-change
  list.
- **The fix.** The two ends are read with their projects in one place,
  `citation-ends.ts` (`readCitationEnds`, `citesAcrossProjects`).
  - Both recorded and different is refused: `SourceUsageError` with code
    `CROSS_PROJECT`, and nothing is written.
  - A source with no project (organization-wide or global) and a document with
    none are not judged.
  - The check runs before the existing citation is read, so a legacy
    cross-project citation is not re-affirmed either.
- **How the router answers.** It maps any `SourceUsageError` to 400 with its
  message, so the refusal already fails closed and says why. The 409 mapping is
  one line in `authoring.router.ts`, which is in `…01T2wooC`'s window, and is
  handed to them.

### 2. The project's source-change list was scoped by the wrong end

- **The defect.** `listChangedSourceUsages` scoped by the **source's** project.
  So an organization-wide source cited by the project's documents was never
  listed for the project, and a cross-project citation was listed for the wrong
  one.
- **The fix.** It scopes by the **citing document's** project.

### 3. `GET /api/c2c/projects/:id/source-changes` checked the program inline

- **The defect.** It had no `deleted_at` check, and sent a non-UUID id to a uuid
  column, which answered 500.
- **The fix.** It now asks `programInOrganization`, the canonical check.

### 4. Module 3 could be placed into another project's submission

- **The defect.** `placeModule3IntoSubmission` never compared the CMC project
  with the submission's program. Each section is snapshotted into
  `coauthor_documents` with no alias, so `upsertLeaf`'s own check read no
  project for it and could not judge it.
- **The fix.** It refuses `cross-project` (409 `CROSS_PROJECT` from the route)
  before anything is read or written.
  - A v2 project is compared directly with the submission's program, case
    aside.
  - A legacy numeric project is compared with the program's anchored row,
    through `resolveCmcArtifactProject`.
  - A side that records nothing, or an unanchored program, is not judged, as
    `upsertLeaf`.

### 5. A re-pointed leaf's ledger named only the new document

- **The defect.** The `LEAF_UPDATED` audit spread only the document placed, so
  a re-point left no record of what it replaced.
- **The fix.** The previous document is read in the same locked transaction, by
  the UPDATE's own WHERE. The ledger records `previousDocument` and
  `documentChanged`.

## Tests

- **`source-usage.pglite.integration.test.ts`:**
  - another project's source is refused `CROSS_PROJECT` with no citation row;
  - a document with no project is not judged;
  - an organization-wide source cited by the project's document is listed for
    the project.
  - The fixture's documents now belong to a project, project A unless said
    otherwise (PF-07), through the real `20260727` scope migration.
- **`leaf-cross-project.pglite.test.ts`:** a re-point inside the project names
  the old and new document. An update that keeps the document says
  `documentChanged: false`.
- **`place-module3-into-submission.test.ts`:**
  - another program's submission is refused before any write;
  - the same program, in another letter case, is placed;
  - a numeric project is compared with the anchor, both ways;
  - an unanchored program is not judged.
- **The founder-path walk:** a deleted project's and a malformed id's source
  changes are 404 on the real route; a live project's are 200.
- **Fixtures brought to the real schema:**
  - `authoringWritesBoundAndAudited` and `source-versioning` apply the
    `20260726` / `20260727` scope migrations.
  - `leaf-source-pin`'s mock transaction answers the locked read.

## Red, then green

- `01-red-repoint-audit.txt`: both re-point cases fail.
- `02-red-module3-cross-project.txt`: both refusals fail.
- `03-red-citation.txt`: the cross-project refusal and the organization-wide
  listing fail.
- `04-red-source-changes-route.txt`: the walk observes
  `{"deleted":200,"malformed":500,"live":200}`.
- `05-green.txt`: **93 files, 1015 tests pass** (2 skipped). That is the
  evidence-spine, citation, authoring-audit, Data Room client, submission-service,
  CMC service, CMC route and walk suites, and the migration-list closure.

## Still open in PF-11, handed on

- **Pins.** `stream.ts`'s `source_ids` resolve through `resolveSourceUploadIds`
  with no project, so a project B source pinned while project A is open grounds
  A's turn. The fix is an optional `programId` on the resolver, passed from
  the stream after `programInOrganization`. `stream.ts` is held by `…01KZK3jg`.
- **Protocol → design binding.** `protocol_documents` has no project column, so
  the binding cannot be judged. It needs an additive column and key (PF-16
  territory) before the comparison.
- **The filing picker** (`filingTarget.tsx`) offers every submission of the
  organization and lets the server refuse. A UX change, next.
