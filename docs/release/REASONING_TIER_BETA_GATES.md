# Reasoning Tier Beta Gates

**Status:** Draft gate policy  
**Date:** 2026-03-27

---

## Beta Admission Criteria (All Required)

1. **No export governance regressions**
   - eSTAR governed consequence path remains passing.
   - CERV2 PDF/DOCX governed consequence paths remain passing.

2. **CERV2 ZIP decision explicit**
   - Either governed parity implemented OR route blocked from beta-visible UX.

3. **Reasoning Tier optionality proven**
   - Outage/degradation does not break standard drafting/export workflows.

4. **Proposal-only enforcement**
   - Reasoning outputs do not auto-promote to final artifacts in beta.

5. **Benchmark minimums met**
   - Golden tasks pass thresholds from benchmark plan.

6. **Audit/provenance linkage proven**
   - Accepted outputs include traceable evidence and governance references.

7. **Timeout/fallback behavior validated**
   - Contract tests cover timeout, unavailable service, malformed response.

8. **Feature flag controls active**
   - Action-class toggles available at org/workspace level.

9. **Governed export contract CI checks active**
   - `npm run ci:governed-export-routes` passes in CI.
   - `npm run ci:governed-export-consequence-shape` passes in CI.

---

## Beta Exit Evidence Package

- route governance truth table
- benchmark scorecards
- fallback/chaos test report
- policy decision log samples
- proposal accept/reject trace examples
