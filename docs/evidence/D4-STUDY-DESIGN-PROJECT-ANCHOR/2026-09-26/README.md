# PF-14 (D4 for D2): a study design belongs to one project of its organization; a SAP is reported stored only when it is

**Principle:** every chain of governed records starts at one project. This one
runs Biostatistics → study design → protocol → IND
(`docs/design/PROJECT_FIRST_PLAN_2026-09-26.md`, PF-14).
**Found by:** the project-anchoring audit (`wf_9dedbf38-bee`: PF-BCQ-1/2/3/6/16,
producers MISSED-5).

## The defects

**`persistStudyDesignTx`** is the one writer of a study design: POST
`/api/study-design/persist`, the Biostatistics bridge, and AnA's protocol→design
derivation all use it. It had three defects.

1. **Unchecked project.** `program_id` was taken from the request without a check,
   so a design could be anchored to another organization's project.
2. **A save re-anchored the design.** `ON CONFLICT (study_id) DO UPDATE SET
   program_id = EXCLUDED.program_id` ran on every save. A save with no project
   erased the design's project, and a save with another project moved it.
3. **A save could overwrite another organization's design.** `study_id` is unique
   across all organizations and comes from the request, and the update had no
   tenant predicate. So a save naming another organization's study id overwrote
   that organization's design.

**POST `/persist`** accepted a design with no project. It answered 500
`PERSIST_FAILED` for every refusal.

**AnA's `generate_sap`** reported "SAP generated … Document prepared" with the id
of an in-memory draft, whether or not the SAP was stored. Behind it, the
workflow's `create_artifact` answered `success: true` with `Date.now()` as the
artifact id when there was no database.

## The fix

- **In the one writer (`study-design-repository.ts`):**
  - the project must be a live project of this organization
    (`programInOrganization`, LX-20);
  - the update runs only on this organization's row;
  - the project goes from none to a project and never moves;
  - otherwise the save is refused with a typed `StudyDesignPersistRefusal`:
    `PROJECT_NOT_FOUND` (404), `PROGRAM_MISMATCH` (409) or `STUDY_ID_TAKEN` (409).
- **The route (`/persist`):**
  - it requires a project (400 `PROJECT_REQUIRED`) before taking a connection;
  - it answers each refusal with its status;
  - the governed-action record names the project.
- **`generate_sap`** reports the stored artifact's id, or says "drafted but not
  stored" with the reason. It still returns the computed figures.
- **`create_artifact`** with no database reports that nothing was stored. It no
  longer invents an id.

## Evidence

- **`01-red.txt`**: the three test files against the source before the change,
  with 11 failures.
- **`02-green.txt`**: with the change, 36 files and 587 tests, covering the
  study-design, protocol-development, Biostatistics-bridge and biostats suites.
  - `persist-program-anchor.pglite.test.ts` (new; real PRM DDL and the program-link
    migration on PGlite), 5 of 5:
    - a foreign project is refused and nothing is written;
    - an own project is anchored;
    - a later save with no project keeps it;
    - a move to another project is refused;
    - another organization naming the same study id is refused, and nothing of the
      first organization's design changes.
  - `study-design-persist.route.test.ts` (new), 5 of 5: no project gives 400
    before a connection is taken; each refusal gives 404 or 409 with a rollback;
    and the governed record names the project.
  - `biostat-command-input.test.ts`: `generate_sap` with a failed artifact write
    reports "not stored", and with a stored artifact names its id.
- **Wider run:** 282 files, including the bridge, the biostats service, the client
  Biostatistics surfaces and every route test. The one failure,
  `auth-refresh-session-currency`, is red on trunk (`9b4e48aa`, handed to the D6
  lane).

## Not in this change

- **Founder decision:** whether `protocol_documents`, which carry only an
  `organization_id`, become keyed to a project.
- **The integer project space.** `generate_sap` still validates the legacy integer
  `projects` id. That is the integer project space, PF-03/PF-09.
