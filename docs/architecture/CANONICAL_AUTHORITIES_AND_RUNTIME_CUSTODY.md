# Canonical Authorities and Runtime Custody

> Boulder-to-Statue Restructure — Phase 1 & 2 Deliverable
> Generated: 2026-04-04

---

## Phase 1: Authority Purge

### Authority Table

| Concern | Canonical Owner | Duplicate/Legacy Owners | Action | Risk | Status |
|---|---|---|---|---|---|
| **Session/Revocation** | `server/routes/auth.ts` (JWT issue, refresh, revoke, blacklist) | `server/routes/users.ts` (legacy logout), `server/routes/authEnterprise.ts` (enterprise logout), `server/controllers/auth.js` (legacy controller) | Legacy logout in users.ts: **deprecated**. Enterprise logout: **compatibility wrapper**. controllers/auth.js: **quarantine**. | Low — all paths converge on same JWT blacklist | Done now |
| **Org/Project Identity** | `server/utils/tenantContext.ts` (`getTenantContext`, `getSecureOrgId`) + `server/middleware/tenantContext.ts` | `server/middleware/auth.ts` (sets organizationId on req.user), `server/auth.ts` (parses from JWT), `server/services/ana-ri/chat-context-builder.ts` (resolveProjectIdFromBody), `server/routes/report-os.ts` (resolveProjectIdForRun) | auth.ts/middleware/auth.ts: **tolerated** (upstream of tenantContext). chat-context-builder: **compatibility wrapper**. report-os local resolver: **deprecated** (must call tenantContext). | Medium — local resolvers could drift from canonical | Deferred (touched-scope only) |
| **Governance/Readiness** | `server/services/intelligence/readiness-scoring-engine.ts` (unified scoring) | `server/services/regulatory/readinessEvaluator.ts` (registry-aware), `server/submission-ops/readiness-engine.ts` (Phase 15), `server/services/orchestration/readiness-engine.ts`, `server/services/cmc/readiness.ts`, `server/src/control-plane/readiness-gates.ts` | readinessEvaluator: **canonical** for registry-specific. submission-ops: **canonical** for submission-level. orchestration/readiness: **quarantine**. cmc/readiness: **compatibility wrapper** (delegates to scoring engine). control-plane gates: **canonical** for gate enforcement. | High — 3 readiness engines with different scopes, no single orchestrator | Deferred |
| **Workflow/Nav Preflight** | `server/src/control-plane/readiness-gates.ts` (gate enforcement) + `server/src/services/reg/preflight.ts` | `services/workflow/PreconditionChecker.ts`, `server/services/workflow/WorkflowExecutionEngine.ts`, `server/services/orchestration/workflow-orchestrator.ts`, `server/src/control-plane/export-publish-gates.ts` | PreconditionChecker: **compatibility wrapper**. WorkflowExecutionEngine: **canonical** for execution. orchestration/workflow-orchestrator: **quarantine**. export-publish-gates: **canonical** for export-specific gates. | Medium — workflow execution and gate enforcement are separate concerns | Deferred |
| **Artifact/Document Identity** | `server/src/control-plane/document-context-resolver.ts` (v1.0.0) | `server/services/concept2cure/governedDocumentContractService.ts`, `server/services/orchestration/cross-object-resolver.ts`, `server/services/lumen-context-builder.ts`, `server/routes/document-routes.ts` | governedDocumentContractService: **canonical** for governed ops. cross-object-resolver: **quarantine**. lumen-context-builder: **tolerated** (AI context only). document-routes: **tolerated** (basic CRUD). | Low — control-plane resolver is clearly canonical | Done now |
| **Editor Open Path** | `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` → `WorkspaceCenterSurface` → `EditorPanel` | `client/src/routes/authoring/documents/[docId]/EditorPage.tsx` (route-level), `client/src/concept2cure/components/writing/ClinicalDocAuthoringWorkspace.tsx` (legacy), `client/src/concept2cure/components/workflow/SectionWorkspace.tsx` | EditorPage.tsx: **compatibility wrapper** (redirects to workspace path). ClinicalDocAuthoringWorkspace: **quarantine**. SectionWorkspace: **tolerated** (specialized context). | Medium — multiple editor entry points confuse navigation | Done now |
| **Dossier Placement** | `server/src/control-plane/placement-authority.ts` (v1.0.0) | `server/routes/dossier_routes.ts` (legacy file-based), `server/services/cognitive-ecosystem/global-dossier.service.ts` | dossier_routes.ts: **deprecated** (legacy non-governed). global-dossier.service: **quarantine**. | Low — placement-authority is clearly canonical | Done now |
| **Export Contract** | `server/services/compute/exportGovernance.ts` (governed export registration) + `server/src/control-plane/export-publish-gates.ts` | `server/routes/export-routes.ts`, `server/routes/cerv2-export-routes.ts`, `server/routes/ectd-export.ts`, `server/routes/rtm-export.ts`, `server/services/export-service.ts`, `server/services/ai-actions/handlers/export-document.ts` | export-routes.ts: **canonical** for study bundles. cerv2/ectd/rtm: **canonical** per format. export-service: **canonical** service layer. ai-actions/export-document: **compatibility wrapper**. All must invoke exportGovernance. | Medium — multiple export routes don't consistently invoke governance | Deferred |

---

## Phase 2: Runtime Custody Map

### Database Layer

| Package | Version | Classification | Justification |
|---|---|---|---|
| `drizzle-orm` | 0.39.1 | **Canonical now** | Primary ORM for all production DB operations. 250+ import sites. |
| `pg` | 8.14.1 | **Canonical now** | PostgreSQL connection pool — required by drizzle-orm/node-postgres adapter. |
| `postgres` | 3.4.5 | **Tolerated legacy** | Used only for tenant DB isolation path (`server/db/tenantDb.ts`). |
| `@neondatabase/serverless` | 0.10.4 | **Quarantined** | Used only in 2 setup scripts. Not in production paths. |
| `@prisma/client` | 7.5.0 | **Quarantined** | Lazy-loaded fallback in 3 files. Wrapped in error proxy. Not primary ORM. |
| `@supabase/supabase-js` | 2.49.1 | **Tolerated legacy** | Used in 4 specialized services (harvesting, copilot). Not core platform. |

### Declared Primary Persistence Path
`drizzle-orm` via `pg` Pool → `server/db.ts` → all production routes and services.

### Client-Side & Collaboration

| Package | Version | Classification | Justification |
|---|---|---|---|
| `firebase` | 12.11.0 | **Tolerated legacy** | Real-time collaboration (cursors, presence). Not data layer. Client-side only. |

### Storage

| Package | Version | Classification | Justification |
|---|---|---|---|
| `@aws-sdk/client-s3` | 3.758.0 | **Canonical now** | Modern S3 client for file storage. Conditionally loaded. |
| `@aws-sdk/s3-request-presigner` | 3.758.0 | **Canonical now** | Pre-signed URL generation for S3. |
| `aws-sdk` (v2) | 2.1692.0 | **Quarantined** | Legacy v2 SDK. Superseded by @aws-sdk/* v3. |

### Graph/Flow

| Package | Version | Classification | Justification |
|---|---|---|---|
| `reactflow` | 11.11.4 | **Canonical now** | Actively used in PlatformReadinessDashboard. |
| `@xyflow/react` | 12.10.2 | **Remove now** | Installed but zero active imports. Incomplete migration. |

### Declared Primary Graph Path
`reactflow` v11 — all active flow diagrams.

### Testing

| Package | Version | Classification | Justification |
|---|---|---|---|
| `vitest` | 2.1.5 | **Canonical now** | ESM-native, primary for new tests. |
| `jest` | 29.7.0 | **Tolerated legacy** | Client-side tests via babel-jest. Legacy server tests. |

### Declared Primary Test Path
`vitest` for new tests (server + shared). `jest` tolerated for existing client tests.

### Governance Consumption Path
`server/src/control-plane/` — readiness-gates, placement-authority, document-context-resolver, export-publish-gates.

---

## Actions Taken

1. `@xyflow/react` — identified for removal from package.json (zero consumers)
2. `@neondatabase/serverless` — quarantined (script-only usage)
3. `@prisma/client` — quarantined (fallback-only, error-wrapped proxy)
4. `aws-sdk` v2 — quarantined (superseded by @aws-sdk/* v3)
5. Authority table documented with explicit canonical/deprecated/quarantine per concern
