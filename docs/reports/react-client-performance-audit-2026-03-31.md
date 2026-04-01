# React Client Performance Audit — Concept2Cure

**Date**: March 31, 2026
**Scope**: `client/src/` — ZenApp shell, components, hooks, contexts, query config
**Root file**: `client/src/concept2cure/ZenApp.tsx` (113KB, ~3,400 lines)

---

## 1. Route Lazy-Loading Analysis (ZenApp.tsx)

### ✅ Lazily Loaded (30+ routes via `React.lazy`)

These are code-split and only load when navigated to:

| Component                         | Import Path                                             |
| --------------------------------- | ------------------------------------------------------- |
| `EmbeddedCERV2Page`               | `@/pages/csr/CERV2Page`                                 |
| `EmbeddedPMAWorkspace`            | `./components/pma/PMAWorkspace`                         |
| `FullDocumentBuilder`             | `./components/builder/FullDocumentBuilder`              |
| `ToolsLanding`                    | `./components/workspace/ToolsLanding`                   |
| `EditorPanel`                     | `./components/editor/EditorPanel`                       |
| `RICopilotHome`                   | `./components/intelligence/RICopilotHome`               |
| `PrecedentIntelligenceDashboard`  | `./components/precedent/PrecedentIntelligenceDashboard` |
| `CAPAManagementPanel`             | `./components/regulatory/CAPAManagement`                |
| `PostMarketSurveillancePanel`     | `./components/regulatory/PostMarketSurveillance`        |
| `InspectionReadinessPanel`        | `./components/regulatory/InspectionReadiness`           |
| `ECTDNavigatorPanel`              | `./components/regulatory/ECTDNavigator`                 |
| `RegulatoryIntelligenceFullPanel` | `./components/regulatory/RegulatoryIntelligence`        |
| `VaultBrowserPanel`               | `@/components/sharepoint/SharePointFileManager`         |
| `IntelligentReportGenerator`      | `./components/reports/IntelligentReportGenerator`       |
| `SafetyNarrativePage`             | `./pages/SafetyNarrative`                               |
| `DocumentCanvasPanel`             | `./components/workspace/DocumentCanvasPanel`            |
| `ProjectKnowledgePanel`           | `./components/workspace/ProjectKnowledgePanel`          |
| `ProjectHomeDashboard`            | `./components/workflow/ProjectHomeDashboard`            |
| `DossierMap`                      | `./components/workflow/DossierMap`                      |
| `SectionWorkspace`                | `./components/workflow/SectionWorkspace`                |
| `SubmissionReadinessView`         | `./components/workflow/SubmissionReadiness`             |
| `SubmissionBuilderView`           | `./components/submission/SubmissionBuilder`             |
| `ProjectTaskBoardView`            | `./components/workspace/ProjectTaskBoard`               |
| `CSRWorkflowView`                 | `./components/workflow/CSRWorkflow`                     |
| `INDChecklistView`                | `./components/workflow/INDChecklist`                    |
| `HAQManagerView`                  | `./components/workflow/HAQManager`                      |
| `BiostatPlatformDashboard`        | `@/components/biostat/BiostatPlatformDashboard`         |
| `AnaBiostatsPanel`                | `./components/biostats/AnaBiostatsPanel`                |
| `PlatformHome`                    | `./components/home/PlatformHome`                        |
| `AppsPage`                        | `./pages/AppsPage`                                      |
| `ArtifactsPage`                   | `./pages/ArtifactsPage`                                 |
| `VaultPage`                       | `./pages/VaultPage`                                     |
| `SetupPage`                       | `./pages/SetupPage`                                     |
| `FirstRunExperience`              | `./components/enablement/FirstRunExperience`            |
| `INDRightRail`                    | `./components/workspace/INDRightRail`                   |

**Verdict**: ✅ All heavy routes are properly lazy-loaded via `React.lazy()`.

### ⚠️ Eagerly Imported (Blocking — loaded on EVERY page load)

These are `import` statements at the top of ZenApp.tsx that execute synchronously:

| Component                             | Size (lines)     | Impact                                          |
| ------------------------------------- | ---------------- | ----------------------------------------------- |
| `ZenSidebar`                          | 1,132            | **HIGH** — sidebar component imported eagerly   |
| `ZenChat`                             | 1,244            | **HIGH** — chat component imported eagerly      |
| `ZenCommandPalette`                   | unknown          | Medium — command palette always loaded          |
| `ZenSettings`                         | 1,480            | **HIGH** — settings modal always loaded         |
| `ProjectSwitcher` + `NewProjectModal` | ~800             | Medium — project selection UI                   |
| `ProjectConfigPanel`                  | unknown          | Low                                             |
| `ProjectFilesCompact`                 | unknown          | Low                                             |
| `ProjectHeaderBar`                    | unknown          | Low                                             |
| `AnaPersistentPanel`                  | **4,556**        | **CRITICAL** — largest component, always loaded |
| `GlobalOperatingShell`                | unknown          | Medium                                          |
| `ProjectSidebar`                      | unknown          | Low                                             |
| `ErrorBoundary`                       | unknown          | Low                                             |
| `50+ Lucide icons`                    | ~250KB (chunked) | Medium — via vendor-icons chunk                 |

**Key Finding**: `AnaPersistentPanel` (4,556 lines) and `ZenSettings` (1,480 lines) are eagerly imported but `ZenSettings` is only shown when the user opens settings. `AnaPersistentPanel` is the primary chat interface so eager loading is justified, but it should use `React.memo` for its internal message list.

---

## 2. TanStack Query Configuration

**File**: `client/src/lib/queryClient.ts`

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5, // ✅ 5 minutes
      gcTime: 1000 * 60 * 10, // ✅ 10 minutes
      refetchOnWindowFocus: false, // ✅ GOOD — no tab-switch refetch
      refetchOnReconnect: true, // ✅ GOOD
      queryFn: getQueryFn(),
    },
    mutations: {
      retry: 0, // ✅ No mutation retry
    },
  },
});
```

**Verdict**: ✅ **Well-configured**. The 5-minute `staleTime` prevents refetch storms. `refetchOnWindowFocus: false` is critical for a professional app. No changes needed here.

---

## 3. Missing `React.memo` — The Biggest Gap

### ZERO `React.memo` Usage

```bash
grep -rn "React.memo\|memo(" client/src/concept2cure/components/ --include="*.tsx"
# => NO MATCHES
```

**Not a single component in `client/src/concept2cure/components/` uses `React.memo`.** This is the single biggest optimization opportunity.

### Components That Would Benefit Most

#### 3a. Chat Message Bubble (AnaPersistentPanel.tsx, lines 3345 & 3661)

The message rendering loop calls `renderMarkdown()` (parsing + DOMPurify sanitization) for **every assistant message on every re-render**:

```tsx
{
  messages.map(msg => {
    const htmlContent = !isUser ? renderMarkdown(msg.content) : '';
    return <div key={msg.id} dangerouslySetInnerHTML={{ __html: htmlContent }} />;
  });
}
```

**Problem**: Every keystroke in the input field triggers a state change, which re-renders the entire component, which re-runs `renderMarkdown()` on all messages, which calls `marked.parse()` + `DOMPurify.sanitize()` for every message. On a 50-message thread, this is ~50 markdown parse operations per keystroke.

**Fix**:

1. Extract a `MessageBubble` component and wrap it in `React.memo`
2. Memoize `renderMarkdown` output per message using `useMemo` inside the extracted component

#### 3b. ChatPanel Message List (ChatPanel.tsx, line 617)

Same pattern — messages re-rendered on every state change with inline arrow functions:

```tsx
{messages.map((message, index) => (
  <MessageBubble
    onCopy={handleCopyMessage}
    onEdit={handleEditMessage}     // ← new function ref per parent render
    onFork={handleForkConversation} // ← new function ref per parent render
    ...
  />
))}
```

`onCopy`, `onEdit`, and `onFork` are defined via inline closures, creating new function references on every parent render. Even if `MessageBubble` were memoized, these new refs would break memoization.

#### 3c. ZenSidebar (1,132 lines)

The sidebar has **22+ inline `onClick={() => ...}` handlers** in its JSX:

```tsx
onClick={() => onNavigate?.('apps')}
onClick={() => onNavigate?.('artifacts-center')}
onClick={() => onNavigate?.('setup')}
onClick={() => onNavigate?.('submission-builder')}
onClick={() => onNavigate?.('documents')}
onClick={() => onNavigate?.('ri-copilot')}
// ... 16 more
```

Each re-render creates 22+ new function objects. Since ZenSidebar is rendered inside ZenApp, any ZenApp state change forces a sidebar re-render, which creates all new callbacks.

---

## 4. Inline Function Creation in JSX

### Severity: **HIGH** in Hot Paths, **LOW** elsewhere

| File                           | Inline Handlers                     | Re-render Frequency          | Severity     |
| ------------------------------ | ----------------------------------- | ---------------------------- | ------------ |
| `AnaPersistentPanel.tsx`       | ~10 inline handlers in message loop | Very High (every keystroke)  | **CRITICAL** |
| `ZenSidebar.tsx`               | 22+ inline `onClick` handlers       | High (every shell re-render) | **HIGH**     |
| `ProjectsSidebar.tsx`          | 15+ inline handlers                 | Medium                       | **MEDIUM**   |
| `ChatPanel.tsx`                | 8 inline handlers per message       | High (every message)         | **HIGH**     |
| `PharmaPortfolioDashboard.tsx` | 12+ inline handlers in lists        | Medium                       | **MEDIUM**   |
| `DocumentWorkspace.tsx`        | 8+ inline handlers                  | Medium                       | **MEDIUM**   |

### Most Impactful Fixes

1. **AnaPersistentPanel**: Extract `<MessageBubble>` component, use `React.memo`, stabilize all handlers with `useCallback`
2. **ZenSidebar**: Use `useCallback` for all navigation handlers or a single dispatch function: `onNavigate(target)` called once and passed down
3. **ChatPanel**: Already has `handleCopyMessage`/`handleEditMessage` defined as functions, but they're not wrapped in `useCallback`

---

## 5. Large List Rendering Without Virtualization

### No Virtualization Library Found

```bash
grep -rn "react-virtual\|useVirtualizer\|react-window\|FixedSizeList" client/src/
# => NO MATCHES
```

**No virtualization is used anywhere in the client.**

### Lists That Could Grow Unbounded

| Component                          | What's Listed             | `.map()` Call                           | Risk                                  |
| ---------------------------------- | ------------------------- | --------------------------------------- | ------------------------------------- |
| `AnaPersistentPanel.tsx:3345,3661` | Chat messages             | `messages.map(msg => ...)`              | **HIGH** — 100+ msgs in long sessions |
| `ChatPanel.tsx:617`                | Chat messages             | `messages.map((message, index) => ...)` | **HIGH** — same issue                 |
| `ProjectsSidebar.tsx:367`          | Conversations per project | `conversations.map(convo => ...)`       | **MEDIUM** — 50+ convos possible      |
| `ProjectsSidebar.tsx:580`          | All projects              | `allProjects.map(project => ...)`       | **MEDIUM** — 20-50 projects           |
| `EditorPanel.tsx:4085`             | Quality gate warnings     | `qualityGateDialog.warnings.map(...)`   | LOW — typically < 20                  |

### Recommendation

The **chat message list** is the highest-priority candidate for virtualization. A user can accumulate 100+ messages in a regulatory discussion. Each message involves markdown parsing + DOMPurify sanitization. With `@tanstack/react-virtual`, only visible messages (typically 5–10) would render and parse markdown.

---

## 6. Context Provider Re-Render Issues

### ⚠️ ProjectContext — No `useMemo` on Value (CRITICAL)

**File**: `client/src/concept2cure/context/ProjectContext.tsx` (line 791)

```tsx
const value: ProjectContextValue = {
  state,
  createProject,
  updateProject,
  deleteProject,
  setActiveProject,
  // ... 25+ properties
  activeProject,
  activeConversation,
  activeArtifact,
  projectConversations,
  projectArtifacts,
};

return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
```

**Problem**: The `value` object is recreated on **every render** of `ProjectProvider`. Since `value` is always a new object reference, **every consumer of `useProject()` re-renders on every parent render**, even if the actual data hasn't changed.

**Impact**: Every component that calls `useProject()` (sidebar, chat, editor, workspace) re-renders whenever _any_ state in the ProjectContext changes. This is a cascade amplifier.

**Fix**: Wrap `value` in `useMemo`:

```tsx
const value = useMemo(
  () => ({
    state,
    createProject,
    updateProject /* ... */,
  }),
  [state, createProject, updateProject /* ... */]
);
```

### ✅ ZenWorkspaceContext — Properly Memoized

**File**: `client/src/concept2cure/contexts/ZenWorkspaceContext.tsx` (line 611)

```tsx
const contextValue = useMemo<WorkspaceContextValue>(() => ({
  state, dispatch, setActiveProject, ...
}), [state, setActiveProject, ...]);
```

**Verdict**: Properly memoized with `useMemo` and stable `useCallback` dependencies.

### ✅ DocumentModeContext — Properly Memoized

Uses `useMemo` for mode and capabilities. Well-structured.

### Inventory of All Context Providers

| Context                 | `useMemo` on value?       | Impact                                                |
| ----------------------- | ------------------------- | ----------------------------------------------------- |
| `ProjectContext`        | ❌ **NO**                 | **CRITICAL** — most-used context, cascades everywhere |
| `ZenWorkspaceContext`   | ✅ Yes                    | Good                                                  |
| `DocumentModeContext`   | ✅ Yes                    | Good                                                  |
| `IndustryContext`       | ✅ Yes (imports useMemo)  | Good                                                  |
| `EnablementContext`     | Likely no (uses useState) | Low — rarely changes                                  |
| `TourContext`           | Unknown                   | Low — rarely changes                                  |
| `RoleContext`           | Unknown                   | Low — rarely changes                                  |
| `DatabaseStatusContext` | Unknown                   | Low — polling only                                    |

---

## Top 5 Components That Benefit Most from Optimization

### 1. `AnaPersistentPanel.tsx` (4,556 lines) — **CRITICAL**

**Issues**:

- `renderMarkdown()` called for every message on every re-render (no memoization of output)
- No `React.memo` on message bubble — all messages re-render on each keystroke
- No chat virtualization — all messages in DOM regardless of viewport
- ~10 inline handlers created per render cycle

**Fix**: Extract `MessageBubble` → `React.memo`, memoize markdown output, add `@tanstack/react-virtual` for messages.

**Estimated impact**: 60-80% reduction in re-render work during active chat sessions.

### 2. `EditorPanel.tsx` (4,294 lines) — **HIGH**

**Issues**:

- Massive component with many state variables — any change re-renders everything
- Loads TipTap editor within the same render tree
- No sub-component memoization

**Fix**: Split into `EditorToolbar`, `EditorContent`, `EditorSidebar` sub-components with `React.memo`. Memoize expensive derived data.

### 3. `ProjectWorkspaceShell.tsx` (3,145 lines) — **HIGH**

**Issues**:

- Orchestrates the entire workspace layout
- Consumes `useProject()` (which has the unmemoized context value)
- Re-renders on every ProjectContext change

**Fix**: Memoize the ProjectContext value (fix #6 above) + add `React.memo` on child panels.

### 4. `ZenSidebar.tsx` (1,132 lines) — **MEDIUM-HIGH**

**Issues**:

- 22+ inline `onClick` arrow functions
- Re-renders on every ZenApp state change
- Project list maps without memoization

**Fix**: Single `useCallback` `onNavigate` handler, `React.memo` on the sidebar, memoize project grouping.

### 5. `ProjectsSidebar.tsx` (760 lines) — **MEDIUM**

**Issues**:

- Renders all projects with `.map()` (no virtualization for 50+ projects)
- Each project row has inline `onClick` handlers
- Search/filter not debounced on the search input `onChange`

**Fix**: `React.memo` on project rows, debounce search input, consider virtualization if > 50 projects.

---

## Quick Wins (Ordered by Impact-to-Effort Ratio)

### 1. ✅ Memoize `ProjectContext.value` with `useMemo` (5 min, HIGH impact)

Single-line change that stops cascading re-renders across the entire app.

### 2. ✅ Extract + `React.memo` chat `MessageBubble` (30 min, HIGH impact)

Extract the message rendering from `AnaPersistentPanel` and `ChatPanel` into a `React.memo` component. This prevents markdown re-parsing on every keystroke.

### 3. ✅ Lazy-load `ZenSettings` (5 min, MEDIUM impact)

```tsx
// Change from:
import { ZenSettings } from './components/settings/ZenSettings';
// To:
const ZenSettings = lazy(() => import('./components/settings/ZenSettings'));
```

1,480 lines saved from the initial bundle. Settings is only opened via a menu action.

### 4. ✅ `useCallback` on `ZenSidebar` navigation handlers (15 min, MEDIUM impact)

Replace 22+ inline `onClick` with a single memoized handler.

### 5. ✅ Add `@tanstack/react-virtual` for chat message list (1 hr, MEDIUM impact)

Only parse and render visible messages. On a 100-message thread, this reduces DOM nodes from 100+ to ~10.

### 6. ✅ Debounce search in `ProjectsSidebar` (5 min, LOW impact)

The `onChange={(e) => setSearchQuery(e.target.value)}` fires on every keystroke, triggering a filter + re-render. Add `useDeferredValue` or a 200ms debounce.

---

## Summary Table

| Category                  | Status       | Details                                      |
| ------------------------- | ------------ | -------------------------------------------- |
| **Route lazy-loading**    | ✅ GOOD      | 30+ routes lazy-loaded                       |
| **TanStack Query config** | ✅ GOOD      | 5-min staleTime, refetchOnWindowFocus: false |
| **React.memo usage**      | ❌ NONE      | Zero components memoized in concept2cure/    |
| **Virtualization**        | ❌ NONE      | No list virtualization anywhere              |
| **Context memoization**   | ⚠️ PARTIAL   | ProjectContext missing useMemo on value      |
| **Inline handlers**       | ⚠️ PERVASIVE | 60+ inline handlers across main components   |
| **Vite chunk splitting**  | ✅ GOOD      | 9 vendor chunks defined                      |
| **Prefetch strategy**     | ✅ GOOD      | Top 5 routes prefetched after 1.5s           |

### Priority Actions

1. **Memoize ProjectContext value** — biggest cascading fix, 5 minutes
2. **Extract + memo MessageBubble** — biggest hot-path fix, 30 minutes
3. **Lazy-load ZenSettings** — free bundle reduction, 5 minutes
4. **Add `@tanstack/react-virtual` to chat** — DOM reduction for long threads
5. **Stabilize sidebar handlers** — reduce re-render cost of shell components
