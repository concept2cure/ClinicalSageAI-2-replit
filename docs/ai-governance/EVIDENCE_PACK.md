# AI governance evidence pack — Concept2Cure AnA

> Generated 2026-06-03T23:19:28.863Z by `scripts/ai-governance/generate-evidence-pack.ts`. Do not edit by hand.
> Inspection-ready snapshot derived from code. Not a substitute for executed validation protocols.

## 1. Controls summary

| Control | Status | Implementation |
| --- | --- | --- |
| Per-feature intended use + risk tier | In place | `server/services/ai-governance/risk-tiers.ts`; `ana_capability_registry` columns (migration `20260603_ai_capability_governance.sql`) |
| Reproducibility (model/prompt/params logged; version pinning) | In place | `server/services/ai-gateway/audit.ts` (model, prompt hash, prompt version, temperature, seed, fallback chain); `approved-models.ts` lockfile + drift gate |
| Groundedness → human-review gate | In place | `server/services/ai-governance/{groundedness,review-policy}.ts`; enforced at `POST /api/c2c/actions/accept-ai-suggestion` |
| Eval harness + model cards | In place | `server/eval/rag/`, `server/eval/doc-quality/`; `docs/ai-governance/MODEL_CARDS.md` |

## 2. Per-capability governance contracts

Every AnA capability carries an intended-use statement (stored on the registry), a
risk tier, a human-oversight mode, a groundedness floor, and GxP applicability.

**analysis**

| Capability | Risk tier | Human oversight | Groundedness floor | GxP |
| --- | --- | --- | --- | --- |
| `gap-analysis` | moderate | requires_review | 0.75 | yes |
| `cross-reference-check` | moderate | requires_review | 0.75 | yes |
| `consistency-analysis` | moderate | requires_review | 0.75 | yes |
| `literature-review` | moderate | requires_review | 0.75 | yes |
| `predicate-comparison` | high | requires_review | 0.85 | yes |

**compliance**

| Capability | Risk tier | Human oversight | Groundedness floor | GxP |
| --- | --- | --- | --- | --- |
| `compliance-scan-fda` | high | requires_review | 0.85 | yes |
| `compliance-scan-ema` | high | requires_review | 0.85 | yes |
| `compliance-scan-pmda` | high | requires_review | 0.85 | yes |
| `compliance-scan-multi` | high | requires_review | 0.85 | yes |

**drafting**

| Capability | Risk tier | Human oversight | Groundedness floor | GxP |
| --- | --- | --- | --- | --- |
| `draft-csr` | high | requires_review | 0.80 | yes |
| `draft-protocol` | high | requires_review | 0.80 | yes |
| `draft-ib` | high | requires_review | 0.80 | yes |
| `draft-ind-module` | high | requires_review | 0.80 | yes |
| `draft-nda-section` | high | requires_review | 0.80 | yes |
| `draft-510k` | high | requires_review | 0.80 | yes |
| `draft-regulatory-response` | high | requires_review | 0.80 | yes |
| `draft-cmc` | high | requires_review | 0.80 | yes |

**formatting**

| Capability | Risk tier | Human oversight | Groundedness floor | GxP |
| --- | --- | --- | --- | --- |
| `extract-template` | low | suggest_only | 0.50 | no |
| `build-template` | low | suggest_only | 0.50 | no |
| `render-with-template` | low | suggest_only | 0.50 | no |

**intelligence**

| Capability | Risk tier | Human oversight | Groundedness floor | GxP |
| --- | --- | --- | --- | --- |
| `rim-pattern-detection` | moderate | suggest_only | 0.70 | yes |
| `rim-signal-capture` | moderate | suggest_only | 0.70 | yes |
| `rim-judgment-scoring` | moderate | suggest_only | 0.70 | yes |
| `rim-trend-analysis` | moderate | suggest_only | 0.70 | yes |

**knowledge**

| Capability | Risk tier | Human oversight | Groundedness floor | GxP |
| --- | --- | --- | --- | --- |
| `cortex-knowledge-atoms` | low | suggest_only | 0.50 | no |
| `cortex-semantic-search` | low | suggest_only | 0.50 | no |
| `cortex-thread-management` | low | suggest_only | 0.50 | no |

**prediction**

| Capability | Risk tier | Human oversight | Groundedness floor | GxP |
| --- | --- | --- | --- | --- |
| `foresight-timeline` | moderate | suggest_only | 0.70 | no |
| `foresight-risk` | moderate | suggest_only | 0.70 | no |
| `foresight-readiness` | moderate | suggest_only | 0.70 | no |

**submission**

| Capability | Risk tier | Human oversight | Groundedness floor | GxP |
| --- | --- | --- | --- | --- |
| `submission-readiness` | high | requires_approval | 0.85 | yes |
| `dossier-mapping` | high | requires_approval | 0.85 | yes |
| `submission-planning` | high | requires_approval | 0.85 | yes |

**workflow**

| Capability | Risk tier | Human oversight | Groundedness floor | GxP |
| --- | --- | --- | --- | --- |
| `authoring-review` | low | requires_approval | 0.60 | yes |
| `authoring-approve` | moderate | requires_approval | 0.60 | yes |
| `version-management` | low | requires_approval | 0.60 | yes |

## 3. Reproducibility & model governance

Every governed AI call routes through `server/services/ai-gateway` and its audit
log records: provider, model, **model/prompt version**, **prompt SHA-256 hash**,
**temperature**, **seed**, token usage, cost, latency, and the **fallback chain**
(`ai.gateway_audit_log`). New direct-client instantiations outside the gateway
are blocked by `scripts/ci/check-gateway-bypass.mjs`.

Drift gate verdict: **PASS** — all 10 pinned models match the live gateway registry (no unreviewed model swap).

### Approved-model lockfile

| Model id | Pinned version | Provider | Role |
| --- | --- | --- | --- |
| `claude-opus-4` | `claude-opus-4-7` | anthropic | primary |
| `claude-opus-4-legacy` | `claude-opus-4-20250514` | anthropic | fallback |
| `claude-sonnet-4` | `claude-sonnet-4-6` | anthropic | fallback |
| `claude-sonnet-4-legacy` | `claude-sonnet-4-20250514` | anthropic | fallback |
| `claude-haiku-4` | `claude-haiku-4-5-20251001` | anthropic | fallback |
| `gpt-4o` | `gpt-4o` | openai | primary |
| `gpt-4o-mini` | `gpt-4o-mini` | openai | fallback |
| `kimi-k2-0711` | `kimi-k2-0711-preview` | moonshot | fallback |
| `moonshot-v1-128k` | `moonshot-v1-128k` | moonshot | fallback |
| `moonshot-v1-32k` | `moonshot-v1-32k` | moonshot | fallback |

Full per-model intended use, limitations, and eval status: `docs/ai-governance/MODEL_CARDS.md`.

## 4. Groundedness gate

Generated claims are scored for groundedness (citation coverage; richer
evidence-based scoring via `confidenceScoringEngine`). At accept time, content
scored below its capability's threshold is blocked
(`422 GROUNDEDNESS_REVIEW_REQUIRED`) unless a human-review acknowledgement is
recorded; the verdict + score persist into the `c2c_ana_actions` ledger. Set
`AI_GROUNDEDNESS_ENFORCE=1` to enforce computed scores org-wide.

## 5. Evaluation

| Harness | Scope | Run |
| --- | --- | --- |
| RAG | retrieval hit/recall/MRR + LLM-judged faithfulness | `tsx server/eval/rag/run-eval.ts --min-hit-rate X --min-faithfulness Y` |
| Doc-quality | per-document-type extraction F1 + generation section coverage + forbidden-phrase checks | `npm run ai:eval-doc-quality -- --min-coverage 0.85 --min-f1 0.8` |

Per-document-type accuracy banks are seed-stage; expand + run live to publish numbers.

## 6. Audit trail (21 CFR Part 11)

- Governed actions: `c2c_ana_actions` ledger + `audit_logs` with a SHA-256 hash
  chain (`server/services/audit/chain.ts`), written in one transaction.
- On-demand verification: `GET /api/c2c/actions/verify-chain`.
- Scheduled daily tamper-evidence sweep: `server/jobs/auditChainIntegritySweep.ts`
  (enable with `ENABLE_AUDIT_CHAIN_CHECK=true`).

## 7. Related documents

- Buyer-facing answer: `docs/ai-governance/LLM_GXP_VALIDATION.md`
- Control → regulation mapping: `docs/ai-governance/CONTROL_TRACEABILITY_MATRIX.md`
- Model cards: `docs/ai-governance/MODEL_CARDS.md`
