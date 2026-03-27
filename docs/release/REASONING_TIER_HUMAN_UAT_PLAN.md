# Reasoning Tier Human UAT Plan (Beta → GA)

**Status:** Active draft  
**Date:** 2026-03-27

---

## 1) Objective

Validate that Reasoning Tier outputs are:
- regulator-legible,
- reviewer-actionable,
- governance-safe,
- operationally reliable,

before GA promotion.

---

## 2) UAT Cohorts

1. Regulatory lead (submission strategy)
2. Clinical reviewer (evidence contradiction triage)
3. QA/compliance reviewer (provenance/audit verification)
4. Product operator (runtime/fallback operations)

Minimum cohort size per cycle: 2 users per role.

---

## 3) Human UAT Scenarios

### UAT-01 Contradiction Scan
- Trigger high-stakes contradiction scan from Conversation OS.
- Confirm contradictions are severity ranked and evidence-linked.
- Confirm unresolved items are explicit.

### UAT-02 Reviewer Challenge
- Run reviewer objection simulation for draft artifact.
- Confirm recommendations are actionable and source-grounded.

### UAT-03 Evidence Reconciliation
- Compare two artifact versions with conflicting claims.
- Confirm impact and resolution guidance are coherent.

### UAT-04 Governance Acceptance
- Accept/reject proposal and verify governed consequence fields are present:
  - artifact id/version/status
  - provenance ref
  - audit ref
  - downloadable output reference

### UAT-05 Degraded Mode
- Simulate Reasoning Tier unavailable/timeout.
- Confirm workflow fails closed and standard path remains usable.

### UAT-06 Regulatory Narrative Precision
- Execute MW-UAT-01 from `docs/release/REASONING_TIER_MEDICAL_WRITING_UAT_SCENARIOS.md`.
- Confirm claim language is source-grounded and reviewer-editable.

### UAT-07 Safety Language Calibration
- Execute MW-UAT-04 from `docs/release/REASONING_TIER_MEDICAL_WRITING_UAT_SCENARIOS.md`.
- Confirm uncertainty and human-review caveats remain explicit.

### UAT-08 Regulatory Affairs Final-Pass Review
- Execute Regulatory Affairs checklist from `docs/release/REASONING_TIER_REG_AFFAIRS_REVIEW_CHECKLIST.md`.
- Confirm red-flag phrase scan is completed and any overclaim language remediated.

### UAT-09 Terminology Consistency and Scope Control
- Validate terminology harmonization using `docs/evals/REGULATORY_TERMINOLOGY_GLOSSARY.md`.
- Confirm edit behavior complies with `docs/release/REASONING_TIER_MEDICAL_WRITING_EDIT_POLICY.md`.

---

## 4) UAT Pass Criteria

A run passes only if all are true:

1. **Interpretability**
   - Reviewer can explain why recommendation was made.
2. **Evidence traceability**
   - Every critical contradiction maps to source evidence.
3. **Governance completeness**
   - Accepted output contains provenance/audit references.
4. **Regulatory writing quality**
   - Meets minimum thresholds in `docs/evals/REGULATORY_WRITING_QUALITY_RUBRIC.md`.
   - Passes red-flag phrase controls from `docs/evals/MEDICAL_WRITING_RED_FLAG_PATTERNS.md`.
   - Maintains terminology consistency per `docs/evals/REGULATORY_TERMINOLOGY_GLOSSARY.md`.
5. **Operational resilience**
   - Timeout/unavailable mode does not block normal export/drafting.
6. **User trust**
   - Participant reports confidence score >= 4/5.

---

## 5) UAT Data Capture Template

Use `docs/release/REASONING_TIER_UAT_EVIDENCE_TEMPLATE.md` for every run.

Evidence must be stored under:
`docs/release/evidence/reasoning-tier-uat/<cycle-id>/<run-id>.md`

Minimum fields required per run:
- participant role + alias
- scenario id + task id
- expected vs actual behavior
- stop reason
- contradictions found + unresolved count
- governance contract checks (artifact/provenance/audit/download refs)
- reviewer confidence (1-5)
- defects/risks + disposition

---

## 6) Exit Criteria for GA Candidate

1. At least 3 completed UAT cycles.
2. No P0/P1 defects open in governance/provenance paths.
3. Degraded-mode pass rate >= 95%.
4. Average reviewer confidence >= 4.0/5.
5. UAT sign-off from Regulatory + QA leads.
6. Operator checklist completed (`docs/release/REASONING_TIER_OPERATOR_SIGNOFF_CHECKLIST.md`).
7. Medical-writing UAT scenario pack executed (`docs/release/REASONING_TIER_MEDICAL_WRITING_UAT_SCENARIOS.md`).
8. Regulatory Affairs checklist completed (`docs/release/REASONING_TIER_REG_AFFAIRS_REVIEW_CHECKLIST.md`).
9. Medical writing edit policy checks passed (`docs/release/REASONING_TIER_MEDICAL_WRITING_EDIT_POLICY.md`).
10. Cycle summary captured per cycle (`docs/release/evidence/reasoning-tier-uat/<cycle-id>/CYCLE_SUMMARY.md`).

