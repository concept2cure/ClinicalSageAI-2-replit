# AnA streaming fallback retry correction

Date: 2026-10-06 UTC. Branch: `concept2cure-v2`.

## Defect and change

`AIGateway.route` correctly disabled retries for the primary streaming model,
but passed a hardcoded retry count of `1` for fallback models. A failed streaming
fallback therefore ran twice before the next model was tried. In particular,
`GatewayStreamStalledError` has no HTTP status and was considered retryable:
a fallback silent through the five-minute working deadline could spend that
deadline again. This compounds latency on degraded provider paths; it is not
evidence that this was the cause of a particular deployed request.

The fallback now uses the same resolved retry budget as the primary. Streaming
gets one attempt per model; ordinary non-streaming transient failures still get
their existing retry. Overload policy, selection, governance, provider timeout,
abort handling, and audit behavior are unchanged.

## Reproduction and verification

The new `gateway-fallback-stream-retry.test.ts` exercises the real gateway route,
retry loop, and provider dispatch wrapper, with provider I/O replaced. It covers:

- Streaming fallback receiving a transient HTTP 500: one dispatch, no replay.
- Streaming fallback ending with `GatewayStreamStalledError`: one dispatch, no replay.
- Non-streaming fallback receiving a transient HTTP 500: retry still recovers.

Before the production change, both streaming cases failed with **2 fallback
dispatches instead of 1**; the non-streaming case passed. `retry-before.txt`
captures this failure. Afterward, the new tests and the existing stream-stall,
abort, and overload retry suites all passed: **4 files, 29 tests**.
`retry-after.txt` captures the result.

Command (Node 22.16.0):

```sh
node node_modules/vitest/vitest.mjs run \
  server/services/ai-gateway/__tests__/gateway-fallback-stream-retry.test.ts \
  server/services/ai-gateway/__tests__/gateway-stream-stall.test.ts \
  server/services/ai-gateway/__tests__/gateway-abort.test.ts \
  server/services/ai-gateway/__tests__/retry-policy-529.test.ts \
  --config vitest.config.ts
```

No live provider or database was used. Timers are simulated and the stall test
supplies the gateway's stall error; these results establish retry behavior,
not deployed response-time measurements.

## Stream integrity review

The existing provider stream executors return partial text on interruption,
rather than throwing into the fallback chain; classifier declines after text
are terminal. This correction is limited to the inconsistent fallback retry
budget. It does not add a new fallback or alter partial-answer handling.
