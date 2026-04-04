# Canonical Authorities & Boundaries

> **Program:** Concept2Cure Data + System Control Program v4
> **Date:** 2026-04-04
> **Status:** Phase 1 — Research in progress

---

## Authority Map

For each system concern, there must be exactly ONE canonical authority.
Duplicate authorities are classified as: preserve | wrap | deprecate | delete.

### Identity Authorities

| Concern | Canonical Authority | File | Duplicates | Decision |
|---------|-------------------|------|------------|----------|
| JWT creation | `routes/auth.ts` POST /login | `server/routes/auth.ts` | `auth.ts` login fn, `authEnterprise.ts` | **Absorb** auth.ts into routes/auth.ts |
| Session revocation | `tokenBlacklist` Set | `server/routes/auth.ts` | authEnterprise logout (stub), users.ts logout (stub) | **Delete** stubs, **migrate** to Redis |
| Auth middleware | `authenticateToken()` | `server/middleware/auth.ts` | `auth.js` (stricter), `auth.ts` (legacy), `authAdapter.ts` | **Merge** .js security into .ts, **delete** rest |
| Org/user resolution | Login org resolution | `server/routes/auth.ts` | 4 req patterns, x-org-id header | **Standardize** to `req.user` only |
| RBAC/permissions | `roleBasedAccess.ts` | `server/services/` | middleware simple checks, CMC rbac.ts | **Preserve** RBACService, **migrate** others |
| MFA | `mfaService.ts` + `emailOtpService.ts` | `server/services/` | auth-security-service.ts (speakeasy) | **Deprecate** speakeasy |

### Governance Authorities

| Concern | Canonical Authority | File | Duplicates | Decision |
|---------|-------------------|------|------------|----------|
| Governance decision truth | `governed-decision-repository.ts` | `server/services/` | None (consolidated v2.0) | **Preserve** |
| Workflow preflight truth | `readiness-gates.ts` | `server/src/control-plane/` | scoring-engine (supplementary), reg/preflight (specific) | **Preserve** gate, **wrap** score |
| Review queue/history | `ApprovalOrchestrator.ts` | `server/services/workflow/` | DecisionLineageService (broader scope) | **Preserve**, extract thread mgmt |
| Promotion/export/publish | `export-publish-gates.ts` | `server/src/control-plane/` | None | **Preserve** |
| Nav gating truth | `approvedRoutePolicy.ts` | `client/router/` | None | **Preserve** |
| Readiness scoring | `readiness-scoring-engine.ts` | `server/services/intelligence/` | readiness-gates (categorical complement) | **Preserve both** |

### Artifact Authorities

| Concern | Canonical Authority | File | Duplicates | Decision |
|---------|-------------------|------|------------|----------|
| Artifact/document identity | `concept2cureArtifacts` table | `shared/schema.ts:5267` | `unifiedDocuments` (orphaned), `authoring_documents` (legacy) | **Preserve**; quarantine orphans |
| Editor open path | `EditorPanel.tsx` -> `UnifiedDocumentEditor` | `client/.../editor/` | ZenApp direct fetch (line 1145) | **Preserve**; absorb bypass |
| Dossier placement | PUT `/artifacts/:id/placement` | `concept2cure.ts:7107` | None | **Preserve** — clean |
| Version management | `concept2cureArtifactVersions` (append-only) | `shared/schema.ts:5315` | Compare in authoring-actions.ts | **Preserve** |
| Export contract | `exportGovernance.ts` (fail-closed) | `server/services/compute/` | `docx-factory.ts` (Shadow Service proxy) | **Preserve**; wrap factory |
| Document generation | Inline in export routes | `concept2cure.ts:11520+` | None | **Preserve** |

### Workspace Authorities

| Concern | Canonical Authority | File | Duplicates | Decision |
|---------|-------------------|------|------------|----------|
| Layout/composition | `ProjectWorkspaceShell.tsx` | `client/.../workspace/` | None (but shell does too much) | **Preserve** shell, **extract** 8 hooks |
| Nav state | `useWorkspaceNavigationState()` | `workspaceShellControllers.ts` | Shell-local state (19 useState) | **Expand** controller, **migrate** shell state |
| Panel switching | `usePhase4Panels()` | `workspaceShellControllers.ts` | Bare skeleton | **Expand** with context persistence |
| Governance consumption | Shell inline logic | `ProjectWorkspaceShell.tsx` | Shell computes governance locally | **Extract** to `useGovernedDocumentContext` |
| Artifact consumption | Shell inline logic | `ProjectWorkspaceShell.tsx` | Shell manages artifacts directly | **Extract** to `useArtifactManager` |

---

## Boundary Rules

1. **No cross-plane writes.** Workspace does not write governance truth. Governance does not write artifact identity.
2. **Read contracts only.** Planes consume other planes via read-only contracts (hooks, selectors, API responses).
3. **One canonical persistence path per concern.** PostgreSQL via Drizzle ORM is the system of record.
4. **No route-local business policy.** Routes handle auth/scope/input/response. Business logic lives in services.
5. **No shell-local governance.** ProjectWorkspaceShell must consume governance truth, not compute it.

---

*This document is filled from Phase 1 research and updated through Phase 3.*
