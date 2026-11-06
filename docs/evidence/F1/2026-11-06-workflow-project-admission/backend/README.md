# Existing workflow project admission repair

Plan: F1. Completes: server/routes/taskManagement.routes.ts and
server/services/tasking/task-project.ts. No new production file, screen, route,
service, table or feature was introduced.

## What already exists

The sole workflow writer already inserts tasks, dependency links, their paired
ledger records and stored-template usage atomically. The existing task-project
service resolves the actual source project. Fresh current actor admission and
canonical project edit policy already exist in current-program-access.ts and
report-os/project-access.ts. Those implementations are called on the existing
writer's request transaction, rather than copied or replaced.

## Change

The task-project service validates an actual positive integer project ID,
retains active actor/membership, the same-organization project and workspace,
visibility and edit membership, and returns the admitted numeric scope. A
claimed workspace must agree even when the actual parent has no workspace.
Every created workflow task records the actual project and workspace.

Both RR1 guards retain their existing precedence, including a protected request
with no project ID and a protected stored task definition. Stored/built-in
lookup behavior remains outside the request transaction, preserving the existing
missing-table built-in fallback; all admission is before usage and task writes.
The newer shared create-task/review-route writer is unchanged.

The workflow uses requestDb(req).transaction. Its existing task/edge/audit/usage
operations and legacy 200 envelope are preserved. Known admission errors and
known audit rollback remain distinct from an uncertain COMMIT. Unknown COMMIT
uses the existing OUTCOME_UNKNOWN response and discards the request lease; an
already-ended owner cannot replace the public unknown response with an error.

## Focused verification

Seven suites, 132 cases, pass with all 10 captured source/test hashes unchanged.
The 32 new helper cases cover strict identity, fresh role, explicit workspace
mismatch including actual-null, same-organization ownership, archived/deleted
parents, canonical edit-policy delegation, unavailable reads and sanitized
refusal classification. Existing source-project, governed-write, reasons,
template and real-SQL RR1 suites remain green.

Scoped lint has 0 errors. The route keeps the same 9 existing warnings as HEAD;
the helper, new tests and recording harness have 0 warnings. The SQL
interpolation gate passes without changing 1055 baseline entries/223 files.
The server-error leak guard passes with its 10 existing baseline sites unchanged.
Logs, exact arguments and before/after source hashes are beside this file.

The old recording harness now accepts node-pg query configurations and preserves
array-mode returning rows, so the actual request-bound Drizzle adapter can run.
Its project fixture is an explicit actor 7-owned private parent 3 and the canonical
sharing policy evaluates it; permission is not mocked as an allow. Native tests
separately prove actual PostgreSQL, FORCE RLS, restricted role and original-route
counterexamples. This unit fixture itself is not deployed-auth or database proof.

The native owner reported 57 final cases passing, including current-sharing and
membership lock barriers, workspace scope, RR1, actual rollback and lost actual
COMMIT acknowledgement. Root's final combined native run is the final authority.

## Scope retained

Only project admission is repaired. No request UUID, replay/recovery API,
calendar/template-definition expansion, UI redesign or second task writer was
added. The project-first UI, D3/D6-owned files and one document editor remain
untouched. No commit, push, staging or allowance change occurred in this scope.
