# Quality reads the open project, and says whose records it lists (C14, 2026-11-10)

Package **D7**, sweep item C14 (QP3). Quality is reached from a project. Opened with a project open
(`?program=<id>`), it still listed the whole organisation's controlled documents, changes, CAPAs and nonconformances.
Nothing on the screen said whose records they were. A person working on one programme read the others as theirs. AnA
was told "the register holds 100 CAPAs" with no word of whose they were.

## What already exists

The server already scopes four of Quality's reads by project. Each one takes `program_id`, admitted by
`queryProject` (`server/routes/mdx-qms-context.ts:68`), which refuses a project outside the tenant:

| Register | Route | How the project is matched |
|---|---|---|
| Controlled documents | `GET /api/mdx/qms/documents` (`server/routes/mdx-qms.ts:365`) | the authoring document's `client_program_id`: the documents **authored in** the project |
| Changes | `GET /api/mdx/qms/changes` (`server/routes/mdx-qms.ts:1178`) | the change's `program_id` |
| CAPA | `GET /api/capa-mdr/capa` (`server/routes/capa-mdr.ts`) | the CAPA's `program_id` |
| Nonconformances | `GET /api/mdx/qms/nonconforming` (`server/routes/mdx-qms-records.ts:344`) | the record's `program_id` |

Training, deviations, suppliers, internal audits and management reviews are not kept per project: their tables have no
project column. Their routes take none.

The client already had these pieces:

- `useShellProject()` / `shellProgramId()` (`client/src/concept2cure/v2/shellProject.ts`): the open project.
- The CAPA create form (`qmsCapaRegister.tsx`) and the change form (`ChangeControl.tsx`) already filed under the
  open project.
- `ControlledDocumentDialogs.tsx` already preselects the open project for a new controlled document. That is the
  second half of QP3, and it needed no change.
- What it lacked: every read passed no `program_id`, so every register was the organisation's. The nonconformance
  form posted no project.

Nothing new: no route, table, mount or screen. The scope is a URL parameter on the existing Quality work area
(`?quality=organisation`), read the way the work area already reads `?program=`.

## What changed

| | Before | After |
|---|---|---|
| Opened with a project open | every register was the organisation's; the header said "Controlled documents and their training, change control, CAPA and the other quality records." | documents, changes, CAPAs and nonconformances are the project's (`program_id`). The header names the project and what is its and what is the organisation's: **"C11 · Walk C11 gasket programme: its controlled documents and their periodic review, changes, CAPAs and nonconformances. Training, deviations, suppliers, audits and management reviews are the organisation's."** |
| Widening | — | **"Show the whole organisation"** in the header's actions sets `?quality=organisation`; the header then reads "The whole organisation's quality records." and offers **"Show {project} only"**. The choice survives a reload. With no project open there is no choice, and Quality reads the organisation whatever the URL says. |
| An empty scoped register | "No controlled documents yet." (false: the organisation has some) | "No controlled document was authored in {project}." / "No change is filed under {project}." / "No {CAPA, nonconformance} filed under {project}.", each with the way to the organisation's |
| Periodic review, scoped | the organisation's schedule, under a header naming the project; with no project documents, "No controlled documents yet" | the schedule is filtered to the project's documents (`SopRegister.tsx`), and its empty line reads "No controlled document was authored in {project}, so none of its documents is due for review." |
| Training coverage, scoped | unlabelled | **"Organisation-wide"** beside its heading |
| Registers not kept per project | unlabelled | their figure line begins **"Organisation-wide · "** |
| The change log's figures, scoped | the organisation summary route's counts, beside the project's rows | the project's own rows, counted by the server's definitions (`summaryOfChanges`, `changeData.ts`): the summary route takes no project |
| A new nonconformance | filed under no project | the form's Project field defaults to the open project, as the CAPA form's does, and the create posts `programId` |
| AnA | "The register holds 2 CAPAs" | "The register holds 2 CAPAs filed under the project {project}", or "… of the whole organisation (this register is not kept per project)". The header's context names the scope. |

`registerContext.ts` holds the scope: `useQualityScope()`, `setQualityWide()`, `scopedPath()` and
`QUALITY_SCOPE_PARAM`. `hooks.ts useSopRegister`, `changeHooks.ts useChangeRegister` and `QmsRecords.tsx` (for a
register marked `projectKept`) read through `scopedPath`.

## Tests

- `qualityScope.test.tsx` (new test file beside the code it tests):
  - with a project open, the documents and changes reads carry `program_id`;
  - "Show the whole organisation" sets `?quality=organisation` and drops it; "Show … only" restores it;
  - with no project open the scope is the organisation's, whatever the URL says.
- `QualityWorkArea.test.tsx`:
  - the header names the project and what is the organisation's, widens, and narrows again;
  - there is no choice with no project open;
  - periodic review lists only the project's documents, and training says it is organisation-wide.
- `QmsRecords.test.tsx`:
  - CAPA and nonconformance read the project's rows, with no "Organisation-wide" line;
  - suppliers say "Organisation-wide · " and tell AnA so;
  - a new nonconformance defaults to the open project and posts its id.
- `ChangeControlProject.test.tsx`: a scoped log counts its own rows, not the organisation summary.
- `recordTabContext.test.tsx`: AnA's summary says whose rows these are.

`red.txt`, two runs:

1. The new cases against the code before C14: nine fail.
2. The periodic-review filter removed from `SopRegister.tsx`: "lists for periodic review only the project's
   documents…" fails. "states the register in one sentence…" fails in that run as well, because the failed case
   left its review rows set. The reset has since moved into `afterEach`.

`green.txt`: Quality's suites, AnA's wave-4 suite and the project-home Quality suite pass: 30 files, 368 tests. The
typecheck is clean.

## Walked in the running app

`w21-project-scope.cjs` (log: `shots/w21-project-scope.log.json`) ran as the approver, opening Quality with the walk
project `C11` open. It recorded no API or page errors.

- **SOP register, scoped** (`shots/w21-sop-project-1440.png`):
  - the header names C11 and what is the organisation's;
  - "Show the whole organisation" is offered;
  - no row is listed, and the empty line reads "No controlled document was authored in C11 · Walk C11 gasket
    programme.";
  - periodic review reads "… so none of its documents is due for review.";
  - training is marked "Organisation-wide".
- **Change control, scoped:** "No change is filed under C11 · Walk C11 gasket programme."
- **CAPA, scoped:** the project's 100 most recently updated CAPAs.
- **Nonconformances, scoped:** one row.
- **Deviations:** "Organisation-wide · Open: 1 (0 closed) · …".
- **A new nonconformance:**
  - the form's Project field is checked on C11;
  - after Record, the scoped register shows two rows (`shots/w21-nc-project-1440.png`).
- **"Show the whole organisation":**
  - nonconformances show three rows, and the header reads "The whole organisation's quality records.";
  - the SOP register shows the organisation's one document (`shots/w21-sop-organisation-1440.png`);
  - a reload keeps the choice;
  - "Show C11 · Walk C11 gasket programme only" returns to the project.

Run the walk from this folder with `NODE_PATH=$(npm root -g) node w21-project-scope.cjs`. It needs `WALK_PASSWORD`, a
running server, and the walk project of `../2026-11-10-records-table/`.
