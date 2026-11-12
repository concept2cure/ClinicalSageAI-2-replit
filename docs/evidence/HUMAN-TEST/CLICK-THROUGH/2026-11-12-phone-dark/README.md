# The launch screens at a phone's width and in dark, measured (2026-11-12)

Launch row **D2** (the launch catalog works in the app). Session `session_011DpxUyQmE1enma4gTjcfBy`.

**Read this first.** Phone width and dark already had an owner and an audit when this run began. S11's session
(`01QoxbLdJq…`) took it from this session's open list and filed
`docs/evidence/HUMAN-TEST/PHONE-DARK/2026-11-12/` at 03:41 UTC: 39 screens at 390 px light, 390 px dark and 1440 px
dark, with each finding routed to its lane in `.design/claude-convergence/COORDINATION.md`. This session did not read
that row and began its own at 04:10 UTC. That was a failure to search first (RULE 3). The run was stopped when it
was seen. **That audit is the record, and its routing stands.** This file holds only what a wider measurement adds
to it.

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
- **`docs/evidence/HUMAN-TEST/PHONE-DARK/2026-11-12/` (S11's session): the audit of 39 screens described above.** It
  found no screen scrolling sideways at 390 px among its 39, and text below AA listed by class and stylesheet,
  "mostly one cause: the faintest text token on a page background".

New here, as a script only: `shapewalk.cjs`. It opens each screen and tab and measures. At 390 px: how far the page
scrolls sideways, and which elements run past the right edge outside a sideways scroller of their own. In dark: every
large opaque light block, and every text whose contrast against its own background is under 3:1. It measures; each
result was then opened and looked at.

## How it ran

The sandbox's Codespace build, the built client (`npx vite build`, served with `SKIP_VITE=1`), the launch-scope gate
on, as Ana Author. 134 screens and tabs in each mode, about nine minutes a mode.

## Phone width: 390 px

**128 of 134 screens and tabs hold to the page.** Six scroll sideways, on two screens. Neither screen was among
the audit's 39, which is why it reports none.

| # | Found | Outcome |
|---|---|---|
| 1 | **Admin console: the page scrolled 429 px sideways.** The one-column members layout was written `1fr`, which is `minmax(auto, 1fr)`: the members table's seven columns made the column, the section and the member's drawer 819 px wide. The six tabs sat in a row that could not scroll, squeezed until "Roles + scopes" broke over three lines, and the last still ran past the edge. | **Fixed** (`98c974321a`, `styles/admin-access.css`): the column is `minmax(0, 1fr)`; the table scrolls inside its own box at a width its columns can read; the tabs scroll in their own row on one line; the drawer sits under the table. Pinned in `adminAccessPhoneWidth.test.ts`, shown failing first. **Measured again in the running app:** 0 px sideways, and the fourth tab clicked. One defect only the running app showed and the test now pins: a box that scrolls has no minimum height, so in the page's column the row of tabs collapsed to its padding and hid them. |
| 2 | **RBM, three tabs.** Risk assessment (RACT): 465 px sideways (the likelihood-by-impact grid and the critical-to-quality register do not stack). Quality tolerance limits: 308 px (the limits table has no box to scroll in). Site oversight: 25 px (a card header 397 px wide inside a card whose overflow is hidden). | **Sent to the session that holds RBM's screens** (`01QoxbLbUD…`), with the elements and widths. A commit landed on trunk at 04:27 UTC, after this was measured: "D7: the risk review report's actions wrap on a phone, so every RBM tab holds to the page at 390". Not measured again here. |

The admin console is client administration's (`01T2woo…`, by S11's row), which this session learned after the
repair. That session has been told what changed and may ask for the commit to be dropped.

## Dark

**No light block is left behind on any of the 134.** Dark was on for 133 as they were measured; the one that was
not (Submission Center's Builder on the CSR study) was dark when opened again, with nothing to report.
Six texts measured under 3:1:

| # | Found | Outcome |
|---|---|---|
| 3 | **Text a person reads is set in the faintest text tier**: the audit's finding, confirmed across 134 screens (`.tb-empty`, `.rbm-col-empty`, `.pd-tree-opt` under 3:1 in dark). `scripts/ci/check-token-contrast.mjs:218-226` already states the rule: after the 2026-09-03 repair, "what is left on --text-500 is genuinely disabled or ornamental". An accessibility read of every `color: var(--text-500)` in the client (static; nothing opened) found 77 declarations: **23 on readable text with a consumer found**, 3 placeholders and 2 disabled controls (exempt), 18 decoration, and 31 whose class has no consumer found. The 23, by stylesheet: `app-v2.css` 7 (`.tb-empty`, `.pj-act-n`, `.art-kind`, `.reg-pill.na`, `.ct-ground-l`, `.ct-att-chip[data-status="uploading"] em`, `.dj-step-meta`); `coverage-v2.css` 2 (`.indl-h-x`, `.indl-proj`); `research-v2.css` 2 (`.pd-tree-opt`, `.pd-soa-vw`); `pyramid-v2.css` 2 (`.py-over.ok`, `.py-cov-row .n`); `rbm-v2.css` 1 (`.rbm-col-empty`); `mdx/` 5 (`.dd-doc-hint`, `.dd-att-drop-sub`, `.status-pill.na`, `.status-pill.empty`, `.ftp-trunc`); `pdev/app.css` 1 (`.pdev-state-pill.state-neutral`); inline styles 3 (`ClinicalStudiesSurface.tsx:437`, `Orchestration.tsx:923`, `:1360`). One step up the ramp (`--text-400`; `--text-300` on a tinted surface) clears each. | **Open, routed as the audit routes it.** The rows in S11's, RBM's and the device lane's stylesheets were sent to those sessions. The shell's (`app-v2.css`) and the unheld sheets' are not repaired here: the audit sent them to the shell lane and the IND lifecycle lane, and this session does not take another lane's rows a second time. |
| 4 | White on the accent: the AnA drive button (2.4:1) and the member avatars' initials (3.0:1). | **Not changed.** The accent with white text is the product's primary colour pair; whether it meets AA for small text is D0's and the founder's call, and it is the same in light. |

## Repaired, 2026-11-12 16:50 UTC: the faintest tier holds no readable text in the v2 stylesheets

No session held the six stylesheets, and finding 3 had not moved since the morning. `011Dpx…` wrote its row and
repaired them under F1:

- **A test first:** `client/src/concept2cure/v2/__tests__/faintestTextTier.test.ts`. Every `color: var(--text-500)`
  in `client/src/concept2cure/v2/styles/` must be an ornament named with its reason (a row-go arrow, a caret, a pin
  beside a label), a separator glyph, a placeholder or a disabled control. It failed on 34 selectors in
  `app-v2.css` (21), `coverage-v2.css` (6), `journey-v2.css`, `pyramid-v2.css`, `rbm-v2.css` and `research-v2.css`
  (1 in `journey-v2.css`, 2 in each of the others). Each is now `--text-400`, which is 4.5:1 on the page and is re-based on every
  tinted surface by the generated ramp (`styles/surface-text-ramp.css`). The exception is `.reg-pill.na`, which
  paints its own `--bg-100`, so it takes `--text-300`. `.avb-key` also loses an `opacity: 0.6` that halved it again.
  The test also fails if a named ornament leaves the stylesheets, so the list cannot keep a stale exception.
- **Gates:** `ci:surface-text-ramp` (the generated ramp still matches), `ci:token-contrast` (131 pairs) and
  `ci:check-shell-css-collisions` pass.
- **Measured in the running app** (`contrast.cjs`, the built client): the RBM board's "Configure" control and the
  project page's activity dates read **4.50:1 in light and in dark**, from 2.11:1 and 2.76:1. The others were not on
  screen with this data; they use the same token.
- **Not repaired here:** `client/src/concept2cure/mdx/**` (5 uses; D8's row holds `mdx/app.css`) and
  `client/src/concept2cure/pdev/**` (1), sent to their holders.

## Not covered

- Clicks at 390 px or in dark: dialogs, menus, the editor's toolbars.
- The Lumen account's screens; tablet widths; a real phone's touch behaviour.
- Dark with text between 3:1 and 4.5:1: the measure flags under 3:1 only, to stay readable.
