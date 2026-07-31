# Self-hosted / on-prem inference — deployment fragment

Readiness artifacts for the LocalAI / on-prem inference pilot
(`LOCALAI_ONPREM_INFERENCE_PILOT_PLAN_2026-07-30.md`). These advance readiness
**without a live GPU endpoint**; the actual GPU deployment and GxP model
validation (PQ) are deferred to staged, human-reviewed work.

## What's here

| File | Purpose |
|---|---|
| `docker-compose.localai.yml` | Names concrete self-hosted backends (vLLM generation + TEI embeddings) and the exact port/env wiring to the platform's existing gateway seams. A fragment — the GPU host, driver stack, pinned weights, and air-gap network policy are operator IQ work. |
| `.env.localai.example` | The env switches (`LOCAL_AI_BASE_URL`, `EMBEDDING_LOCAL_BASE_URL`, `EMBEDDING_PROVIDER=local`, `AI_PII_ENFORCEMENT=block`). These are the only wiring needed — the seams already read them. |

## The seams you are wiring (not building)

- **Generation:** `createLocalClient()` reads `LOCAL_AI_BASE_URL` / `LITELLM_BASE_URL` and returns an OpenAI-compatible client — `server/services/ai-gateway/providers/clients.ts`.
- **Placement / residency:** the `local` provider is `self_hosted` / `on_prem` / `zeroDataRetention: true`; an on-prem or ZDR request routes **only** here — `server/services/ai-gateway/providers/placement.ts`.
- **Embeddings:** `EMBEDDING_PROVIDER=local` + `EMBEDDING_LOCAL_BASE_URL` — `server/services/ai-gateway/embeddings/embedding-provider.ts`.

**Never** add a direct OpenAI/Anthropic client in application code — route through
the gateway `local` provider so audit, PII screen, and approved-models stay in
force (`scripts/ci/check-gateway-bypass.mjs` enforces this).

## Verify the wiring (no GPU needed)

Run the OQ routing-invariant check. It asserts on-prem/ZDR routes only to the
self-hosted substrate, and **skips the live probe cleanly** when no endpoint is
configured:

```bash
tsx server/eval/localai/oq-live-check.ts
# or, against a live endpoint:
LOCAL_AI_BASE_URL=http://vllm:8000/v1 tsx server/eval/localai/oq-live-check.ts
```

## The embedding-dimension caveat (deferred)

Seven corpora are 1536-d; `documentVectors` is **3072-d**
(`server/services/embedding-corpus-policy.ts`). The embedding seam reads a
**single** `EMBEDDING_LOCAL_BASE_URL` today, so a self-hosted embedding cutover
covers the 1536-d corpora only. Serving 3072-d on-prem — or moving a corpus to a
different dimension — needs the re-vectorization / dual-index work
(`server/services/revectorize-corpus.ts`, dry-run planner shipped; live migration
deferred). Until then, keep `documentVectors` on frontier embeddings (pilot plan
§4, Option A / Gate 1).
