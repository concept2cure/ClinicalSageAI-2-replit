# AnA UI Convergence — Authority Map & Work Order

**Date:** 2026-04-05
**Branch:** `concept2cure-v2`
**Controlling audit:** `docs/audits/ANA_UI_FORENSIC_AUDIT_2026-04-05.md`

---

## 1. Ownership Table — Every Concern, Every File

### 1.1 Shell & Layout Ownership

| Concern | Current Owner | Future Owner | Action | File(s) |
|---------|--------------|-------------|--------|---------|
| Application shell (sidebar + content + header) | ZenApp.tsx | ZenApp.tsx | **REFACTOR** — collapse 30+ conditional renders to 5 destination slots | `client/src/concept2cure/ZenApp.tsx` |
| Layout mode state machine | zen-app-constants.ts | zen-app-constants.ts | **REFACTOR** — collapse LayoutMode from 92 → ~8 values | `client/src/concept2cure/zen-app-constants.ts` |
| URL routing | ZenRouter.tsx | ZenRouter.tsx | **KEEP** — already funnels to ZenApp | `client/src/concept2cure/router/ZenRouter.tsx` |
| Left sidebar navigation | ZenSidebar.tsx | ZenSidebar.tsx | **REFACTOR** — 6 global items → 5 destinations | `client/src/concept2cure/components/sidebar/ZenSidebar.tsx` |
| Chat surface | AnaPersistentPanel.tsx | AnaPersistentPanel.tsx | **KEEP** — becomes the primary content area | `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` |
| Right-side panels | ToolPanel system | ToolPanel system | **KEEP** — sole right-side content mechanism | `zen-app-constants.ts` (registry) |
| Breadcrumb header | GlobalOperatingShell.tsx | Inline in ZenApp or remove | **DEMOTE** — fold into ZenApp header or delete | `client/src/concept2cure/components/shell/GlobalOperatingShell.tsx` |
| Document workspace sub-shell | ProjectWorkspaceShell.tsx | ProjectWorkspaceShell.tsx | **KEEP** — machine room, sacred | `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` |
| Embedded module hosts | EmbeddedModuleHosts.tsx | EmbeddedModuleHosts.tsx | **KEEP** — 510k/PMA/CER adapters | `client/src/concept2cure/components/shell/EmbeddedModuleHosts.tsx` |
| Alternative shell (unused) | ZenShell.tsx | None | **DELETE** — dead code | `client/src/concept2cure/layouts/ZenShell.tsx` |
| Industry shell (unused) | IndustryWorkspaceShell.tsx | None | **DELETE** — dead code | `client/src/concept2cure/components/shell/IndustryWorkspaceShell.tsx` |
| Legacy sidebar | Sidebar.tsx | None | **DELETE** (if orphaned) | `client/src/components/layout/Sidebar.tsx` |

### 1.2 Navigation Destinations

**Target: 5 destinations only.**

| # | Destination | Current State | Layout Mode | Action |
|---|------------|---------------|-------------|--------|
| 1 | **Chats** | `projects` layout shows project list + conversations | `chats` (rename from `projects`) | **REFACTOR** — rename, make conversation-first |
| 2 | **Projects** | Partially exists as project browser within sidebar | `projects` (new, separate from chats) | **REFACTOR** — project management hub |
| 3 | **Communication Center** | Exists as sub-view in ProjectWorkspaceShell | `communication-center` (new top-level) | **PROMOTE** — wire as top-level destination |
| 4 | **Apps** | Exists as `apps` layout mode + AppsPage.tsx | `apps` | **KEEP** — already wired |
| 5 | **Settings** | Exists as `setup` layout mode | `settings` (rename from `setup`) | **REFACTOR** — rename for clarity |

### 1.3 Surfaces to Demote (Remove from Top-Level Nav)

| Current Nav Item | Current Layout Mode | Demotion Target | Action |
|-----------------|--------------------|-----------------| -------|
| Workspace Home | `project-home` | Project context within Chats | **DEMOTE** — remove from global nav |
| Documents | `regulatory-workspace` | Project context workspace | **DEMOTE** — accessible within project, not global |
| Intelligence | N/A (custom handler) | Communication Center or Chat | **DEMOTE** — fold into Communication Center |
| Artifacts Center | `artifacts-center` | Apps sub-section | **DEMOTE** — fold into Apps |
| Review | `review` | Project context workspace | **DEMOTE** — project-scoped only |
| Submissions | `submissions` | Project context workspace | **DEMOTE** — project-scoped only |
| Dossier Map | `dossier-map` | Project context workspace | **DEMOTE** — project-scoped only |
| Report Engine | `report-engine` | Apps sub-section | **DEMOTE** — accessible via Apps |
| Task Board | `task-board` | Project context workspace | **DEMOTE** — project-scoped only |
| CSR Workflow | `csr-workflow` | Project context workspace | **DEMOTE** — project-scoped only |
| IND Checklist | `ind-checklist` | Project context workspace | **DEMOTE** — project-scoped only |
| Template Library | `template-library` | Project context workspace | **DEMOTE** — project-scoped only |

### 1.4 LayoutMode Convergence

**Before (92 values):**
- 4 global destinations
- 10 project tabs
- 3 workspace/editor modes
- 6 specialist tools
- 5 compatibility redirects
- 64+ demoted/legacy modes

**After (~8 values):**

| New LayoutMode | Purpose | Replaces |
|---------------|---------|----------|
| `chats` | Conversation list + active chat (ChatGPT-style home) | `projects`, `project-home`, `assistant`, `ctd` |
| `project-workspace` | Project context: documents, review, submissions, dossier, tasks | `documents`, `vault`, `review`, `submissions`, `dossier-map`, `section-workspace`, `csr-workflow`, `ind-checklist`, `template-library`, `regulatory-workspace`, `editor`, `task-board` |
| `communication-center` | Tasks, collaboration, correspondence, agency portal | New (promoted from sub-view) |
| `apps` | App launcher + specialist tools | `apps`, `precedent-intelligence`, `biostatistics`, `review-readiness`, `report-engine`, `safety-narrative`, `vault-workspace` |
| `settings` | Account, workspace, preferences | `setup` |
| `deep-research` | Deep research chat mode | `deep-research` |
| `embedded-510k` | 510k embedded workspace | Embedded module host |
| `embedded-pma` | PMA embedded workspace | Embedded module host |

All 64+ demoted/legacy modes: **DELETE from type union entirely** (redirect logic can use a simple `string → LayoutMode` lookup for any bookmarked URLs).

### 1.5 SIDEBAR_NAV_TO_LAYOUT Convergence

**Before (31 entries) → After (5 entries):**

| Nav ID | → Layout Mode |
|--------|--------------|
| `chats` | `chats` |
| `projects` | `chats` (with project browser open) |
| `communication-center` | `communication-center` |
| `apps` | `apps` |
| `settings` | `settings` |

All other entries: **DELETE**.

### 1.6 ToolPanel Convergence

**Keep all 10 panels.** They become the right-side artifact/tool viewer (Claude Artifacts pattern). No changes needed to the registry — panels are launched from within project workspace or chat actions.

### 1.7 Theme Token Actions

| Token | Status | Action |
|-------|--------|--------|
| Poppins font | Correct | Keep |
| Lora font | Correct | Keep |
| Terracotta `#d97757` | Correct | Keep; replace 15+ hardcoded `#D97757` in AnaPersistentPanel with `bg-accent` / `text-accent` |
| Warm cream `#FAFAF9` | Correct | Keep |
| Warm neutral scale | Correct | Keep |

---

## 2. Recommended Execution Sequence

### Phase 3: Dead Code Deletion (Low Risk, High Signal)

**Estimated scope:** 4 files deleted, ~750 lines removed

1. Delete `client/src/concept2cure/layouts/ZenShell.tsx`
2. Delete `client/src/concept2cure/components/shell/IndustryWorkspaceShell.tsx`
3. Verify `client/src/components/layout/Sidebar.tsx` is orphaned → delete if so
4. Remove all 64+ demoted/legacy values from LayoutMode type union
5. Remove `LEGACY_NAV_ID_BY_LAYOUT` (42 entries) from zen-app-constants.ts
6. Remove corresponding redirect logic from ZenApp.tsx
7. Clean up barrel exports (`index.ts` files)

### Phase 4: Navigation Collapse (Medium Risk)

**Estimated scope:** ZenSidebar.tsx refactor + zen-app-constants.ts collapse

1. Collapse LayoutMode to ~8 values
2. Rewrite `SIDEBAR_NAV_TO_LAYOUT` to 5 entries
3. Rewrite `PRIMARY_NAV_ID_BY_LAYOUT` to 5 entries
4. Refactor ZenSidebar to render exactly 5 global items:
   - Chats (MessageSquare icon)
   - Projects (FolderKanban icon) — or merge with Chats
   - Communication Center (Radio icon)
   - Apps (Grid icon)
   - Settings (Settings icon)
5. Remove project context tabs from sidebar (Overview, Tasks, Tools, Submit) — these become project workspace internal navigation
6. Promote CommunicationCenter from sub-view to top-level layout mode

### Phase 5: ZenApp Content Collapse (High Risk, High Reward)

**Estimated scope:** ZenApp.tsx 30+ conditional renders → 5 destination renders

1. Replace 30+ `{layoutMode === 'X' && ...}` blocks with 5 destination components:
   - `layoutMode === 'chats'` → `<ChatsDestination />`
   - `layoutMode === 'project-workspace'` → `<ProjectWorkspaceShell />`
   - `layoutMode === 'communication-center'` → `<CommunicationCenter />`
   - `layoutMode === 'apps'` → `<AppsPage />`
   - `layoutMode === 'settings'` → `<SettingsPanel />`
2. Project workspace internal navigation (documents, review, submissions, etc.) moves INSIDE ProjectWorkspaceShell
3. Specialist tools (biostatistics, precedent, etc.) launch as ToolPanel right-side drawers from Apps
4. Deep research becomes a chat mode toggle, not a layout mode

### Phase 6: Hardcoded Token Cleanup (Low Risk)

1. Replace `bg-[#D97757]` → `bg-accent` (15+ instances in AnaPersistentPanel)
2. Replace `text-[#D97757]` → `text-accent`
3. Verify no other hardcoded hex values exist outside tailwind.config.ts

---

## 3. Risks & Blockers

### 3.1 High Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| ProjectWorkspaceShell currently receives layout mode from ZenApp — collapsing modes may break internal routing | Editor, document authoring, submission workflow break | Keep ProjectWorkspaceShell's internal state management; pass a `workspaceView` prop instead of `layoutMode` |
| 5,555-line AnaPersistentPanel has tight coupling to ZenApp callbacks (`onNavigate`, `onActionRun`, etc.) | Chat actions (navigate to document, open artifact) break | Audit every callback before modifying ZenApp's content area |
| Embedded modules (510k/PMA/CER) have their own shell hosts | Module rendering breaks | Test embedded module flows after each phase |

### 3.2 Medium Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| CommunicationCenter is currently project-scoped — promoting to global may require API changes | Empty state for users without a project | Add project selector within Communication Center or make it project-aware |
| Removing project context tabs from sidebar may confuse existing users | Navigation regression | Ensure project workspace has visible internal tab bar |
| `DEMOTED_REDIRECTS` useEffect handles bookmarked URLs — removing it breaks old bookmarks | 404 for bookmarked users | Keep a simple redirect map (old mode → new mode) as a migration shim |

### 3.3 Blockers

| Blocker | Status | Resolution |
|---------|--------|------------|
| Missing skill files (`/mnt/skills/user/*`) | Non-blocking | User is providing files to commit to `.claude/skills/` |
| `config/ui-surface-registry.json` does not exist | Creating now | Will be written as part of this audit |

---

## 4. Files Expected But Not Found

| Expected | Status | Impact |
|----------|--------|--------|
| `config/ui-surface-registry.json` | Does not exist | Creating now |
| `/mnt/skills/user/ana-chatgpt-parity-ui/SKILL.md` | Does not exist (cloud-only path) | User providing repo-local version |
| `/mnt/skills/user/ana-ui-design-constitution/SKILL.md` | Does not exist | User providing repo-local version |
| `/mnt/skills/user/ana-ui-master-work-order/SKILL.md` | Does not exist | User providing repo-local version |
| `/mnt/skills/user/trialsage-repo-ops/SKILL.md` | Does not exist | User providing repo-local version |
| `/mnt/skills/user/trialsage-component-registry/SKILL.md` | Does not exist | User providing repo-local version |
| `/mnt/skills/user/trialsage-design-system/SKILL.md` | Does not exist | User providing repo-local version |

---

## 5. Zero Capability Loss Verification Checklist

Before any phase is marked complete, verify:

- [ ] Every layout mode that existed before convergence has a reachable equivalent
- [ ] Project documents, editor, review, submissions, vault — all accessible within project workspace
- [ ] Specialist tools (biostatistics, precedent, report engine) — all accessible from Apps
- [ ] All 43 slash commands still functional in AnaPersistentPanel
- [ ] All 41 operational commands still functional
- [ ] ToolPanel right-side drawers still launch correctly
- [ ] Embedded modules (510k/PMA/CER) still render
- [ ] Domain prompt buttons in chat still map to correct contexts
- [ ] Old bookmarked URLs redirect to correct new destination
- [ ] CommunicationCenter retains all 5 tabs at top-level
