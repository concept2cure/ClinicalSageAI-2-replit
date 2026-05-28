# CLAUDE.md — Concept2Cure Design System (source of truth)

> This file is read automatically by Claude Code on every session. Its job is to route every UI task to **this design system** as the single source of truth — and to keep Claude Code from falling back on the legacy UI in the `concept2cure-v2` codebase.

---

## Authority

**This project owns the Concept2Cure.RI UI.** Every Concept2Cure.RI surface — home, projects, artifacts, auth, editor, admin — is designed here first, shipped as a hi-fi prototype under `ui_kits/`, and then implemented in the `concept2cure-v2` codebase by Claude Code.

The legacy UI still live in the repo is **in the process of being deleted**. Do not extend it, restyle it, or refactor it in place. Replace it surface-by-surface as this design system releases each phase.

**Legacy still live (per PR #601 audit, 2026-05-28):** `ZenApp.tsx` (2,174 lines — owns the `/` and `/concept2cure` catch-all), `ZenAppWithSession.tsx`, `components/editor/` (~19k), `components/regulatory/` (~10.9k), `components/intelligentDocs/` (~5.3k), `components/intelligence/` (~4.3k), `components/workspace/` (~3k), `auth/` (kept until Phase 5 ships). ~43k lines of editor/regulatory/workspace code is the bulk of the debt; it all hangs off ZenApp's `layoutMode` switch with no feature flags, so each piece is cuttable the moment its replacement kit is routed.

**Already deleted (do NOT hunt for these):** `IndustryAwareApp.tsx`, `AppsPage.tsx`, and `components/biologics|medtech|pharma|cro|biotech/` no longer exist.

**The single most important open decision:** the new MDX UI is fully built and wired but reachable only at `/concept2cure/mdx`. `/` and `/concept2cure` still resolve to legacy ZenApp. Flipping that catch-all to the new shell is gated on Phase 3 (Projects shell) shipping, since ZenApp currently owns project-level navigation the new shell doesn't yet replace.

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

- **Phase 1 · Home** — shipped (`components/concept2cure-home/`).
- **Phase 2 · MDX workstream** — shipped (`client/src/concept2cure/mdx/`, all 28 nav items live). Reachable at `/concept2cure/mdx` only — not yet the default route.
- **Phase 7 · PDEV** — shipped behind `ENABLE_PDEV_SURFACE` flag.
- **Phases 9–11 (Authoring · Biopharma · Projects · Intelligence)** — kits shipped in `ui_kits/`; backend gated on two briefs (below).
- **Phase 3–6 (Projects detail · Artifact workbench · Auth · Admin)** — in design / not pre-built.

## Backend briefs (read before implementing Phase 9+)

```
MUTATION_PRIMITIVES_BRIEF.md        ← six governed-action endpoints + c2c_ana_actions ledger. SHIP FIRST.
PHASE_9_SCHEMA_MIGRATION_BRIEF.md   ← c2c_documents family + rule packs + legacy 301 redirects. Ship second.
PHASE_10_1_INSTALL.md               ← per-(domain,surface) AnA dock threading.
PHASE_10_2_INSTALL.md               ← biopharma surface refresh (density, rail collapse, client-type IA, SurfaceComposer).
```

All B/C-series status-check blockers are resolved inside the briefs (audit_logs column extensions, users.id integer FKs, c2c_blockers resolver, EsignModal promotion to /api/c2c/actions/sign).

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
