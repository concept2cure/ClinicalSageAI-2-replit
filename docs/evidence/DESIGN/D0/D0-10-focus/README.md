# D0-10: focus (review fixes 7, 12 and 13)

**Package:** D0, Foundations (`Plan: D0`). **Step:** D0 review fixes 7, 12 and 13
(`docs/evidence/DESIGN/D0/review/README.md`, "D0 fixes owed").
**Read at:** `d40675ff3` on `concept2cure-v2`, 2026-11-02.

HEAD moved to `c4fcb90a7`, then to `d38c88745`, during the work. No commit in that range touched the styles folder:
`git diff --stat d40675ff3 d38c88745 -- client/src/concept2cure/v2/styles` is empty. Between `0d2bd8112` and
`d40675ff3`, only `coverage-v2.css` changed. So `app-v2.css` is the same file at every HEAD named here, and
`git diff` on it shows this step's four hunks and nothing else.

The review cited lines at `bfa9c6869`. They have moved, so each rule was found again by its selector. In "What
already exists", lines are at `d40675ff3`.

**Files changed:**
- `client/src/concept2cure/v2/styles/app-v2.css`: four rules, all in D0's primitive block. Fix 7 adds one rule after
  the tabs; fix 12 changes one declaration; fix 13 changes one declaration and adds one.
- `client/src/concept2cure/v2/__tests__/d0Focus.test.ts`: the new test.
- `design-system/preview/components-inputs.html`: its header says its rules are "Copied from … app-v2.css", and its
  specimen `.is-focus` rules say they are "the focus rules above, unchanged". So the fields' focus rule, the
  composers' `:focus-within` and the two specimens take the same `outline: 2px solid transparent` (added at the
  review pass). A transparent outline paints nothing, so the preview looks the same. No gate reads this file.
- This folder.

No TSX is edited and no file other than the test is created. The builder left the change uncommitted; it was
committed after a second, skeptical pass re-ran the red run, the green run, the readers and the gates.

## What already exists (RULE 3)

Searches run, at `d40675ff3`:
- `grep -n 'outline' app-v2.css` (every outline rule in the sheet, 80 lines);
- `grep -rnE "(\.tab|\.reg-tab|\.sc-ws|\.cc-tab|\.seg-b|\.ml-seg-btn)[^-a-z][^{]*focus" client/src --include=*.css`
  (any focus rule already on the six items: none);
- `grep -rn "forced-colors" client/src` (none, as the review said);
- `grep -rn "outline-offset:-2px\|outline-offset: -2px" client/src/concept2cure/v2/styles` (the inset ring's existing
  uses);
- `grep -rnE ":focus(-visible|-within)?[^{]*\{[^}]*outline\s*:\s*(none|0)" v2/styles/*.css` (every focus rule that
  removes the outline: 17);
- the className uses of each of the six items in TSX outside `__tests__`, and the element each one is on;
- `git log -S` on the segmented track, the dark active segment, the inputs' focus rule, the composers' text-field rule
  and the composers' `:focus-within` (all five: `bacc0d343`, D0-2);
- every test that names `app-v2` or `_cssRules`, or reads every v2 stylesheet (43 files, `green/readers-list.txt`), and
  `grep -rn "outlineStyle\|outline-style\|outline-offset" client/src tests e2e scripts` (one probe, see below).

### What each piece does today

**The rings that exist.**
- The global ring: `app-v2.css:105`, `.c2c-v2 button:focus-visible { outline: 2px solid var(--accent-200);
  outline-offset: 2px; border-radius: var(--radius-md); }`, specificity (0,2,1). Fields have the same values at
  `:113–115`. `index.css:639` has an older `button:focus-visible` at (0,1,1), which both outrank.
- The inset ring already in use, in its offset-only form, which is what fix 7 adds: `app-v2.css:1707`
  (`.crumb-proj:focus-visible{outline-offset:-2px}`), `project-home-v2.css:57` (`.pj-index .ct-row`) and `:123`
  (`.npw-step-btn`). The full form (`outline` and `-2px`): `app-v2.css:743` (`.rci-top`), `:887` (`.pj-lc-stage`,
  the one the review names), `:2120` (`.ana-sheet-close`), `misc-surfaces-v2.css:345`, `protocol-dev-editing.css:137`.

**Fix 7, the clipped ring.**
- The segmented track is `app-v2.css:333`: `.c2c-v2 :is(.seg, .ml-seg)` with `padding: 2px; overflow-x: auto`.
  Its items are `:334–338`, `.c2c-v2 :is(.seg-b, .ml-seg-btn)`, 28px high with a 2px gap.
- The tab row is `:346–349`: `.c2c-v2 :is(.tabs, .reg-tabs, .sc-wsbar, .cc-tabs)` with `padding: 0;
  overflow-x: auto`. Its items are `:350–355`, `.c2c-v2 :is(.tab, .reg-tab, .sc-ws, .cc-tab)`, 36px with
  `margin-bottom: -1px`.
- `overflow-x: auto` makes `overflow-y` compute to `auto` too, so both rows clip to their padding box. The global
  ring is drawn 2px to 4px outside each item, so it falls in the clipped band: on a tab, the top and bottom edges are
  cut off and the two sides show; on a segment, it is cut by the track edge and by its neighbours. The review
  reproduced this in Chromium with the real sheet; this step did not open a browser (the step forbids it).
- The six items are all live, so all six are in the rule. Uses in TSX outside `__tests__`:
  - `.tab`: 3 files (`Vault.tsx:3118`, `CmcModule.tsx:685`, `Insights.tsx:2361`);
  - `.reg-tab`: 11 files, 13 uses (`AuthoringEngine`, `DeepResearch`, `FilingStrategy`, `MarketAccess`,
    `NdaCockpit`, `PrecedentEngine`, `Pyramid`, `Rbm`, `Registrations`, `TemplateLibrary`, `UsageBilling`);
  - `.sc-ws`: 1 (`SubmissionCenter.tsx:1341`). Not retired;
  - `.cc-tab`: 1 (`CommunicationCenter.tsx:579`). Not retired;
  - `.seg-b`: 8 files, 12 uses; `.ml-seg-btn`: 4 files, 5 uses.
  
  Every one is a `<button>`, so the global ring is the ring they show. `.cm-subtab`, which the review's list does
  not name, is retired: 0 uses, and the tab rule no longer lists it.
- No stylesheet has a focus rule of its own for any of the six.

**Fix 12, the dark active segment.**
- Light, `:340–342`: the active item is `--bg-000` with `box-shadow: 0 1px 2px rgb(20 20 19 / .06), 0 0 0 1px
  var(--border)`, the hairline ring D0.md §3 asks for.
- Dark, `:343`: `.c2c-v2.dark :is(.seg-b, .ml-seg-btn):is(.on, …)` sets `background: var(--bg-200); box-shadow:
  none`. So in dark the active item has no ring, and its fill is 1.21:1 on its `--bg-100` track.
- `surface-text-ramp.css:820` restates the dark selector to set the `--text-*` ramp only (generated); it sets no
  shadow. Fix 12 does not change a fill, so the ramp has nothing to regenerate (checked below).
- No test pins `box-shadow: none` on the segment.

**Fix 13, forced colours.**
- The inputs' focus rule, `:271–274`: `.c2c-v2 :is(.c2c-input, .de-input, .de-select, .de-textarea):is(:focus,
  :focus-visible) { outline: none; border-color: var(--border-focus); box-shadow: 0 0 0 3px var(--accent-000); }`.
  Forced colours replace the border colour with a system colour (the same one at rest and in focus) and drop the
  shadow, so nothing marks the focused field.
- The composers' text fields, `:292–293`: `.c2c-v2 :is(.landing-input, .pj-composer textarea, .ct-composer textarea,
  .cmdk-in input):focus-visible { outline: none; }`, "Text fields that draw focus on their container".
- The composers' `:focus-within`, `:424`: `border-color: var(--border-focus)` only. In forced colours the composer
  shows no focus at all.
- `cmdkPlaces.test.tsx:350–353` (D1-3's) pins the `:292–293` rule with `outline: none`, as "the field is a large
  quiet line with no ring of its own".
- `tests/e2e/launch-surface-keyboard.e2e.spec.ts:106` compares a stop's computed outline, shadow and border at rest
  and in focus. The inputs already change border and shadow, so a transparent outline does not change what it finds.
- Other focus rules that remove the outline, not named by the review and not changed here: `app-v2.css:1227`
  (`.tb-field`), `:2269` (`.cl-field`), `:3369` (`.gov-textarea`), `coverage-v2.css:428, 762, 834`,
  `misc-surfaces-v2.css:57`, `onboarding-review.css:38`, `surfaces-v2.css:324`, `insights-v2.css:198` (Reporting's
  file), `project-home-v2.css:28, 284` (D2-2's file), `rich-section-editor.css:132`. Each has the same forced-colours
  gap.

## The change

Lines are in the working tree after the change.

- **Fix 7** (`app-v2.css:365–367`, after the tab rules): `.c2c-v2 :is(.tab, .reg-tab, .sc-ws, .cc-tab, .seg-b,
  .ml-seg-btn):focus-visible { outline-offset: -2px; }`. This is the review's rule, unchanged. It sets the offset
  only, so the ring keeps the global colour and width. At (0,3,0) it outranks the global ring's (0,2,1) wherever it
  sits in the sheet.
- **Fix 12** (`:345–347`): in dark, the active segment's `box-shadow: none` becomes
  `0 0 0 1px var(--border-strong)`, the review's value. The fill stays `--bg-200`.
- **Fix 13**:
  - The inputs' rule (`:271–276`): `outline: none` becomes `outline: 2px solid transparent`. The border colour and
    the 3px halo stay, so normal colours still show one ring. In forced colours, the transparent outline is
    repainted as a visible ring.
  - The composers' `:focus-within` (`:430–433`) gains `outline: 2px solid transparent`. Its visible change in
    normal colours is still the border colour only.
  - **Not changed: the composers' text-field rule** (`:295`, the review's `:290`). The review's literal fix would
    give it a transparent outline as well, and that would draw **two** rings on every composer in forced colours:
    one round the text area and one round the composer. The composer's container is the field the person sees,
    and the rule's own comment says these fields "draw focus on their container". So the container takes the ring
    and the text area keeps `outline: none`, which gives one ring. The test pins this, and mutant m10 (the literal
    change) turns it red.

### ⌘K's field, left as it is (open)

`.cmdk-in input` is the fourth field in that same rule. Unlike the composers, nothing round it draws focus, so in
forced colours ⌘K's field shows only its caret. Two things make a ring there someone else's change:
- D1-3 designed this field "with no ring of its own";
- `cmdkPlaces.test.tsx:350–353` pins the rule with `outline: none`.

Giving it the transparent outline would be a one-line change to `:295`. That change, and the test that pins it, are
for the D1-3 owner or the coordinator.

### Fix 12 is a ring, but not yet SC 1.4.11's 3:1 (open)

Measured from the token hex values (`green/segment_ring_contrast.py`, `green/segment-ring-contrast.txt`):

| Pair | Dark | Light |
|---|---|---|
| Active fill on the track | 1.21:1 (`--bg-200` on `--bg-100`) | 1.10:1 (`--bg-000` on `--bg-100`) |
| The ring on the track | 1.49:1 (`--border-strong`, this change) | 1.22:1 (`--border`, unchanged) |
| `--border-control` on the track | 3.80:1 (3.13:1 on the `--bg-200` fill) | 3.55:1 |

- **What the change does.** Dark now has the hairline ring that D0.md §3 asks for, the same as light.
- **What it does not do.** The review cites WCAG 1.4.11. Neither theme's ring reaches 3:1, before this change or
  after it.
- **The token that would.** `--border-control` reaches 3:1 in both themes. `ci:token-contrast` already asserts it
  on `--bg-100` and `--bg-200` in both themes.
- **Why this step did not use it.** Changing the ring to `--border-control` would make the active segment a
  visible control edge in both themes. That is a design decision against §3's "hairline", so it is for the
  coordinator. This step used the review's value as instructed.

### Things §7 measures that this change moves (for the coordinator; D0.md is a plan file)

- **Check 7** reads "computed `outline-style: none`" on a focused `.c2c-input`. After fix 13 the computed value is
  `solid`, with `outline-color` transparent. The field still shows one ring, so the check's wording needs to be
  "no visible outline: `outline-style` none, or `outline-color` transparent".
- **Check 12** reads "Focusing changes only the border colour" on a composer. A diff of computed styles will now
  also see the outline change from `none` to `2px solid transparent`. That outline paints nothing, so the check
  needs the same reading.
- `tests/e2e/launch-surface-keyboard.e2e.spec.ts:106` is not affected. The focused inputs already change their
  border and shadow, and the composers' text areas keep `outline: none`.

### Read from the CSS, not seen in a browser

A tab (`.tab`, `.reg-tab`, `.sc-ws`, `.cc-tab`) has `margin-bottom: -1px`, so its last pixel hangs below the
scrolling row's padding box, and the row clips it.
- Effect on the inset ring: its bottom edge shows 1px, not 2px. The top and the sides show 2px. It is still a
  closed ring.
- The same clip cuts the active tab's underline to 1px, over the row's hairline. That clip predates this change
  (D0-2, `bacc0d343`).

Neither effect was seen in a browser, because this step ran no browser and no dev server. A running-app capture of
a focused tab, a focused segment and a dark active segment, at 1440 and 390, is still owed. That is the same gap as
the review's "(c)" item: no probe holds focus on a tab or a segment.

## Tests and gates

All runs used `--maxWorkers=1`.

**`d0Focus.test.ts`** has 23 tests.
- **Red:** `red/d0Focus.txt`, 13 failed and 10 passed. The run read a scratch copy of the styles folder in which
  every sheet is byte-equal to HEAD `c4fcb90a7`, through `D0_FOCUS_STYLES`. The 13 failures are the six items with no
  inset rule, the one inset rule missing, dark `box-shadow: none`, four fields with `outline: none`, and the composer
  with no outline.
- **The 10 that passed at HEAD:** each guards a case that does not occur at HEAD. Each was turned red by a mutant
  (`red/mutants.py`, summary in `red/mutants-summary.txt`, one output file per mutant). Each mutant edits a scratch
  copy of the styles folder, so no tracked file was written.

| Mutant | What it does | What goes red |
|---|---|---|
| m1 | removes an item from the tab primitive | "reads the items" |
| m2 | adds an item to the tab primitive but not to the inset rule | `.cm-subtab:focus-visible` |
| m3 | adds `outline: none` to the inset rule | "moves the global ring inward and keeps it" |
| m4 | changes the inset rule's `:is` to `:where` | same test: the rule is now outranked |
| m5 | adds an owner rule that sets the offset back | "no other rule … outline on these items" |
| m6 | removes light's ring | "light: … hairline ring" |
| m7 | removes `[aria-pressed]` from the dark rule only | "dark covers every item and active state" |
| m8 | adds an owner rule `.seg-b.on{box-shadow:none}` in dark | "no other rule … shadow on an active segment" |
| m9 | adds an owner rule `.c2c-input:focus{outline:none}` | "no other rule … fields' outline" |
| m10 | makes the review's literal change to the composers' text-field rule | the three "one ring, not two" tests |
| m11 | adds an owner rule that sets a composer's outline | "no other rule … composer's outline" |

**Green:** `green/d0Focus.txt`, 23 of 23.

**The three D0 guards:** `green/d0-guards.txt`, 3 files and 53 tests, all passed.

**Every test that reads `app-v2.css` or every v2 stylesheet** (43 files, `green/readers-list.txt`):
- Before this change: `green/readers-at-head-without-this-change.txt`, run at `d40675ff3` with `app-v2.css`
  unmodified. 2 files failed with 6 tests.
- After this change: `green/readers-and-guards.txt`, run with `d0Focus` added (44 files). The same 2 files failed
  with the same 6 tests:
  - `runPolicySwitch.test.tsx`, 5 tests. It throws in `authoringCurrentRead.ts` and reads no CSS.
  - `projectHomeStageCss.test.tsx`, 1 test, `.pj-sec-acts`. That failure is VERDICT check 16's, owned by D5.
- Neither failure comes from this change. `cmdkPlaces.test.tsx`, which pins the text-field rule, passes.

**CI gates.** Each gate's output is in `green/`.

| Gate | Result |
|---|---|
| `ci:undefined-css-classes` | OK, 2 reviewed exceptions |
| `ci:token-contrast` | 131 pairs pass, 15 documented exceptions held |
| `ci:check-css-selector-shadowing` | OK, 0 new |
| `ci:token-cascade` | PASS |
| `ci:surface-text-ramp` | FAIL, stale. Also fails at HEAD without this change |
| `ci:check-phantom-tokens` | FAIL, new phantom `--danger-000`. Also fails at HEAD without this change |

The two failures are explained by their HEAD runs:
- **`ci:surface-text-ramp`.** `green/ci-ramp-and-phantom-at-head-without-this-change.txt` holds both checks, run in
  a scratch `git archive` export of HEAD `c4fcb90a7`. In that same export, the generator gives byte-identical output
  with HEAD's `app-v2.css` and with this change's (`green/surface-text-ramp-unmoved-by-this-change.txt`). Fix 12 does
  not touch a fill. The staleness is HEAD's, so the ramp was not regenerated: it is a shared generated file that this
  step does not change.
- **`ci:check-phantom-tokens`.** The new phantom is at `project-home-v2.css:447`, which is D2-2's file.

**ESLint:** `green/eslint.txt` shows 0 problems on `d0Focus.test.ts`. It is a new file, so there is no HEAD version
to compare.

## Not changed here, the same forced-colours gap

Thirteen other focus rules set `outline: none` and draw focus as a border colour and a halo. They are listed under
"What already exists". The review did not name them, and three of them are in other lanes' files:
- `insights-v2.css`, Reporting's file, in one rule;
- `project-home-v2.css`, D2-2's file, in two rules.

The other four of the 17 rules in that search that remove an outline are not fields:
- `.page:focus`, a skip-link target with no ring by design;
- `.ana-sheet:focus`, a sheet region;
- `.ana-activity-stopped:focus`, which has its own `:focus-visible` ring;
- the composers' text-field rule (above).

Each of the thirteen needs the same change, `outline: 2px solid transparent` in place of `outline: none`. The lane
that owns its file makes it.
