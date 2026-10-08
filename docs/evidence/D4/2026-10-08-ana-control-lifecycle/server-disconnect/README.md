# AnA local-only disconnect lifecycle

Workstream W3 / D4. Source base: `117313b90e933b8e96d162e3f855ca08899ec9fc`, on `concept2cure-v2`. This bounded repair changes only the stream's disconnect/keepalive lifecycle and exposes an abort function its local-only run handle already had. No tool, model, dependency, surface, admission rule, ownership check, policy gate or baseline changes are made. The previous memory-start overlap and Markdown LRU repairs remain intact.

## Reproduced defect

When the durable run row cannot be opened, the stream uses `localOnlyRunHandle`. That handle already supplies an `AbortController` and `abortLocally`, but its declared return type hid the latter and the stream's close callback returned immediately without a `runId`. Closing the socket therefore left provider/tool work live. Separately, ordinary `IncomingMessage` body completion triggered the request's close listener, clearing the response keepalive even while a healthy generation remained pending.

`stream-disconnect.test.ts` drives the real mounted handler over HTTP with an unavailable run-row seam, the actual local-only handle, a provider waiting for its supplied signal, and the actual turn recorder. Before repair, **3 failed / 3 passed** (`red.log`): local-only response destruction and interrupted incoming-request close failed to abort; ordinary incoming-request completion incorrectly cleared the heartbeat. Existing normal-completion and durable-disconnect controls passed.

Final review also reproduced a missed-close window: the response can close while `beginRun` is awaiting the durable row, before the disconnect callback is registered. Deferring the real handler's run-opening seam, destroying the actual response, and then allowing that seam either to fail or succeed produced **2 failed / 6 passed** (`late-open-red.log`). Both paths reached the provider with a live signal despite an already-destroyed response.

## Repair and traceability

- `RunHandle` exposes its existing optional `abortLocally` capability; the factory's runtime behavior is unchanged.
- A local-only disconnect aborts once, without a durable control write or invented human decision.
- The sealed record remains `stopped`, identifies its missing durable run as `null`, carries no human controls, and states: "The connection dropped before this turn completed." The catch variable is named for interruption rather than assuming a person cancelled.
- Incoming-request `close` clears the keepalive and stops work only when `req.aborted` is true. Response `close` remains authoritative; `res.writableEnded` prevents aborting normal completion.
- Immediately after the synchronous recorder setup, an already-destroyed response or aborted incoming request invokes the same guarded disconnect callback. This accounts for a close during run opening while retaining the connection-drop cause in the sealed local-only record.
- The durable branch still calls `stopRunInternally(..., 'client_disconnected', organizationId)`, without calling the human-control endpoint or overwriting normal completion. Its ownership and audit logic are unchanged.

The local-only factory stores no handle in the durable run map. Closing the response clears the existing keepalive, and the one-shot settlement guard prevents duplicate aborts. The test provider removes its own abort listener when it settles; production providers receive their existing signal. No new timer, listener registry or resource manager is introduced.

## Verification

- Node 22.23.3 / Vitest 4.1.7: the initial lifecycle suite passed **6 / 6** (`green.log`); both run-opening cases then passed, bringing the suite to **8 / 8** (`late-open-green.log` and final qualification).
- Final related qualification: **140 / 140 passed across 7 files** (`qualification-final.log`): new disconnect lifecycle, existing stream memory overlap and context admission, holds and run policy, durable run-control PGlite integration, and background tenant-scoped run control. The final run includes the stronger local-only run-opening record assertions. The earlier 138-test qualification remains in `qualification.log`. The real durable-record suite retains its assertions distinguishing socket disconnect from human cancel.
- Focused ESLint: **0 errors**. The new test has **0 warnings**; the existing stream and run-control files retain their warning counts of 23 and 2 (`eslint-final.json`; earlier verdict preserved in `eslint.json`).
- `git diff --check`: passed.
- Compiler, build, repository gates and publication are owned by the control-tower session and recorded in the parent delivery record.

This is a correctness and resource-use repair. It does not claim a production speed benchmark, undo tool side effects, or make a provider that ignores cancellation stop its own remote execution. It supplies the existing stop signal correctly. The incoming interruption test sets the actual request's `aborted` flag before emitting `close`; response-disconnect tests destroy the actual HTTP response. The ordinary-request completion test emits `close` while a provider remains pending to exercise that lifecycle boundary deterministically. The run-opening tests defer the existing seam to cover its failure and success outcomes without changing run ownership or the durable writer.
