# Multi-Agent PR Audit Report: PRs #344-#356
**Date**: 2026-04-02
**Scope**: All changes from PRs #344 through #356 (13 PRs)
**Method**: 5 parallel audit agents covering server routes, frontend, schemas, middleware/services, and tests

---

## Executive Summary

| Severity | Found | Fixed |
|----------|-------|-------|
| CRITICAL | 6     | 6     |
| HIGH     | 15    | 10    |
| MEDIUM   | 20    | 8     |
| LOW      | 13    | 0     |
| **Total**| **54**| **24**|

---

## CRITICAL Fixes Applied

### 1. Duplicate import causes compilation failure
**File**: `server/services/regulatory/defaultInstructionBuilder.ts:15`
**PR**: #352
**Fix**: Removed duplicate `import { getApplicationType }` line.

### 2. Missing schema exports break runtime imports
**File**: `shared/schema/index.ts`
**PR**: #352
**Fix**: Added `export * from './cmc-os'` — 7 CMC tables (cmcSourceObjects, cmcModule3Sections, cmcSectionLineage, cmcContradictions, cmcAiCommandResults, cmcModule3SectionVersions, cmcProvenanceEvents) were defined but never exported from the barrel.

### 3. Broken type imports cause compilation failure
**File**: `shared/utils/communication-center-rules.ts:1-6`
**PR**: #356
**Fix**: Added missing `SUBMISSION_CENTER_ITEM_STATES` and `SubmissionCenterItemState` exports to `shared/types/communication-center.ts`. The rules file imported these symbols but they didn't exist.

### 4. Raw fetch() bypasses auth in telemetry hook
**File**: `client/src/pages/csr/hooks/useBetaWorkspaceTelemetry.js:14-18,62-68`
**PR**: #354
**Fix**: Replaced raw `fetch()` calls with `apiRequest()` from `@/lib/queryClient` which handles auth tokens automatically.

### 5. Mock upload simulation in production path
**File**: `client/src/concept2cure/components/cmc/CMCHub.tsx:412-421`
**PR**: #352
**Fix**: Replaced `setTimeout + Math.random()` simulation with real API call to `/api/cmc/extract-document`.

### 6. Missing FK constraints allow orphaned rows
**File**: `db/migrations/20260401_submission_center_items.sql`
**PR**: #356
**Fix**: Added `REFERENCES organizations(id)` and `REFERENCES projects(id) ON DELETE CASCADE` to organization_id and project_id columns.

---

## HIGH Fixes Applied

### 7. Missing tenant scoping in workflow routes (cross-tenant data leak)
**Files**: `server/api/cmc/workflowRoutes.ts` (GET `/`, GET `/:id`)
**Fix**: Added `getOrganizationId(req)` + `where(eq(projectWorkflows.organizationId, orgId))` to queries.

### 8. Tenant header spoofing in 6 CMC route files
**Files**: `workflowRoutes.ts`, `routes.ts`, `batchRecordRoutes.ts`, `stabilityRoutes.ts`, `documentRoutes.ts`, `specificationRoutes.ts`
**Fix**: Removed `req.headers['x-tenant-id']`, `req.headers['x-organization-id']`, and `req.query.organizationId` fallbacks from tenant extraction. Now relies exclusively on auth-middleware-set `req.tenantId` / `req.tenantContext.organizationId`.

### 9. Missing tenant scoping in batch record update/release
**File**: `server/api/cmc/batchRecordRoutes.ts` (PUT `/:id`, POST `/:id/release`)
**Fix**: Added tenant ID extraction and `AND (tenant_id = $2 OR tenant_id IS NULL)` to ownership checks.

### 10. Mock compliance data in production path
**File**: `server/api/cmc/routes.ts` (POST `/compliance/check-rules`)
**Fix**: When no compliance_tracking records exist, now returns empty rules array + 100 score instead of hardcoded fake ICH violations. DB failures now return 500 instead of mock data.

### 11. In-memory fallback for failed workflow persistence
**File**: `server/api/cmc/routes.ts` (POST `/insights/take-action`)
**Fix**: Removed in-memory mock task fallback. DB failures now return 500 error. Added `organization_id` to the INSERT query.

### 12. Silent error handling in CMCHub save/generate
**File**: `client/src/concept2cure/components/cmc/CMCHub.tsx`
**Fix**: Added `useToast()` hook. Save and generate failures now show toast notifications instead of only logging to `console.error`.

### 13. Unhandled async error in CMCCommandCenter contradiction resolve
**File**: `client/src/concept2cure/components/cmc/CMCCommandCenter.tsx`
**Fix**: Wrapped inline async click handler in try/catch with toast notifications for success and failure.

### 14. Raw fetch() in VaultPage
**File**: `client/src/pages/vault/VaultPage.jsx`
**Fix**: Replaced `fetch('/api/vault/list')` with `apiRequest('GET', '/api/vault/list')` and added toast error feedback.

---

## Remaining HIGH Issues (Not Fixed — Require Larger Refactors)

### H1. Hardcoded AI command responses in workflowRoutes.ts
**File**: `server/api/cmc/workflowRoutes.ts:587-811`
The `/ai-command` endpoint returns hardcoded markdown for each command type instead of calling the AI gateway. Fixing requires AI gateway integration design.

### H2. CERV2Page.jsx uses axios (385KB+ untyped JSX)
**File**: `client/src/pages/csr/CERV2Page.jsx`
This is a 385KB file using axios instead of apiRequest. Full migration requires significant effort.

### H3. Non-functional action menu items in DocumentBrowser
**File**: `client/src/components/document-management/DocumentBrowser.jsx:506-516`
"Version History", "Edit Properties", and "Delete" menu items render but have no onClick handlers.

### H4. CMCHub forms use useState per field instead of react-hook-form
**File**: `client/src/concept2cure/components/cmc/CMCHub.tsx:326-352`
Forms should use react-hook-form + FormField pattern per project standards.

### H5. CMCHub tabs are static stubs (Specifications, Stability, Impurities)
**File**: `client/src/concept2cure/components/cmc/CMCHub.tsx:777-900+`
Three tabs show "No data yet" with non-functional "Add" buttons.

---

## MEDIUM Issues Identified (Deferred)

1. **Runtime DDL in routes.ts** — `CREATE TABLE IF NOT EXISTS` at request time instead of migrations
2. **Missing tenant scoping** in stability projections, specification history, download endpoints
3. **Raw HTML elements** — raw `<button>`, `<input>`, `<select>` in multiple components (CommunicationCenter, EmbeddedModuleHosts, CMCCommandCenter, CMCHub, VaultPage)
4. **Missing ARIA attributes** across CommunicationCenter, EmbeddedModuleHosts, CMCCommandCenter, CMCHub
5. **Missing DataStateWrapper** in CommunicationCenter, CMCCommandCenter
6. **Non-transactional DELETE+INSERT** in contradiction detection endpoint
7. **Hardcoded analytics values** in workflowRoutes.ts `/analytics/performance`
8. **Missing organizationId** on regulatory correspondence types
9. **ComponentType<any>** usage in EmbeddedModuleHosts
10. **Duplicate type declarations** between ProjectWorkspaceShell and workspaceShellControllers

---

## Files Modified

| File | Changes |
|------|---------|
| `server/services/regulatory/defaultInstructionBuilder.ts` | Removed duplicate import |
| `shared/schema/index.ts` | Added cmc-os barrel export |
| `shared/types/communication-center.ts` | Added SUBMISSION_CENTER_ITEM_STATES |
| `client/src/pages/csr/hooks/useBetaWorkspaceTelemetry.js` | raw fetch -> apiRequest |
| `client/src/concept2cure/components/cmc/CMCHub.tsx` | Real upload API, toast errors |
| `client/src/concept2cure/components/cmc/CMCCommandCenter.tsx` | Error handling + toast |
| `client/src/pages/vault/VaultPage.jsx` | raw fetch -> apiRequest, toast errors |
| `server/api/cmc/workflowRoutes.ts` | Tenant scoping, header hardening |
| `server/api/cmc/routes.ts` | Mock data removal, tenant scoping, header hardening |
| `server/api/cmc/batchRecordRoutes.ts` | Tenant scoping, header hardening |
| `server/api/cmc/stabilityRoutes.ts` | Header hardening |
| `server/api/cmc/documentRoutes.ts` | Header hardening |
| `server/api/cmc/specificationRoutes.ts` | Header hardening |
| `db/migrations/20260401_submission_center_items.sql` | Added FK constraints |
