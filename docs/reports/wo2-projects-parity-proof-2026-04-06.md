# WO-2 Projects View Parity Proof

**Date:** 2026-04-06

## Projects List View (layoutMode === 'projects')
- Title "Projects" left-aligned, `text-2xl font-semibold text-stone-900`
- "+ New project" button top-right, black pill (`bg-stone-900 text-white rounded-full`)
- Full-width search bar with search icon, `rounded-xl`
- 2-column responsive card grid (`grid grid-cols-1 sm:grid-cols-2 gap-4`)
- Each card: white bg, `border-stone-200`, `rounded-xl`, `hover:shadow-sm`
  - Project name: `text-[15px] font-semibold text-stone-900`
  - Description: `text-sm text-stone-500 line-clamp-2`
  - "Updated X ago": `text-xs text-stone-400`
- Sorted by last activity (most recent first)
- Empty state: centered message + "Create your first project" button
- No badges, no status dots, no colored pills, no submission type labels
- Black and white (stone palette) only
- AnaPersistentPanel excluded from `projects` layout to prevent overlap

## Project Landing (layoutMode === 'project-home')
- "← All projects" back link at top (`text-sm text-stone-500 hover:text-stone-700`)
  - Clears `activeProjectId` and sets `layoutMode` to `'projects'`
- Project name as hero h1 (`text-xl font-semibold text-stone-900`)
- Description in gray below (`text-sm text-stone-500`)
- Composer (via AnaPersistentPanel) below — provides greeting, suggested actions, conversation
- Right rail: `ProjectKnowledgePanel` (Memory/Instructions/Files equivalent) — preserved at `w-72 xl:w-80`
- Document canvas panel still available when artifact is active

## What Was Removed from ProjectHomeDashboard
- Search + Settings icon buttons from header
- Recent documents pill strip (3 recent docs + "more" link)
- Module 3 readiness progress bar strip
- Readiness score progress bar
- ProjectComposeBar (action mode chips)
- Conversation starter prompt buttons (AnaPersistentPanel handles this)
- Loading skeleton grid
- All intelligence dashboard hooks (`useIntelligenceDashboard`, `useModule3BuildState`)
- All unused icon imports (12 icons removed)

## What Was Preserved
- All project data hooks and state management in ZenApp.tsx (untouched)
- `onNavigate`, `onOpenConfig`, `onSuggestedPrompt`, `onOpenSearch`, `onOpenArtifact` props (kept in interface for backward compat)
- Right rail ProjectKnowledgePanel
- Document canvas panel (active artifact view)
- Sidebar (unchanged from WO-1)
- AnaPersistentPanel full-mode for project-home (unchanged)

## Color Audit
```
$ grep -n "blue-\|green-\|red-\|amber-\|violet-\|indigo-" ProjectHomeDashboard.tsx
(no output — stone palette only)
```

## Files Modified
- `client/src/concept2cure/ZenApp.tsx` — rebuilt projects grid, excluded AnaPersistentPanel from projects layout, wired onBackToProjects
- `client/src/concept2cure/components/workflow/ProjectHomeDashboard.tsx` — rewritten to back link + hero title + description
- `config/ui-surface-registry.json` — updated with WO-2 notes
