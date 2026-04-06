# UI CSS Stabilization Sprint — Proof Pack

**Date**: 2026-04-03
**Branch**: `concept2cure-v2`
**Viewports tested**: 1366×768, 1440×900

---

## Summary

CSS triage and shell stabilization sprint. Reduced `client/src/index.css` from **3190 lines → 1101 lines** (65% reduction, 2089 lines removed). Verified shell structure, center-pane gating, sidebar layout, and ProjectWorkspaceShell bar stacking. No visual regressions detected.

---

## Phase 1 — CSS Triage & Amputation

### Removed (~2089 lines)

- **SharePoint `sp-*` classes** (~580 lines) — orphaned, never used in React components
- **Duplicate `:root` token blocks** — collapsed to single canonical Anthropic color palette
- **Broad background overrides** — `html, body, #root, main, section` paint hack removed
- **`p, li, span` color overrides** — removed global text color pollution
- **Glass morphism / card-3d / bento grid** (~200 lines) — decorative CSS from prior design phase
- **FAB / mobile nav / swipe / floating labels** (~150 lines) — mobile-first experiments
- **Toggle switches** (~100 lines) — custom toggle CSS replaced by Radix Switch
- **Duplicate gradients / shadows / scroll classes** — consolidation pass

### Retained (1101 lines)

| Section                                           | Purpose                           |
| ------------------------------------------------- | --------------------------------- |
| `@import zen.css` + Tailwind directives           | Design system + utility framework |
| Motion `:root` tokens + `prefers-reduced-motion`  | Accessible animation              |
| Radix Switch/Select/Popover fixes                 | Component library compatibility   |
| AnA Chat response typography (`.ana-response`)    | Claude-style response rendering   |
| Single canonical `:root` color palette            | Anthropic stone/cream tokens      |
| Base element styles (body, #root, font families)  | Minimal global resets             |
| Typography utility classes                        | `.text-xs`, `.text-sm` utilities  |
| Keyframes (fadeIn, slideUp, pulse, shimmer, spin) | Standard animation library        |
| Radix tab / dropdown / select styling             | Component polish                  |
| Scrollbar / skeleton loader / spinner             | Loading state infrastructure      |
| ProseMirror / TipTap editor styles                | Document editor                   |
| Markdown content styles                           | Chat + document rendering         |
| Print styles                                      | Output formatting                 |
| CER v2 tab navigation                             | Feature-specific polish           |

---

## Phase 2 — Shell Structure Verification

### ZenApp Layout

- **Outer shell**: `<div className="zen flex h-screen w-full">` → ZenSidebar + GlobalOperatingShell
- **16 layoutMode branches**: projects, project-home, workspace, regulatory-workspace, vault, documents, dossier-map, section-workspace, review, submissions, apps, artifacts-center, setup, biostatistics, report-engine, precedent-intelligence
- **Center-pane gating**: ✅ Strict if/else — only ONE layoutMode renders at a time
- **No duplicate surfaces**, no overlapping center experiences

### ZenSidebar Layout

- **Collapsed**: w-14 (56px) — icon-only
- **Expanded**: w-[260px] — full labels
- **Fixed on mobile**, static on desktop
- **6 global nav items**: New, Search, Projects, Workspace Home, Documents, Intelligence
- **6 workspace shortcuts**: Tools, Editor, Intelligence, Review & Verify, References, Submit & Export
- **Context-dependent project block**: Overview, Tasks, Tools, Submit (only when project active)

### ProjectWorkspaceShell Bars

- **Default `showContextBars = false`**: Only breadcrumb (h-10) + workflow (h-8) = **72px** visible
- **Remaining bars**: Work modes, Context band, Dossier modules, Project nav — all inside collapsible `max-h-48`/`max-h-0` container
- **Conditional bars**: Pending move banner, cut-blocked error — only during active operations
- **Verdict**: Bar overhead is acceptable. Collapsible system already in place.

### GlobalOperatingShell

- ~50 lines, minimal breadcrumb wrapper
- `flex-1 flex flex-col min-w-0 min-h-0 bg-[#faf9f7]`
- Breadcrumb shows only for: regulatory-workspace, documents, report-engine, submissions, review, dossier-map

---

## Phase 3 — Token Discipline

- **Single `:root` block** in index.css with canonical Anthropic palette
- **Inline `<style>` block** in ZenApp.tsx defines zen CSS variables: --zen-canvas (#FAFAF9), --zen-canvas-muted (#F5F5F4), --zen-canvas-elevated (#FFFFFF), --zen-ink (#18181B), --zen-ink-muted (#71717A), --zen-border (#E4E4E7), --zen-accent (#d97757)
- **zen.css** (799 lines): Full design system with shell, sidebar, main, content tokens
- **No conflicting token definitions** remaining

---

## Viewport Acceptance

| Viewport | Login      | Authenticated Shell      | Verdict |
| -------- | ---------- | ------------------------ | ------- |
| 1366×768 | ✅ Renders | ✅ Sidebar + cards + AnA | Pass    |
| 1440×900 | ✅ Renders | ✅ Sidebar + cards + AnA | Pass    |

### Screenshots

- Before: `/tmp/ui-before/login-1366.png`, `/tmp/ui-before/login-1440.png`, `/tmp/ui-before/shell-1366.png`, `/tmp/ui-before/shell-1440.png`
- After: `/tmp/ui-after/login-1366.png`, `/tmp/ui-after/shell-1440.png`

---

## Git Stats

```
client/src/index.css | 599 insertions, 2688 deletions
```

No other CSS files modified. Shell components (ZenApp.tsx, ZenSidebar.tsx, ProjectWorkspaceShell.tsx, GlobalOperatingShell.tsx) verified but not modified.
