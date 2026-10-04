# PF-04 (D3): a record names a project of its own organization only, at the database

**Plan:** `docs/design/PROJECT_FIRST_PLAN_2026-09-26.md`, PF-04.
**Design:** scout workflow `wf_8e90bd64-38f`. It mapped every writer of seven
direct project keys, verified each map against the code, and designed this change.
The design was tested in PGlite before a line of it was written into the repository.

## The defect

Five stores carry a project key (a `regulatory_programs` UUID) beside their own
organization column. Nothing held the two together.

| Store | Key, organization | How a cross-organization key got in |
|---|---|---|
| `projects` | `regulatory_program_id`, `organization_id` | Written unchecked from 2026-08-14 to 2026-09-24 (ana-platform-controller) |
| `authoring_documents` | `client_program_id`, `tenant_id` | `/docs/from-draft` checked only the id's shape until PF-07. The AnA tool's legacy branch trusted a project's anchor (P2, below) |
| `cre_evidence_sources` | `client_program_id`, `organization_id` | The one INSERT takes its caller's word. `canonical-source-identity` writes organization 2 with organization 1's program, and it succeeded |
| `c2c_documents` | `project_id`, `org_id` | Its own key proves the program exists, not whose it is |
| `cdisc_prm_studies` | `program_id`, `tenant_id` | Any organization's program until PF-14, and the hand-run link file's backfill has no organization check |

A record of organization 2 naming organization 1's project would be listed in that
project, placed in its filing and counted in its readiness. The writers now check
first (LX-20, PF-02, PF-07, PF-14), but a check in code covers only the writers
that make it.

## The fix

- **`migrations/20260926b_program_same_org_keys.sql`**, on the applier just before
  the tenant sweep. It adds one composite key per store:
  (key, organization) → `regulatory_programs (id, organization_id)`.
  - **NOT VALID.** Legacy rows are not scanned, so a cross-organization row cannot
    fail a deploy. Every insert, and every change to a key or organization, is
    checked.
  - **ON DELETE SET NULL (key)** on four stores. A tenant purge un-anchors the
    record instead of aborting. A bare SET NULL would null the NOT NULL
    organization column too.
  - **NO ACTION on `c2c_documents`**, like the key it already has. Two keys with
    opposite delete actions on one column are resolved by RI trigger-name order,
    so one database would un-anchor and another refuse. The review found this
    before the file shipped. A purge deletes `c2c_documents` first; it already
    had to.
  - **ON UPDATE NO ACTION.** A referenced program cannot be moved to another
    organization.
  - **A CHECK on `cre_evidence_sources`.** A GLOBAL_PUBLIC source (no
    organization) carries no project; MATCH SIMPLE would never check that row's
    key.
  - **`cdisc_prm_studies.program_id` and its index.** They are added where no
    applier ever added them.
  - **The unique index the keys need.** It is created when absent, because
    `20260925b` skips it on a lineage without `submissions`.
- **Replay.** Every statement is guarded (`to_regclass`, `pg_attribute`,
  `pg_constraint`), so a replay runs no DDL and takes no lock. There is one DO
  block per store, no DROP and no COMMENT.
- **Amended in place (Rule 1), each with a dated header note.**
  - `20260814_projects_regulatory_program_anchor.sql`. Its "Why NO FOREIGN KEY"
    section said `regulatory_programs` "is created by no durable applier", which
    was false: its creator is entry 1 of the set.
  - `20260727_authoring_document_program_scope.sql` and
    `20260726_cre_source_program_scope.sql`. Their replayed comments said "No FK".

  The three comments now name the key. The Drizzle model comments
  (`shared/schema.ts`), `mdx-vault.ts` and the migration set's own false comment
  are corrected too.
- **`scripts/db/program-same-org-preflight.mjs`.** It lists the legacy rows the
  keys leave alone, so an operator can clear them before any purge or VALIDATE.
  - It runs SELECTs only, in a READ ONLY transaction, with row-level security
    lifted; otherwise other tenants' rows are hidden and the report under-counts.
  - The test runs the same SQL.
  - A tenant purge's SET NULL does not reach a legacy row: it matches only
    (key, organization) pairs equal to the deleted program's. That is why the
    clean-up is needed.
- **The study-design writer.** When a project is deleted between its ownership
  check and the write, the key refuses the row. The writer now answers with the
  same `PROJECT_NOT_FOUND` refusal, not a 500 naming the constraint.
- **P2, a precondition** (`authoring-draft-tool.ts`, pushed separately as `b4b218bd`). The AnA tool resolved a
  legacy integer project through its anchor without checking the anchored
  program's organization. It now checks, like the UUID branch. A write failure
  reached the model as the driver's message, which names tables; it is now a
  plain refusal, and the detail goes to the log.
- **Harness and walk.** `server/db/pglite-harness.ts` applies the real file after
  every DDL block. It mirrors `projects.regulatory_program_id`, and
  `c2c_documents.project_id` is nullable, as deployed. The LX-00 walk applies the
  file last.

**Not keyed here, by design:**
- `vault.documents`: `program_id` is NOT NULL, so only NO ACTION is possible, and
  the purge's vault delete matches no rows in the system scope. The key would break
  every purge.
- `submission_transmittals`: its writers take `programId` from the request. The
  key belongs with PF-12 and the writer fix.

Both, with the purge defects the scout found, are on the lane board for D6.

## Evidence

**`01-red-faults.txt`: red.**
- Before this change the contract test cannot load, because the file does not
  exist.
- Then seven faults, one at a time. Each is caught by its own case:

  | Fault | Caught by |
  |---|---|
  | NO ACTION instead of SET NULL | the key shape and the purge case |
  | Guard removed | the replay (42710) |
  | CHECK removed | the GLOBAL_PUBLIC case |
  | File placed after the sweep | the position case |
  | `c2c_documents` back to SET NULL | the key shape |
  | A creator's old "FK-free" comment | the comment case |
  | The study-design mapping removed | the race case |

- P2's red is in its own commit message (`b4b218bd`).

**`tests/schema-contract/program-same-org-keys.pglite.test.ts`: green, 27/27.**
- **Fixture.** Real creator files. A cross-organization legacy row is written into
  every store before the keys. The keys are applied, then every creator and the
  keys are replayed, as the next deploy does.
- **Per store:**
  - one NOT VALID key, SET NULL on the key column only (NO ACTION on
    `c2c_documents`);
  - another organization's program and a missing one are refused, while its own
    and none are admitted;
  - the legacy row takes non-key updates, but is never re-keyed and never
    validated;
  - the pre-flight lists exactly the legacy rows.
- **Then:**
  - a GLOBAL_PUBLIC source cannot carry a project;
  - a referenced program cannot change organization;
  - the study-design column is added once where absent;
  - a purge-shaped delete is refused while `c2c_documents` still names the
    programs, whichever of its two NO ACTION keys fires first.
  - In the operator's order (clear what the pre-flight lists, delete
    `c2c_documents`, then the programs), each own record keeps its organization
    and loses only its key. Legacy rows are left naming the deleted program:
    that is why the pre-flight runs first.

**The wider sweep: green.** Every suite PF-04 touches passes, 468 files and 4,705
tests: all 41 users of `pglite-harness`, the LX-00 walk, `tests/schema-contract`,
the golden journeys, study design, the evidence spine, `server/routes/__tests__`
and `submission-service`.

**`03-real-postgres.txt`: real PostgreSQL 16.13 with pgvector, built as CI builds it.**
- **Deploy shape.** install-fresh, then deploy-migrate twice; the second deploy is
  the replay. All five steps exit 0. The deployed keys are exactly as designed.
  Clean trunk, built the same way on a second database, has only the
  `submissions` key.
- **Legacy data.** On the trunk database, one row of organization B names
  organization A's program:
  - the pre-flight lists it and exits 1;
  - applying `20260926b` over it succeeds (NOT VALID);
  - the pre-flight still lists it afterwards;
  - a new cross-organization row is refused with
    `authoring_documents_program_same_org_fk`.
- **`npm run test:db` on the deployed database.** `tests/db`, unmocked pg,
  `RLS_ENFORCE=on`: 70/70 files, 755/755 tests. This includes tenant purge, the
  document catalog and the two Authoring suites the PF-07 commit updated.