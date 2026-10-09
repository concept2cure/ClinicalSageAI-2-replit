# PF-17 (D2): from the project, every record anchored to it

**Principle:** every chain of governed records starts at one project, so the
project is where a user finds them (`docs/design/PROJECT_FIRST_PLAN_2026-09-26.md`,
PF-17).

## The defects

- **No single read.** Nothing lists a project's records. A user could reach the
  project's submissions, Data Room sources, authoring documents, Vault copies,
  study designs and filing documents only through each surface, and ProjectHome
  had no single read to show them from.
- **A partial activity feed.** `GET /api/c2c/projects/:id/activity` showed only
  audit rows whose `record_id` was the project id or whose `new_values` named
  `project_id`. A governed action on one of the project's own records names its
  target, `document:<id>`. So the scaffold that created the project's dossier did
  not appear, and neither did the placements of its documents into its filing.

## The fix (`server/routes/c2c/projects.ts`)

- **`GET /api/c2c/projects/:id/records`** returns, for a live project of the
  caller's organization (404 otherwise, including a malformed id), one section per
  store. Each section is read by its recorded project key:
  - `submissions` by `program_id`;
  - `sources` by `cre_evidence_sources.client_program_id`;
  - `authoringDocuments` by `client_program_id`;
  - `vaultDocuments` by `program_id`, joined to the program for tenancy;
  - `studyDesigns` by `cdisc_prm_studies.program_id`;
  - `filingDocuments` by `c2c_documents.project_id`.

  A store this database cannot read comes back `available: false` with its reason,
  never as an empty list.
- **The activity feed** also matches:
  - `target = 'regulatory_program:<id>'`;
  - `new_values.programId`, which the submission and placement ledgers now write
    (LX-22, LX-11);
  - governed actions whose target is one of the project's own filing documents.

  All of these are keys, not names. A non-UUID id is 404, not a 22P02 500.

## Evidence (the LX-00 founder walk)

- **`01-red.txt`**: two new `walk-forward` checks fail before the change and are
  not baselined:
  - `project-read-lists-its-records`: the route does not exist;
  - `project-activity-shows-its-records`: the scaffold's governed action and the
    `LEAF_CREATED` rows are absent.
- **`02-green.txt`**: 12 of 12. The project read lists exactly the walk's
  submission and source, and its authoring document, Vault copy and filing
  document. The feed shows the scaffold's action and the placements.
- **The walk's database.** It now carries `cdisc_prm_studies` (the real schema)
  and its program-link migration. The schema-gap guard caught the new read of
  study designs, and the fix was to add the real table, not to excuse the gap.
- **Wider run.** The c2c routes, the program routes, the ProjectHome client tests
  and all golden journeys pass: 54 files, 348 tests.

## Next

ProjectHome can show the records read. `ProjectHome.tsx`'s window has closed; that
is a follow-up.
