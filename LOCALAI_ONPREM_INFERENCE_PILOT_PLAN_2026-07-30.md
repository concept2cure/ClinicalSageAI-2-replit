# On-Prem / Air-Gapped Inference (LocalAI) — Pilot & Validation Plan

**Date:** 2026-07-30
**Status:** Draft for founder / quality review
**Companion to:** `OSS_AI_TOOLING_FIT_ASSESSMENT_2026-07-30.md` (LocalAI was the one tool rated a genuine pilot)
**Owner:** _TBD_ · **Quality reviewer:** _TBD_ · **Target environment:** _TBD (on-prem / VPC-isolated)_

---

## 1. Purpose & scope

**Goal:** Prove that Concept2Cure.RI can run **fully self-hosted, air-gapped LLM inference** (generation *and* embeddings) so that a tenant who **cannot send data to any third party** (PHI, strict data-residency) can still use the platform — with **zero regulated data leaving the deployment boundary** and **no loss of Part 11 governance** (audit trail, PII screen, approved-models gate, human-review/e-signature).

**This is a validated-deployment project, not a drop-in.** "LocalAI" is one interchangeable OpenAI-compatible backend behind a seam the platform **already has**; **vLLM, LiteLLM, TGI, and TEI are equally valid** (and generally higher-throughput) backends behind the same seam. The pilot validates *the on-prem inference capability*, and picks a concrete backend as an implementation detail.

**In scope:** self-hosted generation lane, self-hosted embedding lane, gateway/governance integration, residency/ZDR proof, quality eval, phased rollout gates.

**Explicitly OUT of scope for the pilot (hard gate):** the self-hosted model **must not** serve **high-risk regulatory drafting / submission content** until Performance Qualification (§8) passes. This mirrors the existing governance record: `approved-models.ts` → `local-default` → *"Pending per-deployment eval; not approved for high-risk regulatory drafting until evaluated against `server/eval/rag/`."*

---

## 2. The seam already exists (what you are NOT building)

| Concern | Existing seam | File |
|---|---|---|
| Generation client | `createLocalClient()` reads `LOCAL_AI_BASE_URL` / `LITELLM_BASE_URL`; returns an OpenAI-compatible client | `server/services/ai-gateway/providers/clients.ts:111` |
| Placement / residency | `local` provider is hardcoded `substrate: self_hosted`, `regions: ['on_prem']`, **`zeroDataRetention: true`**; residency `on_prem` must route to `self_hosted` | `server/services/ai-gateway/providers/placement.ts:115` |
| Governance record | `local-default` approved-models entry (pinned, with rationale + `evalReference`) | `server/services/ai-governance/approved-models.ts:174` |
| Embedding lane | `EMBEDDING_PROVIDER=local` + `EMBEDDING_LOCAL_BASE_URL`; OpenAI `embeddings.create` shape; honors requested `dimensions` | `server/services/ai-gateway/embeddings/embedding-provider.ts:132` |
| Corpus↔dimension policy | Single source of truth for which model/dimension each corpus uses | `server/services/embedding-corpus-policy.ts` |
| PII/PHI screen | Enforced at the gateway; block mode via `AI_PII_ENFORCEMENT` | `server/services/ai-gateway/pii-screen.ts` |
| Audit capture | SHA-256-chained, HMAC-sealed audit trail | `server/services/auditService.ts` |

**Non-negotiable integration rule:** route **only** through the gateway's `local` provider. **Never** add a new direct `new OpenAI({ baseURL })` in application code — that would trip `scripts/ci/check-gateway-bypass.mjs` and escape the audit/PII/approved-models controls.

---

## 3. Two independent lanes — validate both

On-prem inference is **two** deployments, and they fail independently:

1. **Generation lane** (chat/completions) — comparatively easy. Any OpenAI-compatible server (vLLM/LiteLLM/LocalAI) serving an open-weight chat model wired to `LOCAL_AI_BASE_URL`.
2. **Embedding lane** — **the hard part.** See §4.

---

## 4. The embedding-dimension problem (the crux)

The embedding local lane preserves the dimension contract **only if the deployed model's output dimension matches the target corpus**. Your corpora are **not uniform**:

| Corpus | Dimension | Purpose |
|---|---|---|
| `documentVectors` | **3072** | Primary eCTD/CER/510(k) body retrieval |
| `ragChunks` | 1536 | Hot-path AnA chat / AnA-RI |
| `knowledgeEntries` | 1536 | Knowledge base |
| `clientMemoryEntries` | 1536 | Client long-term memory |
| `projectMemoryEntries` | 1536 | Per-submission memory |
| `accountCanonItems` | 1536 | Canonical account items |
| `biostatKnowledgeNodes` | 1536 | Biostat knowledge |
| `vaultDocumentChunks` | 1536 | Vault semantic search |

**7 corpora at 1536-d, 1 at 3072-d.** A single common open embedding model won't natively match both — and many popular ones (e.g. `bge-large-en-v1.5` = **1024-d**) match **neither**. There is **no dual-index / re-embedding migration tooling in the repo**, so this must be handled deliberately. Options, in order of recommendation:

- **Option A — Two local embedding models (recommended).** Deploy one model outputting **1536-d** (serves 7 corpora) and one outputting **3072-d** (serves `documentVectors`). No re-vectorization; the corpus policy is unchanged. Requires two model endpoints (or one server with two model ids) and confirming each model emits an **exact, stable** dimension. *Lowest data-migration risk.*
- **Option B — One local model + re-provision the 3072-d corpus down to the model's dimension.** Pick one local model, set all corpora to its dimension, and **re-embed `documentVectors`** (the large one). Requires building the missing re-vectorization migration + a dual-read window; retrieval quality on the primary submission corpus must be re-qualified. *Highest effort/risk — avoid unless Option A is infeasible.*
- **Option C — Matryoshka-capable model** that supports the `dimensions` param to emit both 1536 and 3072 from one deployment. Elegant if a validated open model exists; verify the truncated vectors actually pass the quality eval at *both* dimensions, not just that the server accepts the param.

**Decision required before any embedding cutover.** Until then, the pilot can run **generation-only** against the existing (frontier) embeddings, deferring the embedding lane — but a *fully* air-gapped tenant needs the embedding lane solved, so it can't ship air-gapped on generation alone.

---

## 5. GAMP-5 risk framing

- **Inference server (LocalAI/vLLM + gateway wiring):** GAMP **Category 3–4** (COTS / configured). Validate via IQ/OQ — it either serves the API correctly and stays inside the boundary, or it doesn't.
- **Model outputs used for regulated content:** the platform already constrains model output to **untrusted drafts behind human review + groundedness gates**, and a **human** applies the §11.200 e-signature — the model never signs. So the residual Part 11 risk is *quality/fitness-for-purpose*, addressed by **PQ** (§8), not by trusting the model directly.
- **Highest inherent risk:** (a) data egress (residency) — mitigated by air-gap proof (§7 OQ); (b) silent retrieval degradation from an embedding-dimension mismatch — mitigated by §4 + §8.

---

## 6. Requirements (URS/FRS) → acceptance

| # | Requirement | Acceptance evidence |
|---|---|---|
| R1 | No regulated data leaves the deployment boundary during inference | Network-egress capture during OQ shows only intra-boundary traffic; `placement.local.zeroDataRetention === true` enforced |
| R2 | All local inference routes through the gateway (audit + PII + approved-models) | `check-gateway-bypass.mjs` green; audit rows present for each call; no direct client in app code |
| R3 | PII/PHI screen active on the local lane | `AI_PII_ENFORCEMENT=block`; PII-screen test cases blocked as expected |
| R4 | Concrete model registered & pinned in governance | New `approved-models.ts` entry with pinned version, model card, `evalReference` to the executed PQ |
| R5 | Embedding dimensions match every target corpus | `check-embedding-runtime-canonicality.mjs` green; insert tests succeed for 1536-d and 3072-d corpora |
| R6 | Generation quality ≥ agreed threshold vs. frontier baseline | PQ eval results (§8) meet thresholds |
| R7 | Retrieval quality preserved on local embeddings | RAG eval (recall@k / faithfulness) within tolerance of frontier baseline |
| R8 | Rollback path proven | Documented + rehearsed rollback (§10) |

---

## 7. IQ / OQ

### Installation Qualification (IQ)
- [ ] Inference server deployed inside the isolated boundary (on-prem host / air-gapped VPC subnet); egress to public internet **blocked** at the network layer.
- [ ] `LOCAL_AI_BASE_URL` (and `EMBEDDING_LOCAL_BASE_URL` if embedding lane) point to the intra-boundary endpoint over TLS; `LOCAL_AI_API_KEY` set (even if the server ignores it).
- [ ] Model weights provisioned from an integrity-verified source (SHA-256 recorded); versions pinned.
- [ ] Server, driver/CUDA, and model versions recorded in the IQ record.

### Operational Qualification (OQ)
- [ ] **Gateway routing proof:** a request with residency `on_prem` / ZDR-required is placed on `provider: local` (assert against `placement.ts`), and a non-local request never routes to `local`.
- [ ] **Air-gap proof (R1):** packet/flow capture during a batch of inference calls shows **no** traffic leaving the boundary; attempt to reach a frontier provider fails closed.
- [ ] **Bypass gate green (R2):** `node scripts/ci/check-gateway-bypass.mjs` passes; grep confirms no new direct client instantiations.
- [ ] **Audit capture (R2):** each local call produces an audit-trail entry (`auditService.ts`); chain verification (`npm run audit:verify:24h`) passes.
- [ ] **PII enforcement (R3):** with `AI_PII_ENFORCEMENT=block`, seeded PII/PHI inputs are blocked on the local lane exactly as on frontier lanes.
- [ ] **Embedding canonicality (R5):** `check-embedding-runtime-canonicality.mjs` green; a 1536-d corpus insert and a 3072-d (`documentVectors`) insert both succeed with the deployed model(s).

---

## 8. Performance Qualification (PQ) — the go/no-go for regulated use

Run **before** the model is allowed to serve any high-risk task. Use the existing harnesses:

- **Generation quality:** `server/eval/doc-quality/` — score local-model output against the frontier baseline on representative regulatory drafting tasks. **Acceptance threshold to be agreed with quality (proposed: within X% of baseline on faithfulness/groundedness; no regression on hallucination-suppression).**
- **RAG / retrieval quality:** `server/eval/rag/` — recall@k, citation faithfulness, and answer groundedness on local embeddings vs. frontier embeddings, per corpus (especially `documentVectors` 3072-d and `ragChunks` 1536-d).
- **Latency/throughput:** record p50/p95 tokens/sec and embedding throughput at expected concurrency; confirm it meets interactive-use SLAs.
- **Determinism/repeatability:** fixed-seed / temperature-0 runs produce stable results for the eval set.

**PQ pass → update `approved-models.ts`** entry's `evalReference` from "Pending" to the executed eval artifact, and lift the high-risk restriction for the qualified task classes only.

---

## 9. Phased rollout gates

1. **Gate 0 — Generation-only, internal.** Local generation lane for **non-regulated / internal** use; embeddings stay frontier. Proves IQ/OQ for generation.
2. **Gate 1 — Embedding lane qualified.** §4 decision executed; R5/R7 met; canonicality + retrieval eval green.
3. **Gate 2 — Air-gapped tenant, non-high-risk tasks.** A residency-constrained tenant runs local end-to-end for non-high-risk task classes only; `AI_PII_ENFORCEMENT=block` on.
4. **Gate 3 — High-risk drafting.** Only after PQ (§8) passes and the governance entry is updated. Human review + e-signature remain mandatory.

Each gate is a signed record; no gate is skipped.

---

## 10. Rollback

- The gateway keeps frontier providers configured; **unset `LOCAL_AI_BASE_URL` / set `EMBEDDING_PROVIDER=openai`** to revert generation/embeddings to frontier within one deploy.
- If embeddings were cut over (Option B/C), retain the pre-cutover vectors (or the dual-read window) until Gate 1 is signed off, so retrieval can revert without data loss.
- Rehearse the rollback during OQ and record the result (R8).

---

## 11. Deliverables & traceability

- Validation Plan (this doc, approved) · IQ record · OQ record · PQ eval report · updated `approved-models.ts` entry + **model card** · §4 embedding-dimension decision memo · rollback rehearsal record · requirements→evidence traceability matrix (R1–R8).

---

## 12. Open decisions for the founder / quality

1. **Backend choice:** LocalAI vs **vLLM/LiteLLM** (throughput) vs **TGI/TEI**. Recommend vLLM (generation) + TEI (embeddings) for performance; LocalAI is fine for a first functional pilot.
2. **Embedding strategy:** confirm **Option A (two models, no re-vectorize)** unless a validated Matryoshka model (Option C) is preferred.
3. **PQ thresholds:** quality bar for "good enough to serve regulated drafting" — the single most consequential number in this plan.
4. **Target model(s):** which open-weight chat + embedding models, pinned to which versions.
5. **First tenant / environment** for Gate 2.

---

*This plan reuses seams that already exist in the codebase; it does not propose new ungoverned infrastructure. All file references current as of the date above.*
