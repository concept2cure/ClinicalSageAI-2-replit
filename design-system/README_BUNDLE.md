# Concept2Cure Design System — repo bundle

This folder is the **canonical drop** of the design system into `concept2cure-v2`. It mirrors the source-of-truth project 1:1 as of the date below. Treat it as read-only reference: edits happen in the design project; this bundle is re-staged when phases ship.

**Stage date:** 2026-04-27
**Source project:** Concept2Cure Design System (Claude design surface)

---

## Drop location

Place this entire folder at:

```
concept2cure-v2/design-system/
```

(or wherever your repo root prefers — just keep it together. Do not split files across paths.)

Then point Claude Code at it from the repo's root `CLAUDE.md` — see `REPO_CLAUDE_POINTER.md` in this bundle for the exact snippet to paste.

---

## What's here

| File / folder | Purpose |
|---|---|
| `CLAUDE.md` | Source-of-truth pointer. Read this first every session. |
| `HANDOFF.md` | Phase status + per-surface implementation contracts (the executable brief). |
| `SKILL.md` | Skill framing — when and how to invoke this system. |
| `README.md` | Voice, tone, visual foundations, content rules, iconography. |
| `colors_and_type.css` | **Canonical token surface.** Must be imported globally before any component CSS. |
| `ui_kits/home/` | **Phase 1 — Home screen.** Ready for implementation. |
| `ui_kits/mdx/` | **Phase 2 — MDX workstream + 510(k) editor.** Ready for implementation. |
| `ui_kits/ana_ri/` | Reference pattern — chat-first project shell. Used as input to Phase 3 Projects. |
| `ui_kits/ectd_coauthor/` | Reference pattern — 3-pane artifact workbench. Used as input to Phase 3 Projects. |
| `assets/` | Brand mark, agency + compliance logos. |
| `REPO_CLAUDE_POINTER.md` | Snippet to paste into the repo-root `CLAUDE.md`. |

**Phase 3 (Projects detail) is NOT in this bundle.** It is scaffolded in `HANDOFF.md` but pending the RIM-framing answer from the repo team. Do not implement it from imagination.

---

## The regression that prompted this bundle

On 2026-04-26, the Phase 1 home port rendered muted/grey because the canonical `colors_and_type.css` was never imported into the React app, AND the kit's inline `:root` token block was dropped during the port-to-CSS-modules. Every `var(--accent-100)` resolved to undefined.

To prevent a repeat, **`CLAUDE.md` in this bundle now includes a "Token import" section with a 4-step verification check.** Run that check before declaring any phase done. The check fits in DevTools in 30 seconds and would have caught the regression on the first screenshot.

---

## Contract summary (what Claude Code must do)

1. Read `CLAUDE.md` → `HANDOFF.md` → `README.md` → `colors_and_type.css` → the relevant `ui_kits/<surface>/` directory, in that order.
2. Import `colors_and_type.css` once at the React app root, before any component CSS.
3. Mirror the kit JSX/CSS/copy 1:1 — selectors, cascade, values, strings.
4. Verify the four `--accent-100` / `--bg-000` resolutions in DevTools before closing the phase.
5. Delete the legacy surface the new one supersedes (per `HANDOFF.md`'s "What this replaces" section).
6. Stop and ask if anything is ambiguous. Do not invent.

The full contract — including per-phase acceptance checklists — is in `HANDOFF.md`.
