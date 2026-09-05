# design-system — where it lives and how it changes

`design-system/` in this repo **is** the design system: `colors_and_type.css`
is the token source of truth (loaded once by `client/src/main.tsx`), and
`HANDOFF.md` / `CLAUDE.md` / `README.md` carry the phase status, the rules and
the voice. The hi-fi kits it references live at the repository root under
`ui_kits/<surface>/` — one tree.

There is no external canonical project and no sync. There used to be two
things that said otherwise:

- `design-system/ui_kits/` — a second copy of six kits, last refreshed
  2026-08-17, that product code never imported. It held twelve files the
  working tree had also edited and thirteen it had never received (the MDX
  drafter, pathway and files-tree kits, `mdx_phase2/`, two home components).
  Folded into `ui_kits/` on 2026-09-05: the mirror-only files moved across
  unchanged, and where both trees had a file the working tree's version was
  kept — except `home/styles.css`, whose working copy was a strict subset of
  the mirror's (226 of 887 selectors), so the superset won. The mirror's
  versions of the other eleven differing files are in history at the commit
  that removed the tree.
- `.github/workflows/sync-design-system.yml` + `scripts/sync-design-system.sh`
  — a manual-dispatch workflow that required a `DESIGN_SYSTEM_SOURCE` the
  repository never had wired, and had no record of ever running. Removed with
  the mirror.

## Changing the design system

Edit `design-system/` and `ui_kits/` directly on `concept2cure-v2`, like any
other file. The gates that hold the line:

- `tests/ui/token-authority.test.ts` — only the authorised stylesheets declare
  tokens in the app graph; the kit stylesheets are quarantined from it.
- `npm run ci:token-contrast` — WCAG AA on the token pairs.
- `npm run ci:design-system` — Lucide-only icons, no spring motion, no inline
  `<style>` in a component.
- `node scripts/ci/check-component-class-coverage.mjs` — a class a component
  renders must have a rule in the shipped CSS; a rule that lives only in a kit
  is not coverage.

## Local token check

1. `npm run dev`
2. Open `/concept2cure` and DevTools.
3. `getComputedStyle(document.documentElement).getPropertyValue('--accent-100')`
   should be `#d97757`; `--bg-000` should be `#faf9f5`.

Either resolves blank → `client/src/main.tsx` is not importing
`../../design-system/colors_and_type.css` before `./index.css`.
