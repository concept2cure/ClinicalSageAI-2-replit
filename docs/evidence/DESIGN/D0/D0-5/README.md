# D0-5: the design-system docs and specimens

**Package:** D0, Foundations (`Plan: D0`). **Step:** D0-5, `.design/claude-convergence/D0.md` §4.5, plus the shared
ask D4 made of D0 (`D0.md` §4.2.17, "D0-5's README names `MenuButton`, `useMenu` and `MenuItem`").
**Read at:** `505449d7a` on `concept2cure-v2`, 2026-11-01, with D0-1 to D0-4 (`bacc0d343`, `2270a9f2b`, `fafcda621`,
`1dee898e9`), D0-6 (`f9c6f5706`), D5-0 (`943b78cb7`) and D5-1 (`94f24dba0`) in the tree.
**Files changed:** `design-system/README.md`, `design-system/preview/_base.css`, `components-buttons.html`,
`components-cards.html`, `components-inputs.html`, `components-badges.html`, `type-body.html`. Nothing else outside this
folder. Nothing is committed: a reviewer commits.

## What already exists (RULE 3)

Searches run: `git log --all --diff-filter=D -- 'design-system/preview/*' design-system/README.md` (nothing deleted);
`grep -rln "design-system/preview\|design-system/README"` over `tests/`, `scripts/`, `client/src/`, `server/` (no test
or gate reads the specimens or the README; two comments cite the README, see "Left as they are");
`grep -rn MenuButton client/src` (no file); `grep -n -- '--fs-[a-z]*:'` over `colors_and_type.css` and `app-v2.css`; a
search for any mirror of the preview pages (`design-system/_sync` holds none).

| Path | What it did before D0-5 | What it did not do |
|---|---|---|
| `design-system/README.md` | Voice, colour, type, radius, motion, cards, iconography and the 65/35 artifact table. | It said "Body is 13px. Metadata is 10px uppercase", "Never ALL CAPS except 10px metadata labels", radius "16px (chat composer) / 24px (dialogs)", and that cards are white with a shadow and a 1px hover lift. It had no canonical class list and named no menu pattern. |
| `design-system/preview/_base.css` | Already imported `../colors_and_type.css` (line 2 at HEAD), as §4.5 asks. Loaded Inter and Source Serif Pro. Had a 10px uppercase `.label` and an 11px pill `.chip`. | The app uses neither Inter nor Source Serif Pro: the sans is the system stack and the serif is Lora (`colors_and_type.css:495–510`, `client/index.html:60`). So the specimens were not drawn in the app's faces. |
| `design-system/preview/components-buttons.html` | Hand-written `button.primary/secondary/ghost/icon/destructive/send`, primary filled `--accent-main-100` with `#fff`, a round send, 10px uppercase labels. | None of the app's `.btn` rules. |
| `design-system/preview/components-cards.html` | A white `.card2` with `--shadow-xs`, `translateY(-1px)` on hover, 10px uppercase meta, 10px pill chips. | The app's `.pj-card` (no shadow, no lift, no band). |
| `design-system/preview/components-inputs.html` | A 13px `.input` on `--border`, focus `--accent-main-100` plus a halo; a radius-16 composer with `--shadow-glow` on focus; a round 30px send. | The `.c2c-input` / `.de-input` rules, the `--border-control` edge, the one-ring focus, the radius-20 composer. |
| `design-system/preview/components-badges.html` | 11px radius-full pills, tracked; an AI-blue pill, a "Pro" pill and an orange "Beta" pill. | The app's `.rd-chip` (12px, radius 6, sentence case, neutral `tone-ai`). |
| `design-system/preview/type-body.html` | Body 13/1.625, "Meta · 10 upper", reading 15/1.75 sans, the document serif at 14px. | The `--fs-*` scale. |
| `client/src/concept2cure/v2/styles/app-v2.css:136–431` | The D0 foundations block (D0-2, D0-4): the one definition of every primitive the specimens show. | (The source. Read, not changed.) |
| `journey-v2.css:514–526`, `surfaces-v2.css:17–22`, `authoring-v2.css:1483–1517, 1607–1638, 1872–1948` | `.de-btn`; the Home composer's layout; the artifact panel and `.dlm-*` menu styles. | (Sources. Read, not changed.) |
| `design-system/colors_and_type.css:548–554` | The seven `--fs-*` tokens. `app-v2.css` declares none: it reads them, starting with the root at `:78`. | — |
| `client/src/concept2cure/v2/editor/DownloadMenu.tsx` | `placeMenu` (`:179`, exported), `useMenu` (`:194`, not exported), `MenuItem` (`:260`, not exported), `DownloadMenu` (`:328`, exported, the only menu built from them). | No `MenuButton`. D4-2 exports `useMenu` and `MenuItem` and adds `MenuButton` (`D4.md` §D4.B step 1; `BUILD_ORDER.md` §1, D4). |

## What changed

**`design-system/README.md`** (§4.5's five items, and the menu ask):
- `:39` "Sentence case everywhere" loses its exception. It names the guard that enforces it, and says that capitals the
  text needs (an acronym, a code) are written, not styled.
- `:79–96` the type section is D0.md §3's table. The root is 14px. Every size is a `--fs-*` token declared once, in
  `colors_and_type.css`, and the README says `app-v2.css` declares none. `--fs-greeting` is marked "declared; no rule
  reads it yet" (0 uses in any sheet). Mono is for regulatory codes only.
- `:100` radius gains the composer at 20 and the centered dialog at 16. Dialogs were at 24. It now reads as §3's radius
  table, with each token named.
- `:153–179` a **canonical class list**: D0.md §4.7's table (canonical, then retired), with the defining sheet, as
  things stand. `.cm-subtab` and `CmConnectBar`/`.cm-connect*` are already gone (`f9c6f5706`). The composer row
  follows BUILD_ORDER §5.2 item 20 as amended in `87c6a1470`: `.rbm-ana-composer` comes from D7-C, and Reporting's find field is a search field (`.c2c-input`), not a composer. The rows D0 §4.2
  defines with no alias are added: page container, section heading, fields, table, empty state, answer lead and
  centered dialog. The list leaves the owner files and packages in D0.md §4.7 and says so.
- `:181–191` *The one menu*: `MenuButton`, `useMenu` and `MenuItem` are named as the one menu. The section also says
  what is true today: two of them are private, `MenuButton` does not exist, D4-2 adds it, and nobody builds a second
  menu meanwhile. It gives `.dlm-menu`'s values today (radius 6, `--bg-000`, its own shadow) and the values D4 moves
  it to.
- `:244` the 65/35 note points at the artifact panel (D0.md §3) with the values in `authoring-v2.css` as they stand:
  - the split is `clamp(340px, 34%, 520px)`;
  - at 1100px and under, the document takes the screen;
  - the header is 48px, with the title at 14/600, the line at 13 `--text-300` and 32px icon buttons;
  - the body is Lora 16/1.7.

**`design-system/README.md`, beyond §4.5's bullet list.** These are lines that stated a value the re-rendered specimens
now contradict, restated from the canonical set (D0.md §0: the README "restates the canonical set"). The reviewer may
drop any of them:
- `:44`: status shows as chips, not pills.
- `:71`: cards sit on the page colour; white is for the composer, menus and dialogs.
- `:74`: the status hexes are the tokens' (`#5e6d49`, `#955d22`, `#b63939`), not `#788c5d`, `#d97706` and `#dc3545`.
- `:101`: borders are `--border` `#dad9d4`, `--border-strong`, and `--border-control` for a control.
- `:104–107`: cards have no shadow and no lift. The composer's shadow, and `--v2-shadow-lg` for menus, dialogs and
  drawers. `--shadow-glow` is declared but used by no v2 sheet.
- `:111`: the three layers are `--bg-100`, `--bg-000` and `--canvas-elevated`.
- `:115–116`: the transition is `var(--dur)` with `var(--ease)` = `cubic-bezier(0, 0, 0.2, 1)`, not `all … (0.4, 0, 0.2,
  1)`. Entrances slide 4–16px.
- `:119`: nothing moves on hover. This was "Cards: 1px translateY(-1px)".
- `:124–125`: focus and disabled, as the rules are.
- `:140`: the card paragraph.
- `:144`: the rail is 264px expanded, not 260px.
- `:261`, and the old question 3: the fonts are decided (`colors_and_type.css:495–510`). They were "fell back to Inter
  + Source Serif Pro", which became untrue when `_base.css` stopped loading them.

**`design-system/preview/_base.css`.** It keeps `@import url('../colors_and_type.css')`. It loads Lora and JetBrains
Mono with the same URL as `client/index.html:60`, in place of Inter and Source Serif Pro. It carries the app's
`:root` aliases that `colors_and_type.css` lacks (`--accent-000/100/200`, `--dur`, `--v2-shadow-lg`), their
`.c2c-v2.dark` re-declarations, and the root type and resets, all copied from `app-v2.css`. `.label` is sentence case
at 12px. `.chip` takes `.rd-chip`'s values.

**The five specimens** each copy their component's rules from the app verbatim, scoped `.c2c-v2` exactly as in the
sheet. The four component pages each render a light panel (`.c2c-v2`) and a dark panel (`.c2c-v2.dark`, which gets
the dark tokens from `colors_and_type.css`'s `.dark` block). `type-body.html` is one light panel: it shows sizes,
faces and weights, not colour. A `:hover` or `:focus` state is shown at rest with an `.is-hover` / `.is-focus`
rule whose declarations are the source rule's, unchanged. Specimen labels are sentence case at 12px.
- buttons: `.btn` (quiet), `.btn.ghost`, `.btn.primary`, `.btn.small`, disabled, `.de-btn` (36px), `.landing-send`
  (32px, disabled at .4), and the icon-only `.btn.ed-ico`. The black "destructive" button and the "secondary" class
  are not in the canonical set and are not drawn.
- cards: `.pj-card` at rest, and a clickable `button.pj-card` at hover, with `.pj-card-h`, `-h-go`, `-m`, `-f`,
  `-ok`, `-blk` and tone chips.
- inputs: `.c2c-input` (rest and focus), `.de-label` with `.req`, `.de-desc`, `.de-input`, `.de-select`, a read-only
  field, `.de-textarea`, and the Home composer at focus with its send.
- badges: `.rd-chip` neutral, ok, warn and err; `tone-ai` and `tone-idle` neutral; with an icon; `rd-chip-sentence`.
  The lower-case value "planning" demonstrates `::first-letter`. The AI-blue, Pro and orange Beta pills are dropped:
  orange is not a status, and none of the three is a chip the app has.
- type-body: the seven tokens, each with its face, weight and leading. Title, section, small and caption use the
  app's own rules; prose, document and mono use `colors_and_type.css`'s `.prose-reading`, `.doc-content` and `.mono`.
  The greeting's face and leading are D0.md §3's, because no rule reads `--fs-greeting` yet.

## Every value, and the line it comes from

`verify_specimens.py` (in this folder) proves the copies instead of trusting them. For each specimen it takes every
rule above the "specimen only" marker and finds it in a source sheet: a one-line rule as an identical line, and a block
as its selector line followed, in order, by its lines. It checks each `.is-hover` / `.is-focus` rule's declarations
against a source `:hover` / `:focus` rule. It checks the flattened `.dcv-bar .btn.ed-ico`. It also checks the README's
type table and `type-body.html`'s labels against the `--fs-*` declarations. It prints `file:line` for each.
`green/verify-specimens.txt` holds its full output: 100 copied rules, states shown at rest and the flattened rule located, plus 14 type-scale checks, with 0 missing. Line numbers are as read at
`505449d7a`. The D0 block (`app-v2.css:136–431`) did not move during this work, but later blocks in `app-v2.css` did,
under other sessions. Re-run the script to re-derive them:
`python3 -I docs/evidence/DESIGN/D0/D0-5/verify_specimens.py "$PWD"`.

The README's prose values, by line:

| README | Value | Source |
|---|---|---|
| `:82` | root 14px / 1.5 | `app-v2.css:74,78` |
| `:84–92` | `--fs-greeting` 32 … `--fs-prose` 16 | `colors_and_type.css:548–554`; title rule `app-v2.css:164–167` (22px at 640: `:174`); section `:180`; caption on `th` `:380`; prose `colors_and_type.css:629–631`, doc `:636–638` |
| `:100` | radius 6 / 8 / 12 / 16; segmented 10 with items 8; composer 20 | `colors_and_type.css:252–255`; `app-v2.css:330, 332`; card `:295`; dialog `:404`; composer `:408` |
| `:101` | `#dad9d4`, `--border-strong`, `#7f7d75` | `colors_and_type.css:45, 133, 154` |
| `:105` | composer shadow, light and dark; `--v2-shadow-lg` | `app-v2.css:409, 412, 44, 66, 404`; drawer `journey-v2.css:468` |
| `:107` | `--shadow-glow` declared, unused | `colors_and_type.css:247`; `grep -c shadow-glow client/src/concept2cure/v2/styles/*.css` is 0 in every sheet |
| `:111` | `#f0eee6`, `#faf9f5`, `#ffffff` / `#30302e`; the rail on `--bg-100` | `colors_and_type.css:69, 67, 122, 391`; `app-v2.css` `.c2c-v2 .rail{` |
| `:115–116` | 200ms, `cubic-bezier(0, 0, 0.2, 1)`; 4–16px entrances | `colors_and_type.css:277, 283`, `app-v2.css:23`; `authoring-v2.css:1467–1470` (4px), `journey-v2.css:469` (16px) |
| `:119` | no transform on hover | `app-v2.css:185–186, 196–202, 301` |
| `:124` | focus | button `app-v2.css:105`; field `:269–271`; composer `:414` |
| `:125` | disabled .5 / .6 / .4 | `app-v2.css:206, 278, 424` |
| `:140` | the card | `app-v2.css:293–296, 301, 303` |
| `:144` | rail 56 / 264 | `app-v2.css:28–29` |
| `:74` | status hexes | `colors_and_type.css:181, 183, 185` |
| `:189–191` | the menu today | `DownloadMenu.tsx:179, 194, 260, 328`; `authoring-v2.css:1878` (`.dlm-menu`), `:1892` radius-md, `:1893` `--bg-000`, `:1895` shadow, `:1942` 13px item, `:1946` 12px note |
| `:244` | the artifact panel | `authoring-v2.css:1607–1608` (split), `:1613` (pane), `:1954–1957` (1100px), `:1483, 1487` (48px bar), `:1494` (title), `:1505` (line), `:1514–1517` (32px icon), `:1634–1638` (16/1.7) |
| `:261` | fonts | `colors_and_type.css:495–510`; `client/index.html:60` |

## Tests and gates

- **The three D0 guards.** These are `foundationsSentenceCase`, `foundationsOneDefinition` and
  `foundationsRetiredRatchet`, run with `npx vitest run --maxWorkers=1 …`. Result: 3 files, 53 tests passed
  (`green/d0-guards.txt`). D0-5 touches no file they read.
- **`npm run --silent ci:undefined-css-classes`.** The gate reads only v2 TSX, the v2 sheets, `index.css` and
  `App.css`, so no D0-5 file is among its inputs. Its result in the shared working tree depends on other sessions'
  uncommitted edits, and it changed three times during this work:
  - the builder's run printed **FAIL** on `tt-spark`, from another session's uncommitted `TaskTray.tsx` edit
    (`ci-undefined-css-classes-shared-tree-1-tt-spark.txt`). On a scratch copy of the inputs with `TaskTray.tsx` at
    HEAD it printed **OK** (`green/ci-undefined-css-classes-head-tasktray.txt`);
  - the reviewer's first run printed **OK**, after that session added a `.tt-spark` rule to `app-v2.css`;
  - the reviewer's second run printed **FAIL** on `pj-filter`, from another session's uncommitted edits to
    `ProjectClientFilter.tsx` and `ProjectPortfolioFilters.tsx`
    (`ci-undefined-css-classes-shared-tree-2-pj-filter.txt`). That session needs a `.pj-filter` rule, or a baseline
    entry with a reason, before it commits.

  On a `git archive` of HEAD `f5c46642a`'s gate inputs, the gate prints **OK** (`green/ci-undefined-css-classes-head.txt`).
- **The specimen verifier**, shown failing first:
  - On a copy of the tree with three drifts planted, it exits 1 and names each one
    (`red/verify-specimens-planted-drift.txt`): `.btn.small` at 30px, the README's `--fs-body` at 13px, and a card
    hover that lifts.
  - On HEAD's own previews and README, against HEAD's sheets, it exits 1 with 77 rules missing
    (`red/verify-specimens-head-previews.txt`). The pre-D0-5 specimens copied none of the app's rules.

  On the real tree it exits 0 (`green/verify-specimens.txt`). It also exits 0 when the D0-5 specimens are checked
  against HEAD's sheets instead of the working tree's, so other sessions' uncommitted edits to `app-v2.css` and
  `authoring-v2.css` do not hold it up.
- **Specimen hygiene.** A scan of the six preview files found:
  - no `text-transform: uppercase`, except `.rd-chip::first-letter`, which is copied from the app and is the
    sentence-case capital;
  - no positive letter-spacing, no literal size under 12px, no weight 700 and no `translateY`.

  An HTML parse finds every tag balanced. The scan read literal sizes only. It missed one computed size, which the
  review found and fixed (below).

## Review

The reviewer re-read the change against `D0.md` §3, §4.5 and §4.7, `BUILD_ORDER.md` §2.1 and §5.2 items 6 and 20, and
`DownloadMenu.tsx`, and re-ran every check above at `f5c46642a`. Every changed file is in D0's ledger paths
(`design-system/**`) or under `docs/evidence/**`. No server, style sheet, TSX, script or migration file was touched.
The composer row follows the lead's decision in `BUILD_ORDER.md` §5.2 item 20, not `D0.md` §4.7. As first built it
listed `.rc-input` for D7-D. The lead superseded that for D7-D in `87c6a1470`: "Find a report" answers through a
fixed router, not AnA, so it is `.c2c-input`, and neither `.rc-composer` nor `.rc-input` joins the composer list. The
row now says so. The README's menu values for D4 match `D4.md`'s `.dlm-*` block.

Fixed in review:
- **README `:39`.** It said no stylesheet sets `text-transform: uppercase`. That is untrue: the sentence-case guard
  allows `.rd-chip::first-letter`, and the chip specimen shows it. The line now names that one exception and what it
  does.
- **Code in specimen labels was under the 12px floor.** `colors_and_type.css` sets `code` and `.mono` at `0.8125em`.
  So the `<code>` and `.mono` inside the 12px labels (`type-body.html`'s token names, `components-buttons.html`'s
  `.btn`, `components-badges.html`'s `tone-ai`) computed to 9.75px, and the code in the 13px notes to 10.6px.
  `_base.css` now keeps the text's size for code in a `.label`, a `.lbl` or a `.note`. The rule sits below the
  "specimen layout only" marker, because it is not an app rule.
- **Landing.** The D0-5 files were staged when the coordinating session committed `87c6a1470` ("Coordination: L11
  goes to the Reporting session"), and that commit took them from the shared index. Their content there is this
  review's. The follow-up commit carries the composer row's correction and names the D0-5 outcome.
- **Evidence.** The light-and-dark claim now excludes `type-body.html`. The gate files are renamed for what they
  show. The verifier's red run on HEAD's previews is added.

## Not done, and why

- **The specimens were not opened in a browser.** This session's constraints rule out browsers and dev servers on the
  shared CPUs. They are static HTML on two stylesheets, and every rule in them is proved against the app's sheets by
  the verifier. Opening them is the reviewer's first check: `design-system/preview/components-*.html` and
  `type-body.html`, in light and dark panels.
- **Other preview pages are not in D0-5's list** (D0.md §4.5 names five), and still show the old system:
  - `type-display.html`: a 24px sans "H1" and 10px uppercase labels;
  - `spacing-radius.html`: the composer at 16 and no dialog radius;
  - `colors-stone.html`: an 11px uppercase `.title`.

  They follow in a D0 commit if the lead wants them.
- **Left as they are, outside this track.** `journey-v2.css:516–521` (comment) and
  `__tests__/dialogButtonHoverSettles.test.ts:12` (comment) cite the README's "Animation & motion" as giving the hover
  lift to cards. The README no longer gives the lift to anything. Both comments are still right that a button must not
  lift. Only their parenthesis is stale.
- **`design-system/CLAUDE.md`** still says "Body = 13px" and "ALL CAPS … 10px metadata labels". It is a plan file, and
  only a `Plan: PLAN` + `Founder-Decision` commit may change it (D0.md §0, §4.8).
- **Observation for D4 (not changed):** `.dlm-item:focus-visible` uses `outline: 2px solid var(--accent)`
  (`authoring-v2.css:1931–1933`). `--accent` is the neutral `#ebe5d9` (`colors_and_type.css:39`), not the orange. That
  is a low-contrast focus ring on the one menu.
  `D4.md`'s planned `.dlm-item:is(:hover, :focus-visible) { background: var(--bg-100); outline: none; }` removes
  the ring altogether, which leaves a `--bg-100` fill as the only keyboard focus cue on `--canvas-elevated`. D4 should
  keep a visible ring (`--accent-200`, as `.c2c-v2 button:focus-visible` has).
- **Found in review, for D0 (not D0-5's files):** in the app, `.mono` is `0.8125em` (`colors_and_type.css`
  `code, kbd, pre, .mono`), and `app-v2.css`'s `.c2c-v2 .mono` sets only the face. At the 14px root a regulatory code
  renders at 11.4px, under the 12px floor. `type-body.html`'s mono row shows that real value. Several app rules also
  set mono at 10–11px (`app-v2.css` `.scaf-row .mono`, `.gov-mv.mono`, `.pv-det-grid .v.mono`,
  `.pv-ver-row .mono`, `.adc-note .mono`). Raising the floor for mono is a D0 change to `colors_and_type.css` or
  `app-v2.css`, in that sheet's turn.
- **The specimens are still not opened in a browser.** The review ran under the same constraint as the build.
