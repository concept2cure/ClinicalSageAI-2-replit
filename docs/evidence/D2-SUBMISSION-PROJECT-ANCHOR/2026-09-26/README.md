# LX-22 (D2), part 1: a submission carries its project

**Principle:** every chain of governed records starts at one project of the client's
organization (`docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md` §0).
**Found by:** the project-anchoring audit (PF-creation-1, a blocker) and the
lineage-plan critic (LX-22), both in `wf_9dedbf38-bee`.

## The defect

`submissions` had no project key. The only record of which project a submission
belonged to was `submission_id` inside the sealed `c2c.project.create` audit row.
Every production reader re-derived the link by product name or title:
`ensureSubmissionSpine` in project intake, the IND checklist assembler, and
Dispatch Readiness. As a result:

- two projects for the same product shared one filing spine;
- a submission made in Submission Center had no project at all, because its form
  makes the user pick one and then drops the id;
- a sequence or transmittal could reach its project only by inference. This is
  one of the red hops in the LX-00 founder-path walk (`tests/lineage/`).

## The fix (this part)

`migrations/20260925b_submissions_program_anchor.sql` is on the applier, before the
final tenant-sweep pair.

- **`submissions.program_id UUID`**, nullable. NOT NULL follows once every writer
  sets it.
- **`submissions_program_same_org_fk`**: `(program_id, organization_id)` →
  `regulatory_programs (id, organization_id)`. The database, and not only the
  writer, refuses a submission anchored to another organization's project.
  - It is added `NOT VALID`, so existing rows are not scanned.
  - It is `ON DELETE SET NULL (program_id)`. See the next section for why.
- **A one-to-one backfill** from the creation audit rows. A submission is anchored
  only when all of these hold:
  - exactly one same-tenant `c2c.project.create` row names it;
  - that row's program exists in the same organization;
  - that program names exactly one submission.

  A history two projects both claim stays NULL; it is not resolved by guessing.
  Malformed rows (a non-UUID record id, a non-numeric submission id) are skipped.
- **Rule 1 (replay):**
  - `ADD COLUMN` and `CREATE INDEX` are `IF NOT EXISTS`;
  - the constraint is added only when it is absent from `pg_constraint`;
  - the backfill touches only rows still NULL, so a replay never overwrites a
    writer's anchor.

  There is no DROP.
- The Drizzle model (`shared/schema/submissions.ts`) declares `programId`. Without
  it, a `drizzle-kit push` could drop the column. The PGlite harness copy of the
  table gains the column.

### Why `ON DELETE SET NULL (program_id)`, found while verifying

A tenant purge deletes `regulatory_programs` and deliberately does not delete
`submissions` (`server/services/tenant/tenant-offboarding.ts`,
`PURGE_CHILD_TABLES`). With the key as first written (NO ACTION), the first
backfilled submission would make that tenant's whole purge abort with 23503.

- A bare `SET NULL` would null both columns of the composite key, including
  `organization_id`, which is NOT NULL, and so would fail.
- The column-list form, which needs PostgreSQL 15, un-anchors only `program_id`.
  Every environment runs 15: terraform `rds_engine_version = "15.4"`, and CI and
  compose use `pg15`.

## Evidence

- `01-red-purge-blocked.txt` shows the anchor with the NO ACTION key. Deleting a
  program that an anchored submission references fails with **23503**.
- `02-green.txt` shows 7/7. It covers:
  - the position on the applier;
  - the one-to-one backfill;
  - an ambiguous claim left NULL;
  - cross-org and non-creation rows ignored;
  - a cross-org anchor refused by the database;
  - a clean replay that changes nothing;
  - a program deleted with its submission kept, `organization_id` intact and
    `program_id` NULL.
- **Real PostgreSQL 16** (the local cluster): the backfill, a double replay, the
  cross-org refusal (`Key (program_id, organization_id)=(…, 1) is not present`) and
  the purge-shaped delete (`program_id` → NULL, `organization_id` kept) all behave
  as they do in PGlite.
- **Gates:** `ci:migration-set-order`, `ci:migration-drop-safety` (and its
  selftest), `ci:migration-prefix-collisions` and `ci:migration-reachability` all
  pass. `tsc` is clean on the changed files.
- **Suites:**
  - submission service, eCTD, golden journeys, `tests/lineage`,
    `tests/schema-contract`, truth engine, ingestion, NDA and IND assemblers;
  - they were run with this change (2,564 passed) and on clean trunk (2,556
    passed). The same 12 tests fail in both runs; the difference is this change's
    own suite.
  - The 12 failures are in three authoring-section contract files:
    `authoring-section-commits-to-filing`, `authoring-section-gate` and
    `authoring-section-permissions`. They are not this change. fde9d704 made the
    §11.10(e) reason mandatory on section saves, and those tests still expect a
    reason-less save to succeed. That is handed to the owning lane on the board.

## Part 2 (not in this change)

- `ensureSubmissionSpine(programId)` reuses only a submission already anchored to
  *this* program, or else creates one and anchors it. It never adopts another
  project's submission by name.
- `POST /api/submissions` accepts `programId`, checked with `programInOrganization`
  (LX-20), and the Submission Center form sends it.
- The transmittal inherits the submission's project.
- There is a project-scoped submissions read.
- The LX-00 walk's baseline shrinks when `transmittal-names-sequence` goes green.

These wait on `projects.ts`, `submission-service.ts`, `routes/submissions.ts` and
`SubmissionCenter.tsx` leaving the other lanes' 24-hour windows.
