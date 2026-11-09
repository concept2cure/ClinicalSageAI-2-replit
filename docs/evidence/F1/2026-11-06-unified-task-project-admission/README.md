# Repair unified task creation project admission

Plan: F1. Completes: `server/routes/unifiedTasks.routes.ts` and the existing
`server/services/tasking/task-project.ts`. Launch row D2, governed tasking.
Inventory baseline: canonical `concept2cure-v2`,
`29a1b5ddb11941df199de9a0c155333d50ab99b1` (clean at inventory start).

This contract precedes test/production edits. The previously landed ordinary
and workflow-template repairs do not admit creation through POST `/unified`.
The observations below are source findings. Native RED reproduction is pending;
no runtime defect, passing matrix or deployment qualification is claimed here.

## What already exists

- `server/routes/unifiedTasks.routes.ts` already owns POST `/unified`, mounted
  through `/api/regulatory/tasks` by `server/bootstrap/register-core-routes.ts`
  and `/api/unified-tasks` by `server/bootstrap/register-advanced-platform-routes.ts`.
  It checks the existing middleware role, strips unknown schema fields, refuses
  review-route input, derives organization/creator from the request and writes
  task plus canonical `task.create` audit on one request-bound transaction.
  It currently passes supplied project/workspace through without actual current
  actor, project edit or workspace ownership admission. Its HTTP201 task envelope
  and module message are existing behavior, not a new API.
- `server/services/unifiedTaskService.ts` owns `createUnifiedTask`: a fixed
  ordinary column list, existing generated task identity, module icon/color and
  category defaults, task type/action, medium priority, pending status, tags and
  metadata defaults. It preserves caller-supplied assignee/name, source fields,
  dates and optional project/workspace. It also refuses RR1 protected input.
  Module sync calls this service directly; do not impose a new route policy on
  every direct caller or change module sync in this bounded repair.
- `server/services/tasking/task-project.ts` now contains canonical reusable
  `requireTaskProjectId`, `TaskProjectAdmissionError`,
  `admitTaskCreationActor` and `admitTaskCreationProject` from the ordinary and
  workflow-template repairs. They retain current active actor/membership and
  governed-write role, actual same-organization live parent and workspace,
  visibility and current edit membership on the caller's transaction. Reuse
  these, including the existing workspace ownership/claim checks, rather than
  adding a service, ACL algorithm, table or route.
- `server/services/c2c/current-program-access.ts` and
  `server/services/report-os/project-access.ts` own the existing actual actor
  and canonical edit policy. `server/db/requestDb.ts` and
  `server/db/drizzle-queryable.ts` already retain one request connection and
  adapt its transaction for shared SQL admission. The request client already
  supports discarding an uncertain COMMIT; unified creation currently reports
  `OUTCOME_UNKNOWN` without discarding that lease.
- `shared/schema.ts` and existing task migrations already provide the optional
  `unified_tasks.project_id` and `client_workspace_id` fields. This endpoint's
  input explicitly accepts workspace without project, and its GET `/all` path
  filters by workspace independently of project. That existing workspace-only
  capability must not be silently erased by forcing every unfiled task to a
  null workspace. No new workspace membership policy is introduced here.
- Current exact-path searches under `client` and `server/services/ana` found no
  production POST caller for `/api/regulatory/tasks/unified` or the
  `/api/unified-tasks` alias; `ReviewTasksPanel.tsx` mentions the route family in
  a comment but uses the ordinary writer. This is a mounted API boundary, not
  evidence of a currently exercised browser flow. No missing caller is added.
  No legitimate current workspace-only UI caller was found; the existing API
  schema, service and independent workspace filter still establish its behavior.
- `server/routes/__tests__/unifiedTasks.routes.test.ts` pins both aliases,
  actor/organization attribution, HTTP201, the existing task service call,
  ledger rollback, reasons, claimed-role gates and uncertain COMMIT outcomes.
  `unifiedTasks-governed.pglite.integration.test.ts` uses the actual task service
  SQL for the same governed-write behavior and adjacent link/sync/status paths.
  `route-task-guard-unified.pglite.integration.test.ts` pins RR1 at the route and
  direct service boundaries. `_unified-tasks-pglite-harness.ts` supplies their
  common request transaction and ledger fixtures; truthful active-actor and
  project/workspace fixtures are required when admission starts querying them.
- `tests/db/workflow-project-admission.dbtest.ts` already supports native
  PostgreSQL, actual tenant policies/FORCE RLS, a restricted runtime role,
  project/workspace/current membership fixtures, real task/action/audit rows,
  actual rollback injection and lost-COMMIT acknowledgement. Extend this existing
  fixture with the unified router and its existing aliases; no new harness or
  production schema is needed.

### Search and deleted history

Read root `AGENTS.md`, `CLAUDE.md`, the accepted one-design plan/ledger and the
current coordination holds; F1 remains open with no approved additions needed.
Searched unified/task creation names, both mounts, service/direct callers,
project/workspace input/filter behavior, current actor/edit/workspace helpers,
shared schema/migrations, client and AnA path references, and preservation suites.
The clone is not shallow (`git rev-parse --is-shallow-repository`: `false`).
Ran `git log --all --diff-filter=D` over task/Task and unified/Unified server and
client families. Deleted history includes the prior tasking service/dialogs
(`2895218b8`), legacy task-management service (`46044c426`), old unified task
creation modal (`7a144fd1e`), task dashboard (`bb243dfad`) and older task UI
(`83fa7f6cf`, `77034aa5f`). Other deleted unified routers concern documents,
IND, CER or 510(k), not a replacement for this task endpoint. No deleted product
surface is restored or removed, and no parallel writer is built.

## Bounded preservation and repair contract

1. Capture native counterexamples before production edits using the actual
   existing HTTP route. Initial candidates: actor7 supplies private project12
   with matching body/request workspace72; admitted project11 omits its actual
   workspace when no body workspace is supplied; current viewer12 carries a
   claimed write role and requests unfiled work; actor7 requests workspace-only
   unfiled work in foreign workspace81. Inspect actual outcomes before calling
   them RED.
2. Reuse current actor admission for every unified create, retaining the active
   organization/user/membership and governed-write role through the existing
   request transaction. For an explicit project, validate a positive in-range
   integer and reuse actual live-parent/edit-sharing/workspace admission before
   the task/audit write. Derive the saved workspace from the admitted parent.
3. Validate both supplied body workspace and authenticated request workspace
   against the actual project; neither may redirect the task. Preserve valid
   unfiled work. For explicitly supplied workspace-only unfiled work, retain the
   workspace only after strict positive in-range validation, same-organization
   ownership retained `FOR SHARE`, and a matching request claim when present.
   Reuse the existing `retainTaskWorkspace` check, exported from its current
   helper file, for body claims as well as request claims; an additional owned
   row read is acceptable, a second policy implementation is not. Reject
   malformed/foreign/missing or mismatched
   explicit scope; never turn rejected explicit scope into global/unfiled work.
   With no supplied project/workspace, preserve scope absence and do not invent
   either from metadata or request context. When body workspace is omitted on
   unfiled work, its stored workspace stays null; a request workspace claim
   alone neither supplies a workspace nor refuses that otherwise valid intake.
4. This route currently does not derive a project from source metadata. Preserve
   that behavior and the source metadata itself; do not import the ordinary
   writer's source-resolution policy or alter direct service/sync callers.
5. Preserve module-specific defaults, task identity and fixed service writer,
   named assignee/name fields, dates, tags, metadata, priority, source fields,
   actual optional reason and verified organization/creator. Keep HTTP201 and
   its task/message envelope. Do not add assignment selection, notifications,
   status transitions or any new UI/caller as part of this repair.
6. Preserve RR1 protected-input refusal and actual task plus action/audit
   atomicity. Map known admission refusal separately from generic store failure.
   Distinguish confirmed rollback from unknown COMMIT; unknown outcome must
   discard the uncertain request lease and must not claim nothing was saved.
   Limit any error-handler change to creation so unrelated route behavior stays
   covered by its existing tests.
7. Prove valid project and workspace-only/unfiled compatibility, refusal with
   zero writes, actual current actor/edit/workspace admission, module defaults,
   metadata/attribution/real reason, both aliases, RR1, real audit rollback and
   committed-but-unacknowledged outcome. Run appropriate adjacent suites and
   required checks before the root commits and pushes directly to canonical
   `concept2cure-v2` with hooks enabled. No gate allowances are increased.

## Qualification limits

Native RED and GREEN are pending at contract publication. The reused native
fixture installs an explicit synthetic authenticated identity, then runs actual
admission and task/action/audit SQL against its restricted tenant-scoped role.
It does not qualify deployed login/JWT, a full migration database, browser reach,
other unified routes/direct service writers or notification transport. This
work repairs existing behavior only: no screen, module, service, mount, tool,
table, dependency, permission model or roadmap addition.
