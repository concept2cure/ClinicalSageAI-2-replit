# Module 3 Workflow Convergence — Proof Report

**Date:** 2026-04-06
**Scope:** CTD Module 3 (Quality/CMC) workflow convergence into shared Concept2Cure tools
**Work Order:** `docs/plans/MODULE3-WORKFLOW-CONVERGENCE-WORK-ORDER.md`

---

## Summary

Module 3 (Quality/CMC) now operates as a shared dossier workflow inside the existing Concept2Cure tools. No new screens, apps, routes, or parallel workspaces were created. All 8 phases of the work order are complete.

---

## Phase Completion Status

| Phase | Description | Status | Evidence |
|-------|-------------|--------|----------|
| 1 | Dossier-Aware Upload Classification | Complete | `DossierUploadClassifier.tsx` — governed Select/Input/Button/Switch, feedsModule3 toggle |
| 2 | Source Convergence Layer | Complete | `module3-convergence-service.ts` — classifyAndMapArtifactToSource, auto-map on upload |
| 3 | Build-State in Shared Dossier/Workspace | Complete | `useModule3BuildState.ts` — 11-state model, DossierTree badges, ProjectWorkspaceShell threading |
| 4 | Full Module 3 Composition Spine | Complete | `module3Composer.ts` — 17 section generators with prose + tables |
| 5 | Governed Artifacts from Compile Results | Complete | `bridgeCompileToArtifact` — creates/updates artifacts with full markdown |
| 6 | Editor/Canvas Integration | Complete | `Module3BuildInspector.tsx` — summary + detail views, ribbon button, clickable section navigation |
| 7 | AnA First-Class Orchestration | Complete | `module3-command-handlers.ts` — 9 commands registered in command-executor |
| 8 | End-to-End QA Proof | Complete | `module3-e2e-journey.test.ts` — 32 tests with realistic Remdesivir IND seed |

---

## Non-Negotiable Constraint Compliance

| Constraint | Met? | Details |
|------------|------|---------|
| No new Module 3 screen/app/route universe | Yes | All UI is inside existing DossierTree, EditorPanel, DataRoomPanel, ProjectHomeDashboard |
| Uses existing project upload flow | Yes | DossierUploadClassifier is an inline panel in DataRoomPanel |
| Uses existing workspace shell | Yes | Module3BuildState threaded through ProjectWorkspaceShell → WorkspaceLeftRail → DossierTree |
| Uses existing dossier tree | Yes | Module3BuildBadge overlays on DossierTree nodes |
| Uses existing editor | Yes | Module3BuildInspector is a standard InspectorDrawer in EditorPanel |
| Uses existing AnA chat system | Yes | 9 command handlers registered in command-executor, domain prompts in CMC group |
| Governed artifacts in shared editor | Yes | bridgeCompileToArtifact creates concept2cure_artifacts with ctdSection placement |
| Same pipeline for workspace and AnA | Yes | Both use module3Composer + cmc-module3-compiler + module3-convergence-service |
| Build state visible in existing dossier | Yes | DossierTree shows per-section build badges, ProjectHomeDashboard shows readiness strip |

---

## Files Modified or Created

### New Files
| File | Purpose |
|------|---------|
| `client/src/concept2cure/components/editor/DossierUploadClassifier.tsx` | Phase 1 — Dossier-aware upload classification panel |
| `client/src/concept2cure/components/editor/Module3BuildInspector.tsx` | Phase 6 — Editor sidebar build inspector |
| `client/src/concept2cure/hooks/useModule3BuildState.ts` | Phase 3 — Build-state query hook |
| `server/services/module3-convergence-service.ts` | Phase 2/5 — Source convergence + artifact bridging |
| `server/services/module3Composer.ts` | Phase 4 — Section composition with prose + tables |
| `server/services/ana-ri/module3-command-handlers.ts` | Phase 7 — 9 AnA command handlers |
| `server/api/cmc/module3BuildStateRoutes.ts` | Phase 3 — Build-state API endpoint |
| `server/api/cmc/module3ConvergenceRoutes.ts` | Phase 2 — Convergence API endpoints |
| `server/api/cmc/module3OperatingSystemRoutes.ts` | Phase 6 — Build/refresh API endpoints |
| `tests/module3-workflow-convergence.test.ts` | 57 unit tests |
| `tests/module3-e2e-journey.test.ts` | 32 E2E journey tests |

### Modified Files
| File | Change |
|------|--------|
| `client/src/lib/queryClient.ts` | Fixed critical FormData serialization bug |
| `client/src/concept2cure/components/workspace/DossierTree.tsx` | Module3BuildBadge overlay, M3 build-state prop |
| `client/src/concept2cure/components/workspace/WorkspaceLeftRail.tsx` | Thread M3 build-state to DossierTree |
| `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` | M3 build-state hook, enhanced handleSelectSection |
| `client/src/concept2cure/components/workflow/ProjectHomeDashboard.tsx` | M3 readiness strip |
| `client/src/concept2cure/components/editor/EditorPanel.tsx` | M3 inspector drawer, ribbon button, section navigation |
| `client/src/concept2cure/components/editor/DataRoomPanel.tsx` | "Feeds M3" filter chip |
| `client/src/concept2cure/config/domain-prompts.ts` | 8 Module 3 domain prompts in CMC group |
| `server/routes/concept2cure.ts` | Auto-map feedsModule3 uploads to CMC source objects |
| `server/services/ana-ri/command-executor.ts` | 9 M3 command registrations |
| `server/bootstrap/register-core-routes.ts` | 3 M3 route file mounts |

---

## Test Coverage

| Test File | Tests | Duration | Coverage |
|-----------|-------|----------|----------|
| `module3-workflow-convergence.test.ts` | 57 | ~400ms | Section rules, source types, composition, completeness, compiler, stale detection, hash determinism, contradictions, impact tasks, export gating, narrative generation, table generation, structural sections |
| `module3-e2e-journey.test.ts` | 32 | ~350ms | Full journey with realistic Remdesivir IND data: 11 source types, 17-section composition, stale propagation, contradiction detection, export readiness, pipeline roundtrip |
| **Total** | **89** | **~750ms** | |

---

## User Journey Verification

A user can now:

1. **Upload** a source document via the existing Data Room
2. **Classify** it by submission track, CTD section, source type, and "Feeds Module 3" toggle
3. **See** the classification auto-map to a CMC source object (when feedsModule3 is true)
4. **View** Module 3 build readiness in the dossier tree (per-section badges with state + completeness)
5. **View** Module 3 readiness at project level (dashboard strip with progress bar)
6. **Filter** Data Room files by "Feeds M3" to see which documents are Module 3 inputs
7. **Open** the M3 Build inspector from the editor ribbon to see all 17 sections at a glance
8. **Click** a section in the inspector to navigate to its governed artifact
9. **Click** a Module 3 section in the dossier tree to auto-open the compiled artifact
10. **Build** all Module 3 sections via AnA: "Build Module 3 from current project sources"
11. **Build** a single section via AnA: "Build a specific Module 3 subsection (e.g. 3.2.S.4)"
12. **Check** missing inputs via AnA: "Show missing inputs for Module 3"
13. **Detect** stale sections via AnA: "Show stale Module 3 sections"
14. **Refresh** stale sections via AnA: "Refresh stale Module 3 sections from latest sources"
15. **Check** readiness via AnA: "Module 3 submission readiness check"
16. **Scan** contradictions via AnA: "Scan Module 3 for contradictions"
17. **View** source lineage via AnA: "Show source lineage for a Module 3 section"
18. **Review** governed artifacts in the shared editor with provenance, compare, audit
19. **Export** when approved and contradiction-free

All without leaving the shared Concept2Cure workspace.

---

## Critical Bugs Fixed

| Bug | Severity | Fix |
|-----|----------|-----|
| `apiRequest` serialized FormData as `{}` | P0 Critical | Detect `body instanceof FormData`, skip Content-Type and JSON.stringify |
| DossierTree never received M3 build state | High | Thread from ProjectWorkspaceShell → WorkspaceLeftRail → DossierTree |
| Module3BuildInspector never rendered | High | Import + ribbon button + InspectorDrawer in EditorPanel |
| Tables lost in governed artifacts | High | Pass `tables` to bridgeCompileToArtifact, render as markdown |
| 3.1/3.3 excluded from queries | High | Fix `LIKE '3.2.%'` to include `OR IN ('3.1', '3.3')` |
| feedsModule3 uploads not auto-mapped | Medium | Auto-map in upload endpoint when feedsModule3 is true |

---

## Architecture Decisions

1. **No separate M3 state management** — reuses existing TanStack Query with `useModule3BuildState` hook
2. **Composition is deterministic** — same sources always produce same output (SHA-256 hashes)
3. **Tables rendered as markdown** — no special rendering needed, works in existing editor
4. **Inspector reuses governed components** — Badge, Button, Progress, Switch from component registry
5. **AnA uses same pipeline** — command handlers call the same functions as workspace/editor
6. **Build state is pull-based** — 30s stale cache, refetch on window focus
7. **Auto-map is non-blocking** — upload succeeds even if source object mapping fails

---

## Conclusion

Module 3 Workflow Convergence is complete. The implementation adheres to all non-negotiable constraints: no new screens, no parallel workspaces, existing tools enhanced. 89 tests pass. The user can drive the entire Module 3 journey from either the workspace UI or AnA chat, using the same underlying pipeline.
