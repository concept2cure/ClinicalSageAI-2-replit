# AnA UI Shell Convergence — Validation Report

**Date:** 2026-04-05
**Branch:** `concept2cure-v2`
**Sprint:** Phase 1-6 (Audit → Dead Code → Nav Collapse → Content Collapse → Token Cleanup)

---

## 1. What Changed

### Phase 1-2: Forensic Audit & Authority Map
- Identified 5 active shell concerns, 2 dormant shells, 92 LayoutMode values
- Documented full ownership table and convergence plan
- Created `config/ui-surface-registry.json`

### Phase 3: Dead Code Deletion (-2,555 lines)
| File | Lines | Action |
|------|-------|--------|
| `ZenShell.tsx` | 784 | Deleted (confirmed orphaned) |
| `SplitScreenLayout.tsx` | 267 | Deleted (confirmed orphaned) |
| `IndustryWorkspaceShell.tsx` | 522 | Deleted (confirmed orphaned) |
| `UnifiedWorkspaceDemo.tsx` | 560 | Deleted (demo, never imported) |
| `Sidebar.tsx` (legacy) | 284 | Deleted (zero imports) |
| `LEGACY_NAV_ID_BY_LAYOUT` | 42 entries | Removed from zen-app-constants.ts |
| `RedirectToWorkspace` component | ~15 lines | Removed from ZenApp.tsx |
| `handleNavigate default case` | 40 lines → 2 | Simplified to `setLayoutMode('projects')` |

All demoted modes consolidated into `zenRouteNormalization.ts` (55+ redirect entries).

### Phase 4: Navigation Collapse
| Before | After |
|--------|-------|
| 6 global nav items | 5 primary destinations |
| 4 project context tabs | Project name/badge only |
| Workspace Home, Documents, Intelligence | Removed from top-level |

**New sidebar structure:**
- Zone A: New Chat, Search
- Zone B: Chats, Projects, Communication Center, Apps, Settings
- Zone C: Active project context + pinned/recent projects
- Zone D: Account footer

**Communication Center wired as top-level:**
- Added `communication-center` to LayoutMode type
- Added to SIDEBAR_NAV_TO_LAYOUT mapping
- Added handleNavigate case
- Lazy-loaded CommunicationCenter component
- Added render block in ZenApp

### Phase 5: Content Collapse
- Removed legacy `workspace` render block (~110 lines)
- Resolved AnaPersistentPanel mode: `full` for all 5 primary destinations, `compact` only for project-scoped module pages
- Removed `workspace` from AnaPersistentPanel exclusion list

### Phase 6: Token Cleanup
Replaced 20 hardcoded `#D97757` instances in AnaPersistentPanel.tsx:
| Old | New |
|-----|-----|
| `text-[#D97757]` | `text-terracotta-500` |
| `bg-[#D97757]` | `bg-terracotta-500` |
| `bg-[#FBF0EB]` | `bg-terracotta-50` |
| `hover:bg-[#F6E6DF]` | `hover:bg-terracotta-100` |
| `hover:prose-a:text-[#C4623F]` | `hover:prose-a:text-terracotta-600` |
| `prose-a:decoration-[#E8C7BA]` | `prose-a:decoration-terracotta-200` |

---

## 2. Structural Validation

| Criterion | Status | Evidence |
|-----------|--------|----------|
| One canonical shell owner | PASS | ZenApp.tsx — sole shell authority |
| One canonical nav source | PASS | ZenSidebar.tsx — 5 destinations |
| Communication Center exists | PASS | Top-level destination, lazy-loaded |
| Apps view wired | PASS | `layoutMode === 'apps'` → AppsPage |
| Settings view wired | PASS | `layoutMode === 'setup'` → SetupPage |
| No competing shell files | PASS | ZenShell, IndustryWorkspaceShell, SplitScreenLayout deleted |
| LayoutMode demoted modes redirect | PASS | 55+ entries in zenRouteNormalization.ts |
| AnaPersistentPanel mode resolved | PASS | full for 5 destinations, compact for module pages |

---

## 3. Files Changed (Complete List)

### Deleted
- `client/src/concept2cure/layouts/ZenShell.tsx`
- `client/src/concept2cure/layouts/SplitScreenLayout.tsx`
- `client/src/concept2cure/components/shell/IndustryWorkspaceShell.tsx`
- `client/src/concept2cure/demo/UnifiedWorkspaceDemo.tsx`
- `client/src/components/layout/Sidebar.tsx`

### Modified
- `client/src/concept2cure/ZenApp.tsx` — removed workspace block, wired communication-center, resolved AnaPersistentPanel mode
- `client/src/concept2cure/zen-app-constants.ts` — added communication-center, removed LEGACY_NAV_ID_BY_LAYOUT
- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx` — collapsed to 5 destinations
- `client/src/concept2cure/router/zenRouteNormalization.ts` — expanded to 55+ redirect entries
- `client/src/concept2cure/components/index.ts` — removed IndustryWorkspaceShell export
- `client/src/concept2cure/layouts/index.ts` — removed ZenShell/SplitScreenLayout exports
- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` — 20 hardcoded hex → tokens
- `CLAUDE.md` — added UI Convergence and Legacy Surface Deletion rules
- `config/ui-surface-registry.json` — updated with current state

### Created
- `docs/audits/ANA_UI_FORENSIC_AUDIT_2026-04-05.md`
- `docs/plans/ANA_UI_CONVERGENCE_WORK_ORDER_2026-04-05.md`
- `docs/plans/ANA_UI_MASTER_WORK_ORDER.md`
- `docs/design/ANA_CHATGPT_PARITY_UI_DESIGN.md`
- `.claude/skills/ana-chatgpt-parity-ui.md`
- `.claude/skills/ana-ui-shell-convergence-prompt.md`
- `.claude/skills/concept2cure-v2-component-registry.md`
- `.claude/skills/concept2cure-v2-design-system.md`
- `.claude/skills/concept2cure-v2-repo-ops.md`
- `config/ui-surface-registry.json`

---

## 4. `ui-surface-registry.json` State

| Surface | Status |
|---------|--------|
| ZenApp.tsx | `active` — canonical shell |
| ZenRouter.tsx | `active` — keep |
| ZenShell.tsx | `deleted` |
| SplitScreenLayout.tsx | `deleted` |
| IndustryWorkspaceShell.tsx | `deleted` |
| GlobalOperatingShell.tsx | `demoted` — evaluate for removal |
| ProjectWorkspaceShell.tsx | `active` — sacred machine room |
| EmbeddedModuleHosts.tsx | `active` — keep |
| ZenSidebar.tsx | `active` — canonical nav (5 items) |
| ProjectsSidebar.tsx | `active` — keep |
| Sidebar.tsx (legacy) | `deleted` |
| AnaPersistentPanel.tsx | `active` — full mode for destinations |

---

## 5. Responsive Validation

Browser testing tooling was not available in this session. Responsive behavior was not directly tested at the required viewport widths (1440, 1280, 1024, 768, 430). This is an honest gap.

The structural changes (sidebar item reduction, mode resolution) should improve responsive behavior since fewer competing surfaces means less layout conflict. But visual verification is needed.

---

## 6. Regression Checklist

| System | Status | Notes |
|--------|--------|-------|
| Editor (EditorPanel) | NOT BROKEN | Render block preserved at line ~3185 |
| Artifact lifecycle | NOT BROKEN | No changes to artifact handling |
| Document workspace (ProjectWorkspaceShell) | NOT BROKEN | Render block preserved at ~2424 |
| Review flow | NOT BROKEN | `review` layout mode preserved |
| Submission flow | NOT BROKEN | `submissions` layout mode preserved |
| Vault | NOT BROKEN | `vault` layout mode preserved |
| Dossier map | NOT BROKEN | `dossier-map` layout mode preserved |
| Governed actions | NOT BROKEN | No changes to authoring actions |
| All 43 slash commands | NOT BROKEN | No changes to context-enrichment.ts |
| All 41 operational commands | NOT BROKEN | No changes to command-executor.ts |
| Embedded modules (510k/PMA/CER) | NOT BROKEN | EmbeddedModuleHosts.tsx preserved |

---

## 7. Remaining Gaps (Honest)

| Gap | Priority | Notes |
|-----|----------|-------|
| LayoutMode still has 93 values (23 active + 70 demoted) | Medium | Demoted values kept for type safety in zenRouteNormalization.ts. Future: extract demoted to string-only lookup. |
| `projects` layout mode serves dual duty (chats + project browser) | Medium | Design doc calls for separate Chats and Projects destinations. Currently merged. |
| `setup` not renamed to `settings` | Low | Cosmetic rename deferred. |
| `artifacts-center` still exists as layout mode | Low | Should fold into Apps or demote. |
| GlobalOperatingShell still rendered | Low | Demoted but not deleted. 74 lines. |
| Warm neutral hex colors in AnaPersistentPanel (~30 instances) | Low | Terracotta accent cleaned. Stone/warm neutral hex values remain. |
| Shell typography still uses Poppins + Lora | Medium | Design doc calls for system sans. Requires broader tailwind.config.ts change. |
| Terracotta still used as accent (now via tokens) | Medium | Design doc calls for neutral accent. Tokens are clean but color unchanged. |
| No responsive viewport testing | High | Browser tooling unavailable. Must test before shipping. |

---

## 8. Net Impact

| Metric | Before | After |
|--------|--------|-------|
| Shell files | 7 (5 active + 2 dormant) | 4 active (ZenApp, ZenRouter, ProjectWorkspaceShell, EmbeddedModuleHosts) |
| Sidebar global items | 6 | 5 |
| Sidebar project tabs | 4 | 0 (project context only) |
| LEGACY_NAV_ID_BY_LAYOUT entries | 42 | 0 (removed) |
| Demoted redirect entries | 27 | 55+ (comprehensive) |
| Hardcoded #D97757 in AnaPersistentPanel | 20 | 0 |
| Lines deleted (net) | — | ~2,700 |
| New governing documents | — | 10 |
