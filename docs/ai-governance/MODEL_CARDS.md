# Model cards — Concept2Cure AnA

> Generated from the gateway model registry + the approved-models lockfile by
> `scripts/ai-governance/generate-model-cards.ts`. Do not edit by hand.

## Governance posture

- **Single gateway.** All governed AI calls route through `server/services/ai-gateway`, which records model, prompt hash, prompt version, temperature, seed, and the fallback chain for every request.
- **Version pinning.** Each model is pinned to an exact provider version in `server/services/ai-governance/approved-models.ts`. A model cannot be swapped without updating that lockfile.
- **Drift gate.** A regression test compares the live registry against the lockfile and fails on any unreviewed model swap, so the gateway fallback law cannot silently change the validated model set.
- **Human oversight.** Generated claims carry a groundedness score; below a capability's threshold, content is gated for human review before approval (`server/services/ai-governance/review-policy.ts`).
- **Eval evidence.** Retrieval/faithfulness via `server/eval/rag/`; per-document-type accuracy is the active follow-up (not yet measured).

_Models documented: 16. Generated for review; not a substitute for executed validation protocols._

---
## gpt-4o

- **Provider:** openai
- **Pinned version:** `gpt-4o`
- **Governance role:** primary
- **Quality tier:** high (score 95)
- **Context window:** 128,000 tokens
- **Cost / 1k tokens:** $0.00500 in · $0.01500 out
- **Intended tasks:** chat, document_analysis, structured_output, regulatory_review, code_generation, summarization, general
- **Last governance review:** 2026-06-03

**Intended use.** Cross-provider primary for structured output and the first OpenAI fallback when Anthropic is unavailable. Outputs are decision support and require human review.

**Known limitations.**
- Non-deterministic: identical inputs may produce different outputs unless a seed is supplied; every generation is recorded in the gateway audit trail (model, prompt hash, temperature, seed).
- May produce plausible but unsupported claims (hallucination); generated claims carry a groundedness score and below-threshold content is gated for human review before approval.
- Not fine-tuned on a proprietary regulatory corpus; regulatory expertise is supplied via system prompts and retrieval, not weights.
- Bounded by a training-data knowledge cutoff; current guidance must be supplied via retrieval.
- Cross-provider fallback may change phrasing relative to the Claude primary.

**Eval status.**
- Version pinned in lockfile: yes
- Per-document-type accuracy measured: no
- Evidence: server/eval/rag/; docs/rfi/AI_CAPABILITIES_INVENTORY.md (model configuration).
- Note: Per-document-type extraction/generation accuracy is not yet measured; the RAG faithfulness harness and PQ protocol are the evidence path. Version pinning + the drift gate regression-test model swaps in the interim.

---

## gpt-4o-mini

- **Provider:** openai
- **Pinned version:** `gpt-4o-mini`
- **Governance role:** fallback
- **Quality tier:** economy (score 82)
- **Context window:** 128,000 tokens
- **Cost / 1k tokens:** $0.00015 in · $0.00060 out
- **Intended tasks:** chat, general, summarization
- **Last governance review:** 2026-06-03

**Intended use.** Economy model for chat and summarization. Not approved for high-risk regulatory drafting or review.

**Known limitations.**
- Non-deterministic: identical inputs may produce different outputs unless a seed is supplied; every generation is recorded in the gateway audit trail (model, prompt hash, temperature, seed).
- May produce plausible but unsupported claims (hallucination); generated claims carry a groundedness score and below-threshold content is gated for human review before approval.
- Not fine-tuned on a proprietary regulatory corpus; regulatory expertise is supplied via system prompts and retrieval, not weights.
- Bounded by a training-data knowledge cutoff; current guidance must be supplied via retrieval.
- Lowest reasoning depth among OpenAI options.

**Eval status.**
- Version pinned in lockfile: yes
- Per-document-type accuracy measured: no
- Evidence: server/eval/rag/.
- Note: Per-document-type extraction/generation accuracy is not yet measured; the RAG faithfulness harness and PQ protocol are the evidence path. Version pinning + the drift gate regression-test model swaps in the interim.

---

## claude-opus-4

- **Provider:** anthropic
- **Pinned version:** `claude-opus-5-5`
- **Governance role:** primary
- **Quality tier:** flagship (score 99)
- **Context window:** 1,000,000 tokens
- **Cost / 1k tokens:** $0.00400 in · $0.02000 out
- **Intended tasks:** chat, document_analysis, document_drafting, structured_output, regulatory_review, code_generation, summarization, general
- **Last governance review:** 2026-09-25

**Intended use.** Primary model for high-risk regulatory authoring, document analysis, and review where reasoning depth matters most. Outputs are decision support and require human review before approval.

**Known limitations.**
- Non-deterministic: identical inputs may produce different outputs unless a seed is supplied; every generation is recorded in the gateway audit trail (model, prompt hash, temperature, seed).
- May produce plausible but unsupported claims (hallucination); generated claims carry a groundedness score and below-threshold content is gated for human review before approval.
- Not fine-tuned on a proprietary regulatory corpus; regulatory expertise is supplied via system prompts and retrieval, not weights.
- Bounded by a training-data knowledge cutoff; current guidance must be supplied via retrieval.
- Higher cost and latency than Sonnet/Haiku; reserve for high-risk tasks.

**Eval status.**
- Version pinned in lockfile: yes
- Per-document-type accuracy measured: no
- Evidence: server/eval/pq/pq-protocol.json (PQ-DRAFT-001, draft; PENDING EXECUTION for this version — see pq below). Vendor evaluation and the surface differences: docs/evidence/MODEL-GOVERNANCE/2026-09-25-opus-5-5/README.md. Corrected 2026-09-23: this field cited docs/validation/PQ-CORTEX-001 PQ-007/008, which measure pathway-prediction accuracy and "regulatory intuition" for a different product, not drafting.
- Note: Per-document-type extraction/generation accuracy is not yet measured; the RAG faithfulness harness and PQ protocol are the evidence path. Version pinning + the drift gate regression-test model swaps in the interim.

---

## claude-opus-5

- **Provider:** anthropic
- **Pinned version:** `claude-opus-5`
- **Governance role:** fallback
- **Quality tier:** flagship (score 98.5)
- **Context window:** 1,000,000 tokens
- **Cost / 1k tokens:** $0.00500 in · $0.02500 out
- **Intended tasks:** chat, document_analysis, document_drafting, structured_output, regulatory_review, code_generation, summarization, general
- **Last governance review:** 2026-09-25

**Intended use.** Primary model for high-risk regulatory authoring, document analysis, and review where reasoning depth matters most. Outputs are decision support and require human review before approval.

**Known limitations.**
- Non-deterministic: identical inputs may produce different outputs unless a seed is supplied; every generation is recorded in the gateway audit trail (model, prompt hash, temperature, seed).
- May produce plausible but unsupported claims (hallucination); generated claims carry a groundedness score and below-threshold content is gated for human review before approval.
- Not fine-tuned on a proprietary regulatory corpus; regulatory expertise is supplied via system prompts and retrieval, not weights.
- Bounded by a training-data knowledge cutoff; current guidance must be supplied via retrieval.
- Higher cost and latency than Sonnet/Haiku; reserve for high-risk tasks.

**Eval status.**
- Version pinned in lockfile: yes
- Per-document-type accuracy measured: no
- Evidence: Reviewed as primary 2026-09-17 (see the claude-opus-4 entry history); covered by the gateway fallback law.
- Note: Per-document-type extraction/generation accuracy is not yet measured; the RAG faithfulness harness and PQ protocol are the evidence path. Version pinning + the drift gate regression-test model swaps in the interim.

---

## claude-opus-4-legacy

- **Provider:** anthropic
- **Pinned version:** `claude-opus-4-8`
- **Governance role:** fallback
- **Quality tier:** flagship (score 98)
- **Context window:** 1,000,000 tokens
- **Cost / 1k tokens:** $0.00500 in · $0.02500 out
- **Intended tasks:** chat, document_analysis, document_drafting, structured_output, regulatory_review, code_generation, summarization, general
- **Last governance review:** 2026-09-17

**Intended use.** Primary model for high-risk regulatory authoring, document analysis, and review where reasoning depth matters most. Outputs are decision support and require human review before approval.

**Known limitations.**
- Non-deterministic: identical inputs may produce different outputs unless a seed is supplied; every generation is recorded in the gateway audit trail (model, prompt hash, temperature, seed).
- May produce plausible but unsupported claims (hallucination); generated claims carry a groundedness score and below-threshold content is gated for human review before approval.
- Not fine-tuned on a proprietary regulatory corpus; regulatory expertise is supplied via system prompts and retrieval, not weights.
- Bounded by a training-data knowledge cutoff; current guidance must be supplied via retrieval.
- Higher cost and latency than Sonnet/Haiku; reserve for high-risk tasks.

**Eval status.**
- Version pinned in lockfile: yes
- Per-document-type accuracy measured: no
- Evidence: Same capability profile as claude-opus-4; covered by the gateway fallback law. Reviewed as primary on 2026-07-24.
- Note: Per-document-type extraction/generation accuracy is not yet measured; the RAG faithfulness harness and PQ protocol are the evidence path. Version pinning + the drift gate regression-test model swaps in the interim.

---

## claude-sonnet-4

- **Provider:** anthropic
- **Pinned version:** `claude-sonnet-5`
- **Governance role:** fallback
- **Quality tier:** high (score 97)
- **Context window:** 1,000,000 tokens
- **Cost / 1k tokens:** $0.00200 in · $0.01000 out
- **Intended tasks:** chat, document_analysis, document_drafting, structured_output, regulatory_review, code_generation, summarization, general
- **Last governance review:** 2026-09-17

**Intended use.** Balanced quality/cost model for drafting, analysis, and structured output; sits below Opus on the quality ladder as the first fallback.

**Known limitations.**
- Non-deterministic: identical inputs may produce different outputs unless a seed is supplied; every generation is recorded in the gateway audit trail (model, prompt hash, temperature, seed).
- May produce plausible but unsupported claims (hallucination); generated claims carry a groundedness score and below-threshold content is gated for human review before approval.
- Not fine-tuned on a proprietary regulatory corpus; regulatory expertise is supplied via system prompts and retrieval, not weights.
- Bounded by a training-data knowledge cutoff; current guidance must be supplied via retrieval.
- Slightly lower reasoning depth than Opus on the hardest regulatory tasks.

**Eval status.**
- Version pinned in lockfile: yes
- Per-document-type accuracy measured: no
- Evidence: server/eval/rag/; gateway fallback law (Opus → Sonnet → Haiku). Not approved for high-risk regulatory drafting on its own — it is a fallback rung.
- Note: Per-document-type extraction/generation accuracy is not yet measured; the RAG faithfulness harness and PQ protocol are the evidence path. Version pinning + the drift gate regression-test model swaps in the interim.

---

## claude-sonnet-4-legacy

- **Provider:** anthropic
- **Pinned version:** `claude-sonnet-4-6`
- **Governance role:** fallback
- **Quality tier:** high (score 93)
- **Context window:** 1,000,000 tokens
- **Cost / 1k tokens:** $0.00300 in · $0.01500 out
- **Intended tasks:** chat, document_analysis, document_drafting, structured_output, regulatory_review, code_generation, summarization, general
- **Last governance review:** 2026-09-17

**Intended use.** Balanced quality/cost model for drafting, analysis, and structured output; sits below Opus on the quality ladder as the first fallback.

**Known limitations.**
- Non-deterministic: identical inputs may produce different outputs unless a seed is supplied; every generation is recorded in the gateway audit trail (model, prompt hash, temperature, seed).
- May produce plausible but unsupported claims (hallucination); generated claims carry a groundedness score and below-threshold content is gated for human review before approval.
- Not fine-tuned on a proprietary regulatory corpus; regulatory expertise is supplied via system prompts and retrieval, not weights.
- Bounded by a training-data knowledge cutoff; current guidance must be supplied via retrieval.
- Slightly lower reasoning depth than Opus on the hardest regulatory tasks.

**Eval status.**
- Version pinned in lockfile: yes
- Per-document-type accuracy measured: no
- Evidence: Same capability profile as the prior claude-sonnet-4 entry it succeeds; covered by the gateway fallback law.
- Note: Per-document-type extraction/generation accuracy is not yet measured; the RAG faithfulness harness and PQ protocol are the evidence path. Version pinning + the drift gate regression-test model swaps in the interim.

---

## claude-haiku-4

- **Provider:** anthropic
- **Pinned version:** `claude-haiku-4-5`
- **Governance role:** fallback
- **Quality tier:** standard (score 85)
- **Context window:** 200,000 tokens
- **Cost / 1k tokens:** $0.00100 in · $0.00500 out
- **Intended tasks:** chat, general, summarization, structured_output
- **Last governance review:** 2026-09-17

**Intended use.** Fast, low-cost model for chat, summarization, and structured output; last Anthropic rung in the fallback chain. Not approved for high-risk regulatory drafting.

**Known limitations.**
- Non-deterministic: identical inputs may produce different outputs unless a seed is supplied; every generation is recorded in the gateway audit trail (model, prompt hash, temperature, seed).
- May produce plausible but unsupported claims (hallucination); generated claims carry a groundedness score and below-threshold content is gated for human review before approval.
- Not fine-tuned on a proprietary regulatory corpus; regulatory expertise is supplied via system prompts and retrieval, not weights.
- Bounded by a training-data knowledge cutoff; current guidance must be supplied via retrieval.
- Reduced reasoning depth; not for substantive regulatory argumentation.

**Eval status.**
- Version pinned in lockfile: yes
- Per-document-type accuracy measured: no
- Evidence: server/eval/rag/; gateway fallback law.
- Note: Per-document-type extraction/generation accuracy is not yet measured; the RAG faithfulness harness and PQ protocol are the evidence path. Version pinning + the drift gate regression-test model swaps in the interim.

---

## kimi-k2-0711

- **Provider:** moonshot
- **Pinned version:** `kimi-k2-0711-preview`
- **Governance role:** fallback
- **Quality tier:** standard (score 88)
- **Context window:** 131,072 tokens
- **Cost / 1k tokens:** $0.00060 in · $0.00180 out
- **Intended tasks:** chat, document_analysis, general, structured_output, code_generation
- **Last governance review:** 2026-06-03

**Intended use.** Long-context cross-provider fallback used only when both Anthropic and OpenAI are unavailable. Decision support; requires human review.

**Known limitations.**
- Non-deterministic: identical inputs may produce different outputs unless a seed is supplied; every generation is recorded in the gateway audit trail (model, prompt hash, temperature, seed).
- May produce plausible but unsupported claims (hallucination); generated claims carry a groundedness score and below-threshold content is gated for human review before approval.
- Not fine-tuned on a proprietary regulatory corpus; regulatory expertise is supplied via system prompts and retrieval, not weights.
- Bounded by a training-data knowledge cutoff; current guidance must be supplied via retrieval.
- Final fallback rung; expect the largest stylistic divergence from the primary model.

**Eval status.**
- Version pinned in lockfile: yes
- Per-document-type accuracy measured: no
- Evidence: Gateway fallback law (final cross-provider rung).
- Note: Per-document-type extraction/generation accuracy is not yet measured; the RAG faithfulness harness and PQ protocol are the evidence path. Version pinning + the drift gate regression-test model swaps in the interim.

---

## moonshot-v1-128k

- **Provider:** moonshot
- **Pinned version:** `moonshot-v1-128k`
- **Governance role:** fallback
- **Quality tier:** standard (score 85)
- **Context window:** 128,000 tokens
- **Cost / 1k tokens:** $0.00080 in · $0.00080 out
- **Intended tasks:** chat, document_analysis, general
- **Last governance review:** 2026-06-03

**Intended use.** Long-context cross-provider fallback used only when both Anthropic and OpenAI are unavailable. Decision support; requires human review.

**Known limitations.**
- Non-deterministic: identical inputs may produce different outputs unless a seed is supplied; every generation is recorded in the gateway audit trail (model, prompt hash, temperature, seed).
- May produce plausible but unsupported claims (hallucination); generated claims carry a groundedness score and below-threshold content is gated for human review before approval.
- Not fine-tuned on a proprietary regulatory corpus; regulatory expertise is supplied via system prompts and retrieval, not weights.
- Bounded by a training-data knowledge cutoff; current guidance must be supplied via retrieval.
- Final fallback rung; expect the largest stylistic divergence from the primary model.

**Eval status.**
- Version pinned in lockfile: yes
- Per-document-type accuracy measured: no
- Evidence: Gateway fallback law.
- Note: Per-document-type extraction/generation accuracy is not yet measured; the RAG faithfulness harness and PQ protocol are the evidence path. Version pinning + the drift gate regression-test model swaps in the interim.

---

## moonshot-v1-32k

- **Provider:** moonshot
- **Pinned version:** `moonshot-v1-32k`
- **Governance role:** fallback
- **Quality tier:** economy (score 83)
- **Context window:** 32,000 tokens
- **Cost / 1k tokens:** $0.00040 in · $0.00040 out
- **Intended tasks:** chat, general
- **Last governance review:** 2026-06-03

**Intended use.** Long-context cross-provider fallback used only when both Anthropic and OpenAI are unavailable. Decision support; requires human review.

**Known limitations.**
- Non-deterministic: identical inputs may produce different outputs unless a seed is supplied; every generation is recorded in the gateway audit trail (model, prompt hash, temperature, seed).
- May produce plausible but unsupported claims (hallucination); generated claims carry a groundedness score and below-threshold content is gated for human review before approval.
- Not fine-tuned on a proprietary regulatory corpus; regulatory expertise is supplied via system prompts and retrieval, not weights.
- Bounded by a training-data knowledge cutoff; current guidance must be supplied via retrieval.
- Final fallback rung; expect the largest stylistic divergence from the primary model.

**Eval status.**
- Version pinned in lockfile: yes
- Per-document-type accuracy measured: no
- Evidence: Gateway fallback law.
- Note: Per-document-type extraction/generation accuracy is not yet measured; the RAG faithfulness harness and PQ protocol are the evidence path. Version pinning + the drift gate regression-test model swaps in the interim.

---

## claude-opus-4-bedrock

- **Provider:** bedrock
- **Pinned version:** `anthropic.claude-opus-4-7`
- **Governance role:** primary
- **Quality tier:** flagship (score 99)
- **Context window:** 200,000 tokens
- **Cost / 1k tokens:** $0.01500 in · $0.07500 out
- **Intended tasks:** chat, document_analysis, document_drafting, structured_output, regulatory_review, code_generation, summarization, general
- **Last governance review:** 2026-06-08

**Intended use.** Primary model for high-risk regulatory authoring, document analysis, and review where reasoning depth matters most. Outputs are decision support and require human review before approval.

**Known limitations.**
- Non-deterministic: identical inputs may produce different outputs unless a seed is supplied; every generation is recorded in the gateway audit trail (model, prompt hash, temperature, seed).
- May produce plausible but unsupported claims (hallucination); generated claims carry a groundedness score and below-threshold content is gated for human review before approval.
- Not fine-tuned on a proprietary regulatory corpus; regulatory expertise is supplied via system prompts and retrieval, not weights.
- Bounded by a training-data knowledge cutoff; current guidance must be supplied via retrieval.
- Higher cost and latency than Sonnet/Haiku; reserve for high-risk tasks.

**Eval status.**
- Version pinned in lockfile: yes
- Per-document-type accuracy measured: no
- Evidence: Same model weights as claude-opus-4 (first-party); server/eval/rag/. Region/ZDR governed by providers/placement.ts.
- Note: Per-document-type extraction/generation accuracy is not yet measured; the RAG faithfulness harness and PQ protocol are the evidence path. Version pinning + the drift gate regression-test model swaps in the interim.

---

## claude-sonnet-4-bedrock

- **Provider:** bedrock
- **Pinned version:** `anthropic.claude-sonnet-4-6`
- **Governance role:** fallback
- **Quality tier:** high (score 97)
- **Context window:** 200,000 tokens
- **Cost / 1k tokens:** $0.00300 in · $0.01500 out
- **Intended tasks:** chat, document_analysis, document_drafting, structured_output, regulatory_review, code_generation, summarization, general
- **Last governance review:** 2026-06-08

**Intended use.** Balanced quality/cost model for drafting, analysis, and structured output; sits below Opus on the quality ladder as the first fallback.

**Known limitations.**
- Non-deterministic: identical inputs may produce different outputs unless a seed is supplied; every generation is recorded in the gateway audit trail (model, prompt hash, temperature, seed).
- May produce plausible but unsupported claims (hallucination); generated claims carry a groundedness score and below-threshold content is gated for human review before approval.
- Not fine-tuned on a proprietary regulatory corpus; regulatory expertise is supplied via system prompts and retrieval, not weights.
- Bounded by a training-data knowledge cutoff; current guidance must be supplied via retrieval.
- Slightly lower reasoning depth than Opus on the hardest regulatory tasks.

**Eval status.**
- Version pinned in lockfile: yes
- Per-document-type accuracy measured: no
- Evidence: Same weights as claude-sonnet-4; gateway fallback law.
- Note: Per-document-type extraction/generation accuracy is not yet measured; the RAG faithfulness harness and PQ protocol are the evidence path. Version pinning + the drift gate regression-test model swaps in the interim.

---

## claude-opus-4-vertex

- **Provider:** vertex
- **Pinned version:** `claude-opus-4-7`
- **Governance role:** fallback
- **Quality tier:** flagship (score 99)
- **Context window:** 200,000 tokens
- **Cost / 1k tokens:** $0.01500 in · $0.07500 out
- **Intended tasks:** chat, document_analysis, document_drafting, structured_output, regulatory_review, code_generation, summarization, general
- **Last governance review:** 2026-06-08

**Intended use.** Primary model for high-risk regulatory authoring, document analysis, and review where reasoning depth matters most. Outputs are decision support and require human review before approval.

**Known limitations.**
- Non-deterministic: identical inputs may produce different outputs unless a seed is supplied; every generation is recorded in the gateway audit trail (model, prompt hash, temperature, seed).
- May produce plausible but unsupported claims (hallucination); generated claims carry a groundedness score and below-threshold content is gated for human review before approval.
- Not fine-tuned on a proprietary regulatory corpus; regulatory expertise is supplied via system prompts and retrieval, not weights.
- Bounded by a training-data knowledge cutoff; current guidance must be supplied via retrieval.
- Higher cost and latency than Sonnet/Haiku; reserve for high-risk tasks.

**Eval status.**
- Version pinned in lockfile: yes
- Per-document-type accuracy measured: no
- Evidence: Same weights as claude-opus-4; residency governed by providers/placement.ts.
- Note: Per-document-type extraction/generation accuracy is not yet measured; the RAG faithfulness harness and PQ protocol are the evidence path. Version pinning + the drift gate regression-test model swaps in the interim.

---

## gpt-4o-azure

- **Provider:** azure
- **Pinned version:** `gpt-4o`
- **Governance role:** fallback
- **Quality tier:** high (score 95)
- **Context window:** 128,000 tokens
- **Cost / 1k tokens:** $0.00500 in · $0.01500 out
- **Intended tasks:** chat, document_analysis, structured_output, regulatory_review, code_generation, summarization, general
- **Last governance review:** 2026-06-08

**Intended use.** General-purpose model supporting: chat, document_analysis, structured_output, regulatory_review, code_generation, summarization, general. Decision support; requires human review.

**Known limitations.**
- Non-deterministic: identical inputs may produce different outputs unless a seed is supplied; every generation is recorded in the gateway audit trail (model, prompt hash, temperature, seed).
- May produce plausible but unsupported claims (hallucination); generated claims carry a groundedness score and below-threshold content is gated for human review before approval.
- Not fine-tuned on a proprietary regulatory corpus; regulatory expertise is supplied via system prompts and retrieval, not weights.
- Bounded by a training-data knowledge cutoff; current guidance must be supplied via retrieval.

**Eval status.**
- Version pinned in lockfile: yes
- Per-document-type accuracy measured: no
- Evidence: Same model as gpt-4o (first-party); abuse-monitoring opt-out is an Azure-side control.
- Note: Per-document-type extraction/generation accuracy is not yet measured; the RAG faithfulness harness and PQ protocol are the evidence path. Version pinning + the drift gate regression-test model swaps in the interim.

---

## local-default

- **Provider:** local
- **Pinned version:** `local-default`
- **Governance role:** fallback
- **Quality tier:** economy (score 70)
- **Context window:** 32,000 tokens
- **Cost / 1k tokens:** $0.00000 in · $0.00000 out
- **Intended tasks:** chat, summarization, document_analysis, general
- **Last governance review:** 2026-06-08

**Intended use.** General-purpose model supporting: chat, summarization, document_analysis, general. Decision support; requires human review.

**Known limitations.**
- Non-deterministic: identical inputs may produce different outputs unless a seed is supplied; every generation is recorded in the gateway audit trail (model, prompt hash, temperature, seed).
- May produce plausible but unsupported claims (hallucination); generated claims carry a groundedness score and below-threshold content is gated for human review before approval.
- Not fine-tuned on a proprietary regulatory corpus; regulatory expertise is supplied via system prompts and retrieval, not weights.
- Bounded by a training-data knowledge cutoff; current guidance must be supplied via retrieval.

**Eval status.**
- Version pinned in lockfile: yes
- Per-document-type accuracy measured: no
- Evidence: Pending per-deployment eval; not approved for high-risk regulatory drafting until evaluated against server/eval/rag/.
- Note: Per-document-type extraction/generation accuracy is not yet measured; the RAG faithfulness harness and PQ protocol are the evidence path. Version pinning + the drift gate regression-test model swaps in the interim.
