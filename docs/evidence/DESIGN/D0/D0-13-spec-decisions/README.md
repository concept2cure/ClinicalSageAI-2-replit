# D0-13: the D0-owned decisions of D0.md §8, made in the stylesheet (2026-11-09)

**The finding.** The D0 review (`docs/evidence/DESIGN/D0/review/`) asked seven spec questions. They were decided in
`.design/claude-convergence/D0.md` §8 (`ce6ba73b18`, under the founder's delegation, P-107). Four of the seven are
fixes in D0's own file, `client/src/concept2cure/v2/styles/app-v2.css`. This commit makes those four. The other three
belong to their owners or are already done:
- §8.1, the spark: each owner adds `icon: I.sparkles` to its own `ask()` actions first, then D0 flips the default.
- §8.6, one page frame: the owners delete `.pj`, `.cc` and `.rbm-page` padding.
- §8.7, the four §7 texts: corrected in `ce6ba73b18`.

## What already exists (RULE 3)

- **`app-v2.css`, buttons.** The rule `:is(.btn, .reg-cta, .landing-newproj):disabled` sets `opacity: .5`. On a
  primary that left a faded orange fill, which still counts as the view's one orange (§7 check 2) and reads as
  available.
- **`journey-v2.css:283`.** `.sp-primary:disabled` already has the grey treatment: `--bg-200` fill, a transparent edge
  and `--text-400` ink. The primary now takes that same treatment. No new token or class is added.
- **`app-v2.css`, coarse pointer.** An existing `@media (pointer: coarse)` rule gives `.btn`, `.reg-cta`,
  `.landing-newproj` and `.sp-primary` 44px. Tabs, segmented items, the composer's send and a drawer's close stayed at
  36, 28, 32 and 32px. Those sizes pass WCAG 2.5.8 AA (24px) but not the 44px §8.5 sets for touch.
- **`app-v2.css`, composer chrome.** The rule `:is(.landing-composer, .pj-composer, .ct-composer)` rests on
  `1px solid var(--border)`, which is 1.41:1 against the page. `--border-control` already exists
  (`colors_and_type.css`), is checked by `ci:token-contrast`, and clears 3:1.
- **`app-v2.css`, answer line.** `.al-h` was 600, the weight of a section heading. `.al-lead`'s margin was `0 0 24px`,
  so the lead touched the line above it.
- **Guards that already read these rules.** Twelve D0 and composer suites read `app-v2.css` through
  `__tests__/_cssRules.ts`. All 228 cases still pass.

## The change

| §8 | Rule in `app-v2.css` | Before | After |
|---|---|---|---|
| 8.2 | `:is(.btn.primary, .reg-cta, .landing-newproj):disabled` (and `:hover`) | `opacity: .5` over orange | `opacity: 1; background: var(--bg-200); border-color: transparent; color: var(--text-400)` |
| 8.3 | `.al-h` / `.al-lead` | 600 / `0 0 24px` | 500 / `24px 0` |
| 8.4 | composer chrome | `1px solid var(--border)` | `1px solid var(--border-control)` |
| 8.5 | `@media (pointer: coarse)` | buttons only | plus `.tab, .reg-tab, .sc-ws, .cc-tab, .seg-b, .ml-seg-btn` at `min-height: 44px`, and `.landing-send, .pj-comp-send, .ct-comp-send, .de-x` at 44 × 44 |

- **Other buttons.** A disabled button that is not a primary keeps `opacity: .5`.
- **Fine pointer.** Sizes on a fine pointer do not change.

**Contrast of the composer's edge** (`--border-control` against the page and against the composer's fill):

| Mode | Against the page | Against the fill |
|---|---|---|
| Light | 3.91:1 | 4.12:1 |
| Dark | 4.36:1 | 3.80:1 |

For comparison, `--border` was 1.41:1, and `--border-strong` in dark would have been 1.70:1. That is why §8.4 names
`--border-control`, not `--border-strong`.

**Documents updated in the same commit:**
- `.design/claude-convergence/D0.md`:
  - §7 check 12 now names the `--border-control` edge;
  - §8.1 now states the order: owners add the spark first, then D0 flips the default.
- `design-system/README.md`: Disabled (grey primary), Touch (44px) and Borders (the composer's edge).

## Red, then green

`client/src/concept2cure/v2/__tests__/d0SpecDecisions.test.ts` reads the stylesheet with the shared rule parser, because
jsdom paints nothing. It pins each decision in the rule that carries it.

| Run | Result | Detail |
|---|---|---|
| At `ce6ba73b18` (`red-at-head.txt`) | 4 of 4 fail | `null` for the grey fill; `'0 0 24px'` for the margin; `'1px solid var(--border)'` for the edge; `undefined` for 44px |
| With this change (`green.txt`) | 4 of 4 pass | |

## Gates

- **CSS gates, all OK:**
  - `ci:undefined-css-classes`
  - `ci:token-contrast` (131 pairs)
  - `ci:check-shell-css-collisions` (22 = baseline)
  - `ci:check-css-selector-shadowing` (0 new)
  - `ci:check-phantom-tokens` (8 = baseline)
  - `ci:token-cascade`
- **D0 and composer guard suites:** 12 files, 228 of 228 pass.
- **ESLint:** clean on the new test.

**What this is not.** It is not the running-app walk. The grey primary, the 44px targets and the composer's edge are
seen in the seeded app at 1440 and 390 in the D0 acceptance walk (D0.md §7), still owed.
