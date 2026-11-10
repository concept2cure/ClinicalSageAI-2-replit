# Repair ordinary task creation project admission

Plan: F1. Completes: `server/routes/taskManagement.routes.ts` and the existing
`server/services/tasking/task-project.ts`. Launch row D2, governed project-first
tasking. Inventory read at canonical commit
`3c1c6a70378d6a85e60b996287031cea7137c1a8` on `concept2cure-v2`.

This is a bounded repair of the existing ordinary POST `/tasks` writer. The
preceding workflow-template repair has landed; it does not change ordinary
creation. No production behavior has been changed for this repair at inventory
time. Missing project admission and workspace stamping are source findings;
runtime reproduction is still required before claiming a demonstrated defect.

## What already exists

- `server/routes/taskManagement.routes.ts` owns ordinary POST `/tasks`, reached
  through both existing `/api/tasks` and `/api/task-management` mounts. It checks
  the middleware role, validates the existing task fields, refuses protected
  review-route columns, resolves a named organization assignee or runs the
  existing automatic selection, resolves a source project when no project was
  supplied, and calls the shared task/audit primitive in one transaction. Its
  ordinary creation transaction currently uses `storage.db`, does not call
  actual project edit admission, and does not stamp `clientWorkspaceId`.
  This source observation does not establish a production tenant-RLS bypass:
  the shared runtime pool has verified ambient tenant instrumentation.
- `server/bootstrap/register-core-routes.ts` mounts `/api/tasks`;
  `server/bootstrap/register-advanced-platform-routes.ts` mounts the existing
  `/api/task-management` alias. No new route or mount is needed.
- `client/src/concept2cure/v2/surfaces/TaskBoard.tsx` and `CollabLauncher.tsx`
  already POST ordinary tasks to `/api/tasks/tasks`; their intake permits an
  omitted project and an omitted assignee. `client/src/concept2cure/v2/editor/AssignReviewDialog.tsx`
  uses the same writer for an authoring-document review task, supplies source
  identity and a named reviewer, and supplies no integer project ID. These
  existing callers remain reachable and their UI is outside this repair.
- `server/services/tasking/task-project.ts` already resolves authoring and
  canonical documents through their own organization-scoped program anchor.
  Explicit project input takes precedence over source resolution; an absent
  anchor yields valid unfiled work; a failed source read is refused. The same
  file now contains `requireTaskProjectId`, `TaskProjectAdmissionError` and
  `admitTaskCreationProject`, added for workflow-template creation. Admission
  retains current active actor membership, governed-write role, live parent,
  actual workspace, visibility and edit membership through the transaction.
  Ordinary creation does not yet reuse it.
- `server/services/c2c/current-program-access.ts` provides the existing
  `readCurrentProgramActor`, which reads actual active user, organization and
  membership through the caller's executor with optional shared locks.
  `server/middleware/orgMembership.ts` owns `GOVERNED_WRITE_ROLES`; its outer
  `requireEditorAccess` uses the request's claimed role and is not a substitute
  for the retained current actor check at the write boundary.
- `server/services/report-os/project-access.ts` provides
  `canAccessReportProject(..., { forWrite: true })`, using the canonical sharing
  policy and retaining edit membership. `server/services/tasking/task-assignment.ts`
  already applies current actor/project/workspace admission to existing-task
  handoffs. Creation reuses these policy primitives; it must not manufacture an
  existing task or add a second permission algorithm.
- `server/db/requestDb.ts` and `server/db/drizzle-queryable.ts` already provide
  request-bound Drizzle and SQL on the same pinned connection.
  `RequestSqlClient.discard` already evicts a connection after an uncertain
  transaction. Ordinary creation already distinguishes a lost COMMIT using
  `commitInFlight`, but does not discard the uncertain request connection.
- `server/services/tasking/create-task.ts` is the existing shared task row plus
  canonical `task.create` audit primitive. The review-route writer also uses
  it, and its protected `review_route_enlist_member` door is not ordinary task
  authority. `server/services/tasking/task-planning.ts` owns existing optional
  automatic selection. Neither capability is rebuilt or broadened.
- `shared/schema.ts` and existing task migrations own `unified_tasks`, including
  project/workspace/provenance fields. `migrations/20261008d_unified_tasks_authoring_review_project.sql`
  backfills authoring-review project anchors. The AnA tasking definitions and
  other existing writers, including `/unified`, bulk creation and blueprint
  milestones, are separate callers/capabilities; this repair does not silently
  change all task creation paths or claim they have been qualified.
- Existing route suites are `server/routes/__tests__/task-management-source-project.test.ts`
  (source resolution, explicit precedence, unfiled result, sanitized read
  failure), `task-management-assignment-record.test.ts` (named membership and
  provenance, valid unassigned task), `task-management-governed-writes.test.ts`
  (atomic create/audit, rollback, role admission),
  `task-management-governed-writes-review.test.ts` (lost create COMMIT,
  attributable actor/org, malformed assignee), and
  `task-management-reasons.test.ts` (real reason or null).
  `route-task-guard.pglite.integration.test.ts` pins RR1 input refusal;
  `server/services/tasking/__tests__/task-project.pglite.test.ts` pins real
  authoring/canonical-source SQL and organization isolation.
- `tests/db/workflow-project-admission.dbtest.ts` already provides native
  PostgreSQL, a restricted runtime role with FORCE RLS, actual project/member
  rows, a query-config-aware request client, task inserts and canonical
  action/audit DDL. Extend this existing fixture for ordinary HTTP creation;
  do not introduce another production file, database schema or test harness.
  Unit mocks in `_task-management-governed-harness.ts` and the source-project
  suite need truthful request transaction support when that path changes.

### Search and deleted history

Read `AGENTS.md`, `CLAUDE.md`, the one-design plan and ledger, and the current
coordination holds. Searched task/tasking/ordinary-create/project/assignment
names, both route mounts and client callers, the task services and shared
writer, source/program anchors, canonical actor/sharing policy, schema and task
migrations, AnA references, and adjacent tests. The clone is not shallow
(`git rev-parse --is-shallow-repository` returned `false`). Ran
`git log --all --diff-filter=D` with task/Task and project/Project path families.
Task deletion history includes the old tasking route/dialogs/hooks
(`2895218b8`), legacy task management UI (`7a144fd1e`, `83fa7f6cf`,
`77034aa5f`), an orphaned regulatory task router (`30cc29cfd`), and the duplicate
CMC task route/table removal (`237d9bc61`). These are not reasons to restore a
parallel task writer or task UI; the existing shared ordinary writer is fixed.
No capability or user-facing surface is deleted in this repair.

## Bounded compatibility and repair contract

1. First reproduce private-project creation and missing workspace on the real
   existing ordinary HTTP route with native PostgreSQL and named self-assignment.
   Do not claim RED, rollback or deployed access evidence from source inspection.
2. Preserve valid unfiled ordinary tasks: omitted project, unknown source kind or
   a source with no project anchor can remain unfiled. Explicit supplied project
   IDs must be positive in-range integers and must never fall back to unfiled.
   Keep explicit-project precedence over source metadata exactly as currently
   pinned; no source-binding policy change is part of this repair.
3. Use the request's existing transaction for current actor admission, admission
   of any selected/resolved project, and the existing `createTaskInTx` write.
   Reuse canonical live-parent, edit-sharing and actual workspace checks; stamp
   the admitted project/workspace, and refuse private/read-only/foreign/missing,
   closed or workspace-mismatched parents before task or audit writes.
4. Retain current actor admission for unfiled tasks too, without requiring a
   project or inventing a workspace for them. Extract the actor-only portion of
   existing `admitTaskCreationProject` within `task-project.ts`, using the same
   canonical actor reader and governed-role set, if needed to share that policy
   without duplicating it. Confirm stale-role/inactive-membership behavior with
   an unfiled native case before relying on this change.
5. Preserve named and automatic selection behavior, assignment provenance,
   metadata, initial-status restrictions, dates, actual optional reason, legacy
   HTTP 200 envelope and notification only after confirmed COMMIT. Preserve RR1
   protected-input refusal and the shared review-route writer unchanged.
6. Keep typed project/actor refusals, confirmed rollback and uncertain COMMIT
   distinct. Audit failure rolls back both task and lineage. Lost COMMIT answers
   `OUTCOME_UNKNOWN`, sends no success notice, and discards the uncertain lease;
   it must not claim that nothing was saved. No replay API or new request UUID.
7. Verify native refusal has zero task/action/audit changes; selected and
   source-derived workspace, malformed explicit IDs, valid unfiled and explicit
   precedence compatibility, current actor/project policy, RR1, atomic rollback
   and lost-COMMIT outcomes. Run relevant adjacent tests and required source
   typecheck/gates with no allowance growth before the root commits/pushes this
   repair directly to canonical `concept2cure-v2` with hooks enabled.

## Qualification limits and evidence status

At inventory publication no ordinary-create reproduction or verification is
claimed. Native evidence will be recorded after execution. The existing native
fixture installs an authenticated test identity, then runs actual actor/project
admission and task/audit writes against a restricted tenant-scoped database
connection. It is not a deployed login/JWT flow or a complete migrated production
database. This backend repair does not add or qualify a new screen, alter the
plan/ledger, add a service/table/route/dependency, or prove every task writer has
the same boundary. The October splitter handoff is not reconstructed or claimed
as part of this work.
