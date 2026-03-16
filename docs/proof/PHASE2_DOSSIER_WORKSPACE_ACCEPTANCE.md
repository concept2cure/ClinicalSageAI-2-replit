# Phase 2 — Governed Dossier Workspace: Acceptance Document

**Branch:** `concept2cure-v2`
**Base commit:** `1ead5e51` (Phase 1 complete)
**Date:** 2025-07-18

---

## 1. What Was Built

| #   | Deliverable                                                                                                                                                                                                                                                                      | File(s)                                        | Status                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------- |
| 1   | **Discovery pass** — factual audit of live vs synthetic state                                                                                                                                                                                                                    | `docs/proof/PHASE2_DOSSIER_DISCOVERY.md`       | ✅ Complete             |
| 2   | **DocumentOutlineTree wired** — 4th rail mode "Outline" appears when a document is open; live heading extraction from editor content                                                                                                                                             | `ProjectWorkspaceShell.tsx`, `EditorPanel.tsx` | ✅ Complete             |
| 3   | **Dossier metrics endpoint** — `GET /projects/:projectId/dossier-metrics` aggregates per-section artifact counts, status breakdown, weighted completion %                                                                                                                        | `server/routes/concept2cure.ts`                | ✅ Complete             |
| 4   | **Completion rollups & evidence chips** — progress bar per DossierTree node, `E:N` / `P:N` chips for evidence and precedent counts                                                                                                                                               | `DossierTree.tsx`                              | ✅ Complete             |
| 5   | **Placement actions surfaced everywhere** — DossierTree context menu (5 items: Create from template, Attach existing, Move doc here, View section reqs, View section docs); DocumentListPane per-row action menu (Move, Place, Copy CTD Path)                                    | `DossierTree.tsx`, `DocumentListPane.tsx`      | ✅ Complete             |
| 6   | **Cut / paste move flow** — `pendingMove` state, amber banner with doc title, paste into target section triggers PlacementDialog prefilled for relocate                                                                                                                          | `ProjectWorkspaceShell.tsx`                    | ✅ Complete             |
| 7   | **Drag-and-drop deferred** — explicitly deferred; documented in discovery                                                                                                                                                                                                        | —                                              | ✅ Deferred (by design) |
| 8   | **Expanded IND template hierarchy** — 15+ groups, 3-level depth (starter → subsection → micro), new modules: Forms 1.1, Admin 1.3, QOS 2.3, NC Summaries 2.6, NC Study Reports 4.2, Tabular 5.2, CRF 5.3.7; existing groups deepened with micro-templates for S.1, S.2, P.2, CSR | `ctdHierarchy.ts`                              | ✅ Complete             |
| 9   | **Template type badges** — `starter` (indigo), `subsection` (emerald), `micro` (amber) shown inline                                                                                                                                                                              | `TemplateTree.tsx`                             | ✅ Complete             |
| 10  | **Section requirements view** — 260px side panel showing section description, expected doc types, template availability, placed doc status                                                                                                                                       | `ProjectWorkspaceShell.tsx`, `ctdHierarchy.ts` | ✅ Complete             |
| 11  | **ProjectSwitcher sizing fix** — max-width 520px, max-height 65vh, top 12% for 1366×768                                                                                                                                                                                          | `ProjectSwitcher.tsx`                          | ✅ Complete             |
| 12  | **Document view tree-aware** — breadcrumb header with CTD section badge, template source label, status indicator                                                                                                                                                                 | `ProjectWorkspaceShell.tsx`                    | ✅ Complete             |
| 13  | **EditorPanel onContentChange** — callback fires on content/title change (300ms debounce) to feed Outline mode                                                                                                                                                                   | `EditorPanel.tsx`                              | ✅ Complete             |

## 2. What Remains Deferred

| Item                            | Reason                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Drag-and-drop reorder/move      | Requires `@dnd-kit/core` integration, pointer event complexity; cut/paste flow covers the governed use case |
| Real-time collaborative editing | Needs CRDT/OT infrastructure; out of scope for governed authoring                                           |
| PDF/Word export from editor     | Backend rendering pipeline not yet built                                                                    |
| Live provenance event streaming | Current polling approach sufficient; WebSocket upgrade deferred                                             |

## 3. Runtime Proof

### TypeScript Compilation

- **0 errors** across all 9 modified files (verified via IDE diagnostics)

### E2E Test Results (Playwright v1.58.2)

```
Running 2 tests using 1 worker

  ✓  1 [chromium-1366x768] › tests/e2e/concept2cure-workspace.spec.ts  (22.3s)
  ✓  2 [chromium-1440x900] › tests/e2e/concept2cure-workspace.spec.ts  (12.4s)

  2 passed (36.8s)
```

**Verified at 1366×768:** All `data-testid` markers visible including `rail-mode-outline`.
**Verified at 1440×900:** No React errors, no 500s in tested flow.

### Feature Marker Counts (grep)

| Feature              | References                  |
| -------------------- | --------------------------- |
| `outline`            | 15                          |
| `dossier-metrics`    | 3                           |
| `pendingMove`        | 16                          |
| `templateType`       | 88                          |
| `SectionRequirement` | 2                           |
| `onContentChange`    | 5                           |
| `onCutDocument`      | present in DocumentListPane |
| `onOpenPlacement`    | present in DocumentListPane |
| `onCopyCtdPath`      | present in DocumentListPane |

## 4. Risks

| Risk                                                                      | Mitigation                                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Dossier metrics endpoint could be slow on large projects (100+ artifacts) | Query is indexed by `projectId` + `organizationId`; add caching layer if needed |
| Cut/paste across sections requires re-validation of section constraints   | PlacementDialog already validates CTD section compatibility                     |
| Template hierarchy is static (code-defined)                               | Future: move to database-driven template registry                               |
| Outline heading extraction is regex-based                                 | Works for markdown `#` headings; rich text would need DOM parser                |

## 5. Files Changed

| File                                                                     | Change Type |
| ------------------------------------------------------------------------ | ----------- |
| `client/src/concept2cure/models/ctdHierarchy.ts`                         | Modified    |
| `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` | Modified    |
| `client/src/concept2cure/components/workspace/DossierTree.tsx`           | Modified    |
| `client/src/concept2cure/components/workspace/TemplateTree.tsx`          | Modified    |
| `client/src/concept2cure/components/workspace/DocumentListPane.tsx`      | Modified    |
| `client/src/concept2cure/components/workspace/ProjectFileTree.tsx`       | Modified    |
| `client/src/concept2cure/components/editor/EditorPanel.tsx`              | Modified    |
| `client/src/concept2cure/components/projects/ProjectSwitcher.tsx`        | Modified    |
| `server/routes/concept2cure.ts`                                          | Modified    |
| `docs/proof/PHASE2_DOSSIER_DISCOVERY.md`                                 | New         |
| `docs/proof/PHASE2_DOSSIER_WORKSPACE_ACCEPTANCE.md`                      | New         |

## 6. Commit

See git log for commit hash after this document is committed.
