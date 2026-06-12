# Scientific & Domain Knowledge — Current Acuity and Enhancement Plan

**Date:** 2026-06-12
**Author:** AnA engineering (knowledge-enhancement initiative)
**Branch:** `claude/knowledge-enhancement-client-value-jkh402`
**Scope:** Assess the platform's current scientific, statistical, molecular, biological, chemistry, neuroscience, and oncology knowledge depth; define a concrete, prioritized plan to deepen it into **direct, billable client value across all markets** (biotech, pharma, medtech/IVD, CRO, and payer/market-access).

This brief is grounded in a code-level audit of `server/services/`, `shared/`, `server/data/`, and `server/api/cmc/`. It names real files so the plan is actionable, not aspirational. It follows this repo's discipline: **honesty over hype** — where a capability is a stub, it is named as a stub.

---

## 1. Executive assessment — what we actually know today

The platform's knowledge is **deep and real on the regulatory/clinical/statistical axis, and thin-to-absent on the discovery/molecular/translational axis.** The product is named "Concept2Cure," but its knowledge currently begins at roughly IND and runs forward. The "concept" end is the largest untapped value.

| Domain | Depth today | Where it lives | Honest verdict |
|---|---|---|---|
| **Biostatistics / statistics** | **Production-grade** | `server/services/stats/` (~23 modules), `server/services/biostatistics-judgment/`, `server/services/ana-biostats/`, `statistical-defensibility-service.ts` | Real deterministic math: exact group-sequential OC (Armitage–McPherson–Rowe; O'Brien-Fleming/Pocock), RMST survival, Bayesian device, BOIN, multiplicity (Bonferroni/Holm/Hochberg/graphical), win-ratio, PRR/ROR. Auditable, reproducible (seeded RNG). **Strongest asset.** |
| **CMC — regulatory authoring** | **Strong** | `server/services/cmc/` (qbd-analyzer, ich-compliance-rules, control-strategy-generator, supac-classifier, readiness), `server/api/cmc/` (Module 3 OS) | Deterministic CQA/CPP derivation, ICH Q1A–Q10 rule checks, SUPAC/variation classification, control-strategy gap analysis. Genuine. |
| **CMC — molecular chemistry** | **Stub** | `shared/cmc-schema.ts`, `server/api/cmc/types.js` | SMILES/InChI/MW are *stored*, never *computed on*. No RDKit, no canonicalization, no descriptor/impurity/nitrosamine (ICH M7) prediction, no stability extrapolation. |
| **Biology / oncology / IVD** | **Genuinely curated** | `server/services/ivd-knowledge/scientific/biomarker-validity.ts` (+`-2.ts`), `clinical-areas.ts`, `foresight-knowledge-graph.ts` | 20+ oncology biomarkers with assay-specific scoring (PD-L1 TPS/CPS, HER2 reflex, EGFR exon-specific, MSI/dMMR, TMB, HRD/BRCA, ROS1/NTRK/RET/MET), HLA/immunohematology/autoimmune corpus, translational biomarker↔endpoint graph. Citations to NCCN/CAP/IASLC. **Second strongest asset.** |
| **Clinical pharmacology** | **Real (math)** | `server/services/clinical-pharmacology/` (exposure-response-engine, concentration-qtc, ddi-static-model, pk-characterization) | Emax/logistic exposure-response, Project Optimus dose optimization, static DDI, C-QTc. Genuine math, oncology-leaning. |
| **Neuroscience / CNS** | **Absent (curated)** | — | No CNS biomarker/endpoint corpus comparable to oncology. CNS is the single largest *therapeutic-area* gap relative to market demand. |
| **External scientific evidence** | **Half-activated** | `server/services/integrations/` (9 live APIs), `server/services/connectors/connector-registry.ts` | PubMed, ClinicalTrials.gov, openFDA (Drugs/Labels/FAERS/MAUDE), CMS, ICD-10 are **live and wired to AnA**. ChEMBL (compounds/bioactivity/ADMET) and bioRxiv/medRxiv are **available but deliberately unused** — the discovery connective tissue is dormant. |
| **Core reasoning (RIM + AnA)** | **Sound architecture, empty corpus** | `server/services/intelligence/` (rim, pattern-registry, judgment-framework), `server/services/ana-ri/` (persona, ich-guideline-corpus [995 lines], use-case-playbooks, agency-tactics), `server/services/ai-gateway/` | Deterministic rules + Claude-first multi-provider gateway. Architecturally correct for a regulated setting (no black-box weights). But pattern/outcome corpus is near-empty, so "learns over time" is currently "learns when fed." |

**One-sentence summary:** *We have a reviewer-grade regulatory/biostatistics/IVD brain with real curated oncology knowledge, sitting on top of an inactive discovery/translational nervous system and a half-stocked memory.* The enhancement opportunity is to **connect and deepen what already exists**, not to rebuild.

---

## 2. The strategic gap that maps directly to client value

Clients in every market ask the same underlying question: *"Given my molecule/device and my target indication, what is the fastest defensible path to approval and reimbursement — and where will I get hurt?"*

Today we answer the **back half** of that question extremely well (statistics, CMC authoring, regulatory strategy, biomarker validity) and the **front half** (target/molecule rationale, translational plausibility, competitive/scientific landscape, ADMET/liability flags) barely at all. Closing the front half — using infrastructure we *already have* — is the highest-leverage knowledge enhancement available.

Three enhancement vectors, in priority order:

1. **Activate the dormant discovery/translational knowledge** (ChEMBL, preprints, ADMET) — turns "Concept2Cure" from a name into a capability.
2. **Deepen the curated corpora we already lead on** (oncology biomarkers → CNS + immunology + cardiometabolic; clinical-pharmacology breadth) — widens addressable therapeutic markets.
3. **Add a "scientific reasoning spine"** that grounds every LLM answer in computation + curated corpora + live evidence with explicit provenance — converts knowledge into *defensible, auditable* client deliverables (the only kind a regulated buyer pays for).

---

## 3. Domain-by-domain enhancement plan (with the client value of each)

### 3.1 Molecular design & chemistry — from data store to reasoning
**Today:** structures stored, never computed. **Enhancement:**
- Wire the **ChEMBL connector** (already available as MCP/connector, unused) into AnA's tool layer (`server/services/ana/AnaToolExecutor.ts`, `AnaToolDefinitions.ts`): `compound_search`, `get_bioactivity`, `get_mechanism`, `get_admet`, `target_search`.
- Add a thin **cheminformatics service** (`server/services/chem/`) for the deterministic basics: SMILES validation/canonicalization, MW/logP/TPSA descriptors, and **ICH M7 structural-alert / nitrosamine flagging**. (A small, validated rules layer — not a full QSAR platform.)
- Feed these into the existing **CMC QbD analyzer** and **impurity** fields so structure → predicted liabilities → control strategy becomes one chain.

**Client value:** Biotech/pharma get an instant **developability and liability read** (off-target/ADMET/genotoxic-alert) on any candidate, and CMC teams get **nitrosamine/ICH M7 risk** surfaced automatically — a current regulatory hot-button that triggers refuse-to-file. Directly billable to every small-molecule program.

### 3.2 Biology / translational / oncology — widen the lead we already have
**Today:** best-in-class curated oncology biomarker corpus + translational graph. **Enhancement:**
- Extend the curated biomarker model (`server/services/ivd-knowledge/scientific/`) into **CNS/neuroscience** (amyloid/tau/NfL/GFAP, MMSE/CDR-SB/ADAS-Cog endpoints, AD/PD/ALS/MS), **immunology/inflammation**, and **cardiometabolic** — same schema, same citation discipline.
- Populate the **foresight translational graph** (`foresight-knowledge-graph.ts`) from the live CSR/ClinicalTrials.gov evidence already flowing in, so biomarker→endpoint→outcome correlations are *empirical*, not just seeded.
- Connect **bioRxiv/medRxiv** preprint search so emerging mechanism/target evidence reaches AnA before peer review.

**Client value:** Expands the addressable market beyond oncology/IVD into **CNS and immunology — the two largest, hardest therapeutic areas** where clients most need translational de-risking. Each new TA corpus is a new vertical we can sell into.

### 3.3 Biostatistics — convert strength into a wider product surface
**Today:** production-grade but somewhat hidden behind API routes. **Enhancement:**
- Surface the existing engines as **client-facing, narrated deliverables**: defensible SAP sections, sample-size rationale memos, and **"reviewer-risk" reports** (the defensibility service already scores 7 dimensions). Wire `statistical-defensibility-service.ts` output into AnA chat as a first-class artifact.
- Add the few high-demand methods still missing: MMRM/mixed-models for repeated measures, and a real **trial-success / enrollment-feasibility** model grounded in ClinicalTrials.gov base rates (replacing any hardcoded placeholder with an empirical prior).

**Client value:** A statistician-grade second opinion on protocol/SAP defensibility *before* the agency sees it — the single most expensive thing to get wrong. Sells to sponsors and CROs equally.

### 3.4 CNS / Neurosciences — the deliberate new build
This is called out separately because it is the **biggest therapeutic-area whitespace.** Build the CNS corpus to parity with oncology (biomarkers, endpoints, disease-progression models, agency precedent for AD/PD/ALS/MS/psychiatry), reusing the exact architecture of `biomarker-validity.ts` and `clinical-areas.ts`.

**Client value:** Opens a high-value vertical (CNS development is notoriously high-failure and evidence-hungry) where credible decision support is scarce.

### 3.5 Cross-cutting — the scientific reasoning spine
**Today:** knowledge is fragmented across stats, CMC, IVD, RIM, and connectors with no single grounding layer; the data/knowledge/memory audit (`DATA_KNOWLEDGE_MEMORY_LAYER_AUDIT.md`) already flagged this. **Enhancement:**
- **One retrieval router + one canonical knowledge-graph contract** (per that audit's P0 items) so every AnA answer can pull curated corpus + live evidence + computation through a single, provenance-tagged path.
- **Evidence freshness + citation discipline:** every scientific claim AnA makes carries `[EVIDENCE]/[INFERRED]/[UNVERIFIED]` and a resolvable source (the persona already mandates this; make it enforced, not advisory).
- **A small offline eval harness** measuring factual grounding/hallucination on a domain test set — so we can *prove* knowledge quality to regulated buyers.

**Client value:** Converts raw knowledge into **audit-survivable deliverables**. In regulated markets, an unciteable answer is worthless; a cited, computed, provenance-tagged one is a paid deliverable.

---

## 4. Value by market segment

| Segment | What they buy | Enhancement that unlocks it |
|---|---|---|
| **Biotech (discovery→IND)** | De-risk the candidate before burning capital | §3.1 ChEMBL/ADMET activation, §3.2 translational graph, bioRxiv |
| **Pharma (development→submission)** | Defensible protocols, CMC, multi-region strategy | §3.3 biostat deliverables, §3.1 ICH M7/nitrosamine, §3.5 grounding |
| **Medtech / IVD** | Companion-diagnostic & biomarker validity, study design | §3.2 biomarker corpus widening (already our strength) |
| **CRO** | Repeatable, auditable scientific/statistical work product | §3.3 narrated artifacts, §3.5 eval/provenance |
| **Payer / market access** | Coverage & evidence story (already wired: CMS/ICD-10) | §3.5 link clinical evidence → coverage rationale |

---

## 5. Phased roadmap (enhance existing; don't rebuild)

**P0 — Activate dormant assets (highest value / lowest cost, ~2–4 wks)**
1. Wire ChEMBL + bioRxiv connectors into AnA tools (`AnaToolExecutor.ts` / `AnaToolDefinitions.ts`).
2. Ship the minimal `server/services/chem/` deterministic layer (SMILES validation, descriptors, **ICH M7 structural-alert / nitrosamine flag**) and feed CMC impurity/QbD.
3. Surface `statistical-defensibility-service.ts` as a first-class AnA artifact.

**P1 — Widen and ground (~4–8 wks)**
4. Build the **CNS biomarker/endpoint corpus** to oncology parity; add immunology + cardiometabolic.
5. Populate the **translational foresight graph** from live CSR/CTgov evidence (empirical, not seeded).
6. Stand up the **single retrieval router + provenance enforcement** (per data/knowledge audit P0).

**P2 — Prove and compound (~8+ wks)**
7. Add MMRM + an **empirical trial-success/feasibility** model grounded in CTgov base rates.
8. Ship the **offline grounding/hallucination eval harness** and publish quality metrics to buyers.
9. Canonical knowledge-graph adapter so all domain graphs share one edge schema + confidence lineage.

---

## 6. Guardrails (non-negotiable, consistent with existing audits)

- **No fabrication.** Prior internal audits (`EXPERT_SWARM_EVALUATION_*`) flagged placeholder/`Math.random()` predictions. Every new model must be empirically grounded or labeled `[INFERRED]`/`[UNVERIFIED]`. Null beats a fake number.
- **21 CFR Part 11 / provenance.** Every new knowledge surface inherits the audit-trail and citation discipline already in `tamper-proof-audit.ts` and the AnA persona.
- **Deterministic where it matters.** Chemistry alerts, statistics, and ICH rule checks stay deterministic and reproducible; the LLM explains and narrates, it does not invent the numbers.
- **Reviewer-grade voice.** All client-facing output keeps the existing tone discipline (no hype, cited, factual).

---

## 6a. Implementation status — what shipped in this PR

P0 is built, wired, and tested; a credible P1 corpus seed is in. Concretely:

- **ChEMBL activated (P0.1).** `server/services/integrations/chembl-client.ts` — a live, governed EMBL-EBI ChEMBL client (compound search with curated MW/cLogP/PSA/HBD/HBA/Ro5/QED descriptors, max-phase, mechanism/target lookup), following the existing integration-client pattern, with mocked unit tests.
- **Deterministic cheminformatics + ICH M7 alerts (P0.2).** `server/services/chem/` — SMILES validation + heavy-atom inventory, a structural-alert screen (high-confidence **N-nitrosamine** and azide; heuristic aromatic amine/nitro, epoxide/aziridine, Michael acceptor, azo, alkyl halide — each labeled with confidence and ICH M7 relevance), and a Lipinski/Veber developability read. Pure, offline, dependency-free, with a standing "screen, not an M7 classification" disclaimer. Correctness is locked against real molecules (NDMA, NDEA, N-nitrosopyrrolidine, nitrobenzene, ethylene oxide, caffeine).
- **Wired into AnA (P0).** Two new tools — `search_chembl_compound` and `screen_compound_liabilities` — registered in `AnaToolDefinitions.ts` / `AnaToolExecutor.ts`, surfaced in AnA's integration self-knowledge (`integration-status.ts`), with handler-level tests. `screen_compound_liabilities` works offline from a SMILES and auto-resolves structure+descriptors from ChEMBL when given only a compound name.
- **CNS biomarker corpus seed (P1 start).** `server/services/ivd-knowledge/scientific/biomarker-validity-cns.ts` — seven citation-backed entries (amyloid Aβ42/40 + PET, p-tau181/217, NfL, GFAP, CSF oligoclonal bands, α-synuclein SAA, HTT CAG repeat) on the exact `KnowledgeEntry` schema as the oncology corpus, registered in the IVD knowledge index and passing the corpus integrity tests.

**Increment 2 (this follow-up):**

- **bioRxiv / medRxiv activated — last dormant discovery connector.** `server/services/integrations/preprint-client.ts` — keyword preprint search backed by Europe PMC (which indexes bioRxiv/medRxiv and, unlike the native bioRxiv API, supports full-text query), with server filtering, citeable DOI/URL, server derivation, and a standing "not peer-reviewed" caveat. Wired into AnA as `search_preprints` and surfaced in integration self-knowledge; mocked client + handler tests.
- **CNS corpus toward oncology parity (P1 wave 2).** `server/services/ivd-knowledge/scientific/biomarker-validity-cns-2.ts` — six more citation-backed entries (APOE ε4 + anti-amyloid ARIA stratification, DaT-SPECT imaging, AQP4-IgG/MOG-IgG for NMOSD/MOGAD, CSF RT-QuIC/14-3-3 for CJD, CSF total tau, CYP2D6/CYP2C19 psychiatric pharmacogenomics). The CNS corpus now stands at 13 entries, approaching the oncology corpus's depth.

**Verification:** project typecheck clean (0 errors); new and affected suites green (cheminformatics, ChEMBL client, AnA chem tools, preprint client + tool, integration-status, IVD knowledge corpus).

**Still scoped, not yet built (honest):** remaining CNS depth (disease-progression models, agency precedent), the single retrieval router + provenance enforcement, MMRM, the empirical trial-feasibility model, and the offline grounding/hallucination eval harness. These are multi-week curation/modeling efforts and are deliberately left as follow-ups rather than shipped as stubs.

## 7. The single most important move

If only one thing ships: **P0.1 + P0.2 — activate ChEMBL/ADMET and add the ICH M7 chemistry-alert layer.** It uses infrastructure we already have, closes the "concept" half of "Concept2Cure," and delivers an immediately billable de-risking read to every small-molecule client in every market. It is the highest value-to-effort enhancement available on this codebase today.
