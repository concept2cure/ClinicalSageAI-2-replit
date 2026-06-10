# AI substrate implementation map

What shipped for the LLM strategy (frontier / small / local AI), where it lives,
how to turn it on, and what is left to deepen. Companion to
`LLM_STRATEGY_BRIEF.md` (the why) — this is the what + how.

Everything routes through the one governed gateway
(`server/services/ai-gateway/`). The gateway is the single audited path; the
`check-gateway-bypass.mjs` CI gate stops new direct-client bypasses from growing.

## The five workstreams

### 1. Gateway convergence (enforcement)
- Already enforced by `scripts/ci/check-gateway-bypass.mjs` +
  `gateway-bypass-baseline.json` (fails on *new* direct `new OpenAI()` /
  `new Anthropic()` outside the gateway). New provider clients live **inside**
  `server/services/ai-gateway/providers/`, so they are in-scope of the gateway,
  not bypasses.
- Deepen: burn down the baselined bypass files (route them through `getGateway()`).

### 2. Private-cloud frontier providers (BAA / ZDR / residency)
- `providers/cloud-models.ts` — `CLOUD_MODELS` (Bedrock Opus+Sonnet, Vertex Opus,
  Azure GPT-4o, local) merged into `DEFAULT_MODELS`.
- `providers/clients.ts` — lazy client factories. Bedrock/Vertex use Anthropic's
  drop-in SDKs (same `messages.create()`), so they reuse the proven
  `executeAnthropic` path; Azure/local reuse `executeOpenAI`. No second code path.
- `providers/placement.ts` — per-provider substrate / region / ZDR registry.
- `gateway.ts` — provider union, config, client init, dispatch, and
  placement-aware selection all extended.
- `approved-models.ts` — cloud/local models pinned (drift gate stays green).
- **Deepest:** Bedrock (Claude), per the strategy. Vertex/Azure are wired and
  pinned; finish their regional model-id specifics when a deal needs them.
- **Install on a deployment that uses them:**
  `npm i @anthropic-ai/bedrock-sdk @anthropic-ai/vertex-sdk` (Azure/local use the
  installed `openai` SDK). If absent, the factory logs a hint and the substrate
  stays disabled — the build never hard-depends on them.

### 3. Local / air-gapped lane + self-hostable embeddings
- Chat: `local` provider (OpenAI-compatible vLLM/LiteLLM endpoint) via
  `LOCAL_AI_BASE_URL` / `AI_LOCAL_ENABLED`.
- Embeddings: `embeddings/embedding-provider.ts` — the OpenAI dependency that
  blocked offline RAG now has a self-hostable seam (`EMBEDDING_PROVIDER=local`,
  `EMBEDDING_LOCAL_BASE_URL`). Dimensions must match the corpus.
- Deepen: route `enhancedEmbeddingService.embed()` through
  `getEmbeddingProvider()` so the corpus-policy runtime gains the local lane.

### 4. ZDR + data-residency enforcement (audited)
- `GatewayRequest.dataResidency` + `.zeroDataRetention` are hard routing
  constraints: `selectModel` / `getFallbackModels` only consider compliant
  providers (never relaxed, even under provider failure).
- The audit ledger now records `substrate`, `region`, `retentionPolicy` per call
  (`AuditLogEntry` + `ai.gateway_audit_log` columns) — the evidence a
  residency/BAA-constrained tenant asks for.
- Deepen: a per-tenant default placement policy (org → required residency/ZDR)
  so callers don't pass it per request.

### 5. Specialist small models (owned)
- Classifier: `server/services/ai-governance/classification/` — working
  `HeuristicContentClassifier` (PHI/PII/regulatory, deterministic) closes the
  governance-contract gap today; `SlmContentClassifier` is the seam for a
  fine-tuned model, falling back to the heuristic until served.
- Embedder/reranker: training scaffold in `scripts/ml/`.
- Deepen: train + serve on the local lane (data + GPU, out of band).

## Quick enablement matrix

| Want | Set |
|---|---|
| Claude in your AWS account (BAA/ZDR) | `AI_BEDROCK_ENABLED=true` + AWS creds + `npm i @anthropic-ai/bedrock-sdk` |
| EU data residency | enable Vertex (`AI_VERTEX_*`) or local; request `dataResidency:'eu'` |
| Zero retention only | request `zeroDataRetention:true` (routes to private-cloud/local) |
| Air-gapped install | `AI_LOCAL_ENABLED=true` + `LOCAL_AI_BASE_URL` + `EMBEDDING_PROVIDER=local` |
| Higher-recall PHI/PII | `AI_CLASSIFIER_MODE=slm` + `AI_CLASSIFIER_SLM_URL` |

## Tests
- `providers/__tests__/placement.test.ts` — residency/ZDR compliance.
- `classification/__tests__/heuristic-classifier.test.ts` — PHI/PII/regulatory.
- `embeddings/__tests__/embedding-provider.test.ts` — provider selection.
- Existing `approved-models.test.ts` drift gate stays green (cloud models pinned).
