# Export Governance Route Inventory (Audit Continuation)

**Date:** 2026-03-24  
**Purpose:** Continue the enterprise ethics/MLOps audit by enumerating export-capable routes and defining rollout order for governance middleware.

---

## 1) Scope and Method

- Scanned server routes for export surfaces (`/export`, `export-`, `export_`) and route handlers that produce downloadable artifacts.
- Mapped each route to a governance rollout tier.
- Labeled current status as:
  - **Implemented**: explicit governance gate already in place.
  - **Planned**: no standardized governance middleware yet.

---

## 2) Route Inventory and Rollout Tiers

| Tier | Route Surface | File | Current Status | Planned Action |
|---|---|---|---|---|
| P0 | `POST /api/concept2cure/artifacts/export-docx` | `server/routes/concept2cure.ts` | Implemented | Keep as reference implementation; extract shared middleware. |
| P0 | `POST /api/concept2cure/artifacts/export-pdf` | `server/routes/concept2cure.ts` | Implemented | Keep as reference implementation; extract shared middleware. |
| P0 | `POST /api/concept2cure/artifacts/export-pptx` | `server/routes/concept2cure.ts` | Implemented | Keep as reference implementation; extract shared middleware. |
| P0 | `POST /api/cerv2/export/pdf` | `server/routes/cerv2-export-routes.ts` | Planned | Apply shared middleware and export manifest headers. |
| P0 | `POST /api/cerv2/export/docx` | `server/routes/cerv2-export-routes.ts` | Planned | Apply shared middleware and export manifest headers. |
| P0 | `POST /api/cerv2/export/zip` | `server/routes/cerv2-export-routes.ts` | Planned | Require governance + reviewer evidence for bundle exports. |
| P0 | `POST /api/ectd/export/:submissionId` | `server/routes/ectd-export.ts` | Planned | Enforce review gate for regulated package generation. |
| P1 | `POST /api/document-authoring/documents/:id/export` | `server/routes/documentAuthoring.routes.ts` | Planned | Add governance middleware + metadata contract checks. |
| P1 | `POST /api/authoring/docs/:docId/export` | `server/routes/authoring.router.ts` | Planned | Add governance middleware + route-level audit logging. |
| P1 | `POST /api/stability/studies/:id/p8/export` | `server/src/routes/stability.router.ts` | Planned | Apply governance gate with risk-tier override policy. |
| P1 | `POST /api/quality/batches/:id/ectd/export` | `server/src/routes/quality.router.ts` | Planned | Enforce reviewer approval for submission-grade exports. |
| P1 | `POST /api/grdhe/exports` | `server/routes/grdheRoutes.ts` | Planned | Add governance to job creation and execution endpoints. |
| P2 | `GET /api/intelligent-reports/:reportId/export/:format` | `server/routes/intelligent-reports.ts` | Planned | Add read-export governance and disclosure watermarking. |
| P2 | `GET /api/decision-lineage/:entityType/:entityId/export` | `server/routes/decision-lineage.ts` | Planned | Add governance headers + classification-aware redaction gate. |
| P2 | `GET /api/evidence-management/export/:projectId` | `server/routes/evidence-management.routes.ts` | Planned | Add export metadata contract and policy checks. |

---

## 3) Standard Governance Contract (Target)

All export routes should converge on the following contract:

### Request
```json
{
  "governance": {
    "aiGenerated": true,
    "humanReviewApproved": true,
    "reviewerName": "...",
    "reviewerRole": "...",
    "reviewTimestamp": "2026-03-24T00:00:00Z"
  }
}
```

### Response headers
- `X-Concept2Cure-AI-Generated`
- `X-Concept2Cure-Human-Review-Approved`
- `X-Concept2Cure-Review-Required`
- `X-Concept2Cure-Reviewer` (when supplied)
- `X-Concept2Cure-Review-Timestamp` (when supplied)

### Enforcement
- `403 HUMAN_REVIEW_REQUIRED` for strict environments if approval is missing.
- Immutable audit event on every export with governance payload hash.

---

## 4) Delivery Sequence (2 Sprints)

## Sprint A (P0)
1. Extract shared export governance middleware from Concept2Cure routes.
2. Apply middleware to CERV2 and eCTD export routes.
3. Add integration tests for approved/unapproved paths and header assertions.

## Sprint B (P1/P2)
1. Apply middleware to authoring/stability/quality/grdhe routes.
2. Add governance-aware redaction/classification controls for read-export endpoints.
3. Add global dashboard metric: **ungated export endpoints** (target = 0 for P0/P1).

---

## 5) Exit Criteria

- 100% of P0 routes enforce standardized governance middleware.
- 100% of P0 routes emit governance headers.
- Integration tests cover deny/allow and metadata behavior for P0 routes.
- Route inventory updated weekly until all P1 routes are fully gated.
