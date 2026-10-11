# AnA memory retrieval startup bounds — 2026-10-06

Workstream W3, launch row D4. Scope: `server/services/memory-context-assembler.ts`
and its focused deadline regression suite. No route, model, persona, memory
selection policy, working-memory helper, or governance changes.

## Defect and production path

Both `server/routes/ana-ri/stream.ts` and the shared
`server/services/ana/chat-context-builder.ts` await `buildMemoryContextForChat`
before calling the model. The assembler previously awaited working-memory recall
before starting independent client/project searches. Default recency recall had
no assembler deadline, so a stalled `getLatestWorkingMemoryByThread` held up all
three layers. Its PostgreSQL helper has a separate, much longer database timeout;
there was no three-second memory budget around this read.

The existing semantic timeout helper also left timers armed after success. Healthy
reads subsequently logged false timeouts. Client/project promises appended atoms
to shared state, which was unsafe once those reads could time out while another
layer was still pending. Timeout diagnostics did not produce a prompt notice, so
the model could receive an empty memory block when retrieval was unavailable.

## Change and limits

- Working memory and independent client/project retrieval begin together.
- Each read uses the existing `MEMORY_LAYER_TIMEOUT_MS = 3000` deadline. Default
  recency retrieval is bounded at three seconds. Opt-in semantic working-memory
  recall retains semantic-first selection followed by recency fallback; those two
  reads have separate deadlines, so that path can take up to six seconds. These
  are awaited retrieval bounds, not whole-turn or provider latency guarantees.
- Tenant/thread/project arguments, optional-input gates, semantic preference,
  recency fallback, orchestration/forgetting/deduplication policies, and formatting
  of successful memory items remain intact.
- Each read returns its own atoms and outcome. Only the result selected before its
  deadline is assembled. Late values cannot overwrite fallback selection, append
  atoms, or change returned diagnostics/read records. Late rejections are handled.
- Successful and failed reads clear their deadline timers. A fired timeout remains
  observable as `timeout`. A rejected read remains `error`. If semantic working
  memory times out or rejects and recency is empty, the layer remains unavailable,
  rather than claiming empty recall. A usable recency fallback remains `ok` with
  mode `recency_fallback`.
- Unavailable layer names and reasons are placed before memory content inside the
  existing prompt budget. The model is instructed not to infer that missing memory
  or prior decisions do not exist. This notice also exists when no usable atoms
  were returned; it is never reported as a recalled source in `read`.

The deadline stops waiting; it does not cancel underlying DB/embedding operations.
The working-memory helpers already catch some internal failures and return null or
an empty list. Those failures are still indistinguishable from legitimate empty
results to this assembler. This change does not claim to repair that pre-existing
helper contract. It faithfully reports deadlines and rejections visible here.

## Red/green evidence

The tests run the actual assembler and memory orchestrator with deterministic fake
timers and controlled source promises. No live DB/provider calls or user-session
latency measurements were performed, and no full local typecheck was run.

- `before-tests.txt`: 12 failed, 3 passed before changing production code. Failures
  demonstrate that recency blocks independent calls, an unresolved recency read
  prevents completion at three seconds, unavailable memory has no model notice,
  semantic timeout plus empty fallback is mislabeled empty, deadline timers survive
  success, and late independent results can be included after their intended budget.
- `after-tests.txt`: 5 suites, 69 tests passed. Includes 18 focused deadline tests,
  working-memory mode/metrics tests, existing assembler metadata/forgetting/budget
  tests, the orchestrator policy suite, and the turn-plan/context-used suite. Three
  optional-input/tenant gating cases were added after the red run.
- `before-lint.json`: assembler had zero errors and two warnings (function length
  and complexity). `after-lint.json`: assembler plus the new test file have zero
  errors and zero warnings. Helpers reduced the existing function's size.
- `git diff --check` passed. Evidence `.txt` and `.json` files are not ignored.

## Reproduction

From the repository root, using Node 22.16.0:

```sh
export PATH=/root/.npm/_npx/2ad0c2d1aba2dd61/node_modules/node/bin:$PATH
node node_modules/vitest/vitest.mjs run \
  server/services/__tests__/memory-context-assembler-deadline.test.ts \
  --config vitest.config.ts

node node_modules/vitest/vitest.mjs run \
  server/services/__tests__/memory-context-assembler-deadline.test.ts \
  server/services/__tests__/memory-context-assembler-mode.test.ts \
  tests/unit/memory-context-assembler.test.ts \
  server/services/__tests__/memory-orchestrator.test.ts \
  server/services/ana/__tests__/turn-plan-and-context.test.ts \
  --config vitest.config.ts

node node_modules/eslint/bin/eslint.js \
  server/services/memory-context-assembler.ts \
  server/services/__tests__/memory-context-assembler-deadline.test.ts \
  --format json
git diff --check
```

The red run used the first command with the original production file at
`d680b816` and the initial 15-test regression suite. The captured files preserve
that failure before the fix. Timings in the Vitest output are local test runtime;
the three/six-second assertions use a fake clock.
