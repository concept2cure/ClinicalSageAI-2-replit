# UI Convergence Proof — Claude.ai Home Layout (WO-7)

**Date:** 2026-04-14
**Branch:** `concept2cure-v2`
**Scope:** `layoutMode === 'projects'` (the Projects / "Intelligence home" surface) and the AnaPersistentPanel empty state.
**Trigger:** User-reported clutter on the right pane. Directive: "Replica of the Claude screen but for my product. Do not want to see anything on the right panel but the clean AnA 1.0 Dialogue box."

## Canonical surface

The Claude.ai home layout is now the **single canonical authority** for the right pane when no project is selected:

- **Left rail:** `ZenSidebar.tsx` — unchanged. Single navigation authority for Projects, Chats, Reports, Communication Center, Apps, Settings, and the project browser.
- **Right pane:** `AnaPersistentPanel` (`mode="full"`) — renders a clean centered greeting (Sparkles icon + `text-[38px]` headline sourced from the `greeting` prop) plus the bottom input bar. Nothing else.

## Superseded surfaces

### 1. Projects right-pane grid (ZenApp.tsx lines 3391–3760)

**Classification:** `deleted`.

**What was there:**
- "Projects" page title + search input + "+ New project" button
- "CONTINUE RECENT WORK" hero card
- "Pinned" / "Recent" / "Project directory" grid sections
- Supporting helpers: `sortedProjects`, `filteredProjects`, `continueProject`, `SUBMISSION_BADGE_MINI`, `fallbackBadge`, `isPinned`, `updatedMs`, `pinnedProjects`, `recentProjects`, `generalProjects`, `relTime`, `openProjectHome`, `openProjectHomeWithLastConversation`, `renderProjectSection`

**Action taken:** 370-line conditional block removed with `sed -i '3391,3760d'`. Orphaned state (`projectsSearchQuery`) removed. Result: `layoutMode === 'projects'` now falls through directly to the `AnaPersistentPanel` render below.

### 2. AnA empty-state ChatGPT-style inner sub-sidebar (AnaPersistentPanel.tsx lines 4128–4206)

**Classification:** `deleted`.

**What was there:**
- A 260-px inner `<aside>` rendering a duplicate nav ("AnA 1.0" header, "New Chat" button, Projects / AnA Vault / Collaboration Center / Apps / Past conversations / User Account)
- A top-right header bar with Share and Branches buttons
- A centered "AnA 1.0" label

**Why it violated convergence:** This was a second sidebar authority rendered inside the main shell whose own left rail (`ZenSidebar`) already owns navigation. The nav items in the inner aside did not match the canonical destinations.

**Action taken:** Replaced with a single centered div:

```tsx
<div className="h-full flex items-center justify-center px-6 bg-white">
  <div className="max-w-2xl w-full -mt-24">
    <div className="flex items-center justify-center gap-4">
      <Sparkles className="w-8 h-8 text-[#D97757] flex-shrink-0" aria-hidden="true" />
      <h1 className="text-[38px] leading-[1.15] font-medium text-[#141413] tracking-tight">
        {greeting || 'How can I help today?'}
      </h1>
    </div>
  </div>
</div>
```

Also removed the 280-px left offset that had been compensating for the deleted inner sub-sidebar (line ~4878: `ml-[280px] mr-6 max-w-4xl` → removed). The bottom input bar now centers correctly in the full-width pane.

Orphan imports removed: `Share2`, `GitBranch`, `User` (lucide-react).

## Component signature changes

- `AnaPersistentPanel` now destructures `greeting` from its props (was declared on the type but never read at runtime). No new props introduced — this uses the existing `greeting?: string` prop that ZenApp already passes from `platformGreeting?.text`.

## Registry updates

`config/ui-surface-registry.json`:
- `lastUpdated` → `2026-04-14T00:00:00Z`
- `convergencePhase` appended: "WO-7 Claude.ai home convergence (projects-grid deleted, AnA empty-state sub-sidebar deleted, single centered greeting)"
- `shells.ZenApp.tsx.projectsView` rewritten to document the deletion
- `chat.AnaPersistentPanel.tsx.emptyState` added to document the new Claude-style empty state

## No Capability Loss verification

Before deletion, the user could reach these outcomes from the projects grid:

| Capability | Replacement path |
| --- | --- |
| See list of my projects | Left `ZenSidebar` — "Projects" list is always visible, including pinned + recent |
| Continue most recent project | Sidebar project list sorted by `lastUpdated`; one click opens project-home with latest conversation. Also: ask AnA "resume my last project" |
| Start a new project | Sidebar "+ New" button (still wired to `setNewProjectOpen(true)` at lines 2224 / 2241 / 2258); AnA slash command |
| Search projects | Sidebar has its own project search input (lines 1121–1180 of `ZenSidebar.tsx`) |
| See project badge / submission type | Rendered on each sidebar project entry |
| Preview recent conversation counts | Rendered on sidebar project entries |

Every capability the grid provided is reachable with fewer clicks (one vs. two) through the canonical sidebar or conversationally through AnA.

## Completion gate

- [x] One canonical authority for the `layoutMode === 'projects'` right pane (`AnaPersistentPanel` full mode)
- [x] Registry updated (`config/ui-surface-registry.json`)
- [x] No duplicate sidebar authority remaining inside `AnaPersistentPanel` empty state
- [x] Imports cleaned (`Share2`, `GitBranch`, `User` removed from AnaPersistentPanel; `projectsSearchQuery` state removed from ZenApp)
- [x] No orphaned variables referenced (greps confirm)
- [x] Superseded surfaces deleted in code (not dead-coded, not flagged, not hidden)
- [x] Proof report written (this file)
- [x] Zero capability loss verified above

## Files changed

- `client/src/concept2cure/ZenApp.tsx` — deleted 370-line projects grid block; removed orphaned `projectsSearchQuery` state
- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` — replaced 79-line empty-state sub-sidebar with a clean centered greeting; destructured `greeting` prop; removed `ml-[280px]` input offset; dropped 3 orphan icon imports
- `config/ui-surface-registry.json` — documented the convergence
- `docs/reports/ui-convergence-proof-2026-04-14.md` — this report

## Out of scope (not touched)

- `layoutMode === 'project-home'` (project selected) still renders `AnaPersistentPanel` + `ProjectKnowledgePanel` as before
- `ZenSidebar.tsx` structure unchanged — it already has a Claude-like shape
- No new routes, no new components, no new props
