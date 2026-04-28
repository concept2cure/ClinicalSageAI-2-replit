# CLAUDE.md — Concept2Cure Design System (source of truth)

> This file is read automatically by Claude Code on every session. Its job is to route every UI task to **this design system** as the single source of truth — and to keep Claude Code from falling back on the legacy UI in the `concept2cure-v2` codebase.

---

## Authority

**This project owns the Concept2Cure.RI UI.** Every Concept2Cure.RI surface — home, projects, artifacts, auth, editor, admin — is designed here first, shipped as a hi-fi prototype under `ui_kits/`, and then implemented in the `concept2cure-v2` codebase by Claude Code.

The legacy UI that lives in the repo today (`client/src/concept2cure/ZenApp.tsx`, `IndustryAwareApp.tsx`, `AppsPage.tsx`, the industry-specific dashboards under `components/biologics|medtech|pharma|cro|biotech/`, etc.) is **in the process of being deleted**. Do not extend it, restyle it, or refactor it in place. Replace it surface-by-surface as this design system releases each phase.

## Claude Code's role

1. **Read `HANDOFF.md` first**, every session. It lists which surfaces are ready for implementation, which are in design, and which are still legacy.
2. **Implement exactly what ships here.** Mirror the JSX structure, class names, CSS tokens, copy, and interaction from the matching `ui_kits/*` directory into the codebase. Layout, spacing, density, motion — all 1:1. Do not improvise.
3. **Copy the token surface wholesale.** `colors_and_type.css` is the single source for color, type, spacing, radius, shadow and motion. Any hex, font-family, or magic number in the codebase that isn't reading from these tokens is a bug — fix it as you pass through.
4. **Delete as you replace.** When a new surface ships, remove the legacy route/page/component it supersedes (along with any feature flags that used to gate it). Do not leave dead code paths.
5. **Do not invent.** If the surface you need isn't in `ui_kits/` yet, stop and ask. That surface has not been designed.

## Read order, every session

```
1. HANDOFF.md                 ← phase status, what's ready to implement
2. SKILL.md                   ← full skill framing + non-negotiables
3. README.md                  ← voice, visual foundations, iconography
4. colors_and_type.css        ← the token surface (canonical)
5. ui_kits/<surface>/         ← the hi-fi reference for the surface you're building
6. preview/                   ← specimen cards for verifying tokens in isolation
```

## Phase status (summary — full list in HANDOFF.md)

- **Phase 1 · Home screen** — READY FOR IMPLEMENTATION. Lives in `ui_kits/home/`.
- **Phase 2 · MDX workstream** — READY FOR IMPLEMENTATION. Lives in `ui_kits/mdx/`. Includes the 510(k) module editor (3-pane Cursor-style workbench) reachable from the eSTAR checklist.
- **Phase 3 · Projects detail** — In design (scaffolded in HANDOFF.md, pending RIM framing). Do not pre-build. Reference patterns: `ui_kits/ana_ri/` (chat-first shell) and `ui_kits/ectd_coauthor/` (3-pane artifact workbench).
- **Phases 4–6 · Artifact workbench, Auth, Admin** — In design. Do not pre-build.

## Token import — read before writing one line of CSS

`colors_and_type.css` is canonical, but **the `ui_kits/*` prototypes also re-declare a subset of the same tokens inline at `:root` in their own stylesheet** so they render standalone in this design tool. When you port a kit, those inline `:root` blocks are the *escape hatch* — not the contract.

The contract is: **the global stylesheet of the React app must import `colors_and_type.css` once, at the root, before any component CSS.** Then drop the kit's inline `:root` token block during the port — the canonical file supplies every variable it referenced.

If you skip the global import AND drop the inline tokens, every `var(--accent-100)`, `var(--bg-000)`, `var(--text-200)` resolves to undefined and the UI renders muted/grey. **This is the regression that broke the Phase 1 ship on 2026-04-26.** Do not repeat it.

Verification step you must run before declaring a phase done:
1. Open the live app in the browser. Inspect `:root` in DevTools.
2. Confirm `--accent-100` resolves to `#d97757` (Claude orange) — not blank, not inherited.
3. Confirm `--bg-000` resolves to `#faf9f5` (cream).
4. If either is blank, the global import is missing. Fix it before continuing.

## Non-negotiables (hard rules, no exceptions)

These come from `README.md`. Every PR that violates them is a bug.

- **Sentence case everywhere.** Never Title Case. Never ALL CAPS except 10px metadata labels.
- **No emoji. No exclamation marks. No cheerleading.**
- **Body = 13px**, max title = 18–24px.
- **Claude orange (`#d97757`) is the only strong color**, used sparingly — one focal point per screen.
- **200ms ease-out motion.** No bounce, no spring, no overshoot.
- **Lucide icons only.**
- **Second person, direct.** "You", never "we".
- **Numbers over adjectives.**

## Escalation

If an implementation decision requires trading off against what ships here — performance, framework constraints, a11y edge cases, anything — **raise it to the designer (this project) before coding around it**. Do not resolve UI trade-offs unilaterally. The designer will update `ui_kits/` and `HANDOFF.md` if the design needs to change.

## What lives where

| Location | What it owns |
|---|---|
| `CLAUDE.md` (this file)     | Pointer into the system. Read first. |
| `HANDOFF.md`                | Phase status + per-surface implementation contracts. |
| `SKILL.md`                  | Skill framing — when and how to invoke this system. |
| `README.md`                 | Voice, tone, visual foundations, content rules, iconography. |
| `colors_and_type.css`       | Canonical token surface. |
| `preview/*.html`            | Per-token specimen cards. |
| `ui_kits/home/`             | **Phase 1 · Home screen** (ready). |
| `ui_kits/ana_ri/`           | Reference — chat-first shell. |
| `ui_kits/ectd_coauthor/`    | Reference — artifact workbench. |
| `assets/`                   | Brand mark, agency + compliance logos. |

---

Older instructions in `client/src/concept2cure/**` or the repo root `CLAUDE.md` that contradict this file are **superseded**. This file is the floor.
