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

## Review, and what it changed (2026-10-01)

Before pushing, the commit was reviewed adversarially (`wf_72c8daf0-af3`,
correctness and security lenses, a skeptic per finding). Seven findings held,
and all are fixed in the follow-up commit:

- **A third hard-delete route.** `DELETE /api/device-projects/:id` deleted any
  `projects` row, a program's anchor included, with no check. It now judges and
  deletes in one transaction through the same helper, and only its own
  `medical-device` projects. It is unmapped in production's launch scope, but
  served in development and under report mode.
- **The race, reproduced on PostgreSQL 16.** The first version locked only the
  `projects` rows. So an artifact could be approved between the check and the
  delete and then cascaded away, and a project, an anchor included, could join a
  workspace being deleted. The read now locks:
  - the artifacts (`FOR SHARE`);
  - the workspace row (`FOR UPDATE`, as its own statement: an unreferenced CTE
    never runs).
- **A remedy that could not work.** Deleting a program never clears its anchor
  column, so "delete those programs first" could never unblock a workspace. An
  anchor counts only while its program is live. A deleted program's anchor is an
  ordinary project, still judged by the records rule.
- **A signed draft read as a draft.** A locked document taken back to draft
  keeps its signatures and lock snapshot. Their append-only triggers already
  refuse the cascade, so nothing was destroyed (the skeptic refuted that part),
  but the caller got an opaque 500. A draft that carries a signature or a
  snapshot is now a record, and the answer is the 409.
- **No role gate.** Any member, a viewer included, could delete. Both routes now
  take `requireEditorAccess`, as `DELETE /api/device-projects/:id` already did.
- **No audit row for a workspace delete.** It now records
  `CLIENT_WORKSPACE_DELETED` through the canonical `recordAuditRow` and reports
  the outcome as `auditTrail`, as the device delete does.
- **A lock test that proved nothing.** It counted a table-level lock that any
  `FOR UPDATE` takes, even when no row matches. It is replaced by
  `project-retention-locks.dbtest.ts`, which runs two connections on real
  PostgreSQL. Each lock case has a negative control: with no read held, the same
  concurrent write goes through.

One security finding is answered by the next change rather than this one.
Under row-level security the read sees only the caller's organization's
artifacts, while a cascade does not ask. A cross-organization artifact under the
caller's project can exist only because `concept2cure_artifacts` has no
same-organization key. That key is the next commit.

Red, then green, for the follow-up:

- `04-red-locks-first-version.txt`: the lock test against the first version of
  the helper. **The three lock cases fail**, and both controls pass.
- `05-red-helper-records-and-deleted-programs.txt`: the PGlite suite against
  the first version fails three cases:
  - the deleted program's anchor;
  - the signed and snapshotted drafts;
  - the refusal message.
- `06-red-device-projects.txt`: the route at HEAD deletes the anchor; the 409
  case fails.
- `07-red-clients-gate-and-audit.txt`: the audit and viewer cases fail.
- `08-red-walk-viewer.txt`: the walk's viewer check fails.
- `09-green-followup.txt`: **11 files, 113 tests pass.**
- `10-green-locks-real-postgres.txt`: **5 of 5 pass** on PostgreSQL 16.13.

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
