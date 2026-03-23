# CMC Code & Structure Optimization Workstream (Performance + Maintainability)

**Date:** 2026-03-23

## Scope audited
- `client/src/modules/CMCModule.jsx`
- `client/src/modules/cmc/CMCReportsTab.jsx`
- `server/api/cmc/projectRoutes.ts`

## Optimization changes implemented now
1. Extracted reports/collaboration logic from `CMCModule.jsx` into dedicated `CMCReportsTab.jsx` component.
   - Reduces module complexity and re-render surface in the main CMC page.
   - Improves maintainability and future feature isolation.
2. Preserved memoized loading and mapping in `CMCModule` while moving heavy report state/effects out of main module render path.
3. Removed unused legacy CMC API helper file `client/src/api/cmc.js` (no in-repo import references), reducing dead code.
4. Deduplicated duplicate CMC project routes for `GET /projects/:projectId/documents` and `GET /projects/:projectId/compliance` in `server/api/cmc/projectRoutes.ts` to avoid ambiguous handler maintenance.
5. Retained backend payload validation hardening for project document creation to reduce invalid writes and noisy retries.

## Measured structural gains (static)
- Main CMC module no longer owns report history, preview generation, collaboration CRUD, local persistence, and attachment flow.
- Reports concerns are now localized to one component with dedicated lifecycle/state ownership.

## Remaining high-impact optimization backlog
1. **Split `CMCModule.jsx` by domain tabs**
   - Extract `Projects`, `Substances`, `Products`, `Compliance`, `Templates` into tab components.
2. **API layer normalization**
   - Move inline `fetch` calls to a typed service layer with cached query hooks.
3. **Virtualization for large lists**
   - Add virtualization for project/substance/product card/table views when records scale.
4. **Neon index strategy**
   - Add indexes for report-history access paths (`project_id`, `document_type`, `created_at`).

## Recommended next sprint deliverables
- `client/src/modules/cmc/tabs/*` extraction scaffolding
- typed CMC API client + React Query migration
- Neon migration for report-history indexes
