# D5: pivotal is the sponsor's declaration, per study (2026-10-29)

Session `…01E8btkB`. The founder's decision of 2026-10-29: "The client can
determine if it's pivotal by a selection option." Built per study, as
recommended and accepted. Design and **What already exists**:
`docs/design/STUDY_PIVOTAL_DECLARATION_2026-10-29.md`.

## What already exists

Summarised from the design:
- Module 2 decided pivotal from the phase (`isPhase3`).
- The setup interview's "Phase 3 Clinical / Pivotal" is project-level and
  reaches no record.
- The device register's `pivotal` value is device-only.
- The CSR source's study information is a data file.
- No project settings screen exists, and nothing stores a pivotal choice for a
  drug study.

## What changed

- **`migrations/20261029e_study_pivotal_declarations.sql`** (in
  `C2C_MIGRATION_FILES` before the tail).
  - Append-only: UPDATE and TRUNCATE are refused, and DELETE belongs to the
    tenant purge (added to `PURGE_CHILD_TABLES`).
  - Public, with `organization_id INTEGER NOT NULL`; no foreign key.
- **`server/services/csr/study-pivotal-declaration.ts`**: declare, read
  current, and list the project's studies with who declared each (by name),
  when and why.
- **`GET`/`POST /api/csr-workflow/pivotal`** (`server/routes/csr-study-pivotal.ts`,
  mounted beside the CSR board). Both use the CSR scope; a declaration also
  needs a writing role and a project that is not archived.
- **`loadCsrInputsForProject`** passes each study's current declaration to
  Module 2.
- **Module 2** (`m2-summary-builders.ts`).
  - Only a declared `true` makes a study pivotal.
  - An undeclared study is named in a gap, and nothing is inferred from its
    phase.
  - "pivotal (Phase 3)" is gone from the text.
- **Pivotal studies on the CSR workflow board** (`StudyPivotalDeclarations.tsx`).
  - Each study shows its declaration with who made it, when and why, or "Not
    declared".
  - Declare and Change declaration (Yes / No plus a reason) are offered to
    someone with the write permission.

For LMN-201, Lumen declares Part B pivotal (or not) with its reason, and
Module 2.5 and 2.7 then write it up that way.

## Evidence: seen failing first

| Check | Red (`red.txt`) | Green |
|---|---|---|
| `m2-pivotal-declared.test.ts` (new): a declared Phase 2/3 study is pivotal; a Phase 3 study declared not pivotal is not; an undeclared one is named, never inferred; no "pivotal (Phase 3)" text | 7 of 7 fail against the phase rule | 7/7 |
| `study-pivotal-declaration.pglite.test.ts` (new) covers:<ul><li>the real migration;</li><li>a declaration with its reason, where a change is a new row;</li><li>six refusals that record nothing;</li><li>UPDATE and TRUNCATE refused;</li><li>the migration replays;</li><li>the loader hands Module 2 each declaration.</li></ul> | The loader case fails before the loader reads it | 10/10 |
| `csr-study-pivotal.pglite.test.ts` (new): the route on the real CSR scope; seven refusals record nothing; a reader without a writing role still sees | Removing the role gate fails its case; admitting an archived project fails its case | 9/9 |
| `studyPivotalDeclarations.test.tsx` (new): the panel lists, declares, shows the server's refusal and the read failure, and offers nothing without the permission | Removing the reason floor fails its case; removing the permission gate fails its case | 5/5 |
| Every suite reaching Module 2, the loader, the purge list, the route and the board | — | `green.txt`: 683/683 across 53 files |

## Fixtures changed, and why

**Phase 3 meant pivotal.** These suites' Phase 3 studies were pivotal only by
that rule, so they now declare it:
- `m2-summary-builders`
- `m2-summary-conclusions-from-recorded-fields`
- `m2-planned-is-not-enrolled`

**The rule itself.** `m2-phase-as-written` (mine, earlier today) pinned the
phase rule. It now pins what the phase still decides, and that the phase never
makes a study pivotal.

**The new table.** These database fixtures now apply the migration:
- `csr-latest-completed-generation.pglite`
- `module2-csr-inputs.pglite`
- `csr-worker-private-access.pglite`

`unsupplied-statistics`' fake database answers the declaration read with none.

## Not done

- Module 2 composed from a request body (`submission-orchestrator.ts`) carries
  no declaration, so every study there reads as undeclared. It does not accept
  a caller's `pivotal`.
- No electronic signature on a declaration: it is a recorded, attributed claim
  with a reason. Module 2.5 and 2.7, which repeat it, are signed in Authoring.

## Disclosed (files another lane changed in the last 24 hours)

- `client/src/concept2cure/v2/surfaces/BiopharmaProject.tsx`: an import and
  the panel's mount (CSR slices 3 and 7).
- `server/services/tenant/tenant-offboarding.ts`: one purge-list entry.
- `scripts/db/migration-set.mjs`: one set entry.
- `server/services/csr/load-csr-inputs-for-project.ts`: the declaration read.
- Three test fixtures, given the migration: `csr-latest-completed-generation`,
  `module2-csr-inputs` and `csr-worker-private-access`.
- `unsupplied-statistics`: its fake database answers the new read.
