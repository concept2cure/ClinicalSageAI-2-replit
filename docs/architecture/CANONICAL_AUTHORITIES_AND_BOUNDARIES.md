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
| JWT creation | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| Session revocation | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| Auth middleware | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| Org/user resolution | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| RBAC/permissions | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| MFA | _Pending_ | _Pending_ | _Pending_ | _Pending_ |

### Governance Authorities

| Concern | Canonical Authority | File | Duplicates | Decision |
|---------|-------------------|------|------------|----------|
| Governance decision truth | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| Workflow preflight truth | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| Review queue/history | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| Promotion/export/publish | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| Nav gating truth | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| Readiness scoring | _Pending_ | _Pending_ | _Pending_ | _Pending_ |

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
