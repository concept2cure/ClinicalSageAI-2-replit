# D8 slice 1 — the device screens open in sentence case, with unfilled tiles

Package **D8** (founder decision **P-128**, 2026-11-12). Spec: `.design/claude-convergence/D8.md`, §1. Build:
`7a71354a56`. Session `session_01E8btkB8mcLirW4rNvsMNxK`.

## What already exists (RULE 3)

Nothing here is new.
- `client/src/concept2cure/mdx/app.css`: the one stylesheet all twelve device screens take their chrome from, scoped
  under `.mdx-shell`. Its classes and the markup that uses them are unchanged.
- The canonical styles this slice follows: the caption table heading `.c2c-v2 .reg-tbl th` and the toned figure
  `.reg-kpi[data-tone] .reg-kpi-v` (`client/src/concept2cure/v2/styles/app-v2.css`).
- The tokens: `--fs-caption`, `--text-300`, `--error`, `--warning` (`design-system/colors_and_type.css`).
- The app and its data are the founder's Codespace made from an empty database
  (`../../../HUMAN-TEST/CLICK-THROUGH/2026-11-06/README.md`); the screens are those of "[Demo · MDX] NeuroPanel-Dx
  510(k)" as Rhea Reviewer.

## What was there

Walked on 2026-11-11 (`../../../HUMAN-TEST/CLICK-THROUGH/2026-11-11/README.md`, finding 5). As a device screen
opened it showed:
- an uppercase, letter-spaced line above its title: "WORKSTREAM · CLASS II · 510K · [DEMO · MDX] NEUROPANEL-DX
  510(K)";
- stat tiles filled red, amber or green by their tone, each labelled in 10 px uppercase;
- uppercase table headings.

ONE_DESIGN_PLAN §2 retires each: sentence case everywhere, no uppercase eyebrow labels, status colour only for
meaning.

## How the slice was scoped

By what the running app shows, not by the sheet. `probe-uppercase.cjs` reads every rule of the sheet that sets
uppercase and lists the text each one styles on the twelve screens as they open (`uppercase-probe.json`).
- The sheet has **43** uppercase rules.
- **Five** style something a screen shows on arrival. For four of them the markup's words are already written in
  sentence case ("Workstream", "IRB approved", "K-number"): `.page-eyebrow`, `.metric-label`, `.tbl thead th`,
  `.ctable-head`.
- The fifth, `.eng-blocker-kind`, styles a code the markup writes as "dhf". Without its uppercase the screen would
  read "dhf", so it is kept. Its markup is in `EngineeringSurface.tsx`, which another session holds.
- The other **38** style nothing these screens show on arrival: drawers, detail panes, the device Vault panels, the
  Pre-Sub detail, or no markup at all. They are left for the slice that opens each state and reads its words.

A first count of fifteen rules was wrong: the search that produced it was cut short. The probe replaced it before
anything was changed.

## What changed

In `client/src/concept2cure/mdx/app.css` only:
1. `.page-eyebrow`, `.metric-label`, `.tbl thead th` and `.ctable-head` set no uppercase and no letter-spacing, at
   the caption size. The eyebrow and the tile's label are weight 500 in the quiet text colour.
2. A tile is not filled by its tone. The tone is on its figure: `.metric-card[data-tone="err"] .metric-val` is the
   error colour, `[data-tone="warn"]` the warning colour, and `ok` needs none.

No markup, text or behaviour changed.

## Capabilities kept (P-122)

| What a screen shows | Before | After |
|---|---|---|
| The eyebrow's words (workstream, class, pathway, project) | above the title, uppercase | above the title, sentence case |
| Each stat tile: its label, figure, unit and note | a filled tile | the same tile, unfilled |
| Each tile's tone | the tile's fill | the figure's colour |
| Table headings | uppercase | sentence case |
| Every control, row, panel and empty state | — | unchanged |

`facts-summary.json` holds the comparison for all twelve screens at 1440×900 and 390×844, in light and dark (48
before-and-after pairs, made by `compare.cjs` from the walks). **In all 48:** the same failed requests before and
after, no new console error, no new horizontal overflow, the same headings, the same number of controls and the same
length of text.

## Red and green

- `client/src/concept2cure/mdx/__tests__/sharedLookRetiredPatterns.test.ts`: 9 of 10 cases failed before the
  change; 10 of 10 pass after. The tenth pins that the eyebrow, the tile, its label, its figure and its note keep
  their rules and are not hidden. One case pins the count of uppercase rules at 39 or fewer, and that the kept code
  chip is one of them.
- The 22 device suites under `client/src/concept2cure/mdx/__tests__/` and `d0Primitives`: 198 of 198.
- `ci:surface-text-ramp`: the three generated ramp sheets match (nothing to regenerate).
  `ci:check-phantom-tokens`: no new phantom token. `ci:one-design-plan`: inside the plan.

## Walked in the running app

Before and after, the twelve screens at both widths in light and dark (96 captures). Filed here, in `screenshots/`:
- Device engineering and Post-market vigilance: before and after at 1440 light, 1440 dark, 390 light and 390 dark;
- the 510(k) screen (its predicate table's headings) and Clinical studies: before and after at 1440 light.

Read in the "after" captures: the line above the title in sentence case; the tiles unfilled with sentence-case
labels; "Open risks" and "MDRs due ≤72h" in the error colour and "Open change requests" and "CAPAs open" in the
warning colour, readable in dark; the "DHF" chip unchanged; the tiles stacked one per row at 390.

## Review (ONE_DESIGN_PLAN §3 step 4)

| Lens | Result |
|---|---|
| Accessibility (WCAG 2.2 AA) | **No failure.** Measured from the token values: the eyebrow and tile label 5.21:1 in light and 6.82:1 in dark; `.tbl thead th` 5.25 and 5.95; `.ctable-head` 5.21 and 6.38; the error figure 5.49 and 5.70; the warning figure 5.16 and 6.29. Tone is not said by colour alone: each toned tile has its label and its note in words, as before. The 12 px caption replaces 10 px. Not rendered through a screen reader. |
| Design system | **Conforms.** Every token resolves inside `.mdx-shell`; none is a phantom. No later rule in `mdx/app.css`, `files-tree.css`, `pathway-tabs.css` or the generated ramp re-adds uppercase or a fill to a changed selector. No hardcoded value was introduced. A tile toned `ok` now looks neutral, as the canonical register's does. |
| Design | Read by this session in the captures above: calmer and nearer §2. Not yet §2's work-area pattern: see below. |
| Microcopy, motion, honest state | Not applicable to this slice: no text, no motion and no state changed (`facts-summary.json`: identical text on all 48). |

The accessibility and design-system lenses were run by two reviewers that read the commit independently of this
session.

## Still in the earlier design after this slice

- The eyebrow is a separate line above the title; §2's work-area header has one line of description under it.
- The tiles are still tiles, with 28 px serif figures; §2 retires stat tiles as permanent chrome. P-122 keeps the
  figures visible, so they become one quiet line of the server's figures, not nothing (slice 3).
- 39 uppercase rules in this sheet, and those in `mdx/files-tree.css` and `mdx/pathway-tabs.css`.
- "Open risks 0" is shown in the error colour with "No risks recorded yet". The tone is the screen's own choice, in
  markup; this slice changed only how a tone is shown.
- Device engineering says "No engineering documents yet" above "13 hard blockers" over thirteen listed documents.
  Handed to the session that holds that file (COORDINATION.md).
