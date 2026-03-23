# CMC Module + Offering Gap Assessment (Pharma Practitioner Lens)
**Date:** March 23, 2026  
**Audience:** CMC lead, technical operations, QA, RA-CMC, regulatory intelligence

## Executive perspective
From a **CMC professional inside pharma**, the platform is strong on breadth (many CMC surfaces exist), but still uneven on the three things teams get judged on during agency interactions:
1. **Defensibility** (can we defend each claim with complete evidence?),
2. **Readiness** (are we truly inspection/supplement-ready, not just draft-ready?),
3. **Consistency** (are the same risk assumptions used across change control, Module 3 authoring, and export?).

The previous state of `CMCComparabilityService` had structural reliability risk and limited deterministic controls. This patch addresses part of that by adding deterministic CMC risk signals/actions and confidence downgrades when critical evidence is missing.

---

## What a CMC lead would expect vs current product behavior

### A) Change impact should not be AI-only for core CMC controls
**Expectation (industry):** Hybrid model = deterministic floor + AI reasoning, especially for PPQ/stability/GMP risk.  
**Observed:** Risk and recommendations were mostly AI-dependent and could vary by prompt output.  
**Gap:** Insufficient deterministic guardrails for missing CQAs, low stability maturity, low batch count, PPQ not ready, and GMP signal quality.  
**Improvement now implemented:** Deterministic risk scoring/signals/actions added and merged into recommendations, with confidence penalties for missing critical evidence.

### B) “Submission-ready” should be gated by CMC completeness, not module availability
**Expectation:** Availability of a CMC module or blueprint is not equivalent to dossier readiness.  
**Observed:** Offering includes CMC capabilities/tier gating, but readiness controls can still be interpreted as feature toggles instead of evidence gates.  
**Gap:** Potential commercial overstatement risk when teams treat generated drafts as submission-ready artifacts.  
**Recommendation:** Introduce hard gates before marking any CMC package “submission-ready”:
- minimum stability maturity threshold,
- minimum representative post-change batch threshold,
- PPQ completion evidence,
- GMP/CAPA status check,
- CQA-to-method trace matrix completeness.

### C) CMC project model under-represents the real body of evidence
**Expectation:** CMC planning should include specific evidence objects by section and lifecycle stage.  
**Observed:** Core project map includes only a limited required-doc subset for CMC.  
**Gap:** Teams can appear “on track” while missing high-risk CMC evidence.  
**Recommendation:** Add explicit required artifacts by phase:
- process characterization summary and control-strategy rationale,
- PPQ report set and CPV plan,
- post-change comparability protocol + report,
- trending stability report with shelf-life claim rationale,
- method transfer/validation packet,
- site transfer readiness + CAPA closure status,
- regional 3.2.R deltas.

---

## Detailed gap register (CMC operator-focused)

| Gap | Practical consequence in pharma workflows | Severity | Suggested owner | Next action |
|---|---|---:|---|---|
| Missing deterministic comparability floor | Different outputs for similar changes; weaker reviewer confidence | Critical | RA-CMC + Engineering | Keep AI but enforce deterministic minimum controls (implemented in this patch for service layer) |
| No explicit evidence maturity thresholds | “Draft done” mistaken for “submission-ready” | Critical | CMC Product + QA | Add release gates for stability/PPQ/batch/CAPA readiness |
| CMC artifact taxonomy too shallow in project map | Late-cycle surprises during authoring/review | High | Product Ops + CMC SMEs | Expand required CMC artifacts by section/lifecycle |
| Weak confidence governance on sparse data | Overconfident recommendations with limited data | High | AI/ML + CMC SMEs | Penalize confidence when CQAs, stability, PPQ, or GMP inputs are weak (implemented in this patch for service layer) |
| Inconsistent traceability expectations across modules | More manual reconciliation in governance review | Medium | Platform Architecture | Standardize CQA/CPP/evidence trace contracts across CMC + eCTD paths |

---

## What was implemented in this patch (beyond syntax hardening)
1. Added deterministic CMC risk dimensions to change assessment input:
   - GMP status,
   - PPQ status,
   - stability-data months,
   - representative post-change batch count,
   - CPV status.
2. Added deterministic risk scoring/signals to prevent AI-only risk assignment.
3. Added deterministic recommended actions that reflect practical RA-CMC expectations.
4. Added confidence adjustment logic when key evidence is absent or weak.

---

## Proposed next 2 sprints

### Sprint 1 (Defensibility)
- Build a CMC Readiness Gate service used by both CMC module and export flows.
- Block “submission-ready” badges unless readiness checks pass.
- Add audit log entries for every gate decision and override.

### Sprint 2 (Operationalization)
- Extend project model with CMC artifact classes and mandatory evidence per phase.
- Add dashboard views for PPQ/stability/CAPA readiness trend.
- Add regression tests around deterministic risk floor behavior and confidence penalties.

---

## Validation plan for this patch
- Unit-level tests for deterministic risk score mapping and confidence penalties.
- API-level smoke for low-data vs high-data scenarios and resulting risk/action deltas.
- Regression check ensuring malformed AI JSON does not crash comparability routes.
