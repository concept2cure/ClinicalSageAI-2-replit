# PF-11 (D2), placement: a filing holds only its own project's documents; LX-11: the placement ledger names what it placed

**Principle:** every chain of governed records starts at one project, and a filing
is that project's (`docs/design/PROJECT_FIRST_PLAN_2026-09-26.md`, PF-11;
`docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md`, LX-11).
**Found by:** the project-anchoring audit (`wf_9dedbf38-bee`): PF-vault-5 and
PF-SUB-5 (probe P4). The lineage walk baselined the ledger half as SUB-10 → LX-11.

## The defects

- **Placement did not compare projects.** `upsertLeaf` proved that a leaf's document
  belongs to the caller's organization, and nothing more. A Vault document of
  project B could be placed into project A's sequence, pinned, and transmitted in
  A's filing. The same held for a governed section of B's filing document and for
  B's authoring filing copy.
- **The ledger did not name the document.** The `LEAF_CREATED` and `LEAF_UPDATED`
  audit rows recorded the sequence, the section and a reason. They did not record
  the document placed or the pin it took, so the chained ledger could not say what
  went into a filing.

## The fix (`server/services/submission-service/submission-service.ts`)

- **The document's project.** `leafSourceProgram` reads it where the store records
  one:
  - a Vault document's `program_id`;
  - a governed section's filing document's `project_id`;
  - an authoring filing copy's document's `client_program_id`, through
    `c2c_document_aliases`.

  It runs after the tenancy verifier. A store this database does not carry
  records nothing. Drizzle wraps the driver's error, so the SQLSTATE is read from
  its cause. Any other failure propagates: a placement is never allowed because
  its project could not be read.
- **The submission's project.** It is read in the same statement as the placement
  vocabulary (`submissions.program_id`, LX-22).
- **The refusal.** When both projects are recorded and they differ, the placement is
  refused with `CROSS_PROJECT` (409, a new `SubmissionErrorCode`) before anything
  is written. This covers creating a leaf and re-pointing an existing one.
- **A placement it cannot judge stands.** That is the case when the submission, or
  the document, records no project.
- **Both ledger rows** now carry the document table, its id or uuid, the pin, the
  submission's project and the document's project. `LEAF_UPDATED` also carries
  the sequence.

**Founder decision (PF-11): is a cross-project reference ever legitimate**, for
example one Investigator's Brochure cited by two INDs? The plan's proposal,
"refuse by default", is what is built. A recorded cross-program reference that
names both projects and a reason is not built. If the founder decides such
references are legitimate, that is where they would be added.

## Evidence

- **`01-red.txt`**: against the source before the fix, 7 failures.
  - The six cases of `leaf-cross-project.pglite.test.ts`. Five are refusals that
    came back as placed leaves, and one is a ledger row with no document.
  - The lineage walk's `place` hop, with the baseline entry for
    `placement-audit-names-document-and-pin` removed.
- **`02-green.txt`**: with the fix.
  - **`server/services/submission-service/__tests__/leaf-cross-project.pglite.test.ts`**
    (new; real SQL on PGlite with the real authoring and alias migrations), 6/6:
    - another project's Vault document, governed section and authoring filing
      copy are each refused 409 `CROSS_PROJECT`, and nothing is written;
    - re-pointing an existing leaf at another project's document is refused, and
      the leaf keeps its document;
    - the project's own document is placed, and the ledger names the document,
      its pin and the project;
    - a placement into a submission with no recorded project stands, and the
      ledger records both sides.
  - **The LX-00 walk.** `place/placement-audit-names-document-and-pin` passes.
    Its baseline entry is removed and the ceiling goes from 18 to 17 (the baseline
    only shrinks). `ci:canvas-path` passes.
  - **Callers.** Every placement caller's suite passes: the REST route, the IND
    lifecycle, the IND forms contract, CMC Module 3, ingestion `classifyDocument`,
    the governed-document pipeline, and all 11 golden journeys. The NDA journey now
    applies the real authoring and alias migrations, because its schema-gap guard
    caught the new read.
  - **Mocks.** One unit test (`leaf-source-pin`) mocks `db` without `execute` and
    gained the one new read. It returns no project, so its placements stand as
    before. The NDA journey and the new test also apply the two authoring
    migrations that `authoring-migration-list-closure` requires once
    `authoring_documents` is built.
  - **The wider run.** 876 files, 10,218 tests. The one remaining failure,
    `auth-refresh-session-currency`, is red on trunk since `9b4e48aa` and handed
    to the D6 lane.
