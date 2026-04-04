# Canonical Data Paths & System Planes

> **Program:** Concept2Cure Data + System Control Program v4
> **Date:** 2026-04-04
> **Status:** Phase 1 — Mapping in progress

---

## Core Law

Every meaningful product behavior must fit:

```
Intent -> Orchestration -> Governed Decision -> Artifact/Document -> Editor/Placement -> Lifecycle/Audit
```

Any behavior outside that chain must be: absorbed, wrapped, deprecated, or deleted.

---

## System Planes

### Plane A — Identity
**Scope:** auth, redirect safety, session/token revocation, org/user/project identity, access/entitlement

| Data Path | Canonical Owner | Persistence | Notes |
|-----------|----------------|-------------|-------|
| JWT creation | _Pending_ | In-memory + cookie | |
| Session revocation | _Pending_ | _Pending_ | |
| Org resolution | _Pending_ | PostgreSQL (organizations) | |
| User identity | _Pending_ | PostgreSQL (users) | |
| RBAC/permissions | _Pending_ | PostgreSQL (organizationUsers) | |
| MFA | _Pending_ | _Pending_ | |

### Plane B — Governance
**Scope:** blockers, warnings, readiness, review queue/history, promotion/export/publish decisions, workflow preflight truth, nav gating truth

| Data Path | Canonical Owner | Persistence | Notes |
|-----------|----------------|-------------|-------|
| Governance decisions | _Pending_ | _Pending_ | |
| Workflow preflight | _Pending_ | _Pending_ | |
| Review threads/tasks | _Pending_ | PostgreSQL | |
| Readiness scoring | _Pending_ | _Pending_ | |
| Nav gating | _Pending_ | Client-side policy | |
| Promotion gates | _Pending_ | _Pending_ | |

### Plane C — Artifacts
**Scope:** artifact/document identity, editor open path, dossier placement, versions, compare/provenance/audit, export

| Data Path | Canonical Owner | Persistence | Notes |
|-----------|----------------|-------------|-------|
| Artifact identity | _Pending_ | PostgreSQL (concept2cureArtifacts) | |
| Version history | _Pending_ | PostgreSQL (concept2cureArtifactVersions) | |
| Editor open path | _Pending_ | Client routing | |
| Dossier placement | _Pending_ | _Pending_ | |
| Export pipeline | _Pending_ | _Pending_ | |

### Plane D — Workspace
**Scope:** composition, layout, nav state, workflow UI, panel switching, topbar/rail rendering

| Data Path | Canonical Owner | Persistence | Notes |
|-----------|----------------|-------------|-------|
| Layout/composition | _Pending_ | Client state | |
| Nav state | _Pending_ | Client state | |
| Panel switching | _Pending_ | Client state | |
| Topbar model | _Pending_ | Client state | |

### Plane E — Domain Engines
**Scope:** RI Copilot, CMC Module 3 OS, eCTD/IND, 510(k)/CER/PMA/device, communication/submission logic

| Domain | Canonical Entry Point | Notes |
|--------|----------------------|-------|
| RIM / RI | `server/services/intelligence/rim.ts` | |
| CMC | _Pending_ | |
| eCTD/IND | _Pending_ | |
| 510(k) | _Pending_ | |
| CER | _Pending_ | |
| Submission | _Pending_ | |

### Plane F — Integrations
**Scope:** external connectors, import/export bridges, third-party sync surfaces

_Mapped after core planes locked._

### Plane G — Control
**Scope:** startup/readiness, drift reporting, route ownership, beta/static-data/no-mock fences, telemetry, proof/CI guards

_Mapped during delivery hardening._

### Plane H — Delivery
**Scope:** build, typecheck, route-mount integrity, deployment-safe startup, beta/founder proof paths

_Mapped during Phase 7._

---

## Data Persistence Classification

| Classification | Definition |
|---------------|------------|
| **Canonical** | The system-of-record path. PostgreSQL via Drizzle ORM. |
| **Tolerated legacy** | Works but uses non-canonical patterns (raw SQL, direct fetch, localStorage). Will be migrated. |
| **Quarantined** | Known problematic. Wrapped or isolated. Migration planned. |
| **Delete candidate** | No remaining consumers. Safe to remove. |

---

*This document is updated as each phase completes. Pending fields are filled from research agents.*
