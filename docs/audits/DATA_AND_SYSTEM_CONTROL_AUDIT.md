# Data & System Control Audit

> **Program:** Concept2Cure Data + System Control Program v4
> **Date:** 2026-04-04
> **Branch:** `claude/data-system-control-program-v4`
> **Status:** Phase 1 — In Progress

---

## Audit Scope

This audit maps every canonical authority, data path, and system plane boundary
in the Concept2Cure codebase. It identifies duplicate authorities, stale adapters,
and structural violations of the core law:

**Intent -> Orchestration -> Governed Decision -> Artifact/Document -> Editor/Placement -> Lifecycle/Audit**

---

## Plane A — Identity (MAPPED)

### Session/Token Creation
| Aspect | Detail |
|--------|--------|
| Canonical owner | `server/routes/auth.ts` — `POST /api/auth/login` (JWT via `jwt.sign`) |
| Duplicate owners | `server/auth.ts` (redundant login fn), `server/routes/authEnterprise.ts` (enterprise multi-step) |
| Read paths | Client `authToken.ts` `getAuthToken()` -> memory/sessionStorage |
| Write paths | Login -> JWT sign -> response cookie/body -> client stores |
| Decision | **Preserve** routes/auth.ts. **Absorb** auth.ts login into routes/auth.ts. **Preserve** authEnterprise as separate route group. |

### Session Revocation
| Aspect | Detail |
|--------|--------|
| Canonical owner | `server/routes/auth.ts` — in-memory `tokenBlacklist` Set |
| Duplicate owners | `authEnterprise.ts` logout (STUB — returns 200 but does NOT revoke), `users.ts` logout (STUB) |
| Critical gap | **In-memory only** — resets on restart. No Redis persistence. Client logout doesn't invalidate server token. |
| Decision | **Preserve** canonical. **Delete** stub logouts. **Migrate** to Redis-backed blacklist for production. |

### Auth Middleware
| Aspect | Detail |
|--------|--------|
| Canonical owner | `server/middleware/auth.ts` — `authenticateToken()` (aliases: authenticateJWT, requireAuth) |
| Duplicate owners | `server/middleware/auth.js` (STRICTER — enforces orgId, blocks tenant impersonation), `server/auth.ts` (legacy `authMiddleware()`), `server/middleware/authAdapter.ts` (ESM wrapper for auth.js) |
| Critical gap | **Two incompatible implementations** — auth.js is more secure but less used. auth.ts comment says "Post-beta: merge security features from .js into .ts" |
| Decision | **Merge** security features from auth.js INTO auth.ts. **Delete** auth.js + authAdapter.ts. **Deprecate** server/auth.ts standalone middleware. |

### Org/User Identity Resolution
| Aspect | Detail |
|--------|--------|
| Canonical owner | `server/routes/auth.ts` login (resolves org membership from `organizationUsers` table) |
| Duplicate owners | 4 req augmentation patterns: `req.user.organizationId`, `req.tenantContext.organizationId`, `req.userId` + `req.tenantId`, `x-organization-id` header (SECURITY RISK — spoofable) |
| Client side | `client/src/utils/authToken.ts` `getOrgId()` — fallback chain: currentOrganizationId -> currentOrganization -> trialsage_user -> '1' |
| Decision | **Standardize** to single `req.user` object. **Deprecate** req.tenantContext, req.tenantId. **Reject** x-organization-id header override. |

### Access/Entitlement (RBAC)
| Aspect | Detail |
|--------|--------|
| Canonical owner | `server/services/roleBasedAccess.ts` — `checkPermission()`, `requirePermission()`, `requireRole()` with role hierarchy + fine-grained permissions |
| Duplicate owners | `server/middleware/auth.ts` simple `requirePermission()` (less sophisticated), `server/src/mw/rbac.ts` (CMC-specific roles, incompatible hierarchy) |
| Decision | **Preserve** RoleBasedAccess service. **Migrate** middleware simple checks to use RBACService. **Wrap** CMC RBAC as domain-specific extension. |

### MFA
| Aspect | Detail |
|--------|--------|
| Canonical owner | `server/services/mfaService.ts` (TOTP via native crypto) + `server/services/emailOtpService.ts` (email OTP) |
| Duplicate owners | `server/services/auth-security-service.ts` (speakeasy library — older TOTP impl) |
| Decision | **Preserve** mfaService + emailOtpService. **Deprecate** speakeasy in auth-security-service. |

---

## Plane B — Governance (MAPPED)

### Governance Decision Truth
| Aspect | Detail |
|--------|--------|
| Canonical owner | `server/services/governed-decision-repository.ts` (v2.0.0) |
| Orchestrator | `server/src/control-plane/governed-document-evaluator.ts` |
| Controller | `server/controllers/governance-controller.ts` |
| Duplicate owners | None — consolidated from 3 prior files |
| Read paths | governance-controller -> routes/concept2cure.ts |
| Write paths | evaluator -> repository -> PostgreSQL |
| Decision | **Preserve** — clean canonical path |

### Workflow Preflight Truth
| Aspect | Detail |
|--------|--------|
| Canonical owner | `server/src/control-plane/readiness-gates.ts` (v1.0.0) |
| Duplicate owners | `server/services/intelligence/readiness-scoring-engine.ts` (numerical scores, different purpose), `server/src/services/reg/preflight.ts` (regulatory-specific), `server/submission-ops/readiness-engine.ts` (legacy) |
| Read paths | authoring-actions.ts `/promotion-blockers/:projectId` |
| Write paths | None — purely evaluative, derives from document/review/contradiction state |
| Decision | **Preserve** readiness-gates as categorical authority. **Wrap** scoring-engine as supplementary. **Deprecate** submission-ops readiness-engine. |

### Review Queue/History
| Aspect | Detail |
|--------|--------|
| Canonical owner | `server/routes/approval-workflow.ts` + `server/services/workflow/ApprovalOrchestrator.ts` |
| Lineage | `server/services/workflow/DecisionLineageService.ts` (immutable audit chain, 21 CFR Part 11) |
| Schema | `concept2cureReviewThreads`, `concept2cureReviewComments`, `concept2cureReviewTasks`, `concept2cureReviewAssignments`, `concept2cureReviewDecisions` |
| Duplicate owners | DecisionLineageService overlaps with governed-decision-repository (broader vs governance-specific) |
| Gap | Review threads/comments have schema but **no dedicated service** — managed inline in concept2cure.ts routes |
| Decision | **Preserve** ApprovalOrchestrator. **Extract** review thread management from concept2cure.ts into dedicated service. |

### Promotion/Export/Publish Decisions
| Aspect | Detail |
|--------|--------|
| Canonical owner | `server/src/control-plane/export-publish-gates.ts` (v1.0.0, fail-closed) |
| Consequence | `server/services/export/governedExportConsequence.ts` |
| Orchestrator | `server/src/control-plane/governed-document-evaluator.ts` (combines readiness + placement + gates + consequence + decision) |
| Duplicate owners | None |
| Write paths | evaluator -> decision-repo -> PostgreSQL |
| Decision | **Preserve** — clean single-owner architecture |

### Nav Gating Truth
| Aspect | Detail |
|--------|--------|
| Canonical owner | `client/src/concept2cure/router/approvedRoutePolicy.ts` (client-side policy table) |
| Helper | `client/src/concept2cure/router/projectModuleRoutePolicy.ts` (per-project module access) |
| Integration | ZenApp.tsx evaluates `evaluateApprovedRoute()` before rendering |
| Duplicate owners | None |
| Decision | **Preserve** — single canonical policy |

### Readiness Scoring
| Aspect | Detail |
|--------|--------|
| Canonical owner | `server/services/intelligence/readiness-scoring-engine.ts` (numerical dimensions) |
| Complement | `server/src/control-plane/readiness-gates.ts` (categorical lifecycle states) |
| Client | `useReadinessAssessment` hook, `WorkspaceReadinessStrip.tsx` |
| Decision | **Preserve both** — different purposes (scores vs gates). Document boundary. |

---

## Plane C — Artifacts (MAPPED)

**Critical finding:** Artifacts and documents are ONE system. `concept2cureArtifacts` is the single table. No bridge needed.

### Artifact/Document Identity
| Aspect | Detail |
|--------|--------|
| Canonical owner | `concept2cureArtifacts` table (`shared/schema.ts:5267`) — single unified model |
| Creation route | `POST /api/concept2cure/projects/:projectId/artifacts` (`concept2cure.ts:6487`) |
| Duplicate owners | None for creation. `unifiedDocuments` table exists but **orphaned** (zero queries). `authoring_documents` is a **separate legacy system** in authoring.router.ts. |
| Decision | **Preserve** concept2cureArtifacts as canonical. **Quarantine** unifiedDocuments (unused). **Document** authoring_documents as legacy plane. |

### Editor Open Path
| Aspect | Detail |
|--------|--------|
| Canonical owner | `client/.../editor/EditorPanel.tsx` -> renders `UnifiedDocumentEditor` |
| Flow | Click (VaultPage/ArtifactsPage) -> API fetch artifacts -> select artifact -> EditorPanel receives props -> TipTap editor |
| Save path | EditorPanel -> `PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId` (concept2cure.ts:6796) |
| Duplicate owners | ZenApp.tsx line 1145 has **direct status fetch** bypassing unified pattern |
| Decision | **Preserve** EditorPanel as canonical. **Absorb** ZenApp direct fetch into unified hook. |

### Dossier Placement
| Aspect | Detail |
|--------|--------|
| Canonical owner | `PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId/placement` (concept2cure.ts:7107) |
| Storage | `concept2cureArtifacts.ctdSection` (e.g., "3.2.S.1") + metadata JSON |
| Governance | `governedDocumentContractService.ts` infers workspace target (dossier vs project vs vault) |
| Provenance | All placements logged to `concept2cureProvenanceEvents` |
| Duplicate owners | None |
| Decision | **Preserve** — clean canonical path |

### Version Management
| Aspect | Detail |
|--------|--------|
| Canonical owner | `concept2cureArtifactVersions` table (`shared/schema.ts:5315`) — immutable append-only |
| Creation | Auto on artifact create (v1), increment on PUT update (concept2cure.ts:6817) |
| Comparison | `GET /compare-versions/:projectId/:artifactId` (in authoring-actions.ts, separate domain) |
| Provenance | `concept2cureProvenanceEvents.artifactVersionId` links versions to events |
| Duplicate owners | Version comparison lives in authoring-actions.ts rather than concept2cure.ts |
| Decision | **Preserve** — consider migrating comparison endpoint to concept2cure domain |

### Export Contract
| Aspect | Detail |
|--------|--------|
| Canonical owner | `server/services/compute/exportGovernance.ts` — `validateExportGovernance()` (fail-closed) |
| Endpoints | `POST /artifacts/export-{docx,pdf,pptx}` (concept2cure.ts:11520-11900) |
| Audit | `registerExportGovernanceQuick()` logs every export with org/project/user/format/IP |
| Duplicate owners | `docx-factory.ts` BFF proxy to Shadow Service (different auth model, X-Admin-Token) |
| Decision | **Preserve** concept2cure exports as canonical. **Wrap** docx-factory as integration adapter. |

---

## Plane D — Workspace (MAPPED)

### Monolith Surgery Targets

| File | Lines | Imports | Responsibilities | Extract Count |
|------|-------|---------|-----------------|---------------|
| `ProjectWorkspaceShell.tsx` | 2,163 | 23 | **12 distinct concerns** | 8 hooks to extract |
| `workspaceShellControllers.ts` | 147 | 3 | 6 hooks (skeleton) | 2 need expansion |
| `server/index.ts` | 7,256 | 143 | 7 bootstrap + 20+ direct mounts | 2+ bootstrap files |
| `server/routes/concept2cure.ts` | 17,823 | 72 | 150 endpoints in 1 file | 10 domain files |

### ProjectWorkspaceShell.tsx — 12 Responsibilities (Must Reduce)

1. Workspace layout rendering (top bar, left rail, center, inspector)
2. Artifact/document navigation state (19 useState + hooks)
3. Submission hierarchy resolution (section trees -> dossier nodes)
4. File system operations (load/filter artifacts, folders, sections)
5. Edit workflow escalation (canEscalate, tryOpenForEdit)
6. Document lifecycle (create, cut/paste, placement dialogs, status)
7. Template management (creation flows, subsection generation)
8. Governed document evaluation (consequence jobs, proposals, review)
9. Guided authoring sequences (stage commands, prompts, phase4 panels)
10. Metric aggregation (readiness, dossier metrics, work items)
11. Toast notification system (3 types)
12. Context awareness (document snapshots, conversation context)

**Extraction targets:**
- `useArtifactManager` (~250 lines) — load/filter/classify artifacts
- `useGuidedSequence` (~200 lines) — stage execution, history, results
- `usePhase4Orchestration` (~150 lines) — panel switching with context
- `usePlacementDialogState` — expand existing skeleton
- `useSubmissionHierarchy` — wrap useSubmissionSections
- `useDossierMetrics` — section readiness tracking
- `useGovernedDocumentContext` — consequence state
- `useShellToasts` — notification system

### server/index.ts — Direct Mounts to Extract

20+ route mounts NOT in bootstrap manifests (lines 562-1500+):
- Device projects CRUD (lines 562-800) — **should be its own route file**
- Health/diag endpoints (lines 434-522) — **should be in registerPlatformRoutes**
- CSR search, AnA Cortex, Nano Banana, predictive sections
- Biotech RAG, IVDR, manufacturing, pharmacovigilance
- FDA, CER, stability, GCC, document-authoring, HAQ, IND

### server/routes/concept2cure.ts — Domain Split Plan

| Domain Module | Endpoints | Line Range |
|--------------|-----------|------------|
| `concept2cure/projects.ts` | 13 | 1753-3800 |
| `concept2cure/governance.ts` | 7 | 3283-3500 |
| `concept2cure/artifacts.ts` | 15 | 3809-7300 |
| `concept2cure/ai-services.ts` | 8 | 4226-5900 |
| `concept2cure/reviews.ts` | 20 | 13863-15700 |
| `concept2cure/exports.ts` | 3 | 11520-11900 |
| `concept2cure/notifications.ts` | 5 | 16127-16300 |
| `concept2cure/tasks.ts` | 5 | 12009-13000 |
| `concept2cure/communication.ts` | 7 | 13024-13400 |
| `concept2cure/intelligence.ts` | 6 | 17015-17823 |

### Shared Utilities to Extract First

| Utility | Current Location | Target |
|---------|-----------------|--------|
| `sendSuccess` / `sendError` | concept2cure.ts:122-140 | `server/lib/response-helpers.ts` |
| `logAuditEntry` | concept2cure.ts:278+ | `server/services/audit-logger.ts` |
| `parseProjectParam` | concept2cure.ts:233-239 | `server/lib/id-parsers.ts` |
| `canViewVisibilityTier` | concept2cure.ts:241-265 | `server/services/communication-center-access.ts` |

---

## Plane E — Domain Engines

_Mapped after Planes A-D locked._

## Plane F — Integrations

_Mapped after Planes A-D locked._

## Plane G — Control

_Mapped after delivery hardening._

## Plane H — Delivery

_Mapped during Phase 7._

---

*This document is updated as each phase completes.*
