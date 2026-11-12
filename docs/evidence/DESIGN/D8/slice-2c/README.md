# D8 slice 2c — "empty" and the eSTAR section number are drawn in a colour a person can read

Package **D8** (founder decision **P-128**, 2026-11-12). Spec: `.design/claude-convergence/D8.md`, §2c. Session
`session_01E8btkB8mcLirW4rNvsMNxK`.

## What already exists (RULE 3)

Nothing here is new.
- **The finding is another session's.** The phone and dark audit of 2026-11-12
  (`../../../HUMAN-TEST/PHONE-DARK/2026-11-12/README.md`, session `…01QoxbLdJq`) measured the launch screens in the
  running app and sent two classes to the device lane: `status-pill` "empty" at 1.91:1 in light and 2.41:1 in dark,
  and `estar-num` at 3.90:1 and 4.29:1. This slice fixes them.
- The rules: `.status-pill.empty`, `.status-pill.na` and `.estar-num` in `client/src/concept2cure/mdx/app.css`.
- The tokens: `--text-500` is the disabled ink (`--ink-disabled`) and `--text-300` the muted ink
  (`design-system/colors_and_type.css`). The generated ramp (`mdx/surface-text-ramp.css`) re-bases the muted ink on
  each tinted ground.
- The method: `probe-contrast.cjs` measures as the audit's `audit.cjs` does (the text's colour against its
  background; 4.5:1, or 3:1 for large text; disabled controls exempt). It also blends a part-transparent background
  over what is behind it, and lists every class with how many texts it styles.
- The app and its data are the founder's Codespace made from an empty database, on "[Demo · MDX] NeuroPanel-Dx
  510(k)" as Rhea Reviewer.

## What was there

`probe-contrast.cjs` over the twelve device screens at 1440×900, in light and dark (`contrast-before.json`):
- **510(k):** `.status-pill.empty`, 38 pills reading "empty", 1.91:1 in light and 2.41:1 in dark; `.estar-num`, 36
  section numbers below 4.5:1, the lowest 3.90:1 in light and 4.29:1 in dark. The same numbers the audit found.
- **The other eleven screens:** no text below AA, in light or dark.

`probe-ratio.cjs` reads each element (`ratio-before.json`):

| Class | Elements | Light | Dark |
|---|---|---|---|
| `.status-pill.empty` | 38 | 1.91:1 (`#b0aea5` on `#f0eee6`) | 2.41:1 (`#6b6963` on `#30302e`) |
| `.estar-num` | 38 | 3.90:1 on a blocker row's tint (`#71706a` on `#f5dfdd`), 4.51:1 on the panel | 4.29:1 on the tint (`#94928a` on `#4a2424`), 4.55:1 on the panel |

"empty" was drawn in the disabled ink. It is not a disabled control: it is the state of a section a person has to
fill, on 38 of the list's 38 rows.

## What changed

In `client/src/concept2cure/mdx/app.css` only:
- `.status-pill.empty` and `.status-pill.na` take the muted ink (`--text-300`) on the same ground. The empty pill
  keeps its dashed border. `.na` is the same colour pair by its rule, and no screen showed one on arrival.
- `.estar-num` takes the muted ink in place of `--text-400`.

## After, measured the same way

`contrast-after.json`: **no text below AA on any of the twelve screens, in light or dark.** `ratio-after.json`:

| Class | Light | Dark |
|---|---|---|
| `.status-pill.empty` | 5.25:1 (`#64625c` on `#f0eee6`) | 5.95:1 (`#b0aea5` on `#30302e`) |
| `.estar-num` | 4.51:1 on a blocker row's tint (`#686660` on `#f5dfdd`), 5.21:1 on the panel | 6.02:1 on the tint, 6.38:1 on the panel |

The section number on a blocker row in light clears 4.5:1 by one hundredth. It passes; it has no room.

## Capabilities kept (P-122)

No markup, text or control changed. The four pathway screens at 1440×900 in light and dark, before and after
(`facts-summary.txt`): 8 pairs, none differs in failed requests, console errors, headings, controls, text length or
sideways scroll. Colour was never the pill's only signal: it says "empty" in words and has a dashed border.

## Red and green

- `client/src/concept2cure/mdx/__tests__/deviceTextMeetsContrast.test.ts`: 4 of 5 failed before; 5 of 5 pass after.
  The fifth, which passes both ways, pins the empty pill's dashed border.
- Its last case counts the declarations that draw text in the disabled ink: 7 in `app.css` before, 5 after; 2 in
  `pathway-tabs.css`; 1 in `files-tree.css`. The count only goes down.
- `ci:surface-text-ramp`: the generated ramp sheets still match. The device suites pass.

## Captures

`screenshots/`: the 510(k) screen at 1440 px, before and after, in light and dark.

## Not changed

Eight more declarations draw text in the disabled ink, in states this slice did not open: a project list's "no
blocker" and its actual date (`.pg-list-blocker.none`, `.pg-list-due .act`), an editor block's provenance label
(`.ed-prov-lbl`), the eSTAR row's open arrow (`.estar-open`, an icon shown on hover), a dossier drawer's hints
(`.dd-doc-hint`, `.dd-att-drop-sub`) and a truncated file path (`.ftp-trunc`). Each is measured when its state is
opened; the test holds the count.

## Review

Not sent to the review lenses. This is an accessibility repair measured against WCAG 2.2 AA (1.4.3) in the running
app, by the method of the audit that found it. Not rendered through a screen reader; nothing a screen reader reads
changed.
