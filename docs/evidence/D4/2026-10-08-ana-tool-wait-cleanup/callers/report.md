# W3 / D4 — settled tool wait listener cleanup

Baseline: `b0b1694aa00ee991b6792edab530f9fa59f1df93` on
`concept2cure-v2`. Runtime: Node `v22.23.3`.

## Reachable defect

The production stream and non-stream executors both race a tool handler against
`abortRace(signal)`. That helper previously registered an anonymous abort
listener with `once: true`, but provided no way to remove it when the tool
finished first. A completed or failed tool therefore retained its listener until
the whole run was stopped. Twelve completed tools left twelve inactive wait
listeners on a live signal, despite tool concurrency being capped at four.

The only production callers are the stream handler wait in
`server/routes/ana-ri/stream.ts` and `runOneTool` in
`server/services/ana/AnaToolExecutor.ts`. The latter is reached through the real
non-stream `executeAgenticLoop` adapter used by chat, intelligence and background
investigation callers. The synchronized baseline contains other-session context
and UI changes; they are preserved and outside this batch's ownership.

Scope owned here: two new caller regression files and this evidence directory.
No production, existing test, shared harness, client, UI, model, tool catalog,
dependency, cache or configuration edits.

## Production-path regressions

`executor-tool-wait-cleanup.test.ts` runs the actual non-stream adapter and
registry wrapper, with the gateway scripted and read-class probe handlers
registered through the existing test seam. Production handlers retain their
real authorization classes. `stream-tool-wait-cleanup.test.ts` mounts the actual
HTTP route using the existing stream harness and per-file handler/gateway/
telemetry overrides. The shared harness is unchanged. Neither suite mocks
`abortRace` or its replacement behavior.

The stream route's agentic loop, checkpoint, RunHold/TurnPolicy, approval
classifier, tool wait, result framing and turn recorder are real. The existing
harness replaces model responses, run-row persistence, context assembly and
final post-processing. These are deterministic caller regressions, not
live-provider, database-persistence or browser qualification.

| Scenario on each caller | Required behavior |
| --- | --- |
| Twelve successful tools | Signal remains live; all results reach the next model turn; listener count returns to zero before that model call |
| A throwing handler | Genuine error remains in results and adaptation/telemetry/record; signal remains live; settled listener is removed |
| A completed tool beside a pending tool | Only the active wait retains a listener; Stop still cancels it, retains the completed result, files a truthful canceled result, and prevents another model call |
| Pending handler rejects after Stop | The rejection is observed without an unhandled rejection; the canceled outcome remains final |
| SSE gateway honors its production abort contract | Mid-tool Stop closes with a canceled done frame and tool record, without a generic error frame or a follow-up gateway entry |

The count comes from Node's `getEventListeners` on the actual signal supplied to
the executor. Completed-wait assertions occur while the run is still live, not
after aborting the signal, because `once: true` would otherwise hide the leak.

## Fail-first evidence

`red.txt`: **6 failed across 2 files**, before helper or caller changes. Both
production paths showed the same counts:

| Check | Required | Baseline observed |
| --- | ---: | ---: |
| Listeners at next model call after twelve successes | 0 | 12 |
| Listeners at next model call after one failure | 0 | 1 |
| Listeners after one tool settles while its sibling remains pending | 1 | 2 |

The genuine-error and outcome assertions before those listener checks passed.
No listener limit or warning suppression was introduced; the evidence is the
measured retained-listener count, not a runtime-warning claim.
The final SSE test also requires the pending tool's canceled wire result by
pairing id and result body.

## Reached mid-tool Stop boundary

After disposable waits were wired, the first caller qualification reached a
previously masked assertion: **5 passed / 1 failed**, preserved in
`intermediate-outcome-red.txt`. The stream mixed-tool case returned a
`no_more_tools` done reason after Stop. A second run moved the model-call count
assertion before that reason without changing production. It failed with
**2 gateway invocations instead of 1**, `intermediate-dispatch-red.txt`
(1 failed / 2 skipped).

The existing harness gateway scripts responses and does not reject an aborted
signal. Its `no_more_tools` reason above is an artifact of that non-aborting
mock; production gateway admission rejects the stopped follow-up invocation
before provider contact. Neither intermediate run claims an extra provider
call. The route nonetheless continued past canceled tool execution into another
model request.

A seventh case honors that production contract using a per-file override that
throws the **real `GatewayAbortedError('pre_call')`** before delegating to the
scripted gateway when the input signal is already aborted. Before the halt
repair this case failed: **1 failed / 3 skipped**,
`gateway-contract-red.txt`. The route catch emitted a generic SSE error after
Stop. Its attempted record write honestly reports `not_recorded`, since the
shared database harness intentionally lacks a dedicated persistence client;
that fixture limitation is separate from the reproduced wire error.

The root's bounded repair uses the existing shared-loop `halt` directive when
the run signal is aborted. The loop already evaluates that directive after tool
execution, so the turn exits as `cancelled` before entering another model call
or reaching the generic error catch. No additional helper, error class or
protocol field is required. The original model-call and canceled done-reason
assertions remain, and the seventh case requires the normal canceled done
frame, no error frame, canceled tool body/record and zero stopped follow-up
gateway entries.

## Final qualification

`green.txt`: **7 passed across 2 files** on Node **22.23.3**, Vitest **4.1.7**,
11.41 seconds. Both callers return to zero retained tool-wait listeners after
success or genuine failure, while a pending sibling keeps exactly its own
listener until Stop. Both mixed cases observe the abandoned handler's later
rejection without an unhandled rejection. Genuine tool errors, completed
results and canceled tool bodies remain distinct.

The two SSE Stop cases emit `done` with `stoppedReason: cancelled`, make only
the initial model gateway call, and enter ordinary post-processing with
`stopped: true` and `stoppedReason: cancelled`. The production-abort-contract
case also asserts no generic SSE error, no rejected follow-up gateway entry,
and a truthful canceled step in the existing turn recorder.

Forced ESLint for both new files passes with **0 errors / 0 warnings** using
`--no-ignore --max-warnings=0`, `eslint.txt`. No suppression, gate or baseline
change is involved. Production `git diff --check` is clean. Final hashes of
the three production files and two caller tests are pinned in
`source-final-sha256.txt`; helper direct qualification belongs to the separate
helper report and is not included in this seven-case count.

Independent read-only review found no helper or caller blocker: disposal uses
each wait's own listener identity, clears it idempotently and preserves the
native Promise result. Actual abort disposes before the unchanged typed
rejection. Work is evaluated before constructing its cancellation wait, and
both `finally` blocks preserve the existing generation capture and run scope.
The existing post-tool halt boundary prevents the stopped gateway attempt.

This fixes wait lifetime and the reached mid-tool Stop continuation; it does
not undo handler side effects or stop handlers that ignore their signal. No
latency, browser frame-rate, live-provider or database persistence claim is
made. No client/UI file, visual layout, dependency or configuration changed in
this owned scope. No commit or push was performed by this agent.

## Commands

```sh
PATH=/root/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH
NODE_OPTIONS=--max-old-space-size=4096 node node_modules/vitest/vitest.mjs run --config vitest.config.ts \
  server/services/ana/__tests__/executor-tool-wait-cleanup.test.ts \
  server/routes/ana-ri/__tests__/stream-tool-wait-cleanup.test.ts
node node_modules/eslint/bin/eslint.js --no-ignore --max-warnings=0 \
  server/services/ana/__tests__/executor-tool-wait-cleanup.test.ts \
  server/routes/ana-ri/__tests__/stream-tool-wait-cleanup.test.ts
# Intermediate proof runs used the same stream file, with:
# -t 'removes only the completed listener'
# -t 'production gateway abort contract'
```

Build, compiler, broader qualification and publication belong to the root
delivery record. The service agent owns helper/direct-test changes; the root
owns the two production callers.
