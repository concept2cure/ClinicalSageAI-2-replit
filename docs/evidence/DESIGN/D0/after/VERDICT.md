# D0 verdict: the after captures against D0.md §7

**Compared:** `../before/probes.json` (commit `d914c2618`, before D0) and `probes.json` here (commit `f2385372`, which
includes D0-1 to D0-6). The checks are the sixteen in `.design/claude-convergence/D0.md` §7 (lines 1111–1165). Lanes
are named from `.design/claude-convergence/BUILD_ORDER.md`.

**Line numbers.** `BUILD_ORDER.md` and `D0.md` lines are as committed; neither file is modified in the working tree.
Stylesheet and component lines are at HEAD `0e2db6c3a` unless a commit is named. Other sessions are editing
`app-v2.css` in the working tree, so find each rule by its selector as well as its line.

**What was run for this verdict, beyond the capture agent's work:**
- I read the 16 screenshots the task names: projects, project, cmc, submission-center, communication, tasks, editor
  and conversation, each at 1440 light and 390 dark. I also read `before/tasks-390-dark.png` for comparison.
- I ran `ci:token-contrast` and `visual-qa:contrast` in scratch copies of `d914c2618` and `f2385372`, each with a
  fresh `vite build` and markup capture. `visual-qa:contrast` was run a third time on `f2385372` with
  `dataConnect.tsx` replaced by its `1d789b516` version.
- I ran the three D0 guards and every test named in D0.md §6 at `f2385372`.
- The raw outputs are in `check-14-16/`.

## Result

D0 does **not** pass §7 at `f2385372`:
- **Pass (7 checks):** 3, 5, 9, 10, 11, 12 and 15.
- **Partial (1 check):** 16. The guards pass; two §6 tests fail, and both belong to other lanes.
- **Fail (8 checks):** 1, 2, 4, 6, 7, 8, 13 and 14.

Most of what fails is owed by a named lane. D0 owns five code defects and one spec-text item (listed below). One
defect, the empty-state fill behind checks 8 and 14, is already fixed at HEAD.

Grades: **(a)** D0's own defect · **(b)** owed by a named later lane · **(c)** a measurement or spec-text problem.
Values are at 1440 light unless marked; dark gave the same counts everywhere.

| # | What D0 asks (§7) | Before `d914c2618` | After `f2385372` | Result | Where it is not a pass, and why |
|---|---|---|---|---|---|
| 1 | No element has computed `text-transform: uppercase`, on any screen or theme | Above 0 on all 16 screens: Vault 99, editor 65, project 19, Projects 17, Quality 21 … | 0 on 15 of 16. Quality: 14 | **FAIL** | **(b)** Every hit comes from `client/src/concept2cure/quality/app.css`: `.qms-eyebrow`:76, `.qms-kpi .lbl`:93 and `.qms-thead`:134. Two more declarations, at :337 and :355, did not render on the captured tab. That file is outside D0's sweep. D0.md:1045–1047 routes it to F1. BUILD_ORDER.md:378 assigns it to D7-B after the ledger fix, otherwise F1, and :324 lists it in D7-B's files. |
| 2 | At most one element per view filled with `--accent-strong` (send buttons excluded) | Excluding the shell: CMC 2, Tasks 2, Communication 2, Submission Center 1, Vault 3, Reporting 4, editor 2, drawer 3 | Excluding the shell: project, CMC, Submission Center and conversation 0. Eight screens at 1. Editor 2, drawer 2, Vault 3, Reporting 4. Raw count is +3 on every screen in both runs | **FAIL** | **(b)** The shell's avatar, `.tb-org-mark` and `.tt-badge`: D1-1 and D1-2 (BUILD_ORDER.md:92–93; D1.md:214, :310 and :323 turn them to ink). **(b)** Editor "Saved" and "Build document": D4-2 (BUILD_ORDER.md:222, :674). **(b)** Vault's three `.sp-primary`: D6-3 (BUILD_ORDER.md:293, :733; D6.md:473–478). **(b)** Reporting's `.rc-preset-btn`, `.rc-tier-b.on`, "Find" and `.rl-tab.on`: D7-D (BUILD_ORDER.md:326, :763, :905). **(c)** The drawer's second fill is the page's button behind the modal scrim. RBM's one fill is `.rbm-ana-send`, a send button that §7's exclusion list predates. **(c)** D0's own "today" figures already excluded the shell, but the §7 text does not. See also D0 defect 5: `.sp-primary` was never made the one primary. |
| 3 | Root `.c2c-v2` is 14px. Every `.ph-title` and `.sp-title` is Lora 26/500, and 22px at 390 | Root 13px. Titles are the system sans at 24/600 and 23/600 | 14px everywhere. Titles Lora 26/500, 22px at 390 | **PASS** | — |
| 4 | `.btn` 32px; `.btn.small` 28px with no uppercase or tracking; `.de-btn` 36px; every `.btn` ≥44px at 390 with touch; no transform on primary hover | `.btn` 32, with 23 editor buttons at 30. `.btn.small` 32px, uppercase, 0.625px tracking. `.de-btn` 43.5. 32px at 390. Primary lifts 1px on hover | `.btn` 32, but the editor's 23 are still 30. `.btn.small` 28, no case or tracking. `.de-btn` 36. Every `.btn` 44 at 390. `.btn.primary` hover has no transform | **FAIL** | **(b)** The editor's 30px comes from inline `style={{ height: 30 }}`, at 20 sites in `editor/DocumentWorkbench.tsx` (at `f2385372`, :4523–4698) and `editor/AuthoringRefileSavedText.tsx`:87. These are D4-2's files (BUILD_ORDER.md:222, :676). **(a)** `.sp-primary`, the other filled primary (59 uses in 28 files at `f2385372`, including Communication's "Log communication"), still lifts on hover (`journey-v2.css`:272). The probe hovered only `.btn.primary`, so this was read from the CSS. See D0 defect 5. |
| 5 | `.pj-card` has radius 12 and padding 16. `.pj-card-h` is transparent with padding 0. This must hold even after visiting Biostatistics and then Submission Center | Submission Center: radius 8, padding 14, and a `.pj-card-h` band filled `rgb(245,244,238)` | 12 / 16 / transparent on the project page, Submission Center, CMC and Projects, in either visit order | **PASS** | — |
| 6 | Chips 12/500, sentence case, first letter upper. `.reg-tbl th` 12px on a transparent background. Active tab underlined in `--text-100`. CMC's and RBM's tab rows are one line and scroll | Chips 10.5/600 uppercase. `th` 10px uppercase on a band. Active tab orange. RBM wraps to 2 rows at 1440 and 7 at 390 | Chips 12/500 sentence case. `th` 12px, transparent. Active tab ink on CMC, Submission Center, Communication and RBM. CMC is one row and scrolls. RBM still 2 rows at 1440 and 7 at 390. Quality and Reporting active tabs still orange | **FAIL** | **(b)** RBM: `.rbm-tabs{flex-wrap:wrap}` at `rbm-v2.css`:16 outranks D0's `flex-wrap: nowrap`. That line is D7-C's (BUILD_ORDER.md:325, :760 "the ten tabs fit one row"). **(b)** Quality: `.qms-tab[data-on]` sets an `--accent-main-100` underline at `quality/app.css`:278 (D7-B, BUILD_ORDER.md:324 and :378). **(b)** Reporting: `.rl-tab.on` is filled orange at `insights-v2.css`:185 (D7-D, BUILD_ORDER.md:326 and :370). **(c)** The project page's six header chips measure 13/400 and transparent. That is `.pj .pj-tags .rd-chip`, which D0 §4.2.10 keeps on purpose, so the probe should exclude it. |
| 7 | One focus ring on the Projects search and on ⌘K (⌘K may have none). `.de-input` 36px. At 390 with touch, inputs ≥44px at 16px | Client select: 2px orange outline. ⌘K: 2px outline. `.de-input` 39.5. Fields failing the 390 rule on 12 screens | Client select: one ring. ⌘K: no ring. `.de-input` 36. Projects search (`.pj-search-i`): **two rings**. Fields failing the 390 rule on 11 screens | **FAIL** | **(b)** The Projects search belongs to D2-1 (BUILD_ORDER.md:142, :627 "one focus ring"). D2.md:203 holds the exact rule, and it landed in `78842ee08` after this capture. It has not yet been seen in a running app. **(c)** §7 calls this field "`.c2c-input` (Projects search)", so both runs measured the Client select instead. **(a)** The 390 rule fails for the Home, project and conversation composers, which stay at 15px. D0 itself sets 15px at `app-v2.css`:415, and its coarse-pointer rule (:286–288) skips text areas, including `.de-textarea`. See D0 defect 4. **(b)** The other failing fields belong to their lanes: ⌘K input 15px, D1-3 (:94); `.sc-subpick` 13px, D7-A1 (:320); Vault `.vd-filter .c2c-input{font-size:12px}` at `coverage-v2.css`:883, D6-3 (:293); `.tb-sel` 12px, D6-1 (:291); `.rbm-study-sel` and an input, D7-C (:325); Reporting textarea, D7-D (:326, :905, becoming `.c2c-input`); `.rse-sel` 13px, D4 (:221). |
| 8 | "No agency communications yet" has no border, a transparent background, and nothing orange inside | 1px dashed border, `rgb(238,236,228)` fill, 0 orange | No border, 0 orange, but still the `rgb(238,236,228)` fill (dark `rgba(176,174,165,.16)`) | **FAIL** at `f2385372`. Fixed at HEAD | **(a)** D0's `background: none` (`app-v2.css`:387) loses to the unscoped `.c2c-v2 .tone-idle` at :2318: same specificity, declared later. `EmptyState` rendered `c2c-empty-state tone-idle`. Fixed by `1d789b516` (`dataConnect.tsx`), not yet reconfirmed in a running app. Visible in `cmc-1440-light.png` and `communication-1440-light.png`. See D0 defect 1. |
| 9 | `.al-lead` transparent with no border; `.al-h` sans 15px; `.al-btn` a hairline ghost; CMC "Advance the next section" goes where it did | Tinted `rgb(250,240,236)` with a border. `.al-h` Lora 21/400. Filled orange 38px button | Transparent, no border. `.al-h` system-ui 15/600. 32px hairline ghost at radius 8. Same destination (`conversation-thread`) | **PASS** | — |
| 10 | CMC's "flows into" row has no pills, and its six destinations still work. "What to do now" has no box. Both are gone after D3 and D5 | Both bands present | CMC: 0 `.cm-connect`, 0 `.pj-stageband`. All six destinations reached through their new doors. The project page's band is unboxed and sentence case | **PASS** | The project page still shows "What to do now / Next step" text. That goes in D3-1b (BUILD_ORDER.md:170). |
| 11 | Drawer 440px with no `backdrop-filter`; focus trapped; Escape returns focus; 100vw at 390; no animation under reduced motion | 520px with `blur(3px)` | 440px, no blur. 40 Tabs never left the drawer. Escape returned focus to the opener. Animation `none` under reduced motion. At 390: 100vw, with the footer's two buttons side by side at 171×44 | **PASS** | Side by side is D0's own rule (§4.2.14, `flex: 1 1 0`). |
| 12 | Composers radius 20, `--canvas-elevated`, 1px `--border`; focus changes only the border; send 32px orange, 0.4 opacity when disabled | Radii 16/14/14. Focus added a ring. Disabled 0.5, 0.5 and a grey button | 20px, `#fff` / `#30302e`, 1px `--border`. Focus changes only `borderColor`. Send 32×32 at radius 8, 0.4 when disabled | **PASS** | The composer text is 15px; see check 7. |
| 13 | `.page` does not scroll sideways at 390 on any screen. "New project" on its own row, unclipped. Segmented rows scroll inside | 10 of 16 fit (Communication 383, drawer 383, Tasks 539, Quality 854, RBM 348, conversation 370). "New project" clipped at x 427 | 12 of 16 fit. CMC 548, Tasks 523, Quality 854, conversation 370. "New project" on its own row, unclipped | **FAIL** | **(a)** CMC regressed: it fitted before only because `journey-v2.css:94` clipped `.pj-card` with `overflow:hidden`. D0-2 removed that and gave a table in a card nowhere to scroll (D0 defect 3). CMC's own table moved into `.pj-sec` in D5-2 `ff6825ef6` (BUILD_ORDER.md:257, :705), where D5-0's rule scrolls it. **(a)** New and not in the capture report: a ~250px blank gap under the Tasks header at 390 (`tasks-390-dark.png` against `before/tasks-390-dark.png`; D0 defect 2). **(b)** Tasks' `.tb-filters`: D6-1 (BUILD_ORDER.md:291, :728). **(b)** Quality's `.qms-tabbar`: D7-B (:324, :757). **(b)** The conversation's `.ct-engine` controls: D1-5 (:96, :597). **(b)** The Projects toolbar clips its search, Client select and filter rows: D2-1 (:142, :626). The Grid/List `.seg` collapsed to 4px because D0's `overflow-x:auto` (`app-v2.css`:330) removed its min-content floor; before, it sat 101px wide at x 573, off-screen either way. **(b)** Reporting's `.rl-tabs` is 0px wide: D7-D (:764). **(c)** The `.page` probe misses content clipped inside an inner container: Projects' toolbar, Submission Center's `.sc-subpick` and the conversation's composer controls all run off the screen edge while `.page` reports a fit. |
| 14 | `ci:token-contrast` and `visual-qa:contrast` show no new failures, light or dark, against pre-D0 | token-contrast: 131 pairs pass, 15 exceptions held. visual-qa:contrast: 0 of 5,916 below AA | token-contrast: 131 pairs pass, 15 held (the same in the working tree at HEAD). visual-qa:contrast: **2 of 5,760 below AA** | **FAIL** at `f2385372`. Clears with `1d789b516` | **(a)** Both failures are `div.c2c-empty-reg` ("Every save records an auditable revision (21 CFR…") on `v2__document-authoring`: 4.01:1 in light (`rgb(117,115,109)` on `rgb(238,236,228)`) and 3.29:1 in dark. Two D0 changes combine here: §4.2.12 moved the line from `--text-300` to `--text-400` (`app-v2.css`:401; before, `d914c2618:app-v2.css`:259–262), and it sits on the `tone-idle` fill from check 8. With `dataConnect.tsx` at `1d789b516`, the same run measures 0 of 5,762 below AA. Both runs' captures fail the same one spec (`dump-insert-gate`, a mock error), before and after, so the comparison stands. |
| 15 | Dark: 1–13 hold; active segment `--bg-200` and lighter than its track; composer `#30302e` on `#262624`; neutral chip `--bg-200` | Active segment `rgb(38,38,36)`, darker than its track. Composer `#262624` on `#262624` | Active segment `rgb(61,61,58)` on a `rgb(48,48,46)` track. Composer `#30302e` on `#262624`. Chip `--bg-200`. Checks 1–13 give the same counts as light | **PASS** for the dark-specific checks | Checks 1–13 carry their light results into dark. |
| 16 | The three guards were recorded red before their commit and green after. The §6 tests pass unchanged except where an owner is named | — | Guards: red (`../red/`) and green (`../green/`, `../D0-5/green/d0-guards.txt`, 53 tests) are filed. §6 at `f2385372`: 20 of 22 files pass, 256 of 258 tests | **PASS** for the guards. **PARTIAL** for §6 | `shellChromeTruth` is red on the rail's active fill. §6 names D1 for that change (D0.md:1095), and the change landed in `4a5cc0d22`, before D0. `projectHomeStageCss` fails on `.pj-sec-acts`, which D5-0 (`943b78cb7`) also defined in `app-v2.css` (HEAD: twice there, twice in `project-home-v2.css`). That is **(b)** D5 (BUILD_ORDER.md:255, :273), not D0. |

## D0's own defects, and the fix each needs

1. **The empty state wore a chip's fill.** It failed check 8 and caused both check-14 contrast failures.
   - The cause: `app-v2.css`:387 `.c2c-v2 .c2c-empty-state { … background: none }` loses to `.c2c-v2 .tone-idle
     { background: var(--idle-muted) }` at :2318, because `EmptyState` emitted `tone-idle`.
   - Fixed at HEAD by `1d789b516` (`dataConnect.tsx`:711–713). With that file, `visual-qa:contrast` returns to 0 below
     AA (`check-14-16/visual-qa-contrast-after-f2385372-with-1d789b516.txt`).
   - Still owed:
     - re-take Communication and CMC at 1440 and 390, light and dark;
     - scope the unscoped `.c2c-v2 .tone-ok|ai|warn|idle|dim|err` rules (:2315–2322) to the elements that mean them,
       so no other primitive can borrow a chip fill;
     - set `.c2c-empty-reg` (:401) back to `--text-300`. D0 §3 allows `--text-400` only on `--bg-000`, and an empty
       state sits on any surface: `--text-400` measures 4.08:1 on `--bg-100` and 3.79:1 on `--bg-200`, per
       `check-token-contrast.mjs`:239–241.
2. **A blank gap of about 250px opens under the Tasks header at 390.** This is new with D0.
   - The cause: `app-v2.css`:157 gives the header's first child `flex: 1 1 420px`. That reads as a 420px height when
     `.c2c-v2 .tb .ph{flex-direction:column}` (`app-v2.css`:1199, at ≤760px) turns the header into a column.
   - The fix:
     - make the rule axis-safe: `> :first-child { flex: 1 1 0%; min-width: min(420px, 100%); }`. It wraps the same
       way in a row and takes its content height in a column;
     - delete the now-redundant `.tb .ph` column rule, as D0 §4.2.2 already deleted `.workflow-page .ph`'s.
3. **A table inside a card pushes the page sideways at 390.** This caused CMC's 548.
   - The cause: D0-2 deleted `journey-v2.css:94`'s `.pj-card{overflow:hidden}`, and the canonical card
     (`app-v2.css`:293) gives a `.reg-tbl` nowhere to scroll. Before D0, the table was clipped instead.
   - Reach: 23 surface files use both `.reg-tbl` and `.pj-card-b`. In 13 of them, at `bfa9c6869`, a table's nearest enclosing `<div>` is a card (`pj-card`, `pj-card-b` or `reg-card`). Among them are `EctdCompile*.tsx`,
     `MissionControl.tsx`, `PvCockpit.tsx`, `CmcModule3Build.tsx` and `GatewayTransmittals.tsx`.
   - The fix: add `@media (max-width: 640px) { .c2c-v2 :is(.pj-card, .pj-card-b, .reg-card) > .reg-tbl { display: block;
     overflow-x: auto; } }` after `.reg-tbl` (:383). Fold D5-0's `[data-work-area]` copy (:3935–3936) into it, so
     there is one definition.
4. **The 16px phone rule skips text areas.**
   - The cause: the coarse-pointer block (`app-v2.css`:286–288) lists only `.c2c-input`, `.de-input` and `.de-select`,
     and D0 sets the composer text at 15px (:415). The Home, project and conversation composers, and every C2CForm
     `.de-textarea` (96 textarea fields), are under 16px on a phone, so iOS zooms on focus.
   - The fix: in that block, add `.c2c-v2 :is(.de-textarea, .landing-input, .pj-composer textarea, .ct-composer
     textarea) { font-size: 16px; }`.
5. **`.sp-primary` was never made the one primary.**
   - What it is: a second filled-orange button family, 59 uses in 28 files at `f2385372` and 50 in 24 at `bfa9c6869`, after D6-3 converted Vault's (TSX outside `__tests__`; `journey-v2.css`:271–273 and :277). It is
     radius 6, 12.5px and about 37px tall (`communication-1440-light.png`), and on hover it lifts 1px with a shadow (:272).
   - Why it is D0's: D0 §1.5's inventory missed it, although BUILD_ORDER.md:362 lists "`.sp-primary` hover" among
     D0-2's lines. It is Communication's and Vault's primary, and one reason Vault shows three orange fills.
   - The fix:
     - alias it into D0's primary lists (`app-v2.css`:186–207, beside `.reg-cta`);
     - in `journey-v2.css`, delete its chrome and the hover transform, keeping `flex-shrink:0; white-space:nowrap`;
     - add `sp-primary` (50 at `bfa9c6869`) to `foundationsRetiredRatchet.test.ts`, so D6-2 and D6-3 convert it as D6.md:284 and
       :473–478 already plan.
6. **§7's text measures the wrong things in four places.** These are **(c)** items, with one D0.md fix each.
   - Check 2: name the shell chrome exclusion (`.avatar`, `.tb-org-mark`, `.tt-badge` until D1-1 and D1-2) and add
     `.rbm-ana-send` to the send buttons.
   - Check 6: exclude `.pj .pj-tags .rd-chip`.
   - Check 7: name the Projects search as `.pj-search-i` / `.pj-search`, not `.c2c-input`.
   - Check 13: add an element-edge probe (every visible element's right edge ≤ the viewport), because `.page`
     scrollWidth misses content clipped by an inner container.

   D0.md is a plan file, so this needs the coordinator. It is not an evidence edit.

## Does it read as Claude's calm UI (ONE_DESIGN_PLAN §2)?

**The frame now reads as Claude's:**
- the serif page titles;
- quiet context lines in place of shouted eyebrows;
- hairline cards with no header bands;
- sentence-case chips and table headers;
- ink-underlined tabs;
- the quiet answer lead with a ghost action;
- the composers;
- the drawer.

The before/after pairs show the change most on Tasks, CMC and Submission Center. Each had a tinted serif banner with a
second orange button; each now has a plain question, answer and one hairline action. What still breaks the calm is
mostly the owners' content, plus the shell, which every screen shares.

- **Shell, on every screen (D1):** a dashed "No project open" or project chip, the orange "CT" mark, an orange-tinted
  Task button and an orange badge. At 390 a 56px icon rail stays, where D1 hides it, which leaves 334px of content.
- **Projects:** close at 1440: serif title, one primary, calm cards. Still to remove: the "Workspace" line, the stat
  strip, two segmented filter rows, readiness bars and "Ask AnA" (D2-1, landed after this commit). At 390 the
  toolbar is clipped: the search shrinks to its icon, and the Client select and workstream row run off the right edge.
- **Project:** the closest to Claude: serif title, a large composer, quiet step tabs and a "Project knowledge"
  column. The side column's work-area links are orange text, and the "What to do now / Next step" text remains
  (D3-1, D3-1b). 390 dark reads well.
- **CMC:** calm: a quiet lead, a starters row, ink tabs and no banners. The one visible fault is D0's grey-filled
  empty state, "No Module 3 sections yet".
- **Submission Center:** a calm header, but the lead names the project three times. A tinted note with an
  orange-text pill ("Forms and letters…") sits above the tabs, and at 390 the native submission select runs off-screen
  (D7-A1).
- **Communication:** the calmest work area: one primary, a quiet lead, ink tabs. The one fault is D0's grey empty-state
  box. At 390 the primary goes full width and the tabs scroll.
- **Tasks:** a calm header over a colourful kanban, with tinted chips, a "Where these tasks come from" band and native
  selects (D6-1). At 390 it has D0's blank gap under the header.
- **Editor:** does not read as Claude yet: 21 buttons in four rows above the page, and "Saved" as an orange primary
  (D4-2). The page itself reads right: serif text and an outline.
- **Conversation:** the empty state and composer are close. Not yet calm: the orange ✻ tile, the orange-text header
  buttons, and the control cluster under the composer ("AnA drives: on" in green, Demos, Manual/Auto, Skills,
  Engine). At 390 that cluster is clipped on both sides (D1-5).

## Since `f2385372` (seen in git, not in a running app)

- **Check 8 and check 14:** fixed by `1d789b516` (EmptyState drops `tone-idle`).
- **CMC's 390 overflow:** resolved for CMC by `ff6825ef6` (D5-2 moves Portfolio into `.pj-sec`). D0 defect 3 still
  applies to the 23 other files.
- **Projects' search ring, 16px and toolbar wrap:** `78842ee08` (D2-1).
- **A re-capture is still owed for all three.** Each was proven from source, not from a running app.
