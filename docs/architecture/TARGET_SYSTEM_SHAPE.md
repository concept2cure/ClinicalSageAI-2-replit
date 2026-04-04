# Target System Shape

> Boulder-to-Statue Restructure
> Generated: 2026-04-04

---

## Core Product Chain

```
Intent → Workflow/Orchestration → Governance Decision → Artifact/Document → Editor/Placement → Audit/Lifecycle
```

Every meaningful product behavior fits this chain. Anything outside it is absorbed, wrapped, deprecated, quarantined, or deleted.

---

## Target Architecture

### Server Bootstrap (`server/index.ts`)
Owns ONLY:
- Environment validation
- Middleware initialization (security, performance, observability)
- Health/readiness probes
- Route manifest registration (bootstrap calls)
- HTTP server creation + graceful shutdown
- Vite/static file serving

Does NOT own:
- Domain CRUD (extracted to routers)
- Inline business logic
- Template data
- AI orchestration policy

### Route Layer (`server/routes/`)
Each router owns one domain:
- `device-projects.ts` — Device project CRUD (extracted from index.ts)
- `concept2cure.ts` — Core product routes
- `auth.ts` — Session/authentication (canonical)
- `authEnterprise.ts` — Enterprise auth (compatibility wrapper)
- Existing routers preserved

### Control Plane (`server/src/control-plane/`)
Canonical governance enforcement:
- `document-context-resolver.ts` — Artifact identity resolution
- `placement-authority.ts` — Dossier placement validation
- `readiness-gates.ts` — Workflow gate enforcement
- `export-publish-gates.ts` — Export gate enforcement

### Intelligence Layer (`server/services/intelligence/`)
RIM — non-LLM regulatory intelligence:
- `rim.ts` — Central orchestrator
- `readiness-scoring-engine.ts` — Unified readiness scoring
- Pattern registry, signal capture, interceptors

### Client Workspace Shell
`ProjectWorkspaceShell.tsx` owns ONLY:
- Composition and layout
- High-level callback routing
- Surface assembly

Extracted modules:
- `workspaceNavigationOrchestrator.ts` — Navigation state, workflow transitions, guided sequence, layer/workbench switching
- `workspaceArtifactManager.ts` — Artifact loading, creation (5 paths), placement, move operations
- `workspacePhase4Orchestrator.ts` — Phase4 panel openers, consequence tracking, governance normalization

### Database
- Primary: `drizzle-orm` via `pg` Pool
- Tenant isolation: `postgres` via `drizzle-orm/postgres-js`
- Schema: `shared/schema/` (Drizzle ORM schemas)

### Testing
- Primary: `vitest` (ESM-native, server + shared)
- Legacy: `jest` (client-side, babel-based)

---

## File Weight Targets

| File | Before | Target | Method |
|---|---|---|---|
| `ProjectWorkspaceShell.tsx` | 2,163 LOC | ~900 LOC | Extract 3 orchestrator modules |
| `server/index.ts` | 7,256 LOC | ~6,950 LOC | Extract device-project CRUD (~280 LOC) |
| `workspaceShellControllers.ts` | 148 LOC | 148 LOC | Preserved (already well-factored) |

---

## Directory Structure (Target)

```
server/
├── index.ts                          # Bootstrap only
├── bootstrap/                        # Route registration manifests
├── routes/
│   ├── device-projects.ts            # NEW — extracted from index.ts
│   └── ...existing routers
├── src/control-plane/                # Governance (canonical)
├── services/intelligence/            # RIM (canonical)
└── services/                         # Business logic

client/src/concept2cure/components/workspace/
├── ProjectWorkspaceShell.tsx         # Composition + layout only
├── workspaceShellControllers.ts      # State hooks (existing)
├── workspaceShellConstants.ts        # Constants (existing)
├── workspaceNavigationOrchestrator.ts # NEW — navigation logic
├── workspaceArtifactManager.ts       # NEW — artifact operations
├── workspacePhase4Orchestrator.ts    # NEW — phase4/governance
└── ...existing components
```
