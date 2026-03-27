# 510(k) / eSTAR Document Generation Audit (Post PR #279 Reconciliation)

Date: 2026-03-27

## Route truth matrix

| Route / Path | Current behavior | Governed persistence status | Notes |
|---|---|---|---|
| `POST /api/concept2cure/compute/projects/:projectId/jobs` with `surfaceKey='governed_export'` | Compute job executes and writes governed artifact consequence | **Governed** | Uses governance writeback + provenance/audit refs in result summary |
| `POST /api/concept2cure/artifacts/export-docx` | Generates DOCX download stream | **Governance-gated but not artifact-persisting by default** | Review headers + human review gate; does not itself create governed artifact record |
| `POST /api/concept2cure/artifacts/export-pdf` | Generates PDF download stream | **Governance-gated but not artifact-persisting by default** | Same as DOCX export route |
| `POST /api/cerv2/export/pdf` | CERV2 combined PDF download | **Not governed-persisted** | Direct file response path |
| `POST /api/cerv2/export/docx` | CERV2 combined DOCX download | **Not governed-persisted** | Direct file response path |
| `POST /api/cerv2/export/zip` | CERV2 ZIP package download | **Not governed-persisted** | Direct archive response path |
| `POST /api/510k/estar/build` | eSTAR ZIP build stream | **Not governed-persisted** | Streams zip; no governed artifact writeback shown |
| `POST /api/knowledge-base/save-docx-as-artifact` | Saves content as artifact + version + provenance | **Governed** | Used by document generation/coauthor flows |

## What PR #279 closed
- Introduced/landed practical governed export persistence in compute job flow for governed export surface.
- Added durable artifact consequence metadata (artifact id/status/version + provenance/audit references) tied to compute completion.

## Remaining gaps
1. CERV2 export routes still act as download endpoints, not guaranteed governed persistence endpoints.
2. eSTAR build route still produces export package directly without guaranteed governed writeback.
3. UX-level branching allows users to choose non-governed export routes, creating inconsistent compliance posture.

## Audit verdict
- **Improved materially** by PR #279.
- **Not fully closed** for 510(k)/eSTAR beta truth because direct export routes remain non-governed persistence paths.
