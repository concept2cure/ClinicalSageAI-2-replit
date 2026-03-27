# Reasoning Tier Golden Tasks

**Status:** Draft v1  
**Date:** 2026-03-27

---

## Golden Task Catalog

### GT-01 510(k) Claim-Evidence Mismatch
- **Input:** draft claim set + source evidence snippets
- **Expected:** detect mismatched claims; severity-ranked contradiction list
- **Pass:** >= 90% critical mismatches detected, <= 5% false criticals

### GT-02 eSTAR Package Consistency
- **Input:** structured eSTAR section representations + metadata
- **Expected:** detect internal cross-section inconsistencies
- **Pass:** identifies seeded inconsistencies with actionable recommendations

### GT-03 CERV2 Clinical Contradictions
- **Input:** CER narrative sections + table-derived facts
- **Expected:** identify contradiction clusters with evidence links
- **Pass:** strong evidence_map coverage for each contradiction

### GT-04 CMC Section Reconciliation
- **Input:** CMC process narrative + analytical method summaries
- **Expected:** flag conflicts and unresolved evidence gaps
- **Pass:** unresolved list matches reviewer baseline rubric

### GT-05 Cross-Document Risk Memo
- **Input:** multi-artifact corpus across versions
- **Expected:** coherent risk memo with known/inferred/missing partition
- **Pass:** SME usefulness >= target and no unsupported critical claim

### GT-06 Reviewer Challenge Simulation
- **Input:** artifact + simulated reviewer question bank
- **Expected:** predicted objections and defensible response scaffolds
- **Pass:** objection relevance and evidence support meet rubric thresholds

### GT-07 Version Impact Review
- **Input:** artifact vN and vN+1 diff
- **Expected:** impact summary + contradiction delta + review priority
- **Pass:** high agreement with human reviewer triage

---

## Standard Output Requirements (All GT)

Each run must produce:
- contradictions found
- unresolved items
- evidence map
- recommendation
- confidence band
- stop reason
- human review required flag

Missing any required field = automatic fail.

