# W3 / D4 — Apply the next demo operation after the screen state commits

## Reproduction on a healthy network

The real Submission Center starts with Alpha IND selected and its sequence 0000 loaded. The real drive queue receives two valid actions in one batch: select Beta IND, then select Beta's sequence 0001. Both API reads succeed.

Before the change, the first handler called React `setState` and immediately reported success. The serial queue then called the second handler before React committed the new selection. It refused the second move with **`No sequence "0001" in Alpha IND.`** This is captured in `selection-red.txt`. The reproduction enqueues both moves in one synchronous `act()` and then uses `waitFor`; it does not hold React rendering inside an asynchronous `act()` waiting for the queue itself.

A first-commit-only probe removed the old submission identity but still read Alpha's sequence rows under Beta's name. The dependent sequence request marks loading in a passive effect, so that readiness update must also commit before another action can read the rows. The final implementation waits for both revision-aware boundaries, then uses the existing retry/ready mechanism while Beta's rows load. It adds no elapsed-time delay.

## Change

- A React surface registration can provide a local `awaitCommit()` callback. Plain non-React registrations keep their immediate behavior.
- Only the drive queue requests `waitForCommit`. Applied outcomes carry an optional local promise; direct chip callers retain their existing immediate outcome shape. No promise is serialized to the server.
- The hook forces a requested render revision, lets selection-dependent effects schedule their loading state, and confirms the subsequent commit. An effect from the prior/mount revision cannot release a newly created barrier.
- The queue disarms pending-action cancellation as soon as the handler actually applies its action, then waits for the commit boundary before acknowledging success or starting another move. Stop cannot turn an already-performed action into a claim that it never happened.
- Owner disposal unregisters its handlers and releases pending barriers. This preserves intentional navigation such as opening a program and prevents a queue from waiting on an unmounted screen. The boundary proves it is safe to start the next action; it does not claim the previous screen stayed visible.

Production scope: `surfaceActions.ts`, `driveQueue.ts`, and the `V2App.tsx` queue wiring. No server/shared contracts, demonstration scripts, permissions, approvals, or dependencies changed. No `flushSync`, artificial sleeps, or per-surface workaround was added.

## Validation

- `selection-red.txt`: real queue/bus/Submission Center regression fails against the original implementation.
- `selection-green.txt`: the same selection sequence passes with an immediate Beta response and a deliberately held Beta response. While the read is held, the next action waits without failure; after release, the real submission and working-sequence selectors show Beta and 0001.
- `commit-green.txt`: seven tests pass for deferred mount registration, StrictMode, owner disposal without reusing stale handlers, direct chip/non-React compatibility, and Stop while an immediate or deferred action has already applied but awaits its commit.
- `targeted-green.txt`: **64 tests across six suites pass**, including the prior queue/cancellation, surface-action, and shell suites.
- `lint.txt`: explicit ESLint `--no-ignore` completes with zero errors and eight existing V2App warnings. No warning from the new tests, queue, or surface-action implementation.
- `git diff --check`: clean.

Runtime: Node 22.16.0; locked dependencies; serial Vitest execution with one worker and a 2 GiB heap limit.

```sh
NODE_OPTIONS=--max-old-space-size=2048 node node_modules/vitest/vitest.mjs run --config vitest.config.ts --maxWorkers=1 --no-file-parallelism client/src/concept2cure/v2/__tests__/driveQueue-react-selection.test.tsx client/src/concept2cure/v2/__tests__/surfaceActions-commit.test.tsx client/src/concept2cure/v2/__tests__/driveQueue-cancel-pending.test.ts client/src/concept2cure/v2/__tests__/driveQueue.test.ts client/src/concept2cure/v2/__tests__/surfaceActions.test.ts client/src/concept2cure/v2/__tests__/liveDriveShell.test.tsx
```

These tests prove client state ordering and visible selection outcomes. They do not measure a production model or certify a complete live tenant demonstration.
