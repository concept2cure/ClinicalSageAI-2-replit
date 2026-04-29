# CLAUDE.md — concept2cure-v2 (UI work routes through the design system)

This repo's UI is owned by an external **design system**. Before touching any
component, route, page, or stylesheet, read the design system. Do not recreate the UI
from memory, screenshots, or the legacy code in `client/src/concept2cure/**`.

## Where the design system lives, from your seat

The design system is mirrored into this repo at `design-system/` (read-only by
convention — see "Read-only" below). Its layout:

  design-system/
  ├── CLAUDE.md              ← phase routing, non-negotiables, token-import warning
  ├── HANDOFF.md             ← phase status, surface inventory, per-phase contracts
  ├── README.md              ← voice, visual foundations, iconography
  ├── SKILL.md               ← skill framing
  ├── colors_and_type.css    ← canonical token surface
  ├── preview/               ← per-token specimen cards
  └── ui_kits/
      ├── home/              ← Phase 1 (home screen) + Phase 3 (Projects lives inside)
      ├── mdx/               ← Phase 2 (MDX workstream)
      └── …

The canonical source of these files is a separate design-system project. This repo's
`design-system/` folder is a synced mirror — the human operator runs the sync; you do
not.

## Per-session read order (do not skip)

Every session that touches UI:

  1. design-system/CLAUDE.md
  2. design-system/HANDOFF.md
  3. design-system/colors_and_type.css
  4. design-system/ui_kits/<surface>/   (every file)
  5. design-system/preview/              (token specimens, for verification)

`HANDOFF.md` tells you which surfaces are ready, which are in design, and the exact
acceptance checklist per surface. It is the executable brief — follow it line by line.

## Read-only

`design-system/` is **read-only by convention**. Do not edit files in it. Edits are
made in the canonical design-system project by the designer; the next sync overwrites
your edits anyway. UI change requests are surfaced to the human operator, who passes
them to the designer.

## Authority

If anything in this v2 repo (older `CLAUDE.md` content below this snippet, README files,
comments in legacy components, or your own training-data memory) conflicts with the
design system, **the design system wins**. The design system is the floor.

## Token import — the regression that must not repeat

The 2026-04-26 ship broke because v2's global stylesheet did not import
`colors_and_type.css` at the app root, so every `var(--accent-100)` resolved to nothing
and the UI rendered grey. Mandatory verification before declaring any phase done:

  1. Confirm the v2 app root imports `design-system/colors_and_type.css` exactly once,
     before any component CSS. **Import — do not copy the contents.** Copying freezes
     the tokens at point-in-time.
  2. Open the running app in DevTools. On `:root`, confirm:
       --accent-100 → #d97757
       --bg-000     → #faf9f5
  3. If either resolves blank, the import is missing or scoped wrong. Fix before
     continuing.

## Hard rules from the design system (do not violate)

  - Sentence case everywhere. Never Title Case. Never ALL CAPS except 10px metadata.
  - No emoji. No exclamation marks. No cheerleading.
  - Body = 13px. Max title = 18–24px.
  - Claude orange (#d97757) is the only strong color, used sparingly — one focal point
    per screen.
  - 200ms ease-out motion. No bounce, no spring, no overshoot.
  - Lucide icons only.
  - Second person, direct. "You", never "we".
  - Numbers over adjectives.

## Porting workflow

  1. Read every file in design-system/ui_kits/<surface>/ before writing a line of v2 code.
  2. Mirror the JSX 1:1 — class names, copy strings, component decomposition, interaction.
  3. Either import the kit's CSS into the v2 build verbatim (preferred), or convert it
     mechanically to CSS modules / Tailwind preserving every value. Do not "improve" values.
  4. Run the per-phase acceptance checklist in design-system/HANDOFF.md. Every box.
  5. Delete the legacy files that phase replaces ("What this replaces" list per phase).
     Remove feature flags in the same PR.

## Escalation

When an implementation decision requires trading off against the design (perf,
framework constraint, a11y edge case, anything), **stop and surface the trade-off to
the human operator before coding around it**. Do not resolve UI trade-offs unilaterally.
The designer will update the kit and `HANDOFF.md` if the design needs to change.

