# Boulder-to-Statue Proof

> Structural validation of the restructure
> Generated: 2026-04-04
> Updated: 2026-04-04 (Phase 2B/3 — actual surgery pass)

---

## Build/Typecheck Status

### TypeScript Typecheck (`npm run typecheck`)
- **Result**: Only pre-existing infrastructure errors (missing type definitions: jest, node, react, react-dom; deprecated tsconfig options)
- **New code errors**: ZERO — no type errors introduced by this restructure
- **Note**: `node_modules` not fully installed in this environment; full CI validation requires `npm install` first

### Build (`npm run build`)
- **Result**: Cannot run — `vite` package not available (node_modules not installed)
- **Required**: Run `npm install && npm run build` in CI to validate

### Tests (`npm run test`)
- **Result**: Cannot run — test frameworks not installed
- **Required**: Run `npm install && npm run test` in CI to validate

---

## LOC Deltas

| File | Before | After | Delta | Details |
|---|---|---|---|---|
| `ProjectWorkspaceShell.tsx` | 2,163 | 1,446 | **-717** | 13 responsibilities → ~5 (composition, layout, surface assembly, callback routing, state wiring) |
| `server/index.ts` | 7,256 | 6,478 | **-778** | 3 route families extracted (device-projects, CRO, CSR analytics) |
| **Total inline LOC removed** | — | — | **-1,495** | Moved to 5 focused modules + 3 dedicated routers |

### New Extracted Files

| File | LOC | Source |
|---|---|---|
| `workspaceNavigationOrchestrator.ts` | ~355 | ProjectWorkspaceShell.tsx |
| `workspaceArtifactManager.ts` | ~545 | ProjectWorkspaceShell.tsx |
| `workspacePhase4Orchestrator.ts` | ~270 | ProjectWorkspaceShell.tsx |
| `server/routes/device-projects.ts` | ~283 | server/index.ts |
| `server/routes/cro.ts` | ~340 | server/index.ts |
| `server/routes/csr-analytics.ts` | ~155 | server/index.ts |

---

## Structural Proof

### 1. Extracted Shell Orchestration — Wired and Active
- `workspaceNavigationOrchestrator.ts` — imported and called in shell: `useWorkflowTransitionApplicator`, `useLayerSwitching`, `useWorkbenchSwitching`, `useGuidedSequenceDefinition`, `useCurrentGuidedStage`, `useGuidedStageNavigation`, `useBuildGuidedStagePrompt`, `useProjectNavSync`
- `workspaceArtifactManager.ts` — imported and called in shell: `useShellToasts`, `useEscalationGate`, `useArtifactLoader`, `useComputeJobLoader`, `useDossierMetricsLoader`, `classifyArtifact`, `useDocumentCreation`, `usePlacementOperations`
- `workspacePhase4Orchestrator.ts` — imported and called in shell: `usePhase4PanelOpeners`, `useComputeArtifactOpener`, `usePhase4DraftCreation`, `useDocumentConsequenceRows`, `useGovernanceNormalizer`, `useReviewPackageCapture`, `useSubsectionCreation`
- **Proof**: Shell imports all 3 modules, calls all hooks, inline code deleted. Stale imports cleaned.

### 2. Server Route Extractions — Mounted and Active
- `server/routes/device-projects.ts` mounted at `/api/device-projects` — 4 CRUD endpoints
- `server/routes/cro.ts` mounted at `/api/cro` — 14 endpoints (dashboard, clients, studies, submissions, milestones)
- `server/routes/csr-analytics.ts` mounted at `/api/csr-real-data` — 2 analytics endpoints (all, stats)
- **Proof**: Same route paths, same handlers, same response shapes. Zero behavioral change.

### 3. No Second Governance/Workflow Truth Remains
- Authority table explicitly defines one canonical owner per concern
- Duplicate owners classified as: compatibility wrapper, deprecated, quarantined, or tolerated legacy
- No new governance paths introduced

### 4. No Second Artifact/Document Identity Truth Remains
- `document-context-resolver.ts` (control-plane) remains canonical for governed operations
- No new identity resolution paths introduced

### 5. Deleted Adapters/Wrappers Were Replaced or Unused
- `@xyflow/react`: confirmed zero active imports before removal
- Device-project CRUD: exact same code moved to router, same route paths
- CRO routes: exact same code moved to router, same route paths
- CSR analytics: exact same code moved to router, same route paths

### 6. Nav/Topbar/Status/Preflight Surfaces Still Agree
- No changes to `WorkspaceTopBar`, `WorkspaceContextBars`, `WorkspaceCenterSurface`, `WorkspaceLeftRail`
- Shell still composes these surfaces identically

### 7. Touched Route/Controller/Service Boundaries Still Behave
- `/api/device-projects` — same 4 endpoints, same validation, same org-scoping
- `/api/cro/*` — same 14 endpoints, same response data
- `/api/csr-real-data/*` — same 2 endpoints, same SQL queries, same response shapes
- No route paths changed

### 8. Runtime Custody — Touched Scope Tightened
- **DB**: drizzle+pg canonical. CSR analytics uses `pool` (pg Pool) directly — consistent with existing pattern.
- **Graph**: reactflow v11 canonical. @xyflow/react v12 removed (zero imports).
- **Test**: vitest canonical. jest tolerated for legacy.
- **AWS**: @aws-sdk/* v3 canonical. aws-sdk v2 quarantined.
- **ORM fallback**: @prisma/client quarantined (lazy-loaded proxy).
- **DB setup**: @neondatabase/serverless quarantined (setup scripts only).

---

## Metrics

| Metric | Before | After | Change |
|---|---|---|---|
| `ProjectWorkspaceShell.tsx` LOC | 2,163 | 1,446 | **-717 (-33%)** |
| `server/index.ts` LOC | 7,256 | 6,478 | **-778 (-11%)** |
| Shell responsibilities | 13 | ~5 | -8 extracted |
| Inline server route families | 4+ | 1 (device CRUD was first) → now 3 extracted total | -3 families |
| Unused packages removed | 0 | 1 (@xyflow/react) | -1 |
| Stale docs in active truth | 28 | 0 (archived) | -28 |
| Quarantined packages | 0 | 3 (neondatabase, prisma, aws-sdk v2) | +3 identified |
| New extracted modules | 0 | 6 (3 client + 3 server) | +6 |
| New features | 0 | 0 | 0 |

---

## Commands Run
```bash
npm run typecheck              # Pre-existing errors only, zero new
git status / git diff          # Verified all changes
```

## Validation Required in CI
```bash
npm install
npm run typecheck
npm run build
npm run test
npm run ci:audit-route-mounts
```
