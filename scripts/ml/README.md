# Specialist small-model training (scaffold)

This directory is the training-harness home for the platform's **owned small
models** — the specialist models the LLM strategy calls for building (rather
than a foundation model). They are deliberately small (≤ 8B), so they:

- run cheaply on the **self-hosted / local lane** (vLLM + LiteLLM, the same
  substrate that serves air-gapped tenants — see
  `server/services/ai-gateway/providers/`), and
- ship into an on-prem install alongside the rest of the stack.

> Status: **scaffold.** Training requires data + GPU and is run out-of-band, not
> in CI. The runtime *seams* these models plug into already exist and degrade to
> safe baselines until a model is served:
>
> | Model | Runtime seam | Baseline until trained |
> |---|---|---|
> | PHI/PII/Regulatory classifier | `server/services/ai-governance/classification/` (`AI_CLASSIFIER_MODE=slm`, `AI_CLASSIFIER_SLM_URL`) | `HeuristicContentClassifier` (deterministic) |
> | Regulatory embedder | `server/services/ai-gateway/embeddings/embedding-provider.ts` (`EMBEDDING_PROVIDER=local`, `EMBEDDING_LOCAL_MODEL`) | OpenAI `text-embedding-3-*` |
> | Regulatory reranker | `server/services/rag-reranker.ts` (existing cross-encoder seam) | LLM-as-judge reranker |

## 1. Regulatory embedder / reranker (highest ROI owned model)

A domain-tuned embedding + reranker lifts retrieval accuracy — the platform's
core differentiator — and removes the OpenAI embedding dependency that blocks
air-gapped RAG.

- **Base:** an open-weight embedding model (e.g. `bge-large-en-v1.5`, `gte-large`,
  or `e5-large-v2`) sized to match the corpus dimension in
  `server/services/embedding-corpus-policy.ts` (1536d / 3072d).
- **Data:** the platform's CSR / guidance / rejection-pattern corpus, mined into
  (query, positive-passage, hard-negative) triples.
- **Recipe:** contrastive fine-tune (sentence-transformers / `InfoNCE`), then a
  cross-encoder reranker on the same pairs.
- **Eval:** reuse `server/eval/rag/` (faithfulness / retrieval hit-rate) as the
  acceptance gate; the model is not approved for production until it beats the
  OpenAI baseline on that suite.
- **Serve:** Text-Embeddings-Inference or vLLM behind an OpenAI-compatible
  `/v1/embeddings` endpoint; point `EMBEDDING_LOCAL_BASE_URL` at it.
- **Config:** see `regulatory-embedder.config.json`.

## 2. PHI/PII/Regulatory classifier

A small sequence classifier that raises recall over the heuristic baseline.

- **Base:** a small encoder (e.g. DeBERTa-v3-small / a 1–3B decoder with a
  classification head).
- **Labels:** `phi`, `pii`, `regulatory`, `public` (multi-label) — matching
  `server/services/ai-governance/classification/types.ts`.
- **Data:** synthetic + de-identified spans; never train on live PHI.
- **Serve:** behind a `/classify` endpoint; point `AI_CLASSIFIER_SLM_URL` at it
  and set `AI_CLASSIFIER_MODE=slm`. The runtime takes the **union** of the SLM
  result and the heuristic so structured-identifier precision is never lost.

## Governance

Any model promoted to production must be pinned in
`server/services/ai-governance/approved-models.ts` (for chat/reasoning models)
or recorded against its eval reference, exactly like the frontier models — the
drift gate and model-card generation apply equally to owned models.
