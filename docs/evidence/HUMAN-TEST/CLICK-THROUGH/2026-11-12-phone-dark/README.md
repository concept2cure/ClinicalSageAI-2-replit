# The launch screens at a phone's width and in dark, measured (2026-11-12)

Launch row **D2** (the launch catalog works in the app). Lead session `session_011DpxUyQmE1enma4gTjcfBy`. No session
held phone width and dark across the launch screens; this one took it at 04:10 UTC
(`.design/claude-convergence/COORDINATION.md`, "The GA run").

## What already exists (RULE 3)

Nothing was built.

- The screens and tabs are the 134 the click-through of 2026-11-10 reached as Ana Author (`../2026-11-10/`), which
  the release-gate run opened again (`../2026-11-11-release-gate/`).
- Phone width was fixed screen by screen before: the human-test sessions of 2026-11-06 (Tasks, Submission Center and
  others at 390 px), D0's phone-width fixes (`docs/evidence/DESIGN/D0/D0-9-phone-width/`, pinned by
  `d0PhoneWidth.test.ts`) and the review route (`reviewRoutePhoneWidth.test.ts`). Nobody had measured every screen.
- Dark is one switch (`c2c-v2-prefs`, `V2App.tsx`), re-based by the stylesheets' `[data-theme="dark"]` blocks and
  `styles/surface-text-ramp.css`. `scripts/ci/check-token-contrast.mjs` checks the tokens, not the screens.
- `../2026-11-11/` (session `01E8btkB…`) read the screens at 1440 px in light, and names phone width and dark as not
  walked.

New here, as a script only: `shapewalk.cjs`. It opens each screen and tab and measures. At 390 px: how far the page
scrolls sideways, and which elements run past the right edge outside a sideways scroller of their own. In dark: every
large opaque light block, and every text whose contrast against its own background is under 3:1. It measures; each
result was then opened and looked at.

## How it ran

The sandbox's Codespace build, the built client (`npx vite build`, served with `SKIP_VITE=1`), the launch-scope gate
on, as Ana Author. 134 screens and tabs in each mode, about nine minutes a mode.

## Phone width: 390 px

**128 of 134 screens and tabs hold to the page.** Six scroll sideways, on two screens.

| # | Found | Outcome |
|---|---|---|
| 1 | **Admin console: the page scrolled 429 px sideways.** The one-column members layout was written `1fr`, which is `minmax(auto, 1fr)`: the members table's seven columns made the column, the section and the member's drawer 819 px wide. The six tabs sat in a row that could not scroll, squeezed until "Roles + scopes" broke over three lines, and the last still ran past the edge. | **Fixed** (`98c974321a`, `styles/admin-access.css`): the column is `minmax(0, 1fr)`; the table scrolls inside its own box at a width its columns can read; the tabs scroll in their own row on one line; the drawer sits under the table. Pinned in `adminAccessPhoneWidth.test.ts`, shown failing first. **Measured again in the running app:** 0 px sideways, and the fourth tab clicked. One defect only the running app showed and the test now pins: a box that scrolls has no minimum height, so in the page's column the row of tabs collapsed to its padding and hid them. |
| 2 | **RBM, three tabs.** Risk assessment (RACT): 465 px sideways (the likelihood-by-impact grid and the critical-to-quality register do not stack). Quality tolerance limits: 308 px (the limits table has no box to scroll in). Site oversight: 25 px (a card header 397 px wide inside a card whose overflow is hidden). | **Sent to the session that holds RBM's screens** (`01QoxbLbUD…`, started 2026-11-12), with the elements and widths. |

## Dark

**No light block is left behind on any of the 134.** Dark was on for 133 as they were measured; the one that was
not (Submission Center's Builder on the CSR study) was dark when opened again, with nothing to report.
Six texts measured under 3:1:

| # | Found | Outcome |
|---|---|---|
| 3 | **Three messages a person reads are set in the faintest text tier.** `.tb-empty` (an empty column on the Tasks board, `app-v2.css`), `.rbm-col-empty` (an empty column in RBM's monitoring plan) and `.pd-tree-opt` (`research-v2.css`) use `--text-500`: 2.6:1 in dark, and about 2.2:1 in light, where the walk did not look. WCAG 2.2 AA asks 4.5:1 for text. The tier has about 36 uses in `app-v2.css`. | **Open, with D0's holder.** A token's use is the design system's, not a repair to make in three places. The full list of readable text in that tier is being drawn up and is added here. |
| 4 | White on the accent: the AnA drive button (2.4:1) and the member avatars' initials (3.0:1). | **Not changed.** The accent with white text is the product's primary colour pair; whether it meets AA for small text is D0's and the founder's call, and it is the same in light. |

## Not covered

- Clicks at 390 px or in dark: dialogs, menus, the editor's toolbars.
- The Lumen account's screens; tablet widths; a real phone's touch behaviour.
- Dark with text between 3:1 and 4.5:1: the measure flags under 3:1 only, to stay readable.
