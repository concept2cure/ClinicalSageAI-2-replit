# AnA Tool Coverage Gap Analysis — 2026-04-27

> Tool-coverage audit for AnA, the regulatory intelligence assistant. Compares the 18 currently-wired Claude function-calling tools against (a) the capabilities AnA promises clients via prompts and slash commands, (b) the backend services that exist but are not invokable as tools, and (c) the high-friction workflows in each major regulatory submission type.
>
> Findings produced by an exploration sub-agent reading the codebase. Cited claims have been spot-checked but not exhaustively verified — treat counts and exact line references as approximate.

## Layer 1 — Currently wired tools (18 custom + 3 server)

Source: `server/services/claude/ClaudeToolDefinitions.ts` `ALL_CLAUDE_TOOLS`.

| Category | Tools |
| --- | --- |
| Search & literature | `search_clinical_evidence`, `search_literature` |
| Regulatory lookup | `lookup_fda_guidance`, `lookup_ich_guideline` |
| Validation & compliance | `check_regulatory_compliance`, `validate_cross_references`, `generate_citation` |
| Document intelligence | `analyze_predicate_device`, `extract_document_structure`, `mine_precedents` |
| Integrity checking | `check_numerical_integrity`, `check_dossier_consistency` |
| Document generation | `generate_document`, `build_from_template`, `ind_generate_section`, `ind_get_status` |
| Rendering | `rasterize_page`, `pdf_overlay` |
| Anthropic server tools | `web_search`, `web_fetch`, `code_execution` (env-gated) |

## Layer 2 — Capabilities promised by prompts/commands but not backed by tools

These domain prompts (`config/domain-prompts.ts`) and capability registry entries (`server/services/ana-capability-registry.ts`) trigger AnA but resolve through prompting alone — no tool fetches data or performs the action:

- **Multi-agency strategy** — EMA Scientific Advice, PMDA bridging, Health Canada CTA, China NMPA MRCT prompts exist; no tool retrieves agency-specific requirements or validates alignment.
- **Statistical & protocol design** — Biostatistics prompts (dose escalation, sample size, power) have no statistical-validation tool.
- **CMC comparability & change impact** — `cmc-change`, `cmc-compare` prompts exist; no tool queries comparability precedents.
- **Foresight risk/timeline** — `foresight-timeline`, `foresight-risk` prompts route to `foresight-ai-engine.ts` (75KB) but it isn't exposed as a tool.
- **Pharmacovigilance readiness** — `pv-readiness` prompt exists; no tool validates PSMF/REMS/J-RMP/RMP infrastructure.

## Layer 3 — Backend services without tool exposure

Substantive services that look like missing tool exposures:

| Service | Size | What a tool would unlock |
| --- | --- | --- |
| `server/services/precedent-engine.ts` | 60KB | "Analyze precedent risk", "compare submission against approved precedents". Embedding similarity + historical CRL/RTF triggers. |
| `server/services/submission-twin-service.ts` | 51KB | Claim-to-evidence integrity, narrative drift, simulated regulator challenges. |
| `server/services/foresight/foresight-ai-engine.ts` | 75KB | Predictive timeline, readiness scoring, risk projection. |
| `server/services/csr/csr-builder.ts` + `csr-extractor-service.ts` | — | Structured ICH E3 CSR generation + extraction with compliance checking. |
| `server/services/intelligence/rim.ts` + ecosystem | 7 services | RIM signal capture, judgment scoring, trend analysis. Currently invisible to clients (intentionally — internal); but a *constrained* read-only tool ("explain this signal") could surface ground-truth insights. |
| `server/services/cognitive-ecosystem/agent-runtime.service.ts` | LangGraph | Multi-agent workflows, federated learning runtime. Not invokable as discrete tools. |
| `server/services/cortex/cortexPrimeService.ts` | 35KB | Compliance inference, pattern analysis. Used internally; not a tool. |

## Layer 4 — Regulatory workflow gaps by submission type

### 510(k) — medical devices
- `validate_substantial_equivalence_draft` — automated SE table completeness + predicate alignment check
- `assess_estar_readiness` — eSTAR template completeness, file format compliance
- `lookup_device_recalls_and_mdrs` — MDR/recall integration to surface predicate risk

### PMA — high-risk devices
- `validate_design_controls_820_30` — 21 CFR 820.30 documentation check
- `assess_cdx_codevelopment_risk` — companion diagnostic alignment
- `generate_gmp_audit_checklist` — facility readiness pre-inspection

### IND / NDA — drugs
- `validate_protocol_statistical_design` — SAP generator with power/sample-size analysis
- `assess_cmc_consistency` — cross-module drug substance/product alignment
- `validate_form_1571_3674_completeness` — FDA form assembly check

### CER — EU MDR
- `systematic_literature_review_executor` — structured PE planning + screening
- `validate_equivalence_demonstration` — algorithm comparing predicate claims
- `generate_pmcf_plan` — post-market clinical follow-up plan

### IVDR — EU diagnostics
- `validate_performance_evaluation_design` — analytical + clinical validation blueprint
- `check_common_specifications` — IVDR Annex compliance

### eCTD assembly
- `validate_ectd_leaf_integrity` — file structure, naming, metadata
- `check_ectd_lifecycle_operations` — replace/delete/append validation
- `validate_ectd_hyperlinking` — cross-module reference consistency

### Cross-jurisdiction
- `convert_dossier_pmda_format` — J-CTD assembly from CTD
- `validate_health_canada_cta_nds` — bilingual labeling, reference-product alignment
- `map_china_nmpa_dossier` — CDE data format, MRCT requirements

## Top 5 highest-value additions (judgment call)

1. **Expose the Precedent Engine.** `lookup_regulatory_precedents` + `compare_submission_against_precedent`. The 60KB engine already exists; not surfacing it as a tool means Claude can't ground risk claims in actual approved-submission data. Highest-ROI single addition.
2. **Submission Twin invocation.** `assess_claim_evidence_integrity`, `simulate_reviewer_challenges`, `predict_change_impact`. The service exists at 51KB; client value is risk reduction during drafting before reviewers see drift.
3. **Statistical design + SAP generator.** `design_statistical_analysis_plan`, `validate_protocol_design`. Biostat is high-friction for regulatory teams and Foresight prompts already advertise the capability without a tool to back it.
4. **eCTD assembly integrity.** `validate_ectd_structure`, `check_ectd_leaf_metadata`, `validate_ectd_hyperlinking`. Mechanical but painful — a deterministic checker is straightforward to ship and would prevent rejection at submission.
5. **510(k) eSTAR + SE readiness.** `validate_substantial_equivalence_draft`, `assess_estar_readiness`. The most-used device pathway; both pre-empt RTA/RTF cycles which cost weeks.

## Caveats

- This audit catalogs *capability gaps in the tool surface*, not product priority. Some gaps map to backend services that already exist (Precedent Engine, Submission Twin, Foresight) — those are wiring tasks, not new builds, and would deliver fastest.
- Layer 3 services are described as "not invokable as tools." They may be invoked indirectly through orchestration / context injection. The question for each is whether *Claude calling them as a structured tool with typed args* would unlock value beyond the current implicit usage. For Precedent Engine and Submission Twin, the answer is clearly yes. For RIM internals, the answer is no — internal-only by design (CLAUDE.md: "Do not expose RIM scores directly to end users").
- "Missing for clients" depends on which clients. Device-heavy customers care most about #5 (510(k) eSTAR/SE) and CER tools. Drug-heavy customers care most about #3 (statistical design) and CMC consistency. eCTD assembly (#4) cuts across both.
