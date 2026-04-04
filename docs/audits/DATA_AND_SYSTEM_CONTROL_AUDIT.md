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

## Plane D — Workspace

### Monolith Surgery Targets

| File | Lines | Responsibilities | Status |
|------|-------|-----------------|--------|
| `ProjectWorkspaceShell.tsx` | _Pending_ | _Pending_ | Surgery needed |
| `workspaceShellControllers.ts` | _Pending_ | _Pending_ | Surgery needed |
| `server/index.ts` | ~285KB | _Pending_ | Reduce to bootstrap |
| `server/routes/concept2cure.ts` | ~17,823 | 150 endpoints | Split into domain modules |

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
