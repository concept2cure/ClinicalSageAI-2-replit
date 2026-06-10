# How Concept2Cure validates its non-deterministic LLM for GxP

A buyer-facing answer to: *"How is your non-deterministic LLM validated for use in
GxP / regulated decision support?"* Every claim below maps to a concrete module;
see `EVIDENCE_PACK.md` for the auto-generated current-state snapshot and
`CONTROL_TRACEABILITY_MATRIX.md` for the regulation mapping.

We treat the model as **decision support**, not an autonomous decision-maker.
Validation rests on five mechanisms.

## 1. Per-feature intended use and risk classification

Every AI capability ("AnA capability") carries a governance contract: an
**intended-use statement**, a **risk tier** (minimal/low/moderate/high), a
**human-oversight mode** (suggest-only → requires-review → requires-approval), a
**groundedness floor**, and a **GxP-applicability** flag. This mirrors the FDA
2025 draft framework on AI credibility for regulatory decisions (intended use ×
risk × oversight) applied to each feature, not just the device under review.

- Source of truth: `server/services/ai-governance/risk-tiers.ts`
- Persisted + queryable on `ana_capability_registry` (migration `20260603_ai_capability_governance.sql`)

## 2. Reproducibility and traceability of every generation

All governed AI calls route through a single gateway that records, per request:
the **provider and model**, the **model and prompt version**, a **SHA-256 hash of
the prompt**, the **temperature and seed**, token usage, latency, and the
**fallback chain** actually used. So any generated output can be tied back to the
exact model, prompt, and parameters that produced it.

- Gateway + audit: `server/services/ai-gateway/{gateway,audit}.ts` (`ai.gateway_audit_log`)
- **Model version pinning:** each model is pinned to an exact provider version in
  `server/services/ai-governance/approved-models.ts`. A model cannot be swapped
  without updating that lockfile, and a CI **drift gate** fails the build on any
  unreviewed swap — so the automatic fallback law cannot silently change the
  validated model set.
- **No bypass:** `scripts/ci/check-gateway-bypass.mjs` blocks new direct LLM
  client instantiations that would escape the audit trail.

## 3. Groundedness scoring with human-review triggers

Generated claims are scored for groundedness — citation coverage at accept time
(fraction of claim sentences traceable to a source: citation / predicate / DOI /
PMID / NCT), with richer evidence-based scoring available via
`confidenceScoringEngine`. When content is scored **below its capability's
threshold**, acceptance is **blocked** (`422 GROUNDEDNESS_REVIEW_REQUIRED`)
until a qualified human records a review acknowledgement. The score and the
governance verdict are persisted to the immutable action ledger either way.

- `server/services/ai-governance/{groundedness,review-policy}.ts`
- Enforced at `POST /api/c2c/actions/accept-ai-suggestion` (and the legacy accept path)
- Org-wide enforcement of computed scores: `AI_GROUNDEDNESS_ENFORCE=1`

## 4. Evaluation harness and model cards

- **Model cards** (`docs/ai-governance/MODEL_CARDS.md`) document each model's
  intended use, capabilities, known limitations (non-determinism, hallucination,
  no regulatory fine-tune, knowledge cutoff), governance role, and eval status.
- **Eval harnesses** measure quality and gate CI on thresholds:
  - Retrieval + faithfulness: `server/eval/rag/`
  - Per-document-type extraction F1 and generation section-coverage / forbidden-
    phrase checks: `server/eval/doc-quality/`
- **Regression on model swap:** the drift gate forces re-validation whenever the
  model set changes, tying eval back to the gateway fallback law.

*Current limitation, stated plainly:* per-document-type accuracy numbers are at
seed stage — the harnesses are in place and runnable; the gold banks are being
expanded and run live to publish measured accuracy. Model cards report accuracy
as "not yet measured" rather than fabricating a figure.

## 5. Immutable audit trail (21 CFR Part 11)

Every governed action writes a `c2c_ana_actions` ledger row and an `audit_logs`
row carrying a **SHA-256 hash chain** (who, what, when, reason, payload hash,
prior-hash link), in a single transaction. Integrity is verifiable on demand
(`GET /api/c2c/actions/verify-chain`) and on a **scheduled daily sweep**
(`server/jobs/auditChainIntegritySweep.ts`). High-risk actions (sign / lock)
require re-authentication.

## Validation posture

A formal computer-system-validation package (GAMP 5 VMP/IQ/OQ/PQ, ISO 14971 risk
analysis) is maintained under `docs/validation/`. The mechanisms above are the
controls those protocols verify; executed, signed protocol runs are performed per
deployment in the validated environment.
