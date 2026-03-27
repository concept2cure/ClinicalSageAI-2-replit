# Audit Index (Truth-Reconciled after PR #279)

Date: 2026-03-27

## Canonical docs

- `BETA_READINESS_MASTER.md`  
  **Truth statement:** Governed export persistence now exists (compute path), but broad beta remains no-go due to non-governed direct CERV2/eSTAR exports.

- `510K_DOCUMENT_GENERATION_AUDIT.md`  
  **Truth statement:** 510(k)/eSTAR has a governed export-capable lane, but not all primary routes are governed-persisted.

- `LAUNCH_GATE_DOCUMENT_CONSEQUENCE_REPORT.md`  
  **Truth statement:** PR #279 closed the “no governed persistence” absolute blocker, but did not close route-consistency launch blockers.

- `POST_PR_279_RECONCILIATION.md`  
  **Truth statement:** Reconciles what PR #279 actually fixed vs what remains open for next sprint.

## Reclassification note
Any older audit claim asserting “no governed export persistence path exists” should now be treated as **stale** unless it is explicitly scoped to direct CERV2/eSTAR export endpoints.
