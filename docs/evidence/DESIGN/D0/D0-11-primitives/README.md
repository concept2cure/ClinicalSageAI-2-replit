# D0-11: primitives (review fixes 1, 5, 10, 11 and 16)

**Package:** D0, Foundations (`Plan: D0`). **Step:** D0 review fixes 1, 5, 10, 11 and 16
(`docs/evidence/DESIGN/D0/review/README.md`, "D0 fixes owed"; `../after/VERDICT.md` defects 1 and 5).
**Read at:** `b391bfad2` on `concept2cure-v2`, 2026-11-02. The working tree held other sessions' RBM edits
(`server/**`, `RbmSurfacesA.tsx`, `rbmSurfaceWrites.test.tsx`) and no stylesheet edits. The review cited lines at
`bfa9c6869`; they have moved, so each rule below was found again by its selector, and lines are at `b391bfad2`.

**Files changed:**
- `client/src/concept2cure/v2/styles/app-v2.css`: the empty state's regulation line (fix 1), the chip's `dim` tone
  (fix 1), the bare tone rules deleted (fix 1), the dead `.c2c-empty-state.tone-error` rules deleted (fix 1), the
  mdx blocker dot's colour by name (fix 1), `.sp-primary` in the primary lists (fix 5), admin's `.seg-btn` in the
  segmented item rules (fix 10), `.pj-card-h` wraps (fix 11), the support handle at 12px (fix 16).
- `client/src/concept2cure/v2/styles/coverage-v2.css`: the Human Factors gate, mitigation and element dot, the
  review-workflow tag and the dispatch finding keep the fill or colour they took from the bare rules (fix 1). The CMC
  range (`:277–340`) is not touched.
- `client/src/concept2cure/v2/styles/misc-surfaces-v2.css`: the CRO pipeline figure keeps its fill (fix 1); the dead
  `.rd-chip.tone-flight` deleted (fix 16).
- `client/src/concept2cure/v2/styles/journey-v2.css`: `.sp-primary`'s chrome and hover lift deleted (fix 5); `.de-err`
  at 12px (fix 16). The CMC block (`:340–430`) is not touched.
- `client/src/concept2cure/v2/styles/admin-access.css`: its own button and segmented rules deleted, except
  `.adm-access .btn.small` (fix 10).
- `client/src/concept2cure/v2/__tests__/foundationsRetiredRatchet.test.ts`: `sp-primary` added at its measured count.
- `client/src/concept2cure/v2/__tests__/d0Primitives.test.ts`: the new test.
- This folder.

No TSX is edited and no file other than the test is created.

## What already exists (RULE 3)

Searches run, at `b391bfad2`:
- `grep -n` in `app-v2.css` for `c2c-empty-reg`, `c2c-error-ref`, `tone-error`, `.pj-card-h`, the button block and the
  segmented block;
- every rule naming `tone-ok|ai|warn|idle|dim|err` in every stylesheet under `client/src`
  (`grep -rn "\.tone-…" --include=*.css`), and every v2 rule whose subject is a bare tone class
  (`grep -n "\.c2c-v2 \.tone-" v2/styles/*.css`: six, all in `app-v2.css`, and one restatement in the generated
  `surface-text-ramp.css`);
- every element that can carry a bare tone class: `tone_users.mjs` here reads every `client/src` TSX/TS file with
  TypeScript and lists each `className` that holds a tone literal, a `tone-${…}` template, a `'… tone-' + x`
  concatenation or a name containing "tone", with the other classes on the element. Output:
  `tone-users-b391bfad2.txt` (351 rows; the "base" column also picks up the words a ternary compares, such as
  `approved`, which are not classes). Every multi-class string literal holding a tone class sits in a `className`;
  there are no imperative `classList` tone additions;
- for each dynamic site, the values it can write, read from its source (the `DOMAIN` table in `tone_cascade.mjs`,
  each line citing its file);
- which rule paints each such element's colour and fill: `tone_cascade.mjs` reads every stylesheet under
  `client/src` with PostCSS (nesting expanded, `surface-text-ramp.css` skipped because it sets only `--text-*`),
  matches each rule's subject compound against the element's classes, and resolves the winner by specificity, then
  load order (`index.css` first, `app-v2.css` the shell's first sheet, every other sheet after it). Output:
  `tone-cascade-b391bfad2.txt`;
- `git log -S` on each rule changed here (origins below);
- `.sp-primary` uses, counted exactly as `foundationsRetiredRatchet.test.ts` counts (`count_class.mjs`), and every
  class combined with it;
- every `.seg-btn` and `.adm-access .btn` user and rule (`grep -rn "seg-btn"`, `AdminAccess.tsx`);
- every test that reads or imports a touched file (`green/readers-list.txt`: 44 files), and the gates that read these
  selectors (`check-chip-tones`, `check-css-selector-shadowing` and its baseline, `generate-surface-text-ramp`,
  `check-shell-css-collisions`, `check-token-contrast`).

### What each piece does today

**Fix 1, the empty state's follow-ups.**
- **The regulation line.** `app-v2.css:418`, `.c2c-v2 .c2c-empty-state .c2c-empty-reg { … color: var(--text-400); }`,
  from D0-2 (`bacc0d343`). D0.md §3 allows `--text-400` only on `--bg-000`, and an empty state sits on any surface
  (`--bg-100` 4.08:1, `--bg-200` 3.79:1).
- **The bare tone rules.** `app-v2.css:2339–2346`, six rules at (0,2,0): `.c2c-v2 .tone-ok|ai|warn|idle` (from
  `75bc5f6b4`, 2026-07-07) and `.tone-dim|err` (`592d96ffd`, 2026-09-03). They are the chip's tones written for any
  element, and `tone-ai` there is `--ai` on `--ai-muted`, where the chip's own `tone-ai` is neutral. They painted the
  empty state's chip fill until `1d789b516` (`emptyState.contract.test.tsx`, case 5).
- **The chip's own tones** are the D0 block's `app-v2.css:381–386`, at (0,3,0): `ok`, `warn`, `err`, and `ai`/`idle`
  neutral. So the bare rules never win on a chip, except `tone-dim`, which has no chip rule: `rd-chip tone-dim` is
  emitted by `EctdCompile.tsx:434, :658, :1821` and `CmcModule3Build.tsx:813` (and `BUILD_STATE_META`'s `dim`), and
  draws `--text-400` on `--bg-100` from the bare `.tone-dim`. `surface-text-ramp.css` names `.c2c-v2 .tone-dim`, so
  its `--text-400` is re-based there.
- **Every non-chip element that can carry a bare tone** (`tone-cascade-b391bfad2.txt`). 65 element-and-tone pairs:
  - **31 already have their own rule for what shows** (`own` in the file): `.sc-verdict.tone-ok|warn|err`
    (`submission-v2.css:31–45`, since `8d72a3fb7`, 2026-08-13; loaded with Submission Center, the only place these
    render), `.audit-chip.tone-warn` (`mdx/pathway-tabs.css:119`), `.cro-sow*`, `.dc-820-dot`, `.dl-node-ic`,
    `.dl-node-type`, `.dr2-find-sev.tone-idle`, `.gi-auth`, `.hf-el-dot.tone-ok`, `.hf-sev`, `.rv-wf-tag.tone-ok|warn|idle`,
    `.sr-sev.tone-idle`. The review says `.sc-verdict.tone-warn` has no rule: it has, in `submission-v2.css:41`.
  - **20 take only a `color` from the bare rule, and nothing shows it**: the element is an empty dot whose fill is
    its own (`.cc-comm-dot`, `commcenter-v2.css:86–90`; `.cro-lc-dot`, `misc-surfaces-v2.css:851–856`;
    `.pdev-sev-dot.tone-warn`, `pdev/app.css:790`, which the review says has no rule), or every child sets its own
    colour (`.dc-cell`, whose `.dc-cell-v` and `.dc-cell-ref` are coloured at `coverage-v2.css:77–81`, as the review
    says; `.dl-node.tone-warn`; `.hf-gate.tone-ok|err`; `.riskmx-cell`, whose children are `.riskmx-dot` buttons;
    `.sr-finding.tone-idle`). The children checked are listed under "What changes".
  - **14 show something only the bare rule gives**:
    | Element | What the bare rule gives | Shown because | Sites |
    |---|---|---|---|
    | `.cro-pipe-n.tone-ok\|warn\|idle\|ai` | the `--*-muted` fill | the figure sits on it | `CroPortfolio.tsx:375` |
    | `.hf-mit.tone-ok\|err\|idle` | the `--*-muted` fill | the label sits on it | `HumanFactors.tsx:632` |
    | `.hf-gate.tone-idle` | `--idle-muted` fill, `--text-300` colour | the gate's box, and its icon takes the colour | `HumanFactors.tsx:606` |
    | `.hf-el-dot.tone-idle` | `--idle-muted` fill (and a colour on an empty dot) | the dot's fill | `HumanFactors.tsx:651` |
    | `.dr2-find.tone-idle` | `--idle-muted` fill, `--text-300` colour | the row, and `RuleLine`'s uncoloured text | `DispatchReadiness.tsx:148` |
    | `.rv-wf-tag.tone-err` | `--error-muted` fill, `--error` colour | a "Rejected" tag; the tag has `ok`, `warn`, `idle` rules only | `Review.tsx:721, :848` |
    | `.eng-blocker-dot.tone-err\|warn` | the colour | its fill is `currentColor` (`mdx/app.css:3930–3935`) | `EngineeringSurface.tsx:483`, `PostmarketSurface.tsx:354, :409`, `UdiSurface.tsx:292` |
  - Sites whose domain has no bare tone name are not elements here: `.dl-lead` (`good`/`calm`), `.sr-lead`, the
    `.ivd-*` family (`done`/`review`/`draft`/`missing`), Contradictions' `.pdev-sev-dot` (`critical`/`high`/…), and
    every site that writes an unprefixed tone (`ac-gate-cv`, `chg-out`, `pdev-due`, `orch-find-dot`, `status-pill`).
- **The dead error tone.** `app-v2.css:480–485`: "Its quiet form is in the D0 block above. The error tone stays
  here.", then `.c2c-v2 .c2c-empty-state.tone-error { … }` and its `.c2c-empty-ic` rule. `c2c-empty-state` is
  emitted in one place, `dataConnect.tsx:714`, as the class alone; `tone="error"` returns `<ErrorState>` before it
  (`dataConnect.tsx:694–705`, since W0-4 `2a03dc16d`). `emptyState.contract.test.tsx` pins both. D5-0's work-area
  block (`app-v2.css:3952–3954`) qualifies its three rules with `:not(.tone-error)`; that qualifier is now always true,
  and removing it would lower those rules' specificity, so it stays.

**Fix 5, `.sp-primary`.**
- `journey-v2.css:271–273` and `:277`: its own chrome (orange fill, radius 6, `9px 14px`, 12.5px), a hover that lifts
  it 1px with a shadow (`34f1ec90b`, 2026-09-24, "the primary's hover is the lift the system specifies"), a 15px icon,
  a second `.sp-primary` rule (`white-space: nowrap`; the shadowing baseline lists this pair as
  `journey-v2.css::.c2c-v2 .sp-primary`) and a grey disabled state.
- The canonical button is `app-v2.css:188–207` (D0-2): `:is(.btn, .reg-cta, .landing-newproj)` for the base, icon,
  disabled and coarse-pointer rules, `:is(.btn.primary, .reg-cta, .landing-newproj)` for the fill and its hover.
- **50 uses in 24 files** (`count_class.mjs`, the ratchet's rule), the review's figure at `bfa9c6869`. Combined with:
  nothing (34), `sc-btn` (13, `submission-v2.css:11–12`, padding), `gi-resolve` (1, `coverage-v2.css:708`, padding),
  and two ternaries with `sp-ask`. One owner layout override: `authoring-v2.css:2739`,
  `.source-work-action .sp-primary { padding }`.
- `foundationsRetiredRatchet.test.ts` holds §4.6's 32 names; `sp-primary` is not one of them.

**Fix 10, admin.**
- `admin-access.css:26–35`: `.adm-access .btn`, `.btn.small`, `.btn:hover`, `.btn.primary`, `.btn.ghost`, at (0,2,0)
  and later than `app-v2.css`, so they win over `.c2c-v2 .btn` (`af973c5e8`, 2026-07-26). `:85–88`: `.adm-access .seg`
  (a `--bg-050` track) and `.seg-btn` / `.seg-btn[data-on]`.
- `AdminAccess.tsx` uses `btn ghost small` ×5, `btn primary small` ×2 and one `seg-btn` (`:510`, `data-on`), inside
  `.adm-access` (`:434`). The only other `seg-btn` users are mdx (`.mdx-shell .seg-btn`, `mdx/app.css:765`) and pdev.
- D0.md §4.2.4 keeps `.adm-access .btn.small` as an owner rule. `foundationsOneDefinition.test.ts` does not count it.
- AdminAccess.tsx is outside D0's paths, so its markup cannot move onto `.seg-b`; the alias goes in the CSS, scoped to
  `.adm-access`. An unscoped `.seg-btn` alias would reach mdx's segmented buttons, which render inside `.c2c-v2`.
- `d0Focus.test.ts` reads the segmented items from the 28px item rule and holds each to the inset focus rule and to the
  dark ring, so the alias joins those two rules as well.

**Fix 11, the card header.** `app-v2.css:308`, `.c2c-v2 .pj-card-h { display: flex; … justify-content: space-between;
gap: 8px; … }`, no `flex-wrap`. It is the only `.pj-card-h` rule in any sheet (`foundationsOneDefinition` pins that).

**Fix 16, the small items.**
- `journey-v2.css:546`, `.c2c-v2 .de-err{font-size:11.5px; …}`: C2CForm's error line.
- `app-v2.css:595–597`, `.c2c-v2 .c2c-error-ref { font-size: 11px }` and its `code` at 11px (`2a03dc16d`): ErrorState's
  "Reference" support handle (`dataConnect.tsx:600`). The handle is the `code`, so both move.
- `misc-surfaces-v2.css:58`, `.rd-chip.tone-flight` inside the sheet's `.c2c-v2 { … }` nest (`a32a0067c`): `#eef2fb` /
  `#3a5bbf`, no token, no dark pair. No TSX or TS writes `flight` as a tone.

## What changes

This **completes** D0-2's primitives in `app-v2.css` and the owners' tone rules beside them. It adds no class, no
component and no file except the test.

1. **Fix 1.**
   - `.c2c-empty-reg` takes `var(--text-300)`.
   - The six bare `.c2c-v2 .tone-*` rules are deleted. The chip gains the one tone it lacked, beside its others in the
     D0 block: `.c2c-v2 .rd-chip.tone-dim { background: var(--bg-100); color: var(--text-400); }`, the values the bare
     rule gave it.
   - Each of the 14 pairs above keeps exactly what it showed, in its own sheet beside its other tone rules:
     `.cro-pipe-n.tone-ok|warn|idle` gain the fill and `.cro-pipe-n.tone-ai` is added with it
     (`misc-surfaces-v2.css`); `.hf-mit.tone-ok|err|idle` gain the fill, and `.hf-gate.tone-idle`,
     `.hf-el-dot.tone-idle`, `.rv-wf-tag.tone-err` and `.dr2-find.tone-idle` are added with the bare rule's fill and
     colour (`coverage-v2.css`). The mdx blocker dot's sheet is outside D0's paths, so its colour is named in
     `app-v2.css` where the bare rules were: `.c2c-v2 .eng-blocker-dot.tone-err|warn`.
   - The 20 colour-only pairs get nothing: their colour shows nowhere. Checked: `.cc-comm-dot` and `.cro-lc-dot` are
     empty, `aria-hidden` spans with their own fills and no `currentColor`; `.pdev-sev-dot` is empty; `.dc-cell-v`
     and `.dc-cell-ref`; `.dl-node-action|when|detail|who|role` and `.dl-node-ic|type`; `.hf-gate-ic` (own colour
     for `ok` and `err`), `.hf-gate-t|s`; `.riskmx-dot`; `.sr-sev`, `.sr-dim`, `.sr-finding-title|detail`,
     `.sr-leaf`, `.sr-basis`, `.sr-fix` each set a colour.
   - The two dead `.c2c-empty-state.tone-error` rules and their comment are deleted.
2. **Fix 5.** `.sp-primary` joins `app-v2.css`'s base, icon, fill, fill-hover and coarse-pointer lists. In
   `journey-v2.css` its chrome, the hover lift and the 15px icon go; it keeps `flex-shrink: 0; white-space: nowrap`
   as one rule. Its grey disabled state (`:277`) stays, with `border-color: transparent` added so the canonical
   primary's orange border does not show around the grey, and `.sp-primary` stays out of the canonical `:disabled`
   opacity list: a disabled primary stays grey rather than turning a faded orange, which the review's (c) item on
   §4.2.4 names as the treatment to reuse. `sp-primary` joins the retired-name ratchet at 50.
3. **Fix 10.** `admin-access.css` keeps `.adm-access .btn.small` and loses the other four button rules and the three
   segmented rules. In `app-v2.css`, `.c2c-v2 .adm-access .seg-btn` joins, as its own selector, the segmented item's
   base, hover, active, dark-active and inset-focus rules.
4. **Fix 11.** `.pj-card-h` gains `flex-wrap: wrap`.
5. **Fix 16.** `.de-err`, `.c2c-error-ref` and `.c2c-error-ref code` take `var(--fs-caption)`; `.rd-chip.tone-flight`
   is deleted.

What does **not** change: any TSX; the look of any chip, verdict, dot or tag that wore a tone (except the colour-only
pairs above, where the colour shows nowhere); the empty state's other values; the CMC ranges of `coverage-v2.css` and
`journey-v2.css`.

## The generated ramp

`surface-text-ramp.css` is generated from the stylesheets and names every selector that sets a `--bg-050/100/200`
fill. This change moves three of its entries (`green/surface-text-ramp-delta-from-this-change.txt`, the generator run
in a `git archive` export with HEAD's five sheets and then with this change's):
- `.c2c-v2 .tone-dim` becomes `.c2c-v2 .rd-chip.tone-dim` (`--bg-100`);
- `.adm-access .seg` leaves (`--bg-050`); admin's track is the canonical `.c2c-v2 :is(.seg, .ml-seg)`, already listed
  under `--bg-100`, which the ramp prints after `--bg-050`;
- `.c2c-v2.dark .adm-access .seg-btn:is(.on, …)` joins (`--bg-200`).

The ramp file is **not edited here**. `ci:surface-text-ramp` is red at HEAD without this change
(`green/ci-surface-text-ramp-at-head-without-this-change.txt`: other sheets' staleness, the Vault follow-ups), and
regenerating would sweep that in. Left as it is, the ramp still re-bases every element this change touches:
`.c2c-v2 .tone-dim` matches every `.rd-chip.tone-dim`; the stale `.adm-access .seg` entry is outranked by the
canonical `--bg-100` entry printed after it; and the admin active segment's own text is `--text-100`, which the ramp
does not move. The next regeneration picks these three up.

## Evidence

All at HEAD `b391bfad2` plus this change, unless the file says otherwise.

**Red** (`red/`):
- `d0Primitives.txt`: the final test against HEAD's stylesheets (a `git archive` of `v2/styles`, read through
  `D0_PRIMITIVES_STYLES`): **36 failed, 7 passed**. The seven that pass pin what already holds: the chip's five own
  tones, the two rules the review says are missing (`.sc-verdict.tone-warn`, `.pdev-sev-dot.tone-warn`), and the
  ratchet entry, which the test reads from the working tree.
- `foundationsRetiredRatchet-sp-primary-at-49.txt`: `sp-primary` entered one below its count: "uses rose from 49 to
  50", 1 failed.
- `mutants.py` and `d0Primitives-m1…m8-*.txt`, summary in `mutants-summary.txt`: eight mutants of this change, each
  on a copy of the stylesheets; **each turns the test red**:
  1. an unscoped `.seg-btn` alias;
  2. a bare `.c2c-v2 .tone-idle` back;
  3. the Rejected tag's fill removed;
  4. the `.sp-primary` hover lift back;
  5. the disabled primary's orange border back;
  6. admin's `.btn.primary` back;
  7. the card header not wrapping;
  8. the regulation line at `--text-400`.

**Green** (`green/`):
- `d0Primitives.txt`: 43 passed.
- `tone-cascade-after.txt` and `tone-cascade-before-after.txt`: the inventory re-run with this change. No pair is
  painted by a bare rule. Of the 65 pairs' 130 colour and fill values, 20 changed, each the colour of an element where
  no colour shows (the 20 listed under "What changes"); every fill and every shown colour has the value it had.
- `d0-guards.txt`: `foundationsSentenceCase`, `foundationsOneDefinition`, `foundationsRetiredRatchet`: 3 files,
  54 tests passed (the ratchet now 34 tests, `sp-primary` at 50).
- `readers-and-guards.txt`: every test that reads or imports a touched file (`readers-list.txt`, 44 files) plus
  `d0Primitives`. The same failures as at HEAD without this change, and no others
  (`readers-at-head-without-this-change.txt`: `runPolicySwitch` ×5 and `projectHomeStageCss` ×1, D5's `.pj-sec-acts`;
  neither reads a rule this change touches).
- Gates: `ci-undefined-css-classes.txt` OK; `ci-token-contrast.txt` OK (131 pairs, 15 exceptions held);
  `ci-check-chip-tones.txt` OK (183 literal tone uses, all 26 resolve); `ci-check-css-selector-shadowing.txt` OK
  (14 known, 0 new); `ci-check-shell-css-collisions.txt` OK; `ci-token-cascade.txt` PASS; `ci-design-system.txt` OK;
  `ci-check-orphaned-stylesheets.txt` OK.
- Red before and after, not from this change: `ci-check-phantom-tokens.txt` (`--danger-000` at
  `project-home-v2.css:447`, D2-2's sheet, untouched here; the review's "Pre-existing" table) and
  `ci-surface-text-ramp.txt` (above).
- `eslint.txt`: the two changed `.ts` files, 0 problems; the ratchet at HEAD, 0 problems. `tsc --noEmit --strict` on
  both: 0 errors.

## For the coordinator (outside D0's paths)

- `scripts/ci/css-selector-shadowing-baseline.json` can drop `journey-v2.css::.c2c-v2 .sp-primary`: the two
  `.sp-primary` rules are one now, and the gate lists it under "no longer shadowed" (with the three entries it
  already listed).
- The review's fix 1 says `.sc-verdict.tone-warn` and `.pdev-sev-dot.tone-warn` have no rule. Both have one
  (`submission-v2.css:41`, `pdev/app.css:790`); `d0Primitives` pins them.
- The bare rules' fills that this change keeps by name look accidental where the element has no padding
  (`.cro-pipe-n`, `.hf-mit`) or where one severity of a list is tinted and the others are not (`.dr2-find.tone-idle`).
  They are kept so nothing changes colour in this step; each is the owner's to drop.
- Not re-taken in a running app (no browser in this step): Admin's buttons and segmented control, a disabled
  `.sp-primary`, and a card header with a long subtitle at 1440 and 390, light and dark.
