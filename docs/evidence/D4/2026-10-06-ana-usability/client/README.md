# W3 / D4 — AnA client network waits and demo replacement

Scope: `client/src/concept2cure/components/ana/useAnaChat.ts` and its new network-wait regression suite. No server contracts, approvals, surface actions, navigation budgets, or demo scripts changed.

## Reproduced defects

1. The 90-second stream idle watchdog started only after `fetch()` received response headers. A request stalled before headers left the composer in Planning indefinitely. The watchdog now covers that initial wait as well as subsequent stream silence.
2. Stop awaited the server cancellation without a timeout. The shell starts a selected replacement demonstration only after the prior stream ends; a stalled cancellation could therefore leave both Stop and the requested demonstration waiting indefinitely. Control requests now have a 5-second transport timeout. Stop still gives the server the first opportunity to record cancellation, then disconnects the stopped stream on transport failure. An unconfirmed turn record remains unconfirmed until the existing lookup confirms it.
3. Stop read the active abort controller after awaiting cancellation. If the old stream finished naturally and a replacement demonstration started before the cancellation response arrived, the old Stop aborted the new demonstration and overwrote its run status. Stop now retains its originating controller/run; late control responses do not change a newer run's local status.

## Evidence

- `regression-red.txt`: all three regression tests fail against the unchanged client implementation, with assertions on the actual request signals and current hook state.
- `regression-green.txt`: the same three tests pass after the focused fixes.
- `targeted-green.txt`: 122 tests across eight suites pass, covering the new cases plus drive lifetime, controls, run policy, retained turn records, progress, move sequencing, the drive reducer, and surface actions.
- `lint.txt`: targeted ESLint with `--no-ignore` completes with zero errors; 42 warnings remain (including legacy file complexity/size and browser type globals in tests). The repository default ignores these files, so `--no-ignore` was used explicitly.
- `git diff --check` passes.

Runtime: Node 22.16.0; locked dependencies from `npm ci`; Vitest 4.1.7.

Commands (from repository root, Node 22 on PATH):

```sh
node node_modules/vitest/vitest.mjs run --config vitest.config.ts client/src/concept2cure/components/ana/__tests__/useAnaChat-network-waits.test.ts
node node_modules/vitest/vitest.mjs run --config vitest.config.ts client/src/concept2cure/components/ana/__tests__/useAnaChat-network-waits.test.ts client/src/concept2cure/components/ana/__tests__/useAnaChat-drive.test.ts client/src/concept2cure/components/ana/__tests__/useAnaChat-run-policy.test.ts client/src/concept2cure/components/ana/__tests__/useAnaChat-turn-record.test.ts client/src/concept2cure/components/ana/__tests__/useAnaChat-round-status.test.ts client/src/concept2cure/v2/__tests__/driveQueue.test.ts client/src/concept2cure/v2/__tests__/liveDrive.test.ts client/src/concept2cure/v2/__tests__/surfaceActions.test.ts
node node_modules/eslint/bin/eslint.js --no-ignore client/src/concept2cure/components/ana/useAnaChat.ts client/src/concept2cure/components/ana/__tests__/useAnaChat-network-waits.test.ts
git diff --check
```

## Limits

The tests use controlled fetch/stream responses and virtual time. They prove the client failure and recovery behavior, not production model latency or a complete live sales demonstration. Live tenant credentials, the deployed API, and model-provider calls were not exercised by this client workstream. This is supporting evidence for D4, not a declaration that all D4 acceptance criteria are green.
