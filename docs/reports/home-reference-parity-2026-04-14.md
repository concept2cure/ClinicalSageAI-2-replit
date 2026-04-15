# UI Convergence Proof — Home Reference Parity (WO-8)

**Date:** 2026-04-14
**Branch:** `concept2cure-v2`
**Reference:** User-provided screenshot of a "ChatGPT AI — Good Afternoon, Jason" home layout (thin icon rail, top bar with New Thread, centered orb + greeting + subtitle + input + 4 example cards).
**Predecessor:** WO-7 (commit `d2d582f`) cleaned the home to a centered Claude-style greeting + input. WO-8 layers reference-parity structure on top: icon rail, top bar, orb, subtitle, example cards.

## Canonical surface

When `layoutMode === 'projects'` (the home) and no embedded module is active, the right pane is structured as a vertical stack:

1. A 48-px **top bar** (brand dropdown on the left; Search chat / Invite / + New Thread on the right).
2. The **AnaPersistentPanel** in full mode rendering the new orb / greeting / subtitle / example-cards empty state above its existing bottom input bar.

The left pane is the `ZenSidebar` in its collapsed icon-rail state (the new default for the entire app).

## Files modified

- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx`
  - Imported `LayoutGrid` (Brain was already imported; duplicate import removed).
  - Rebuilt the collapsed icon rail: Home → Search → New → (divider) → Apps → Artifacts → Intelligence (Brain icon) → (divider) → Settings → Editor → bottom: expand + avatar.
  - Rebuilt the expanded nav (wide mode): same order as rail; `Workspace Home` relabeled `Home`, `Vault` relabeled `Artifacts`, `Intelligence` now uses the `Brain` icon (was the `Settings` gear), and a dedicated `Settings` row added.
  - File header doc comment updated.

- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`
  - Added `FileText`, `BookOpen`, `BarChart2`, `CheckCircle` to lucide imports.
  - Replaced the previous minimal empty state with the full reference layout:
    - Glow orb: `Sparkles` inside a violet/fuchsia gradient bubble with a blurred ring.
    - Greeting: `{greeting}` (now sourced from `ZenApp.homeGreeting`).
    - Subtitle: `What's on your mind?`.
    - Section header: `GET STARTED WITH AN EXAMPLE BELOW`.
    - 4 responsive cards (1 / 2 / 4 up by breakpoint) wired to `setInput` + `inputRef.current?.focus()`.
  - Updated the default placeholder in the full-mode input to `Ask AnA a question or make a regulatory request...`.

- `client/src/concept2cure/ZenApp.tsx`
  - Imported `ChevronDown` from lucide.
  - Added `homeGreeting` memo computing `Good {morning|afternoon|evening}, {firstName}` from the existing `userName`.
  - Changed `sidebarCollapsed` default to `true` (the icon rail is now the default presentation, matching the reference).
  - Wrapped the `layoutMode === 'projects'` render in a flex column containing the new top bar + `AnaPersistentPanel`.
  - Cleaned up dead comparisons (`layoutMode === 'projects'`) inside the fallback AnA render block, which became unreachable after the wrap.

- `config/ui-surface-registry.json`
  - `lastUpdated` bumped to 2026-04-14T18:00:00Z.
  - `convergencePhase` extended with WO-8.
  - `ZenApp.projectsView` rewritten to document the new layout.
  - `ZenSidebar` entry updated: `globalItems: 7`, new destinations list, `defaultState: collapsed-icon-rail`, `iconRailOrder` enumerated, `wo8Changes` explained.

- `CLAUDE.md`
  - New subsection under "Chat-First Design": **Home layout (2026-04-14 WO-8, reference-parity)** documenting the 4-part home structure and rules.

## No new files, no new components

- Zero new component files.
- Zero new routes.
- Zero new backend changes.
- All changes are edits to five existing files; every primitive used (`Button`, `Input`, `Card`-like div) is already registered in `client/src/component-registry.ts`.

## Typecheck

- Baseline errors in the three modified files BEFORE my edits: ~50 pre-existing issues (ProjectOwnership, ReadinessAssessment, AnaMessage, etc.) documented in prior WO-7 proof.
- Errors introduced by my edits: **zero**. Verified by filtering typecheck output for the three files and excluding the same pre-existing classes. The remaining errors in the filtered view (`TS2322 threadId: string`) exist at identical positions in both pre- and post-change trees.
- Two intermediate errors I introduced (duplicate `Brain` import in `ZenSidebar`; `TS2367` from unreachable `layoutMode === 'projects'` comparisons in the fallback AnA block) were fixed in the same sprint.

## No capability loss matrix

| Before WO-8 | After WO-8 |
|---|---|
| Projects list lived in the (expanded) sidebar | Projects list still lives in the sidebar; rail has a Home icon that opens the projects home |
| `+ New` dropdown with 3 options | Icon-rail `+` button + top-bar `+ New Thread` primary button; the 3-option dropdown remains in the expanded sidebar |
| `Vault` (label + nav item) | Same underlying `layoutMode === 'vault'`; label is `Artifacts` everywhere |
| `Intelligence` behind a gear icon | `Intelligence` now has a `Brain` icon; click behavior unchanged |
| `Apps` reachable only via expanded sidebar | Also reachable via the `Apps` icon on the rail |
| `Settings` reachable via the account card menu | Also reachable via the dedicated `Settings` icon on the rail |
| Greeting: "How can I help today?" | Greeting: "Good {time}, {firstName}" with subtitle "What's on your mind?" |
| No example starters on the home | 4 example cards wired to `setInput` + focus |
| Expanded sidebar by default on desktop | Icon rail by default; expanded on demand |

Every path that worked before still works; discoverability has increased.

## Completion gate

- [x] Single canonical surface for the right pane on the home (AnA full mode + the new top bar).
- [x] Single canonical sidebar authority (`ZenSidebar`); no duplicate nav anywhere.
- [x] `ui-surface-registry.json` updated.
- [x] `CLAUDE.md` updated to reflect the new home shape (and the prior slash/mention accuracy fixes from earlier in the session).
- [x] Typecheck: zero new errors.
- [x] Proof report written.
- [x] Zero new files.

## Out of scope (explicitly)

- CORTEX Prime / RIM / Foresight / CSR Intelligence / Predicate Intelligence exposure as Apps tiles — deferred; hidden capability audit stands in `docs/reports/` (note: the inventory audit was reported in the conversation; persisting it as a standalone doc is a separate follow-up).
- Expansion of `AppsPage` from 8 to 24 cards — out of scope for WO-8; the `Apps` icon already routes to the existing AppsPage.
- Persona-adaptive UI — explicitly declined (gap-first).
- Chat-side slash commands / `@`-mentions — explicitly declined (no-rebuild rule).
