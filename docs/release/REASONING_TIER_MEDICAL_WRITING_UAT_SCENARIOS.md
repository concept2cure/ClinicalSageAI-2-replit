# Reasoning Tier Medical Writing UAT Scenarios

**Status:** Active scenario pack  
**Date:** 2026-03-27

This scenario pack extends base UAT scenarios with life-sciences regulatory affairs and medical-writing tasks.

---

## MW-UAT-01 510(k) Substantial Equivalence Narrative Tightening

- Input: draft substantial equivalence narrative with mixed-strength citations.
- Objective: improve clarity while preserving claim traceability and regulatory tone.
- Pass signals:
  - no unsupported claims introduced
  - explicit uncertainty language where evidence is limited
  - reviewer can accept/reject changes in bounded chunks

## MW-UAT-02 CER Clinical Evidence Contradiction Reconciliation

- Input: two clinical evidence summaries with contradictory outcomes.
- Objective: produce balanced synthesis with transparent contradiction handling.
- Pass signals:
  - contradiction points explicitly listed
  - impact on benefit-risk narrative explained
  - unresolved gaps clearly flagged for human decision

## MW-UAT-03 eCTD Module Summary Consistency Pass

- Input: module-aligned summary sections with duplicated or drifted claims.
- Objective: align terminology and claims across sections without changing regulatory intent.
- Pass signals:
  - terminology harmonized
  - source links maintained
  - no section introduces new uncited assertions

## MW-UAT-04 Safety Signal Language Calibration

- Input: safety findings with preliminary/non-final evidence.
- Objective: calibrate language to avoid overstatement and preserve reviewer caution.
- Pass signals:
  - confidence language scaled to evidence quality
  - mandatory human-review caveats retained
  - risk statements remain specific and action-oriented

