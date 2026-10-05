# S5c (1) — the model egresses beside gateway.route() refuse in a sub-agent's scope (row 74, brief §9)

A sub-agent's tools run inside the model-call refusal scope
(`ai-gateway/model-call-scope.ts`). The scope was enforced only at
`gateway.route()`. Three paths reach a model without going through `route()`:

| Path | How it reached a model |
|---|---|
| `AIProviderRouter.route` | the LiteLLM branch (`LiteLLMAdapter.execute`) when LiteLLM is enabled |
| `CrossEncoderReranker.score` | a direct `fetch` to Cohere or Voyage |
| `AdvancedRAGPipeline.routeCached` | a cache **hit** returns model output with no call at all |

No `RESEARCH_TOOLS` path reaches them today. That holds only because
`project_knowledge_search`'s model-free mode sets `useReranking: false` and
`strategy: 'basic'`. A regression in either branch, or a future child tool that
calls the RAG router with defaults, would have reached a model silently and
unbudgeted. Each path now refuses on its own, before anything is sent or
served, with the gateway's own `SubAgentToolModelCallError`. That error is
terminal, and it is thrown outside the router's provider-failure handling, so
it never counts against a provider's health.

## Change

- `model-call-scope.ts`: `refuseModelCallHere(where)` is one helper. It loads
  the gateway's error class only when it refuses, because the gateway imports
  this module.
- One call at the top of each of the three paths. The reranker's caller
  already keeps the embedding order when a reranker throws.
- These files stay in `scripts/ci/gateway-bypass-baseline.json`: the guards
  do not route them through the gateway, they only refuse inside the scope.
  `ci:gateway-bypass` passes (8 baselined sites, unchanged).

## Verification

- `red.txt`: on the unchanged tree all three paths reached the model inside
  the scope (3 red). The three outside-the-scope controls passed.
- `mutations.txt`: 5 mutations, all red:
  - each guard removed;
  - the cache guard moved after the hit lookup;
  - the helper never refuses.
- `green.txt`: the new test plus the router, reranker, RAG cache,
  tenant-cache-key and model-call-scope suites: 8 files, 62 tests.

## Still disclosed, not guarded

- Embeddings are not refused (retrieval needs them).
- `gateway.evaluateModel` calls a provider without `route()`. Its callers are
  confined to `server/eval/pq` by `check-pq-evaluation-callers.mjs`, and no
  tool reaches it.
