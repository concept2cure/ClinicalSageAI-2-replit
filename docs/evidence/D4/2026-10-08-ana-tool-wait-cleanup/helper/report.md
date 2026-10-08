# Tool cancellation wait cleanup — helper evidence

Fixed W3 / D4 backend scope. Base: `b0b1694aa00ee991b6792edab530f9fa59f1df93` on `concept2cure-v2`. Owned production change: the existing `abortRace` helper in `server/services/ana/agentic-loop.ts`; owned direct regression: `server/services/ana/__tests__/tool-wait-cleanup.test.ts`. Caller wiring and actual SSE/non-SSE evidence are separate scopes.

## Reproduction

On the unchanged base helper, a completed tool race left its abort listener attached to a still-live run signal. Sixteen successful tools retained 1 through 16 listeners and triggered Node's native MaxListenersExceededWarning. A rejected handler retained one listener, and a completed sibling retained its listener alongside the active and unrelated listeners. The fail-first direct suite had **4 failed / 5 passed**. `red.txt` preserves this run. This proves retention during a live run; it does not assert that every completed run is permanently retained.

The direct harness starts work before constructing the cancellation promise and uses optional disposal so the baseline reports the retained listener, rather than failing with a missing-method call. A separate capability assertion fails because the baseline has no disposer. The final regression additionally checks that the returned value is a native Promise. The baseline helper SHA-256 was `4c5990a97ec9d59143e46913d4c7f9228285ebef7c5211631885bf0f82ef7216`.

## Repair and preserved behavior

`abortRace` now returns a native `Promise<never>` with an idempotent `dispose()` method. Disposal removes only that wait's listener, and neither settles the promise nor aborts the shared signal. Actual abort disposes its listener and rejects with the unchanged `ToolRunCancelled` class. Pre-aborted signals register no listener; no-signal waits remain pending. Both production callers must dispose their own wait in `finally` after the handler race; the root-owned caller diff preserves work-first construction and the existing run/generation scopes.

The direct tests cover repeated success, genuine handler failure, synchronous invocation ordering, unrelated and active sibling listener isolation, idempotent disposal, native Promise compatibility, pre-abort, no-signal behavior and observed late handler rejection after Stop. Cancellation still abandons waiting; this repair does not undo handler side effects or add a cancellation capability.

## Validation

Runtime: Node **22.23.3**, Vitest **4.1.7**. Initial helper green: **9/9**, `helper-green.txt`. Final focused qualification: **49/49 across four files**, `related-green.txt`:

- `server/services/ana/__tests__/tool-wait-cleanup.test.ts`
- `server/services/ana/__tests__/tool-run-cancelled.test.ts`
- `server/services/ana/__tests__/agentic-loop-cancel-entries.test.ts`
- `tests/services/agentic-loop.test.ts`

Commands, with the Node 22 directory first in PATH:

```sh
node node_modules/vitest/vitest.mjs run server/services/ana/__tests__/tool-wait-cleanup.test.ts --config vitest.config.ts
node node_modules/vitest/vitest.mjs run server/services/ana/__tests__/tool-wait-cleanup.test.ts server/services/ana/__tests__/tool-run-cancelled.test.ts server/services/ana/__tests__/agentic-loop-cancel-entries.test.ts tests/services/agentic-loop.test.ts --config vitest.config.ts
node node_modules/eslint/bin/eslint.js server/services/ana/agentic-loop.ts server/services/ana/__tests__/tool-wait-cleanup.test.ts --format json
```

Forced lint before and after: **0 errors / 0 warnings** for both files (`eslint-before.json`, `eslint-final.json`). Native environment proxy notices occur in the test/lint process; the retained-listener warning appears on red and is absent from green. Build, broader qualification and publication gates belong to the root delivery record.

Final helper/direct-test hashes at source freeze:

| File | SHA-256 |
| --- | --- |
| `server/services/ana/agentic-loop.ts` | `39271dd8d2e88e6158531d7947e34e13bdd10242ea3393ad478b1adcb0d90d43` |
| `server/services/ana/__tests__/tool-wait-cleanup.test.ts` | `e83ed28a4c9df5e0f9d13ca9e182e3c68b23771ea3251ef5a2fc741ca12fa4b2` |

No edits to client/UI, dependencies, gates, baseline configuration or cancellation result messages. No commit or push was performed in this scope.
