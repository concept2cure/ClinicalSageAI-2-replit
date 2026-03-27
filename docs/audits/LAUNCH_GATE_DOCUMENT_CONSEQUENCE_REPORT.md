# Launch Gate — Document Consequence Report

Date: 2026-03-27

## Current gate position
Broad beta launch remains gated on consistent governed document consequence across primary export paths.

## Post-merge update (PR #279)
PR #279 materially improved consequence integrity by landing governed export persistence in the Artifact Compute Plane path:
- compute jobs can run `governed_export` intent/surface,
- completed jobs register governed artifacts,
- and job summaries include artifact + provenance + audit references.

This closes the prior absolute blocker (“no governed export persistence exists”).

## What still blocks launch
1. CERV2 direct export routes (`/api/cerv2/export/pdf|docx|zip`) still produce download streams without required governed artifact writeback.
2. eSTAR build route (`/api/510k/estar/build`) still exports zip directly without required governed artifact/version/provenance persistence.
3. Mixed-path reality means user-facing truth is inconsistent unless product hard-routes export through governed consequence path.

## Launch recommendation
- **Broad beta:** NO-GO.
- **Controlled beta:** possible only if UI and policy enforce governed export path for regulated workflows and clearly label non-governed routes as non-launch/non-compliant paths.
