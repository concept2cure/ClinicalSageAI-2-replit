# RECONCILE — AnA Intelligence Stack (WO-0)

**Date:** 2026-06-09 · **Branch:** `concept2cure-v2` · **Audited HEAD:** `92c36f8`

Purpose: inventory what the Intelligence-Stack work order (WO-1…WO-10) requires
against what already exists on the trunk, and bind names so we **extend/unify
rather than duplicate** (RI-OS §2.4). No code lands until this gate passes.

## Git reconciliation (resolved)

A stale local `concept2cure-v2` had diverged (56 local-only commits vs 218
origin-only). `origin/concept2cure-v2` is authoritative and already contains the
intelligence-stack services; the local line was an older ancestor. Local was
reset to `origin/concept2cure-v2` after tagging the divergent tip
`backup/local-concept2cure-v2-20260609` (nothing lost; recoverable).

## Name bindings (use these — do NOT create duplicates)

| Spec name | Real artifact on trunk |
|---|---|
| `submission_sequences` | **`ectd_sequences`** (`shared/schema/submissions.ts`) |
| `evidence_links` | **`submissionEvidenceLinks`** (`shared/schema/evidence.ts`) |
| submission backbone / leaves | `submissions`, `submission_regions`, `submission_leaves` (`shared/schema/submissions.ts`) |
| RAG pipeline | **`server/services/regulatory-guidance-retrieval.ts`** + the embedding service (cosine over `knowledge_entries`); pgvector `vector(1536)` lives on `coauthor_documents` (`csr-knowledge-db.ts`) and `vault` |
| deterministic validators | `ectd/ectd4-validator.ts`, `ectd/dispatch-readiness.ts`, `eSTARValidator.ts`, `realTimeValidationService.ts`, `validate-completeness-engine.ts`, `ectd/validation-rule-corpus.ts` |
| lifecycle diff | `ectd/lifecycle-operator.ts` |
| AI gateway | `server/services/ai-gateway/gateway.ts` (+ prompts under `ai-gateway/prompts/`) |

## Tier-by-tier classification

### Tier 1 — Foundational
| WO | Capability | Status | Evidence |
|---|---|---|---|
| WO-1 | Extraction / structuring | **EXISTS** | `services/ingestion/`, prompts `document-classify` + `document-extract`, `submission_leaves`, `submissionEvidenceLinks`; classify/extract endpoints |
| WO-2 | Retrieval (RAG + KB) | **EXTEND** | `regulatory-guidance-retrieval.ts` (embed + cosine + threshold) and an embedding service exist; canonical multi-source **`kb_chunks`** store is ABSENT — unify, don't fork a second RAG |
| WO-3 | Provenance / Truth Engine | **EXISTS (EXTEND)** | `services/truth-engine/` (`traceProvenance`), `submissionEvidenceLinks`, `GET /:id/provenance`; `provenance_nodes` normalized graph optional/ABSENT |

### Tier 2 — Reasoning
| WO | Capability | Status | Evidence |
|---|---|---|---|
| WO-4 | Consistency | **EXISTS** | `consistency_findings` (`evidence.ts` + migration `20260605`), prompt `consistency-check`, truth-engine `runConsistencyCheck`, `POST/GET /:id/consistency` |
| WO-5 | Strategy / planner | **PARTIAL** | prompt `submission-plan` + `generateSubmissionPlan` + `POST /:id/plan` exist; **ABSENT:** `reasoning-engine` interface, `ctd_section_profiles`, `regional_forms`, `submission_plans` persistence |
| WO-6 | Validation | **PARTIAL** | prompt `validation-explain` + `explainValidation` + several deterministic validators exist; **ABSENT:** unified `validation_results` / `validation_profiles` persistence |
| WO-7 | Cross-region | **PARTIAL** | prompt `cross-region-gap` + `computeCrossRegionGap` + `POST /:id/cross-region` exist; **ABSENT:** `cross_region_deltas` persistence |
| WO-8 | Shadow Review (the moat) | **EXISTS — benchmark missing** | `shadow_review_runs` / `shadow_review_findings`, prompt `shadow-review`, `services/shadow-review/` (`runShadowReview`, `aggregateRisk`), routes; **ABSENT:** mandatory Chahal benchmark doc |

### Tier 3 — Compounding
| WO | Capability | Status | Evidence |
|---|---|---|---|
| WO-9 | Lifecycle / temporal | **PARTIAL** | `ectd/lifecycle-operator.ts` diff engine + `services/lifecycle/` exist; **ABSENT:** `lifecycle_diffs` persistence |
| WO-10 | Outcome-learning flywheel | **CREATE-NEW** | no `learning_signals` table, no learning service |

## Net-new work, in the work order's priority order

1. **WO-8 benchmark** — `docs/shadow_review_benchmark.md` against the Chahal et al. RTF dataset (mandatory gate; the credibility proof). *Highest priority.*
2. **WO-6** — `validation_results` + `validation_profiles` tables; unify the existing validators behind one results writer (do not add a new validator).
3. **WO-7** — `cross_region_deltas` table + persist `computeCrossRegionGap` output.
4. **WO-5** — `reasoning-engine` interface (rules-resolver now, hrm-resolver stub) + `ctd_section_profiles` / `regional_forms` rule data + `submission_plans` persistence.
5. **WO-9** — `lifecycle_diffs` table fed by `lifecycle-operator.ts`.
6. **WO-10** — `learning_signals` (append-only) + capture hooks (no prompt auto-mutation).
7. **WO-2** — fold multi-source KB into the existing retrieval pipeline (`kb_chunks` only if a unified store is genuinely needed).

## Conventions confirmed on trunk (reuse, don't re-architect)

Mandatory columns + tenant `organizationId` scoping + `auditService` on writes +
AI via `ai-gateway` only + versioned prompts — all already in force in the
existing services. New work must match these, keep the deterministic byte path
LLM-free, and isolate HRM-candidate reasoning behind the `reasoning-engine`
interface.

## Gate

WO-0 complete: every required table/service classified EXISTS / EXTEND /
CREATE-NEW with file evidence; name bindings fixed; git reconciled. Cleared to
proceed to WO-8 (benchmark) next.
