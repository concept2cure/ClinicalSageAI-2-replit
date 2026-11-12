# D8 slice 1a — a device tile's figure takes a status colour only when it means it

Package **D8** (founder decision **P-128**, 2026-11-12). Spec: `.design/claude-convergence/D8.md`, §1a. Session
`session_01E8btkB8mcLirW4rNvsMNxK`.

## What already exists (RULE 3)

Nothing here is new.
- `client/src/concept2cure/mdx/surfaces/PostmarketSurface.tsx` and `UdiSurface.tsx`: the two screens, their tiles
  and the reads that feed them. The figures are unchanged: `mdrDue` and `openCapas` come from the server's triage
  queue, `pendingSig` from the labeling documents.
- The tone's style: `.metric-card[data-tone="err"|"warn"] .metric-val` in `mdx/app.css`, from slice 1.
- The pattern followed: the other toned tiles on these screens already set their tone from their figure, for
  example `triage.overdue.length > 0 ? 'err' : 'ok'` in the same file.

## What was there

Slice 1 moved a tile's tone from its fill to its figure. Its own captures then showed three tiles that set their
tone whatever the figure is (`../slice-1/screenshots/after-1440-light-device-postmarket.png`). On the demo 510(k)
project, read from the running app before this change (`tile-tone-before.json`):

| Screen | Tile | Figure | Tone | Figure's colour, light | dark |
|---|---|---|---|---|---|
| Post-market vigilance | MDRs due ≤72h | 0 | err | `rgb(182, 57, 57)` | `rgb(239, 125, 125)` |
| Post-market vigilance | CAPAs open | 0 | warn | `rgb(149, 93, 34)` | `rgb(217, 154, 88)` |
| UDI and labeling | Awaiting signature | 0 | warn | `rgb(149, 93, 34)` | `rgb(217, 154, 88)` |

A zero is not an error. ONE_DESIGN_PLAN §2: status colour only for meaning.

## What changed

Three attributes:
- `PostmarketSurface.tsx`: "MDRs due ≤72h" is toned `err` only when its figure is above zero, and "CAPAs open"
  `warn` only when it is. With 0, and with no figure (the read failed or has not answered), the tile has no tone.
- `UdiSurface.tsx`: "Awaiting signature" is toned `warn` only when its figure is above zero.

The tone each tile takes above zero is the screen's own and is unchanged.

## Capabilities kept (P-122)

| What a screen shows | Before | After |
|---|---|---|
| Each tile, its label, its figure and its note | shown | shown, unchanged |
| An MDR due within 72 hours | the error colour | the error colour |
| An open CAPA; a label awaiting signature | the warning colour | the warning colour |
| A zero, or a figure that was not read | the error or warning colour | the text colour |

## Red and green

- `client/src/concept2cure/mdx/__tests__/tileToneMeansSomething.test.tsx`: 3 of 4 cases failed before the change
  ("expected 'err' to be ''", twice, and "expected 'warn' to be ''"); 4 of 4 pass after. The fourth case, which
  passed before and after, pins that an MDR due within 72 hours is still `err` and an open CAPA still `warn`.
- `noFavourableDefaults.test.tsx` and `surfaces/__tests__/UdiSurface.refusalNotFailedRead.test.tsx` still pass (17
  cases with the new file).
- In the running app, `probe-tile-tone.cjs` reads every tile's tone and its figure's computed colour. Run with the
  change taken out, it gave the table above. With the change (`tile-tone-after.json`), all eight tiles on the two
  screens draw their figure in the page's text colour, `rgb(20, 20, 19)` in light and `rgb(250, 249, 245)` in dark.

## Walked in the running app

The app is the founder's Codespace made from an empty database (`../../../HUMAN-TEST/CLICK-THROUGH/2026-11-06/README.md`),
on "[Demo · MDX] NeuroPanel-Dx 510(k)" as Rhea Reviewer. Both screens at 1440×900 and 390×844, in light and dark:
no failed request and no console error on any of the eight. Captures: `screenshots/`. The "before" of each is slice
1's "after" (`../slice-1/screenshots/`).

The non-zero case could not be shown in the running app: the demo project has no MDR event, CAPA or label. It is
held by the test's fourth case.

## Not changed, and handed over (COORDINATION.md)

- **Device engineering**, `EngineeringSurface.tsx`, held by another session: "Open risks" is `data-tone="err"`
  whatever its figure, and "Open change requests" is `warn` whenever the read is the project's, 0 included.
- **UDI and labeling**: "Awaiting signature" and "Blocked documents" count a list that carries no signature state
  and no blocker (`toLabelDocuments` sets neither), so both read 0 whatever the labels are. A figure nothing feeds
  is an honest-state repair, not a design one, and is the device journey lane's.
- "Blocked documents" is toned `ok` at 0. `ok` draws no colour since slice 1, so nothing shows.

## Review

Not sent to the review lenses: three attributes, no new text, colour, token or motion. The accessibility effect is
that a zero no longer carries a status colour; the toned colours and their contrast are those measured for slice 1
(`../slice-1/README.md`).
