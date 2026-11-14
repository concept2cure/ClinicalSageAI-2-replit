# F1: finish existing collaboration intake response handling

W1, launch D2. Continue canonical841c41466. The project-first roadmap, existing Tasks/Communication rail and one editor are retained. API setup remains pending; no provider work is in scope.

## What already exists

- `v2/surfaces/CollabLauncher.tsx` contains existing QuickTask and CollabDiscuss forms, one directory and the canonical C2C in-session projection. It already fences account/access transitions through captureAuthoringSession and the existing authoring read-session hook, with tests in collabDirectoryContext.test.tsx. Previous source279a6f144 and integration532cf4145 are accepted.
- The Collaborate form already distinguishes confirmed/unknown delivery and protects a confirmed message from an automatic repeat; collabMessageReceipt.test.tsx proves the partial-message/task behavior. The QuickTask form currently has only a saving boolean and reports an unknown fetch failure as Nothing was saved. Inspect actual refused/unknown route outcomes before repairing any classification.
- `server/routes/taskManagement.routes.ts` owns `/api/tasks/tasks` and `/api/tasks/messages`, persisted task identities, actor/project admission and audit outcomes including OUTCOME_UNKNOWN/AUDIT_WRITE_FAILED. The backend is not replaced, and no idempotency service or endpoint is added.
- CollabModal already permits Close/backdrop/Escape and tab changes. Its forms' pending callbacks use the account owner but have no recorded intake-lifetime owner. Audit whether a previous form can close or mutate a newly opened intake after a same-account close/reopen. Preserve genuine server outcomes; a UI close does not undo a write.
- Existing tests collabAutoAssignHonesty, collabTaskOpenProject and TaskAssignmentControls cover normal/automatic task creation and project/assignee controls. Extend existing contracts and retain their controls.
- Canonical helpers include authoringCurrentRead.ts, apiCall current-owner overload, shellProject visit guards and useDialog. Reuse their ownership semantics rather than another authentication or request mechanism. S12 workProject mapping lines and Wave B TaskBoard/TaskTray/CommunicationCenter remain untouched.

Discovery: current launcher/action bodies and tests, task route outcome codes, coordination/plan and git deleted-history searches for CollabLauncher/QuickTask found no replacement. Nothing here adds a module, screen, route, service, table, model or dependency.

## Bounded discovery and proof

Reproduce at most the pending-intake and ambiguous task-acknowledgement families before changing source. Retain genuine RED snapshots/logs, repair only the existing launcher and focused tests, use controlled local browser responses, then publish through all normal canonical hooks. No real external message or provider call is performed.

The pending-intake audit reproduced a delayed QuickTask201 closing a newly opened Collaborate dialog and dropping its new draft after the original form was dismissed. The original server write is not undone by dismissing a UI. Exact owned paths are the existing launcher plus focused collabIntakeLifetime/collabTaskOutcome tests; only one worker edits source.

## Verified decision and implementation

UI dismissal retires an intake; it does not cancel or roll back a submitted operation. Same-account message/task chains still finish and publish real receipts. Exact monotonically increasing visit identities retire old close, navigation, reset and submission callbacks, including batched close/reopen and tab A→B→A transitions. Existing account/access guards still prevent another account adopting the work.

QuickTask now admits one synchronous submission, accepts only a nonblank string persisted taskId, and uses the existing ApiRequestError/errorCodeOf contract. Network loss, timeout, unknown commit, unclassified server error and malformed success receipts remain unknown and block both create actions in that intake. Definite client refusals and explicit audit rollback permit correction; confirmed Create & add another permits an explicitly different task. The existing board link remains usable. This is not backend idempotency or recovery across reopening/reloading.

A real browser screenshot also exposed the static note claiming Saved alongside an unknown acknowledgement. Its conditional wording now describes successful creation rather than claiming the current operation succeeded. No additional feature or backend change was introduced.
