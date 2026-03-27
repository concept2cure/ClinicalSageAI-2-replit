# BETA READINESS MASTER — TRUTH RECONCILIATION (Post PR #279)

Date: 2026-03-27  
Branch baseline: `concept2cure-v2` HEAD after merged PR #279 (as present in this repo snapshot)

## Executive summary
PR #279 closed an important blocker: there is now a governed export persistence path via the Artifact Compute Plane writeback flow (`registerArtifactWithGovernance`) with provenance + audit references persisted on job completion.  
However, broad beta is still **NO-GO** because key beta-visible export entry points (notably CERV2 `/api/cerv2/export/*` and eSTAR `/api/510k/estar/build`) still stream download artifacts without guaranteed governed artifact persistence in the core artifact/version/provenance chain.

## What changed (stale statements corrected)

### Corrected: “No governed 510(k)/eSTAR artifact path”
- **Now stale as an absolute statement.**
- There is now a governed path for the `governed_export` surface in compute:
  - Route supports `surfaceKey: 'governed_export'` job creation.
  - Compute completion writes artifact via governance writeback and records provenance/audit refs.
- This closes the “no governed path exists anywhere” claim.

### Corrected: “CERV2 PDF/DOCX are all dead-end downloads”
- **Still true for direct CERV2 export endpoints** (`/api/cerv2/export/pdf`, `/docx`, `/zip`) because they return files directly.
- **No longer universally true across the platform** because compute-plane governed export can persist to governed artifacts.

## Updated blocker status

### Closed by PR #279
1. Governed export persistence exists for compute-driven governed export surface.
2. Persisted consequence now includes artifact id/status/version + provenance/audit references in compute job result summary.

### Still open blockers (remaining only)
1. **CERV2 direct export bypass:** `/api/cerv2/export/*` remains download-stream oriented with no mandatory governed artifact persistence.
2. **eSTAR build bypass:** `/api/510k/estar/build` produces zip stream; no documented concept2cure artifact/version/provenance writeback in this path.
3. **Path consistency gap:** beta users can still export through mixed paths (some governed, some non-governed), creating truth inconsistency.
4. **Go/no-go risk:** until primary 510(k)/eSTAR UX routes converge on governed persistence or enforce a governed bridge, broad beta remains no-go.

## Go / no-go recommendation (reassessed)
- **Recommendation:** **NO-GO for broad beta** (unchanged).
- **Reason:** major flows now have governed capability, but default/obvious export surfaces still allow non-governed dead-end outputs for 510(k)/eSTAR/CERV2.
- **Conditional partial-go:** acceptable for controlled/internal beta if launch guidance hard-routes users through compute/governed export path and blocks unsupported direct exports.

## Next sprint priorities (post-PR #279)
1. Add governed writeback option to `/api/cerv2/export/pdf|docx|zip` (or enforce handoff to compute writeback).
2. Add governed persistence bridge for `/api/510k/estar/build` output.
3. Add route-level policy: production mode should reject export paths that cannot produce governed artifact consequence.
4. Add e2e tests that prove artifact/version/provenance/audit records for 510(k) and eSTAR export UX paths.
