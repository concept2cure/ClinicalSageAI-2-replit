# D8 slice 3 — the device screens' stat tiles become one quiet line of figures

Package **D8** (founder decision **P-128**, 2026-11-12). Spec: `.design/claude-convergence/D8.md`, §3. Session
`session_01E8btkB8mcLirW4rNvsMNxK`.

## What already exists (RULE 3)

Nothing here is new.
- The tiles: `.metrics-row`, `.metric-card`, `.metric-label`, `.metric-val`, `.metric-meta` and `.metrics-compact` in
  `client/src/concept2cure/mdx/app.css`, drawn by 39 tiles in eight device files. On the six screens that show tiles
  on arrival every tile holds exactly a label, a figure and a note, in that order (`tiles-before-1440.json`).
- The pattern followed: the canonical register line, `.c2c-v2 .reg-kpis` / `.reg-kpi` / `.reg-kpi-v` /
  `.reg-kpi-l` in `client/src/concept2cure/v2/styles/app-v2.css`, which Quality's and CMC's registers use (P-122
  item 3).
- The app and its data are the founder's Codespace made from an empty database
  (`../../../HUMAN-TEST/CLICK-THROUGH/2026-11-06/README.md`), on "[Demo · MDX] NeuroPanel-Dx 510(k)" as Rhea Reviewer.

## What was there

ONE_DESIGN_PLAN §2 retires "stat tiles and percentages as permanent chrome". Each tile was a bordered box with a
28 px serif figure. `probe-tiles.cjs` measured the rows in the running app:

| Screen | Row at 1440 px | Row at 390 px | The work under it starts, at 390 px |
|---|---|---|---|
| Clinical studies (first row) | 121 px | 438 px | 783 px |
| Clinical studies (risk row) | 227 px | 644 px | 2306 px |
| Software lifecycle | 148 px | 370 px | 735 px |
| Device engineering | 137 px | 438 px | 821 px |
| UDI and labeling | 121 px | 438 px | 783 px |
| Post-market vigilance | 121 px | 438 px | 971 px |
| Pre-Sub manager | 135 px | 506 px | 942 px |

At 390 px the tiles stacked one to a row, and on every screen the work under them began below the first screen
(844 px tall).

## What changed

- `mdx/app.css`: the row is a wrapping line; a figure has no box. Above phone width it is a two-row grid: the label,
  the figure beside it, the note under both. Its type is the canonical register's: the label `--fs-small` in the
  muted text, the figure `--fs-section` weight 600, the note the caption size. A tone still colours the figure. At
  640 px and under, each figure is a wrapping line instead, and the space between figures is wider than the space
  inside one.
- The order on screen is the markup's: label, figure, note. The canonical register writes the figure first;
  reordering the device markup by CSS would make what a person sees differ from what a screen reader reads.
- `mdx/surfaces/SoftwareSurface.tsx`: two word figures lose an inline 18 px (set when a figure was 28 px), and the
  documentation level is written with a capital first letter in code instead of being title-cased by a style
  ("Not Determined" → "Not determined", "basic" → "Basic").
- `mdx/surface-text-ramp.css` is generated and did not change: a tile painted `--bg-000`, not a tinted ground.

## After, measured the same way

| Screen | Row at 1440 px | Row at 390 px | The work under it starts, at 390 px |
|---|---|---|---|
| Clinical studies (first row) | 64 px | 215 px | 561 px |
| Clinical studies (risk row) | 68 px | 319 px | 1759 px |
| Software lifecycle | 115 px | 215 px | 580 px |
| Device engineering | 64 px | 215 px | 598 px |
| UDI and labeling | 64 px | 215 px | 561 px |
| Post-market vigilance | 64 px | 215 px | 749 px |
| Pre-Sub manager | 64 px | 245 px | 682 px |

Software lifecycle's row is two lines at 1440 px because its notes are long ones from the server (the reason no
completeness is computed).

## Capabilities kept (P-122)

`facts-summary.json`: the six screens at 1440×900 and 390×844, light and dark, before and after (24 pairs, by slice
1's `compare.cjs`). **In all 24:** the same failed requests (none), no new console error, no sideways scroll, the
same headings, the same number of controls and the same length of text. Every label, figure, unit, tone and note is
drawn, in the same order, where it was. Nothing moved below the fold: the work under the figures moved up, by 155 to
547 px at 390 px.

## Red and green

- `client/src/concept2cure/mdx/__tests__/tilesAreALineOfFigures.test.ts`: 7 of 9 failed with the change taken out;
  9 of 9 pass with it. The two that pass both ways pin the tone on the figure and that no part of a figure is hidden.
- `client/src/concept2cure/mdx/surfaces/__tests__/SoftwareSurface.emptyAskAna.test.tsx`: two new cases failed before
  ("expected 'font-size: 18px; text-transform: capi…' to be ''"; "expected 'basic' to be 'Basic'") and pass after.
- `sharedLookRetiredPatterns.test.ts` (slice 1): the tile label's pinned size moves from the caption to the small
  size, which is the canonical register label's and which the new test pins too. Its other pins are unchanged.
- The device suites pass. `ci:surface-text-ramp` (see below), `ci:check-phantom-tokens` and `ci:class-vocabulary`
  pass.

## Review (ONE_DESIGN_PLAN §3 step 4)

Two reviewers read the change independently of this session.

**Design.** No must-fix item. It reads as the canonical line and §2's calm work area. Label-then-figure should be
kept: reordering would make what a person sees differ from what a screen reader reads, for little gain in scanning.
Its first suggestion was taken: at 390 px a one-line note sat 14 px above the next figure's label and read as part of
it, so the gap between figures on a phone is now 20 px against 2 px inside one. Not taken: a narrower side inset on a
phone (every block's, slice 4) and a test with a 200-character note (the probe below covers enlarged text).

**Accessibility (WCAG 2.2 AA).** No failure in contrast, colour alone or order. Ratios from the tokens: the label and
the note 5.21:1 light and 6.82:1 dark on the page; the figure 17.5:1 and 14.4:1; toned figures from 4.68:1 (warning,
light, on `--bg-100`) up. It found one real risk: at 320 px with enlarged text, a label column that cannot wrap
pushes the figure out of its space (WCAG 1.4.4, 1.4.10).

That risk was measured, not assumed. `probe-reflow.cjs` doubles every font size in the figures and checks, at a given
width, for any part outside its figure, a label overlapping its figure, and sideways scroll:
- the first build (a grid whose label column could not shrink): at 320 px ×2, labels, figures and notes ran out of
  their space on all six screens;
- the reviewer's suggested columns: labels and notes fixed, figures still spilling right on all six;
- a figure column that keeps the figure's own width: clean at desktop widths, but one Clinical studies label still
  overlapped its figure at 320 px ×2;
- a wrapping line at every width: clean, but each figure then took its full 280 px at 1440 px, so the four no
  longer fitted on one line (rows 64 → 115 px);
- **built:** the grid above phone width and the wrapping line at 640 px and under. `reflow-after.txt`: the six
  screens at 320 px ×2, 390 px ×2, 390 px ×1, 720 px ×2 (a 1440 px screen at 200% zoom), 1440 px ×1 and 1440 px ×2,
  36 checks, every one "no figure outside its line or overlapping", no sideways scroll.

`contrast-after.json` (by slice 2c's `probe-contrast.cjs`): no text below AA on the six screens, light or dark.

Microcopy and motion: not applicable; no copy except "Not determined" (sentence case now) and no motion changed.

## The text ramp

`ci:surface-text-ramp` failed while this slice was being built, and not because of it: trunk's
`v2/styles/surface-text-ramp.css` had gone stale when `help-v2.css` landed (`1207a3c307`). It was regenerated with
the repo's generator in its own commit (`473c03228f`, Plan F1). This slice changes no generated sheet.

## Captures

`screenshots/`: Post-market vigilance, Software lifecycle and Clinical studies, before and after, at 1440 px and 390
px in light; Post-market vigilance at 1440 px in dark and Device engineering at 390 px in dark, after.

## Still to do on these screens

- Device engineering's "Open risks" is toned as an error at 0, and "Open change requests" as a warning at 0 (slice
  1a's finding). They are in `EngineeringSurface.tsx`, which another session holds; handed over in COORDINATION.md.
- Tables, panels and empty states (slice 4), and the page's side inset on a phone.
