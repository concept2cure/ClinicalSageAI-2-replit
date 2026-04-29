# Setting up Claude Code to consume this design system

This file explains, **for the human operator**, how to wire `concept2cure-v2` so that Claude Code (running in the v2 repo) reads this design system as its source of truth on every session.

You only have to do this once per repo. After that, every Claude Code session that touches a UI surface will automatically route through the kit.

---

## How the wiring works

Claude Code in the v2 repo has shell-level filesystem access — it can only read paths that physically exist in the v2 working tree. So the design system has to be **mirrored into the v2 repo** as a folder, kept in sync with this canonical source.

The mirror lives at `concept2cure-v2/design-system/`. It contains a verbatim copy of this project's `CLAUDE.md`, `HANDOFF.md`, `README.md`, `SKILL.md`, `colors_and_type.css`, `preview/`, and `ui_kits/`. Claude Code reads from this mirror; it does not edit it.

The canonical source is still this design-system project. The mirror is just the transport.

---

## TL;DR — three things to do once

1. **Add the snippet below to the top of `concept2cure-v2/CLAUDE.md`** (create the file at the v2 repo root if it doesn't exist).
2. **Set up the sync** — make sure the v2 repo has a `design-system/` folder containing this project's files, and a way to refresh it when the designer ships a new revision (options below).
3. **Verify it worked** — open a Claude Code session in v2 and ask "what surfaces are ready to implement?" — it should answer by reading `design-system/HANDOFF.md`.

---

## The snippet to paste into v2's `CLAUDE.md`

Copy everything between the `--- begin ---` / `--- end ---` markers and paste at the **top** of `concept2cure-v2/CLAUDE.md`. If the file already has content, this snippet goes above it; the existing content becomes secondary guidance and any contradictions are resolved by the design system per the rules below.

```
--- begin ---

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

--- end ---
```

---

## Setting up the `design-system/` mirror

You need a way to get this project's files into `concept2cure-v2/design-system/` and keep them fresh. Three options, ordered by robustness:

### Option 1 — git submodule (cleanest, if the design system is git-backed)

If this design-system project is published to a git remote (GitHub, GitLab, Bitbucket):

```bash
cd concept2cure-v2
git submodule add <design-system-repo-url> design-system
git commit -m "Add design system as submodule"
```

To pull updates after the designer ships a new revision:

```bash
git submodule update --remote design-system
git commit -am "Sync design system to <date>"
```

This is the cleanest option because the submodule's commit pin records exactly which design-system revision v2 is shipping against, and reverts are clean.

### Option 2 — CI sync workflow (if no git remote, or you want automation)

Add a scheduled GitHub Action / GitLab CI job that runs daily / on designer signal. Pseudo-code:

```yaml
name: Sync design system
on:
  schedule: [{ cron: '0 9 * * *' }]
  workflow_dispatch:
jobs:
  sync:
    steps:
      - checkout v2 repo
      - download design-system project files (rsync, scp, API, whatever the design tool exposes)
      - rsync into ./design-system/ (with --delete to catch removed files)
      - if diff: open PR titled "Sync design system to <date>"
```

Ask Claude Code to scaffold this — it offered to in its last message. It will know the v2 repo's CI conventions.

### Option 3 — manual copy (fastest to start, drifts the most)

When the designer announces a new revision, manually copy the changed files from this design-system project into `concept2cure-v2/design-system/` and commit. Fine for the first ship; replace with Option 1 or 2 as soon as possible — manual sync drifts within a week.

---

## Verify it worked

Open a fresh Claude Code session in the v2 repo. Ask:

> "What UI surfaces are ready to implement, and which one should we start with?"

If wired correctly, Claude Code will:

1. Read `design-system/HANDOFF.md`.
2. Report the Phase status table (Phase 1 Home, Phase 2 MDX, Phase 3 Projects all marked **Ready to implement**; Phases 4–6 marked in design).
3. Recommend starting with whichever phase the v2 codebase hasn't shipped yet.

If it tries to read `client/src/concept2cure/**` files instead and propose changes there, the snippet didn't take. Check that v2's `CLAUDE.md` actually contains the snippet at the top, and that `concept2cure-v2/design-system/` exists with this project's files in it.

---

## Troubleshooting

**"`design-system/` doesn't exist in v2"** — The mirror hasn't been set up yet. Pick one of the three sync options above and run it.

**"Claude Code edited a file inside `design-system/`"** — The mirror is read-only by convention, but nothing physically prevents a write. Revert with `git checkout design-system/`, then point Claude Code at the "Read-only" section of the snippet so it knows the rule for next time. The next sync will overwrite any edits anyway, but the diff in CI is noisy.

**"Claude Code is still falling back to v2's legacy UI"** — Check the snippet is at the **top** of v2's `CLAUDE.md`. Lower-down content can be overridden by anything above it. Also check there's no separate `CLAUDE.md` in `client/` or another subdir telling it different.

**"The mirror is stale — designer shipped a new revision but Claude Code is reading old files"** — Run the sync (`git submodule update --remote design-system` for Option 1, trigger the workflow for Option 2, manual copy for Option 3). The mirror's `HANDOFF.md` changelog is the truth — if its top entry doesn't match the designer's most recent change, it's stale.

**"The cross-project path `/projects/<id>/...` doesn't work"** — Correct. That convention is specific to the design tool the designer uses; Claude Code in a normal repo can't see it. Use the `design-system/` mirror in v2's working tree instead. (This was an early misunderstanding in the handoff design — the mirror approach replaced it.)
