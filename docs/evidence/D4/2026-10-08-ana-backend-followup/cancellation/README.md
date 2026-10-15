# AnA queued tool cancellation

Workstream W3 / D4; canonical branch `concept2cure-v2`. Source base:
`f1b00425a` (published delivery `519c6acd5` plus automated repository-health
documentation). This repair is limited to the existing non-SSE tool adapter
and its cancellation regression. It changes no UI/client code, tool surface,
model, dependency, ownership/admission rule, gate or baseline.

## Reproduced defect

`executeAgenticLoop` checked the signal before starting a tool round. A round
uses bounded concurrency, so Stop can arrive after its active handlers start
and before its remaining handlers receive a lane. `runOneTool` invoked the
handler while constructing `Promise.race`, before its already-aborted race
rejected. Consequently, queued handlers still started after Stop, even though
the adapter reported their results as cancelled.

The new `executor-agentic-loop-queued-cancel.test.ts` drives the actual exported
adapter, registry wrapper, bounded map and cancellation helper. As in adjacent
executor tests, only the gateway is scripted and probe tools are classified as
read-only in the test seam. Pending handlers occupy either one configured lane
or all four default lanes. Stop aborts the real supplied signal before two
queued handlers can start. Both cases failed before repair: their queued
handler probes ran twice with an already-aborted signal. An uninterrupted
control passed. The fail-first verdict was **2 failed / 1 passed** (`red.log`).

## Bounded repair

`runOneTool` checks the existing signal before invoking the handler and throws
the existing `ToolRunCancelled` within its existing catch boundary. The catch
continues to return one cancellation result for each call, retaining the call
identity and omitting an error message that would trigger adaptation. A step
already in flight still uses its existing signal and race; the repair makes no
claim that its side effects were undone.

The regression verifies that queued probes never start, that every call still
has its ordered result and observer outcome, that cancellation has no failure
message, and that no further model call spends work after Stop. Its live
control verifies normal sequential dispatch and results reaching the next
model turn. There is no new timer or lifecycle manager in production.

## Verification

- Node 22.23.3 / Vitest 4.1.7: new regression **3 / 3 passed** (`green.log`).
- Final related qualification: **133 / 133 passed across 10 server test files**
  (`qualification.log`). This includes the new queued cancellation cases;
  existing non-SSE adapter, options/authorization and lost-input tests; the
  shared loop; cancellation result accounting; in-flight tool cancellation;
  and stream disconnect, hold and run-policy regressions.
- Focused ESLint: **0 errors**. New test **0 warnings**; `AnaToolExecutor.ts`
  retains **100 warnings**, with the same warning rules and counts
  (`eslint-production-before.json`, `eslint-after.json`). The existing file-size
  diagnostic reflects one additional code line (18,291 to 18,292). No rule
  suppression or baseline update was made.
- `git diff --check`: passed. Compiler, build, governed gates and publication
  are owned by the control-tower session.

Reproduction command, with the canonical Node 22 directory first on `PATH`:

```sh
node node_modules/vitest/vitest.mjs run server/services/ana/__tests__/executor-agentic-loop-queued-cancel.test.ts --config vitest.config.ts --reporter verbose
```

The ten-file qualification additionally selects `executor-agentic-loop.test.ts`,
`executor-agentic-loop-options.test.ts`, `executor-agentic-loop-lost-input.test.ts`,
`agentic-loop-cancel-entries.test.ts`, `tool-run-cancelled.test.ts`,
`tests/services/agentic-loop.test.ts`, `stream-disconnect.test.ts`,
`stream-run-hold.test.ts` and `stream-run-policy.test.ts`.

The controlled provider and handlers demonstrate a dispatch correctness defect,
not a production latency benchmark. Already-started handlers that ignore their
signal may still finish; their result continues to be abandoned by the existing
race. This change prevents starting work that remained queued when Stop arrived.
