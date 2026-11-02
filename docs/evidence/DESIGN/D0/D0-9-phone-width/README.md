# D0-9: phone width (review fixes 2, 3, 4 and 8)

**Package:** D0, Foundations (`Plan: D0`). **Step:** D0 review fixes 2, 3, 4 and 8
(`docs/evidence/DESIGN/D0/review/README.md`, "D0 fixes owed"; `../after/VERDICT.md` defects 2, 3 and 4, and check 11).
**Read at:** `200cdeec9` on `concept2cure-v2`, 2026-11-02. HEAD moved to `2ffff0d94` during the work; the commits
between touched only `Vault.tsx` (`git diff --stat 200cdeec9 2ffff0d94 -- client/src/concept2cure/v2/styles` is empty).
Line numbers below are at `200cdeec9`. The review cited lines at `bfa9c6869`; they have moved, so each rule was found
again by its selector.

**Files changed:**
- `client/src/concept2cure/v2/styles/app-v2.css`: the page header's first child (fix 2), the Tasks column rule
  deleted (fix 2), the table-in-card scroll rule with D5-0's copy folded in (fix 3), the phone text-area rule (fix 4).
- `client/src/concept2cure/v2/styles/journey-v2.css`: the drawer block only (`.de-btn` and the ≤640px footer rules,
  fix 8). The CMC block (`:340–430`) is not touched.
- `client/src/concept2cure/v2/__tests__/d0PhoneWidth.test.ts`: the new test.
- This folder.

No TSX is edited and no file other than the test is created.

## What already exists (RULE 3)

Searches run, at `200cdeec9`:
- `grep -n "flex: 1 1 420px\|\.tb \.ph\|\.reg-tbl\|pointer: coarse" app-v2.css` (the four rules the review names);
- `grep -rnE "(\.ph|\.sp-head|\.reg-head|\.surface-head|\.pj-head|\.page-header|\.cm-head)\b[^{]*\{[^}]*flex-direction:\s*column"
  client/src/concept2cure --include=*.css` (any other header turned into a column: only `.tb .ph`; the other hits
  are different classes such as `.ph-col`, `.ph-side`, `.mdx-shell .ph-root`);
- `grep -rn "reg-tbl" client/src/concept2cure --include=*.css | grep -E "display|overflow"` (every table scroll rule:
  one, D5-0's);
- `grep -rn "landing-input\|pj-composer textarea\|ct-composer textarea\|de-textarea" client/src/concept2cure
  --include=*.css` (every rule that could set the text areas' size);
- `grep -rn "de-btn" client/src --include=*.tsx` (91 uses outside tests) and every `className="de-f"` footer with
  its buttons (23 footers);
- `git log -S` on `flex: 1 1 420px` (`bacc0d343`, D0-2), `.tb .ph{flex-direction:column` (`d4c745c5f`, "Complete
  catalog and task-board read recovery", before D0), `pj-sec > .pj-card-b > .reg-tbl` (`943b78cb7`, D5-0),
  `overflow:hidden` in `journey-v2.css` (`bacc0d343` removed `.pj-card`'s), `flex: 1 1 0; min-height: 44px`
  (`bacc0d343`) and the coarse 16px rule (`bacc0d343`);
- every test that reads `app-v2.css`, `journey-v2.css` or `_cssRules` (`grep -rln "app-v2\|journey-v2\|_cssRules"
  client/src tests --include=*.test.*`), and the tests that read every stylesheet in the folder
  (`dialogButtonHoverSettles`, `foundationsSentenceCase`, `foundationsOneDefinition`, `reviewRoutePhoneWidth` and
  others).

### What each piece does today

**Fix 2, the Tasks header.**
- The canonical page header is `app-v2.css:153–176` (D0-2). Its first child, at `:157`, is
  `.c2c-v2 :is(.ph, .sp-head, .reg-head, .surface-head, .pj-head, .adm-access .page-header) > :first-child
  { flex: 1 1 420px; min-width: 0; }`. In a row, 420px is a width: the text block wraps the actions under it when the
  row is too narrow. That is what the rule is for.
- `app-v2.css:1196–1201` is a `@media (max-width:760px)` block, "Keep the existing task header and recovery messages
  readable on a phone". Its first line, `:1198`, is `.c2c-v2 .tb .ph{flex-direction:column;align-items:stretch;gap:12px;}`.
  It predates D0 (`d4c745c5f`), when the header did not wrap.
- Together they turn the 420px basis into a 420px **height** on Tasks at ≤760px. The text block is about 170px tall,
  so about 250px of blank space opens under it (`../after/tasks-390-dark.png`, against
  `../before/tasks-390-dark.png`). Tasks is the only surface with such a column rule.
- The Tasks header is `surfaces/TaskBoard.tsx:1112–1128`: a text block, then either an inline-styled
  `display:flex` div with "Start workflow" and "New task", or a `.ph-sub` "View only" note. At ≤640px the canonical
  header already gives every child after the first `flex: 1 1 100%` (`app-v2.css:175`), so the actions take their
  own row without the column rule.
- No test pins `1 1 420px` or `.tb .ph`.

**Fix 3, a table in a card.**
- `.c2c-v2 :is(.pj-card, .reg-card)` (`app-v2.css:293–296`) has no overflow rule. D0-2 removed
  `journey-v2.css:94`'s `.pj-card{overflow:hidden}`, which used to clip a wide table (cutting it off rather than
  letting it scroll). `.c2c-v2 .reg-card:not(.reg-pad)` (`:297`) still clips: its tables are cut off at 390, not
  scrolled. `.pj-card-b` (`:309`) has `padding: 0` only.
- `.c2c-v2 .reg-tbl` (`:379–383`) is `width: 100%` with no `display` or `overflow`.
- The one table scroll rule is D5-0's, `app-v2.css:3943–3949`, a `@media (max-width: 640px)` block whose first rule
  is `.c2c-v2 [data-work-area] .pj-sec > .reg-tbl, .c2c-v2 [data-work-area] .pj-sec > .pj-card-b > .reg-tbl
  {display:block;overflow-x:auto;}` (`:3944–3945`). It reaches only a work area's sections. The block's other four
  rules (`.pj-sec-h`, `.pj-sec-acts`, the starters row) stay.
- **Reach, re-measured at `2ffff0d94`:** 37 `<table className="reg-tbl">` in 17 surface files have a card as their
  **direct parent** (`pj-card-b` 31, `reg-card` 6). The script and its output are in this folder
  (`tables_in_cards.py`, `tables-in-cards-2ffff0d94.txt`). It reads each TSX file's JSX tags with a stack and reports
  the table's immediate parent element. The review's 13 files at `bfa9c6869` counted the nearest enclosing `<div>`
  within 15 lines; this count is the direct parent, which is what a `>` rule reaches, and it includes `reg-card`.
- No test reads either rule's `overflow-x`.

**Fix 4, the 16px phone rule.**
- The coarse-pointer block is `app-v2.css:286–288`:
  `.c2c-v2 :is(.c2c-input, .de-input, .de-select) { min-height: 44px; font-size: 16px; }`. It skips `.de-textarea`,
  which takes `font-size: var(--fs-body)` (14px) from `:258`.
- The composers' text is `app-v2.css:415`:
  `.c2c-v2 :is(.landing-input, .pj-composer textarea, .ct-composer textarea) { font-size: 15px; … }`. The three
  composers are Home (`Surfaces.tsx:192`, `.landing-input`), the project (`ProjectHome.tsx:1205`) and the
  conversation (`ConversationThread.tsx:2146`). Under 16px, iOS zooms the page when the field takes focus.
- **The cascade the fix has to win.** `:415`'s selector is (0,2,1): `:is()` takes its most specific argument,
  `.pj-composer textarea`. A rule listing the same four targets in one `:is()` is also (0,2,1). So **placed in the
  coarse block at `:286`, as the review and `VERDICT.md` word it, it would lose to `:415` for the three composers**:
  equal specificity, and `:415` comes later. It would fix `.de-textarea` only. The rule has to sit after `:415`.
- The other rules on these elements set no size: `.c2c-v2 .pj-composer textarea` (`:1288`) and
  `.c2c-v2 .ct-composer textarea` (`:2914`) set `font-family` only; `surfaces-v2.css:18` `.c2c-v2 .landing-input` sets
  `font-family: inherit`. No sheet uses the `font` shorthand on the composers' fields. `.de-textarea`'s `font: inherit` is in `:258`'s
  (0,2,0) input rule, which any (0,2,1) rule outranks.
- `.de-textarea` has 96 fields across C2CForm callers (`VERDICT.md` defect 4). Its `min-height: 80px` (`:265`) must
  survive, so it cannot simply join `:286`'s list, which sets `min-height: 44px` at the same (0,2,0) and later.

**Fix 8, the drawer footer.**
- `journey-v2.css:531` `.c2c-v2 .de-f` is the footer row, `justify-content: flex-end`, no wrap.
  `:532` `.c2c-v2 .de-btn` has no `white-space`. At ≤640px (`:546–550`), `.c2c-v2 .de-f .de-btn { flex: 1 1 0;
  min-height: 44px; }` makes both footer buttons equal halves: 171px each at 390.
- C2CForm's primary (`C2CForm.tsx:362–364`) is the lock or check icon plus the caller's label. "Log communication"
  needs more than 171px, so it breaks over two lines (`../after/log-communication-390-dark.png`).
- 23 `.de-f` footers exist. Every one but one holds at most two buttons (most are Cancel plus one primary). The one
  with three is `SourceImportDialog.tsx:181–184`: "Cancel", "Reload source preview" and "Checking working documents…" (about 470px
  of labels at 13px). **With `white-space: nowrap` and no wrap on `.de-f`, that footer would run past a 350px drawer
  body.** Today it squeezes the labels into three 111px columns of wrapped text instead.
- A wrapping footer already exists at phone width: `.c2c-v2 .de-sheet .de-f{padding:12px 16px;flex-wrap:wrap;}`
  (`journey-v2.css:624`, ≤600px, the Vault review-route sheet).
- `dialogButtonHoverSettles.test.ts` reads every `.de-btn` `:hover` rule and allows paint only. No rule added here is
  a hover rule.
- `D0.md` §7 check 11 says "At 390 it is 100vw with full-width footer buttons". The capture measured two 171×44
  buttons side by side. After this fix the two buttons still fill the row together; the ghost one is as wide as its
  label, and the primary takes the rest.

## What changes

This **completes** D0-2's primitives in `app-v2.css` and the drawer in `journey-v2.css`. It adds no class, no
component and no file except the test.

1. **Fix 2.** `app-v2.css:157` becomes `flex: 1 1 0%; min-width: min(420px, 100%);`, as the review says. In a row
   this wraps exactly as before (the 420px floor now does the line-breaking that the basis did). In a column, a
   percentage basis against an indefinite height is treated as `content`, so a column can no longer stretch it. The
   `.tb .ph` column line (`:1198`) is deleted; its block keeps the two recovery-message rules, and its comment drops
   "task header".
2. **Fix 3.** After `.reg-tbl` (`:383`):
   ```css
   @media (max-width: 640px) {
     .c2c-v2 :is(.pj-card, .pj-card-b, .reg-card) > .reg-tbl,
     .c2c-v2 [data-work-area] .pj-sec > .reg-tbl { display: block; overflow-x: auto; }
   }
   ```
   D5-0's two selectors (`:3944–3945`) are deleted from its block. `.pj-sec > .pj-card-b > .reg-tbl` is reached by
   `.pj-card-b > .reg-tbl`, and `[data-work-area] .pj-sec > .reg-tbl` is kept as written, so one rule now holds every
   table scroll.
3. **Fix 4.** After the composers' 15px rule (`:415`):
   ```css
   @media (pointer: coarse) {
     .c2c-v2 :is(.de-textarea, .landing-input, .pj-composer textarea, .ct-composer textarea) { font-size: 16px; }
   }
   ```
   The review's selectors, placed where the cascade lets them win (see above). It sets the size only, so
   `.de-textarea` keeps its 80px height.
4. **Fix 8.** In `journey-v2.css`'s drawer block: `white-space: nowrap` on `.c2c-v2 .de-btn`; at ≤640px,
   `.c2c-v2 .de-f .de-btn.ghost { flex: 0 0 auto; }` and `.c2c-v2 .de-f .de-btn.primary { flex: 1 1 auto; }`, as the
   review says, **and `flex-wrap: wrap` on `.de-f` at ≤640px**, which the review does not list. Without it, `nowrap`
   pushes a three-button footer past the screen edge (above). With it, a footer that fits stays one row, and one that
   does not puts its primary on a full-width row of its own. `.de-sheet .de-f` already does this at ≤600px.

What does **not** change: the header's markup and its ≥761px layout; `.reg-tbl`'s look at any width; the composers'
15px text on a mouse; `.de-textarea`'s height; the drawer at ≥641px; any TSX.

## Tests and gates

Every run's full output is in `red/` or `green/`. Vitest ran with `--maxWorkers=1`. No dev server or browser was
started. The builder left the change uncommitted; it was committed after the skeptic's review below.

### The new test: `client/src/concept2cure/v2/__tests__/d0PhoneWidth.test.ts`, 12 cases

It reads `app-v2.css` through `./_cssRules` (`APP_V2_CSS`, `rules()`), `journey-v2.css` through the same `rules()`,
and every sheet in `v2/styles/` as innermost blocks (so nested rules are seen) for the cross-sheet checks.
- **Fix 2** (2 cases): the header's first-child rule is `flex: 1 1 0%` with `min-width: min(420px, 100%)`, for
  `.ph`, `.sp-head`, `.reg-head` and `.pj-head`; and no rule in any v2 sheet gives a page header
  `flex-direction: column`.
- **Fix 3** (2 cases): exactly one rule in `app-v2.css` gives a `.reg-tbl` an overflow; it is at ≤640px,
  `display: block; overflow-x: auto`, and its parents include `.pj-card`, `.pj-card-b`, `.reg-card` and
  `[data-work-area] .pj-sec`; no other sheet has a copy.
- **Fix 4** (5 cases): for each of `.de-textarea`, `.landing-input`, `.pj-composer textarea` and
  `.ct-composer textarea`, the **last** rule in `app-v2.css` that sizes it (unconditional or coarse-pointer) is the
  coarse-pointer `font-size: 16px` rule, and that rule sets no `min-height`; and no scoped rule in any sheet, and no
  rule in another sheet, sizes these fields (so nothing outranks it).
- **Fix 8** (3 cases): `.c2c-v2 .de-btn` has `white-space: nowrap`; at ≤640px `.de-f .de-btn.ghost` is
  `flex: 0 0 auto`, `.de-f .de-btn.primary` is `flex: 1 1 auto`, and `.de-f .de-btn` keeps `min-height: 44px`; at
  ≤640px `.de-f` has `flex-wrap: wrap`.

**Red, before any change** (`red/d0PhoneWidth.txt`, at `2ffff0d94`): 10 of 12 fail, each for the reason it exists:
"expected '1 1 420px' to be '1 1 0%'"; "expected [ 'app-v2.css: .c2c-v2 .tb .ph' ] to deeply equal []"; the scroll
rule's parents are only D5-0's `[data-work-area] .pj-sec` pair; each text area's last sizing rule is the
unconditional 14px or 15px one; `.de-btn` has no `white-space`; no ghost or primary flex rule; no footer wrap. The 2
that pass are the two "nothing else" guards ("no other stylesheet keeps a second copy", "nothing outranks it"), which
hold at HEAD and must keep holding; the planted defects below show each of them failing.

**Red, with eight defects planted one at a time against the final code** (`red/d0PhoneWidth-m*.txt`; the script is
`red/mutants.py`). Each mutant edits only `app-v2.css` or `journey-v2.css`, runs the test and writes the files back;
their md5 was the same before and after every mutant (`18c78593…` and `a2f6acf9…`).

| Mutant | What was planted | Cases that turned red |
|---|---|---|
| `m1-16px-rule-in-the-inputs-block` | The 16px rule placed in the coarse inputs block, as the review and `VERDICT.md` word it | The three composers (3). `.de-textarea` stays green: the cascade point above, shown failing |
| `m2-d5-0-copy-not-folded` | D5-0's two selectors left in its block | "one rule, at ≤640px …" (1) |
| `m3-copy-in-another-sheet` | A `.pj-card > .reg-tbl` scroll rule in `journey-v2.css` | "no other stylesheet keeps a second copy" (1) |
| `m4-scoped-rule-outranks-16px` | `.c2c-v2 .pj .pj-composer textarea { font-size: 15px }` | "nothing outranks it" (1) |
| `m5-tasks-column-rule-back` | The `.tb .ph` column rule restored | "no stylesheet turns a page header into a column" (1) |
| `m6-equal-halves-kept` | No ghost flex rule (both buttons stay `1 1 0`) | "the ghost button is as wide as its label …" (1) |
| `m7-footer-does-not-wrap` | No `flex-wrap` on the phone footer | "a footer too wide for one row wraps …" (1) |
| `m8-label-may-wrap` | No `white-space: nowrap` on `.de-btn` | "a drawer button never breaks its label" (1) |

**Green** (`green/d0PhoneWidth.txt`): 12 of 12 pass.

### Gates

| Gate | Result | File |
|---|---|---|
| The three D0 guards (`foundationsSentenceCase`, `foundationsOneDefinition`, `foundationsRetiredRatchet`) | 3 files, 53 of 53 pass | `green/d0-guards.txt` |
| `npm run --silent ci:undefined-css-classes` | exit 0: "every static className in v2 is defined, 2 reviewed exception(s)". No class was added. | `green/ci-undefined-css-classes.txt` |
| `npm run --silent ci:token-contrast` | exit 0: 131 pairs; 15 documented exceptions held. No colour changed. | `green/ci-token-contrast.txt` |
| `npx eslint` on `d0PhoneWidth.test.ts` (the only changed `.ts`/`.tsx`) | 0 errors, 0 warnings (JSON report). The file is new, so no HEAD version to compare. | `green/eslint.txt` |
| Every test that reads `app-v2.css` or `journey-v2.css` by name, plus every test that walks the styles folder (`dialogButtonHoverSettles`, `cmcStylesheetClosure` and the rest): 32 files, listed in `green/readers-list.txt` | 30 files pass, 382 tests, including `reviewRoutePhoneWidth`, `dialogButtonHoverSettles`, `taskBoardClientReadable`, `shellQuietChromeRules`, `cmdkPlaces`, `tests/ui/pj-title-authority` and `tests/ui/token-authority`. 2 files fail, 6 tests, **both the same with HEAD's two stylesheets swapped back in** (`green/two-failures-at-head-without-this-change.txt`): `projectHomeStageCss` (`.pj-sec-acts` also defined in `app-v2.css` and `coverage-v2.css`, the D5 item in the review's check-16 row) and `runPolicySwitch` (5 cases, "No `authService` export is defined on the … mock", as D0-8 recorded). | `green/readers-and-guards.txt` |
| `ci:check-css-selector-shadowing` | exit 0: 49 sheets, 15 known, 0 new | `green/ci-check-css-selector-shadowing.txt` |
| `ci:token-cascade` | exit 0: 46 sheets resolve | `green/ci-token-cascade.txt` |
| `ci:surface-text-ramp` | exit 1, "surface-text-ramp.css — stale". **Red at HEAD without this change too** (`green/ci-surface-text-ramp-at-head-without-this-change.txt`; the review lists it red since `2e4a9fe67`). This change does not move it: the generator, redirected to a scratch folder, produces byte-identical output with and without this change (`green/surface-text-ramp-unmoved-by-this-change.txt`). The shared ramp sheet was not regenerated. | `green/ci-surface-text-ramp.txt` |
| `ci:check-phantom-tokens` | exit 1, `--danger-000` in `project-home-v2.css`. **Red at HEAD without this change too**, the pre-existing item in the review. | `green/ci-check-phantom-tokens.txt`, `…-at-head-without-this-change.txt` |

The two HEAD comparisons swapped `git show HEAD:` copies of the two stylesheets in for the length of one run and
wrote this change's copies back; the md5s after match the ones above.

## Where this departs from the review's wording

1. **Fix 4's location.** The review says to add the selectors to the coarse block (`:286`). There they lose to the
   composers' 15px rule (`:415`), which has the same (0,2,1) specificity and comes later; mutant `m1` shows it. The
   rule is placed after `:415` instead. The selectors and the value are the review's.
2. **Fix 8's footer wrap.** The review lists `nowrap` and the two flex values. With `nowrap` alone,
   `SourceImportDialog`'s three-button footer runs past a 390px screen, so the phone footer also gets
   `flex-wrap: wrap`, as `.de-sheet .de-f` already has at ≤600px. A two-button footer still fits on one row.

## (c) For the coordinator: `D0.md` text this changes

`D0.md` is a plan file and is not edited here. Four of its code blocks now differ from the code:
- §4.2.2: `> :first-child { flex: 1 1 420px; min-width: 0; }` is now `flex: 1 1 0%; min-width: min(420px, 100%)`.
- §4.2.5 and §4.2.16: the text areas' 16px coarse rule, after the composer rule.
- §4.2.11: the ≤640px table scroll rule, which also absorbs D5-0's.
- §4.2.14: `.de-btn` `white-space: nowrap`; at ≤640px the footer wraps, the ghost is `0 0 auto` and the primary
  `1 1 auto`. §7 check 11's "full-width footer buttons" now reads as "the two buttons fill the footer row together";
  they no longer have equal widths.

## Skeptic's review (2026-11-02, before the commit)

Re-checked, not taken from the builder's report:
- **Red at HEAD.** The test and `_cssRules.ts` were copied, with `git show HEAD:` copies of all 36 sheets, into a
  scratch folder outside the tree (the working stylesheets were not swapped). At `750a43978` (no style changed since
  `2ffff0d94`): 10 of 12 fail, the same 10 as `red/d0PhoneWidth.txt`
  (`red/d0PhoneWidth-skeptic-rerun-at-HEAD-750a43978.txt`).
- **Readers.** 36 test files: the builder's 32, plus four that read other sheets in `v2/styles/`
  (`editorPageCss`, `newProjectWizardLook`, `protocolSoaPersists`, `protocolSoaTargetSize`). 34 pass, 422 tests. The
  same two fail, for the same reasons as at HEAD: `projectHomeStageCss` (`.pj-sec-acts`, a line this change does not
  touch) and `runPolicySwitch` (the `authService` mock).
- **Gates.** The three D0 guards pass; `ci:undefined-css-classes` and `ci:token-contrast` exit 0; `npx eslint` on the
  test is clean; `git diff --check` is clean.
- **What was deleted loses nothing.** The `.tb .ph` line set layout only, and nothing else names it. D5-0's two
  selectors set `display` and `overflow-x` only; `[data-work-area] .pj-sec > .reg-tbl` is kept in the one rule and
  `.pj-sec > .pj-card-b > .reg-tbl` is reached by `.pj-card-b > .reg-tbl`. No colour or focus declaration was removed
  or narrowed.
- **Fix 4's two coarse rules were kept apart on purpose.** Folding the inputs' `font-size: 16px` into the later rule
  would also work (no rule sizes these fields at a specificity the move would flip), but
  `design-system/preview/components-inputs.html` copies the inputs' coarse rule verbatim, and the one-definition guard
  counts one sheet, not one rule. Both rules are in `app-v2.css`.

## Not done here

- **The running app.** No browser was opened (this step's constraint). RULE 4 says a screen is not done until it was
  used in the running app. Owed, at 390×844 with `hasTouch`, light and dark:
  - Tasks: the header's actions sit directly under the description, with no gap (against `../after/tasks-390-dark.png`);
    and at 700px wide, the actions wrap under the text block;
  - "Log communication": "Log communication" on one line, Cancel at its label's width, the primary filling the rest;
    and the Source import dialog with three buttons, which wraps to two rows and stays on the screen;
  - a table in a card, for example Registrations (`reg-card`) or Submission Center's eCTD compile (`pj-card-b`):
    `.page` `scrollWidth <= clientWidth` and the table scrolls inside its card;
  - the Home, project and conversation composers and a C2CForm text area: computed `font-size: 16px`.
- **The other 12 fixes** in the review are other steps' work.
