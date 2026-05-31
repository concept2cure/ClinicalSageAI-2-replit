# Study and protocol design — full-scale assessment

> Scope: every study-design and protocol-design service, the biostatistics
> engine, the "learn from past studies" corpus, regulatory intelligence, and
> the prediction/ML layer. Verdicts are real / partial / stub based on direct
> code reads, not docs. Date: 2026-05-29.

---

## 1 · Executive summary

The platform has **more genuine biostatistics and regulatory-intelligence depth
than almost any commercial competitor ships**, and an honest engineering culture
(services return `null` / 0.5 / empty rather than fabricating). The architecture
is sound. The two things holding it back from being defensible to a biotech or
pharma biostatistics lead are both about *substance under the architecture*, not
the architecture itself:

1. **The "learn from past studies" corpus is empty in-repo.** The retrieval and
   matching code is real and queries real tables, but the shipped data is 4 CSR
   PDFs and a 535-row seed CSV where only ~8 rows carry a real sample size.
   Everything downstream (endpoint precedents, success baselines, benchmark
   percentiles) is only as good as live ingestion, which is not visible here.

2. **The headline "trial success prediction" is a hardcoded heuristic, not ML.**
   `trial-predictor-service.ts` literally says "for demonstration purposes" and
   returns `0.5 + fixed bucketed adjustments`. There is no trained model behind
   the marquee number, no Python ML stack, and no model artifacts.

There *is* one real learned model — a from-scratch logistic regression for
regulatory RTF/CRL risk (`server/services/intelligence/risk-model.ts`) with
gradient descent, holdout AUC/Brier validation, and cold-start network-prior
blending. It is narrow but genuine, and it is the template for how every other
prediction should be built.

### Scorecard

| Capability | Verdict | One-line |
|---|---|---|
| Protocol parsing / analysis | Real | Regex + PDF/DOCX extraction; honest nulls |
| Protocol optimizer | Real | Rules + CSR matching + literature; OpenAI optional |
| Study-design agent | Real | Categorized advice grounded in CSR/guidance |
| Endpoint recommender | Real | CSR occurrence + 6-agency guidance map |
| Power / sample size | Real | Correct normal-approx, proportions, survival, NI |
| Survival / KM / log-rank | Real | Textbook from-scratch implementation |
| Bayesian predictive prob. | Real | Beta/Gamma, Lanczos log-gamma, beta-binomial |
| Network meta-analysis | Real | I², Q-test, SUCRA |
| Adaptive design power | Partial | Allocation real; power est. simplified, hardcoded α |
| Biostat judgment layer | Real | 7-dimension defensibility, power adequacy, fragility |
| AnA-Biostats orchestrator | Real | 9-layer pipeline, 5 SME specialist agents |
| eCTD / regional rules | Real | FDA ESG, EMA CESP, PMDA, Health Canada |
| ClinicalTrials.gov | Real | Live API v2, not cached/indexed |
| Precedent / CRL / RTF / EMA Q | Real | DB-backed precedent engine + risk model |
| Cross-jurisdictional (Orbis, reliance) | Real | 15+ frameworks modeled |
| Vector search (7 pgvector corpora) | Real | Canonical embedding model per corpus |
| RWE (FAERS, PubMed, EUDAMED live) | Partial | Live public APIs real; claims/EHR simulated |
| **CSR Intelligence Library** | **Stub** | Returns "not fully implemented" |
| **Trial success prediction** | **Stub** | Hardcoded 0.5 + fixed buckets, no model |
| **Trained ML (enrollment/dropout/site)** | **Absent** | No models, no Python ML stack |
| Shipped trial/CSR corpus | **Thin** | 4 PDFs, ~8 usable CSV rows |

---

## 2 · What exists today (inventory)

### 2.1 Protocol and study design services (backend)

| File | What it does | Verdict |
|---|---|---|
| `server/protocol-analyzer-service.ts` | Extracts phase, indication, n, duration, endpoints, blinding, randomization from text | Real |
| `server/protocol-optimizer-service.ts` | Rule checks + CSR/literature-matched recommendations | Real |
| `server/protocol-knowledge-service.ts` | Pulls precedents by indication/phase from `csrReports`⨝`csrDetails` | Real |
| `server/services/study-design-agent-service.ts` | Routes design questions (endpoint, n, eligibility, stats, regulatory) | Real |
| `server/services/endpoint-recommender-service.ts` | Endpoint precedents + 6-agency guidance map | Real |
| `server/services/power-sample-size-service.ts` | Power/n for t-tests, proportions, survival, Bayesian, adaptive | Real |
| `server/services/sap-generator-service.ts` | Drafts SAP; defers power assertions to statistician | Real |
| `server/services/collaborative-sap-service.ts` | Multi-author SAP workflow | Real |
| `server/services/adaptive-trial-operations-service.ts` | Interim ingestion, O'Brien-Fleming/Pocock spending, SSR, IDMC | Real |
| `server/services/external-control-arm-service.ts` | External/synthetic controls: PS, IPW, Bayesian borrowing | Real |
| `server/services/rwe-study-service.ts` | RWE study design + integration | Partial |
| `server/trial-predictor-service.ts` | "Trial success" probability | **Stub** |

API surface: `server/routes/protocol_routes.ts` (~1,300 lines) exposes
`analyze-file`, `parse-file`, `parse-text`, `deep-analyze`, `optimize`,
`upload-and-optimize`, `optimize-deep`. Note `/api/protocol/generate` is
**deliberately disabled (501)** — it previously fabricated competitor drugs and
p-values. Disabling it was the right call and reflects the honesty culture.

### 2.2 Biostatistics engine

- `server/statistics-service.ts` (~218 KB) is the core. It implements, from
  scratch and correctly: sample size (normal approx, z-scores), Kaplan-Meier,
  log-rank, hazard ratios, median survival, Bayesian predictive probability
  (beta/gamma, Lanczos log-gamma, incomplete beta), non-inferiority sizing,
  survival simulation, network meta-analysis (I², Q, SUCRA), and model
  validation (AUC via Mann-Whitney, Brier, calibration intercept/slope,
  Hosmer-Lemeshow, C-index).
- `server/services/ana-biostats/` — a 9-layer orchestrator
  (input → computation → judgment → domain adaptation → regulatory
  customization → document generation → workflow → AnA interpretation →
  confidence/escalation) with **5 SME specialist agents**: Design & Power,
  Analysis Strategy, Regulatory Biostats, Device & Diagnostics, Sensitivity &
  Advanced Methods.
- `server/services/biostatistics-judgment/` — power adequacy, assumption
  fragility, endpoint-method defensibility, risk classifier, tradeoff and
  role-aware interpreters. Rule-based, deterministic, tested.
- `server/services/biostat-knowledge-graph-service.ts` — endpoint↔method↔outcome
  graph backed by CSR data.

Two honest caveats inside the engine:
- Adaptive-design power estimation is a simplified heuristic (hardcoded 0.05
  Type I, ~1.1× "adaptive" boost) — flagged in-code as simplified.
- Simulations use unseeded `Math.random()`, so results are non-reproducible.
  For a regulated biostatistics tool, seeded RNG is a requirement, not a nicety.

### 2.3 "Study past similar studies" — trial intelligence

- **ClinicalTrials.gov v2** live connector (`connectors/clinical-trials-gov.ts`)
  — real, but queried live, not cached or indexed, so no offline benchmarking,
  no historical snapshots, rate-limit exposed.
- **CSR search** (`csr-search-service.ts`) — real cosine-similarity over
  embeddings loaded from `data/processed_csrs/`, but no corpus ships.
- **CSR Intelligence Library** (`CSRIntelligenceLibrary.js`) — **stub**, returns
  "not fully implemented."
- **Precedent engine** (`precedent-engine.ts`) — real: `search/compare/risk`,
  CRL/RTF triggers, EMA Day-120/180 taxonomy, advisory-committee risk,
  cross-jurisdictional reliance — all DB-backed off `regulatory_precedents`,
  `fda_510k_clearances`, `csr_reports/details`.
- **Vector layer** — 7 pgvector corpora with a canonical embedding model each
  (`embedding-corpus-policy.ts`), including `biostatKnowledgeNodes`.

### 2.4 Regulatory intelligence + agency coverage

Region-specific eCTD and submission rules are real for **FDA, EMA, PMDA, Health
Canada** (`ectd/ectd-regional-rules.ts`, validators, exporters). **MHRA, TGA,
NMPA, ICH** appear as reference/guidance data only. Live regulatory data
integrations that are real: FDA FAERS, FDA DailyMed, PubMed (NCBI E-utilities),
EUDAMED (limited by EU's partial launch). The regulatory guidance corpus is
~14–20 hand-seeded entries — small, and not auto-ingested from agency sites.

### 2.5 Prediction / ML layer

- **Real:** `server/services/intelligence/risk-model.ts` — logistic regression
  for RTF/CRL/approval risk, gradient descent with L2, holdout AUC/Brier/log-loss,
  cold-start blend with DP-anonymized cross-tenant network priors
  (`network-risk-aggregator.ts`), retrospective calibration
  (`confidence-calibration-service.ts`), live outcome→precedent ingestion. This
  is a properly built, self-improving model.
- **Stub:** `trial-predictor-service.ts` (hardcoded) and
  `regulatory-brain/risk-predictor.js` (LLM with hardcoded 50/30/60% fallbacks).
- **Absent:** any trained sklearn/PyTorch/TF model, lifelines/statsmodels,
  enrollment-forecast model, dropout model, site-selection model, model
  artifacts (`.pkl/.joblib/.onnx/.pt`). `config/huggingface-models.ts` names
  models for NER / trial-success / outcome / design-generation but nothing is
  trained or wired to a training pipeline.

---

## 3 · What the industry actually needs (gap analysis)

What an MDX-serving services org, a biotech, and a large pharma each demand from
a study/protocol-design product — and where this platform sits.

### 3.1 Biotech (small, first-IND, capital-constrained)

| Need | Status | Gap |
|---|---|---|
| "Design my first-in-human / Phase 2 from a target + indication" | Partial | Agent advises but no guided end-to-end protocol scaffold to FDA Type-B-meeting quality |
| Benchmark n, duration, endpoints vs comparable trials | Partial | Logic real, corpus empty; needs indexed CT.gov + CSR corpus |
| Probability of trial success with drivers | **Stub** | Replace heuristic with a real model + calibration + intervals |
| Sample-size under uncertainty (assurance, not just power) | Gap | Add Bayesian assurance and sensitivity bands |
| Cost / timeline / enrollment-feasibility forecast | Gap | No enrollment or site-feasibility model |

### 3.2 Pharma (portfolio, multi-region, biostat dept.)

| Need | Status | Gap |
|---|---|---|
| Defensible SAP + estimands (ICH E9(R1)) | Partial | SAP generator real; estimand framework not first-class |
| Adaptive / group-sequential / platform / MAMS designs with operating characteristics | Partial | Spending real; full OC simulation + seeded RNG missing |
| Multiplicity strategy (graphical, hierarchical, gatekeeping) | Gap | Mentioned, not a modeled tool |
| Historical-borrowing / external-control rigor (commensurate priors, tipping-point) | Partial | PS/IPW/borrowing exist; needs sensitivity + regulatory framing |
| Multi-region simultaneous submission optimization (ICH E17 MRCT) | Real | Cross-jurisdictional engine covers this well |
| Audit trail / 21 CFR Part 11 over every statistical action | Partial | Governed-action ledger exists; extend to stat outputs |

### 3.3 MDX clients (medical-device / IVD and diagnostics)

| Need | Status | Gap |
|---|---|---|
| Diagnostic-accuracy design (sensitivity/specificity, ROC, reader studies) | Partial | AUC/calibration math exists; no MRMC / reader-study design tool |
| 510(k) predicate + benchmark intelligence | Real | Predicate DB + precedent engine present |
| IVDR / performance-study design (EU) | Partial | IVDR shared types exist; design tooling thin |
| Bayesian device designs (FDA loves these) | Partial | Bayesian primitives exist; not packaged for device pivotal |

### 3.4 Cross-cutting (everyone)

- **Reproducibility:** seeded RNG, versioned method library, exportable
  computation provenance — currently missing, blocks regulated use.
- **Real corpus:** the single highest-leverage investment. Index CT.gov,
  ingest CSRs, link to outcomes. Without it the intelligence is a shell.
- **Validation evidence:** publish AUC/calibration for every predictive claim;
  the risk model already does this and should be the standard.

---

## 4 · Global regulatory agency coverage — assessment

| Agency | eCTD/submission rules | Guidance/intelligence | Verdict |
|---|---|---|---|
| FDA | Real (ESG, 510(k), IND/NDA/BLA) | FAERS, DailyMed live; precedent engine | Strong |
| EMA | Real (CESP, CTD, Day 120/180) | EMA question taxonomy real; EUDAMED limited | Strong |
| PMDA (JP) | Real (regional eCTD) | Reference data; thin precedents | Moderate |
| Health Canada | Real (REP) | Reference only | Moderate |
| MHRA (UK) | Reference only | Listed in guidance map | Weak |
| TGA (AU) | Reference only | Guidance seed | Weak |
| NMPA (CN) | Reference only | Guidance seed; foreign-data acceptance noted | Weak |
| ICH (E6/E8/E9/E9R1/E17) | Frameworks modeled | Cross-jurisdictional engine | Moderate–strong |
| Project Orbis / Access Consortium / reliance | Real | Sequence optimization, work-sharing | Strong (design), unproven (data) |

Recommendation: deepen PMDA, MHRA, and NMPA from "reference data" to real
guidance ingestion + region-specific design rules, since MRCT/Orbis value
depends on the weakest covered region. Add Swissmedic and ANVISA for Orbis
completeness.

---

## 5 · New study-design concepts to incorporate

Prioritized by demand and by leverage on existing primitives already in-repo.

1. **Estimand framework (ICH E9(R1)) as a first-class object** — population,
   variable, intervening-event strategy, summary measure. Thread it through the
   protocol designer, SAP generator, and defensibility layer. This is now table
   stakes with FDA/EMA.
2. **Bayesian assurance (probability of success), not just power** — wraps the
   existing Bayesian primitives; directly answers the biotech's real question.
3. **Full adaptive / group-sequential operating-characteristic simulator** with
   seeded RNG — Type I error, power, expected n, stopping probabilities under a
   prior on effect. Upgrade the current simplified estimator.
4. **Platform / basket / umbrella and MAMS design templates** — shared control,
   multiple arms, arm-dropping. High demand in oncology; primitives exist.
5. **Master-protocol and seamless Phase 2/3 scaffolds.**
6. **Decentralized / hybrid trial design options (ICH E8(R1) quality-by-design).**
7. **External-control / hybrid-control rigor pack** — commensurate priors,
   tipping-point analysis, covariate-balance diagnostics, regulatory-framing
   memo. Builds on `external-control-arm-service.ts`.
8. **Multiplicity strategy builder** — graphical (Bretz/Maurer), hierarchical,
   gatekeeping with familywise-error control.
9. **Diagnostic / device design pack** — MRMC reader studies, co-primary
   sensitivity/specificity sizing, Bayesian device pivotal templates for MDX.
10. **MRCT consistency design (ICH E17)** — regional-consistency assessment and
    sample-size allocation across regions; pairs with the cross-jurisdictional
    engine you already have.

---

## 6 · Biostatistics + "study past similar studies" — the core ask

The biostatistics math is genuinely strong and, unusually, implemented rather
than wrapped. The limiting factor is **data, reproducibility, and one honest
prediction**, in that order:

1. **Build the corpus (highest leverage).**
   - Index ClinicalTrials.gov locally (snapshot + incremental) so benchmarking,
     percentile bands, and design-trend analysis work offline and at scale.
   - Stand up a real CSR ingestion pipeline (the `CSRIntelligenceLibrary` stub
     is the placeholder for exactly this): parse → extract design/endpoint/
     result entities → embed → link to outcome.
   - Link trials to outcomes (approval, CRL, failure, AE signals) so success
     baselines and the risk model train on truth, not seeds.
2. **Make every computation reproducible and auditable.** Seed all RNG, version
   the statistical method library, and emit a computation-provenance record per
   result (inputs, method, version, seed, output). This is the gate for
   regulated adoption and pairs with the existing governed-action ledger.
3. **Promote precedent matching from keyword to semantic + structured.** You
   already have pgvector and a biostat knowledge graph; combine embedding
   similarity with structured filters (indication, phase, design, endpoint
   class) and return calibrated similarity, not just cosine.

---

## 7 · ML for predictions — current state and the right path

Today: one real model (regulatory RTF/CRL risk) and one mock (trial success).
The mock is the most visible number in the product, which is the worst place to
have a placeholder.

Recommended build order, each replacing a heuristic with a calibrated, validated
model that follows the `risk-model.ts` template (training, holdout AUC/Brier,
cold-start network prior, retrospective calibration):

1. **Trial success / probability-of-technical-and-regulatory-success (PTRS).**
   Train on the indexed CT.gov + outcomes corpus. Features: phase, indication,
   design, n, endpoint class, sponsor type, prior-phase signal. Ship with
   confidence intervals and per-feature contributions (SHAP-style), and label
   it "estimate from N comparable trials," never a bare percentage.
2. **Enrollment / recruitment-rate forecast** — per-site and study-level, with
   uncertainty bands. Direct operational value; nothing exists today.
3. **Dropout / retention model** — feeds sample-size inflation honestly.
4. **Site / investigator feasibility ranking** — uses CT.gov investigator data
   already reachable via the connector.
5. **Endpoint-sensitivity / time-to-readout models** for go/no-go planning.

Engineering guidance:
- Keep models interpretable and calibrated over opaque deep nets — regulators
  and biostatisticians reject black boxes. Logistic / gradient-boosted with
  calibration and published validation is the right altitude.
- Decide the runtime: the platform is TypeScript-first and `risk-model.ts`
  proves pure-TS training works for tabular models. A Python sidecar
  (scikit-learn / lifelines / statsmodels) is worth it only when you need
  survival models, proper SHAP, or GBMs — gate that decision on need.
- Never let a model emit a number without an interval and an N. Tie every
  prediction to `risk_predictions`-style retrospective calibration so the
  product earns trust over time.

---

## 8 · Prioritized recommendations

| # | Recommendation | Effort | Leverage |
|---|---|---|---|
| 1 | Build the trial/CSR corpus: index CT.gov + real CSR ingestion + outcome linkage | High | Highest — unlocks every intelligence and ML feature |
| 2 | Replace `trial-predictor-service.ts` with a calibrated PTRS model on that corpus | Med | High — fixes the most visible stub |
| 3 | Seeded RNG + computation provenance across the stats engine | Med | High — gate for regulated use |
| 4 | Estimand (E9(R1)) as a first-class object through designer/SAP/defensibility | Med | High — table stakes for pharma |
| 5 | Full adaptive/GS operating-characteristic simulator (replace simplified power) | Med | Med-high |
| 6 | Enrollment + dropout forecast models | Med | High operational value |
| 7 | Deepen PMDA/MHRA/NMPA from reference to real guidance + design rules | Med | Med — unblocks MRCT/Orbis |
| 8 | Device/diagnostic design pack (MRMC, co-primary Se/Sp, Bayesian pivotal) for MDX | Med | High for MDX segment |
| 9 | Implement `CSRIntelligenceLibrary` (currently a stub) | Med | Feeds #1 |
| 10 | Bayesian assurance + multiplicity strategy builder | Low-med | Med, reuses existing primitives |

**Bottom line:** the engineering and the math are real and ahead of the market.
The product's credibility now rests on three moves — fill the corpus, make one
honest success prediction, and make every number reproducible. Do those and the
intelligence layer stops being a well-built shell and starts being defensible to
a pharma biostatistics function.
