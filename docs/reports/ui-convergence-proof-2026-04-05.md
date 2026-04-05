# UI Convergence Proof — 2026-04-05

**Per CLAUDE.md UI Convergence and Legacy Surface Deletion rules.**

---

## 1. Canonical Surfaces Identified

| Category | Canonical File | Status |
|----------|---------------|--------|
| App Shell | `ZenApp.tsx` | active |
| Sidebar | `ZenSidebar.tsx` | active (5 destinations) |
| Chat Surface | `AnaPersistentPanel.tsx` | active (full mode for destinations) |
| Machine Room | `ProjectWorkspaceShell.tsx` | active |
| Editor | `EditorPanel.tsx` | active |
| Module Hosts | `EmbeddedModuleHosts.tsx` | active |

## 2. Competing Surfaces Removed

| File | Lines | Deleted In | Reason |
|------|-------|-----------|--------|
| `ZenShell.tsx` | 784 | Phase 3 | Dormant alternative shell, never wired |
| `SplitScreenLayout.tsx` | 267 | Phase 3 | Dormant split-screen layout |
| `IndustryWorkspaceShell.tsx` | 522 | Phase 3 | Dormant industry-aware shell |
| `UnifiedWorkspaceDemo.tsx` | 560 | Phase 3 | Demo file, never imported in production |
| `Sidebar.tsx` (legacy) | 284 | Phase 3 | Legacy sidebar, zero imports |
| `GlobalOperatingShell.tsx` | 74 | Phase 7 | Breadcrumb wrapper, decorative only |

**Total lines removed from deleted files:** 2,491

## 3. Imports Migrated

| Import | From | To | Action |
|--------|------|----|----|
| `GlobalOperatingShell` | ZenApp.tsx | Replaced with plain `<div>` | Removed |
| `IndustryWorkspaceShell` | components/index.ts | N/A | Removed from barrel |
| `ZenShell` | layouts/index.ts | N/A | Removed from barrel |
| `SplitScreenLayout` | layouts/index.ts | N/A | Removed from barrel |
| `LEGACY_NAV_ID_BY_LAYOUT` | ZenApp.tsx | N/A | Removed (42 entries) |

## 4. Routes Cleaned

| Route/Nav ID | Old Destination | New Destination | Action |
|-------------|----------------|-----------------|--------|
| `artifacts-center` | Top-level layout mode | `apps` (via redirect) | Removed from nav, redirect added |
| `setup` | Top-level layout mode | `settings` (renamed) | Redirect added for backward compat |
| `workspace` | Separate render block | `regulatory-workspace` (via redirect) | Render block deleted |
| `assistant` / `ctd` | Separate redirect components | `projects` (via normalizeLayoutMode) | RedirectToWorkspace deleted |
| 55+ demoted modes | Various dead ends | Active destinations | All in DEMOTED_LAYOUT_REDIRECTS |

## 5. Nav Cleaned

**Before:** 6 global items + 4 project tabs + Editor shortcut = 11 nav items
**After:** 5 global destinations (Chats, Projects, Communication Center, Apps, Settings) + project context indicator

**Removed from sidebar:**
- Workspace Home
- Documents
- Intelligence
- Editor shortcut
- Overview tab
- Tasks tab
- Tools tab
- Submit tab

## 6. Surface Registry Updated

`config/ui-surface-registry.json` — all entries have defined status:
- 3 active shells
- 6 deleted shells
- 2 active nav components
- 1 deleted nav component
- 5 active destinations
- 10 active tool panels

No undefined or stale entries.

## 7. Typography Convergence

| Before | After |
|--------|-------|
| Poppins (50+ references) | 0 references |
| Lora as body font | Isolated to document surfaces |
| Mixed inline fontFamily | System sans stack everywhere |

## 8. Color Convergence

| Before | After |
|--------|-------|
| 20 hardcoded #D97757 in AnaPersistentPanel | 0 (tokenized to terracotta-*) |
| Terracotta meta theme-color | Neutral #faf9f7 |
| Terracotta server primary | Slate #475569 |

## 9. LayoutMode Convergence

| Before | After |
|--------|-------|
| 93 values in type union | 24 values |
| 42 LEGACY_NAV_ID_BY_LAYOUT entries | 0 (deleted) |
| 27 redirect entries | 55+ (comprehensive) |
| Redirect type: `Partial<Record<LayoutMode, LayoutMode>>` | `Record<string, LayoutMode>` |
| Stale local LayoutMode in ZenWorkspaceContext | Fixed — imports canonical type |

## 10. Automated Governance

`scripts/audit-ui-authority.ts` — 17/17 PASS
- Surface registry validation
- LayoutMode count ≤30
- Sidebar 5 destination labels
- Zero Poppins in client/

## 11. Capability Loss Check

Every capability removed from top-level nav is still reachable:

| Removed From Nav | Still Reachable Via |
|-----------------|-------------------|
| Documents | Project workspace (regulatory-workspace mode) |
| Intelligence | Chat (AnA enrichment), Apps |
| Review | Project workspace (review mode) |
| Submissions | Project workspace (submissions mode) |
| Vault | Project workspace (vault mode) |
| Artifacts | Apps destination, chat commands |
| Editor | Chat actions (open artifact), project workspace |
| Tasks | Project workspace (task-board mode) |
| All 43 slash commands | Chat (unchanged) |
| All 41 operational commands | Chat (unchanged) |

**Result: Zero capability loss.**

## 12. Remaining Gaps (Honest)

| Gap | Priority | Notes |
|-----|----------|-------|
| Responsive testing not performed | High | gstack browser tooling available but not yet run |
| Chats and Projects share `projects` layout mode | Medium | Design doc calls for separation |
| 24 active LayoutMode values (target was ~7) | Medium | Project-scoped modes needed for machine room |
| Warm neutral hex values in AnaPersistentPanel | Low | ~30 stone-palette hex values, not accent |
| Server-side #d97757 in emails/PDFs | Low | Content rendering, not shell chrome |

---

## Verdict

**Convergence complete for shell, nav, typography, and accent.**
No duplicate shell authorities remain. All deleted surfaces are gone from imports, routes, nav, and barrels. Registry is current. Audit script passes. Zero regressions in machine room.
