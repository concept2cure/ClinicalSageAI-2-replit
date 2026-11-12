# D8 slice 2b — the 510(k), PMA and Diagnostics pages do not scroll sideways on a phone

Package **D8** (founder decision **P-128**, 2026-11-12). Spec: `.design/claude-convergence/D8.md`, §2b. Session
`session_01E8btkB8mcLirW4rNvsMNxK`.

## What already exists (RULE 3)

Nothing here is new.
- The layouts: the pathway tab row (`.pwt-bar`, `client/src/concept2cure/mdx/pathway-tabs.css`), the stage strip and
  PMA's phases (`.stage-strip`, `.phases`), the two-column body (`.col2`), the health cards (`.health`) and the
  section header (`.section-hdr`), all in `client/src/concept2cure/mdx/app.css`. Their markup is in
  `K510Surface.tsx`, `PmaSurface.tsx`, `IvdSurface.tsx`, `pathway/PathwayPanes.tsx` and `EstarFilingPanel.tsx`, and
  is not edited.
- The patterns followed: the canonical tab row scrolls inside itself with no scrollbar
  (`.c2c-v2 .tabs`, `v2/styles/app-v2.css`), as the project's steps do (`.seg`); the sheet's own phone rules for the
  Pre-Sub layout and the risk register stack their columns at 640 px.
- The app and its data are the founder's Codespace made from an empty database
  (`../../../HUMAN-TEST/CLICK-THROUGH/2026-11-06/README.md`), on "[Demo · MDX] NeuroPanel-Dx 510(k)" as Rhea Reviewer.

## What was there

The device page's own container (`.mdx-shell .page`) scrolled sideways at 390×844. The document did not, which is
why a walk that reads the document's width reports nothing (this lane's first one, and the phone and dark audit of
the same day). `probe-wide.cjs` reads the container and names the outermost elements past its edge
(`wide-before-390.json`); `../../../HUMAN-TEST/CLICK-THROUGH/2026-11-11/phone-width/probe-cutoff.cjs` lists the
controls carried past it (`cutoff-before-390.json`).

| Screen | The page scrolled to | Controls past the edge | What ran past it |
|---|---|---|---|
| 510(k) | 710 px | 47 | the tab row (to 710), the stage strip (to 504), the two-column body (to 707), the health cards (to 483), the filing panel's controls (to 574) |
| PMA | 712 px | 6 | the tab row (to 687), the phases (to 712), the health cards (to 483), the filing panel's controls (to 574) |
| Diagnostics | 720 px | 6 | the tab row (to 720), the stage strip (to 531), the health cards (to 483), the filing panel's controls (to 574) |
| Clinical evaluation | 390 px | 0 | — |

On the 510(k) screen "Refine query with AnA" and "Export SE matrix as CSV" were at 391–435 px, one pixel past the
screen.

## What changed

Two stylesheets (spec §2b):
- `pathway-tabs.css`: the tab row scrolls inside itself. Its hairline is drawn inside its box over one pixel of
  padding, so the active tab's underline still sits on it.
- `app.css`, at 640 px and under: the stage strip and the phases scroll inside themselves; the two-column body
  stacks; the health cards go two to a row; a section header and its row of controls wrap; a select is never wider
  than the screen.

No markup, text, control or behaviour changed.

## After, measured the same way

| Screen | The page scrolls to | Controls past the edge |
|---|---|---|
| 510(k) | 390 px | 3, the later tabs, inside the tab row |
| PMA | 390 px | 3, the later tabs, inside the tab row |
| Diagnostics | 390 px | 3, the later tabs, inside the tab row |
| Clinical evaluation | 390 px | 0 |

`wide-after-390.json` names no element past the container's edge on any of the four.

## Wider than a phone, nothing moved

The four screens at 1440×900, before and after, in light and dark. `png-diff.cjs` compares the captures pixel by
pixel (`desktop-pixel-diff.txt`):
- Clinical evaluation: identical in both.
- The other three: 41 to 104 differing pixels of 1,296,000, all in a box 12 px wide and 8 px tall at y 141–148,
  which is the audit trail's count on the tab row. The count had risen between the two walks (68 to 74 on the 510(k)
  screen, 69 to 75 on the others, read from the tab's own text), because each walk signs in. The 510(k) light pair
  has a few more at the notification count in the top bar.
- So the tab row, with its hairline now drawn inside its box, is pixel for pixel where it was.

## Capabilities kept (P-122)

`facts-summary.json`: the four screens at both widths in light and dark, before and after (16 pairs, by slice 1's
`compare.cjs`). **In all 16:** the same failed requests, no new console error, no new sideways scroll, the same
headings, the same number of controls and the same length of text. The requests that fail are the two that failed
before on this database: the predicate reads answer 503 with no predicate universe, and the GSPR matrix answers 404
for a device with none, which the screen says as "not yet assessed".

## Red and green

- `client/src/concept2cure/mdx/__tests__/pathwayPagesFitAPhone.test.ts`: 6 of 7 failed before the change; 7 of 7
  pass after. The seventh, which passes both ways, pins that wider than a phone each layout is as it was.
- The device suites pass. `ci:surface-text-ramp`, `ci:undefined-css-classes`, `ci:class-vocabulary` and
  `ci:check-phantom-tokens` pass.

## Captures

`screenshots/`: the 510(k), PMA and Diagnostics screens at 390 px in light, before and after; the 510(k) screen at
390 px in dark, after; the 510(k) screen at 1440 px in light, before and after, and in dark, after.

Read in the "after" at 390 px: the tab row runs off to the right as a strip that scrolls; the pathway's title is on
its own line with its two actions under it; the stage strip scrolls inside its card with the fifth stage showing at
the edge; every panel is as wide as the page.

## Review

Not sent to the review lenses: layout only, on patterns the product already uses, with no new colour, token, text or
motion. One thing a reviewer should know: a strip that scrolls with no scrollbar shows that it scrolls only by the
item cut at its edge. That is the canonical tab row's behaviour, and it is the same here.

## Still to do on these screens

- The seven stages and PMA's ten phases are a strip to scroll on a phone, not a list. Whether a phone should show
  the current stage and a count instead is a markup change, in a file another session holds.
- The page's 56 px side inset at 390 px (spec, slice 4).
