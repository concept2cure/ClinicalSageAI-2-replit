# D1-1: the sidebar (D1 §D1.A)

**Package:** D1, Shell, Home and the conversation (`Plan: D1`).
**Step:** D1-1 of `.design/claude-convergence/BUILD_ORDER.md` §1 D1: `v2/Shell.tsx` (`Rail`, `RailRecents`,
`AccountMenu`), `v2/V2App.tsx` (`onOpenRail`), and in `styles/app-v2.css` the phone block and the rail block, found by
selector.
**Spec:** `.design/claude-convergence/D1.md` §D1.A (steps 1–8), with §D1.B step 2 (the phone sidebar button, which
§D1.A step 5 brings into this step) and §D1.I (the tests).
**Read at:** `b854c54c2b` on `concept2cure-v2`, 2026-11-01 (D1-4 is `14dce5e38`; the three commits after it touch only
`COORDINATION.md`). The spec's line numbers were read at `e11b3bfb72`; the lines below are re-read at `b854c54c2b`.
**Order:** after D1-4, before D1-2 and D1-3, which share `Shell.tsx` (BUILD_ORDER §1 D1, "Order").

This step adds no screen, route, service, table, mount, AnA tool or component file (RULE 6). "New conversation" is an
action beside Search, not a `RAIL_CORE` entry, so `ci:one-product`'s baseline is unchanged. It finishes the existing
sidebar and reaches three existing pieces from it: `WhatAnaRemembers.tsx`, `OrganizationAccess.tsx` and the project
list route.

---

## What already exists (RULE 3)

### Searches run

- `grep -rn` over `client/src/concept2cure/v2` for `Rail`, `RailRecents`, `AccountMenu`, `rail-new`, `rail-actions`,
  `rail-foot`, `rail-account`, `rail-logo`, `rail-scrim`, `railCollapsed`, `onOpenRail`, `tb-rail`, `.avatar`,
  `acct-head`, `WhatAnaRemembers`, `OrganizationAccess`, `openProjectHome`, `PALETTE_PROJECTS_URL`,
  `api/c2c/projects`, `landing-input`, `New conversation`, `--rail`, `--rail-collapsed`.
- `grep -rn` over every `client/src/concept2cure/v2/styles/*.css` for the rail, avatar and account selectors, and for
  every reader of `--rail` / `--rail-collapsed` (including `authoring-v2.css`'s editor grid).
- `git log --all --diff-filter=D --name-only` on `*Rail*`, `*Sidebar*`, `*AccountMenu*`, `*RailRecents*`, `*rail*`
  (the clone is not shallow: `git rev-parse --is-shallow-repository` → `false`). Found: the nine per-family
  `shell/Rail.tsx` files and `components/ana/Sidebar.tsx`, deleted in `2895218b8` (2026-08-04, "one shell"), and the
  AnA right rail's tests, deleted in `9a94754c6` (2026-10-08). `Shell.tsx` `Rail` is the one sidebar that replaced
  them; nothing here rebuilds any of them.
- `git log -S "'New conversation'"` over `registryModel.ts` and `Shell.tsx`: `327bc9fb6` (2026-10-16) replaced the
  rail's `{ id: 'new-conversation', label: 'New conversation', icon: 'plus', target: 'home' }` entry with Home, and
  `9a94754c6` before it. The action comes back as an action that opens Home's composer, not as a place.
- `grep -rln` over `client/src/concept2cure/v2/__tests__` for `<Rail`, `rail-nav`, `rail-scroll`, `rail-foot`,
  `rail-account`, `getByTitle('Ada Rowe')`, `New conversation`, to find every test that pins the look or the order.

### The pieces this step changes

| Piece | Path (lines at `b854c54c2b`) | What it does today | What it does not do |
|---|---|---|---|
| Sidebar | `v2/Shell.tsx` `Rail` 135–389 | Brand (`rail-logo`, with `data-on` on Home, 273–286) and the collapse toggle (260–269, in the foot when collapsed); the places from `RAIL_CORE` (296); **Search as a second `.rail-nav` under the places, inside `.rail-scroll`** (297–304, only when `onSearch` is passed); the work areas under "Work areas" (305–310); Recents (311–315, expanded only); the foot (317–368): the collapse toggle when collapsed, then the account button. Licence locks open `NavUnlockPanel` (378–385). Leave guard (`useShellLeaveGuard`, 77–97) on every navigation. `open()` (200–213) applies a place's screen action and says when a project screen lands on Projects. | No "New conversation". Choosing an item never closes the phone drawer. |
| Account button | `Shell.tsx` 319–336 | `title={name}`; the avatar's initials; the name; the second line is the **raw role value** (`user.roles[0]`, e.g. "admin"). | No organisation. |
| Account menu | `Shell.tsx` `AccountMenu` 451–630; `AccountItem` type 391 | Head (571–577): avatar, name, raw role. Items (484–538): Account; Admin, Subscription & features, Access requests only when `isOrgAdmin` (491, 499, 518); Platform licensing only when `platformAdmin` (506); Codebase coverage only when `platformAdmin && available('coverage')` (512); Usage & limits; the client type (menuitemradio group); Subscription & billing (billing admin) or Compare subscriptions; Set up a workspace; Get help; Log out. WAI-ARIA menu keyboard (546–566). | No way to "What AnA remembers" outside the conversation header. |
| Recents | `Shell.tsx` `RailRecents` 414–449 | `GET /api/chat/threads?limit=15`; honest "Loading…", "Couldn't load your conversations." (`role="alert"`) and "Your conversations appear here."; each thread reopens it (`window.C2C_CONVO = { id }`, `conversation-thread`) behind the leave guard. | No projects. |
| Top bar | `Shell.tsx` `TopBar` 681–796 | Renders `<OrganizationAccess />` at 755, beside the `.tb-org` label. No sidebar button. | Nothing opens the sidebar from the top bar. |
| Shell | `v2/V2App.tsx` 1307–1333 | Renders `Rail` (`setCollapsed={(v) => set('railCollapsed', v)}`, `onSearch`), the `.rail-scrim` while expanded (1322–1324, tap collapses), and `TopBar` (no `onOpenRail`). Escape collapses the expanded rail at ≤640px only (1246–1258). The rail starts collapsed at ≤640px (`railStartsCollapsed`, 182–188). | — |
| AnA's memory | `v2/WhatAnaRemembers.tsx` `WhatAnaRemembers` 164 | Read-only drawer (`.de-bd` / `.de`, `useDialog`: Escape closes, focus trapped) of the person's notes, the project's notes and "Things I got wrong". Opened only from the conversation header (`surfaces/ConversationThread.tsx:1938`, rendered at 2390–2391 with `projectRef={shellProjectId}`, `projectName={shellProgramName()}`). | Not reachable outside a conversation. |
| Organisations | `v2/OrganizationAccess.tsx` 113–131 | A `tb-btn` ("Organizations and invitations", invitation count) that opens memberships and invitations in a fixed `.tt-panel` drawer; switch, accept and decline through `C2CForm`. | — |
| Project list | `GET /api/c2c/projects` (`server/routes/c2c/projects.ts:570–634`, `?limit` 1–200; rows ordered `updated_at DESC`, `server/services/c2c/project-portfolio.ts:65`); read by Home (`surfaces/Surfaces.tsx:72`) and the palette (`paletteProjects.ts` `PALETTE_PROJECTS_URL`, `?limit=200`, validator `Array.isArray`, `openPaletteProject` → `shellProject.ts` `openProjectHome` 180–186). | — | Not read by the sidebar. |

### The CSS, at `b854c54c2b` (`client/src/concept2cure/v2/styles/app-v2.css`)

| Selector (line) | Today |
|---|---|
| `.c2c-v2.shell` (1515) | `grid-template-columns:var(--rail) 1fr`. |
| Phone block `@media (max-width: 640px)` (1516–1536) | `--rail` narrowed to `--rail-collapsed` (56px), so **a 56px strip stays beside the content**; the expanded rail is a fixed 300px drawer (`box-shadow:8px 0 32px rgba(0,0,0,.25)`) over `.rail-scrim`. |
| `.rail-scrim`, its keyframes and reduced motion (1537–1546) | Hidden above 640px; a dim layer under the drawer. |
| `.c2c-v2.shell[data-collapsed="true"]` (1547) | `grid-template-columns:var(--rail-collapsed) 1fr`. Outside the media query and **after** it, at equal rank, so a phone rule that sets the grid columns directly loses to it. |
| `.rail` (1555) | `--bg-100`, hairline right border. |
| `.rail-top` (1556) | 48px, `padding:0 12px`, **hairline under the brand**. |
| `.rail-logo`, `img`, `-text`, `-text span` (1557–1560) | 13px weight 600; **".RI" in `--accent-100`** (orange). |
| `.rail-logo[data-on="true"]` (1704, in the top-bar block) | **A grey fill on the brand on Home**, beside Home's own active row. |
| `.rail-collapse`, `:hover` (1565–1567) | 26px, radius 6. |
| `.rail-scroll` (1568) | Scrolls; `padding:6px 0 12px`. |
| `.rail-nav` (1578), `.rail-group` (1581), `.rail-group-h` (1582) | Group label 12px weight 600 (sentence case since D0-3). Groups 14px apart. |
| `.nav-item`, `.ico`, `.lbl`, `:hover` (1585–1589) | 30px rows, **13px**, radius 6; icons `--text-400`. |
| `.nav-item[aria-current="page"]` (1594–1595) | `background:var(--bg-300,var(--bg-200))` (`4a5cc0d224`), weight 500. |
| `.rail-actions` (1596), `.rail-recents` (1597), `.rail-recent` (1598), `.rail-recents-note` (1599) | Search's group 1px down; recents 28px rows at 13px; the note at 12px. |
| Collapsed rules (1583–1584, 1602–1603, 1627) | The group heading becomes a rule; labels hidden; rows centred; a lock stays visible. |
| `.rail-foot` (1640) | `border-top` hairline, `padding:8px`. (`position:relative` and `.rail-account[data-open]` live in `coverage-v2.css:558–559`.) |
| `.rail-account`, `:hover` (1641–1642) | Full-width row, radius 6. |
| `.avatar` (1643) | **The orange fill** (`--accent-strong`), 26px, 11px initials; global, but used only by `Shell.tsx:330` and `:572`. |
| `.rail-account .who`, `.nm`, `.rl` (1644–1646) | Name 12px; role **10px `--text-400`**. |
| Collapsed account (1647) | Name and chevron hidden. |
| `.acct-head .avatar`, `.acct-head .rl` (3708, 3710; also `coverage-v2.css:563, 565`, the CMC session's sheet, imported after `app-v2.css` at `V2App.tsx:92`) | The menu head's avatar **orange** at 30px; the role 11px. Both at the same rank as a `.c2c-v2 :is(.rail-account, .acct-head) .avatar` rule, and later in the cascade. |

Other readers of `--rail` / `--rail-collapsed`: `authoring-v2.css:12–17` (the editor's shell grid, `!important`, D4-1's
sheet, not changed here). No other stylesheet reads them.

### Tests that read this code

| Test | What it pins | Effect of this step |
|---|---|---|
| `__tests__/shellChromeTruth.test.tsx:177–184` | The active row `{background:var(--accent-000)` and a `::before` marker. **Red at HEAD** (the sheet already draws `--bg-300,--bg-200`). | Rewritten (§D1.A step 8). |
| `__tests__/railRecents.test.tsx` | Conversations only; Search opens the palette. | Extended: up to three projects first; a failed project read hides only projects. |
| `__tests__/railLicenseGating.test.tsx:247` | `document.querySelector('.rail-nav')` is the list of places. | The first `.rail-nav` is now the actions group; the query is scoped to `.rail-scroll`. (The suite is red at HEAD for another reason, below.) |
| `__tests__/shellNav.test.tsx:162, 484` | `getByTitle('Ada Rowe')`: the account button's title was the name alone. | With an organisation known, the title is "Ada Rowe · Concept2Cure Therapeutics" (§D1.A step 2). |
| `__tests__/shellNav.test.tsx` places, groups and icons (130–155), `.rail-scroll` rule (476–481) | The labels inside `.rail-scroll`; its overflow. | Unchanged: Search and New conversation are outside `.rail-scroll`, and its overflow is kept. |
| `__tests__/shellChromeTruth.test.tsx:186–198` | Collapsed, the toggle is in the foot; expanded, at the top. | Unchanged. |
| `__tests__/accountMenuBilling`, `accountMenuMasterLicensing`, `accountPanel` | The menu's entries, by viewer; the account button by title "Ada Rowe" (no organisation in their tenant mock). | Unchanged. |

**Red at HEAD, not this step's** (`red/neighbours-head.txt`, the 33 neighbour suites run before any change: **26
failed, 357 passed**): `railLicenseGating` (9), `accountMenuMasterLicensing` (10) and `accountMenuBilling` (3): their
`mountRail` waits on `toHaveBeenCalledWith('GET', NAV_URL)`, and `apiRequest` is now called with four arguments (an
`AbortSignal` last), so every case times out before it asserts anything; `clientNamesSlice1` (2): "Biostat
workbench" uses a word from "Not in client copy"; `accountOnboardingSettings` (1): the saved-persona note (it passed
in the later runs: a flake); `shellChromeTruth` (1): the active-row rule above.

**A timing flake, not this step's:** `shellWiring.test.tsx`'s Live Drive cases mount the whole shell and wait 5s for
the lazily imported conversation. Run first in a cold worker they time out, at HEAD's own sources too
(`red/shellWiring-head-alone.txt`: both fail); inside a longer run, after other files warm the transform cache, they
pass (`red/neighbours-head.txt`).

---

## The change (D1 §D1.A)

Re-checked at `b3c9e4421` before handing over: no D1-1 file (`Shell.tsx`, `V2App.tsx`, `app-v2.css`, the generated
ramp, the nine tests) differs between `b854c54c2b` and it.

| File | Change | Spec |
|---|---|---|
| `v2/Shell.tsx` `Rail`, the top | A `.rail-nav.rail-actions` group between `.rail-top` and `.rail-scroll`: **New conversation** (`nav-item rail-new`, `I.plus`; behind `canLeave()`; `onNav('home')`, then focuses Home's `.landing-input` on the next frame) and **Search**, moved out of `.rail-scroll` (the old block under the places is deleted). An action, not a `RAIL_CORE` entry. | §D1.A step 1 |
| `Rail`, the account | `org` from `useTenant()`. The account button's second line reads `org ?? roleWords(role)`; its `title` is `[name, org].filter(Boolean).join(' · ')`. `roleWords` capitalises and turns `_` into spaces ("org_admin" → "Org admin"). | step 2 |
| `Rail`, the foot | `<OrganizationAccess />` (the same component) moves here from `TopBar`: after the account button when expanded; when collapsed the foot stacks the expand toggle, organisation access, then the account, in DOM order (so Tab and the eye agree). | step 2 |
| `AccountMenu` | The head's second line is `[org, roleWords(role)].join(' · ')`. **"What AnA remembers"** (`ic: 'history'`, `action: 'remembers'`) right after Account, for everyone. `Rail` holds `remembersOpen` and renders `<WhatAnaRemembers projectRef={readShellProject()?.id ?? null} projectName={shellProgramName()} …/>` (the conversation's own props, `ConversationThread.tsx:2391`); closing returns focus to the account button. **The admin entries are untouched**: Admin, Subscription & features and Access requests on `isOrgAdmin`; Platform licensing on `platformAdmin`; Codebase coverage on `platformAdmin && available('coverage')`. | step 3 |
| `RailRecents` | A second read, `GET /api/c2c/projects?limit=3` (validator `Array.isArray`, the palette's), newest-updated first by the route's own order. Up to three project rows (folder icon, the title; `title` attribute "code — title") above the conversations, under the one "Recents" heading. A project opens through `openPaletteProject` → `shellProject.ts` `openProjectHome`, behind `canLeave()`. A failed or malformed project read renders no project rows and never touches the conversations' own loading, failed and empty states. | step 4 |
| `Rail` at phone width | `closeOnPhone()` (`matchMedia('(max-width: 640px)')`, guarded) collapses the drawer after choosing a place or work area (`open()`), New conversation, Search, a recent project or conversation, the brand, or an account-menu destination. The rail's notice (`leaveNotice`, the fixed `.de-toast`) renders **beside** `<nav class="rail">`, not inside it: the collapsed rail is `display:none` at ≤640px, so "Open a project to see its Vault. Choose one in Projects.", raised by `open()` after it closes the drawer, would otherwise never be drawn (added in the skeptic's review, below). | step 7 |
| `TopBar` | `onOpenRail?` prop; when given, the bar's first child is `<button className="tb-btn tb-rail" aria-label="Open the sidebar">{I.panelLeft}</button>`. `<OrganizationAccess />` leaves the bar. | step 5, §D1.B step 2 |
| `v2/V2App.tsx` | `<TopBar … onOpenRail={() => set('railCollapsed', false)} />`; the scrim's comment no longer says the grid keeps a strip. | step 5 |
| `styles/app-v2.css`, the phone block | At ≤640px `--rail` and `--rail-collapsed` are `0px` (no strip, for every grid that reads them); the collapsed rail is `display:none`; the expanded rail stays the fixed 300px drawer over the scrim, with `--v2-shadow-lg`. `.tb-rail` is hidden above 640px and shown at or below it. | step 7 |
| `styles/app-v2.css`, the rail block | The spec's values, rule by rule, each rule's structural declarations kept: `.rail-top` (no hairline, `0 8px 0 10px`), `.rail-logo` (+ `:hover`), `.rail-logo-text` (15px, ink) and its ".RI" span (`--text-300`, was orange), `.rail-collapse` 32px, `.rail-scroll`, `.rail-group` 20px, `.rail-group-h` (12px / 500 / `text-transform:none` / `--text-300`), `.nav-item` (32px, 14px, radius 8), its icon `--text-300`, its hover a 60% `--bg-200`, the active row `--bg-200` / 500, `.rail-actions`, the round orange "+" (`.nav-item.rail-new .ico`), `.rail-new .lbl`, `.rail-recent` 30px / 13px, `.rail-recents-note` 13px, `.rail-foot` (flex, no hairline; column when collapsed), `.rail-account` (radius 8), the avatar (shape global; 28px ink fill scoped to the rail's two avatars), the account's lines (13px name, 12px `--text-300` organisation), the menu head's line 13px. Deleted: `.rail-logo[data-on="true"]` (and the logo's `data-on` attribute, its only reader). | step 6 |
| `styles/surface-text-ramp.css` (generated) | **Not edited in the tree.** Its D1-1 share is `green/surface-text-ramp.d1-1.patch` (3 selectors: `.rail-logo[data-on="true"]` → `.rail-logo:hover` in the `--bg-200` block), built by the generator from HEAD's sheets plus this step's `app-v2.css`. | §D1.I gate list |

### Deviations from the spec's literal text, and why

1. **The phone block zeroes the two variables instead of setting `grid-template-columns:0 1fr`.**
   `.c2c-v2.shell[data-collapsed="true"]{grid-template-columns:var(--rail-collapsed) 1fr}` (1547) sits after the media
   block at the same rank, so the spec's `.c2c-v2.shell[data-collapsed="true"]{grid-template-columns:0 1fr}` would lose
   to it and leave an empty 56px column beside the page (the rail itself `display:none`). The editor's grid in
   `authoring-v2.css:12–17` (`var(--rail)` / `var(--rail-collapsed)`, `!important`, D4's sheet) would also keep its
   strip. With both variables `0px` at ≤640px, every grid that reads them reserves nothing.
2. **`.tb-rail`'s two rules live in the phone block, as `.c2c-v2 .topbar .tb-rail`.** The top bar's block is D1-2's
   (BUILD_ORDER §1 D1-2: 1478–1545). The extra `.topbar` ranks them over `.tb-btn{display:flex}`, which comes later in
   the sheet. D1-2 folds them into its `:is(.tb-rail, .tb-new)` rule.
3. **`TopBar` is edited here, in two places only**: the `tb-rail` button (§D1.A step 5 brings §D1.B step 2 into this
   step; without it the phone sidebar would be unreachable once its strip is gone) and the removal of
   `<OrganizationAccess />` (step 2 moves it; leaving it would draw two). The button renders only when `onOpenRail` is
   passed, so no top bar shows a button that does nothing. The two-line JSX comment over the `.tb-org` label went (its
   "alongside it" was no longer true; the label's own comment now says where organisation access is), which keeps
   `TopBar` at ESLint's 100-line limit: it was exactly 100 at HEAD.
4. **The ink avatar is ranked `.c2c-v2 .rail :is(.rail-account, .acct-head) .avatar`.** The account menu block defines
   `.c2c-v2 .acct-head .avatar` with the orange fill twice, in `app-v2.css:3708` and in `coverage-v2.css:563` (the CMC
   session's sheet, imported after `app-v2.css`), at the spec selector's own rank; the spec's selector would have left
   the menu head's avatar orange. The menu opens inside the rail's foot, so `.rail` reaches it. The menu head's 13px
   line is ranked the same way (`.c2c-v2 .rail .acct-head .rl`, over `:3710` and `coverage-v2.css:565`).
5. **The orange "+" is `.c2c-v2 .nav-item.rail-new .ico`, not `.rail-new .ico`.** `.nav-item:hover .ico` outranks
   the spec's selector and would turn the glyph `--text-200` on the orange circle on hover.
6. **Rules are re-valued, not replaced.** The spec's lines name only the changed values; replacing the whole rule
   would drop `display:flex`, `width:100%`, `overflow:hidden`, the ellipsis and the rest from rows, the logo, the
   toggle, the scroll and the account.
7. **One rule the spec does not list:** `.c2c-v2.shell[data-collapsed="true"] .rail-account{justify-content:center;
   padding:6px}`. Collapsed, the foot is 40px wide inside the 56px rail; a 28px avatar plus the expanded 8px padding is
   44px and sat off-centre under the toggle and organisation access.
8. **The drawer also closes on the brand and on the account menu's destinations**, not only `open()`, Recents and the
   actions: each navigates away from the drawer at phone width.
9. **Recent projects are parsed by a local `railProjectOf`**, the same eight lines as `paletteProjects.ts`'s private
   `projectOf`: the spec keeps `paletteProjects.ts`'s API unchanged (§0.1) and this step's files do not include it.
   Opening reuses the palette's exported `openPaletteProject`. If one parser is wanted, exporting `projectOf` from
   `paletteProjects.ts` is a two-line change for whichever step owns that file next (D1-3, the palette).

## Capability kept (zero loss)

| Removed or demoted | Where its outcome lives now |
|---|---|
| Search as a place under the places | The same button and handler, second under New conversation, above the places; ⌘K unchanged. |
| The brand's grey fill on Home | Home's own row carries the active fill; the brand still opens Home (and is still the first stop after the skip link). |
| Orange ".RI" and orange avatars (the button and the menu head) | The same text and initials, in ink. |
| The raw role ("admin") on the account button | The organisation's name there, and the role in words in the menu head ("Concept2Cure Therapeutics · Admin"); with no organisation known, the role in words on the button. The button's `title` names both. |
| The 56px icon strip at ≤640px | The top bar's "Open the sidebar" opens the full sidebar, with every entry; Escape and the scrim close it as before, and choosing an item closes it. |
| `OrganizationAccess` in the top bar | The same component, panel, forms and guards, in the sidebar foot beside the account (`Shell.tsx` `Rail`). The top bar's organisation label stays until D1-2. |
| — (added reach) | "What AnA remembers" from anywhere (account menu); up to three recent projects in Recents; New conversation. |

## Tests

- **New:** `client/src/concept2cure/v2/__tests__/shellQuietChrome.test.tsx`, 23 tests (24 after the skeptic's review, below), the Rail half of §D1.I's
  guard (the TopBar half joins it with D1-2): the first two `.rail-nav` buttons are "New conversation" and "Search",
  New conversation opens Home, Search still opens the palette; the account's second line and title name the
  organisation, the role in words when none is known, the menu head's one line; "What AnA remembers" follows Account,
  opens the drawer, Escape closes it and focus returns to the account button; the admin entries gated as before, for
  a member and an admin; organisation access after the account, and collapsed toggle → organisation access →
  account; the top bar's "Open the sidebar" is its first control and calls `onOpenRail`, no such button without it,
  no organisation access in the bar; at phone width a place, New conversation and Search close the drawer, wider
  they do not; and in `app-v2.css`: the "+" is the sidebar's one orange, no brand fill and the ".RI" in ink, group
  labels 12px sentence case, rows 14px, recents 13px and nothing under 12px, the ink avatar ranked over the menu
  block, the account lines, and the ≤640px rules.
  - **Red** at `b854c54c2b` (no source change yet): **19 failed, 4 passed** (`red/new-tests-at-head.txt`). The four
    that pass pin kept behaviour or an absence that HEAD already has: Search opens the palette; no "Open the sidebar"
    without a handler; wider than 640px nothing collapses; the parser finds the rules.
  - **Green** after: **23 passed** (`green/neighbours.txt`); 24 with the skeptic's case (`green/skeptic-run.txt`).
- **Extended** (each new case red first, in `red/new-tests-at-head.txt`):
  - `railRecents.test.tsx`, +4: three projects then the conversations under one heading, from
    `/api/c2c/projects?limit=3`; a project opens its page and publishes it; a failed project read hides only the
    projects; the empty note stays under the projects. Red: 3 failed; the failed-read case passes at HEAD (no project
    rows was always true). Green: 10 passed.
  - `shellWiring.test.tsx`, +1: "Open the sidebar" expands a collapsed sidebar in the mounted `V2App` (the one-line
    wiring). Red at HEAD, green after.
- **Rewritten, each with its one-line reason in the file:**
  - `shellChromeTruth.test.tsx:177–184`: the active row is `--bg-200` with no `--accent-000` and no `::before`
    (§D1.A step 8). Red at HEAD, green after.
  - `shellNav.test.tsx` (4 lookups), `shellProtocolLeaveGuard.test.tsx:108`, `shellSegmentFollowsProgram.test.tsx:120`:
    the account button's title is "name · organisation" where their tenant mock names one.
  - `organizationAccess.test.tsx`: `mount` renders the `Rail` (the control moved to the sidebar foot) instead of
    `TopBar`; all six cases unchanged and green.
  - `railLicenseGating.test.tsx:247`: the places are `.rail-scroll .rail-nav`; the first `.rail-nav` is the actions
    group now. The suite is red at HEAD for another reason (above), so the change is shown on a scratch copy of the
    working tree with only that wait relaxed: 9 passed with the new query, and the old query fails on D1-1's sources
    (`green/railLicenseGating-scratch.txt`).
- **§D1.I items that are not D1-1's:** `shellChromeTruth`'s `tb-org` and top-bar "Get help" cases (the label and Help
  stay in the bar until D1-2 deletes them), and the TopBar half of `shellQuietChrome.test.tsx`.
- **Neighbours, after** (`green/neighbours.txt`): 39 files, **453 passed, 25 failed**: the 24 red at HEAD and
  shellWiring's cold-start flake (first case only; the other Live Drive case and the new one pass). Includes the three
  D0 guards (`foundationsOneDefinition` 17, `foundationsRetiredRatchet` 33, `foundationsSentenceCase` 3: all green),
  `tests/ui/ana-rail-phone-drawer.test.ts` (it pins the two grid rules this step keeps) and
  `tests/ui/token-authority.test.ts`.

## Gates (`green/gates.txt`, `green/eslint.txt`, `green/tsc-narrow.txt`)

`ci:undefined-css-classes` OK; `ci:check-css-selector-shadowing` OK (0 new); `ci:check-shell-css-collisions` OK;
`ci:one-product` OK (10 rail entries, none new: New conversation is an action); `ci:token-contrast` OK;
`ci:design-system` OK; `check:microcopy` OK. `ci:surface-text-ramp` fails in the shared tree until the generated
sheet takes this step's share: in a scratch repo of HEAD's sheets plus this step's `app-v2.css` it fails, and passes
once `green/surface-text-ramp.d1-1.patch` is applied. ESLint on the 11 changed files: 0 errors, no new warning
against HEAD's copies (the existing size warnings on `Rail` and `AccountMenu` grow: `Rail` 203 → 254 lines,
complexity 30 → 39). A narrow `tsc` over the changed files reports nothing in them (its 13 errors are the narrow
config's missing ambient module types and the L8 session's uncommitted `Vault.tsx`).

## For the committer

- **Stage exactly:** `client/src/concept2cure/v2/Shell.tsx`, `client/src/concept2cure/v2/V2App.tsx`,
  `client/src/concept2cure/v2/styles/app-v2.css`, the nine tests (`__tests__/shellQuietChrome.test.tsx`,
  `railRecents`, `shellChromeTruth`, `shellWiring`, `shellNav`, `shellProtocolLeaveGuard`,
  `shellSegmentFollowsProgram`, `organizationAccess`, `railLicenseGating` `.test.tsx`), and
  `docs/evidence/DESIGN/D1/D1-1/`. At hand-over `git diff HEAD -- …/app-v2.css` holds only this step's five hunks.
- **The generated ramp:** the working-tree `surface-text-ramp.css` equals HEAD's, so
  `git apply --index docs/evidence/DESIGN/D1/D1-1/green/surface-text-ramp.d1-1.patch` stages this step's share and
  updates the tree together (`--index --check` passes). If another step regenerates the sheet first, regenerate it in
  full instead.
- **Trailers:** `Plan: D1`, `Completes: client/src/concept2cure/v2/Shell.tsx`. Every file is in D1's ledger paths or
  `alwaysAllowed` (`**/__tests__/**`, `docs/evidence/**`).

## Not done here, and why

- **The running-app checks** (§D1.A acceptance 1–6 at 1440 and 390, light and dark: computed fills, the drawer's
  300px, `.page.scrollWidth`, the 500 route intercept): no dev server or browser was run on the shared 4-CPU host.
  They belong to D1's package walk (§D1.J), with screenshots.
- **For that walk to look at:**
  - `.rail-recents{margin-top:14px}` is kept (the spec keeps unlisted rules), so Recents sits 14px under the work
    areas while `.rail-group` is now 20px. `20px` there, or deleting the rule, evens them.
  - At phone width "Open the sidebar" leaves focus on itself; the drawer's items are reached with Shift+Tab (the rail
    precedes the page in the DOM), and Escape closes it. Moving focus into the drawer on open is not in the spec.
  - `OrganizationAccess`'s button keeps the top bar's `.tb-btn` look (D1-2 restyles `.tb-btn`; its hover becomes
    `--bg-100`, the rail's own fill).
- **The top bar itself** (crumbs, `ProjectChip`, `.tb-org`, the ⌘K box, Task, Help, `data-surface`): D1-2.
- `git log --all -S rail-new` (a whole-history pickaxe) was stopped at the background time limit; the targeted
  searches above (`-S "'New conversation'"`, the deletion search) finished.

## Skeptic's review (2026-11-01, before the commit)

Checked against `D1.md` §D1.A (steps 1–8), §D1.B step 2, §D1.I and BUILD_ORDER §1 D1-1: the diff touches only
`Shell.tsx` (`Rail`, `RailRecents`, `AccountMenu`, and in `TopBar` only the `tb-rail` button and the removal of
`<OrganizationAccess />`), `V2App.tsx` (`onOpenRail`, one comment), the phone and rail blocks of `app-v2.css` (five
hunks, plus the one `.rail-logo[data-on]` deletion the spec names), the nine tests and this folder. All in D1's ledger
paths or `alwaysAllowed`. No new screen, route, service, component file, table or AnA tool; the admin entries are
gated as before (`isOrgAdmin`, `platformAdmin`, `platformAdmin && available('coverage')`); every new size is
`var(--fs-…, px)`; no D0 primitive is restated. The builder's eight deviations are sound and each is explained above.

**One defect, fixed here.** `Rail` rendered its notice (`leaveNotice`) inside `<nav class="rail">`. At ≤640px this step
makes the collapsed rail `display:none`, and `open()` now closes the drawer before it raises "Open a project to see its
Vault. Choose one in Projects." (the notice added after the 2026-10-31 running-app finding that the click looked dead),
so at phone width that notice was never drawn. The notice now renders beside the nav (`return <>{rail}{leaveNotice}</>`;
`.de-toast` is `position:fixed`, so nothing moves at any width). New case in `shellQuietChrome.test.tsx`, "the notice
a choice raises is still seen once the drawer closes": red on the builder's `Shell.tsx`
(`red/notice-beside-rail.txt`, `expected true to be false`), green after (`green/skeptic-run.txt`).

**Left as they are, for the coordinator:**
- `railProjectOf` repeats `paletteProjects.ts`'s private `projectOf` (eight lines). D1 owns `palette*.ts`; exporting
  `projectOf` and deleting the copy is a two-line change for the next step that opens that file (zero duplication).
- Focus at phone width: "Open the sidebar" leaves focus on itself, and closing the drawer (an item, Escape, the scrim)
  leaves focus on an element that is no longer drawn. Moving focus into the drawer on open and back to `.tb-rail` on
  close belongs with D1-2 (the top bar) or the walk; it is not in the spec.
- Dialogs `Rail` renders (`AccountPanel`, `WhatAnaRemembers`, `NavUnlockPanel`, `OrganizationAccess`'s panel and form)
  stay inside the nav. None of them closes the drawer and `useDialog` stops Escape before the shell's listener, so they
  stay drawn; the walk should confirm it at 390.
