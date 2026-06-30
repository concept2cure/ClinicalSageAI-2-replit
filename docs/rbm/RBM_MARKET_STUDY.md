# Risk-Based Monitoring (RBM / RBQM): Market Study & Product Strategy

*Prepared for Concept2Cure.RI — June 2026*

This study answers two questions: **what can we offer clients around Risk-Based
Monitoring in study conduct and design**, and **which SaaS innovations are a
natural additional offer in our platform**. It is written for both a commercial
audience (opportunity, differentiation, packaging) and a product/engineering
audience (feature-to-codebase mapping). The companion build that ships with this
study is documented in the *Implementation* section and in
`docs/rbm/RBM_DESIGN_SOW.md`.

---

## 1. Executive summary

Risk-Based Quality Management (RBQM) — of which Risk-Based Monitoring (RBM) is
the operational core — has moved from "leading practice" to **expected
practice**. ICH E6(R3) entered into force on **23 July 2025**, formalizing a
proactive, centralized, risk-proportionate approach to trial oversight, and
ICH E8(R1) pushes risk thinking upstream into study **design** via
Quality-by-Design (QbD) and Critical-to-Quality (CtQ) factors. Adoption is now
near-universal: ACRO's 2025 survey reports **96% of trials include at least one
RBQM component**, up from 53% in 2019.

The RBM software market is ~**$430–490M in 2025–26**, growing at ~**12% CAGR**
toward ~$870M by 2031, with cloud and services the fastest-growing segments.

**Our opportunity.** Concept2Cure.RI already owns the two phases that bracket
monitoring — study **design** (protocol, SAP, CRF, trial simulator, sample
size) and **submission** (eCTD, CSR, IND lifecycle) — plus the assets RBM is
built from: Site Intelligence scoring, a biostatistics signal engine, an
adaptive-trial engine, the AnA agentic assistant, and a 21 CFR Part 11
audit/e-signature backbone. RBM is the missing **conduct/monitoring layer**
between them. Adding it is a natural, high-margin upsell rather than a new
product line, and it lets us tell a "**design-to-conduct continuity**" story no
point-solution can: the risk assessment auto-seeds from the protocol and CtQ
factors we already author.

---

## 2. The regulatory drivers (what clients must now do)

| Guidance | In force | What it requires | Our hook |
|---|---|---|---|
| **ICH E6(R3)** Good Clinical Practice | Jul 2025 | Risk-based quality management; centralized/remote monitoring; oversight proportionate to risk; QTLs at study level | The whole RBM module |
| **ICH E8(R1)** General Considerations | 2021 | Quality-by-Design; identify Critical-to-Quality (CtQ) factors at **design** time; proportionate management across lifecycle | RACT seeded from protocol/CtQ |
| **TransCelerate RACT / IQRMP** | Industry model | Risk Assessment & Categorization Tool: catalog of risks, mitigations, recommended KRIs/QTLs; "secondary limit" early-warning at 50–75% of QTL | Default CtQ/KRI/QTL libraries + secondary-limit logic |
| **FDA RBM guidance (2013/2019)** | Active | Encourages central monitoring and a risk-based mix over 100% SDV | Central-monitoring signals + site tiering |

The regulatory expectation is explicit: prospective identification of CtQ
factors grounded in protocol intent, a clear linkage between design decisions
and downstream risk, and **ongoing** risk evaluation against current data rather
than static thresholds.

---

## 3. Competitive / SaaS innovation landscape

What the established RBQM vendors offer (the table stakes we must match) and
where the innovation frontier is (where we can differentiate).

**Established platforms**

- **CluePoints** — Central Statistical Monitoring, Data Quality Assessment
  (anomaly detection), KRI dashboards ranking sites, QTLs, and the SPOT
  site-action tool. The reference for statistical central monitoring.
- **Medidata (Clinical Data Studio / RBQM)** — KRIs/QTLs configured and
  monitored beside the EDC, AI/automation for anomaly and site-performance risk.
- **IQVIA RBQM** — configurable SaaS surfacing the "next best action".
- **eClinical Solutions (elluminate RBQM)** — KRIs with central statistical
  monitoring methods and ML-based data-anomaly detection.
- **TRI / OPRA** — RACT libraries (CTQs, risks, mitigations, recommended
  KRIs/QTLs) plus a central-monitoring component; the RACT reference.
- **Cloudbyz, Cyntegrity (indication-focused RACT catalogs), Premier Remarque** —
  configurable risk models, KRIs, QTLs, centralized monitoring.

**Innovation frontier (our differentiators)**

- **AI/agentic central monitoring** — anomaly detection within 24–48h of data
  entry; predictive site-risk; signals ranked by impact/urgency.
- **Multi-agent oversight** — specialized agents for enrollment, data quality,
  safety, site performance (e.g., Medable Clinical Monitoring Agent, ConcertAI
  ACT, WCG ClinSphere). Our **AnA** agentic loop is the same shape.
- **Generative authoring** — auto-draft the RACT, the monitoring plan, and
  pre-visit summaries from protocol intent. We already author the protocol.
- **Design-to-conduct continuity** — seed CtQ factors directly from the
  protocol/SAP. Point solutions can't; we own both ends.

---

## 4. Where we are today, and the gap

Concept2Cure.RI is a mature regulatory authoring + intelligence platform with
deep adjacent assets:

| Existing asset | Path | Reused for RBM |
|---|---|---|
| Site Intelligence scoring | `server/api/site-intel/routes.ts`, `site_intel.sites` | Per-site risk tiers (reduced/standard/enhanced) |
| Biostatistics signal engine | `server/services/biostatistics-judgment/` | Central/statistical monitoring signals (phase 2) |
| Adaptive-trial engine | `server/services/adaptive-trial-operations-service.ts` | Interim/stopping logic for QTL parameterization |
| Study design | `server/services/study-design/` | CtQ seeding from protocol/SAP |
| AnA agentic assistant | `server/services/ana/` | RBM advisor tools |
| 21 CFR Part 11 audit/e-sign | global mutation middleware, `server/api/gcc/signing` | Governed approval of assessments/plans |

**The gap:** no RBM/RBQM surface existed. There was no risk assessment (RACT),
no KRIs/QTLs, no central-monitoring signals, no per-site risk tiering, and no
monitoring plan. This study ships the module that closes it.

---

## 5. Recommended offering & packaging

**Offer RBM as a conduct-layer upsell tier** on top of the design modules, with
three value propositions:

1. **Compliance out of the box** — an ICH E6(R3)/E8(R1) RACT, KRI and QTL
   libraries, and central monitoring, pre-built so a sponsor is audit-ready.
2. **Design-to-conduct continuity** — the RACT auto-seeds from the protocol and
   CtQ factors already authored in the platform; no re-keying, full traceability.
3. **Agentic monitoring** — AnA seeds the assessment, tiers sites, evaluates
   KRIs/QTLs, drafts the plan, and prioritizes the monitoring worklist.

**Phasing** (delivered/next):

- **Phase 1 (shipped):** RACT + CtQ scoring, KRI library, QTL library,
  central-monitoring signals, site-risk tiering from Site Intelligence,
  monitoring plan + actions, program summary, and five AnA tools.
- **Phase 2:** statistical central monitoring wired to the biostatistics
  signal engine; KRI trend charts; EDC/CTMS connectors for live KRI values.
- **Phase 3:** e-signature approval of assessments/plans; adaptive-trial reuse
  for QTL parameterization; pre-visit summary generation.

---

## 6. Implementation (what shipped with this study)

A complete, tenant-scoped RBM module following the existing Risk (ISO 14971)
module pattern. Backend, data model, deterministic scoring engine, and AnA tools
are production-shaped; the polished UI is handed to the design team
(`docs/rbm/RBM_DESIGN_SOW.md`). A functional scaffold UI is wired and renders
live data.

- **Data model** — `migrations/20260629_rbm_surfaces.sql` + `shared/schema.ts`:
  `rbm_risk_assessments`, `rbm_risk_items` (CtQ), `rbm_kris`, `rbm_qtls`,
  `rbm_signals`, `rbm_site_risk_scores`, `rbm_monitoring_plans`,
  `rbm_monitoring_actions`.
- **Scoring engine** — `server/services/rbm/rbm-engine.ts` (likelihood × impact
  banding, KRI/QTL status, monitoring-tier mapping, RACT/KRI/QTL seed libraries)
  and `server/services/rbm/site-risk-engine.ts` (derives tiers from
  `site_intel.sites`, degrades gracefully).
- **API** — `server/routes/mdx-rbm.ts`, mounted at `/api/mdx`, full CRUD +
  seed/recompute + `GET /api/mdx/rbm-summary/:programId`.
- **AnA tools** — `run_rbm_assessment`, `assess_site_risk`, `evaluate_kris_qtls`,
  `generate_rbm_plan`, `prioritize_monitoring_queries`.
- **Frontend** — `client/src/concept2cure/rbm/` (route + shell + surfaces),
  `services/rbmService.ts`, `hooks/useRbm.ts`, wired into `ZenApp.tsx`
  (`?nav=rbm`).

---

## 7. CluePoints deep-dive — what we copied and added

CluePoints is the reference vendor for **Central Statistical Monitoring (CSM)**.
Its award-winning **SMART™ engine** runs an unsupervised, exhaustive battery of
distribution-free statistical tests over all collected data to illuminate
outliers and anomalies across sites, patients, countries and regions — no user
thresholds required ("the data picks the outliers"), with published specificity
better than 93% for detecting atypical multicentre data. Around CSM it packages:
KRI dashboards that rank sites against peers, a QTL module, **SPOT** (Site
Profile & Oversight Tool) for adaptive per-site monitoring and visit planning,
Patient Profiles, and integrated issue/action tracking.

**Feature map — CluePoints → our module:**

| CluePoints capability | Our equivalent | Status |
|---|---|---|
| KRI dashboard (site ranking vs peers) | `rbm_kris` + thresholds + **KRI trend history** (`rbm_kri_values`) | Shipped |
| Quality Tolerance Limits | `rbm_qtls` (with secondary early-warning limit) | Shipped |
| Risk Assessment (RACT) | `rbm_risk_assessments` + CtQ `rbm_risk_items` | Shipped |
| **Central Statistical Monitoring (SMART)** | `central-statistical-monitoring.ts` — robust modified-z (Iglewicz–Hoaglin) cross-site outlier detection → `central_stat` signals | **Added (this study)** |
| **SPOT (Site Profile & Oversight)** | `GET /api/mdx/rbm-site-oversight/:programId` — per-site risk + tier + drivers + open-signal counts | **Added (this study)** |
| Issue / action tracking | `rbm_monitoring_plans` + `rbm_monitoring_actions` | Shipped |
| **Patient Profiles** | `rbm_patient_profiles` + `scorePatientCohort` (patient-level robust-z anomaly detection) → `scan_patient_profiles` AnA tool | **Added (this study)** |
| Governed sign-off (21 CFR Part 11) | reason-for-change **approval** endpoints for assessments + plans (`…/approve`) | **Added (this study)** |

**What we copied and added in this pass.** A deterministic CSM engine that scores
each site against the study cohort with a robust modified z-score (falling back
to a classic z when the MAD is degenerate), flags only high-side (worse-than-peers)
outliers per risk dimension, and raises `central_stat` signals — exposed at
`POST /api/mdx/rbm-central-monitoring/run` and via the `run_central_monitoring`
AnA tool. Plus a SPOT-style **site-oversight** endpoint aggregating each site's
risk tier, drivers and open-signal load. **Our differentiator over CluePoints:**
this sits inside the same platform that authored the protocol and CtQ factors, so
CSM, KRIs and the RACT share one tenant-scoped, 21 CFR Part 11-audited data
fabric, and AnA can drive the whole loop conversationally.

## 8. Subscription-value enhancement roadmap

How each enhancement grows recurring revenue — by **seats** (more daily users),
**tier** (premium capability), **stickiness** (retention / switching cost),
**cross-sell** (pulls other paid modules), or **enterprise** (portfolio scale).

| Enhancement | Lever | Status |
|---|---|---|
| **Risk Review Report** — inspection-ready ICH E6(R3) deliverable auto-generated from live data (`/api/mdx/rbm-report`, `generate_rbm_report`) | Tier + cross-sell (authoring/report module) | **Shipped (this pass)** |
| **"Needs attention now" feed** — red KRIs, breached QTLs, high signals, flagged patients, overdue actions (`/api/mdx/rbm-attention`, `get_rbm_attention`) | Seats + stickiness (daily driver for CRAs/DMs/medical monitors) | **Shipped (this pass)** |
| **KRI trend history** + central statistical monitoring + Patient Profiles | Tier (advanced analytics) | Shipped |
| **Governed e-sign approval** (reason-for-change, Part 11) | Tier + stickiness (audit trail lock-in) | Shipped |
| Scheduled report + email/Slack alert delivery | Seats + stickiness (push, not pull) | Backlog |
| Portfolio rollup (sponsor-wide cross-study risk board) | Enterprise (priced per study/program) | Backlog |
| Anonymized KRI/QTL **benchmarking** vs a cohort | Tier (premium analytics) | Backlog |
| EDC/CTMS **connectors** (live KRI values, subject metrics) | Tier + stickiness (data gravity) | Backlog |
| Action **SLA / escalation** workflow with owners + due dates | Seats + stickiness (managed workflow) | Partial (overdue surfaced) |
| One-click **export to the submission/CSR** module (risk file → dossier) | Cross-sell | Backlog |

**Commercial thesis.** The Report is what a sponsor *buys* (the deliverable);
the attention feed is what makes them *log in every day* (retention); the
agentic AnA tools and the same-platform design-to-conduct continuity are what
they *can't get from a point solution*. Packaging: RBM as a conduct-layer tier,
with portfolio rollup + benchmarking as an enterprise add-on.

## Sources

- FDA Publishes ICH E6(R3) — ACRP: https://acrpnet.org/2025/09/16/fda-publishes-ich-e6r3-what-it-means-for-u-s-clinical-trials
- Decoding ICH E6(R3) for RBQM — CluePoints: https://cluepoints.com/decoding-ich-e6r3-what-it-means-for-risk-based-quality-management-rbqm/
- ICH E8(R1) / CtQ factors — DIA Global Forum: https://globalforum.diaglobal.org/issue/december-2024/implementation-of-critical-to-quality-ctq-factors-in-a-clinical-trial/
- RACT in clinical trials — CluePoints: https://cluepoints.com/ract-clinical-trials-how-to-deploy-risk-assessment-categorization-effectively/
- CluePoints CSM / detection (SMART engine): https://cluepoints.com/what-we-do/risk-based-quality-management-rbqm/detection/
- Centralized monitoring explained — CluePoints: https://cluepoints.com/centralized-monitoring-in-clinical-trials-everything-you-should-know/
- SPOT / Patient Profiles — CluePoints: https://cluepoints.com/patient-profiles-unveiled-as-latest-addition-to-cluepoints-risk-based-monitoring-and-data-quality-oversight-solution/
- TransCelerate Risk-Based Monitoring Solutions: https://www.transceleratebiopharmainc.com/assets/risk-based-monitoring-solutions/
- elluminate RBQM — eClinical Solutions: https://www.eclinicalsol.com/products/risk-based-quality-management/
- RBQM 101 — Medidata: https://www.medidata.com/en/life-science-resources/medidata-blog/risk-based-quality-management-rbqm/
- OPRA RBQM — TRI: https://www.linkedin.com/products/tri-the-rbqm-experts-opra-riskbased-quality-management-rbqm-software/
- AI in clinical trial operations 2026 — Curex: https://curexbio.com/how-artificial-intelligence-is-transforming-clinical-trial-operations-in-2026/
- AI tools for monitoring — Medable: https://www.medable.com/knowledge-center/guides-the-best-ai-tools-for-remote-patient-monitoring-in-clinical-trials
- RBM software market size — Mordor Intelligence: https://www.mordorintelligence.com/industry-reports/risk-based-monitoring-software-market
- RBM software market — Expert Market Research: https://www.expertmarketresearch.com/reports/risk-based-monitoring-software-market
