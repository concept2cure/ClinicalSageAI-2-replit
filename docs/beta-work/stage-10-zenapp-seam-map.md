# Stage 10 — ZenApp Domain-Seam Extraction

**Generated:** 2026-04-01
**Branch:** `cursor/cleanup-workstream-integration-7784`
**Purpose:** Reduce ZenApp blast radius through safe domain-seam extraction

---

## 1. Mission

Reduce ZenApp.tsx from a 4,265-line monolith to a smaller orchestrator by extracting
safe domain seams (pure constants, hooks, and presentational helpers) without changing
any visible behavior.

---

## 2. Extraction Results

### Before: 4,265 lines
### After: 3,795 lines (−470 lines, −11%)

### Extracted Modules

| Module | Lines | What it contains |
|--------|------:|-----------------|
| `zen-app-constants.ts` | ~270 | `LayoutMode`, `ToolPanel`, `UserProfile` types; `PRIMARY_NAV_ID_BY_LAYOUT`, `LEGACY_NAV_ID_BY_LAYOUT`, `SIDEBAR_NAV_TO_LAYOUT` nav maps; `INDUSTRY_MODES`, `normalizeIndustryMode`; `TOOL_PANELS` registry; `getProjectColor` |
| `hooks/useZenKeyboardShortcuts.ts` | ~95 | Global keyboard shortcuts (⌘K, ⌘N, ⌘,, ⌘E, Escape, Alt+V) + `mc-navigate` listener |
| `hooks/useUserProfileFromStorage.ts` | ~40 | localStorage profile sync with cross-tab `storage` event |
| `hooks/useWorkspaceSuggestedActions.ts` | ~140 | Context-aware AnA quick-start chips by project type |

### ZenApp Changes

| Change | Type |
|--------|------|
| Import types/constants from `zen-app-constants.ts` | Import redirect |
| Replace inline `useState<UserProfile>` + useEffect with `useUserProfileFromStorage()` | Hook extraction |
| Replace 80-line keyboard effect with `useZenKeyboardShortcuts()` call | Hook extraction |
| Replace 130-line `workspaceSuggestedActions` memo with `useWorkspaceSuggestedActions()` | Hook extraction |
| Remove 100+ lines of inline type definitions | Dead code in ZenApp |
| Remove 60+ lines of inline constant maps | Dead code in ZenApp |

---

## 3. What Was NOT Extracted (No-Go Zones)

| Area | Lines | Why not |
|------|------:|---------|
| Sidebar `onNavigate` switch | ~150 | Ties together layoutMode, riViewMode, navigate(), embedded module, project id — needs navigation dispatch refactor |
| Triple AnA mounting rules | ~100 | Three conditional `<AnaPersistentPanel>` placements with different context packs — must mirror each other |
| `handleOpenArtifact` branch | ~15 | layoutMode-dependent canvas vs editor handoff |
| Ownership sync pair | ~60 | Read + write `currentWorkbenchContext` with debounce and URL guard — subtle loop risk |
| `ProjectWorkspaceShell` callback bundle | ~40 | Coordinates `pendingEditorContent`, artifact ids, section codes, layout — editorial handoff core |
| `handleCommandAction` | ~30 | Overlaps with sidebar navigation and tool panels |

---

## 4. Identified Dead Code (Safe to Remove Later)

| Item | Lines | Evidence |
|------|------:|---------|
| `WorkspaceHeader` component (inside ZenApp) | 27 | Defined but no `<WorkspaceHeader` usage in JSX tree |
| `contextMetrics` memo | 30 | Declared but no references |
| `submissionWorkspaceLabel` memo | 17 | Declared but no references |
| `timelineSteps` memo | 56 | Declared but no references |
| `useProjectKnowledge` result (`workspaceKnowledge`) | 1 | Hook called but result never read |

---

## 5. ZenApp Responsibility Map (Post-Extraction)

| Domain | Status | Lines remaining |
|--------|--------|---------------:|
| Project identity (selection, switching, context) | In ZenApp | ~100 |
| Route policy / embedded module hosting | In ZenApp | ~200 |
| Project-home rendering | In ZenApp | ~200 |
| Workspace launcher / handoff state | In ZenApp | ~150 |
| Side drawers / modals | In ZenApp | ~130 |
| AnA context shaping | In ZenApp | ~150 |
| Tab/view state management | In ZenApp | ~100 |
| Constants/types | **Extracted** → `zen-app-constants.ts` | 0 |
| Keyboard shortcuts | **Extracted** → `useZenKeyboardShortcuts` | 0 |
| User profile storage sync | **Extracted** → `useUserProfileFromStorage` | 0 |
| Workspace suggested actions | **Extracted** → `useWorkspaceSuggestedActions` | 0 |

---

## 6. Future Extraction Candidates (Post-Beta)

These require more careful refactoring and should wait for stronger pulse test coverage:

| Candidate | Prerequisite |
|-----------|-------------|
| `useZenUrlSync` (URL sync effects + navInProgressRef) | Typed navigation dispatch contract |
| `ProjectsFoyer` component (IIFE → named component) | Projects foyer pulse test |
| `EmbeddedModuleSplitLayout` (510k/PMA/CER deduplication) | Module embedding pulse test |
| Sidebar navigation dispatch (extract `onNavigate` switch) | Full nav routing test |
| ToolPanelWrapper → separate file | Low risk but low impact |
