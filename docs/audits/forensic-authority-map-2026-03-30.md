# Concept2Cure Forensic Authority Map (2026-03-30)

## Scope
This audit maps competing sources of truth for governed document behavior and proposes canonical ownership to consolidate platform law.

## Method
- Static code inspection of high-blast-radius files.
- Route/mount scan and responsibility classification.
- Cross-check against client fetch/cache strategy.

Inspected minimum files:
- `server/index.ts`
- `shared/schema.ts`
- `server/routes/concept2cure.ts`
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
- `client/src/concept2cure/components/editor/EditorPanel.tsx`
- `client/src/lib/queryClient.ts`

---

## Authority Map by Domain

| Domain | Current source of truth | Competing sources | Risk | Proposed canonical owner |
|---|---|---|---|---|
| Route mounting | `server/index.ts` mounts very large route surface with mixed aliases and compatibility mounts | In-route side effects, duplicate aliases, one-off mounts | Critical | `server/index.ts` as thin mount table only + per-domain route registrars |
| Document creation | `concept2cure` routes + `EditorPanel` auto-create + new-doc flow | Multiple UI entry points and route handlers | Critical | `artifact service` (single create command + contract validation) |
| Artifact persistence | Route-level update handlers and UI save entry | Per-surface payload assumptions | High | service-layer persistence API (versioned save contract) |
| Editor loading | `EditorPanel` local loaders and fallback refresh logic | Workspace handoff state + direct open path | High | one editor hydration service + canonical open command |
| Project placement | Workspace shell state + editor context + route payload decisions | UI-driven placement logic in multiple components | High | placement service with explicit target contract |
| Lifecycle/status | UI status mapping + server status handling | `EditorPanel` stage mapping, backend statuses | High | lifecycle policy service + enum contract |
| AI generation | route-level AI endpoints + editor AI actions | preview-style UI state and distinct AI endpoints | Critical | one orchestrator path: intent -> artifact update/create |
| Provenance | Provenance panels and API endpoints | partial provenance in AI payloads | High | provenance service + mandatory payload segment in action contract |
| Audit trail | mix of route behavior and UI-driven events | unstandardized event payloads | High | centralized audit event builder in service layer |
| Exports | export routes and editor/export UI actions | route-specific export behavior | High | export service gated by lifecycle + artifact linkage |
| Client fetch/cache invalidation | global `queryClient` defaults | ad-hoc `load*` calls in components | High | domain hooks with standard mutation/invalidation table |

---

## File-Level Forensic Findings

### 1) `server/index.ts`
- Functions as bootstrap **and** broad application wiring/orchestration surface.
- Very large mount count and alias paths indicate layered historical behavior accumulating in one file.
- Risk: one-file blast radius for runtime behavior and difficult route ownership.

### 2) `shared/schema.ts`
- Monolithic schema surface likely carrying persistence and workflow assumptions in one place.
- Risk: small schema edits become hidden cross-layer migrations.

### 3) `server/routes/concept2cure.ts`
- Route file likely contains both transport handling and business orchestration.
- Risk: policy duplication vs services; transport layer drift.

### 4) `ProjectWorkspaceShell.tsx`
- Shell appears to include orchestration concerns beyond presentational composition.
- Risk: product law in React shell rather than service/controller boundaries.

### 5) `EditorPanel.tsx`
- Editor panel carries broad cross-cutting responsibilities (loading, AI actions, reviewers, provenance, audit/export-adjacent behavior).
- Risk: path-dependent reality by entry path and local state branch.

### 6) `queryClient.ts`
- Base request/query helper exists, but platform invalidation law is not encoded centrally.
- Risk: stale truth and surface-specific post-mutation behavior.

---

## Canonical Ownership Proposal

1. **Transport law**: routes validate/translate only.
2. **Business law**: Concept2Cure service layer owns creation/update/versioning/placement/AI orchestration.
3. **Contract law**: shared governed document action contract required for create/mutate/export/present operations.
4. **UI law**: shells render and dispatch commands; no workflow policy branches.
5. **Data freshness law**: one mutation/invalidation matrix per domain.

---

## Immediate Refactor Priorities

1. Extract a route registration map from `server/index.ts` and reduce side-effect mount behavior.
2. Introduce/standardize governed document action contract validation in service entry points.
3. Split `concept2cure` route handlers to thin transport + service orchestration.
4. Carve `ProjectWorkspaceShell` and `EditorPanel` into concern-specific hooks/controllers.
5. Standardize mutation + cache invalidation contract for artifact/project/editor flows.

---

## Exit Condition
Concept2Cure exits the unstable authority state only when each governed document operation (create/edit/version/place/AI/export) routes through one contract and one service-path, with React surfaces as consumers—not policy owners.
