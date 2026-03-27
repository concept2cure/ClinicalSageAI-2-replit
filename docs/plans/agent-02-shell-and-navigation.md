# Agent 02 — Shell & Navigation Architecture

**Date:** 2026-03-27

---

## 1. Approved Global Shell (6 Items)

```
GLOBAL LEFT RAIL
─────────────────
  [Logo]
  ─────
  + New
  🔍 Search
  📁 Projects
  ✨ Apps
  📄 Artifacts
  ⚙ Setup
  ─────
  [Account]
```

| Item | Icon | Nav ID | Action |
|------|------|--------|--------|
| **New** | `Plus` | `new` | Opens dropdown: New Chat, New Project, New Artifact |
| **Search** | `Search` | `search` | Opens command palette / search overlay (reuse `ZenCommandPalette` + `GlobalDocumentSearch`) |
| **Projects** | `FolderOpen` | `projects` | `setLayoutMode('projects')` |
| **Apps** | `Sparkles` | `apps` | `setLayoutMode('apps')` — new |
| **Artifacts** | `FileStack` | `artifacts-center` | `setLayoutMode('artifacts-center')` — new |
| **Setup** | `Settings` | `setup` | `setLayoutMode('setup')` — new |

### What Leaves the Global Rail

| Current Global Item | Disposition |
|---------------------|-------------|
| Dossier Map | → sub-view inside Work tab |
| Documents | → Work tab (project-local) |
| Review | → Review tab (project-local) |
| Biostats | → Apps > Specialist Studios |
| Submissions | → Submit tab (project-local) |

---

## 2. Contextual Project Block

When `activeProjectId` is set, the sidebar shows a **Current Project Block** between global nav and project list:

```
GLOBAL NAV (6 items)
─────────────────────
CURRENT PROJECT BLOCK
  Project Name
  [510(k)] badge
  ─────
  Overview
  Work
  Vault
  Review
  Submit
  ─────
  [Switch project]
─────────────────────
PINNED PROJECTS
RECENT PROJECTS
```

### Collapsed Mode

```
[Logo]
───
[+] New
[🔍] Search
[📁] Projects
[✨] Apps
[📄] Artifacts
[⚙] Setup
═══════════════
[🏠] Overview
[✏️] Work
[📦] Vault
[✓] Review
[📤] Submit
═══════════════
[Avatar]
```

Project tabs only appear when a project is active. The separator makes global vs project-local visually distinct.

---

## 3. Global Destination Pages

### Projects Page

Already exists as `layoutMode: 'projects'` which renders `ProjectSwitcher`. Preserve current behavior: project cards with submission type badges, star/archive, create new project.

### Apps Page (NEW)

Full-page launcher. Three card groups. Details in Agent 05.

**Renderer**: New `AppsPage.tsx`
**Layout mode**: `'apps'`

### Artifacts Page (NEW)

Global governed outputs browser. Tab filters + search + cards.

**Renderer**: New `ArtifactsPage.tsx`
**Layout mode**: `'artifacts-center'`
**API**: `GET /api/concept2cure/artifacts` (already exists)

### Setup Page (NEW)

Full-page settings. Content extracted from `ZenSettings.tsx` modal.

**Renderer**: New `SetupPage.tsx`
**Layout mode**: `'setup'`

---

## 4. Project Shell (5 Tabs)

| Tab | Layout Mode | Renderer | Source |
|-----|-------------|----------|--------|
| **Overview** | `project-home` | `ProjectHomeDashboard` (enhanced) | Exists, needs enrichment |
| **Work** | `documents` | `ProjectWorkspaceShell` | Exists as-is |
| **Vault** | `vault` | New `VaultPage` | Compose from `ProjectFileTree` |
| **Review** | `review` | `ReviewReadiness` | Exists (7-tab surface) |
| **Submit** | `submissions` | `SubmissionReadiness` | Exists |

### Sub-views within Work

These are internal modes, not sidebar items:
- Dossier Map (`dossier-map`)
- Section Workspace (`section-workspace`)
- Editor (`editor`)
- Transform Canvas (Phase 4 overlay)

---

## 5. Where AnA Lives

**Rule**: AnA is present on every screen. One identity. No Dr. Sage.

| Context | AnA Mode | Placement |
|---------|----------|-----------|
| Global (Projects, Apps, Artifacts, Setup) | Compact input bar at bottom | Below main canvas |
| Project Overview | Full chat or compact, context-aware | Below or beside main canvas |
| Work tab | Full mode with authoring context | Center pane (as today in regulatory-workspace) |
| Vault / Review / Submit | Compact input bar | Bottom of page |
| First-run onboarding | Guide mode | Inline guidance messages |

**Implementation**: Keep `AnaPersistentPanel` rendering in ZenApp but simplify to one render location with `mode` prop driven by `layoutMode`.

---

## 6. Search Behavior

Search opens as an overlay (not a page), triggered from:
- Global rail Search icon
- ⌘K keyboard shortcut
- Search field in expanded sidebar

Search finds:
- Projects (name, type, sponsor)
- Artifacts (title, CTD section, status)
- Files (name, folder)
- Apps (name, category)
- Recent chats (title)

**Implementation**: Merge `ZenCommandPalette` (commands + actions) and `GlobalDocumentSearch` (artifact search) into one unified overlay with result groups.

---

## 7. Center Pane Behavior

The center pane should always feel calm — one thing at a time.

| When | Center Shows |
|------|-------------|
| No project selected | Projects page (or last global destination) |
| Project selected, Overview | Project summary + next actions |
| Project selected, Work | 3-pane workspace (files/dossier/editor/governed panel) |
| Project selected, Vault | File browser with upload + search |
| Project selected, Review | 7-tab review surface |
| Project selected, Submit | Readiness checklist + export |
| Apps (no project) | App launcher cards |
| Artifacts (global) | Artifact browser with filters |
| Setup | Settings sections |

---

## 8. Why This Is Better for Humans

**Before**: 11+ items competing in sidebar (New chat, Projects, Dossier, Documents, Review, Biostats, Submissions, Settings, plus project list). User must understand which are global vs project-local. Specialist tools mixed with workflow stages.

**After**: 6 calm global items. Project tabs only appear when relevant. Clear separation: "Where am I in the platform?" (global rail) vs "Where am I in my project?" (project tabs). Apps and Artifacts are findable destinations instead of hidden panels/modals.
