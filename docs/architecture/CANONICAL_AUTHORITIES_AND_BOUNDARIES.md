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
| Artifact/document identity | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| Editor open path | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| Dossier placement | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| Version management | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| Export contract | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| Document generation | _Pending_ | _Pending_ | _Pending_ | _Pending_ |

### Workspace Authorities

| Concern | Canonical Authority | File | Duplicates | Decision |
|---------|-------------------|------|------------|----------|
| Layout/composition | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| Nav state | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| Panel switching | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| Governance consumption | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| Artifact consumption | _Pending_ | _Pending_ | _Pending_ | _Pending_ |

---

## Boundary Rules

1. **No cross-plane writes.** Workspace does not write governance truth. Governance does not write artifact identity.
2. **Read contracts only.** Planes consume other planes via read-only contracts (hooks, selectors, API responses).
3. **One canonical persistence path per concern.** PostgreSQL via Drizzle ORM is the system of record.
4. **No route-local business policy.** Routes handle auth/scope/input/response. Business logic lives in services.
5. **No shell-local governance.** ProjectWorkspaceShell must consume governance truth, not compute it.

---

*This document is filled from Phase 1 research and updated through Phase 3.*
