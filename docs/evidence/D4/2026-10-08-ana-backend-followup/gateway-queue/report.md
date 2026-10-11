# W3 / D4 — cancellation while awaiting outbound model capacity

Scope: backend gateway admission only. No client or UI files, models, tools,
dependencies, caches, capacity defaults, rate limits or governance rules change.

## Reproduction

Baseline: `f1b00425afd21fa4573201910c626a3d2f33cca6` on
`concept2cure-v2`, Node `v22.23.3`.

`AIGateway.executeProvider` routes every primary, fallback and evaluation call
through its process-local `Semaphore`. The semaphore used to queue only permit
callbacks, with no caller signal. A stopped run therefore remained queued until
another call finished, then reached provider dispatch despite being canceled.
There is no separate tenant semaphore in this gateway; tenant rate buckets are
governed independently by the existing policy engine.

The real-route reproduction holds one provider dispatch at a concurrency cap of
one, then starts a second run in an ambient tenant scope. Once the second route
has reached the real limiter, its controller aborts. It must settle as
`GatewayAbortedError` with phase `pre_call` while the first call remains held,
without dispatch, retry, fallback, provider-health failure or a fabricated served
ledger entry. A later request from another tenant must receive the released
permit and retain its own ledger attribution.

Only the outbound network call is stubbed. The gateway's tenant defaults,
selection, configured policy, placement, tool governance, real semaphore,
retry/fallback flow and audit-buffer writer remain in the exercised route. The
existing unit-test setup supplies its normal database stub. Audit assertions
verify the real in-memory audit buffer, not SQL persistence. The output retains
the audit-store warnings; this is not a live-provider, real-database or browser
qualification.

## Fail-first evidence

`red.txt`: **8 failed / 2 passed across 2 files**, captured before production
source edits. Both gateway cases (default and custom abort reasons) failed
because the canceled route remained pending while the active call held capacity.
Semaphore cases also failed for pre-aborted callers, queued settlement, the
permit-handoff microtask, removal of canceled FIFO waiters and abort-listener
cleanup. The controls for an active callback holding its permit until completion
and release after a throwing callback already passed.

The tests subsequently received a Node built-in import for lint and stronger
behavioral capacity checks after cancellation; production was still unchanged
during that cleanup. No suppressions or warning-baseline changes were made.

## Final qualification

The root-owned repair passes the caller signal into the existing limiter,
removes canceled waiters and their listeners, and checks cancellation after
permit handoff inside the release-protected block. Running callbacks retain
their permit until they actually settle. Gateway abort normalization reports
`pre_call` before dispatch and retains `in_flight` for active-provider failures.
No capacity or governance configuration changes.

`green-focused.txt`: **10 passed across 2 files**, 2.07 seconds.

`green.txt`: **121 passed across 11 files**, 10.35 seconds. This includes the
focused cases rather than adding them twice. Both runs used Node `v22.23.3` and
the repository's existing `vitest.config.ts`, against the repaired working tree
on the baseline above. `source-hashes.txt` identifies the exact files tested.

| Test file in `server/services/ai-gateway/__tests__/` | Passed | Coverage |
| --- | ---: | --- |
| `concurrency-abort.test.ts` | 8 | Pre-abort, queued settlement, handoff, FIFO, permit balance, listener cleanup, active and throwing callbacks |
| `gateway-queued-abort.test.ts` | 2 | Real route; default/custom abort reasons; no dispatch, fallback, health failure or fabricated served buffer row; next tenant served |
| `gateway-abort.test.ts` | 10 | Existing pre-call and active SDK abort, partial streamed text, terminal cancellation and provider health |
| `gateway.test.ts` | 37 | Core routing, configured policy, deterministic behavior, health and audit behavior |
| `gateway-model-governance.test.ts` | 15 | Approved-model selection and high-risk admission |
| `tenant-placement-boundary.test.ts` | 22 | Tenant placement defaults, explicit/ambient binding and last-mile refusal |
| `tenant-capacity.test.ts` | 9 | Tenant rate buckets and refusal audit attribution |
| `gateway-sdk-retry-ownership.test.ts` | 6 | Gateway ownership of SDK retries |
| `retry-policy-529.test.ts` | 8 | Overload and hard-error retry classification |
| `gateway-fallback-stream-retry.test.ts` | 3 | Streaming and non-streaming fallback retry budgets |
| `sensitive-placement-integration.test.ts` | 1 | Production sensitive-placement refusal prevents provider invocation |

An independent read-only review found no material race or assertion defect in
the new tests. The handoff case uses the holder promise's reaction order to
abort after release but before the newly admitted callback. Concurrent follow-up
callbacks check for both extra permits and lost capacity. The prompt-settlement
assertions use an event-loop checkpoint while the holder is still blocked, not
a production latency claim.

## Commands

Use the canonical Node 22 directory at the front of `PATH`:

```sh
PATH=/root/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH
NODE_OPTIONS=--max-old-space-size=4096 node node_modules/vitest/vitest.mjs run --config vitest.config.ts \
  server/services/ai-gateway/__tests__/concurrency-abort.test.ts \
  server/services/ai-gateway/__tests__/gateway-queued-abort.test.ts
node node_modules/eslint/bin/eslint.js --no-ignore --max-warnings=0 \
  server/services/ai-gateway/__tests__/concurrency-abort.test.ts \
  server/services/ai-gateway/__tests__/gateway-queued-abort.test.ts
```

The 121-case qualification uses the same Vitest command with all eleven table
entries passed as explicit file arguments; no full-suite scan was run here.

`eslint.txt` records exit 0: both new test files have **0 errors / 0 warnings**.
The process-level Undici experimental notice is not an ESLint finding.
`diff-check.txt` records a clean `git diff --check`. Build, compiler, production
source lint, pre-push gates and publication belong to the root delivery record.
