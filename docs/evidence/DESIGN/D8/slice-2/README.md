# D8 slice 2 — the device header wraps, and works at phone width

Package **D8** (founder decision **P-128**, 2026-11-12). Spec: `.design/claude-convergence/D8.md`, §2. Session
`session_01E8btkB8mcLirW4rNvsMNxK`.

## What already exists (RULE 3)

Nothing here is new.
- The header: `.page-header`, `.page-eyebrow`, `.page-title`, `.page-sub` and `.page-actions` in
  `client/src/concept2cure/mdx/app.css`, drawn by six device screens (`ClinicalStudiesSurface.tsx`,
  `SoftwareSurface.tsx`, `EngineeringSurface.tsx`, `UdiSurface.tsx`, `PostmarketSurface.tsx`,
  `presub/PreSubManager.tsx`). The host's context line is a `nav.page-actions` in `MdxSurfaceHost.tsx`.
- The layout followed: the canonical page header, `.c2c-v2 .ph` in `client/src/concept2cure/v2/styles/app-v2.css`
  (wraps; text block floor `min(420px, 100%)`; actions level with the top; at 640 px and under each later part takes
  a full line and the title is 22 px). Labeling and Human factors are already on it.
- The app and its data are the founder's Codespace made from an empty database
  (`../../../HUMAN-TEST/CLICK-THROUGH/2026-11-06/README.md`), on "[Demo · MDX] NeuroPanel-Dx 510(k)" as Rhea Reviewer.

## What was there

The header was one flex row that never wrapped, and so was the context line above it. `probe-header.cjs` measures
both in the running app. At 390×844 before the change (`header-before-390.json`):

| Screen | Text block | Title | Context line | Header | First figure at | An action cut off |
|---|---|---|---|---|---|---|
| Clinical studies | 161 px | 2 lines | 63 px | 228 px | 383 px | — |
| Software lifecycle | 161 px | 2 lines | 63 px | 228 px | 383 px | — |
| Device engineering | 161 px | 2 lines | 63 px | 264 px | 419 px | — |
| UDI and labeling | 161 px | 2 lines | 63 px | 208 px | 363 px | — |
| Post-market vigilance | 135 px | 3 lines | 336 px | 537 px | 965 px | — |
| Pre-Sub manager | 113 px | 2 lines | 63 px | 345 px | 500 px | "Ask AnA to start a Q-Sub", 284–472 px of 390 |

Two of these are defects a person meets, not a matter of taste:
- the Pre-Sub manager's one primary action ran 82 px past the edge of the screen;
- on Post-market vigilance the context line stood as three columns (188, 83 and 64 px wide; the scope note 336 px
  tall), and the first figure was below the fold.

## What changed

In `client/src/concept2cure/mdx/app.css` only (spec §2, items 1–5): the header wraps with its actions level with
the top; its text block takes the canonical floor; at 640 px and under each later part takes a full line, the title
is 22 px and a row of actions wraps. No markup, text, control or behaviour changed.

## After, measured the same way

At 390×844 (`header-after-390.json`):

| Screen | Text block | Title | Context line | Header | First figure at | An action cut off |
|---|---|---|---|---|---|---|
| Clinical studies | 278 px | 1 line | 73 px | 201 px | 366 px | — |
| Software lifecycle | 278 px | 1 line | 73 px | 220 px | 385 px | — |
| Device engineering | 278 px | 1 line | 73 px | 238 px | 403 px | — |
| UDI and labeling | 278 px | 1 line | 73 px | 201 px | 366 px | — |
| Post-market vigilance | 278 px | 1 line | 144 px | 318 px | 554 px | — |
| Pre-Sub manager | 278 px | 1 line | 73 px | 292 px | 457 px | none: "Ask AnA to start a Q-Sub" is at 56–243 px |

- The context line is the way back (188 px), then the project's name on its own line (243 px), then the scope note
  across the full width (342 px).
- Two screens' first figure is lower by 2 and 3 px (Software lifecycle, UDI and labeling): the context line is 10 px
  taller with the name on its own line, and their headers shrank by less than that. The other four moved up.
- No page scrolls sideways, before or after.

At 1440×900 (`header-before-1440.json`, `header-after-1440.json`), on all six: the title's position, the header's
height, the context line's height and the first figure are identical before and after (first figure at 257, 257,
257, 257, 325 and 276 px). Only the actions move, from the bottom of the header to the top (for example 188 px to
132 px).

## Capabilities kept (P-122)

`facts-summary.json`: the six screens at both widths in light and dark, before and after, made by slice 1's
`compare.cjs` from walks taken minutes apart at the same commit (the change stashed for the "before"). **In all 24
pairs:** the same failed requests (none), no new console error, no new sideways scroll, the same headings, the same
number of controls and the same length of text.

## Red and green

- `client/src/concept2cure/mdx/__tests__/pageHeaderWrapsAtPhoneWidth.test.ts`: 3 of 5 failed with the change taken
  out; 5 of 5 pass with it. The two that pass both ways pin that a row of actions does not wrap above phone width
  and that none of the header's rules is hidden.
- A first build wrapped a row of actions at every width. The probe showed Post-market vigilance's scope note taking
  its own line at 1440 px and the screen moving down 19 px. It was narrowed to phone width and re-measured before
  anything was committed; the test's fourth case holds it.
- The device suites pass. `ci:surface-text-ramp`, `ci:undefined-css-classes`, `ci:class-vocabulary` and
  `ci:check-phantom-tokens` pass.

## Captures

`screenshots/`: Post-market vigilance and the Pre-Sub manager at 390 px, before and after, in light and dark; the
Pre-Sub manager at 1440 px, before and after, in light and dark.

## Review

Not sent to the review lenses: layout only, on the canonical header's own values, with no new colour, token, text or
motion. Read by this session in the captures: at 390 px the title, the description and the actions read in order
down the page, and the primary action is whole.

## Still to do on these screens

- The page's side inset at 390 px is 56 px (24 px from `.page-inner` and 32 px from each block), which leaves 278
  of 390 px for content. It is every block's, not the header's (spec, slice 4).
- The 510(k) screen at 390 px: the pathway bar's title squeezes "Open §11 in editor" and "Export 510(k) package"
  (`.section-hdr` does not wrap), and the seven-stage stepper and the tabs run past the edge.
- The eyebrow is still a separate line above the title (the markup part of slice 2).
