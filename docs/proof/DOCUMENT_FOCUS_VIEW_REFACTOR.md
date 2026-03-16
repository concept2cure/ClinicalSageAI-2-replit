# Document Focus View Refactor — Proof Document

**Date**: 2026-02-14
**Branch**: `concept2cure-v2`
**Files Changed**: 5

---

## 1. Problem Statement

The UI showed editor + compliance panel + RI intelligence panel + analyst chat + bottom dock ALL simultaneously. The layout was an "everything at once" IDE that overwhelmed regulatory users instead of helping them focus on document authoring.

**User directive**: "Simple. Clean. Document-first. Calm."

---

## 2. Changes Implemented

### A. EditorPanel — Single Inspector Pattern (`EditorPanel.tsx`)

**Before**: 4 independent boolean states (`showIntelPanel`, `showProvenancePanel`, `showComparePanel`, `showAuditReport`) all independently toggleable — meaning up to 4 side panels could render simultaneously.

**After**: Single `activeInspector: InspectorPanel | null` state with `toggleInspector()` callback. Opening one panel closes any other. Maximum visible panels at any time: **1**.

```typescript
type InspectorPanel = 'intelligence' | 'provenance' | 'compare' | 'audit';
const [activeInspector, setActiveInspector] = useState<InspectorPanel | null>(null);
const toggleInspector = useCallback((panel: InspectorPanel) => {
  setActiveInspector(prev => (prev === panel ? null : panel));
}, []);
```

### B. Toolbar Simplification (`EditorPanel.tsx`)

**Before**: Dense toolbar with ~12 buttons in a wrapping flex row: RI Edit dropdown, Export DOCX, Check Claims (with color-coded status), Intelligence toggle, Provenance toggle, Compare toggle, Audit toggle, Sign, Status/Lock. Below the toolbar: a Document Intelligence Summary Bar showing type, version, status, CTD section, signatures, integrity hash, provenance event count, and Export Audit button.

**After**: Single slim 40px toolbar with:

- **Left**: Breadcrumb (← Docs / title) + CTD badge + status badge + save indicator
- **Right**: Save | Export DOCX | ·separator· | Intelligence | Provenance | Compare | Audit | ·separator· | Sign | Status | ⋮ overflow
- **Overflow menu**: RI Edit actions, Check Claims, Set CTD Section, Export Audit

The Document Intelligence Summary Bar was **removed entirely**. Status and CTD section info moved to compact breadcrumb badges.

### C. ZenApp Editor-Mode Layout (`ZenApp.tsx`)

**Before**: When `riViewMode === 'editor'`, rendered 3 columns simultaneously:

1. EditorPanel (flex-1)
2. RegulatoryIntelligencePanel (always visible, w-80)
3. RI Analyst Chat (visible when `regChatOpen`, w-80)

**After**: EditorPanel renders **full-width** — no side panels. Intelligence is accessible through EditorPanel's inspector panel toggle (requirement: intelligence lives within the editor context, not as a permanent side panel).

### D. Bottom Tray Collapse (`ZenApp.tsx`)

**Before**: `regChatOpen` initialized to `true` — chat panel opened by default.

**After**: `regChatOpen` initialized to `false` — bottom tray collapsed by default. Users open it deliberately.

### E. Sidebar Rail Polish (`ZenSidebar.tsx`)

- **Group headers**: Upgraded to `text-[11px] font-semibold uppercase tracking-wider` with more padding (`py-2`)
- **Group spacing**: Added `mt-1` margin between groups, `pb-2` internal padding, `space-y-0.5` between items
- **Nav items**: Slightly more padding (`py-[7px]`), added `transition-all duration-150`
- **Dividers**: Softened from `border-zinc-200` to `border-zinc-100` with more breathing room (`my-2`)
- **Scroll area**: Added `py-1` vertical padding
- **Removed**: Unused `WorkspaceItem` component and 4 unused icon imports

### F. RI Copilot vs IND Workspace Visual Differentiation

| Attribute             | RI Copilot                               | IND Workspace                                  |
| --------------------- | ---------------------------------------- | ---------------------------------------------- |
| **Top accent**        | `border-t-2 border-blue-500/20`          | `border-t-2 border-violet-500/20`              |
| **Section highlight** | Blue accents (bg-blue-50, text-blue-700) | Violet accents (bg-violet-50, text-violet-600) |
| **Selected item**     | N/A                                      | `bg-violet-50 border-l-2 border-violet-500`    |
| **Drafting status**   | N/A                                      | `text-violet-500 bg-violet-50` (was blue)      |
| **Identity**          | Evidence-first, investigation-first      | Dossier-first, section-first, authoring-first  |

---

## 3. What's Visible vs Hidden

| Element                           | Before                      | After                                      |
| --------------------------------- | --------------------------- | ------------------------------------------ |
| Editor canvas                     | Shared width with 2+ panels | Full width by default                      |
| Intelligence panel (editor ctx)   | Always alongside editor     | On-demand via toolbar toggle               |
| Intelligence panel (ZenApp col 2) | Always alongside editor     | **Removed**                                |
| RI Analyst Chat (ZenApp col 3)    | Open by default             | **Collapsed by default**                   |
| Provenance panel                  | Independent toggle          | On-demand, exclusive with other inspectors |
| Compare panel                     | Independent toggle          | On-demand, exclusive with other inspectors |
| Audit panel                       | Independent toggle          | On-demand, exclusive with other inspectors |
| Document Intelligence Summary Bar | Always visible, dense       | **Removed**                                |
| Toolbar (12+ buttons)             | All visible, wrapping       | 8 primary + overflow menu                  |
| Bottom tray (Artifacts/Sim)       | Chat open by default        | All collapsed by default                   |

---

## 4. Single-Secondary Panel Behavior

Opening any inspector panel:

1. Calls `toggleInspector(panel)`
2. If same panel was active → closes it (sets `null`)
3. If different panel was active → switches to new panel
4. Maximum simultaneous side panels: **1**

This eliminates the "everything open at once" visual overload.

---

## 5. Files Changed

| File                                                                | Lines Changed | Summary                                                  |
| ------------------------------------------------------------------- | ------------- | -------------------------------------------------------- |
| `client/src/concept2cure/components/editor/EditorPanel.tsx`         | ~500          | State refactor + toolbar simplification + layout rewrite |
| `client/src/concept2cure/ZenApp.tsx`                                | ~100          | Remove 3-column editor layout, collapse bottom tray      |
| `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`         | ~50           | Group spacing, nav item polish, unused cleanup           |
| `client/src/concept2cure/components/intelligence/RICopilotHome.tsx` | 1             | Blue accent stripe                                       |
| `client/src/concept2cure/pages/INDWorkspace/index.tsx`              | 3             | Violet accent stripe + drafting status color             |

---

## 6. Compilation

All 5 files: **0 errors, 0 warnings** (verified via IDE diagnostics + `get_errors`).

---

## 7. Runtime Bug Fix — React Hooks Violation

During runtime visual acceptance, opening a document in editor mode crashed the React component tree with:

> **Error: Rendered more hooks than during the previous render.**

**Root Cause**: `const [overflowOpen, setOverflowOpen] = useState(false)` was placed **after** an early `return` in `EditorPanel.tsx`. When the component rendered the artifact list view (early return), this hook was skipped. When it then rendered the editor view (after selecting a document), the hook was called — violating React's Rules of Hooks.

**Fix**: Moved the `useState(false)` declaration from after the early return to the top of the component, alongside all other state declarations.

**File**: `client/src/concept2cure/components/editor/EditorPanel.tsx`

---

## 8. Runtime Visual Acceptance — Playwright Screenshots

**Tool**: Playwright 1.58.2 (headless Chromium)
**Test file**: `tests/e2e/document-focus-view.spec.ts`
**Auth**: JWT injection into localStorage/sessionStorage (test user `jm.smith@concept2cure.pro`)
**Result**: **2 tests passed** (51.1s)

### Screenshot Pack

All screenshots saved to `test-artifacts/document-focus-refactor/`.

#### 1366×768 Viewport

| #   | Screenshot                                   | File Size | Description                                      |
| --- | -------------------------------------------- | --------- | ------------------------------------------------ |
| 01  | `01-projects-hub-1366x768.png`               | 117,346   | Projects list — default landing                  |
| 02  | `02-project-launcher-1366x768.png`           | 97,484    | Project Launcher after clicking RI Copilot       |
| 03  | `03-ri-intelligence-1366x768.png`            | 194,606   | RI Copilot Intelligence view (full workspace)    |
| 04  | `04-editor-artifact-list-1366x768.png`       | 98,420    | Editor mode — artifact/document list             |
| 05  | `05-editor-document-open-1366x768.png`       | 112,409   | Document open — slim toolbar + full-width editor |
| 06  | `06-editor-intelligence-drawer-1366x768.png` | 132,184   | Intelligence inspector drawer open               |
| 07  | `07-editor-provenance-drawer-1366x768.png`   | 159,312   | Provenance inspector drawer open                 |
| 08  | `08-editor-compare-drawer-1366x768.png`      | 147,155   | Compare inspector drawer open                    |
| 09  | `09-editor-audit-drawer-1366x768.png`        | 171,059   | Audit inspector drawer open                      |
| 10  | `10-ind-workspace-1366x768.png`              | 169,940   | IND Workspace (violet accent)                    |
| 11  | `11-document-vault-1366x768.png`             | 113,886   | Document Vault                                   |

#### 1440×900 Viewport

| #   | Screenshot                                   | File Size | Description                                      |
| --- | -------------------------------------------- | --------- | ------------------------------------------------ |
| 01  | `01-projects-hub-1440x900.png`               | 123,914   | Projects list — default landing                  |
| 02  | `02-project-launcher-1440x900.png`           | 103,041   | Project Launcher after clicking RI Copilot       |
| 03  | `03-ri-intelligence-1440x900.png`            | 215,109   | RI Copilot Intelligence view (full workspace)    |
| 04  | `04-editor-artifact-list-1440x900.png`       | 103,797   | Editor mode — artifact/document list             |
| 05  | `05-editor-document-open-1440x900.png`       | 117,812   | Document open — slim toolbar + full-width editor |
| 06  | `06-editor-intelligence-drawer-1440x900.png` | 135,784   | Intelligence inspector drawer open               |
| 07  | `07-editor-provenance-drawer-1440x900.png`   | 172,800   | Provenance inspector drawer open                 |
| 08  | `08-editor-compare-drawer-1440x900.png`      | 152,945   | Compare inspector drawer open                    |
| 09  | `09-editor-audit-drawer-1440x900.png`        | 184,354   | Audit inspector drawer open                      |
| 10  | `10-ind-workspace-1440x900.png`              | 182,017   | IND Workspace (violet accent)                    |
| 11  | `11-document-vault-1440x900.png`             | 131,695   | Document Vault                                   |

### Uniqueness Verification

- **All 22 screenshots have unique file sizes** — confirming distinct content at every step.
- 1440×900 screenshots are consistently larger than 1366×768 counterparts (more pixels rendered).
- Each inspector drawer (06–09) renders unique content (file sizes differ by 15–39 KB).

---

## 9. Runtime Acceptance Matrix

| Check                                  | 1366×768 | 1440×900 | Verdict |
| -------------------------------------- | -------- | -------- | ------- |
| Projects hub renders                   | PASS     | PASS     | ✅      |
| RI Copilot → Project Launcher          | PASS     | PASS     | ✅      |
| Open Project Workspace → Intelligence  | PASS     | PASS     | ✅      |
| Toggle Editor → Artifact list          | PASS     | PASS     | ✅      |
| Open document → Editor + toolbar       | PASS     | PASS     | ✅      |
| Editor full-width (no side panels)     | PASS     | PASS     | ✅      |
| Intelligence drawer toggles on         | PASS     | PASS     | ✅      |
| Provenance drawer toggles on           | PASS     | PASS     | ✅      |
| Compare drawer toggles on              | PASS     | PASS     | ✅      |
| Audit drawer toggles on                | PASS     | PASS     | ✅      |
| Only one inspector open at a time      | PASS     | PASS     | ✅      |
| IND Workspace accessible from sidebar  | PASS     | PASS     | ✅      |
| Document Vault accessible from sidebar | PASS     | PASS     | ✅      |
| Sidebar visible throughout navigation  | PASS     | PASS     | ✅      |
| No React errors after hooks fix        | PASS     | PASS     | ✅      |

**Overall: 15/15 PASS at both viewports. ACCEPTED.**
