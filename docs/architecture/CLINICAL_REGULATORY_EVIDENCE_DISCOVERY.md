# Clinical Regulatory Evidence — Architecture Discovery & Caller Matrix (Phase 0)

**Work order:** *FDA CRL + CSR Intelligence + Study Design Evidence Architecture.*
**This document satisfies §2 (mandatory architectural discovery) and §15 Phase 0.** No implementation beyond contracts is described here; it is the map every later phase builds against.

> **Method.** Five parallel read-only audits of the live callers + data contracts across CSR corpus, study design, precedent/prediction/foresight, AnA/retrieval/gateway, and the evidence schema/tenancy, cross-checked against the migrations. Every file/table/line reference below was verified against the tree.

---

## 0. Executive assessment — "how much is already done"

**~70% of the substrate already exists; the work is reconciliation + a small net-new learning loop, not a greenfield build.** The single most important finding, and the one that most changes the plan: **an extensive FDA CRL / deficiency / regulatory-outcome subsystem is already implemented and mounted** — the work order's `regulatory_findings` / `regulatory_outcomes` / CRL concepts largely already exist. The work order's own rule ("do not build a standalone corpus; strengthen the existing architecture") is therefore not just guidance — it is forced by the codebase.

| Work-order capability | State today |
|---|---|
| Unified evidence **source** spine | **Exists (fragmented).** `evidence_sources` (20260319), `csr_reports`, `precedent` source docs, `external_evidence_sources`, `c2c_evidence_objects` — several source models at different grains; no single canonical one. |
| Canonical **clinical study** identity | **Exists, rich.** `csr_studies` (0005) + 14 child tables (arms/populations/endpoints/results/stats/PK/dose/AEs) — org+workspace scoped, RLS-enabled. (A separate thin device-oriented `clinical_studies` also exists — do not confuse.) |
| **Study design features / result observations** | **Schema exists (dead); extraction shallow.** `csr_endpoints`, `csr_endpoint_results`, `csr_statistical_analyses`, `csr_treatment_arms`, `csr_populations` model the entire expanded contract — but no live writer fills them. The live path (`csr_reports`/`csr_details`) extracts only a shallow slice. **The gap is the extractor, not the schema.** |
| **Regulatory findings (CRL deficiencies)** | **Exists (pattern-grade) + net-new (document-grade).** `regulatory_intel.crl_trigger_patterns.deficiency_signals` + `crl_trajectory_records.deficiency_details` + `innovation.submission_outcomes.deficiencies_detail` model deficiencies today as *patterns/trajectories*. A **normalized per-CRL-finding** table linked to specific studies/endpoints is the net-new piece. |
| **Regulatory outcomes** | **Exists.** `innovation.submission_outcomes` (approved / RTF / complete_response / withdrawn …) + `precedent.regulatory_precedents.decision_outcome` (incl. `CRL`, `REFUSE_TO_FILE`) + `crl_trajectory_records.final_outcome`. Reuse. |
| **Evidence relationships** | **Exists (multiple edge stores).** `evidence_claim_links`, `evidence.support`/`derivations`, `csr_knowledge_edges`, `precedent.csr_precedent_links`, `lumen_knowledge_graph_edges`, `submission_evidence_links`. Pick one; add typed CRL→study→finding edges. |
| **Design lessons** | **Net-new.** No governed "reusable takeaway" object. Closest seeds: `precedent.regulatory_precedents.strategy_summary`, `regulatory_intel.precedent_application_rules`, `csr_regulatory_intelligence.precedent_summary`. |
| **studyDesignEvidenceService** (benchmark / endpoint-risk / sample-size / dose / regulatory-stress) | **~60% reuse.** The simulator, power/assurance, DerSimonian–Laird effect priors, CSR effect extractor, and deterministic design gates are production-grade and no-fabrication (`server/services/study-design/*`). Net-new: precedent/CRL benchmarking aggregation, dose-strategy assessment, and a regulatory-stress scenario layer over the simulator. |
| **Retrieval atoms (9 types)** | **Zero DDL.** `lumen_data_atoms.atom_type` is unconstrained `text`; the canonical embed→atom→`ragRouter` path already filters by atom_type. |
| **5 AnA tools** | **Net-new, well-scoped.** Add to `AnaToolDefinitions.ts` + `AnaToolExecutor.ts` (proven pattern); wire to `ragRouter` + `precedentEngine`. |
| **Prediction path (honest)** | **Exists (canonical).** `intelligence.risk_model_versions` (logistic regression, targets `crl`/`rtf`/`first_cycle_approval`, holdout AUC/Brier, refuses regressive versions) + `intelligence/calibration.ts` (Platt) + `confidence_calibration_log`. **This is the correct home for CRL-influenced prediction** — not the deprecated foresight path. |
| **Statistical/evidentiary + tenant-isolation governance** | **Primitives exist; rules not centralized.** `organization_id` + RLS from JWT; the **precedent NULL-org idiom** = §13 global-vs-tenant, already battle-tested. No central "every-metric-carries-numerator/denominator/verification" guard or unsupported-claim linter yet. |

**Net-new work (the real deliverables):** a normalized **`regulatory_findings`** entity + **`design_lessons`**, the shared **analytical interface** (`clinicalRegulatoryEvidenceService` + `studyDesignEvidenceService`) that unifies the fragmented stores behind one contract, the **CSR extractor uplift** onto the dead-but-complete `csr_*` schema, **CRL document → unified spine** ingestion, the **9 atom types + 5 AnA tools**, the **governance layer** (statistical rules, tenant-isolation tests, prediction governance), and **confidence-hygiene cleanup** of the deprecated foresight path.

---

## 1. Live-caller matrix

Classification: **CANONICAL** (build here) · **TRANSITIONAL** (live but flawed; migrate/harden) · **LEGACY** (orphaned/deprecated; retire) · **DUPLICATE** (redundant with a canonical) · **DO-NOT-TOUCH** (canonical, out of scope).

### 1.1 CSR corpus + extraction
| Component | Class | Notes |
|---|---|---|
| `csr_reports` + `csr_details` (`shared/schema.ts:12698`) | CANONICAL (live store) | Shallow field set. `nct_id` idempotency (`20260530`). |
| `0005_csr_knowledge_database.sql` — `csr_studies` + 14 child tables | CANONICAL-schema / **DEAD-data** | Models the full expanded contract; **no live writer** (`docs/DEAD_TABLES_INVENTORY.md`). The uplift target. |
| `server/services/csr-intelligence-library.ts` | CANONICAL | Deterministic, evidence-preserving (verbatim spans). Narrow. Callers: `routes/corpus-routes.ts`. |
| `server/services/corpus/drizzle-corpus-writer.ts` | CANONICAL | Live CT.gov writer → `csr_reports`/`csr_details`; parks extras in `metadata`; `results=null` (honest). |
| `server/data-importer.ts` | CANONICAL | The live CT.gov importer. |
| `server/services/csr-knowledge-extractor.ts` | TRANSITIONAL | Reads `csr_details.results` (never populated → runs on empty); **fabricated**: PK `cmax=dose*10` (`:375`), `confidence=|r|` (`:424`), base-0.5 heuristic (`:752`), DLT `0.33` (`:747`). |
| `server/services/csr-builder.ts` | CANONICAL (generation) | ICH E3 draft generator; hardcoded similarity `0.95/0.6` (`:583`). |
| `server/services/csr-extractor-service.ts` | LEGACY | OpenAI, PDF `file_path`, disk JSON, hardcoded section confidences; unwired to live schema. Its `CSRMappingTemplate` already *prompts* ~90% of the contract — a reference for the uplift. |
| `server/csr-training-service.ts` | LEGACY | HuggingFace → JSONL on disk; no callers. |
| `server/agent-service.ts` (2nd `StudyDesignAgentService`) | DUPLICATE | HF/Mixtral, `data/*.jsonl`, retrieval disabled; no importers. |

**Expanded-contract coverage (live):** ✔ endpoint names + primary/secondary role, arm labels/types (coarse control), sample size, phase, design/randomization/blinding string, incl/excl, duration. �’✗ **missing from live path:** endpoint timepoint, effect measure, CI, analysis population, disposition detail, protocol deviations, dose, multiplicity/missing-data/interim language — **all already have `csr_*` columns; only the extractor is absent.**

### 1.2 Study design
| Component | Class | Notes |
|---|---|---|
| `server/services/study-design/*` (18 files) | CANONICAL / DO-NOT-TOUCH-except-extend | Simulator (`trial-simulator.ts`), `sample-size.ts` (power+assurance), `evidence-prior.ts` (DerSimonian–Laird; **throws rather than invent**), `csr-evidence-source.ts` (`EvidenceObservation`), `design-gates.ts`, `design-validation.ts`, `study-twin-service.ts`. No fabrication. Mounted `/api/study-design`, `/api/c2c/study-twin`; used by AnA (`AnaToolExecutor.ts:295`). |
| `server/services/study-design-agent-service.ts` | LEGACY (retire — §7) | Orphaned (only in `SERVICE_REGISTRY`). Unbounded `csrReports` scan (`:140`), JS filter (`:143`), fixed relevance `0.9` (`:201`), fixed confidence `0.85`/`0.1`, templated per-indication fallbacks (`:235-706`), FS init (`:79`). |
| `server/protocol-knowledge-service.ts` | LEGACY (retire) | Orphaned (imported, never invoked). HF; fixed `relevanceScore 0.9`. |
| `server/services/endpoint-recommender-service.ts` | TRANSITIONAL (harden) | **Live** (`public-api.ts`, `ana-ri` command). Fabricates success rates (75/80), confidences (0.7/0.8/0.9), score boosts (+10/+15); broken success signal (no outcome column). |
| `server/services/sap-generator-service.ts` | TRANSITIONAL | Live (`biostatPlatform.ts`). Templated; sample-size already de-fabricated (refuses power w/o inputs). |
| `server/services/biostat-knowledge-graph-service.ts` | CANONICAL-adjacent | Live; success rates computed from real outcomes; LLM parse + heuristic confidence. |

### 1.3 Precedent + prediction + foresight (the existing CRL subsystem)
| Component | Class | Notes |
|---|---|---|
| `precedent.regulatory_precedents` (`20260306`) | CANONICAL | `decision_outcome` incl. **CRL / REFUSE_TO_FILE**, `fda_comments`, `fda_questions`, `risk_factors`, embedding. Org-**nullable** (global/tenant, `20260617`). **The `regulatory_outcomes` reuse target.** |
| `regulatory_intel.*` (`20260322`) | CANONICAL | `crl_trigger_patterns` (deficiency_signals, `typical_fda_language`), `crl_trajectory_records` (per-application cycles, `deficiency_details`, `final_outcome`), rtf/ema/advisory patterns, `precedent_application_rules`, `confidence_calibration_log`. Seeded with FDA/ICH-cited patterns. |
| `server/services/regulatory-precedent-intelligence/*` | CANONICAL | `crl-trigger-service.ts` etc. Mounted `/api/regulatory-precedent-intelligence`. **Fabrication:** cold-start `confidenceScore 0.2` (`:394`), count-based `0.3+count*0.02` (`:428`), surfaces seeded `frequencyRate` as "historical success rate" (`:451`). |
| `intelligence.*` (`20260520`) — `risk_model_versions`, `outcome_feature_vectors`, `risk_predictions`, `network_risk_priors`, `calibration_buckets` | CANONICAL | **The honest predictive loop** — logistic regression, targets `crl`/`rtf`/`first_cycle_approval`, holdout AUC/Brier, `MIN_TRAIN_SAMPLES=30`, refuses regressive versions; Platt calibration. **Home for CRL-influenced prediction (§7).** |
| `innovation.submission_outcomes` (`072`) | CANONICAL | Outcome ledger: `outcome_status`, `deficiencies_cited/_detail`, `had_rtf`, `complete_response`. RLS. **The `regulatory_outcomes` source of truth.** |
| `server/services/intelligence/outcome-precedent-ingestor.ts` | CANONICAL (harden) | `submission_outcomes` → `precedent.regulatory_precedents` (`complete_response`→CRL). **Fabrication:** hardcoded `confidence_score 0.9` (`:196`). |
| `server/services/precedent-engine.ts` | CANONICAL | Facade over precedent + CRL/RTF/EMA/advisory. Mounted `/api/precedent-engine`; client `PrecedentEngine.tsx`, `CrlPremortemPanel.tsx`. |
| `server/services/corpus/precedent-benchmark-reader.ts` | CANONICAL | Honest; Wilson CIs; gates on ≥8 trials; discloses completion≠approval proxy. |
| `server/services/csr-foresight-orchestrator.ts`, `foresight-*.ts` (ai-engine, csr-integration, knowledge-graph) | LEGACY / **DEPRECATED** | `/api/foresight-ai` behind `deprecate` (Sunset **2026-04-01**). Silent recalibration by averaging (`:314`), ±0.15 CIs, hardcoded phase success tables, auto dose from ≤3 MTD, invented biomarker correlations. **§6 removal targets.** |

### 1.4 AnA + retrieval + gateway
| Component | Class | Notes |
|---|---|---|
| `lumen_data_atoms` (+ `search_atoms_hybrid`, `lumen_atom_citations`, `lumen_knowledge_graph_edges`, `lumen_atom_conflicts`) | CANONICAL | `atom_type` unconstrained `text` → 9 new types need **zero DDL**. |
| `server/services/enhancedEmbeddingService.ts` | CANONICAL | `embedAtom`/`searchHybrid`; via gateway embedding provider (air-gap ok). ⚠ **model/dim discrepancy**: code default `text-embedding-3-small`/1536 vs column `vector(3072)`/`text-embedding-3-large` — verify before bulk CRL ingest. |
| `server/services/advancedRAGPipeline.ts` + `ragRouter.ts` | CANONICAL | Single retrieval seam; `filters.atomType`, `intent`, `artifactScope`, corpus. Add a `regulatory_precedent` intent or reuse `regulatory_qa`. |
| `server/services/ai-gateway/gateway.ts` | CANONICAL | `AIGateway.route`; **`structuredOutput<T>(prompt, schema)`** = the staged schema-extraction primitive. Prompt-injection + PII gates inside `route`. |
| `server/services/ana/AnaToolDefinitions.ts` + `AnaToolExecutor.ts` | CANONICAL | `registerToolHandler`; `ToolContext {organizationId, organizationUuid, projectId, userId}`. Existing `search_clinical_evidence` (CT.gov, not corpus), `project_knowledge_search` (atoms). **No CSR/precedent/CRL evidence tool in the Claude loop yet.** |
| `server/services/ana-ri/command-executor.ts` | CANONICAL (separate surface) | Slash-commands `searchPrecedents`/`analyzeCRLTriggers`/`analyzeRTFTriggers` → `precedentEngine` (not in the Claude tool loop). |
| `server/services/evidence/provenance.ts` (`EVIDENCE_SOURCES`, `buildProvenance`) | CANONICAL | Register `fda_crl` here to make CRL atoms citable/auditable. |

### 1.5 Tenancy + visibility
- **Primitive:** `organization_id` (INTEGER, FK `organizations`) + Postgres RLS; org resolved **from JWT only** (`server/middleware/tenantContext.ts`, GUC `app.current_tenant_id`). Sentinel `organization_id = 0` = shared.
- **§13 pattern already implemented:** the **precedent NULL-org idiom** (`20260617_precedent_org_isolation.sql`) — `organization_id NULL` = GLOBAL_PUBLIC, non-null = TENANT_PRIVATE, queried `(organization_id IS NULL OR organization_id = $org)`. **Build the visibility boundary on this.**
- **Gap:** no first-class 3-value visibility enum; PROJECT_PRIVATE would layer on `client_workspace_id`/`program_id`.
- **Convention hazard:** org-id type diverges by schema — `public/csr_* = INTEGER`, `regulatory_intel.* = UUID`, `precedent = INTEGER nullable`, `evidence.* = program-only`, `external_evidence_* = BIGINT`. **New CRE tables use INTEGER `organization_id`** to sit under the standard RLS.

---

## 2. Unified schema reconciliation (work-order §4 → target)

| Entity | Verdict | Canonical target / new table |
|---|---|---|
| `evidence_sources` | **REUSE + thin canonical** | Add `source_type` values (fda_crl, csr, protocol, sap…) + a CRE source view/registry over `evidence_sources`/`csr_reports`/precedent docs. Add missing columns (agency, application_number, visibility_class, checksum) on a CRE source table that references them — do not fork the corpus. |
| `clinical_studies` | **REUSE** | `csr_studies` is the rich identity + child tables. Provide a canonical-identity adapter; do not use the thin device `clinical_studies`. |
| `study_design_features` | **ADAPTER (thin overlay optional)** | Read over `csr_studies` design cols + `csr_endpoints` + `csr_statistical_analyses` + `csr_treatment_arms`. |
| `study_result_observations` | **ADAPTER** | Read over `csr_endpoint_results` (+ AE/safety). Preserve the study-design `EvidenceObservation` contract. |
| `regulatory_findings` | **NET-NEW (normalized) + reconcile** | New per-deficiency table linked to source(CRL)/application/study/endpoint; reconciles with `crl_trajectory_records.deficiency_details` + `submission_outcomes.deficiencies_detail`. |
| `regulatory_outcomes` | **REUSE** | `innovation.submission_outcomes` (+ `crl_trajectory_records.final_outcome`, `precedent.regulatory_precedents.decision_outcome`). Adapter, not a new table. |
| `evidence_relationships` | **REUSE one edge store** | Typed CRE edges; reuse `lumen_knowledge_graph_edges` or add a CRE edge table with the 13 relation types. |
| `design_lessons` | **NET-NEW** | Governed derived-intelligence object; the learning loop. |

---

## 3. Confidence-hygiene remediation (§6 / §14) — must clear before CRL evidence moves any prediction
1. `intelligence/outcome-precedent-ingestor.ts:196` — hardcoded `confidence_score 0.9` on every minted precedent → derive or leave null.
2. `regulatory-precedent-intelligence/crl-trigger-service.ts:394,424,428,451` — count-based/cold-start confidence; seeded `frequencyRate` surfaced as "historical success rate."
3. `csr-knowledge-extractor.ts:375,424,747,752` — fabricated PK, `confidence=|r|`, DLT 0.33, base-0.5.
4. `endpoint-recommender-service.ts` — fixed 75/80 success, 0.7/0.8/0.9 confidence, +10/+15 boosts.
5. **Deprecated foresight path** (`foresight-ai-engine.ts`, `csr-foresight-orchestrator.ts`, `foresight-csr-integration.ts`, `foresight-knowledge-graph.ts`) — ±0.15 CIs, hardcoded phase success tables, silent recalibration, auto dose from ≤3 MTD. Already Sunset 2026-04-01 → **retire under §8** rather than harden.

The **honest** path (`intelligence/risk-model.ts` + `calibration.ts` + `confidence_calibration_log`) is the home for CRL-influenced prediction.

---

## 4. Do-not-touch (canonical, out of scope for new functionality)
`server/services/study-design/*` (extend only, never fork), `intelligence/risk-model.ts` + `calibration.ts`, `ai-gateway/gateway.ts`, `enhancedEmbeddingService.ts` + `advancedRAGPipeline.ts` + `ragRouter.ts`, `precedent-engine.ts`, `evidence/provenance.ts`, `tenantContext.ts`/RLS. Add adapters and new tools **around** these.

---

## 5. Revised phased plan (re-scoped to the real codebase)
- **Phase 1 — Shared domain + net-new schema.** `server/services/clinical-regulatory-evidence/`: the analytical interface (types + service skeleton), + migration for `regulatory_findings`, `design_lessons`, a CRE evidence-relationship edge, and a canonical source/study identity/visibility layer that **links** existing tables (INTEGER org, NULL=global). Non-destructive.
- **Phase 2 — CSR adapter.** Map `csr_reports`/`csr_details` (+ the dead `csr_*` normalized schema) into the unified read interface; begin the staged extractor uplift (deterministic → gateway `structuredOutput` → reconciliation → confidence → human review), every value keeping source evidence.
- **Phase 3 — studyDesignEvidenceService.** Compose the existing simulator/power/prior/gates + precedent/CRL benchmarking + dose-strategy + regulatory-stress. Bypass the legacy agent.
- **Phase 4 — CRL ingestion.** Official FDA CRL → one CRE source + application + linked studies + `regulatory_findings` + reuse `regulatory_outcomes` + CTD/ICH-E3/design mappings + atoms. Reconcile with `crl_trajectory_records`.
- **Phase 5 — Atoms + AnA.** 9 atom types into `lumen_data_atoms`; 5 AnA tools wired to `ragRouter` + `precedentEngine`; register `fda_crl` provenance source.
- **Governance (cross-cutting) — §13/§14/§16.** Tenant-isolation tests on the NULL-org boundary; a statistical-evidentiary guard (every metric carries numerator/denominator/missing/filters/method/verification/date) + unsupported-claim linter; eval harnesses.
- **Phase 7 — Prediction governance.** Route CRL influence only through the honest logistic path, gated on holdout eval.
- **Phase 8 — Legacy retirement.** Deprecate/quarantine `study-design-agent-service.ts`, `protocol-knowledge-service.ts`, the foresight path, and the score-fabricating parts of `endpoint-recommender-service.ts`, with a documented plan.
- **Phase 6 — UX (Claude Design owns).** CSR Intelligence regulatory-outcome dimension, Study Design evidence panel, FDA CRL Library as a view over the spine, traceability view. A design data sheet accompanies the backend.

---

*Phase 0 complete. Subsequent phases reference this matrix; any component reclassification updates this file.*
