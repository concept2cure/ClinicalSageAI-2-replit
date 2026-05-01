# Shell migration analysis — legacy shell → MDX shell

Companion to `UI_MIGRATION_MAP_2026-05-01.md`. Concrete mapping of every load-bearing shell component currently imported by ZenApp, against what the MDX shell already provides. Drives Phase 3 Action D: replace the shell layer.

---

## Inventory

| Legacy component | LOC | What it does | MDX equivalent |
|---|---:|---|---|
| `components/sidebar/ZenSidebar` | 1,327 | Project sidebar with chat history, projects, navigation | **MDX `Rail`** (~similar) |
| `components/command/ZenCommandPalette` | 718 | ⌘K palette (commands, projects, surfaces) | **MDX `CmdK`** (smaller, surfaces-only today) |
| `components/projects/ProjectSwitcher` (NewProjectModal) | 1,135 | New-project creation modal, project switcher dropdown | **none** — needs Claude Design kit |
| `components/workspace/ProjectConfigPanel` | 980 | Project settings drawer | **none** — needs Claude Design kit |
| `components/workspace/ProjectHeaderBar` | 128 | Project topbar (title + actions) | **MDX `TopBar`** (different content but same role) |
| `components/workspace/ProjectWorkspaceShell` | 3,367 | The whole project workspace (sidebar + main + AnA panel + breadcrumbs + tab bar) | **MDX `App` shell** (rail + topbar + tabbar + ana panel + main) |
| `components/shell/EmbeddedModuleHosts` | 267 | Bridge from layoutMode to MDX-iframe (510k/PMA/CER) | **already obsolete** — Phase 2 swap removed iframes |
| `components/shell/GlobalOperatingShell` | 73 | Global app chrome | partially redundant with MDX shell |
| `components/ErrorBoundary` | 269 | React error boundary | infrastructure, **keep** |

**Total condemned shell LOC: 8,264** across 9 files. Plus ZenApp.tsx itself is 2,119 lines and is the orchestrator that ties them together.

---

## What can move now without a Claude Design kit

### a) `EmbeddedModuleHosts` — delete now

Phase 2 swapped the `BundleSurfaceFrame` iframes for the React `MdxRoute`. The `EmbeddedModuleHosts` was the bridge that wrapped the iframes; it has no live consumers post-Phase-2. Verify and delete.

### b) `GlobalOperatingShell` — likely redundant

Only 73 lines; needs an audit pass. If MDX shell already paints the chrome it claims, delete. Otherwise migrate the unique behavior into MDX.

### c) `ProjectHeaderBar` — minimal divergence

128 lines. Mostly identical to MDX's `TopBar`. The migration is "make MDX TopBar accept the project context props the legacy ProjectHeaderBar exposes." Tiny enhancement, not a rebuild.

---

## What needs a Claude Design kit before retirement

### d) `ZenSidebar` (1,327 LOC)

Bigger than MDX `Rail` because it includes:
- Project list with switcher
- Chat history per project
- Recent activity
- Pinning
- Color accents

MDX `Rail` is workstream-tab-only (k510 / pma / cer / etc.). To replace ZenSidebar entirely, MDX Rail needs an extension kit that adds:
- A "Projects" surface above the workstream tabs
- Per-project chat history threading
- Pin/recent affordances
- Project color accent treatment

**Brief required.** Design the unified rail.

### e) `ZenCommandPalette` (718 LOC)

MDX `CmdK` only knows about workstream tabs (~150 LOC). To replace ZenCommandPalette, MDX CmdK needs:
- Project search results
- Conversation search
- Slash-command catalog (run-tool routing)
- "Create new project" inline action
- Recent activity surface

**Brief required.** Design the universal palette.

### f) `ProjectSwitcher` / NewProjectModal (1,135 LOC)

No MDX equivalent. Required when a user clicks "New project" or switches active project from the rail. Heavy form: name, submission type, region, agency, target date, custom instructions, Part-11 metadata.

**Brief required.** Design the project-creation flow.

### g) `ProjectConfigPanel` (980 LOC)

No MDX equivalent. Settings drawer for the active project: members, ownership, knowledge base, custom instructions, audit trail, danger zone.

**Brief required.** Design the project-settings surface.

### h) `ProjectWorkspaceShell` (3,367 LOC)

The biggest piece. Wraps:
- ZenSidebar (rail) ← gated on (d)
- ProjectHeaderBar (topbar) ← (c) handles
- A center pane that conditionally renders eCTD, MDX 510k/PMA/CER, ana_ri, project-home
- AnA persistent panel
- Breadcrumb bar
- Section deep-linking

This is essentially a project-aware version of MDX `App.tsx`. Once (d), (e), (f), (g) ship and MDX `App` accepts a project-id-routed mode, this whole component subsumes into MDX.

**Pattern:** MDX `App` already accepts `initialNav` + `projectName` props. Extend to also accept a project-context handle so non-MDX surfaces (eCTD coauthor, ana_ri) render inside the MDX shell instead of inside ProjectWorkspaceShell.

---

## Migration sequence

### Slice 1 — immediate (no kit needed)

1. Delete `components/shell/EmbeddedModuleHosts.tsx` if zero consumers post-Phase-2 (verify first).
2. Audit `components/shell/GlobalOperatingShell.tsx` — delete if redundant with MDX shell.
3. Inline `ProjectHeaderBar`'s project-context props into MDX `TopBar`.

Estimated effort: 1 day. Net: ~270 LOC deleted, MDX TopBar slightly enhanced.

### Slice 2 — gated on Claude Design (project shell kit)

Brief Claude Design for a single comprehensive kit covering:

**Project shell kit (combines d + e + f + g + h):**
- Universal rail: workstream tabs + project list + chat history + pin/recent
- Universal command palette: workstreams + projects + conversations + tools
- New-project flow
- Project-settings drawer
- The orchestrator that conditionally renders MDX, eCTD coauthor, ana_ri inside the unified shell, project-aware

Once shipped → port into MDX `App`. Replace every consumer. Delete the legacy 8 components. ~8,000 LOC retired.

**Estimated effort:** 1 week design + 2 weeks port + 1 week migration = 4 weeks total.

---

## Decisions needed for the brief

1. **One kit or several?** A single project-shell kit (5,000 LOC of design and port work) vs. four smaller kits (rail, palette, project-create, project-settings) shipped separately. Recommendation: **one kit**, because the shell is highly inter-connected (palette navigates to projects which open in the rail, etc.).

2. **eCTD coauthor and ana_ri integration:** does the unified shell wrap them, or do they continue to render outside? Recommendation: **wrap them** — same chrome everywhere, no per-surface re-implementation.

3. **Persistence model:** the MDX shell currently uses `localStorage` for activeNav, anaOpen, etc. The unified shell needs server-side per-user persistence (multi-device). Backend gap.

---

## What ships in Phase 3 (revised)

| Slice | Gating | Effort |
|---|---|---|
| Slice 1 — immediate cleanup | none | 1 day |
| Slice 2 — project shell migration | Claude Design kit + backend persistence | 4 weeks |
| Capability-surface migrations (AI letter, claim-evidence, portfolio, etc.) | Per-kit | parallel, 6 weeks total |

---

## Action items from this analysis

1. **I'll execute Slice 1 in the next commit** — delete `EmbeddedModuleHosts`, audit and likely delete `GlobalOperatingShell`, inline `ProjectHeaderBar` into MDX `TopBar`.
2. **Author the project-shell design brief** (lane 1) — combines d, e, f, g, h into a single brief Claude Design can work from.
3. **Backend brief: per-user shell persistence** — for activeNav/anaOpen/recent-projects multi-device persistence. Small CRUD on a new `user_ui_state` table.
