# PF-08 (D2, D5): one reader of a program's anchor row, and one anchor row per program

Plan: `docs/design/PROJECT_FIRST_PLAN_2026-09-26.md` §PF-08. This slice covers two of its items:

- "resolveProgramProjectAnchor uses .limit(1) with no ORDER BY";
- "A guarded unique index on projects(regulatory_program_id), created only when no program has two anchor rows; otherwise a NOTICE names them … A second anchor row for the same program is refused."

The anchor-delete half landed earlier (`../../D5-PROJECT-RETENTION/2026-09-30-legacy-hard-delete/`).

## The defect

A v2 program (uuid) reaches the integer key that governed artifacts, packages and tasks hang from through its **anchor row**: the `projects` row whose `regulatory_program_id` is the program. Two things were wrong.

- **Nothing held a program to one anchor row.** `20260814` created a plain index. The one writer, intake's `ensureProgramProjectAnchor`, links an existing row rather than forking, but that rule lives only in code.
- **The anchor was read six times, and only one read was ordered.** The reads were:
  - `resolveProgramProjectAnchor`;
  - `biostatistics-bridge/bridge-service.ts` `programFilingContext`;
  - `cmc/contradiction-tasks.ts` `resolveProjectId`;
  - `routes/ana-biostats-governed-documents.ts`;
  - `pathway-engines/estar/estar-administrative-data.ts` `findAnchorProjectByProgram`;
  - `routes/ana-ri/post-processing.ts` `persistCollectedDrafts`, the AnA draft writer. The slice's own review found this one.

  Only the eSTAR read ordered by id. The others used `.limit(1)` and took whichever row the plan reached first. With two anchor rows, one export could file a program's documents under one project and the next export under the other. AnA drafts could version under a project no export reads. The Biostatistics bridge and the governed-documents list could also disagree about which project the program is.

## The change

- **One reader.** `readProgramAnchorRow` (`server/services/c2c/program-project-anchor.ts`) is org-scoped and runs `ORDER BY id LIMIT 2`.
  - It returns the lowest id, which is the row intake links (`ensureProgramProjectAnchor`, `ORDER BY id`).
  - When a second row exists, it names both ids in the log.
  - `resolveProgramProjectAnchor` delegates to it.
- **The five copies are deleted.** Each call site now calls the reader, and keeps its posture:
  - the bridge and the governed-documents route are strict: a failed read is still the caller's error, never an empty list;
  - contradiction tasks stay non-strict: an unreadable program still gets its task, as before;
  - the AnA draft writer stays non-strict: an unreadable anchor leaves the draft unfiled, and the existing "could not be saved" warning says so;
  - eSTAR keeps its own `42703` catch.
- **No new copy.** `tests/schema-contract/one-program-anchor-reader.contract.test.ts` refuses any file outside the anchor module that picks a `projects` row by its program, in raw SQL or drizzle. It allows the reverse read (a project's own program) and the EXISTS filters that admit every anchored row.
- **`migrations/20261001b_projects_one_anchor_per_program.sql`.** This is a partial unique index, `projects_one_anchor_per_program`, on `projects (regulatory_program_id) WHERE regulatory_program_id IS NOT NULL`.
  - **It is created only when no program has two anchor rows.** Otherwise a NOTICE names each program and its anchor rows as `project@organization`, and the deploy continues. An unguarded unique index over duplicate rows fails `CREATE`, and so would fail every deploy (Rule 1). The skip leaves the data as it is: no row is rewritten to make the index fit.
  - **Rule 1.** Once the index exists, a replay does nothing. While duplicates remain, every replay repeats the NOTICE. There is no DROP.
  - **The 20260814 backfill stays safe on replay.** It links a program only if no other row anchors it already (`NOT EXISTS … x.regulatory_program_id = g.id`), and only when the match is 1:1 in both directions. So after the index exists, a replay cannot raise 23505. A test proves it.
  - **On the deploy set** right after `20261001`, before the tenant sweep. The PGlite harness and the founder-path walk apply it too.
- **Writers.** Only intake (`ensureProgramProjectAnchor`) and the 20260814 backfill write `projects.regulatory_program_id`.
  - Neither child-project creator copies it (`routes/project-hierarchy.ts`, `rules-engine/actions`).
  - Nor does any drizzle `insert(projects)`.
  - Nor does the AnA update allowlist (`ana-platform-controller.ts` `PROJECT_CONFIG_FIELDS`).

## Evidence

| File | Shows |
|---|---|
| `01-red-reader-unordered.txt` | With `ORDER BY` removed from the reader, the duplicate case reads project 40, not 12. |
| `02-red-unguarded-index.txt` | Replacing the guard with a plain `CREATE UNIQUE INDEX` fails the deploy on duplicates: `could not create unique index`. |
| `03-real-postgres.txt` | PostgreSQL 16. The upgraded and fresh databases each get the index on two applies. A duplicate pair raises the NOTICE and skips the index. Once resolved, the index is created and a second anchor is refused with 23505. Everything runs in a rolled-back transaction. A full `deploy-migrate` replay exits 0. |
| `04-green.txt` | 130 files, 1,630 tests, all passing: both contract tests, the reader test, the strict test, every anchor caller's suite, the AnA RI route suites, the 71 suites that use the PGlite harness, and the founder-path walk. `tsc`, the lint ratchet, `ci:migration-set-order`, `ci:migration-drop-safety`, `ci:migration-prefix-collisions` and `ci:migration-reachability` all pass, and the pre-push hook passed on both pushes. |
| `05-red-one-reader-scan.txt` | The one-reader scan over three trees. Before the slice it finds six files. After `fa00d6392` it finds two, the anchor module and the AnA draft writer. After `382e25c6b` it finds only the anchor module. |

## Review

The review was `wf_6f56bbd0-de6`, with three lenses (migration, writers, readers) and two skeptics per finding. The readers lens died on a session limit and was re-run as `wf_0521562e-913`.

- **Upheld 2/2: a fifth copy, in the AnA draft writer.** Fixed in `382e25c6b`, together with the static test.
- **Upheld 2/2: the remedy text was wrong for duplicates that span organizations.** The NOTICE named project ids only. The remedy ("move the higher id's records onto the lowest") would have moved one tenant's records onto another tenant's project in a cross-organization pair, a state the unchecked writes of 2026-08-14..09-24 allow. Fixed in `382e25c6b` by amending the migration in place, with a dated header note:
  - the NOTICE names `project@organization`;
  - a cross-tenant anchor is cleared, as listed by the same-org preflight;
  - same-organization duplicates are re-pointed onto the lowest id.

  The contract test and `03-real-postgres.txt` both cover a cross-organization pair.
- **No deploy failure was found.** The migration lens could build no database state that fails the deploy. The writers lens found no runtime writer that copies the anchor: the child-project creators, the drizzle inserts and the AnA update allowlist all leave it alone.
- **The readers lens, re-run on both commits, found nothing.** It checked the behaviour before and after the change at each of the five call sites, every caller of `resolveProgramProjectAnchor`, every db handle passed in (they support `orderBy`), and anchor reads the static test's patterns might miss.

## Not in this slice

- **The 20260814 backfill bound and its audit row.** These wait on the founder decision: should a same-named legacy project ever be linked automatically? Proposed: never. Until it is decided, the backfill still runs on every deploy. It links only unambiguous 1:1 same-organization matches, and never a program that already has an anchor.
- **Resolving duplicates on a deployed database.** The NOTICE names them. The fix is to re-point the higher id's artifacts onto the lowest row and clear the higher row's anchor. That is a data change for an operator, not a migration.
