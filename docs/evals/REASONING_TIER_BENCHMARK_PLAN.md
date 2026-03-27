# Reasoning Tier Benchmark Plan

**Status:** Draft v1  
**Date:** 2026-03-27

---

## Goal

Evaluate whether Reasoning Tier improves high-stakes regulated reasoning quality without unacceptable latency/cost/risk.

---

## Scope

Benchmarks are **Concept2Cure-specific** and avoid puzzle-style proxies.

Action classes:
1. 510(k) evidence-to-claim mismatch detection
2. eSTAR package consistency analysis
3. CERV2 contradiction detection
4. CMC inconsistency reconciliation
5. Cross-document risk memo generation
6. Reviewer objection simulation
7. Version-to-version impact review

---

## Datasets

Each benchmark set includes:
- input artifacts/sections/evidence fragments,
- expected contradiction findings,
- expected unresolved items,
- expected recommendation characteristics,
- expected evidence mapping coverage.

Data should be de-identified or synthetic where required.

---

## Metrics

### Quality
- contradiction precision/recall
- recommendation usefulness score (SME rubric)
- evidence grounding completeness
- unresolved-item correctness

### Safety/Compliance
- unsupported claim rate
- policy violation rate
- audit-envelope completeness

### Performance
- p50/p95 latency by action class
- timeout rate
- degraded fallback rate
- compute cost per successful run

---

## Thresholds (Beta Candidate)

- contradiction precision >= 0.80
- evidence grounding completeness >= 0.90
- unsupported claim rate <= 0.02
- p95 latency <= action-class budget
- timeout rate <= 0.05

Thresholds become stricter for GA.

---

## Evaluation Stages

1. **Offline deterministic replay** (no user impact).
2. **Shadow mode** in staging.
3. **Controlled beta mode** (proposal-only).
4. **GA readiness pass** with sustained SLO compliance.

---

## Deliverables

- benchmark scorecards per action class
- failure mode distribution report
- benchmark-to-gate traceability matrix
- final go/no-go memo for beta and GA

