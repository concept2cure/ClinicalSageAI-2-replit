# AnA SDK retry ownership and payload findings

Date: 2026-10-06 UTC. Branch: `concept2cure-v2`.

## Corrected behavior

The gateway controls primary/fallback retries, but its SDK clients were also
retrying independently. The installed Anthropic and OpenAI SDKs default to two
retries per request. Consequently, a streaming call whose gateway policy allows
one attempt could still issue three HTTP requests. Four non-streaming overload
attempts could issue twelve HTTP requests.

All gateway-owned client constructors now specify `maxRetries: 0`: OpenAI,
Anthropic, Moonshot, Azure, local, Bedrock, and Vertex. The gateway's existing
retry/backoff policy remains in force. No routing, model selection, governance,
prompt, stall deadline, or provider timeout changed.

## Red/green evidence

`gateway-sdk-retry-ownership.test.ts` runs real installed SDKs through the real
gateway route and dispatch code. Only HTTP fetch is replaced with in-process
responses; database calls use the existing test stub and timers are simulated.

Before the change, all six new tests failed:

- Streaming HTTP 500 and 429: primary SDK made three attempts instead of one.
  The test also checks the fallback's HTTP attempts.
- Non-streaming HTTP 500 recovery: the SDK hid the retry inside one gateway
  dispatch instead of letting the gateway make its intended second dispatch.
- Non-streaming overload: four gateway dispatches made twelve HTTP requests.
- Local and Azure factories: streaming HTTP 500 made three attempts instead of one.

After the change, **8 suites / 84 tests pass**, covering the new cases, the prior
streaming-fallback correction, aborts, stream stalls, retry policy, OpenAI
streaming, local tools, and general gateway behavior. This establishes retry
ownership and existing non-streaming recovery, not live response latency.
Bedrock/Vertex are configured consistently but were not exercised against
their optional SDKs or cloud services.

Evidence files: `sdk-retry-before.txt`, `sdk-retry-after.txt`, and
`new-file-lint.json` (new test and probe: zero errors, zero warnings).

Reproduction command, Node 22.16.0:

```sh
node node_modules/vitest/vitest.mjs run \
  server/services/ai-gateway/__tests__/gateway-sdk-retry-ownership.test.ts \
  server/services/ai-gateway/__tests__/gateway-fallback-stream-retry.test.ts \
  server/services/ai-gateway/__tests__/gateway-stream-stall.test.ts \
  server/services/ai-gateway/__tests__/gateway-abort.test.ts \
  server/services/ai-gateway/__tests__/retry-policy-529.test.ts \
  server/services/ai-gateway/__tests__/gateway-openai-stream.test.ts \
  server/services/ai-gateway/__tests__/local-provider-tools.test.ts \
  server/services/ai-gateway/__tests__/gateway.test.ts \
  --config vitest.config.ts
```

## Payload and routing measurements — unchanged in this pass

`payload-probe.mjs` calls the real pure persona, tool-selection, kernel-routing,
and model-tier helpers. It makes no model request or context retrieval.
`payload-measurements.txt` records the output. The probe supplies no project,
document, history, user pin, tenant policy hint, or explicit deep intent; it uses
Balanced effort, the auto intent lens, and the stream's six pinned navigation
tools. The real tenant tool policy can further reduce the available set.

Base persona: **53,601 characters**, approximately **13,401 tokens**.

| Message | Selected tools | Tool characters | Estimated persona + tool tokens |
| --- | ---: | ---: | ---: |
| hi / hello | 21 | 21,267 | 18,718 |
| open settings | 50 | 50,253 | 25,965 |
| go to biostatistics | 24 | 38,759 | 23,091 |
| run the sales demo | 50 | 59,405 | 28,253 |
| What is the page limit for a 510(k) summary? | 50 | 59,419 | 28,256 |

These token figures are **character-based estimates** (`ceil(string.length / 4)`
per component), not tokenizer measurements. They omit the additional
orchestration, project, route, memory, enrichment, and conversation-history
blocks; they are not an end-to-end input count or latency benchmark.

Every probe case resolves to `regulatory_review`, medium risk, standard model
tier. `kernel-router.ts` treats `/ana-ri` as a regulatory surface regardless of
message wording; `reasoning.ts` treats regulatory review as a heavy task. This
explains why the ordinary Balanced economy path does not apply to these cases.
No change to that policy is included here. Any future optimization should
preserve explicit pins, high-risk/open-section escalation, and governed-draft
approval and be validated with live timing before changing defaults.

Run from the repository root:

```sh
node --import tsx docs/evidence/D4/2026-10-06-ana-usability-pass2/gateway/payload-probe.mjs
```

## Context enrichment inspection

No awaited chat/completion model call was found in `enrichContextForChat` or its
project-summary, workflow, readiness, next-action/recommendation, and
cross-module dependencies. Those paths use database reads and deterministic
builders. Semantic memory retrieval is a separate path and can call an
embedding provider. The gateway's configured content classifier currently uses
heuristics; its SLM class also falls back to heuristics rather than making a
model request. These are code-path findings, not deployed telemetry.

The full repository typecheck was not repeated in this pass: the preceding
canonical attempt exhausted the available 8 GiB container. No baseline or gate
was changed.
