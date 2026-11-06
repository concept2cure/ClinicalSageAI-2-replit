# F1 demo follow-through, 2026-11-06

## Messaging: retain confirmed delivery after an optional task refusal

Plan: F1. Completes: `client/src/concept2cure/v2/surfaces/CollabLauncher.tsx`.
The root owns integration, verification and direct canonical push; this lane
owns only the existing launcher, focused client tests and messaging evidence.

### What already exists

`CollabLauncher.tsx`'s existing `CollabDiscuss` sends through POST
`/api/tasks/messages`, then optionally creates an assigned task through the
existing POST `/api/tasks/tasks`. The server creates one persisted recipient
notification per successful message request (`server/routes/taskManagement.routes.ts`).
After a task refusal the composer already says the message was sent and points
the person to the task board, but re-enables Send without remembering delivery.
Repeating that action sends the message again. The existing CollabLayer test
harness in `collabTaskOpenProject.test.tsx` mounts the actual composer over a
mocked HTTP boundary and real directory/context loading; extend that pattern.

Exact-path deleted history contains no replacement for the current launcher or
task route; broader collaboration history contains retired UI/services
(`2895218b8`, `46044c426`, `e5a74a4df`, `7a144fd1e`, `54142cf0b`), not a reason
to restore another message system. Current coordination holds the agency S10
files under RIM; none is touched. Root assigned this existing launcher/test
scope exclusively. No new feature, service, server API, route or store is added.

### Bounded contract before implementation

Capture genuine RED with the actual composer: message HTTP201, optional task
refusal or thrown failure, then a second Send must not POST another message.
Retain confirmed message delivery in this compose instance, disable repeat
submission and edits after partial success, preserve its visible partial-success
wording and Close/task-board recovery. A new composer starts fresh. A known
message refusal remains editable/retryable. Do not claim a network-uncertain
outcome was definitely unsent or automatically repeat it. Task outcome unknown
must remain distinct from a confirmed refusal; no transport/API redesign.

Run focused component/adjacent launcher tests and scoped lint, then freeze and
report to the root. No browser, DB, provider, build or broad gate work in this
lane. Runtime/transport integration remains separately qualified.

### Messaging lane result

Actual rendered-composer RED captured before production edits:4failed/2passed,
including repeat message POST after both task refusal paths. The existing
composer now retains confirmed delivery, blocks repeat submission/edits after
partial or uncertain delivery, preserves task-board/Close recovery, and keeps a
known refused message retryable. Unknown message/task outcomes are no longer
reported as definitely unwritten. Final focused/adjacent tests pass18/18 across
three existing/new test files. Scoped ESLint has0errors, the launcher's same
8baseline warnings and0warnings in the new test. Exact evidence, limits and source
hashes are in `docs/evidence/F1/2026-11-06-demo-followthrough/messaging/`.
Root owns aggregate checks and landing; this lane does not claim a live recipient
delivery, browser walk or deployed API qualification.
