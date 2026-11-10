# D1-2: the top bar (D1 §D1.B)

**Package:** D1, Shell, Home and the conversation (`Plan: D1`).
**Step:** D1-2 of `.design/claude-convergence/BUILD_ORDER.md` §1 D1: `v2/Shell.tsx` (`TopBar`; delete `ProjectChip`),
`v2/V2App.tsx` (`data-surface` on the page root), the `TaskTray.tsx` trigger (`data-overdue`, its label), and
`v2/surfaceViews.ts` (the lazy fallback reads "Loading…", step 8; P-85 put the file in D1's paths). In
`styles/app-v2.css`: the top bar block, `.tt-badge` and the new `.tt-trigger[data-overdue] .tt-badge`, the deletion of
`.tb-cmdk*`, `.tb-org*`, `.tb-task*`, `.tb-proj*`, and `.scaf-note[aria-busy]`.
**Spec:** `.design/claude-convergence/D1.md` §D1.B (steps 1–8), with §D1.I (the tests: `topBarProject`,
`projectFeatureBreadcrumb`, `clientNamesSlice1`, the top bar's "Get help" and `tb-org` cases, and the TopBar half of
`shellQuietChrome.test.tsx`).
**Read at:** `16df5ed4b7` on `concept2cure-v2`, 2026-11-01 (D1-4 is `14dce5e38`, D1-1 is `7a9b896b9`; nothing after
D1-1 touches `client/src/concept2cure/v2`). The spec's line numbers were read at `e11b3bfb72`; the lines below are
re-read at `16df5ed4b7`. Re-checked at `2e4a9fe67` (L8's Vault commit) before the red run: no D1-2 file differs.
**Order:** after D1-4 (it shares `TaskTray.tsx`) and D1-1 (it shares `Shell.tsx`), before D1-3 (BUILD_ORDER §1 D1,
"Order").

This step adds no screen, route, service, table, mount, AnA tool or component file (RULE 6). It finishes the existing
top bar: it deletes one component (`ProjectChip`) whose outcome the project crumb, in the same `TopBar`, now delivers,
and removes three controls whose outcomes already live elsewhere (named below by path).

---

## What already exists (RULE 3)

### Searches run

- `grep -rn` over `client/src` (`.tsx`, `.ts`, `.css`) for `TopBar`, `ProjectChip`, `tb-proj`, `tb-org`, `tb-cmdk`,
  `tb-task`, `tb-btn`, `tb-spacer`, `tb-rail`, `tb-new`, `tb-collab`, `tb-newtask`, `crumb-root`, `crumb-tier`,
  `crumb-proj`, `.crumbs`, `topbar`, `tt-trigger`, `tt-badge`, `scaf-note`, `aria-busy`, `Loading surface`,
  `HELP_SURFACE`, `Get help`, `Search, jump, or run a command`, `No project open`, `data-surface`.
- `grep -rln` over `client/src/concept2cure/v2/__tests__`, `tests/` and `scripts/` for the same names, to find every
  test, e2e walk and CI baseline that pins the old bar.
- `git log --all --diff-filter=D --name-only` on `*TopBar*`, `*Topbar*`, `*ProjectChip*`, `*Breadcrumb*`,
  `*breadcrumb*` (the clone is not shallow: `git rev-parse --is-shallow-repository` → `false`). Found: the eleven
  per-family `shell/TopBar.tsx` files and `components/ana/TopBar.tsx`, deleted in `2895218b8` (2026-08-04, "one
  shell"); `intelligence/shell/TopBar.tsx` (`cccb1ad63`); `portal-v2/layouts/TopBar.tsx`, `WorkspaceTopBar.tsx`,
  `TypeBreadcrumb.jsx`, `navigation/Breadcrumbs.jsx` (2026-05-01 clean-ups). `Shell.tsx` `TopBar` is the one top bar
  that replaced them; nothing here rebuilds any of them.
- `git log -S "function ProjectChip"` over `Shell.tsx`: added in `25d79c99c` ("Top bar names the open project; client
  type only in the account menu (F8, D2)"). Its outcome (FILING_SPINE F8: every screen names the open project and opens
  its page) is kept by the project crumb below.

### The pieces this step changes

| Piece | Path (lines at `16df5ed4b7`) | What it does today | What it does not do |
|---|---|---|---|
| Top bar | `v2/Shell.tsx` `TopBar` 803–923 | Left: `.tb-rail` "Open the sidebar" (only when `onOpenRail` is passed, D1-1); the crumbs: a root crumb "Concept2Cure.RI" (`crumb-root`, `crumb-root-sep`, 856–857), the tier crumb from `breadcrumbTierOf` (`crumb-tier`, 861–866: "Projects" for a project feature, "Biotech & Pharma", "Admin"), the open project as a second `crumb-tier` for a project feature only (867–872), then `here` (the page; on `project-home` the project's name). Right, after `.tb-spacer`: `ProjectChip` (876), the organisation label `.tb-org` with an orange initials mark (877–882), the 230px `.tb-cmdk` "Search, jump, or run a command ⌘K" box (883–887), the orange-tinted `.tb-task` "Task" (890–898; `C2C.open('task')`), Collaborate (`tb-btn`, `aria-label="Collaborate"`, 899–907; `C2C.open('collab')`), `<TaskTray />` (908), Help (`tb-btn`, "Get help", 911–919; `go(HELP_SURFACE)`), and the leave guard's notice (920). | The open project is named twice when one is open on its page or a project feature ("NPX-510" crumb and "NPX-510" chip). On a core place (Vault) the crumbs name only the page. |
| Project chip | `Shell.tsx` `ProjectChip` 761–801 | With a project open: a `.tb-proj` button, folder icon, the code (or title), `title` "code — title", `aria-current="page"` on `project-home`, sr-only "Open project "; click → `project-home`. Opened by id alone: the label "Open project". With none open: a dashed "No project open" button (sr-only ". Choose one in Projects") that opens Projects. | — |
| Project name | `Shell.tsx` `shellProjectName` 756–759 | Code, else title, from the shell's one project channel (`useShellProject`). Read by `TopBar` and `ProjectChip`. | — |
| Help target | `Shell.tsx` `HELP_SURFACE` 73–75 | `'conversation-thread'`, read by the top bar's Help (916) and the account menu's "Get help" (656). | — |
| New conversation | `Shell.tsx` `Rail` 327–332 (D1-1) | Behind `canLeave()`: closes the phone drawer, `onNav('home')`, focuses Home's `.landing-input` on the next frame. | Not reachable from the top bar. |
| Page root | `v2/V2App.tsx` 1326 | `<main className="main">`, then `TopBar` (1327–1337) with `surface` (Home's literal or `ctxSurface`), `onPalette`, `onNav`, `onAsk`, `onOpenRail`. | Says nothing about which screen it holds, so no rule can quiet the bar on Home. |
| Your work trigger | `v2/TaskTray.tsx` `TaskTrayOwner` 164–177; label 129–131; badge 124 | `tt-trigger tb-btn`, the bell; badge = `work.total + unread`, "99+" above 99, "?" when either count failed; `aria-label` "Your work — n items waiting" (or "couldn't load every count; at least n…"). `work.overdue` (from `GET /api/task-management/my-work`, `OpenWork.tsx` `MyWork.overdue`) is read only inside the panel's header ("n overdue"). | The closed bell says nothing about lateness: the same badge for 16 open items as for 16 with 3 overdue. |
| Lazy fallback | `v2/surfaceViews.ts` `SurfaceChunkFallback` 194–205 | `div.scaf-note`, `role="status"`, `aria-busy`, inline `style` (`padding: '40px 16px'`, `textAlign: 'center'`), text "Loading surface…" (system vocabulary). Its `role` and `aria-busy` are read by `hostilePayloadProbe.test.tsx` and `a11ySemantics.test.tsx` (the comment at 179–193). | — |

### The CSS, at `16df5ed4b7` (`client/src/concept2cure/v2/styles/app-v2.css`)

| Selector (line) | Today |
|---|---|
| `.tb-dom .tb-org-chev` (837) | Inside the client-domain switcher block (829–839), which no TSX renders since F8 (its own comment at 3876 says so). The one `.tb-org*` selector outside the bar's block. |
| `.tt-trigger` (1017) | `position:relative`. |
| `.tt-badge` (1018) | `--accent-strong` fill (**orange**), 15px, **10px** text. Excluded from D1-4's tray checks as D1-2's (`taskTrayQuiet.test.tsx:30, 204`). |
| `.topbar .tb-rail` (1528) and the phone block's `.topbar .tb-rail` (1534) | D1-1's interim placement ("D1-2 folds .tb-rail into the top bar's own rules", 1526–1527). |
| `.topbar` (1671) | 48px, `gap:12px`, `padding:0 16px`, hairline under it on every screen. |
| `.crumbs` (1678), `.crumbs>span` (1686), `.crumbs .sep` (1687), `.crumbs .crumb-tier` (1690), `.crumbs .here` (1691) | **12px**; the shrink priorities that let the root and tier crumbs give way before the page name (launch sweep finding 134). |
| `.tb-spacer` (1692) | `flex:1`, pushes the controls right. |
| `.tb-cmdk`, `:hover`, `.ico`, `.lbl` (1693–1696, 1730), `.kbd` (1706), and its 1100px/1180px media rules (1701, 1731) | The search box: 30px, `--bg-050`, **12px** label, **10px** mono "⌘K". |
| `.crumb-root` media rule (1705) | Hides the root crumb below 1100px. |
| `.tb-btn`, `:hover` (1707–1708) | 32px, radius 6, `--text-400`, 17px glyph, hover `--bg-200`. Also used by `OrganizationAccess.tsx:114`, `NavUnlockPanel.tsx:146`, `RbmSurfaces.tsx:395` and the MDX surfaces (`K510Surface`, `IvdSurface`, `cer/*Tab.tsx`). |
| `.tb-btn.on`, `:hover` (1722–1723) | The engaged filter (`K510Surface`, `cer/SignalsTab`). Kept by the spec. |
| `.tb-org`, `-mark`, `-name`, `-chev` (1726–1729) | The label; the mark an **orange** fill, **10px**; the name **12.5px**. |
| The bar's 640px block (1737–1741) | Hides the crumbs and the ⌘K hint; clips the chip's label to sr-only. |
| `.tb-task`, `:hover`, `.ico`, 900px rule (2235–2239) | **Orange-tinted** `--accent-000` fill, `--accent-muted` border, `--accent-200` text, 12.5px/600. |
| `.scaf-note` (2434) | A `--bg-100` note with a hairline (D0 took off its orange rule). The fallback is that box. |
| `.tb-proj`, `:hover`, `.ico`, `-lbl`, `[data-empty]` (3874–3888) | The chip: hairline-strong border, **12px**; hover and icon **`--accent-100`** (orange); dashed when empty. |

The generated `surface-text-ramp.css` lists `.c2c-v2 .tb-cmdk` (220) and `.c2c-v2 .tb-btn:hover` (807) among the
`--bg-050` and `--bg-200` blocks; it is regenerated, never edited by hand (BUILD_ORDER §2.1). The shadowing baseline
`scripts/ci/css-selector-shadowing-baseline.json:18` lists `.c2c-v2 .tb-cmdk .lbl` (defined twice, 1696 and 1730).

### Tests and walks that read this code

| Test | What it pins | Effect of this step |
|---|---|---|
| `__tests__/topBarProject.test.tsx` | The `.tb-proj` chip names the project and opens `project-home`; "No project open. Choose one in Projects" opens Projects; the client type is not in the bar. | Rewritten (§D1.I): the `.crumb-proj` button, same name, title and click; with none open, no project button. |
| `__tests__/projectFeatureBreadcrumb.test.tsx:88–160` | "Concept2Cure.RI › Projects › the project › the feature"; the chip's label; "a core place carries no project crumb". | Rewritten (§D1.I): "the project › the feature"; a core place carries the project crumb while one is open. The ⌘K hint cases are unchanged. |
| `__tests__/shellChromeTruth.test.tsx:112–155, 223–239` | The crumb text with the root; the `.tb-org` label and its P-25 empty case; the top bar's Help; Task found by its old `title`. | The crumb without the root; the organisation and P-25 cases and "Get help" move to the sidebar's account (§D1.I); New task and Collaborate by their new names. |
| `__tests__/clientNamesSlice1.test.tsx:283–288` | `.crumbs .here` is the project's code on `project-home`. | The project crumb (`.crumb-proj`) names it, with `aria-current="page"`; no `here` repeats it. |
| `__tests__/shellSegmentFollowsProgram.test.tsx:80–107` | The bar names the project and no client type; "No project open" with none. | With none open, no project text and no client type. |
| `__tests__/shellNav.test.tsx:324–343` | The top bar's search box opens the palette. | The sidebar's Search opens it (the box is gone; ⌘K is unchanged). |
| `__tests__/shellProtocolLeaveGuard.test.tsx:100–113` | The leave guard refuses the chip ("Open project BX-410") and the top bar's Help. | The project crumb ("BX-410"); "Get help" through the account menu. |
| `__tests__/projectHomeStepReturn.test.tsx:62` | Returns to the project page through "the real top-bar chip" ("Open project A-101"). | The project crumb, by its name "A-101". |
| `__tests__/taskTrayHonestReads.test.tsx:120–149` | The badge's "?" on a failed read; no badge at zero; the label "Your work — 3 items waiting". | Unchanged; `overdue` is 0 in their fixture. |
| `__tests__/taskTrayQuiet.test.tsx:30, 204` | Excludes `.tt-badge` from the tray's CSS checks "until D1-2 lands". | The exclusion goes: the badge now meets the tray's own checks (no orange, nothing under 12px). |
| `__tests__/shellQuietChrome.test.tsx:29–32` | Says the TopBar half joins "with D1-2". | Gains it (§D1.I "New guards"). |
| `tests/e2e/launch-walk-no-lock.e2e.ts:115`, `golden-customer-journey.e2e.ts:323` | Open the palette from "Search, jump, or run a command". | The sidebar's Search. (Playwright, not run on this host.) |
| `tests/e2e/project-step-return.e2e.ts:44, 55` | `button.tb-proj`. | `button.crumb-proj`. (Playwright, not run on this host.) |

---

## The change (D1 §D1.B)

| File | Change | Spec |
|---|---|---|
| `v2/Shell.tsx` `TopBar` | **Left:** the root crumb, the tier crumb and the feature-only project crumb are gone. While a project is open, the first crumb is the project as a button (`.crumb-proj`: folder icon, the code or title in a `.lbl`, `title` "code — title", click → `go('project-home')` behind the leave guard, `aria-current="page"` on the project page), on every screen. Then `›` and the page (`.here`), except on the project page (the crumb names it) and on `home` and `conversation-thread` (`SELF_NAMED_SURFACES`: both name themselves). With none open, or one opened by id alone, there is no project crumb and the page names itself. | step 1 |
| `TopBar`, the phone button | `.tb-rail` "Open the sidebar" stays first (D1-1). | step 2 |
| `TopBar`, right | After `.tb-spacer`: Collaborate (`tb-btn tb-collab`, `aria-label`/`title` "Collaborate on this screen", `I.messageSquare`), New task (`tb-btn tb-newtask`, "New task from this screen", `I.checkSquare`), both through `openLauncher(mode)`, the same `window.C2C.open(...)` call as before; `<TaskTray />`; then `tb-btn tb-new` "New conversation" (`I.plus`), shown at ≤640px only, which runs the sidebar's own handler. | step 3 |
| `Shell.tsx` `openNewConversation` | The sidebar's New conversation body (`onNav('home')`, focus `.landing-input` next frame), lifted out of `Rail` so `Rail` and the top bar's phone button share one implementation; each still asks its own leave guard first, and `Rail` still closes the phone drawer. | step 3 (zero duplication) |
| `Shell.tsx` | **Deleted:** `ProjectChip` (its outcome is the project crumb, same file), the `.tb-org` label and its `orgName`/`orgMark`, the `.tb-cmdk` box, the `.tb-task` chip and Help. `TopBar` no longer reads `useTenant`, `breadcrumbTierOf` or `onPalette` (`onPalette` stays an optional, unread prop so call sites are unchanged, as `segment` already did). `HELP_SURFACE`'s comment says the account menu is its one place. | step 4 |
| `v2/V2App.tsx` | `<main className="main" data-surface={activeId}>`. | step 5 |
| `v2/TaskTray.tsx` | The trigger carries `data-overdue` when `work.overdue > 0`; its `aria-label` adds ", n overdue" (`trayTriggerLabel`, which also takes the existing label logic out of `TaskTrayOwner`: complexity 20 → 18). | step 6 |
| `styles/app-v2.css`, the bar | `.topbar` (gap 4px, `0 12px 0 16px`), `.main[data-surface="home"] .topbar` (no rule), `.crumbs` (13px `--text-300`), `.crumbs .here` (`--text-100`/500), `.crumb-proj` (+ `:hover` `--bg-100`, `.ico` `--text-300`), `.tb-btn` (32px, radius 8, `--text-300`, 16px, `position:relative`, `inline-flex`; hover `--bg-100`), `:is(.tb-rail, .tb-new)` hidden; at ≤640px `topbar` `0 8px`, `:is(.tb-rail, .tb-new)` shown, `.tb-collab`/`.tb-newtask` hidden, `:is(.tb-btn)` 44px. `.tb-btn.on` kept. **Deleted:** `.crumbs>span`, `.crumb-tier`, the `crumb-root` 1100px rule, every `.tb-cmdk*` rule (and its 1100px/1180px rules), `.tb-org*` (including `.tb-dom .tb-org-chev` at 837), `.tb-task*` (2235–2239), `.tb-proj*` (3874–3888), the old 640px block, and D1-1's interim `.topbar .tb-rail` pair (folded into `:is(.tb-rail, .tb-new)`, as D1-1 said it would be). | step 7 |
| `styles/app-v2.css`, the badge | `.tt-badge`: ink (`--text-100` on `--bg-000`), 18px, 12px text; `.tt-trigger[data-overdue] .tt-badge`: `--error` / `--on-error`. | step 7 |
| `v2/surfaceViews.ts`, `styles/app-v2.css` | The fallback reads "Loading…"; `.scaf-note[aria-busy="true"]` is one quiet centred 13px `--text-300` line, no border or fill. `role="status"` and `aria-busy` are kept (the probes wait on them). | step 8 |
| `styles/surface-text-ramp.css` (generated) | **Not edited in the tree.** D1-2's share is `green/surface-text-ramp.d1-2.patch`: `.tb-cmdk` leaves the `--bg-050` block, `.tb-btn:hover` moves from `--bg-200` to `--bg-100`, `.crumb-proj:hover` joins `--bg-100`. See "For the committer". | §D1.I gate list |

### Deviations from the spec's literal text, and why

1. **The project's name sits in a `<span className="lbl">` inside `.crumb-proj`**, with
   `.crumb-proj .lbl{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`. The spec puts
   `text-overflow:ellipsis` on the button, but a bare text node in a flex container is an anonymous flex item that
   `text-overflow` never reaches: a long title would be clipped mid-letter. `.lbl` is the existing name-in-a-row class
   (`.nav-item .lbl`), so no new class name is coined. The accessible name and `textContent` are unchanged.
2. **`.crumb-proj` also carries `min-width:3.5em;flex-shrink:100000`.** The rules it replaces carried launch sweep
   finding 134's shrink order (the path gives way before the page name, never to nothing: an orphan "›"). The project
   crumb is now the path; these two declarations keep that behaviour. `.crumbs .here` keeps `min-width:0`,
   `white-space:nowrap`, `flex-shrink:1`, and `.crumbs .sep` keeps its rule (`--text-400` on the bar's `--bg-000`,
   `flex-shrink:0`): the spec re-values these rules, it does not ask for their structure to go.
3. **`.tb-spacer{flex:1}` and its `<div>` are kept.** The spec's block does not list it, but with `.crumbs` at
   `flex:0 1 auto` nothing else pushes the controls to the right.
4. **At ≤640px `.topbar .crumb-proj{margin-left:0}`.** The −8px optical alignment is for the bar's 16px left padding;
   at phone width the crumb follows the 44px menu button with a 4px gap, and −8px would put 4px of it under that button.
5. **The fallback's inline `style` (`padding: '40px 16px'`, `textAlign: 'center'`) is removed** from
   `SurfaceChunkFallback`. Inline styles outrank the spec's `.scaf-note[aria-busy="true"]` rule, so the spec's
   `padding:48px 16px` would never apply; the rule now holds the look (`text-align:center` included).
6. **No project crumb for a project opened by id alone.** This is the spec's `{projectName && …}` read literally.
   `ProjectChip` drew an "Open project" button in that state. It is transient (a deep link before the project's read
   publishes its name), the screen the person is on is that project's, and the sidebar's Projects still opens it; the
   crumb does not invent a label (`projectFeatureBreadcrumb.test.tsx` "the crumb never invents a project name").
7. **`openNewConversation` is lifted out of `Rail`** (four lines) rather than repeated in `TopBar`, so the
   sidebar's and the bar's New conversation are one implementation (working agreement, zero duplication).
8. **`title` beside `aria-label`** on Collaborate, New task and New conversation, with the same words: an icon-only
   button keeps a hover tooltip. The old titles ("New task — assign & track from this screen", "Collaborate — message
   a colleague about this screen") are replaced by the spec's names.
9. **`taskTrayQuiet.test.tsx`'s badge carve-out is removed**, so D1-4's tray checks (no orange but the ✻, nothing
   under 12px) now cover the badge too. Its own comment tied the carve-out to this step.
10. **Added in review: `.crumbs` carries `margin-left:-8px;padding-left:8px`, and
    `.crumb-proj:focus-visible{outline-offset:-2px}`.** The spec's `.crumbs` clips (`overflow:hidden`) and is exactly
    as tall as the 28px project crumb, which sits 8px left of its text (`margin-left:-8px`). A clip cuts at its own
    padding box, so as specified it cut the crumb's hover fill on the left (the text flush against a square edge) and
    the shell's focus ring (`.c2c-v2 button:focus-visible`, 2px wide, 2px out) on all four sides: a keyboard user
    could not see focus on the one text control in the bar. The row now starts 8px earlier and is padded back, so a
    page name alone still starts at the bar's 16px, and the ring is drawn inside the button. At ≤640px the row sits
    flush after the menu button (`.topbar .crumbs{margin-left:0;padding-left:0}`), since pulled left it would lie
    over the button's last 4px and take its taps. Pinned in `shellQuietChrome.test.tsx`'s crumbs case ("…, unclipped";
    red against the builder's sheet, `review/crumb-clip-red.txt`).

## Capability kept (zero loss)

| Removed or demoted | Where its outcome lives now |
|---|---|
| Root crumb "Concept2Cure.RI" | The sidebar's wordmark (`Shell.tsx` `Rail`, `.rail-logo`), which still opens Home. |
| Tier crumb ("Projects", "Biotech & Pharma", "Admin") | The sidebar's active row (`railTargetOf` marks Projects inside a project). ⌘K still hints a destination's group (`breadcrumbTierOf`, unchanged; `projectFeatureBreadcrumb.test.tsx`'s hint cases pass). |
| `ProjectChip` (names the open project, opens its page; `aria-current` there) | The project crumb in the same `TopBar`: same name (code or title), same `title`, same click (`go('project-home')`, leave guard), same `aria-current`, now first on **every** screen while a project is open (FILING_SPINE F8). Pinned by `topBarProject`, `projectFeatureBreadcrumb`, `shellQuietChrome`, `clientNamesSlice1`, `projectHomeStepReturn` and `shellProtocolLeaveGuard`. |
| "No project open" (opened Projects) | The sidebar's Projects (`RAIL_CORE`); ⌘K lists projects (`paletteProjects.ts`); the sidebar's Recents lists the three most recent (D1-1). Opening a project screen with none open still lands on Projects with the notice (`Rail.open`, `V2App.nav`). |
| Organisation label `.tb-org` | The sidebar account's second line and the account menu's head (D1-1; `shellChromeTruth.test.tsx` "header controls … now in the sidebar's account", `shellQuietChrome.test.tsx`). |
| Organisations and invitations | The same `OrganizationAccess` button and panel, in the sidebar foot (D1-1). |
| ⌘K box ("Search, jump, or run a command") | The sidebar's Search (`Rail`, `onSearch`, D1-1) and ⌘K, unchanged; `shellNav.test.tsx` walks it to the Vault. |
| Help | Account menu → "Get help", the same `HELP_SURFACE` (`shellChromeTruth.test.tsx`, `shellProtocolLeaveGuard.test.tsx`). |
| Task (orange-tinted, labelled) | New task, an icon button with the same handler (`window.C2C.open('task')`) and the name "New task from this screen"; ⌘⇧T (`CollabLauncher.tsx`, untouched). ⌘K "New task" is D1-3's (§D1.F step 3). |
| Collaborate, named "Collaborate" | The same button and handler, named "Collaborate on this screen". |
| Orange badge | The same count in ink; red with "n overdue" in the button's name when anything is overdue; "?" when a count failed, as before (`taskTrayHonestReads.test.tsx`). |
| "Loading surface…" in a box | "Loading…", one quiet line, still `role="status"` and `aria-busy` (the 644 cases of the every-surface suites pass, `green/every-surface.txt`). |

## Tests

All runs: `npx vitest run --config vitest.config.ts --maxWorkers=1`.

- **New** (each red at HEAD's sources first, `red/tests-at-head.txt`):
  - `shellQuietChrome.test.tsx`, the TopBar half §D1.I names: +20 cases. The bar draws no `.tb-cmdk`, `.tb-org`,
    `.tb-proj`, `.tb-task`, root or tier crumb, no "Get help", and the open project is the first crumb, a button with
    its title; on Vault "C2C-101 › Vault" and the crumb opens the project page; on the project page "C2C-101" once,
    `aria-current="page"`; a project feature "the project › the feature", a one-category or admin page only its name;
    on Home with no project exactly Collaborate, New task, Your work and no text (B 1); on Home and in a conversation
    the project crumb is the one text; no project button with none open or an id alone; Collaborate, New task, Your
    work in order with their handlers; at phone width the menu first and New conversation last, opening Home, and
    refused by a leave guard; the fallback reads "Loading…", still `role="status"`/`aria-busy`, no inline style; and
    in `app-v2.css`: the bar's gap and rule, Home's transparent rule, the crumbs' type and colours, 32px/44px icon
    buttons, the phone-only pair, the ink badge and its red overdue state, no orange and nothing under 12px in the
    bar's rules, no rule left for the retired names, the quiet fallback.
    Red: **19 of the 20 failed**; "finds the bar's rules" passes at HEAD (the rules exist, re-valued here). D1-1's
    ≤640px case, updated for the fold of `.topbar .tb-rail` into `:is(.tb-rail, .tb-new)` (reason in the file), is
    red at HEAD too. Green: 44 passed (D1-1's 24 and these 20).
  - `taskTrayHonestReads.test.tsx`, +2 (B 3): overdue marks the bell (`data-overdue`) and its name says
    "4 items waiting, 2 overdue"; a late item still marks it beside the "?" of a failed count. Plus one assertion in
    "a real count still shows as a number": no mark when nothing is late. Red: 2 failed.
  - `shellWiring.test.tsx`, +1: `main.main`'s `data-surface` is "vault", then "home" after New conversation. Red at
    HEAD, green after.
- **Rewritten, each with its one-line reason in the file** (red at HEAD where they pin the new bar):
  `topBarProject` (3 cases: the crumb, no "No project open", the title-named crumb; red 3), `projectFeatureBreadcrumb`
  (no root or "Projects" crumb, the chip case → the crumb button, a core place carries the project crumb; red 10),
  `shellChromeTruth` (the crumb text; organisation and Help cases follow the sidebar's account; New task and
  Collaborate by their new names; red 4, the P-25 case passes at HEAD since D1-1), `clientNamesSlice1` (the project
  page's crumb; red 1), `shellSegmentFollowsProgram` (no "No project open"; red 1), `shellProtocolLeaveGuard` (the
  project crumb by name, red 1; Help through the account menu, which D1-1 already guarded, passes at HEAD),
  `projectHomeStepReturn` (the crumb by name; red 1), `shellNav` (the palette is opened from the sidebar's Search; the
  draft in the red run also clicked the sidebar's Vault instead of the palette's, and was then scoped to the palette:
  the case depends only on D1-1's Search, so it passes with and without D1-2), `taskTrayQuiet` (the badge carve-out
  goes; red 2: the badge was orange and 10px).
  - e2e (Playwright, not run on this host): `launch-walk-no-lock.e2e.ts` and `golden-customer-journey.e2e.ts` open
    the palette from the sidebar's Search (`/^Search/`, so the collapsed rail's title name matches too);
    `project-step-return.e2e.ts` clicks `button.crumb-proj`.
- **Green** (`green/tests-after.txt`): the same 12 files, **204 passed, 3 failed**, all three red at HEAD for reasons
  not D1-2's: `clientNamesSlice1`'s two "Not in client copy" cases ("Biostat workbench", also in D1-1's runs) and
  `shellWiring`'s first case, the cold lazy-import timeout D1-1 recorded (`D1-1/red/shellWiring-head-alone.txt`; red
  the same way in `red/tests-at-head.txt`).
- **Neighbours** (`green/neighbours.txt`, 36 files): **447 passed, 25 failed**. The 25 are the ones above plus
  `railLicenseGating` (9), `accountMenuMasterLicensing` (10) and `accountMenuBilling` (3), whose `mountRail` waits on
  `toHaveBeenCalledWith('GET', NAV_URL)` against a four-argument call: red at HEAD and recorded by D1-1
  (`D1-1/red/neighbours-head.txt`); none of their files is touched here. The three D0 guards are green:
  `foundationsOneDefinition` 17, `foundationsRetiredRatchet` 33, `foundationsSentenceCase` 3; so are
  `tests/ui/ana-rail-phone-drawer`, `one-shell`, `surface-registry-coverage` and `token-authority`.
- **Every surface through the fallback** (`green/every-surface.txt`): `a11ySemantics`, `hostilePayloadProbe`,
  `surfaceRender`, `liveBranchRender`, `guardsPreserveContent`, `workflowAudit`: **644 passed**.

## Gates (`green/gates.txt`, `green/eslint.txt`, `green/tsc-narrow.txt`, `green/surface-text-ramp.txt`)

- `ci:undefined-css-classes` OK (`crumb-proj`, `tb-collab`, `tb-newtask`, `tb-new` are defined);
  `ci:check-css-selector-shadowing` OK, 0 new (it now lists `.c2c-v2 .tb-cmdk .lbl` as a stale baseline entry: the
  rule is gone); `ci:check-shell-css-collisions` OK; `ci:one-product` OK (10 rail entries, none new);
  `ci:token-contrast` OK; `ci:design-system` OK; `check:microcopy` OK.
- `ci:surface-text-ramp`: **red at HEAD already** (the committed sheet lacks the L8 Vault share; coordinator task
  42). In a scratch repo of HEAD's tracked sheets: regenerated from them, green; plus this step's `app-v2.css`, red;
  plus `green/surface-text-ramp.d1-2.patch`, green (`green/surface-text-ramp.txt`).
- ESLint on the 19 changed files: 0 errors, **no new warning** against `red/eslint-head.txt`. Existing ones moved:
  `Shell.tsx` 981 → 905 lines, `Rail` 254 → 253, `TaskTrayOwner` complexity 20 → 18, `V2App` 696 → 697 lines (one
  comment line). `shellQuietChrome.test.tsx` was compacted to stay under the 500-line warning.
- Narrow `tsc` over the 4 sources and 9 tests: nothing in a D1-2 change (its 5 errors are the narrow config's
  missing ambient types: `*.module.css`, `*.svg`, `ImportMetaEnv`, as in D1-1).

## For the committer

- **Stage exactly:** `client/src/concept2cure/v2/Shell.tsx`, `client/src/concept2cure/v2/V2App.tsx`,
  `client/src/concept2cure/v2/TaskTray.tsx`, `client/src/concept2cure/v2/surfaceViews.ts`,
  `client/src/concept2cure/v2/styles/app-v2.css`; the tests `client/src/concept2cure/v2/__tests__/` `shellQuietChrome`,
  `taskTrayHonestReads`, `taskTrayQuiet`, `topBarProject`, `projectFeatureBreadcrumb`, `shellChromeTruth`,
  `clientNamesSlice1`, `shellSegmentFollowsProgram`, `shellNav`, `shellProtocolLeaveGuard`, `projectHomeStepReturn`,
  `shellWiring` (`.test.tsx`), and `projectCreationDoors.contract.test.ts` (review);
  `tests/e2e/launch-walk-no-lock.e2e.ts`, `tests/e2e/golden-customer-journey.e2e.ts`,
  `tests/e2e/project-step-return.e2e.ts`; and `docs/evidence/DESIGN/D1/D1-2/`. Other sessions have uncommitted files
  in the tree (`editor/**`, `authoring-v2.css`, `surfaces/Authoring*.tsx`, server files): commit with
  `git commit -- <paths>`.
- **The generated ramp:** `green/surface-text-ramp.d1-2.patch` is this step's share, against the ramp regenerated
  from HEAD's sheets (remade in review at `f0ade0abc`, after D5-3's rule `41cdf4c96`; see `review/surface-text-ramp.txt`).
  It does **not** apply to HEAD's committed ramp, which still lacks the Vault share (task 42):
  either regenerate the ramp (`node scripts/design/generate-surface-text-ramp.mjs`) in a tree whose only uncommitted
  CSS is this step's `app-v2.css` (that takes both shares), or land the Vault share first and then
  `git apply --index` the patch.
- **Trailers:** `Plan: D1`, `Completes: client/src/concept2cure/v2/Shell.tsx`. Every file is in D1's ledger paths
  (`Shell.tsx`, `V2App.tsx`, `TaskTray.tsx`, `surfaceViews.ts` (P-85), `styles/**`) or `alwaysAllowed`
  (`**/__tests__/**`, `tests/**`, `docs/evidence/**`).

## Not done here, and why

- **The running-app checks** (§D1.B acceptance 1–6 at 1440 and 390, light and dark: no orange in `.topbar`, the
  transparent rule on Home, the 44px phone buttons and no overflow, the dark badge and crumb hover, ⌘⇧T): no dev
  server or browser on the shared 4-CPU host. They belong to D1's package walk (§D1.J), with screenshots. For that
  walk to look at:
  - `.tb-btn` is global: the spec's new metrics (inline-flex, radius 8, `--text-300`, 16px glyph, hover `--bg-100`,
    44px at ≤640px) also reach `OrganizationAccess`'s button in the sidebar foot, `NavUnlockPanel`'s close,
    `RbmSurfaces`' collapse and the MDX surfaces' header icons (`K510Surface`, `IvdSurface`, `cer/*Tab.tsx`).
  - **At ≤640px, until D1-3 lands, New task and Collaborate have no top-bar button** (the spec hides them there
    because ⌘K gains "New task" and "Message a colleague" in §D1.F step 3, which is D1-3's). Meanwhile they are
    reached by ⌘⇧T (a keyboard) and the screens' own task and discuss actions. Push D1-2 with D1-3 (the lane's slice),
    or the gap ships.
  - Focus at phone width (carried from D1-1's review): "Open the sidebar" leaves focus on itself. Not in the spec.
- **`scripts/ci/css-selector-shadowing-baseline.json:18`** (`.c2c-v2 .tb-cmdk .lbl`) is now stale (the gate logs it
  and passes). `scripts/**` is not in D1's paths; whoever owns that file deletes the line.
- **The `.tb-dom*` block** (`app-v2.css` 829–838, the client-domain switcher) has no markup since F8. D1-2 removed
  only its `.tb-org-chev` rule (a `.tb-org*` selector the spec names); the rest is outside the bar's block and this
  step.
- ⌘K's placeholder ("Search surfaces…") and its group names are D1-3's; `golden-customer-journey.e2e.ts` and
  `shellAskGuard.test.tsx` still read the old placeholder.

## Review (the skeptic, 2026-11-02, at `f0ade0abc`)

Checked against `D1.md` §D1.B line by line, `BUILD_ORDER.md` §1 D1, `D0.md` §3/§4.2 and CLAUDE.md RULES 3–6. Every
changed file is in D1's ledger paths or `alwaysAllowed`; `app-v2.css` changes only the step's ranges (the `.tb-org-chev`
line in the dead `.tb-dom` block, `.tt-badge`, D1-1's interim `.tb-rail` pair, the bar block, `.tb-task*`,
`.scaf-note[aria-busy]`, `.tb-proj*`). No new screen, route, service, component file, table or AnA tool; no primitive
redefined; every text size is `var(--fs-…, px)` (the two bare `16px` are icon glyphs, as the spec and D0 §3 write
them). Every deleted control's outcome is reached at the path the table above names. Since the builder's read,
`41cdf4c96` (D5-3's rule) is the only commit touching these files; the working tree is on top of it.

**Fixed in review (two defects):**

1. **The project crumb's focus ring and hover fill were clipped** (deviation 10 above). Keyboard focus on the bar's one
   text control was invisible. Fix in `app-v2.css`; pinned in `shellQuietChrome.test.tsx`'s crumbs case
   (`review/crumb-clip-red.txt` → `review/crumb-clip-green.txt`).
2. **`projectCreationDoors.contract.test.ts` went red** ("v2/Shell.tsx retains its Projects index door"). It reads
   `Shell.tsx` by path and found the literal `onNav?.('projects')` of `ProjectChip`'s "No project open"; none of the
   builder's runs included it. The door's outcome was already the sidebar's Projects (the capability table), so the
   contract now pins that place (`RAIL_CORE`'s `projects` entry opens its own id), and `shellNav.test.tsx` gains
   "Projects is on the rail, and opens the Projects index", the rendered click. Both shown red against a scratch
   `RAIL_CORE` whose Projects pointed elsewhere (`review/project-doors.txt`).

**Re-run independently:**
- Red first: the 12 changed test files against a scratch export of HEAD's sources: 49 failures, of which 3 were red
  before D1-2 (shellWiring's cold timeout, clientNamesSlice1's two wording cases) (`review/red-at-head.txt`).
- Every test file under `client/src` that names a changed file (158) against HEAD + D1-2 only: 34 failures in 10
  files, each attributed in `review/importers.txt`; the one that was D1-2's is fixed above. The 10 test files outside
  `client/src` that read these files (`tests/ui/*`, `tests/concept2cure/*-smoke`, …): 62 passed.
- The three D0 guards (53), `ci:undefined-css-classes`, `ci:check-css-selector-shadowing` (0 new),
  `ci:check-shell-css-collisions`, `ci:one-product`, `ci:token-contrast`: green. ESLint on every changed
  `.ts`/`.tsx` and e2e file: errors and warnings equal to HEAD's, file by file. Narrow `tsc`: the same 5 ambient-type
  errors as the builder's, none in a changed file.
- The ramp: `green/surface-text-ramp.d1-2.patch` was remade against the ramp regenerated at `f0ade0abc` (the builder's,
  made at `2e4a9fe67`, no longer applied after D5-3's rule; same share, one count lower); the review's CSS fix does not
  change the ramp (`review/surface-text-ramp.txt`).

**Open, for the coordinator:**
- **Push D1-2 only with D1-3.** At ≤640px Collaborate and New task have no top-bar button until ⌘K gains "New task"
  and "Message a colleague" (§D1.F step 3). On a phone, ⌘⇧T is not a path.
- **`ci:surface-text-ramp` is red** in the shared tree and at HEAD (task 42). Regenerate the ramp from a quiet tree,
  or land the Vault share and `git apply` this step's patch, before the push.
- `scripts/ci/css-selector-shadowing-baseline.json:18` (`.tb-cmdk .lbl`) is stale; the `.tb-dom*` block is dead CSS.
- The running-app walk (1440/390, light/dark) is still owed, with the shared `.tb-btn` metrics (sidebar's organisation
  access, `NavUnlockPanel`, RBM, MDX headers) and the crumb's focus ring and hover fill in it.
