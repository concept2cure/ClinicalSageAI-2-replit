# WO-2 Home Canvas Proof

**Date:** 2026-04-06

## What Changed
- Removed ~365-line project cards grid from center canvas (ZenApp.tsx lines 3253-3617)
  - Included: Continue Project hero card, Pinned/Recent/General sections, search bar, "New project" button
  - All rendered as dashboard-style cards — the exact pattern the design constitution forbids
- Simplified greeting in AnaPersistentPanel.tsx:
  - Removed sparkle icon in dark circle (`w-10 h-10 rounded-full bg-stone-800`)
  - Removed "AnA 1.0 Regulatory Intelligence" uppercase label
  - Increased greeting from `text-lg font-semibold` to `text-2xl font-medium`
  - Added contextual subtitle: "Ask me anything — draft a section, check readiness, or find regulatory precedents."
  - Changed suggested actions from `grid grid-cols-1 sm:grid-cols-2` to `flex flex-wrap justify-center` for natural flow
- Composer placeholder unchanged — already correct: "Message AnA — type / for commands, @ for apps..."

## What the Home Screen Now Shows
1. Greeting: "Good morning, Chief Smith" (large, centered, calm)
2. Subtitle: "Ask me anything — draft a section, check readiness, or find regulatory precedents."
3. Project context badge (when project active)
4. Authoring context strip (when editing)
5. Suggested action chips (flexible wrap layout, up to 6)
6. Composer at bottom

## What Was Preserved
- Project context badge (shows when project active)
- Authoring context strip (shows when editing)
- Suggested actions (regulatory-specific prompts)
- All composer functionality (@app, /commands, drag-drop)
- Project list in sidebar (unchanged from WO-1)
- All project data hooks, state management, and APIs (untouched)
- AnaPersistentPanel renders in `mode="full"` for `layoutMode === 'projects'` via catch-all at line ~3700

## Where Projects Are Still Accessible
- Sidebar Zone C: Pinned and Recent projects with search
- Sidebar Zone B: "Projects" destination
- Project landing: opens when clicking a project in sidebar
- "+ New" dropdown in sidebar Zone A: includes "New Project"

## Files Modified
- `client/src/concept2cure/ZenApp.tsx` — removed project cards grid block
- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` — simplified greeting
- `config/ui-surface-registry.json` — updated ZenApp.tsx entry
