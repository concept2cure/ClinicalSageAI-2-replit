# AnA Deterministic Intelligence — Design Handoff

**Audience:** Claude Design (UI/UX)
**Author:** AnA platform engineering
**Status:** Specification for UI that surfaces the deterministic intelligence layer. This document describes *capabilities and data contracts only* — it does **not** prescribe components, and no UI was built as part of this work. Build against the governed registry, the Anthropic/Claude design philosophy, and the stone palette already established in the project.
**Date:** 2026-06-30

---

## 1. What this is

AnA now carries **142 new deterministic, registry-grade tools across 24 regulatory-science domains**, added in four waves. Every one of these tools is a **pure function** — no LLM, no network, no database — that takes a typed input and returns typed, citation-backed, submission-defensible output. Identical input always yields identical output.

This matters for design because these outputs are **the highest-trust content AnA can produce**. The UI's job is to make that trust *legible* — to visibly separate a bulletproof registry computation (e.g. a TTC calculation under ICH M7, an ICH E9(R1) estimand, a Naranjo causality score) from a model-generated narrative that requires verification.

AnA exposes **556 total tool handlers**; the 142 documented here are the deterministic subset. They surface through the existing AnA chat surface as tool calls — the user asks a question, AnA selects and runs the relevant tool(s), and the structured result is returned for rendering.

---

## 2. The determinism pedigree system (the core UI primitive)

Every tool output carries a **determinism pedigree** — a 5-level trust classification. This is the single most important concept the UI must render. It already exists in code at `server/services/ana/tool-pedigree.ts`. The 142 new tools are all classified `deterministic_registry`.

| Pedigree | Deterministic | Trust | Meaning (verbatim guidance the UI should echo in tooltips) |
|---|---|---|---|
| `deterministic_registry` | yes | **high** | Pure rule/registry lookup — no LLM, no network. Reproducible and bulletproof; may be cited directly as a deterministic fact (confirm against the governing citation it returns). |
| `deterministic_query` | yes | **high** | Pure query over governed internal data — no LLM. Reproducible for the same data snapshot; may be relied on directly (note the data version when records can change). |
| `rim_learned` | no | **medium** | RIM learned pattern — accumulated from deterministic outputs over time, tenant-scoped, occurrence-weighted. Cite pattern confidence + occurrence count; flag low-occurrence for verification. |
| `external_api_live` | no | **medium** | Live external authority API — authoritative but time-varying. Cite the source and verify currency (results can change between calls). |
| `model_assisted` | no | **requires_verification** | Model-generated; verify against a cited primary source before relying. |

**Design requirement — `PedigreeBadge`:** a small inline pill that renders on every AnA message/result carrying a pedigree. Five distinct visual states mapped to the levels above, each with an icon, a one-word label, and a tooltip carrying the guidance string. The two `deterministic_*` levels should read as the calmest, most confident states; `model_assisted` should read as the most cautionary. Use the stone palette — do **not** introduce a new color system. Suggested semantic mapping (designer's discretion): deterministic → olive/confident, external/rim → blue/neutral, model_assisted → terracotta/attention. Color must never be the only signal (icon + label required).

---

## 3. The full intelligence catalog (24 domains, 142 tools)

Each tool below is a `deterministic_registry` function. The "what it returns" column describes the shape the UI binds to; all return structured objects with arrays of findings, recommendations, and a `citations`/regulatory-reference field. Tool names are the stable identifiers AnA uses.

### Wave 1 — Core development science (6 domains, 34 tools)

**Bioequivalence & generic drugs** — `classify_bcs`, `design_be_study`, `assess_dissolution_similarity`, `assess_biowaiver`, `guidance_for_anda`
**Pharmacometrics** — `design_popk_study`, `evaluate_pbpk_model`, `analyze_exposure_response`, `advise_midd`, `select_dose`
**Preclinical toxicology** — `select_tox_species`, `design_repeat_dose_study`, `calculate_safety_margin`, `design_genotox_battery`, `assess_carcinogenicity_need`, `design_repro_tox_study`
**Pediatric development** — `classify_pediatric_age`, `design_pediatric_investigation`, `assess_pediatric_extrapolation`, `select_pediatric_formulation`, `select_pediatric_dose`, `assess_pediatric_requirements`
**Advanced therapy (ATMP/CGT)** — `classify_atmp`, `assess_gene_therapy_requirements`, `assess_cell_therapy_manufacturing`, `assess_cart_requirements`, `select_atmp_pathway`, `assess_atmp_comparability`
**Real-world evidence** — `design_target_trial`, `score_rwe_data_source`, `design_propensity_analysis`, `select_rwe_design`, `assess_rwe_bias_risk`, `assess_rwe_regulatory_acceptability`

### Wave 2 — Regulatory & quality (6 domains, 36 tools)

**Clinical pharmacology** — `classify_ddi_risk`, `assess_qtc_risk`, `design_organ_impairment_study`, `classify_cyp_phenotype`, `design_bioanalytical_method`, `assess_food_effect`
**CMC quality** — `design_stability_study`, `validate_analytical_method`, `classify_impurity`, `set_specifications`, `assess_process_validation`, `assess_comparability_protocol`
**Regulatory strategy** — `assess_expedited_program`, `plan_fda_meeting`, `assess_orphan_designation`, `select_505_pathway`, `assess_rolling_submission`, `compare_global_pathways`
**Biosimilar development** — `assess_analytical_similarity_biosimilar`, `design_biosimilar_clinical`, `assess_indication_extrapolation`, `assess_interchangeability`, `plan_biosimilar_ip_strategy`, `assess_biosimilar_cmc`
**Mutagenic impurity (ICH M7)** — `classify_mutagenic_impurity`, `calculate_ttc`, `assess_structural_alerts`, `design_purge_study`, `assess_nitrosamine_risk`, `control_mutagenic_impurity`
**Labeling** — `assess_plr_structure`, `assess_boxed_warning`, `design_rems`, `assess_pregnancy_lactation_labeling`, `structure_smpc`, `assess_otc_labeling`

### Wave 3 — Clinical & safety (6 domains, 36 tools)

**Immunogenicity** — `assess_immunogenicity_risk`, `design_ada_assay_strategy`, `classify_immunogenicity_clinical_impact`, `design_nab_assay`, `plan_immunogenicity_sampling`, `assess_immunogenicity_comparability`
**Safety pharmacology** — `design_core_battery`, `assess_cardiovascular_safety_pharmacology`, `assess_cns_safety_pharmacology`, `assess_respiratory_safety_pharmacology`, `design_followup_safety_study`, `assess_abuse_liability`
**Pharmacovigilance & signal detection** — `classify_expedited_reporting`, `assess_pv_causality`, `plan_aggregate_safety_report`, `detect_safety_signal`, `assess_signal_priority`, `design_pv_system`
**Clinical outcome assessment (COA/PRO)** — `select_coa_type`, `assess_coa_validation`, `determine_meaningful_change`, `assess_coa_fit_for_purpose`, `position_coa_endpoint`, `plan_coa_development`
**Oncology dose optimization (Project Optimus)** — `select_dose_finding_design`, `assess_project_optimus_alignment`, `design_randomized_dose_comparison`, `select_rp2d`, `design_backfill_strategy`, `assess_dose_exposure_response`
**Combination products** — `determine_primary_mode_of_action`, `classify_combination_product`, `plan_combination_cgmp`, `design_human_factors_study`, `assess_device_constituent_controls`, `select_combination_submission_pathway`

### Wave 4 — Trials, GMP & specialized (6 domains, 36 tools)

**Trial statistics & estimands** — `define_estimand`, `assess_intercurrent_event_strategy`, `plan_multiplicity_control`, `design_adaptive_design`, `select_missing_data_strategy`, `estimate_sample_size`
**GMP quality systems & data integrity** — `assess_data_integrity`, `design_capa`, `classify_gmp_deviation`, `assess_api_gmp`, `design_sterile_controls`, `assess_computer_system_validation`
**Nonclinical PK/ADME & toxicokinetics** — `design_adme_program`, `design_mass_balance_study`, `assess_metabolite_safety`, `design_toxicokinetics`, `design_reaction_phenotyping`, `assess_protein_binding`
**Biomarkers & companion diagnostics** — `classify_biomarker`, `plan_biomarker_qualification`, `design_cdx_codevelopment`, `assess_biomarker_analytical_validation`, `assess_biomarker_clinical_validation`, `plan_enrichment_strategy`
**Rare disease & external control arms** — `design_natural_history_study`, `design_external_control`, `assess_small_population_design`, `plan_bayesian_borrowing`, `assess_rare_disease_endpoint`, `plan_rare_disease_program`
**GCP & clinical trial operations** — `design_monitoring_plan`, `assess_inspection_readiness`, `assess_gcp_compliance`, `design_informed_consent`, `classify_protocol_deviation`, `plan_essential_documents`

---

## 4. Output shape (what every result contains)

The tools return heterogeneous typed objects, but they share a recognizable spine the UI can rely on:

- **A headline verdict / classification** — e.g. a risk tier, a BCS class, a pedigree, a "ready / gaps / not_ready" status, a recommended design name, a numeric result (TTC in µg/day, sample size n, Naranjo score).
- **Structured detail** — arrays of per-item findings, per-attribute assessments, per-section outlines, decision-table evaluations.
- **Rationale** — an ordered list of plain-language reasons.
- **Recommendations / next actions** — ordered, often prioritized.
- **Citations** — named regulatory references (FDA/EMA/ICH guidance, CFR sections). These are first-class and must be visible: they are *the* differentiator of deterministic content.
- **Warnings** — validation notes or caveats.

**Design implication:** a result is not a paragraph — it is a small structured record. The recurring atoms are: a **verdict header**, a **severity/trust-graded list**, a **citations block**, and a **recommendations block**. A reusable "deterministic result" rendering pattern would serve dozens of tools.

---

## 5. Surfaces to design (requirements, not designs)

All of these are *chat-first*. Per the project's chat-first standard, the home of this intelligence is the AnA conversation; the surfaces below augment it, they do not replace it with dashboards.

1. **PedigreeBadge** (highest priority) — inline trust pill on every AnA result. Section 2 is the full spec. This is the keystone; nothing else lands without it.

2. **Deterministic result card** — the shared rendering pattern from Section 4: verdict header + severity-graded findings list + citations block + recommendations. One governed pattern, reused across all 142 tools. Findings grouped by severity (errors/critical first). Empty/uncertain states handled (e.g. `not_assessed`, `insufficient_evidence`).

3. **Citations affordance** — citations are dense and authoritative (CFR sections, ICH codes, dated FDA guidance). Design a consistent way to present them: visible by default, scannable, not buried. Consider a citation chip/footnote treatment that reads as "this is sourced," reinforcing the deterministic trust signal.

4. **ValidationSummaryPanel** (already requested) — for the tools that return pass/fail findings against a standard (CDISC, SPL, GCP compliance, data integrity, inspection readiness): header with title + standard badge + valid/invalid indicator; findings grouped by severity with rule code, message, optional domain label; empty state when clean.

5. **Domain capability index (optional, secondary)** — a calm, scannable reference of what AnA now knows (the 24 domains / 142 tools). Not a dashboard — a quiet "capabilities" reference so users can discover that AnA can, e.g., compute a TTC or design an estimand. Read-only, low-chrome.

**Hard constraints (from the project's standing rules):**
- Use only the governed component registry (`client/src/component-registry.ts`); no raw `<button>`/`<input>`, no custom status pills, no local empty states.
- Use the existing stone palette (cream `#faf9f5`, terracotta `#d97757`, olive `#788c5d`, blue `#6a9bcc`) and Tailwind config — do not generate a new token system.
- Anthropic/Claude design philosophy: calm, intelligent, restrained. Sentence case, no emoji, reviewer-grade voice, 200ms ease-out motion.
- Convergence: before adding any shell-level surface, follow the "UI Convergence and Legacy Surface Deletion" rules in `CLAUDE.md` (replace-or-delete).
- Accessibility: WCAG 2.2 AA; color never the only signal; full keyboard support.

---

## 6. Where the data lives (for engineering wiring, FYI for design)

- Pedigree definitions + trust metadata: `server/services/ana/tool-pedigree.ts` (`PEDIGREE_LEVELS`).
- Tool definitions (names, descriptions, input schemas): `server/services/ana/*Tools.ts` (one file per domain).
- Tool registry: `ALL_ANA_TOOLS` in `server/services/ana/AnaToolDefinitions.ts`.
- Handlers / execution + pedigree classification: `server/services/ana/AnaToolExecutor.ts`.
- Knowledge bases (the deterministic logic + citations): `server/services/<domain>/<domain>-knowledge.ts`.

Each tool's `input_schema` (JSON Schema in the `*Tools.ts` files) is the authoritative contract for any input affordance the UI might offer; each knowledge-base function's result interface is the authoritative contract for rendering output.

---

## 7. One-line brief for the designer

> Make deterministic regulatory intelligence *look* as trustworthy as it is: ship the PedigreeBadge first, give every tool result one calm, citation-forward rendering pattern, and keep all of it chat-first inside the governed stone-palette system.
