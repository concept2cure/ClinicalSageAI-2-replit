# Tasking audit remediation — D2 / W1

Scope: F07 (owning-project handoff), F19 (task notification target), F20 (saved-task assignment recovery). No schema changes, new dependencies, production requests, commits or deployments.

## Owning-record identity

`GET /api/task-management/board` keeps `project` and `home.projectId` as the integer `projects.id`. `home.programId` is the distinct UUID `regulatory_programs.id`, resolved through the canonical **`projects.regulatory_program_id`** on the request's tenant database connection. Both sides of the join belong to the authenticated organization. The canonical `readProgramAnchorRow(..., requireUnique: true)` also verifies the reverse bridge, including duplicate anchors outside the requested board subset. Deleted programs, missing anchors and ambiguous mappings produce no program target; a failed lookup refuses the read instead of guessing.

**2026-10-14 continuation correction:** the first version of this remedy queried a nonexistent `regulatory_programs.project_anchor_id`. Its PGlite fixture repeated that incorrect column and could not establish deployed-schema correctness. Native testing found `42703` and actual read failures, then passed after repairing the helper and replacing the fixture with the canonical relationship. The earlier fixture confidence is withdrawn. See [native red-to-green evidence](task-filing-native-proof.md) and [the continued handoff contract](task-filing-continuation.md).

`home.source` and `home.nativeId` retain the owning store's record identity. Schedule, review and correspondence cards publish the UUID only, then open Project home on Review with the exact composite work id. The authorized program work read confirms the row; the requested row remains visible beyond the ordinary ten-row cap and when completed. Missing or unread work is stated explicitly.

An `estar_submissions` filing is a distinct record from a canonical `submissions` record. No relationship between them is invented. The continuation now opens the **exact native tracked filing** inside the existing Submission Center. Task Board first reads the authorized native record and current project ACL; only a verified unique programme UUID is published to the shell. A readable unbound filing opens without changing the current programme. The destination reads the exact UUID again and renders its saved status, dates, notes and recorded artifact binding. It never substitutes a canonical submission or sequence. The native detail is read only; deferred filing editing and agency transactions remain outside this handoff remedy.

## Saved-task assignment

The detail of an editable, unfinished saved task offers Auto-assign task to a session that can perform governed writes. It calls the existing `POST /api/tasks/tasks/auto-assign` with that exact task id. It creates no replacement task and retains the server's existing role, tenant, audit and notification gates. Success and shortfall both re-read the board. A refusal or unknown outcome stays visible in the detail and allows retry; an existing task is never described as newly created by the recovery flow.

## Notification target

The navigation channel emits `c2c:navigation-params` with the resolved destination id. The task board consumes its one-shot entry after commit, including when already mounted and under StrictMode. It opens only an exact id in its authorized board response. A failed or incomplete read is distinct from a missing task. An open task detail, archive justification, create/workflow form or signature ceremony is preserved; another requested task waits until that work is finished or closed.

### Copied-link continuation contract (source published before implementation)

The authenticated notification resolver's task URL retains `taskId=TASK-<native-id>` and, only when a canonical owning program is known, that program's UUID. On a fresh task-board mount, one valid `TASK-[A-Za-z0-9_-]{1,120}` query identifier may seed the existing exact-task selection. Duplicate or malformed query identifiers are refused. A valid one-shot navigation handoff takes precedence over the query, including during StrictMode's repeated effect setup. Subsequent navigation events do not replay the initial query. The URL does not grant record access or let an integer/project title become a program UUID: selection still comes exclusively from the authorized board, with its existing missing, incomplete and failed-read states.

## Verification

- Before implementation, the tasking regression run failed 7 tests and passed 5. It exposed the numeric handoff, missing saved-task assignment action and absent notification targeting.
- After implementation: 62 tests passed across 12 files. This includes the route response, real SQL in PGlite for tenant isolation/deleted/ambiguous anchors, exact Project-home targeting, StrictMode and same-surface notifications, preserved archive text, assignment shortfalls and expired sessions, navigation-channel delivery, existing sign-off, permissions and refused writes.
- Targeted ESLint: zero errors; existing large components and complexity warnings remain (21 warnings in the scoped files, including new branches). `git diff --check` passed.
- Logs: `/workspace/audit/tasking-before.log`, `/workspace/audit/tasking-complete-verification.log`, `/workspace/audit/tasking-eslint.log`. Tests use local mocks/PGlite; live deployment behavior and migration provision are not claimed here. Root owns the integrated build and broader checks.

Copied-link follow-up: before the query fallback, three new mounted UI regressions failed and 14 passed (`/workspace/audit/tasking-copied-link-before.log`). The final task/actual-Insights fixture check passes 21 tests across two files (`/workspace/audit/tasking-copied-link-final.log`), including exact copied-link selection, StrictMode precedence, refused malformed/duplicate identifiers, foreign/missing tasks, failed authorized reads and no replay after unrelated navigation. The Insights fixture uses its actual owned-conversation prop contract. Targeted lint reports zero errors with existing task-board size/complexity warnings; owned-file whitespace checks pass. This follow-up does not assert that notification resolver authorization or deployment has been qualified by these mocked UI tests.
