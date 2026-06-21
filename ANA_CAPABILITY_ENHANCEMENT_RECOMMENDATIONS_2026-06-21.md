# AnA Capability Enhancement — Recommendations for MDX, Biotech & Pharma Document/Report Generation

**Date:** 2026-06-21
**Author:** Platform engineering (capability study)
**Scope:** What to add to AnA to improve regulatory document & report generation for medical-device/IVD/MDX, biotech, and pharma clients.
**Method:** Inventoried AnA's live tool surface (**286 registered tools**) and supporting services, then separated *latent* capability (built, not reachable by AnA) from *genuinely absent* capability.

---

## 0. The headline

AnA is already one of the most complete regulatory authoring agents you could build: 286 tools spanning live ClinicalTrials.gov / PubMed / bioRxiv / ChEMBL / openFDA (MAUDE, FAERS, recalls, approvals, labels) / CMS-MolDX / ICD-10 data, native Word + OOXML doc-surgery + sandboxed Python/R + container compute, full eCTD/eSTAR/PDF-A assembly, Part 11 e-signature, citation grounding, and 50+ global regulatory advisors.

So the win is **not** "add more breadth" — it's three sharper moves:

1. **Unstrand latent engines** already in the codebase but invisible to AnA (highest ROI, lowest effort).
2. **Add the 4–5 net-new *data/standards* services** that the regulated doc workflow genuinely lacks (coding dictionaries, CDISC, live guidance, EU data).
3. **Add segment differentiators** (HEOR for MDX, SPL/IDMP labeling, RWD, validated analytics).

---

## Tier 1 — Quick wins: expose capability that already exists (weeks, not quarters)

These are built and tested; they just aren't wired as AnA-selectable tools. Each is a thin tool-definition + executor-handler shim over an existing service.

### 1.1 Stranded biostatistics engines → 9 new deterministic tools  ⭐ highest ROI
`server/services/stats/` contains nine production engines with **zero** AnA tools and no exposed tool that reaches them (verified):

| Engine (file) | Proposed tool | Client value |
|---|---|---|
| `mmrm-design.ts` | `design_mmrm` | Longitudinal trial SAPs (pharma/biotech) |
| `group-sequential-oc.ts` | `design_group_sequential` | Interim analyses, adaptive trials |
| `dose-finding-boin.ts` | `design_dose_finding` | Oncology Phase 1 (biotech) |
| `win-ratio.ts` | `analyze_win_ratio` | Composite endpoints (cardio/CRM) |
| `rmst.ts` | `analyze_rmst` | Survival without PH assumption |
| `mrmc.ts` | `design_mrmc_reader_study` | **Imaging/AI device** pivotal studies (MDX) |
| `external-control.ts` | `design_external_control` | Rare disease, single-arm (biotech) |
| `signal-disproportionality.ts` | `analyze_safety_signal` | PV signal detection (ROR/IC/EBGM) (pharma) |
| `multiplicity.ts` | `adjust_multiplicity` | Multiple-endpoint control |

**Why it matters:** these turn AnA from "advises on study design" into "computes the defensible statistic and writes the justified SAP/CSR section." Deterministic engines are far more Part-11-defensible than ad-hoc generated stats.

### 1.2 Dossier-wide numerical & cross-reference reconciliation
`check_numerical_integrity` and `check_dossier_consistency` exist but operate per-document. The recurring reviewer finding is **numbers that disagree across modules** (enrollment in 2.5 vs 2.7.3 vs the CSR; an n that drifts between SAP and results). Add `reconcile_dossier_numbers` that walks every artifact in a submission and flags divergent figures with their source spans — leveraging the existing `data-lineage-service.ts` + `artifact_citations`.

### 1.3 First-class 510(k) / eCTD assembly tools
`FDA510kService.ts`, `submissionPackageBuilder.ts`, and the full `server/services/ectd/*` pipeline are production-ready but only reachable through project workflows, not as AnA tools. Expose `assemble_510k_package` and `assemble_ectd_sequence` so AnA can drive end-to-end assembly conversationally (assembly tools like `assemble_ectd_module_from_artifacts` exist; this completes the set to whole-submission).

### 1.4 Predicate/precedent depth
`analyze_predicate_device`, `mine_precedents`, and `compare_submission_against_precedent` are wired, but `regulatory-precedent-intelligence/` + `corpus/precedent-benchmark.ts` carry deeper predicate-adequacy scoring that isn't surfaced. Add `score_predicate_adequacy` (substantial-equivalence risk per candidate predicate) — the single most consequential 510(k) decision.

---

## Tier 2 — Net-new services with the highest regulatory ROI

These are genuinely absent and are load-bearing for submission-grade output.

### 2.1 Medical coding dictionaries — MedDRA + WHODrug  ⭐ (pharma/biotech)
No auto-coding service exists. Safety narratives, CSR AE tables, PSURs/DSURs, and **E2B(R3) ICSRs** all require AE→MedDRA and drug→WHODrug coding. Add a coding service + tools `code_meddra` / `code_whodrug` (license-gated dictionaries). Without this, every safety document needs manual coding downstream.

### 2.2 CDISC pipeline — SDTM/ADaM + define.xml + Pinnacle21-style validation ⭐ (pharma)
FDA data submissions require SDTM/ADaM datasets, `define.xml`, and a clean validator report. None of this exists today. Add a CDISC service: dataset conformance checks, `define.xml` generation, and a validation-rules engine (the existing `validate-completeness-engine.ts` is a natural host). This is the difference between "writes the CSR" and "ships the data package the CSR describes."

### 2.3 Live regulatory-guidance ingestion (FDA/EMA/PMDA/MHRA/NMPA)
Guidance knowledge is currently **embedded/static** in code (`ich-guideline-corpus.ts`, `global-ri/*`). Add a connector service that ingests and freshness-stamps live guidance (FDA guidance repository, EMA, MHRA, openFDA), so `lookup_fda_guidance` / `lookup_ich_guideline` cite the *current* document and AnA can flag "guidance changed since this section was drafted." Pair with a `guidance_change_radar` tool.

### 2.4 EU data connectors — EUDAMED + EMA EPAR/PRIME + EU CTIS (MDX/IVDR + pharma)
The platform has EU *advisors* (`eu-techdoc-advisor.ts`, IVDR rules) but **no live EU data**. For device/IVD clients under MDR/IVDR and pharma under EMA, add connectors: EUDAMED (devices/UDI), EMA EPAR/PRIME, and EU CTIS (clinical trials) — mirroring the existing US openFDA/ClinicalTrials integrations. This closes the biggest geographic gap.

---

## Tier 3 — Segment differentiators

### 3.1 Health economics & market access modeling (MDX/diagnostics) ⭐
`search_medicare_coverage` looks up coverage but there's no **modeling**. For MDX/diagnostics reimbursement, add budget-impact and cost-effectiveness (ICER) modeling + AMCP-format payer dossier generation. This is the revenue-defining deliverable for molecular-diagnostics clients and is currently absent.

### 3.2 SPL (Structured Product Labeling) + EU IDMP (pharma labeling)
Labeling tools exist (`create_labeling_document`, `add_labeling_symbol/translation`) but not FDA **SPL XML** generation/validation or EU **IDMP** identifiers — the actual machine-readable labeling artifacts FDA/EMA ingest. Add `generate_spl` / `validate_spl` and IDMP support.

### 3.3 Real-world data connectors (RWE submissions)
`advise_rwe_design` exists but no RWD *sources*. Add connectors (Medicare LDS/claims, FDA Sentinel, registry/EHR networks) so AnA can move from advising on RWE to assembling it — increasingly required for label expansions and device post-market.

### 3.4 Validated analytics runtime profile
`run_python_script` / `run_in_container` can run R/Python today. Add a **qualified** runtime profile: pinned, version-locked statistical packages (R + validated libraries), with the run hash + environment captured to the audit trail — so a computed result is submission-grade, not just "an LLM ran some code." This rides directly on the `runtimeProfile` machinery in `workers/artifact-compute/runner.ts`.

### 3.5 Reference management & house-style QC
For CERs, clinical overviews, and IBs: add a reference-manager tool (RIS/Zotero/EndNote import, Vancouver/AMA auto-formatting) and surface the existing redline/version diff (`coauthor_document_versions`) + readability (`assess_readability`) as accept/reject and style-lint tools in the authoring surface.

### 3.6 Linguistic validation for global labeling
`add_labeling_translation` exists; add a regulated MT + back-translation/linguistic-validation workflow for multi-region labeling (EU 24-language IFUs, JP).

---

## Segment cheat-sheet (what each client gains)

| Client | Biggest wins (in priority order) |
|---|---|
| **MDX / molecular diagnostics & devices** | MRMC reader-study tool (1.1) · predicate-adequacy scoring (1.4) · 510(k) assembly tool (1.3) · **HEOR/payer modeling (3.1)** · EUDAMED/IVDR data (2.4) |
| **Biotech** | Dose-finding + external-control + RMST tools (1.1) · CDISC pipeline (2.2) · validated analytics runtime (3.4) · live guidance radar (2.3) |
| **Pharma** | MedDRA/WHODrug coding (2.1) · CDISC/define.xml (2.2) · safety-signal + MMRM + group-sequential tools (1.1) · dossier numerical reconciliation (1.2) · SPL/IDMP labeling (3.2) · EU EMA/CTIS data (2.4) |

---

## Suggested sequencing

1. **Sprint 1 (pure leverage):** Tier 1.1 (9 stats tools) + 1.2 (dossier reconciliation). Thin shims over tested engines; immediately visible in every CSR/SAP/safety doc.
2. **Sprint 2:** Tier 1.3/1.4 (510k/eCTD assembly + predicate scoring) — completes the device/submission story.
3. **Quarter 2:** Tier 2.1 (MedDRA/WHODrug) + 2.2 (CDISC) — the two services that unlock submission-grade pharma data packages.
4. **Quarter 2–3:** Tier 2.3/2.4 (live guidance + EU data connectors) — geographic and freshness parity.
5. **Quarter 3+:** Tier 3 differentiators, prioritized by client mix (HEOR first if MDX-heavy; SPL/IDMP first if pharma-labeling-heavy).

Every Tier 1 item ships behind the existing tool-registration pattern (`AnaToolDefinitions.ts` + `AnaToolExecutor.ts`) with the same tenant-scoping and Part 11 audit already in place — no new architecture required.
