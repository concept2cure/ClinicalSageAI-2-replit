# Reasoning Tier Operator Sign-Off Checklist (GA Readiness)

**Status:** Active checklist  
**Date:** 2026-03-27

Use this checklist at the end of each UAT cycle and before GA gate review.

---

## A) UAT Completion

- [ ] All required scenarios (UAT-01..UAT-05) executed at least once per cycle.
- [ ] Minimum cohort coverage met (Regulatory, Clinical, QA, Product Ops).
- [ ] At least 3 UAT cycles completed.

## B) Quality and Safety Thresholds

- [ ] Average reviewer confidence >= 4.0/5.
- [ ] Degraded-mode pass rate >= 95%.
- [ ] No unresolved P0/P1 defects in governance/provenance paths.
- [ ] Unsupported-claim rate within benchmark threshold.

## C) Governance Contract Integrity

- [ ] Accepted outputs include provenance + audit references.
- [ ] Downloadable outputs include `downloadable_output_ref` metadata.
- [ ] Route-level consequence-shape CI checks passing.
- [ ] No active bypass exceptions for high-stakes export routes.

## D) Operational Readiness

- [ ] On-call runbook reviewed and current.
- [ ] Alerting for timeout/error budgets verified in staging.
- [ ] Rollback switch validated in a controlled drill.

## E) Documentation and Evidence

- [ ] UAT evidence stored using required path convention.
- [ ] UAT evidence includes payload + audit/provenance lookup proof.
- [ ] GA gate doc updated with latest cycle summary.
- [ ] Deviations/exceptions explicitly documented and approved.

## F) Final Sign-Off

- Regulatory lead: ____________________  Date (UTC): __________
- QA/compliance lead: _________________  Date (UTC): __________
- Product ops lead: ___________________  Date (UTC): __________
- Release manager: ____________________  Date (UTC): __________

If any required item is unchecked, GA recommendation is automatically **No-Go**.
