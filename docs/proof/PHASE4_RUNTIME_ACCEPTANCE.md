# Phase 4: Runtime Acceptance

## Build Status

```
✓ 5701 modules transformed.
✓ built in 46.69s
```

- **TypeScript errors:** 0
- **Lint errors:** 0
- **Build warnings:** Chunk size warnings only (pre-existing, not introduced by Phase 4)

## Files Modified

| File | Change | Lines |
|------|--------|-------|
| `server/routes/concept2cure.ts` | +4 backend endpoints | ~430 lines added |
| `client/src/.../ProjectWorkspaceShell.tsx` | Phase 4 state, handlers, rendering, entry points | ~120 lines added |
| `client/src/.../DossierTree.tsx` | 3 new context menu items, 3 new props | ~45 lines added |
| `client/src/.../TemplateTree.tsx` | 1 new action button, 1 new prop | ~25 lines added |

## Files Created

| File | Purpose | Lines |
|------|---------|-------|
| `client/src/.../RegulatoryTransformCanvas.tsx` | 5-lane transform pipeline panel | ~310 |
| `client/src/.../GoldenDossierVerificationPanel.tsx` | 4-dimension artifact verification | ~270 |
| `client/src/.../ProgramTwinPanel.tsx` | Regulatory program digital twin | ~330 |
| `client/src/.../SubmissionAppsPanel.tsx` | 6-app governed draft launcher | ~260 |

## Entry Point Matrix

| Surface | Access Method | Phase 4 Target |
|---------|---------------|----------------|
| Doc-aware header (edit mode) | ShieldCheck icon | Verification |
| Doc-aware header (edit mode) | Sparkles icon | Transform Canvas |
| Doc-aware header (edit mode) | Target icon | Program Twin |
| Doc-aware header (edit mode) | AppWindow icon | Submission Apps |
| DossierTree context menu | "Open Transform Canvas" | Transform Canvas |
| DossierTree context menu | "Create with Submission App" | Submission Apps |
| DossierTree context menu | "Show in Program Twin" | Program Twin |
| TemplateTree per-node button | Wand2 icon | Transform Canvas |
| Transform Canvas downstream | "Verify" button | Verification |
| ProgramTwin problems | "Verify" per-artifact link | Verification |
| SubmissionApps detail | "Open Transform Canvas" | Transform Canvas |

## API Endpoint Matrix

| Endpoint | Auth | DB Tables Queried |
|----------|------|-------------------|
| `GET /projects/:id/transform-context` | Org + Project access | artifacts, projects |
| `GET /projects/:id/artifacts/:aid/verification` | Org + Project access | artifacts, provenance, signatures, reviews |
| `GET /projects/:id/program-twin` | Org + Project access | artifacts, provenance, signatures, reviews |
| `GET /projects/:id/change-impact` | Org + Project access | artifacts |

## Architectural Compliance

- **No new auth mechanism** — all endpoints use existing `getOrganizationId()` + `verifyProjectAccess()`
- **No new DB tables** — all queries against existing `concept2cureArtifacts`, `concept2cureProvenanceEvents`, `concept2cureSignatures`, `concept2cureReviewComments`
- **No duplicate canvas** — Transform Canvas is a structured panel, not a rendering engine
- **No duplicate provenance** — reads existing provenance/governance data
- **No duplicate placement** — delegates to existing PlacementDialog
- **No duplicate artifact creation** — all draft creation uses existing `POST /artifacts`
- **Single source of truth** — CTD hierarchy, templates, verif rules, submission apps all from ctdHierarchy.ts
