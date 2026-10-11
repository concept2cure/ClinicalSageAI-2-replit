# W3 / D4 — Cancel deferred demo operations when a drive ends

## Reproduced behavior

A surface action can be accepted into a pending slot while its destination mounts or loads data. `driveQueue.clear()` previously dropped only moves that had not entered the queue runner. It left this deferred action in the surface-action bus, so:

- Stopping/taking over a demonstration could still execute its old action when the screen subsequently mounted or finished loading.
- Starting a replacement demo left its first move blocked behind the old deferred action until its outcome or the 20-second bus expiry / 22-second queue fallback.

`regression-red.txt` shows both failures against the original implementation using the real queue and surface-action bus. A control test confirms already applied actions retain their successful outcome.

## Focused fix

The queue now retains a cancellation function only while its active action is still stashed. Clearing the drive removes that exact directive from the bus, reports it dropped once to its originating turn, and releases the queue immediately. The bus checks object identity so a stale cancellation cannot erase a different pending action selected by the person.

Completed actions retain their real outcome. A navigation already in flight still settles under its original turn, as before. The existing shell `clear()` paths cover Stop, take over, switching Live Drive off, and a new driving turn. No server/shared contracts, scripts, approvals, navigation budgets, or governed mutations changed.

Implementation scope:

- `client/src/concept2cure/v2/driveQueue.ts`
- `client/src/concept2cure/v2/surfaceActions.ts`
- `client/src/concept2cure/v2/V2App.tsx`
- Focused regression, queue, and shell tests.

## Validation

- `regression-red.txt`: two behavioral failures, one passing completed-action control.
- `regression-green.txt`: those same three tests pass after the fix.
- `targeted-green.txt`: 55 tests across four suites pass, including an added stale-cancellation ownership test, existing sequencing/refusal tests, surface-action validation, and the real shell wiring. The shell's former expectation that a cleared stashed action could land was changed to assert both the stashed action and its queued successor are reported not made.
- `lint.txt`: explicit ESLint `--no-ignore`, zero errors and nine warnings.
- `git diff --check`: clean.

Runtime: Node 22.16.0 with locked dependencies. Tests ran serially with one worker and a 2 GiB V8 heap limit:

```sh
NODE_OPTIONS=--max-old-space-size=2048 node node_modules/vitest/vitest.mjs run --config vitest.config.ts --maxWorkers=1 --no-file-parallelism client/src/concept2cure/v2/__tests__/driveQueue-cancel-pending.test.ts client/src/concept2cure/v2/__tests__/driveQueue.test.ts client/src/concept2cure/v2/__tests__/surfaceActions.test.ts client/src/concept2cure/v2/__tests__/liveDriveShell.test.tsx
```

This proves the client queue/bus/shell behavior. It does not establish production model latency or completion of an entire live tenant demonstration. D4 remains subject to the lead's combined launch evidence and live validation.
