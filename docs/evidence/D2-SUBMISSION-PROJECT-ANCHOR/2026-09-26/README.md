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

---

# LX-22 (D2), part 2a (PF-05): every writer anchors a submission to its project

**Found by:** the project-anchoring audit (PF-creation-1, PF-creation-2,
PF-SUB-1, PF-SUB-3, creation MISSED-1) and mapped by the part-2 scout
(`wf_89248a58-854`). The plan entry is PF-05 in
`docs/design/PROJECT_FIRST_PLAN_2026-09-26.md`.

## The defects

- **Intake adopted another project's submission by name.**
  `ensureSubmissionSpine` (`server/routes/c2c/project-intake.ts`) reused any
  submission of the organization whose `product_name` or `title` matched. A second
  project for the same product therefore took the first project's filing, and both
  filed into one spine.
- **Submission Center dropped the project.** The create form makes the user pick a
  programme, then posted only its title. `POST /api/submissions` had no project
  field, and its plain `z.object` stripped one if sent.
- **Transmittals named no project.** The sequence transmit path passed
  `programId: null` to every gateway.

## The fix

- **One choke point.** `insertSubmissionRow` writes `program_id`.
  `createSubmission` and `createSubmissionTx` both refuse, before anything is
  written, a program that is not a live project of the caller's organization
  (`programInOrganization`, LX-20). The refusal is `NOT_FOUND` (404). The
  `SUBMISSION_CREATED` audit row names the project.
- **Intake.** `ensureSubmissionSpine` takes the program id and reuses only a
  submission already anchored to that program. It never adopts by name, and it
  never adopts an unanchored row. `POST /api/c2c/projects` passes the new
  program's id.
- **`POST /api/submissions`** requires `programId` (a UUID). The Submission Center
  form sends the programme it made the user pick.
- **Transmit.** The transmittal takes `program_id` from its submission.
- **Callers.**
  - The OQ fixtures (`createSubmissionWithSequence`), OQ-004,
    `scripts/verify-submission-center.mjs` and the launch-demo MDX pack send the
    project. The verify script also checks the 400 (no project) and the 404
    (unknown project).
  - The GA demo seed anchors its IND spines, and skips with a warning where the
    column is absent. It never matches by name.

## Tests, red before the fix (`03-red-part2.txt`), green after (`04-green-part2.txt`)

- `server/routes/c2c/__tests__/projects-create.test.ts`:
  - the spine input carries `programId`;
  - the reuse probe is keyed `program_id = $2` and names no `product_name` or
    `title`.
- `tests/golden-journeys/drug-nda-ectd.journey.test.ts`, the real routers over the
  real DDL, now including the real `20260925b` constraint:
  - step 1: the intake spine's `program_id` is the programme;
  - step 3: a second project for the same product gets its own anchored spine.
    This step used to assert the adoption;
  - step 3b: another organization naming the programme is refused 404
    `NOT_FOUND` with nothing written, no project is refused 400, and the caller's
    own project gives 201 with `programId`.
- `client/.../submissionCenterCreate.test.tsx`: the POST body carries the picked
  `programId`.
- `tests/lineage` (LX-00 walk):
  - new `project/submission-anchored-to-project`;
  - `transmit/transmittal-names-project` is split from
    `transmit/transmittal-names-sequence`, whose baseline now records only the
    missing `sequence_id` column (LX-12);
  - `walk-back/sequence-to-project` reads `submissions.program_id` through the
    sequence, and the creation audit row must agree;
  - `walk-forward/project-to-its-records` counts the project's submissions by
    column.

## The wider run

- `tsc --noEmit` passes on the whole project.
- 839 test files were run: submission service, eCTD, gateways, `server/routes/c2c`,
  `server/routes/__tests__`, golden journeys, lineage, schema contracts, the IND
  and NDA services, and every client v2 test. 8,747 tests passed.
- `ind-filing-flow-pglite` failed first and is fixed. It mocks the db module
  without `pool`, and `createSubmission` touched `pool` even with no project. It
  now reads it only when there is a project to check.
- The two client files that still fail, `anaDrivesWave4` and
  `documentCanvasPolish`, fail identically on trunk without this change (4 of 20),
  so they are not this change.

## Not in this part

- **Readers still find a program's submission by name (PF-06, part 2b):**
  `resolveSubmissionSpine`, Dispatch Readiness and IND Lifecycle.
- **Handed off:** the IND checklist assembler (IND lane) and `ind-forms.routes.ts`
  (`…0194UQPx`'s window).
- **Tenant purge and transmittals.** Where `submission_transmittals` was created by
  the raw `20260509` DDL, its `program_id` has a NO ACTION key to
  `regulatory_programs`, and the purge deletes programs but not transmittals. A
  transmittal that names its project would then block that tenant's purge (23503).
  The package-spine transmit already writes that column today. The
  Drizzle-declared table (`shared/schema.ts`) has no such key, and `20260509` is not
  on the applier. This is handed to the offboarding owner on the board.

---

# LX-22 (D2), part 2b (PF-06): readers find a program's submission by its project

## The defect

Three readers related a program to its submission by product name or title, newest
first:

- the server's `resolveSubmissionSpine` (`server/services/cmc/submission-spine.ts`).
  Its callers are the eCTD compile (four routes), the Module 1 forms and their
  official upload, which is a governed write, and the Module 3 compile;
- Dispatch Readiness;
- IND Lifecycle.

So two projects for one product resolved to the same filing, and whichever
submission was touched last won. A submission anchored to another project was taken
if its name matched.

## The fix: one rule, the same in all three

- **An anchored submission is the program's.** A submission anchored to the program
  (`submissions.program_id`) belongs to it. One anchored to another program never
  does, whatever its name.
- **An unanchored submission is matched by name, and the match is labelled.** This
  covers a submission created before submissions recorded their project.
  - The server matches only when that is unambiguous in both directions: exactly
    one such submission for this program, and no other live program of the
    organization, of the same type, that it could equally belong to. Anything
    ambiguous gives no spine (fail closed).
  - The result says how it was found: `match: 'program' | 'legacy-name'`.
  - Dispatch Readiness and IND Lifecycle show "matched by name: … no project
    recorded".
- **Removal.** The name fallback goes when no unanchored submission remains. That
  needs a governed "anchor this submission to a project" action, which is PD-2 in
  the scout's design and a follow-up.
- **eCTD compile harness.** The mock submission row in
  `tests/routes/ectd-compile-spine.harness.ts` is now the program's own anchored
  submission. The reverse check fails closed on a row with no title or product
  name, which the old mock was.

## Tests, red before (`05-red-part2b.txt`), green after (`06-green-part2b.txt`)

- **`server/services/cmc/__tests__/submission-spine.pglite.test.ts`** (new, real
  DDL). These cases were red:
  - two projects for one product each resolve to their own submission;
  - the anchored submission is preferred over a newer same-named unanchored one;
  - a submission anchored to another program is never taken by name;
  - an unambiguous unanchored match resolves, labelled `legacy-name`;
  - two programs claiming one unanchored submission resolve nothing;
  - two unanchored submissions for one program resolve nothing.

  Organization scoping already held.
- **`dispatchReadinessProgramScope.test.tsx`**: the anchored submission is gated,
  not a newer same-named one of another project; a same-named submission of another
  project gives "No submission"; and an unanchored match is labelled.
- **`indLifecycleProgramScope.test.tsx`**: the same three cases for the IND
  checklist row.
