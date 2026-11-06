# Repair workflow task project admission

Plan: F1. Completes: server/routes/taskManagement.routes.ts and the existing
server/services/tasking/task-project.ts. Launch row D2, project-first tasking.
The repository was restored at 21a21849d7cfb8a35794489a87fad2b849c7011c
on the sole branch concept2cure-v2 after execution access returned. Earlier local
October checkpoints are not present and are not claimed to be recovered or
included in this November source.

## What already exists

- `server/routes/taskManagement.routes.ts` owns the only POST
  `/tasks/from-template/:templateId` task-template writer. It already creates
  tasks, edges, task.create/task.link audit pairs and stored-template usage in
  one transaction, and rejects protected review-route columns in both request
  and stored definitions. It currently accepts raw projectId without actual
  project admission, uses the shared database transaction and omits workspace.
- `client/src/concept2cure/v2/surfaces/TaskBoard.tsx` WorkflowStart is its only
  production caller and already requires a selected project. Its current
  November behavior and the D3/D6 layout owners are preserved.
- `server/services/tasking/task-project.ts` is the existing task-to-project
  source resolver. Extend it for actual project admission; do not create a
  parallel service, route, screen or store.
- `server/services/tasking/task-assignment.ts` already admits fresh actors,
  actual project ownership/sharing and actual workspace on a pinned connection.
  Its helpers require an existing task, so creation reuses their policy
  primitives rather than manufacturing a task or another sharing algorithm.
- `server/services/c2c/current-program-access.ts` readCurrentProgramActor reuses
  active organization/user/membership admission with optional shared locks.
  `server/services/report-os/project-access.ts` canAccessReportProject(...,
  {forWrite:true}) applies the existing edit policy and retains membership.
  Project sharing writers retain their parent project, and visibility is read
  from existing project_visibility_settings, not a new permission model.
- `server/db/requestDb.ts`, `drizzle-queryable.ts` keep admission and the existing
  task transaction on the request's actual tenant-scoped connection.
- `server/services/tasking/create-task.ts` is shared with the review-route
  writer. Existing RR1 restrictions and its route-only enlistment remain intact;
  this repair does not expand who may create or mutate review-route tasks.
- Existing governed-write/review/reasons/template suites test atomic workflow
  outcomes. `route-task-guard.pglite.integration.test.ts` pins the explicit
  protected-column refusal. Existing native scheduler-harness and assignment
  fixtures provide actual PostgreSQL, FORCE RLS, restricted runtime roles and
  canonical audit/action DDL without copying the complete migration database.
- Searched task/workflow names, route aliases and callers, services, schema,
  project access, AnA and deleted history. Exact tasking/taskManagement/TaskBoard
  history has no deleted replacement. Broader history includes unused workflow
  template cleanup (0f0705fc), not a second workflow task writer.

## Closure contract, before implementation

1. Reproduce current wrong-project admission and missing workspace with the real
   existing HTTP route and PostgreSQL before modifying production behavior.
2. Require a positive integer project ID for workflow creation, preserving the
   sole caller's project requirement. Missing, malformed, noninteger, nonpositive
   and out-of-range IDs refuse with known 400 and zero workflow writes.
3. On the request transaction, admit current active organization membership and
   governed-write role; retain the actual same-organization parent, its live
   status, sharing and actual workspace. Apply canonical project edit access.
   Foreign/missing/private/read-only projects and mismatched workspace claims
   refuse; archived/deleted parents do not accept new tasks.
4. Derive clientWorkspaceId only from the admitted actual project and validate
   it belongs to the same organization. An explicit client claim must match,
   including a claim on a project with no workspace. Stamp every created task
   with the actual project/workspace; a payload cannot redirect it.
5. Preserve the existing single transaction, task/dependency/audit/usage counts,
   builtin-template fallback and legacy 200 response. All admission occurs
   before template usage or task writes. Preserve protected route columns and
   shared review-route writer; no new API, service, schema, editor or UI.
6. Keep refusal, known rollback and unknown COMMIT outcomes distinct. Unknown
   results do not claim no work was created; uncertain request connections are
   discarded. Do not introduce new request UUID or replay APIs in this repair.
7. Prove refusal causes no task, edge, action, audit or usage change; prove valid
   tasks and governance use one transaction. Exercise fresh role/membership,
   current edit sharing, workspace, rollback and existing RR1 restrictions.
8. Run focused and adjacent suites, actual restricted-role SQL/RLS qualification,
   complete source typecheck and relevant repository gates without allowance
   growth. This backend repair makes no new screen or full deployed-auth claim.
   Preserve the plan, ledger, schema, dependencies and active D3/D6-owned UI.

Native fixture authentication may install an authenticated test identity while
all project/role admission runs against real database rows and a restricted RLS
runtime connection. It must be described as such, not as a deployed login walk.
All work stays local unless separately authorized to commit or push.
