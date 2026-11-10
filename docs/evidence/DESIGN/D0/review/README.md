# D0 review: six lenses, each finding checked against the code and the captures

**What this is.** Six read-only reviews of D0 (D0-1 to D0-6) were run against `.design/claude-convergence/D0.md`, the
before captures (`../before/`, commit `d914c2618`) and the after captures (`../after/`, commit `f2385372`). This file
records which findings held up when re-checked, which did not, and what D0 still owes. The §7 verdict is in
`../after/VERDICT.md`; this review does not change its result.

**How each finding was checked.**
- Each cited `file:line` was opened in the committed tree at `bfa9c6869`, never in the working tree, which other
  sessions were editing. Lines are given at `bfa9c6869`. Rules after `app-v2.css:3909` sit 3 lines lower at
  `f0ade0abc`, so find each rule by its selector as well.
- Each cited capture was opened. Each cited probe was read in `../after/probes.json`.
- Counts were re-measured in a `git archive` export of `bfa9c6869`. They are in `counts-bfa9c6869.txt`.
- The CSS gates were re-run in that export. Their outputs are in `gates-bfa9c6869/`.
- A finding survives only if the cited code and capture still show it. Each one that survives is graded:
  - **(a)** D0's own defect, with its fix and file;
  - **(b)** owned by a named later lane, with the `BUILD_ORDER.md` line;
  - **(c)** a measurement or spec-text problem in `D0.md`;
  - **pre-existing**: outside D0's diff.

**Corrections made to `../after/VERDICT.md`** while checking it:
- Three cross-references in its table pointed to the wrong defect number. `.sp-primary` is defect 5, not 6, and the
  text-area rule is defect 4, not 5.
- `.sp-primary`'s count was 60 uses in 29 files. Re-measured, it is 59 uses in 28 files at `f2385372` and 50 in 24
  at `bfa9c6869`. The drop is D6-3 (`2e4a9fe67`, `Plan: D6`), which removed Vault's five uses. The button is about
  37px tall, not 34px.
- The claim "23 surface files put a table in a card" was too strong. 23 files use both classes. In 13 of them a
  table's nearest enclosing `<div>` is a card. The list is in `counts-bfa9c6869.txt`.

## The six lenses

| Lens | Raised | (a) D0's own | (b) a lane, or pre-existing | (c) spec or measurement | Refuted, or evidence only |
|---|---|---|---|---|---|
| Visual: after against before | 11, plus 3 nits and considerations | 7 (1, 2, 5, 8, 9, 10, 11) | 4 (4, and the 3 nits and considerations) | 3 (3, 6, 7) | 0 |
| Design-system conformance | 2 blockers, 10 should-fix, 6 nits | 11 (B1, S1–S3, S5–S8, N2, N4, N6) | 5 (B2, S4, part of S6, N1, N5) | 2 (S10, N3) | S9 is evidence only; one count corrected |
| Accessibility, WCAG 2.2 AA | 3 blockers, 7 should-fix, 3 nits | 5 (B1, S1 plausible, S3, S5, S7) | 2 (B3; B2's active row) | 3 (S2, S4, B2's ⌘K text) | 3 refuted (N1, N2, S6 as a failure); N3 is evidence only |
| Copy: sentence case and calm copy | AnswerLead, C2CForm, drawer CSS, README; 22 callers | 3 (footer wrap, `.de-err`, README) | the callers' strings, C2CForm, `UnresolvedLead` | 2 (`:66` and `:74`; `:41`) | 0 |
| Motion | 9 | 3 (1, 2's guard, 6) | 4 (3, 4, 5, 8) | 0 | 7 is evidence only; 9 is advice only |
| Truthfulness: answer lead and empty states | 8 | 2 (F1, F8) | 4 (F2, F4, F5, F6) | 1 (F3) | F7 is evidence only; one F5 site was not found |

Several findings were raised by more than one lens. The fixes list below counts each one once.

## Gates at `bfa9c6869` (`gates-bfa9c6869/`)

| Gate | Exit | Result |
|---|---|---|
| `check-phantom-tokens` | **1** | `--danger-000` at `project-home-v2.css:496`. It came from `bd144ed16` (D2 QP2), which is an ancestor of the before commit, so it predates D0. The gate also says `--accent-050` now resolves, so its baseline needs rewriting. |
| `check-token-contrast` | 0 | 131 pairs; 15 exceptions held |
| `check-design-system-compliance` | 0 | — |
| `check-token-cascade` | 0 | — |
| `check-chip-tones` | 0 | 182 literal tone uses, all 27 resolve |
| `check-css-selector-shadowing` | 0 | 17 known, 0 new. One stale baseline entry, `.c2c-v2 .reg-eyebrow`, which D0-2 cleared. |
| `check-orphaned-stylesheets` | 0 | 53 imported, 0 orphaned |

D0.md §6 names `ci:check-phantom-tokens` as a gate for every D0 commit. It has been red since before D0, so no D0
commit could have passed it.

## The 16 checks (from `../after/VERDICT.md`; 1440 light, dark identical)

| # | Check | Result at `f2385372` | Why not a pass |
|---|---|---|---|
| 1 | No uppercase | FAIL | (b) Quality's `quality/app.css:76, 93, 134`: D7-B or F1 (BUILD_ORDER:324, :378) |
| 2 | One orange fill | FAIL | (b) shell D1-1/D1-2; editor D4-2; Vault D6-3; Reporting D7-D. (c) drawer scrim, RBM send, shell exclusion. (a) `.sp-primary` |
| 3 | Root 14px; Lora titles | PASS | — |
| 4 | Buttons | FAIL | (b) editor's inline `height: 30` (D4-2). (a) `.sp-primary` lifts on hover |
| 5 | Cards | PASS | — |
| 6 | Chips, tables, tabs | FAIL | (b) RBM wrap D7-C; Quality tab D7-B; Reporting `.rl-tab.on` D7-D. (c) project header chips |
| 7 | Inputs | FAIL | (b) Projects search D2-1 (landed `78842ee08`). (c) wrong field named; ⌘K measured unfocused. (a) text areas at 15px |
| 8 | Quiet empty state | FAIL, fixed at HEAD | (a) `tone-idle` fill; `1d789b516` |
| 9 | Answer lead | PASS | — |
| 10 | Banners | PASS | project page text: D3-1b |
| 11 | Drawer | PASS | the footer label wraps at 390 (new here; (a) fix 8) |
| 12 | Composers | PASS | — |
| 13 | No sideways scroll at 390 | FAIL | (a) table in card; Tasks header gap. (b) D6-1, D7-B, D1-5, D2-1, D7-D. (c) clipped content not probed |
| 14 | Contrast | FAIL, 0 with `1d789b516` | (a) the empty state's fill and `--text-400` |
| 15 | Dark | PASS | the dark active segment has no ring ((a) fix 12) |
| 16 | Guards and §6 tests | PARTIAL | `shellChromeTruth` is D1's; `projectHomeStageCss` is D5's (`943b78cb7`) |

Seven pass, eight fail, one is partial.

## What already exists (RULE 3)

Every fix below extends a rule or file that already exists. None adds a screen, class family or file.
- **The primitives.** They are in `client/src/concept2cure/v2/styles/app-v2.css`:
  - the page header, `:152–175`;
  - buttons, `:186–207`;
  - inputs and the coarse-pointer block, `:258–290`;
  - cards, `:292–312`;
  - segmented control and tabs, `:329–352`;
  - chips, `:362–376`;
  - the empty state, `:384–401`;
  - composers, `:406–420`;
  - the answer lead, `:3708–3720`.
- **The drawer and toast.** They are in `journey-v2.css:476–582`.
- **An inset focus ring already in use** on the project steps: `app-v2.css:875`,
  `.pj-lc-stage:focus-visible{outline-offset:-2px}`.
- **A grey disabled state already in use**: `journey-v2.css:277`, `.sp-primary:disabled`.
- **A table scroll rule already in use**: D5-0's, at `app-v2.css:3954–3955`, scoped to `[data-work-area] .pj-sec`.
- **A screen-reader-only class**: `.sr-only`, at `app-v2.css:1014`.
- **The three guards**: `foundationsSentenceCase`, `foundationsOneDefinition` and `foundationsRetiredRatchet`, all in
  `client/src/concept2cure/v2/__tests__/`.
- **Components:** `AnswerLead.tsx`, `dataConnect.tsx` (`EmptyState` and `ErrorState`) and `C2CForm.tsx`.

## D0 fixes owed

Items 1 to 5 are `VERDICT.md`'s, re-checked at `bfa9c6869` and still open except where noted. Items 7 to 16 were
found by this review.

1. **Empty state, follow-ups to `1d789b516`.**
   - **Done:** the fill is fixed. `EmptyState` no longer emits `tone-idle` (`dataConnect.tsx:711–713`).
   - **Still owed:**
     - `app-v2.css:401`: set `.c2c-empty-reg` to `--text-300`. It is now `--text-400`, which is 4.08:1 on `--bg-100`
       and 3.79:1 on `--bg-200` in light, and 3.93:1 and 3.24:1 in dark. D0.md §3 allows `--text-400` only on
       `--bg-000`.
     - `app-v2.css:2334–2341`: limit the bare `.c2c-v2 .tone-ok|ai|warn|idle|dim|err` rules to `.rd-chip`. They
       duplicate `:371–376`, and in them `tone-ai` means a different colour. Before limiting them:
       - give `.sc-verdict.tone-warn` (`SequenceAssembleTestPackage.tsx:94`) and `.pdev-sev-dot.tone-warn`
         (`pdev/surfaces/Assembly.tsx:149`) rules of their own, because they have none;
       - `dc-cell` and `dc-820-dot` need nothing, because they already have their own (`coverage-v2.css:73–88`).
     - `app-v2.css:451–460`: delete `.c2c-empty-state.tone-error` and the comment "The error tone stays here".
       Nothing emits it now, because `tone="error"` returns `ErrorState`.
   - **Re-take** Communication, CMC and RBM at 1440 and 390, light and dark.
2. **Blank gap of about 250px under the Tasks header at 390.**
   - Where: `app-v2.css:157`, `flex: 1 1 420px`. The column rule `.tb .ph{flex-direction:column}` at `:1199` turns
     that basis into a height. D0-2 (`bacc0d343`) introduced the basis; the column rule predates D0.
   - Fix: `:157` becomes `flex: 1 1 0%; min-width: min(420px, 100%)`, and delete `:1199`.
   - Seen in: `../after/tasks-390-dark.png` against `../before/tasks-390-dark.png`.
3. **A table in a card scrolls the page sideways at 390.**
   - Where: `.pj-card` (`app-v2.css:293–296`) has no overflow rule since D0-2 removed `journey-v2.css:94`'s
     `overflow:hidden`.
   - Fix: after `:383`, add
     `@media (max-width:640px){ .c2c-v2 :is(.pj-card,.pj-card-b,.reg-card) > .reg-tbl{display:block;overflow-x:auto} }`
     and fold D5-0's `:3954–3955` into it.
4. **The 16px phone rule skips text areas.**
   - Where: `app-v2.css:286–288` lists only `.c2c-input`, `.de-input` and `.de-select`. The composers are 15px
     (`:415`), so iOS zooms into them and into every `.de-textarea`.
   - Fix: add `.de-textarea, .landing-input, .pj-composer textarea, .ct-composer textarea` at 16px.
5. **`.sp-primary` is a second orange primary.**
   - Where: `journey-v2.css:271–273` and `:277`. It is radius 6, 12.5px and about 37px tall, and `:272` lifts it
     1px on hover. It has 50 uses in 24 files at `bfa9c6869`. D0.md §1.5 left it out, although BUILD_ORDER.md:362
     gives its hover to D0-2.
   - Fix:
     - alias it into the primary lists at `app-v2.css:187–206`;
     - delete its chrome and the hover transform;
     - keep `flex-shrink:0; white-space:nowrap`;
     - add it to the retired-name ratchet at 50.
   - Seen in: `../after/communication-1440-light.png` ("Log communication").
6. **(c) Four §7 texts.** These are `VERDICT.md` defect 6 (checks 2, 6, 7 and 13), and they need the coordinator.
7. **The focus ring is clipped on every tab row and segmented control.** New with D0, and the most serious new item.
   - Where:
     - `app-v2.css:330`: `.seg` and `.ml-seg` have `overflow-x:auto` and 2px padding.
     - `:343–345`: `.tabs`, `.reg-tabs`, `.sc-wsbar` and `.cc-tabs` have `overflow-x:auto` and 0 padding.
     - The global ring at `:105` and `:115` is 2px with a 2px offset, so it paints outside the scrollport and is cut
       off.
   - Before D0, `d914c2618:surfaces-v2.css:149, 201` had no overflow clip and had padding.
   - A focused tab shows only two vertical slivers, and a focused segment shows a sliver on its left. This was
     reproduced by rendering the real `app-v2.css` in Chromium, not in the running app. The captures miss it because
     no probe holds focus on a tab or a segment. WCAG 2.4.7.
   - Fix: `.c2c-v2 :is(.tab,.reg-tab,.sc-ws,.cc-tab,.seg-b,.ml-seg-btn):focus-visible{outline-offset:-2px}`. This is
     the pattern `:875` already uses.
8. **The drawer footer's primary label wraps at 390.** New with D0.
   - Where: `journey-v2.css:526`, where `.de-btn` has no `white-space:nowrap`, and `:543`, where `.de-f .de-btn` has
     `flex:1 1 0`.
   - Seen in: `../after/log-communication-390-dark.png`, where "Log / communication" breaks over two lines. Check 11
     measured only widths, so it passed.
   - Fix:
     - add `white-space:nowrap` to `.de-btn`;
     - at ≤640px, `.de-f .de-btn.ghost{flex:0 0 auto}` and `.de-f .de-btn.primary{flex:1 1 auto}`.
9. **An urgent or good lead with no eyebrow shows no cue at all.** A regression from D0-4.
   - Where: `AnswerLead.tsx:57–61` draws the tone icon only inside `.al-k`, and `app-v2.css:3710–3711` colours only
     `.al-k`.
   - Before D0, `.al-lead.al-urgent` tinted the whole panel (`d914c2618:app-v2.css:3577–3578`).
   - Example: `SafetyNarrative.tsx:415–420` passes `tone="urgent"` with no eyebrow, so a 21 CFR 312.32 clock due in
     three days looks calm.
   - Fix:
     - when `tone !== 'calm'` and there is no eyebrow, draw the icon before the headline;
     - give both tones an `.sr-only` prefix ("Urgent:" or "On track:"). The tone is visual-only for screen readers
       today, and has been since before D0;
     - add a render test.
10. **Admin keeps its own button and segmented control.**
    - Where: `admin-access.css:27–37` (`.adm-access .btn`, `:hover`, `.primary`, `.ghost`) and `:86–88` (`.seg`,
      `.seg-btn`). They tie `.c2c-v2 .btn` at (0,2,0) and win on load order.
    - `radius-sm` resolves to 4px, so the 8px fallback never applies.
    - BUILD_ORDER.md:374 gives this file to D0 only. D0.md §1.5's inventory saw only `.btn.small`.
    - Fix:
      - delete everything except `.adm-access .btn.small` (§4.2.4);
      - move `.seg-btn` onto `.seg-b` or alias it there.
    - Admin is not in §7's screen list, so it needs a capture.
11. **A card title is crushed by its subtitle.**
    - Where: `app-v2.css:303`, where `.pj-card-h` is a flex row with no wrap.
    - Seen in: `../after/submission-center-1440-light.png`, y≈820, where "Device filings · eSTAR" breaks over two
      lines against a long `.s`.
    - Fix: `.pj-card-h{flex-wrap:wrap}`, so the subtitle drops below the title.
    - The 2px gap between the two cards is D7-A1's tab body.
12. **The dark active segment has no ring.**
    - Where: `app-v2.css:341`, `box-shadow:none`. The selected fill is 1.2:1 on its track
      (`probes.json` `cmc-1440-dark.p15_segActive`), and the text difference is 2.11:1.
    - D0.md §3 says the active item has "a hairline ring". The code in §4.2.8 drops it in dark.
    - Fix: `box-shadow: 0 0 0 1px var(--border-strong)` in dark. WCAG 1.4.11.
13. **Input focus may vanish in forced-colours mode.** Plausible; not seen in a browser.
    - Where: `app-v2.css:269–271` and `:290` set `outline:none`, so focus rests on a border colour and a box-shadow.
      Forced colours override the colour and drop the shadow. No `forced-colors` rule exists in `client/src`.
    - Fix: `outline: 2px solid transparent` in place of `outline: none`. It keeps one visible ring and gains one in
      forced colours. Add the same to the composers' `:focus-within`.
14. **The design-system README claims four things the code does not do.** That file is D0's.
    - `design-system/README.md:82` and `:91`, "every size is a `--fs-*` token" and "no text below 12px": 1,219
      font-size literals of 9–11.5px remain in 29 sheets. The §4.3 sweep only touched blocks that were uppercase.
    - `:104` and `:119`, "nothing moves on hover": 39 `:hover` rules in 15 sheets declare a transform.
    - `:115`, "every transition names `var(--ease)`": 116 transitions use `var(--dur)` without it.
    - `:39`, "never Title Case": 25 `text-transform: capitalize` in 12 sheets, for example `submission-v2.css:9`
      renders "Original Sequence". The sentence-case guard does not catch `capitalize`.
    - The comments at `journey-v2.css:532` and `dialogButtonHoverSettles.test.ts:11` say cards keep a lift, which
      contradicts `:104`.
    - Fix: make each claim true or word it as it is.
      - Make it true with a ratchet test per claim, filed red first, starting at the measured count and only allowed
        to fall: 1,219 / 39 / 116 / 25.
      - Extend `foundationsSentenceCase` to `capitalize`.
15. **The retired-name ratchet is narrower than D0's own migration table.**
    - `foundationsRetiredRatchet.test.ts` holds §4.6's 32 names. §4.7 also retires `sp-primary`, `rbm-tabs`,
      `rl-tab`, `qms-tabbar`, `seg-btn`, `status-pill`, `reg-kpi` and `metric-card`, among others, and nothing stops
      their use from rising.
    - Fix: add them with measured baselines.
16. **Nits in D0's files.**
    - Below the 12px floor: `journey-v2.css:539` `.de-err` (11.5px) and `app-v2.css:570` `.c2c-error-ref` (11px).
      This is the support handle. Use `var(--fs-caption)` for both.
    - `misc-surfaces-v2.css:58`, `.rd-chip.tone-flight`: off-palette, with no dark pair and no literal emitter. It
      sits inside §4.2.10's deletion range. Delete it.
    - README copy:
      - `:42`, `No ""`: a word is missing;
      - `:95`, "colour": use "color";
      - `:230` and `:234`: headings in Title Case;
      - `:253`, "No save buttons": the editor shows a "Saved" button;
      - `:259–273`: written in the first person ("I did not invent a deck").

**(c) Spec-text items for the coordinator.** These are corrections to `D0.md`, beyond defect 6.
- **§4.4, the spark.** `action.icon ?? I.sparkles` predates D0, and D0-4's diff leaves it unchanged. D0-4 added the
  claim that the spark "marks the AnA action" (`AnswerLead.tsx:37–38`, §4.4). At least nine of the 28 lead actions
  only change local state, for example "Review the inbox" (`setTab`) and "Open the sequences" (`setWs`).
  - Fix: default to no icon and pass `I.sparkles` where the action calls `ask()`, or drop the claim.
- **§4.2.4, disabled primary.** `opacity: .5` keeps the disabled button orange, so the editor's disabled "Saved"
  still counts as the view's orange fill (check 2). `.sp-primary:disabled` already has the grey treatment to reuse.
  This is not a WCAG failure, because disabled controls are exempt.
- **§4.4, the answer line.** `.al-h` is 15/600, the same as a section heading, and `.al-lead` has no top margin, so
  Submission Center's lead runs into the line above it (`submission-center-1440-light.png`, y≈241–260).
  - Fix: 500 weight and `margin: 24px 0`.
- **§3, composer border.** The composer's resting `1px --border` is 1.41:1, while the input rule uses
  `--border-control` (3.91:1).
- **§3, touch targets.** Tab 36, segment 28, send and close 32: all pass WCAG 2.5.8 AA (24px), but not the repo's
  44px rule. This needs a decision.
- **§7 check 7, ⌘K.** It allows "none" for ⌘K, and the probe read the field unfocused
  (`supplementary…cmdkFocused.focused: false`), so the ⌘K half was never measured.
- **§4.7, page frame.** It leaves out the page-frame overrides. `.pj` padding 26/30 (`journey-v2.css:9`), `.cc`
  (`commcenter-v2.css:4`) and `.rbm-page` (`rbm-v2.css:14`) give sibling work areas different left edges: 294
  against 332 at 1440.
- **§6, gates.** It lists `ci:check-phantom-tokens`, which is red from pre-D0 code (above).

## Owed by named later lanes (b)

| Finding | Where | Lane (BUILD_ORDER line) |
|---|---|---|
| The page frame: `.pj` padding, `.cc`, `.rbm-page` not on `.page-inner` | `journey-v2.css:9`; `CommunicationCenter.tsx:485`; `Rbm.tsx:284` | D3-1 (:169), D6-2 (:292), D7-C (:325) |
| `:hover` transforms, 39 across the sheets (`counts-bfa9c6869.txt`) | every sheet's owner; the guard is D0 fix 14 | the owner of each range, otherwise F1 |
| The task tray slides in at 220ms with `cubic-bezier(.4,0,.2,1)` and a 20px offset | `app-v2.css:1023–1024` | D1-4 (:95) |
| New task dialog: `tbPop .16s ease` | `app-v2.css:1231–1232` | D6-1 (:291) |
| `.cl-bd` and `.cl-modal`: `ease` at .14s and .18s | `app-v2.css:2243–2246` (`CollabLauncher.tsx`) | a D6 addendum or F1 (:855–858) |
| ⌘K's arrow-key row `.cmdk-item.on` is 1.06:1 (predates D0, `75bc5f6b4`) | `app-v2.css:2496` | D1-3 (:94) |
| AnA prose links `.ana-md a` are `--accent-100`, 2.96:1 on `#faf9f5` | `authoring-v2.css:1336` | D1-5 (:367) |
| New project's `.npw-field .c2c-input` (13px, (0,3,0)) beats the phone rule | `project-home-v2.css:198` | D2-2 (:143) |
| Vault's `.vd-filter .c2c-input` is 12px | `coverage-v2.css:883` | D6-3 (:293) |
| Read failures shown as idle `EmptyState` with no `tone="error"` | `DocumentWorkbench.tsx:5669`; `CmcModule.tsx:442`, whose hint is the raw `read.error` | D4 (:222); D5-2 (:257) |
| Tasks lead: no "?", and "critical path is clear" over a partly read board | `TaskBoard.tsx:1182, 1188` | D6-1 (:291) |
| Communication lead: | `CommunicationCenter.tsx:500–566, 572, 947–961` | D6-2 (:292) |
| • on a failed read it keeps its reassurance and its action | | |
| • the tab says "Agency inbox · 0" | | |
| • on an empty register it says "No open … need a response" | | |
| • its eyebrow repeats the title | | |
| • "Information Request" is in Title Case | | |
| Submission Center lead: | `SubmissionCenter.tsx:1249–1278`; the note above the tabs | D7-A1 (:320) |
| • it names the project three times | | |
| • it nests parentheses around `productName` | | |
| • it ends on a capability pitch | | |
| • a tinted note sits above the tabs, and two cards sit 2px apart | | |
| Submission Center: an inline toggle uses `.pj-card-h-go` | `SubmissionCenter.tsx:367` | D7-A1 (:320) |
| Quality says "All current" with no documents in effect | `SopRegister.tsx:366–375` | D7-B (:324) |
| `.rbm-modal-scrim` keeps `blur(4px)`; the other blur scrims are in the table below | `rbm-v2.css:408` | D7-C (:325) |
| CMC: `.seg` over `.tabs`, which is tabs within tabs | `cmc-1440-light.png` | D5 |
| `emphasis="verdict"` has no caller yet, so filing verdicts use the calm 15px lead | `AnswerLead.tsx:32`; `app-v2.css:3715` | D7-A2, by design until then |
| Static context lines ("Workspace", "Project — collaboration", "Submission", "Submission · agency communications", "Clinical — risk-based quality management") | per D0.md §4.7 | D2-1, D6-1, D7-A1, D6-2, D7-C |

## Pre-existing, outside D0

| Finding | Where | Owner |
|---|---|---|
| `ci:check-phantom-tokens` is red. Fix: use `var(--error)` and rewrite the baseline in `scripts/ci`, which is outside D0's paths. | `project-home-v2.css:496` (`bd144ed16`) | the coordinator; the one-line CSS fix is in a D0 path |
| **High severity.** Pharmacovigilance reassurance the screen cannot back: "You're keeping watch across FAERS and EudraVigilance", although signals come from the organization's adverse-event store (`:1174`, `:1207`), and "I'll flag the moment anything crosses the line" | `BiopharmaSpecialty.tsx:1175, 1206, 1209, 1211` | F1 (unowned) |
| An overdue case reads "is due in -N days … You have time" | `SafetyNarrative.tsx:257–264` | F1 |
| `good` tone over unverified or empty results | `SourceTracer.tsx:267`; `CrlLibrary.tsx:453` | F1 |
| Other leads' copy: no "?", "perfect filing", promises, developer language | `Inconsistency`, `NdaCockpit`, `ReportEngine`, `DeepResearch`, `Etmf`, `RiskRegister`, `Labeling`, `HumanFactors`, `DesignControlsTrace`, `BiopharmaSpecialty` | F1 |
| `C2CForm` copy: the validation sentence, the "may" in the governed note, the error below the fold, two "Cancel" buttons on an empty form | `C2CForm.tsx:190–194, 346–364` (unchanged since before D0) | D0's ledger path; D0 or F1 |
| `UnresolvedLead` copy and its calm tone | `AnswerLead.tsx:126–139` (D0.md §4.4: "unchanged") | D0's ledger path; D0 or F1 |
| Icon stroke 1.75 | `components/ana/AnswerCheckRows.tsx:71` | D1-5 or F1 |
| A second toast, `.pg-toast` | `research-v2.css:93–97`, `ProtocolGov.tsx:188–216` | the protocol lane or F1 |
| Blur scrims | `ana-v2.css:166`; `authoring-v2.css:1218`; `pyramid-v2.css:113`; `research-v2.css:72`; `translation-v2.css:159`, `:182` | each sheet's owner or F1 |
| Stale shadowing-baseline entry `.reg-eyebrow` | `scripts/ci/css-selector-shadowing-baseline.json` | the coordinator (outside D0's paths) |

## Refuted or reclassified

| Raised | Why it does not stand as raised |
|---|---|
| ⌘K has no focus indicator, raised as a D0 blocker (accessibility B2) | §7 check 7 allows "none" for ⌘K. The weak active row predates D0 (`75bc5f6b4`) and belongs to D1-3. What remains is an evidence gap, listed in the (c) items. |
| The focus ring changes a button's corner radius (accessibility N1) | Pre-existing: `d914c2618:app-v2.css:93, 103` are the same rules |
| A plain `.btn` has no border (accessibility N2) | It is ghost by default by design (§3). The lens itself said it is not a failure. |
| Touch targets under 44px, raised as a WCAG failure (accessibility S2) | WCAG 2.5.8 AA is 24px, and every one passes. Moved to (c), because the repo's 44px rule is a spec decision. |
| Plain links fail 1.4.1 (accessibility S6) | The underline is a cue that is not colour, so 1.4.1 is met. The underline's 1.48:1 is noted, but it is not a failure. |
| The disabled primary fails contrast (visual 3) | Disabled controls are exempt from 1.4.3, and §4.2.4 sets `opacity: .5`. Moved to (c). |
| The header grew taller (visual 6) | `.ph-sub` at 68ch is §3 and §4.2.2. The length comes from the owners' copy. Moved to (c) and the owners. |
| The answer line has a section heading's weight; the lead has no top margin (visual 7) | These are §4.4's values. Moved to (c). |
| The shield on `reassure` and the spark on every action (copy :66, :74; truthfulness F3) | Both predate D0-4, whose diff leaves them unchanged. D0 added only the spark's meaning. Moved to (c). |
| The specimens are copies of the app's rules (design-system S10) | That is §4.5's method. A drift test would be a nit. |
| Literal radii and shadows in D0's blocks (design-system N3) | §3 sets those literals: composer 20, track 10, the composer's shadow. A nit. |
| The tray drawer is off spec (motion 3) | §4.2.14 keeps `.tt-panel`'s chrome. Moved to D1-4. |
| `.sp-primary` has 53 uses in 24 files (design-system), against `VERDICT.md`'s 60 in 29 | Re-measured: 59 in 28 at `f2385372`, 50 in 24 at `bfa9c6869`. `VERDICT.md` corrected. |
| 23 files put a table in a card (`VERDICT.md`) | 23 files contain both classes; 13 by nearest enclosing card. `VERDICT.md` corrected. |
| "Couldn't load this section's sources" (truthfulness F5, third site) | The string is not in `DocumentWorkbench.tsx` at `bfa9c6869`. The other two sites stand. |
| Motion 9: there is no exit animation; the new-row flash lasts 1.4s in green; the token name `--ease-spring` | `toast.tsx:138`; `journey-v2.css:564`; `colors_and_type.css:284` | Advice only. It is within the reduced-motion rules, so it is not a defect. |
| Reports not re-run here: `ci:surface-text-ramp` red at `2e4a9fe67` (Vault) and `ci:undefined-css-classes` on an uncommitted `AuthoringCollab.tsx` | Neither is D0's, and neither was re-checked in this review. |

## Evidence still owed

- **Re-take at HEAD.** `../after/` is `f2385372`, 64 commits past before, and it mixes D0 with D5-0 and D5-1. Re-take:
  - Communication, CMC and RBM: the empty state (`1d789b516`);
  - Projects: D2-1 (`78842ee08`);
  - CMC at 390: D5-2 (`ff6825ef6`);
  - Tasks at 390 and "Log communication" at 390, once fixes 2 and 8 land;
  - Admin, for fix 10.
- **Probes the after run lacks:**
  - keyboard focus held on a tab, a segment and the ⌘K field (it recorded `focused:false`);
  - a hover on `.sp-primary` and on a clickable card, asserting `transform: none`;
  - a forced urgent lead, a good lead and an `UnresolvedLead` in its unreadable state, recording the `.al-k` icon,
    its colour and `data-emphasis`;
  - one failed read (`failingApiResponses` is empty in all four runs);
  - the tray, New task and Collaborate dialogs opened, with `animationDuration` and `animationTimingFunction`;
  - a `.de-toast`.
- **Fixes to existing probes:**
  - check 1 should also count `capitalize`;
  - check 11 should check that a footer label stays on one line;
  - check 13 needs the element-edge probe (`VERDICT.md` defect 6).

## Does it read as Claude's?

See `../after/VERDICT.md`, "Does it read as Claude's calm UI". The six lenses agree with it. The frame now reads as
Claude's on every screen, and the project page, Communication and CMC come closest.

What still breaks the calm belongs to the lanes:
- the shell (D1);
- the editor's 21-button bar (D4-2);
- the conversation's controls under the composer (D1-5);
- the Tasks kanban (D6-1);
- the Projects toolbar at 390 (D2-1);
- Submission Center's lead (D7-A1).

Of D0's own, fixes 2, 5, 7 and 8 are the ones a person would notice first.
