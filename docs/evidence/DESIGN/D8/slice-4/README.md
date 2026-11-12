# D8 slice 4 — the device screens' headings, sub-lines, Audit trail tab and Pre-Sub empty state on the canonical styles

Package **D8** (founder decision **P-128**, 2026-11-12). Spec: `.design/claude-convergence/D8.md`, §4. Session
`session_01E8btkB8mcLirW4rNvsMNxK`.

## What already exists (RULE 3)

Nothing here is new.
- The canonical styles followed, in `client/src/concept2cure/v2/styles/app-v2.css`: the section heading
  `.c2c-v2 :is(.pj-sec-h h2, …)` (line ~182: the section size, line height 1.4, weight 600, sans), its sub-line
  `.pj-sec-h .sec-sub` (the small size, `--text-300`), and the empty state `.c2c-v2 .c2c-empty-state` (lines
  ~423–427: no box, the title in the body size, one sentence in the small size). The device screens' main empty
  states already use that shared component.
- The device rules changed: `.section-head h2`, `.section-title`, `.section-sub`, `.eng-awareness-head h2` and
  `.ps-empty*` in `mdx/app.css`; `.audit-day`, `.audit-chain-label`, `.audit-chain-k`, `.audit-row` and `.audit-chip`
  in `mdx/pathway-tabs.css`.
- The app and its data are the founder's Codespace made from an empty database, on "[Demo · MDX] NeuroPanel-Dx
  510(k)" as Rhea Reviewer.

## How it was scoped

`probe-states.cjs` opened all twelve device screens, and each tab of each, 23 tabs in all, and recorded what a person
meets: the text every uppercase rule of the three device stylesheets styles, and how section headings, sub-lines,
table headings and empty states are drawn (`states-before.json`).

- **Section headings were drawn four ways:** a 17 px serif on six screens (`.section-head h2`), a 14 px serif set
  inline on Clinical studies' "Needs attention", 14 px sans on the three "Situational awareness" disclosures, and 14
  px sans on the 510(k) pathway's title. §2 keeps the serif for the page title.
- **Sub-lines** were 11 px in `--text-400`, set by two rules (`app.css` lines 106 and 1545; the later won).
- **Uppercase:** of 48 uppercase rules in the device sheets, four style something a person meets. Three are on the
  Audit trail tab of 510(k), PMA and Diagnostics: "THURSDAY, NOVEMBER 12", "HASH CHAIN", "PREV · THIS". The fourth is
  the "DHF" code chip, kept on purpose since slice 1.
- **The Pre-Sub detail's empty state** was a dashed, tinted box with its own type.
- **Table headings** already matched the canonical (12 px, weight 500, `--text-300`) and are not changed.
- Found on the way: **every row of the Audit trail tab drew its event code over the person's name** (114–115 rows on
  each of the three screens, `probe-audit-rows.cjs`). The code's column was a fixed 70 px and a code does not wrap.

## What changed

- `mdx/app.css`: the four heading rules take the canonical section heading; `.section-sub` is set once, the small size
  in `--text-300`; the Pre-Sub empty state has no box and the canonical type.
- `mdx/pathway-tabs.css`: the Audit trail tab's day, chain label and chain keys are the caption size in `--text-300`,
  not uppercase or letter-spaced. The chain keys are written "prev", "this" and "seal" in
  `pathway/PathwayPanes.tsx`, which another session holds, so `.audit-chain-k::first-letter` capitalises them. An audit
  row's code column takes the code's width (`minmax(0, max-content)`), and the code ends in an ellipsis past 220 px.
- `mdx/surfaces/ClinicalStudiesSurface.tsx`: the inline 14 px on "Needs attention" is removed.
- `mdx/surface-text-ramp.css`: regenerated; `.ps-empty` no longer paints `--bg-050`.

## After, measured the same way

- `states-after.json`: every device section heading is 15 px, weight 600, sans; every sub-line 13 px in `--text-300`;
  the only uppercase a person meets is the "DHF" chip.
- `probe-audit-rows.cjs`: 0 rows of 115–116 draw the code over the name at 1440 px, on all three screens. At 390 px
  the codes end in an ellipsis and none overlaps; the whole code is in the event's detail beside the list.
- `contrast-after.json` (slice 2c's `probe-contrast.cjs`): no text below AA on the twelve screens, light or dark.

## Capabilities kept (P-122)

`facts-summary.json`, by `compare.cjs` (slice 1's, now comparing failed requests as a set, so two reads failing in a
different order do not count as a difference): the twelve screens at 1440×900 and 390×844, light and dark, before and
after, 48 pairs. **In all 48:** the same failed requests (the predicate reads, 503, on this database), no new console
error, no sideways scroll, the same headings and the same number of controls. One pair differs in the length of its
text, by one character: the 510(k) screen's "Audit trail 99" became "Audit trail 119" between the two walks, because
each walk signs in and reads, which the audit trail records.

## Red and green

- `client/src/concept2cure/mdx/__tests__/sectionsOnTheCanonicalStyles.test.ts`: all 10 first cases failed before the
  change; with the audit-row case added, 11 of 11 pass after.
- The device suites and the shared `faintestTextTier.test.ts`: 114 files, 1,111 tests, all pass.
- `ci:surface-text-ramp`, `ci:check-phantom-tokens`, `ci:class-vocabulary` and `ci:check-shell-css-collisions` pass.

## Review

The design-system lens (an independent reviewer): conforms; every value matches the canonical rule it claims; no
shadowing; all gates pass. Its advisories: the `::first-letter` capital is a stopgap until the held markup says
"Prev", "This", "Seal" (handed over); the 220 px cap is a literal (no token for it); an older `.audit-row` rule in
`app.css` serves the client review room, which imports only that sheet, and is left alone. Accessibility: every
changed text is the same or larger and moved from `--text-400` to `--text-300`, so contrast only rose; no motion or
copy changed.

## Captures

`screenshots/`: the 510(k) Audit trail tab before and after at 1440 px in light, and after at 390 px in dark;
Post-market vigilance, Clinical studies and the Pre-Sub manager before and after at 1440 px in light; Post-market
vigilance after at 390 px in dark.

## Not changed, and handed over

- **The Audit trail shows raw event codes and ids** ("k510_workflow.document_preview.read", the project's UUID), which
  §2 retires. The labels come from `pathway/PathwayPanes.tsx`, which the client administration and screen-work
  session holds (Wave B, W7); handed over in COORDINATION.md.
- **Diagnostics' "Assess, save and review IVD evidence"** is an 18 px heading drawn by
  `v2/surfaces/IvdAssessmentWorkbench.tsx`, a v2 file outside D8.
- 44 uppercase rules remain in the device sheets that style nothing a person meets in any state the probe opened.
