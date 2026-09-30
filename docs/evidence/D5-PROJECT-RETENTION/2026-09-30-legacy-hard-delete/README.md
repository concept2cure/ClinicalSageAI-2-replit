# PF-08 and PF-13 (D5): a program's anchor row, and a project holding records, cannot be hard-deleted

Plan: `docs/design/PROJECT_FIRST_PLAN_2026-09-26.md` §PF-08, "DELETE
/api/projects/:id on an anchor row returns 409, and concept2cure_artifacts rows
survive". The founder decision it applies is PF-13 (2026-09-26): drafts only may
be deleted, otherwise archive.

## The defect

`projects` is the integer key every governed artifact and conversation hangs
from. `concept2cure_artifacts.project_id` is `ON DELETE CASCADE`
(`migrations/0000_sweet_joseph.sql:6488`), and so is
`concept2cure_conversations.project_id` (`:6493`). A v2 program reaches the
artifact registry through its **anchor row**, the `projects` row whose
`regulatory_program_id` is the program.

Two production routes **hard-delete** `projects` rows after checking only the
organization. Neither has a role gate.

- **`DELETE /api/projects/:projectId`** (`server/routes/projects-management.ts`)
  deletes one row. Mounted at `register-project-routes.ts:32`, launch-scoped.
- **`DELETE /api/clients/:id`** (`server/routes/clients-routes.ts`) deletes every
  project of a workspace. The plan missed it, and the scout found it. Anchor
  rows are created in the organization's default workspace, so this one call
  removes every program's anchor row in it.

So one API call removed a program's anchor row and cascaded its approved and
locked documents away. The program's own delete (`DELETE /api/c2c/projects/:id`)
is a soft delete, guarded by PF-13's `projectHolds`. These routes never reached
that guard.

## The fix

`server/services/c2c/project-retention.ts`, one helper for both routes:

- **`projectDeletionHolds(q, { projectIds } | { workspaceId })`** reads what the
  delete would destroy:
  - the programs whose anchor row it would remove;
  - how many artifacts in review, approved or locked would cascade.
  - It runs inside the deleting transaction and locks those `projects` rows
    (`FOR UPDATE`). It keys on the rows the delete would remove, whatever their
    organization, because the cascade does not ask. `super_admin` reaches
    `DELETE /api/clients/:id` across organizations.
- **`projectDeletionRefusal(holds, scope)`** returns the 409, or null for
  drafts only:
  - `PROJECT_IS_PROGRAM_ANCHOR` names the programs. The remedy is to archive or
    delete the program from Projects, which is its governed path.
  - `PROJECT_HOLDS_RECORDS` gives the count. The remedy is archive.
  - Both say "Nothing was deleted."
- **`DELETE /api/projects/:projectId`**: the check and the delete are now one
  transaction. The delete is also scoped by organization.
- **`DELETE /api/clients/:id`**: the check is the first step of the existing
  transaction. A refusal is thrown, so it rolls back whole: no module, project,
  setting or workspace is deleted.
- A drafts-only project or workspace still deletes, as before.

## Tests

- `server/services/c2c/__tests__/project-retention.pglite.test.ts`, the helper
  on real SQL, 10 cases:
  - an anchor row;
  - drafts-only; approved and locked; in review;
  - the workspace aggregate, and a missing id;
  - the row lock held inside a transaction;
  - the refusal bodies and their precedence.
- The founder-path walk (`tests/lineage/`) gains two checks in its retention
  hop, on the real routes and real SQL.
  - **`anchor-row-not-hard-deleted`.** An approved document is keyed to the
    program's anchor row. `DELETE /api/projects/<anchor>` is 409
    `PROJECT_IS_PROGRAM_ANCHOR` naming the program, and the row and the
    document survive.
  - **`legacy-draft-project-deleted`.** A drafts-only legacy project is still
    deleted, and the delete is audited in `audit_events`.
  - The walk now mounts `/api/projects`.
  - Its database gains `concept2cure_artifacts` with the real cascade key,
    lifted verbatim from `0000_sweet_joseph.sql`, and `audit_events`.
  - Its migration list gains the `projects` column migrations the route's
    whole-row select needs (`20260508_project_therapeutic_area`,
    `20260603_project_retrieval_mode`).
- `server/routes/__tests__/clients-delete-retention.test.ts`: the helper is
  mocked and the refusal rule is real.
  - An anchor-holding workspace and a records-holding workspace are each 409,
    with **no delete of any table**.
  - A drafts-only workspace deletes.
  - A failed read is a 500 that deletes nothing.

## Red, then green

- `01-red-walk.txt`: `projects-management.ts` is restored to trunk. The anchor
  check fails with the defect itself: `{"status":200,"anchorKept":0,
  "documentsBefore":1,"documentsAfter":0}`, meaning the anchor was deleted and
  the approved document cascaded away. The drafts-only check fails only as a
  consequence: it reads the anchor row's workspace, which trunk has just deleted.
- `02-red-clients.txt`: `clients-routes.ts` is restored to trunk. **3 of 4
  fail.** The drafts-only case passes on both, as it should.
- `03-green.txt`: **7 files, 61 tests pass.**
  - The walk; the helper; both clients suites.
  - The projects-management tenant-boundary suite; the audit-ledger routes.
  - The migration-list closure contract.

## Found on the way, not fixed here

`audit_events.updated_at` is declared in `shared/schema.ts` and laid down by
`drizzle-kit push` (`install-fresh.mjs`, step 2). **No migration file adds it.**
The legacy project delete writes it on every audit row, and that write is
non-blocking. So on a database built from migrations alone, the delete succeeds
and its audit row is lost silently. The walk adds the column as test-only SQL
and names this. The fix is an additive, guarded migration on the set, owned by
the audit/D3 lane.

## Still open in PF-08

- The unique anchor per program: a guarded unique index on
  `projects(regulatory_program_id)`.
- `resolveProgramProjectAnchor`'s `.limit(1)` with no order, and its three
  copies.
- The founder decision: should a legacy project that shares a new program's
  name ever be linked automatically? This comes before the `20260814` backfill
  is bounded.
