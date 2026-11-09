# One page frame across the work areas (D0.md §8.6, 2026-11-09)

**The finding.** The running-app walk (`../D0-15-running-app-walk/`, item 8) measured where each work area's page
title starts at 1440, with the content area starting at x = 264 everywhere. There were four different left edges:

| Title x | Screens | Frame |
|---|---|---|
| 332 | Tasks, Review | the canonical `.page-inner` |
| 322 | Submission Center | `.sc-page` max-width 1140 |
| 304 | Projects | `.pj-index` padding read 1120 as the content width |
| 304 | IND lifecycle | `.page-inner.indl` max-width 1280 |
| 294 | the project | `.pj` padding 26/30, max-width 1240 (and a second `.pj` max-width 1180) |
| 294 | Communication | `.cc` padding 26/30, plus an inline `maxWidth: 1200` |
| 294 | RBM | `.rbm-page` padding 26/30, no max-width |

## What already exists (RULE 3)

- **The canonical frame.** `.c2c-v2 .page-inner` (`app-v2.css:147–149`): max-width 1120 (border-box, padding
  included), centred, padding 32/40/96, 24/24/80 at ≤1023px and 20/16/72 at ≤640px. `.c2c-v2 .sp` (`journey-v2.css`)
  has the same values. At 1440 the title is at 264 + 28 + 40 = 332.
- **The decision.** D0.md §8.6 (2026-11-09): "A work area does not set its own page padding."
- **No new frame class or token is added.** Each screen takes `.page-inner`, or keeps a root that computes the same
  values.

## The change

**Stylesheets (D0):**

| File | Change |
|---|---|
| `journey-v2.css` | `.pj` keeps only what its root needs (`height:100%`, `overflow-y:auto`, `flex:1 1 auto`, `min-width:0`, the J1 fix j1PageLayout pins). Its padding, max-width and margin go. |
| `app-v2.css` | The second `.pj { max-width:1180px }` is deleted. One rule now governs `.pj`. |
| `commcenter-v2.css` | `.cc { padding:26px 30px 80px }` is deleted. |
| `rbm-v2.css` | `.rbm-page { padding:26px 30px 60px }` and its "No max-width" note are deleted. |
| `submission-v2.css` | `.sc-page { max-width:1140px }` is deleted. `.sc-page .pj-card-b-flush` stays. |
| `coverage-v2.css` | `.page-inner.etmf, .page-inner.indl, .page-inner.vd { max-width:1280px }` is deleted. |
| `project-home-v2.css` | `.pj-index`'s padding is `max(40px, calc((100% - 1120px) / 2 + 40px))`, so its 1120 is the page with padding included, as `.page-inner`'s is. Its media steps already matched. |

**Roots (F1, a separate commit, since surfaces are outside D0's ledger paths):**
- `BiopharmaJourney.tsx`: its four `.pj` roots become `page-inner pj`.
- `CommunicationCenter.tsx`: `cc` with an inline `maxWidth: 1200` becomes `page-inner`. This is RIM's Communication
  surface; the change is the one layout line.
- `Rbm.tsx`: `rbm-page` becomes `page-inner`.
- `IndLifecycle.tsx`: its four roots become `page-inner`.
- `Etmf.tsx`: `page-inner etmf` becomes `page-inner`.
- `Vault.tsx`: `page-inner vd vd-wrap` becomes `page-inner vd-wrap`.

**Tokens and the RBM test.** The bare tokens `cc`, `rbm-page`, `indl`, `etmf` and `vd` had no other rule. They are
removed, so `ci:undefined-css-classes` stays green. `rbmPageChrome.test.tsx` now pins `page-inner` on RBM's root, where
it used to pin `rbm-page`.

**RBM's docked AnA.** RBM's docked AnA column is open by default and 352px wide. Inside the frame, RBM's content is
672px at 1440, the same two-column shape as the project page (main column beside the 320px Project knowledge). Nothing
overflows (`rbm-1440-light.png`).

## After, in the running app

**The stack.** The walk's `git archive` copy with these files copied in, `:5100`, RLS and launch scope on, signed in
through the UI. The project is C2C-101. Probe: `frame-probe.cjs`; figures: `frame-after.json`.

| Screen | Title x at 1440, before → after | Root | Sideways scroll | Past a card |
|---|---|---|---|---|
| Projects | 304 → **332** | `.pj-index`, padding 68 | none | none |
| The project | 294 → **332** | `.page-inner.pj`, 1120 | none | none |
| Submission Center | 322 → **332** | `.sp.sc-page`, 1120 | none | none |
| Tasks | 332 → 332 | `.page-inner` | none | none |
| Review | 332 → 332 | `.page-inner` | none | none |
| Communication | 294 → **332** | `.page-inner` | none | none |
| RBM | 294 → **332** | `.page-inner` (content 672, AnA open) | none | none |
| IND lifecycle | 304 → **332** | `.page-inner` | none | none |
| Vault | not measured before → **332** | `.page-inner.vd-wrap` | none | none |
| eTMF | not checked: "not in this release" under launch scope | | | |

- **At 390.** Every title is at x = 16 (padding 16) and no page scrolls sideways.
- **The probe's "past the viewport" hits at 390.** The project, IND lifecycle and Vault show some. They are SVG icon
  paths inside rows that scroll by themselves (the step tabs and table rows); the page does not move.
- **Before, at 390.** `.pj` and `.cc` had no step-down, so their 26/30 padding applied at 390 too. They now step down
  with the frame.
- **Screenshots.** `<screen>-1440-light.png` for the nine screens.

**One change in look.** The project page scrolls inside its own frame (`.pj`, a flex item of `.page-full`), so at 1440
its scrollbar sits at the frame's right edge, as it already did at widths past 1240. Projects keeps the
padding-computed frame because its scroller spans the row.

## Gates and tests

- **CSS gates:** `ci:check-phantom-tokens`, `ci:check-css-selector-shadowing`, `ci:undefined-css-classes`,
  `ci:token-cascade` and `ci:surface-text-ramp` are all OK.
- **Client suites:** those that pin these frames or render these surfaces. That covers `d0SpecDecisions`,
  `j1PageLayout`, `rbmPageChrome`, `submissionCenter*`, `projectsCardLine`, `projectHome*`, the CSS and frame tests,
  and the Communication, Biopharma journey, IND lifecycle, eTMF, Vault and Projects suites. 171 files, 1,724 tests,
  all pass.
- **ESLint:** warning counts on the touched files are equal to HEAD's.

## The probe, linted and re-run (2026-11-09, before the push)

The pre-push ESLint ratchet refused the first `frame-probe.cjs` with 7 new warnings (complexity, nesting depth,
`console.log`, an undeclared global). It is now written as small functions and measures the same things. It was re-run
on the same stack (`walk-1109`, the server started again from the same copy and stopped the same way), and
`frame-after.json` is now that run's output.

- **Compared with the first run:** every screen's title x is identical. The 390 "past the viewport" hits are the same
  SVG paths inside rows that scroll by themselves.
- **ESLint:** clean on the probe.
