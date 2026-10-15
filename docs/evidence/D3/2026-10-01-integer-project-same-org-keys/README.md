# PF-03, database half (D3): an artifact and a package name an integer project only of their own organization

The integer half of PF-04. The writers check ownership first since PF-03
(`../2026-10-01-integer-space-writers/`). This makes the database refuse a
cross-organization write from every writer, including the ones not yet fixed
and the next one written.

## Why the database, too

- **`concept2cure_artifacts` has eleven writers.** At the time of writing,
  `approve_import`, `save_document_to_vault` and
  `POST /api/knowledge-base/save-docx-as-artifact` still insert an unchecked
  project id. A check in code covers only the writers that make it.
- **The cascade does not ask whose a row is.** The PF-08 review
  (`wf_72c8daf0-af3`) reproduced this on PGlite. Under row-level security, a
  project delete's holds read cannot see another organization's artifact filed
  under the project, and the cascade removes it anyway.

## The change: `migrations/20261001_integer_project_same_org_keys.sql`

- **The keys.** A unique index `projects_id_org_uq` on `projects (id,
  organization_id)` is created when absent. `id` is the primary key, so it can
  never conflict. Two composite keys hang from it:
  - `concept2cure_artifacts (project_id, organization_id) → projects (id, organization_id)`;
  - `c2c_submission_packages (project_id, org_id) → projects (id, organization_id)`.
- **NOT VALID.** Legacy rows are not scanned, so they do not fail the deploy.
  Every row inserted, and every row whose project or organization changes, is
  checked.
- **ON DELETE CASCADE**, the action each table's existing `project_id` key
  already has: `0000_sweet_joseph.sql:6488`, `0002_phase15_submission_ops.sql`,
  and `shared/schema.ts` for the pushed install. Opposite actions on one column
  resolve by RI trigger-name order (see `20260926b`'s `c2c_documents` note). A
  project delete therefore behaves exactly as before, and PF-08 decides whether
  it may happen.
- **ON UPDATE NO ACTION.** A project with records under it cannot be moved to
  another organization.
- **Rule 1.** Every statement is guarded by `to_regclass` / `pg_constraint`, so
  a replay runs no DDL. There is one DO block per table and no DROP.
- **On the deploy set** right after `20260926b`, before the tenant sweep
  (`ci:migration-set-order` and `ci:migration-drop-safety` both pass). The
  PGlite harness and the founder-path walk apply it after `20260926b`.
- **The preflight** (`scripts/db/program-same-org-preflight.mjs`) lists legacy
  rows for both tables. Each check now carries its own remedy. These two say
  "re-file the row under a project of its own organization", because
  `project_id` is NOT NULL and the old blanket "set the key to NULL" could not
  be followed.
- **Not keyed:** `concept2cure_conversations.project_id`. Its writer, the AnA
  stream, has no project check yet, and a key now would fail such a turn
  mid-conversation. It goes with that writer's fix.
  - **Corrected 2026-10-01** (`../2026-10-01-conversation-project-key/`): the
    AnA stream does not write that table. Its one writer checks the project's
    organization first. The key was added by amending `20261001` in place.

## Tests

`tests/schema-contract/integer-project-same-org-keys.pglite.test.ts` runs on
real SQL, with the tables lifted from their creating files and the artifacts'
cascade key copied verbatim. A legacy cross-organization row is written before
the keys, and the keys file is applied twice.

- The file sits after `20260926b` and before the sweep.
- A replay adds nothing: one NOT VALID key per table, `ON DELETE CASCADE`,
  `ON UPDATE NO ACTION`.
- For each table, a same-organization row is written and another
  organization's is refused (23503).
- The legacy rows did not fail the deploy, and the preflight lists them.
- A legacy row still takes a change that is neither its project nor its
  organization.
- A project with records cannot be moved to another organization.
- A project delete still cascades its artifacts and packages.

## Red, then green

- `01-red-without-keys.txt`: the keys file is emptied, and **5 of 10 fail**,
  exactly the cases the keys exist for. The placement, the own-row writes, the
  legacy update and the cascade pass on both, as they should.
- `03-green-contract.txt`: this contract and PF-04's, **37 tests**.
- **Every PGlite-harness and golden-journey suite**, which now gets the key:
  108 files, 1073 tests pass (2 skipped). No fixture files a row under another
  organization's project.

## On real PostgreSQL 16.13: `02-real-postgres.txt`

- **The already-deployed `c2c_dbtest`, upgraded** with `deploy-migrate` twice:
  exit 0, and the replay applies the file cleanly.
- **A fresh install** (`install-fresh`, then `deploy-migrate` twice): exit 0.
- **Both carry** the index and both keys, NOT VALID, `c`ascade / `a` (no
  action).
- **The preflight CLI** on the upgraded database is clean.
- **Legacy data**, on the baseline database (`c2c_trunk`, no keys):
  1. Organization 9101's artifact is filed under organization 9102's project.
  2. The preflight lists it, with the new remedy.
  3. The file is applied twice, and both applies exit 0.
  4. The row is still listed, and it still takes a title change.
  5. A new cross-organization row is refused with
     `concept2cure_artifacts_project_same_org_fk`.
  6. A same-organization row is written.
- **`npm run test:db`** (unmocked `pg`, `RLS_ENFORCE=on`) on the upgraded
  database: **88 files, 879 tests pass**.
  - The first run failed one case, the SECURITY DEFINER allowlist. That is the
    runtime role's grant recipe (`provision-app-role.mjs`, added 2026-09-30),
    which `deploy-migrate` runs only with `APP_SERVICE_DB_PASSWORD` set. The
    local deploys had not set it. This file creates no function and grants
    nothing. Deploying as CI does, then re-running, passes everything.

## Review (2026-10-01, `wf_191c57dc-c21`)

The commit was reviewed adversarially before pushing, through two lenses, with a
skeptic per finding.

- **Migration safety:** no finding. Replay, locks, delete-action agreement on
  both lineages, the tenant purge, RLS and the preflight change all held.
- **Writer breakage:** six findings; five refuted.
  - AnA guidance and command artifacts, cortex save-draft and the
    knowledge-base routes are blocked earlier by the governed gate and never
    reach their INSERT.
  - `approve_import` is already refused by the tool registry's foreign-record
    guard.
  - The RTM and eSTAR/CER cases predate the commit, which only turns a silent
    cross-organization row into a refusal.
  - The one that held is informational: the remaining unchecked writers can
    produce a mismatch only from misdirected input. The old behaviour there was
    a defect, and no legitimate flow breaks. Those writers now answer a
    23503-driven 500 where an honest 404 belongs, and each is that writer's own
    fix.
- **Pre-existing defect found, handed to the eSTAR owner on the board:**
  `resolveProjectAnchor` (510(k)) and the CER export return
  `fda_510k_projects.id` as the artifact's `project_id`, where that row's own
  `project_id` belongs.
