# Clickthrough Audit — Segment 2: Main Dashboard & Navigation Shell

**Date:** 2026-03-30
**Auditor:** Claude Code (Biotech Client Perspective)
**Scope:** App shell, sidebar navigation, main dashboard, top bar/header, protected route guard

---

## Executive Summary

The application follows a **Claude.ai-inspired layout** — collapsible sidebar on the left, main chat surface in the center, and optional knowledge panel on the right. After login, users land on `layoutMode='projects'` which shows a project cards grid + full-screen AnA chat (the AI assistant). The `PlatformHome` dashboard component exists but is **not rendered** — all interaction flows through the AnA chat interface.

**Critical Finding:** The "Sign Out" button in Settings has **no onClick handler** — it is non-functional.

| Category | Pass | Fail | Warning |
|----------|------|------|---------|
| App Shell Structure | 5 | 0 | 0 |
| Sidebar Navigation | 7 | 1 | 2 |
| Main Dashboard / Home | 4 | 0 | 1 |
| Top Bar / Header | 2 | 1 | 0 |
| Protected Route Guard | 3 | 0 | 1 |

---

## 1. App Shell (ZenApp.tsx)

**File:** `client/src/concept2cure/ZenApp.tsx` (4156 lines)

### Top-Level Layout

The shell renders a full-viewport flex container (`h-screen w-full overflow-hidden`) with:

1. **Left:** `ZenSidebar` — collapsible (260px expanded, 56px collapsed)
2. **Center:** `GlobalOperatingShell` wrapping all content areas + `AnaPersistentPanel` (the chat)
3. **Right (contextual):** `ProjectKnowledgePanel` (72/80 width) when in project views, `DocumentCanvasPanel` when artifact active, or `ToolPanelWrapper` (fixed drawer) for tool panels

**Layout modes** are controlled by a `layoutMode` state variable (50+ possible values). The effective active modes are:

| Layout Mode | What Renders | Verdict |
|---|---|---|
| `projects` | Project cards grid + full-screen AnA chat | **PASS** |
| `project-home` | AnA chat + Project Knowledge sidebar | **PASS** |
| `regulatory-workspace` | AnA chat + right sidebar (knowledge or editor) | **PASS** |
| `workspace` | Project header + AnA chat + knowledge panel | **PASS** |
| `apps` | `AppsPage` (lazy) | **PASS** |
| `artifacts-center` | `ArtifactsPage` (lazy) | **PASS** |
| `setup` | `SetupPage` (lazy) | **PASS** |
| `documents` | `ToolsLanding` (lazy) | **PASS** |
| Many demoted modes | Auto-redirect via `DEMOTED_REDIRECTS` | **PASS** (graceful) |

**Verdict: PASS** — Layout structure is sound, conversation-first as designed.

### CSS Variables and Scrollbar Styling (line ~2190)

```
--zen-canvas: #FAFAF9
--zen-canvas-muted: #F5F5F4
--zen-canvas-elevated: #FFFFFF
--zen-ink: #18181B
--zen-ink-muted: #71717A
--zen-border: #E4E4E7
--zen-accent: #d97757
```

Custom thin scrollbar styling applied globally via `.zen-scroll`.

**Verdict: PASS** — Consistent with Claude UI design principles (calm, muted stone palette).

### Connection Status Banner (line ~2221)

When Cortex health check returns unhealthy, an amber banner appears at top:
> "RI running in offline mode -- chat still available"

**Verdict: PASS** — Real health check via `useCortexHealth({ refetchInterval: 30000 })`.

---

## 2. Main Dashboard / Home (`/concept2cure`)

**Route definition:** `client/src/concept2cure/router/ZenRouter.tsx` line 507-515
```
<Route path="/concept2cure"> → <ProtectedRoute><ZenApp /></ProtectedRoute>
```

### What the User Sees

When `layoutMode === 'projects'` (initial state when no project is active):

**A. AnA Chat — Full Screen (AnaPersistentPanel mode="full")**
- File: `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`
- The chat panel occupies the center of the screen
- Shows platform greeting (time-of-day aware from `usePlatformContext`)
- Shows `workspaceSuggestedActions` as action chips
- Supports 43+ slash commands and natural language queries

**B. Project Cards Grid (inline in ZenApp, line ~3680-3848)**
- Renders when `layoutMode === 'projects'` AND `projects.length > 0`
- Shows a "Projects" heading with "New project" button
- **"Continue recent work"** hero card — most recently updated project, shows name, type badge, description, relative time, chat count, "Continue" link
- **"All projects"** grid — 2-column card grid (up to 12 projects), each card shows:
  - Colored dot (by submission type)
  - Project name
  - Submission type badge (510(k), IND, NDA, BLA, PMA, MAA, De Novo, EUA)
  - Star indicator if starred
  - Relative timestamp
- Clicking a project card: `setActiveProjectId(project.id); setLayoutMode('project-home')`

**C. PlatformHome Component — NOT RENDERED**
- File: `client/src/concept2cure/components/home/PlatformHome.tsx`
- Imported at line 355 but commented out at line 3539: `{/* PlatformHome removed -- AnA handles everything via chat */}`
- This component had: greeting, quick actions (New Project, AI Copilot, Collaboration, Biostatistics), project table, 13-item module catalog, recent artifacts
- **Impact:** The Quick Actions and Module Catalog from PlatformHome are not reachable from the dashboard. They ARE available via sidebar nav and command palette, so no capability loss per se.

**Verdict: PASS** — Projects are real data from `useProjects()` hook (DB-backed). No mock data. Chat-first design is upheld.

**Warning:** PlatformHome's MODULE_CATALOG items (eCTD Co-Author, Intelligence Hub, Command Center, Legal Center, SnowGlobe, Collaboration Hub, Knowledge Base, Project Knowledge, Client Onboarding, Training Center) all navigate to **demoted modes** that redirect to 'projects' or 'documents'. These are effectively dead links in the unused component — not a user-facing issue since PlatformHome is not rendered, but it indicates dead code.

---

## 3. Sidebar Navigation

**File:** `client/src/concept2cure/components/sidebar/ZenSidebar.tsx` (1132 lines)

### Expanded Sidebar (260px)

#### Brand Header (line ~840)
- Concept2Cure logo (rounded square) + "Concept2Cure" text
- Collapse button (ChevronLeft)
- **Verdict: PASS**

#### Global Navigation — 6 Items (lines 858-898)

| # | Label | Icon | Click Action | Route/Behavior | Verdict |
|---|---|---|---|---|---|
| 1 | **New** (dropdown) | Plus | Opens dropdown: New Chat, New Project, New Document | `onNewChat`, `onOpenProjects`, `onNavigate('artifacts-center')` | **PASS** |
| 2 | **Search** | Search | Opens command palette | `onOpenSearch` → `setCommandPaletteOpen(true)` | **PASS** |
| 3 | **Projects** | FolderOpen | Opens project switcher | `onOpenProjects` → `setProjectSwitcherOpen(true)` | **PASS** |
| 4 | **AI Assistants** | Sparkles | Navigates to Apps page | `onNavigate('apps')` → `layoutMode='apps'` → `AppsPage` | **PASS** |
| 5 | **Documents** | FileStack | Navigates to Artifacts | `onNavigate('artifacts-center')` → `layoutMode='artifacts-center'` → `ArtifactsPage` | **PASS** |
| 6 | **Setup** | Settings | Navigates to Setup | `onNavigate('setup')` → `layoutMode='setup'` → `SetupPage` | **PASS** |

#### Current Project Block — 4 Items (lines 900-948, shown only when a project is active)

| # | Label | Icon | Click Action | Mapped Layout Mode | Verdict |
|---|---|---|---|---|---|
| 1 | **Overview** | Home | `onNavigate('overview')` | Not in `SIDEBAR_NAV_TO_LAYOUT` map | **FAIL** |
| 2 | **Tasks** | ListChecks | `onNavigate('task-board')` | `task-board` | **PASS** |
| 3 | **Tools** | Wrench | `onNavigate('tools')` | `documents` (→ ToolsLanding) | **PASS** |
| 4 | **Submit** | Send | `onNavigate('submit')` | Not in `SIDEBAR_NAV_TO_LAYOUT` map | **WARNING** |

**FAIL Detail — "Overview" button:** `onNavigate('overview')` is called, but 'overview' is NOT in the `SIDEBAR_NAV_TO_LAYOUT` map (line 4130-4155) and NOT in the switch/case block (line 2263-2295). It falls through to `setLayoutMode(SIDEBAR_NAV_TO_LAYOUT['overview'] ?? 'projects')` which defaults to 'projects'. This means clicking "Overview" when inside a project **navigates AWAY from the project** back to the projects index. This is a bug — the user expects to see a project overview, not leave the project.

**WARNING — "Submit" button:** `onNavigate('submit')` is not directly in `SIDEBAR_NAV_TO_LAYOUT`. However, it IS in the switch/case at line 2274 which maps through to `SIDEBAR_NAV_TO_LAYOUT['submit']`. Since 'submit' is not in that map either, it falls to `'projects'`. The intent seems to be mapping to 'submissions' layout mode. Likely broken.

#### Workspace Section — 6 Items (lines 1063-1103, always visible)

| # | Label | Icon | Active Check | Navigate ID | Mapped Layout Mode | Verdict |
|---|---|---|---|---|---|---|
| 1 | **Tools** | Wrench | `documents` or `tools` | `documents` | `regulatory-workspace` | **PASS** |
| 2 | **Editor** | PenLine | `submission-builder` | `submission-builder` | `regulatory-workspace` | **PASS** |
| 3 | **Intelligence** | Brain | `ri-copilot` | `ri-copilot` | `regulatory-workspace` | **PASS** |
| 4 | **Review & Verify** | ShieldCheck | `review` or `verify` | `review` | `review` | **PASS** |
| 5 | **References** | Archive | `vault` | `vault` | `vault-workspace` (→ demoted → `vault`) | **PASS** |
| 6 | **Submit & Export** | Send | `submit` | `submit` | See warning above | **WARNING** |

#### Project List (lines 967-1058)
- **Search input** — filters projects by name, description, or type
- **Pinned Projects** group — expandable, shows projects with `starred` or `pinned` flag
- **Recent Projects** group — non-pinned, sorted by active project first then alphabetical
- **General Conversations** — conversations not scoped to any project
- **Empty state** — Uses `EmptyState` pattern component with "Create your first project" CTA
- Each project row: expand chevron, colored dot, name, conversation count badge, star indicator, 3-dot menu (New conversation, Pin/Unpin, Archive, Delete)
- Each conversation row: message icon, title, relative time, 3-dot menu (Rename, Move to project, Delete)

**Verdict: PASS** — Real data, proper ARIA, keyboard accessible, well-organized.

#### Account Footer (lines 1106-1126)
- User avatar (initial), display name, email
- Clicking opens Settings modal (`onOpenSettings`)
- **Verdict: PASS**

### Collapsed Sidebar (56px, icon-only)

Same 6 global nav items as icon buttons, plus:
- Editor shortcut icon below a separator
- Expand button (ChevronRight) at bottom
- User avatar initial at very bottom

**Verdict: PASS** — Clean, functional icon strip with tooltips via aria-label.

---

## 4. Top Bar / Header

### GlobalOperatingShell (line ~29-73)
**File:** `client/src/concept2cure/components/shell/GlobalOperatingShell.tsx`

- **Minimal breadcrumb** — 28px height bar, only shown for layout modes: `regulatory-workspace`, `documents`, `report-engine`, `submissions`, `review`, `dossier-map`
- Shows: `[Project Name] / [Global Node Label] / [Artifact Label]` as stone-colored breadcrumb trail
- No user menu, no notifications, no search in the header — these all live in the sidebar

**Verdict: PASS** — Intentionally minimal per Claude UI design principles ("No Chrome").

### Missing from Header

There is NO:
- Notification bell (notifications are in Settings)
- User dropdown (user account is in sidebar footer → Settings modal)
- Search in header (search is via command palette, Cmd+K)

**Verdict: PASS** — This is intentional per the "conversation-first, no-chrome" design philosophy. All features are accessible through sidebar and command palette.

### Sign Out Button — BROKEN
**File:** `client/src/concept2cure/components/settings/ZenSettings.tsx` line 1438

```tsx
<button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors duration-150">
  <LogOut className="w-4 h-4" />
  Sign Out
</button>
```

**FAIL:** This button has **no `onClick` handler**. It renders correctly with the red "Sign Out" text and LogOut icon, but clicking it does absolutely nothing. The auth service has a proper `logout()` method (in `portal-v2/services/authService.tsx` line 588) but it is never wired to this button.

**Impact: HIGH** — Users cannot sign out of the application through the UI. They would need to manually clear localStorage/sessionStorage or wait for token expiry.

---

## 5. Protected Route Guard

### Primary Guard (ZenRouter.tsx, line 164-185)
**File:** `client/src/concept2cure/router/ZenRouter.tsx`

```tsx
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = usePortalAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const returnTo = encodeURIComponent(location);
      setLocation(`/concept2cure/login?returnTo=${returnTo}`);
    }
  }, [isAuthenticated, isLoading, location, setLocation]);

  if (isLoading) return <ZenLoadingScreen message="Checking authentication..." />;
  if (!isAuthenticated) return null;
  return <>{children}</>;
};
```

| Check | Result | Verdict |
|---|---|---|
| Shows loading state while checking auth | Yes — `ZenLoadingScreen` with "Checking authentication..." | **PASS** |
| Redirects to login when not authenticated | Yes — redirects to `/concept2cure/login?returnTo=<encoded-current-path>` | **PASS** |
| Preserves return URL | Yes — `returnTo` query parameter with encoded current location | **PASS** |
| Handles token expiry mid-session | Partial — relies on `usePortalAuth().isAuthenticated` reactivity | **WARNING** |

**WARNING — Token Expiry Mid-Session:** The `usePortalAuth` hook checks `isAuthenticated` which is derived from `!!user` state. The auth service does have token refresh logic (`refreshToken()` method) with automatic refresh scheduling. However, if a refresh fails (e.g., refresh token expired after 7 days), the auth service calls `logout()` which emits a 'logout' event, clearing user state. This should trigger the ProtectedRoute redirect. The flow appears correct but depends on the event chain working reliably — there is no explicit token-expiry polling in the ProtectedRoute itself.

### Legacy Guard (ProtectedRoute.jsx)
**File:** `client/src/components/ProtectedRoute.jsx`

Older version that uses `sessionStorage.setItem('redirectAfterLogin', location)` instead of query params. Not used by the main ZenRouter — likely a leftover from the portal-v1 era. No impact on current flow.

### Auth Route (line 195-214)
Inverse guard — redirects already-authenticated users away from login/signup pages to `/concept2cure`. Works correctly.

---

## 6. Vault Drawer — Global Presence

**File:** `client/src/concept2cure/ZenApp.tsx` lines 3974-3986

A persistent floating "Vault" tab is pinned to the right edge of the screen (fixed position, vertically centered). Clicking it opens the Vault tool panel drawer (96/620px width). This is always present unless a tool panel or embedded module is already active.

**Verdict: PASS** — Provides quick access to reference documents from any screen.

---

## 7. Command Palette (Cmd+K)

**File:** `client/src/concept2cure/components/command/ZenCommandPalette.tsx`

Opened via sidebar "Search" button or keyboard shortcut Cmd+K. Provides:
- Quick project switching
- Navigation to tools/modules
- Search conversations
- AI quick actions
- Start new submissions

**Verdict: PASS** — Proper keyboard-first design.

---

## Bug Summary

| # | Severity | Component | File:Line | Description |
|---|---|---|---|---|
| **BUG-1** | **CRITICAL** | Sign Out Button | `ZenSettings.tsx:1438` | No `onClick` handler — users cannot sign out |
| **BUG-2** | **HIGH** | Sidebar "Overview" nav | `ZenSidebar.tsx:923` / `ZenApp.tsx:4130` | Clicking "Overview" in project context navigates to projects index instead of project overview. 'overview' is missing from `SIDEBAR_NAV_TO_LAYOUT` map. |
| **BUG-3** | **MEDIUM** | Sidebar "Submit" nav | `ZenSidebar.tsx:939` / `ZenApp.tsx:4130` | 'submit' not in `SIDEBAR_NAV_TO_LAYOUT` — likely should map to 'submissions'. Falls back to 'projects'. |

---

## Observations

1. **Dead Code:** `PlatformHome` is imported (line 355) but never rendered (commented out at line 3539). Its MODULE_CATALOG references 13 modes, most of which are demoted. Should be removed entirely.

2. **LayoutMode Sprawl:** The `LayoutMode` type has 70+ values. Most are demoted/legacy redirects. A cleanup to reduce this to the ~15 active modes would improve maintainability.

3. **Consistent with Design Philosophy:** The shell genuinely follows the "conversation-first, no-chrome" principles. Navigation is minimal, the chat IS the product, and tool panels slide in from the right like Claude artifacts. This is well-executed.

4. **Real Data Throughout:** Projects, conversations, workspace summary, Cortex health — all come from real API hooks (`useProjects`, `useCortexHealth`, `useWorkspaceSummary`, `usePlatformContext`). No mock data detected in production paths.

5. **Accessibility:** ARIA labels on sidebar buttons, `role="navigation"` on sidebar, keyboard navigation support (focus-visible rings), `aria-current="page"` on active nav items. Generally solid.

---

## File Reference

| Component | File Path |
|---|---|
| App Shell | `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/ZenApp.tsx` |
| Router | `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/router/ZenRouter.tsx` |
| Sidebar | `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/components/sidebar/ZenSidebar.tsx` |
| Global Shell | `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/components/shell/GlobalOperatingShell.tsx` |
| Settings (Sign Out) | `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/components/settings/ZenSettings.tsx` |
| PlatformHome (unused) | `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/components/home/PlatformHome.tsx` |
| Protected Route (ZenRouter) | `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/router/ZenRouter.tsx:164` |
| Protected Route (legacy) | `/home/user/ClinicalSageAI-2-replit/client/src/components/ProtectedRoute.jsx` |
| Auth Service | `/home/user/ClinicalSageAI-2-replit/client/src/portal-v2/services/authService.tsx` |
| Command Palette | `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/components/command/ZenCommandPalette.tsx` |
