# Repo-root CLAUDE.md pointer

Paste the block below at the **very top** of `concept2cure-v2/CLAUDE.md` (above any existing content). This is the only line that makes the design system visible to Claude Code sessions running against the repo.

Without this pointer, Claude Code reads the repo's existing instructions, never opens `design-system/`, and falls back on the legacy UI. That's the failure mode you want to prevent.

---

## Snippet to paste

```markdown
# Concept2Cure.RI — UI is owned by the design system

> **Read `design-system/CLAUDE.md` before touching any UI code.**
> The design system at `design-system/` is the **single source of truth** for every Concept2Cure.RI surface — home, projects, artifacts, MDX workstream, auth, editor, admin.
> Anything in this file or in `client/src/concept2cure/**` that contradicts the design system is **legacy and superseded**.

## Required read order, every session

1. `design-system/CLAUDE.md` — phase status pointer, non-negotiables, token-import contract
2. `design-system/HANDOFF.md` — executable per-surface brief + acceptance checklists
3. `design-system/README.md` — voice, visual foundations, iconography
4. `design-system/colors_and_type.css` — canonical tokens (must be imported globally before any component CSS)
5. `design-system/ui_kits/<surface>/` — the hi-fi reference for the surface you're building

## Hard rules (from `design-system/CLAUDE.md`)

- The design system is the source of truth. Not your memory of the legacy UI. Not your intuition.
- Mirror the `ui_kits/<surface>/` reference 1:1 — selectors, cascade, values, copy strings.
- Every color/font/radius/shadow/spacing/motion value comes from `colors_and_type.css`. No hard-coded hex or `13px` magic numbers.
- **Verify `var(--accent-100)` resolves to `#d97757` in DevTools before declaring a phase done.** If it's blank, you forgot to import the token surface globally — fix it before continuing.
- Delete the legacy route/page/component a new surface supersedes. No parallel UI paths.
- If a surface is not in `ui_kits/`, it has not been designed. Stop and ask.

## Phase status (always re-read `design-system/HANDOFF.md` for the live list)

- Phase 1 · Home screen — Ready
- Phase 2 · MDX workstream + 510(k) editor — Ready
- Phase 3 · Projects detail — In design (do not pre-build)
- Phase 4+ · Artifact workbench / Auth / Admin — In design

---
```

## What goes below the pointer

Existing repo-level instructions (build commands, test invocations, deployment notes, etc.) can stay below the pointer block. They are **not** authoritative for UI decisions.

If the repo's existing `CLAUDE.md` contains UI guidance — color choices, component patterns, layout opinions — **delete it**. Those instructions actively fight the design system. The pointer above is the only UI guidance Claude Code needs at the repo root.
