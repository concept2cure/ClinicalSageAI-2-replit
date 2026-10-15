# W3 / D4 orphan-sweep backpressure regression evidence

The actual stream route starts an opportunistic estate-wide orphan sweep after each durable run opens (`server/routes/ana-ri/stream.ts`). Overlapping starts previously issued overlapping identical UPDATE statements against the same pool. This batch tests the actual exported `reapOrphanedRuns` service, using deferred pool responses and the real tenant AsyncLocalStorage implementation. It changes no client files or existing test cases.

## Fail first

- Base HEAD: `0b8a8c3dfd6166286e085de59e13b1217cb17dee`.
- Unchanged production blob: `2567b41d4b096daf53b30b9e7c6fb1860bee7376`.
- Initial tenant-file test blob for fail-first and initial green runs: `d6fb2fbdeefdf7f894ceda6fe7e1fb8b64ac984e`.
- `red.txt`: exit 1; seven failures and seven passes, fourteen total cases. Five cases predate this batch; nine are added.
- The principal failure observed twenty actual query invocations for twenty overlapping calls, where the new admission contract requires one. Shared rejection, synchronous failure, same-rounded threshold, nullable count, cross-tenant sharing and reentrant admission also failed on old production. Independent pools and distinct SQL thresholds already passed.
- All controlled reads are settled before failing assertions. Rejections are observed with `Promise.allSettled`; the run reported no unhandled errors.

## Initial green and related checks

- Final production blob: `c0893907be9c17b8b3e66aa0e61194a07ff38f14`.
- `green.txt`: exit 0; fourteen of fourteen pass.
- `related-green.txt`: exit 0; thirty-six of thirty-six pass across the existing run-control loop tests, tenant-scope file and poll/notification backpressure file.
- `eslint.txt`: forced uncached ESLint for the edited test file; exit 0, zero errors, zero warnings and no suppressed messages. The runtime emitted its existing experimental proxy-agent notice.
- Each verdict JSON records the actual command, elapsed time and source/test blobs. Node 22.23.3 ran the repository's unchanged Vitest configuration.

## Final test placement and requalification

The same nine added cases and their helpers were relocated into the existing `run-control-poll-backpressure.test.ts`, grouping sweep admission with the existing poll and notification admission tests. The nineteen preexisting backpressure cases remain unchanged. The tenant-scope file was restored byte-for-byte from HEAD, preserving its five original cases. No test roots, cases, baseline, rule or gate were added or removed by relocation. `test-relocation.json` records this adjustment; the initial fail-first and green transcripts remain truthful historical evidence.

- Final backpressure test blob: `ff77bcaa986fe6c907cb1158c7f32df6780408d8`.
- Restored unchanged tenant-scope blob: `07be1eca9253b0e2c8d5c8ef3eb2a6aaa2088d28`.
- Production remains `c0893907be9c17b8b3e66aa0e61194a07ff38f14`.
- `final-green.txt`: exit 0; twenty-eight of twenty-eight pass in the final backpressure file.
- `final-related-green.txt`: exit 0; thirty-six of thirty-six pass across the same three existing test files.
- `final-eslint.txt`: forced uncached ESLint for both test files; exit 0, zero errors, zero warnings and no suppressed messages.
- Final verdict JSON files pin all three files, actual commands and elapsed times. Their contents remained unchanged through final requalification.

## Contracts exercised

1. Twenty overlapping sweeps issue one query, all callers observe that query's count, and a later call issues a fresh sweep.
2. Calls from three tenant contexts share work; actual query execution observes the system tenant, super-admin role and `ana-run-control:reap` caller.
3. A shared asynchronous rejection reaches every caller, then retry succeeds with a fresh query.
4. A synchronous pool throw is shared and does not strand admission.
5. Separate pools retain independent queries and results.
6. Different effective SQL thresholds retain separate queries and unchanged parameters.
7. Different millisecond values that round to the same existing SQL threshold share pending work.
8. Nullable row counts still resolve as zero; settlement does not cache that result for a later call.
9. A pool callback that synchronously reenters the exported sweep joins the already registered admission, rather than starting a second query.

## Read-only implementation review and limits

The private WeakMap isolates database pools; its nested Map isolates effective SQL thresholds. Admission is installed before query invocation in a microtask. SQL, live-state predicates and explicit system scope remain unchanged. The returned cleanup chain propagates genuine failures while removing settled admission; it creates no unobserved rejected cleanup promise. Each qualification phase pins the source and test blobs it actually exercised; final blobs were unchanged throughout final green, related tests and forced ESLint. No material issue was found within this scope.

The bound applies to overlapping identical sweeps within one process and pool; it does not cancel already-issued queries or coordinate processes. Different thresholds deliberately remain independent. This is pending-work sharing without a result TTL, new timer, new dependency or new capability. Fake pools establish query admission and scope, not PostgreSQL execution, indexing, production latency or deployment readiness. Existing PGlite coverage of actual reaper row transitions remains part of the lead session's broader qualification. No compiler, build, cache writer or live database/provider action ran in this scoped session.
