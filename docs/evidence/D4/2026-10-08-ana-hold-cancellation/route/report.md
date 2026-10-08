# W3 / D4 — parent hold cancellation through the stream route

Baseline: `c7a0405d9a1a6da9a7eecb54cbee8870e1dfb333` on
`concept2cure-v2`. Runtime: Node `v22.23.3`.

Scope: one new route regression file,
`server/routes/ana-ri/__tests__/stream-hold-cancellation.test.ts`, using the
existing stream harness with per-file run-control read/wake overrides. No
shared harness, client, UI, dependency or production edits in this test scope.

## Reproduction and boundary

The production stream creates one shared RunHold for a durable run and passes it
to TurnPolicy at the loop checkpoint. Before this repair, that wiring supplied
only a `cancelled()` boolean; both TurnPolicy hold paths omitted the existing
hold signal argument. RunHold could consequently remain inside an unresolved
status read or wake after the run's cancellation signal fired.

The mounted HTTP route, agentic loop, TurnPolicy, shared RunHold, approval
classifier and turn recorder are real. The existing harness replaces model
answers, tool handlers, run-row persistence, context assembly and final
post-processing. The tests abort the actual handle signal supplied by the
harness and script the row as canceled. They do not qualify the real database,
control endpoint, cross-instance notification delivery or a live provider.

| Cases | Assertions |
| --- | --- |
| Person and Manual holds stopped during an unresolved status read | The HTTP turn completes before the read is released; no subsequent queue drain, tool or model call; no wake, resume or hold-expiry action |
| A stale `paused` result released after that Stop | No later wake, model/tool call, abandonment resume or expiry write |
| Person and Manual holds stopped during an unresolved wake | The turn completes while the 5-second wake promise remains unresolved, without another queue drain |
| Person and Manual normal Continue | One paused/resumed pair; the intended step runs; ordinary `no_more_tools` ending |

Every canceled case requires one canceled frame and a `done` frame whose reason
is `cancelled`. Manual cases also require the held literature-search step to
remain `not_run`, with a stopped hold and the step named in `pendingSteps`.
The read/wake blockers are released in `finally` only for cleanup, after the
prompt-completion assertions. The one-second test wait bounds an assertion
before release; it is not a production latency benchmark or SLA.

## Evidence

- `red.txt`: **4 failed / 2 passed across 1 file**, captured before production
  changes. Both read cases failed `Stop waited for the database status read`;
  both wake cases failed `Stop waited for the hold wake ceiling`. Both normal
  Continue controls passed.
- After that capture, per-file queue-drain counters were added to the same four
  cancellation cases. They snapshot the count at hold entry, allowing Manual's
  legitimate drains before the hold.
- `intermediate-red.txt`: **4 failed / 2 passed across 1 file**, on the
  signal-propagation and cancelable-read repair before early hold settling.
  Prompt cancellation completed, but all four new counter assertions failed:
  person holds performed **1 drain instead of 0**, Manual holds **3 instead of
  2**. The extra drain occurred after Stop. The service agent froze source for
  this coordinated capture before implementing the early cancellation check.
- `eslint.txt`: forced ESLint with `--no-ignore --max-warnings=0` exits 0,
  **0 errors / 0 warnings**. The Undici experimental runtime notice is not an
  ESLint finding.
- `green.txt`: **6 passed across 1 file**, 6.87 seconds overall, with 261 ms
  spent executing the cases. All four cancellation cases retain their
  post-Stop queue-drain assertions. The two normal Continue controls still pass.
  These are test-run timings, not a production benchmark.
- `source-hashes.txt` identifies the exact route, service and test files used
  for final qualification. `diff-check.txt` records a clean `git diff --check`.

## Independent service review

The root-owned route change passes the existing handle's `cancelSignal` into
TurnPolicy's run wiring. The service-owned policy change forwards it into both
parent hold paths. RunHold races status reads against that signal, cleans its
listener in `finally`, and observes late query rejection through the race.
Each of the three read consumers also checks cancellation after its await,
covering the microtask gap between the inner read and outer continuation.

The existing shared waiter counter remains unchanged: one canceled waiter does
not close the pause interval while another still waits; the last waiter closes
it. The read's late fulfillment only constructs a local row result and cannot
change shared hold state after its canceled caller exits. Early TurnPolicy
settling checks cancellation before starting another queue drain or status
read, while preserving the check after an already-started drain. Manual Stop
still records the held step as stopped and not run. No introduced regression
was found within this batch's status-read and wake cancellation scope.

The underlying PostgreSQL read is still allowed to settle in the background;
ending the hold promptly does not claim to cancel that database query. Expiry
policy, guarded deadline writes and unrelated `abortRace` cleanup remain outside
the production changes in this batch. The sole production caller of RunHold
and TurnPolicy remains the stream route; the non-stream adapter does not
instantiate these holds, so no new non-stream functionality was added.

## Commands

```sh
PATH=/root/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH
NODE_OPTIONS=--max-old-space-size=4096 node node_modules/vitest/vitest.mjs run --config vitest.config.ts \
  server/routes/ana-ri/__tests__/stream-hold-cancellation.test.ts
node node_modules/eslint/bin/eslint.js --no-ignore --max-warnings=0 \
  server/routes/ana-ri/__tests__/stream-hold-cancellation.test.ts
```

Build, compiler, full publication gates and delivery are owned by the root
session and recorded separately. The service agent owns RunHold/TurnPolicy
production changes and direct service tests; the root owns route propagation.
