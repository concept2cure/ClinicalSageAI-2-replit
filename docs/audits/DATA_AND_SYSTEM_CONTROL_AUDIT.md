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

## Plane A — Identity

### Session/Token Creation
| Aspect | Detail |
|--------|--------|
| Canonical owner | _Pending research_ |
| Duplicate owners | _Pending research_ |
| Read paths | _Pending research_ |
| Write paths | _Pending research_ |
| Decision | _Pending_ |

### Session Revocation
| Aspect | Detail |
|--------|--------|
| Canonical owner | _Pending research_ |
| Duplicate owners | _Pending research_ |
| Decision | _Pending_ |

### Auth Middleware
| Aspect | Detail |
|--------|--------|
| Canonical owner | _Pending research_ |
| Duplicate owners | _Pending research_ |
| Decision | _Pending_ |

### Org/User Identity Resolution
| Aspect | Detail |
|--------|--------|
| Canonical owner | _Pending research_ |
| Duplicate owners | _Pending research_ |
| Decision | _Pending_ |

### Access/Entitlement (RBAC)
| Aspect | Detail |
|--------|--------|
| Canonical owner | _Pending research_ |
| Duplicate owners | _Pending research_ |
| Decision | _Pending_ |

---

## Plane B — Governance

### Governance Decision Truth
| Aspect | Detail |
|--------|--------|
| Canonical owner | _Pending research_ |
| Duplicate owners | _Pending research_ |
| Decision | _Pending_ |

### Workflow Preflight Truth
| Aspect | Detail |
|--------|--------|
| Canonical owner | _Pending research_ |
| Duplicate owners | _Pending research_ |
| Decision | _Pending_ |

### Review Queue/History
| Aspect | Detail |
|--------|--------|
| Canonical owner | _Pending research_ |
| Duplicate owners | _Pending research_ |
| Decision | _Pending_ |

### Promotion/Export/Publish Decisions
| Aspect | Detail |
|--------|--------|
| Canonical owner | _Pending research_ |
| Duplicate owners | _Pending research_ |
| Decision | _Pending_ |

### Nav Gating Truth
| Aspect | Detail |
|--------|--------|
| Canonical owner | _Pending research_ |
| Duplicate owners | _Pending research_ |
| Decision | _Pending_ |

---

## Plane C — Artifacts

### Artifact/Document Identity
| Aspect | Detail |
|--------|--------|
| Canonical owner | _Pending research_ |
| Duplicate owners | _Pending research_ |
| Decision | _Pending_ |

### Editor Open Path
| Aspect | Detail |
|--------|--------|
| Canonical owner | _Pending research_ |
| Duplicate owners | _Pending research_ |
| Decision | _Pending_ |

### Dossier Placement
| Aspect | Detail |
|--------|--------|
| Canonical owner | _Pending research_ |
| Duplicate owners | _Pending research_ |
| Decision | _Pending_ |

### Version Management
| Aspect | Detail |
|--------|--------|
| Canonical owner | _Pending research_ |
| Duplicate owners | _Pending research_ |
| Decision | _Pending_ |

### Export Contract
| Aspect | Detail |
|--------|--------|
| Canonical owner | _Pending research_ |
| Duplicate owners | _Pending research_ |
| Decision | _Pending_ |

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
