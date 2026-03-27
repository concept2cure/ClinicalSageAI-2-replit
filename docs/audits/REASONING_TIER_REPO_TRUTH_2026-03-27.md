# Reasoning Tier Repo Truth Reconciliation

**Date:** 2026-03-27  
**Branch baseline:** concept2cure-v2 (current workspace state)  
**Purpose:** establish canonical code truth before any Reasoning Tier integration.

---

## Executive Summary

This audit confirms that governed export persistence exists and is actively used in key routes, but governance coverage is **inconsistent** across export surfaces:

- **Governed now:**
  - `POST /api/510k/estar/build`
  - `POST /api/cerv2/export/pdf`
  - `POST /api/cerv2/export/docx`
- **Bypass risk still present:**
  - `POST /api/cerv2/export/zip` (streaming response; no governed consequence writeback)

Additionally, `docs/audits/BETA_READINESS_MASTER.md` contains stale blocker statements for eSTAR and parts of CERV2 relative to current route code.

---

## Canonical Truth Table

| Surface | Route | Governed consequence | Artifact persistence | Provenance/Audit refs | Fail-closed behavior | Client handling | Status |
|---|---|---|---|---|---|---|---|
| eSTAR package export | `POST /api/510k/estar/build` | **Yes** via `createGovernedExportConsequence` | **Yes** via helper -> `registerArtifactWithGovernance` | **Yes** (`provenance_ref`, `audit_ref`) | **Yes** returns `GOVERNED_EXPORT_FAILED` on failure | JSON consequence payload | Safe for beta |
| CERV2 PDF export | `POST /api/cerv2/export/pdf` | **Yes** via `createGovernedExportConsequence` | **Yes** | **Yes** | **Yes** returns `GOVERNED_EXPORT_FAILED` on failure | JSON consequence payload | Safe for beta |
| CERV2 DOCX export | `POST /api/cerv2/export/docx` | **Yes** via `createGovernedExportConsequence` | **Yes** | **Yes** | **Yes** returns `GOVERNED_EXPORT_FAILED` on failure | JSON consequence payload | Safe for beta |
| CERV2 ZIP export | `POST /api/cerv2/export/zip` | **No** | **No guaranteed governed artifact writeback in route** | **No explicit governed refs in response path** | Partial (archive error handling only) | Direct streamed ZIP attachment | **Blocked** |
| Conversation OS plan-execute | `POST /api/conversation-os/conversations/:id/plan-execute` | Proposal flow (not export flow) | Proposal + artifact path exists via service layer | Accept/reject governance path exists in Conversation OS | Context required for project/user; rejects invalid context | JSON trace/quality/proposal | Safe with caveat |

---

## Evidence (Route-Level)

### 1) Governed export helper exists
- `createGovernedExportConsequence(...)` calls `registerArtifactWithGovernance(...)`.
- Response includes `artifact_id`, `artifact_version`, `artifact_status`, `provenance_ref`, `audit_ref`, and downloadable output reference.

### 2) eSTAR route is governed now
- `server/routes/510k-estar-routes.ts` invokes `createGovernedExportConsequence(...)` using `sourceType: 'export_estar_zip'` and returns JSON consequence.
- Failure path explicitly returns `GOVERNED_EXPORT_FAILED`.

### 3) CERV2 PDF and DOCX routes are governed now
- Both routes call `createGovernedExportConsequence(...)` and return governed consequence JSON.
- Both include fail-closed error handling for governed persistence failures.

### 4) CERV2 ZIP remains bypass-like
- ZIP route sets attachment headers, pipes `archiver` directly to response, and finalizes stream.
- Route does not invoke governed consequence helper.

### 5) Conversation OS is a valid orchestration insertion point
- Supports plan-execute, scout run/promote, proposal create/list/accept/reject, and artifact version listing.
- Enforces authoritative context for `projectId` and `userId` in key mutation endpoints.

---

## Documentation Contradictions / Stale Claims

`docs/audits/BETA_READINESS_MASTER.md` still states broad blockers that are now partially stale:
- claims eSTAR build bypass and CERV2 export bypass as blanket truths,
- while current code shows eSTAR + CERV2 PDF/DOCX now governed.

This document should be amended to isolate the remaining blocker to CERV2 ZIP (and any other uncovered surfaces), instead of broad route family claims.

---

## Classification

### Safe for beta
- eSTAR `POST /api/510k/estar/build`
- CERV2 `POST /pdf`
- CERV2 `POST /docx`

### Safe with caveat
- Conversation OS orchestration surfaces (requires strict contract + policy layering for new Reasoning Tier outputs)

### Blocked
- CERV2 `POST /zip` until governed consequence parity is added.

### Stale documentation mismatch
- `docs/audits/BETA_READINESS_MASTER.md` statements on eSTAR/CERV2 bypass need route-specific correction.

---

## Required Remediation Before Reasoning Tier Product Wiring

1. Bring CERV2 ZIP to governed consequence parity.
2. Update BETA readiness documentation to match current code truth.
3. Add CI policy check for export surfaces that are beta-visible but not governed.
4. Establish a governance coverage registry for all export-class routes.

