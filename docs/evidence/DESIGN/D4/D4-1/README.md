# D4-1: the editor's page, CSS only

**Package:** D4 (`Plan: D4`). **Completes:** `client/src/concept2cure/v2/styles/authoring-v2.css`,
`client/src/concept2cure/v2/styles/rich-section-editor.css`.
**Spec:** `.design/claude-convergence/D4.md` §0 item 1 and §D4.K ("Page", "Type", "Ribbon", the outline's rows, the
page-scroll fix, dark `color-scheme`); `BUILD_ORDER.md` §1, D4 row "D4-1 CSS only".
**Read at:** `f9c6f5706` on `concept2cure-v2`, 2026-11-01, with D0-1 to D0-4, D5-0 and D5-1 landed. Reviewed and
re-run at `b854c54c2` (D0-5 and D1-4 landed) before the commit; the ramp, the red run and the green run below are from that
base.

No markup changed, and no screen, route, service, component, table or AnA tool was added (RULES 4 and 6). One test
file was added: `client/src/concept2cure/v2/__tests__/editorPageCss.test.ts`.

---

## What already exists (RULE 3)

**Searches run:**
- `grep -rn` over `client/src/concept2cure` for `RichSectionEditor`, `rich-section-editor.css`, `authoring-v2.css`,
  `<DocumentWorkbench`, `className="ed"`, `ed-full-sec-body`, `ed-dot`, `scaf-note`, `nda-open`, `rse-link`,
  `page-full`, `color-scheme`.
- For every selector §D4.K names: `grep -rln` over `editor/**`, `surfaces/Authoring*.tsx`,
  `surfaces/DocumentAuthoring.tsx` and `quality/` (the result is in "Not added" below).
- `grep -rln "authoring-v2.css\|rich-section-editor.css" client/src tests --include=*.test.*` for tests that pin the
  two sheets.
- `git show 943a44b5bd:…/authoring-v2.css` to map the spec's line ranges (read at that commit) onto the file today.

| Piece | Path | What it does today (before D4-1) | What it does not do |
|---|---|---|---|
| The editor's sheet | `styles/authoring-v2.css` | The outline (`.ed-tree*`, `.ed-basis*`, `.ed-dot`), the page (`.ed-doc*`), document view (`.ed-full*`), the masthead (`.ed-mast*`), the canvas card and D0's artifact shell (`.dcv*`, `.ct-canvas-pane`), all nested in `.c2c-v2 { … }`. The outline sits on `--bg-050`. Its active row is orange (`--accent-000` / `--accent-200`), its text is 10–10.5px, and a drafted node's dot has no rule. The page measure is `min(1440px, 100%)`. Document view is 14px with a 78ch cap and an orange bar on the active section. The masthead code is orange. | It gives the document no reading measure, does not colour the drafted dot, and does not keep the outline's overflow inside the outline. |
| The rich editor's sheet | `styles/rich-section-editor.css` | Unscoped `rse-*` rules shared by every host of `RichSectionEditor`. The ribbon wraps (`flex-wrap: wrap`) into two rows. Links are 11px orange, the Track changes label is 10px `--text-400`, and its checkbox is 24px. `.tiptap` is the serif at 14px / 1.75. | It does not make the paragraphs inherit the page's size. |
| The paragraph rule | `design-system/colors_and_type.css:600–605` | `.body, p, .p` sets `font-size: 0.875rem`, `line-height: var(--leading-relaxed)` (1.625) and `margin: 0` on every `<p>`. D0-1 already took `font-family` off the bare `p` (`:605`). | An element rule beats inheritance, so `.tiptap`'s and `.ed-full-sec-body`'s size never reached a paragraph. |
| Dark `color-scheme` | `styles/app-v2.css:68–70` (in `.c2c-v2.dark`, from D4's ask) | `color-scheme: dark` on the shell root, which `.ed` and `.dcv` inherit. | — |
| Notes and links, every screen | `styles/app-v2.css:2409` (`.c2c-v2 .scaf-note`), `:2727–2729` (`.c2c-v2 .nda-open`) | D0's global re-values: a `--bg-100` note with a hairline border and no orange rule; a 13px `--text-300` link that underlines on hover. | No alert tone. Inside the document the note keeps its 14/16px padding and its frame. |
| The artifact shell (D0 §4.2.17, with D4's three corrections) | `styles/authoring-v2.css:1522` (`.dcv-expanded`), `:1553` (`.dcv-bar`), `:1584` (`.dcv-bar .btn.ed-ico`), `:1683` (`.ct-canvas-pane`, no `border-left`), `:1704` (`.dcv-expanded .ed-full-sec-body`) | The panel shell. | Not touched by D4-1. |
| The editor's markup (unchanged) | `editor/DocumentWorkbench.tsx` | `:4131` the root `.ed`. `:4134` `aside.ed-tree`. `:4212` the outline basis as a `div.ed-basis` (not yet `<details>`). `:4250` outline rows, with inline `paddingLeft` and `opacity`. `:4297` `.ed-dot data-s="ok"`. `:4922` `.ed-doc-scroll`. `:5042` `.ed-mast`. `:5441–5451` an **inline-styled bordered box** (`border`, `minHeight: 460`, `overflow: hidden`) around `RichSectionEditor` (`:5452`). `:2660` the active row's `scrollIntoView({ block: 'nearest' })`. | — |
| The rich editor's markup (unchanged) | `editor/RichSectionEditor.tsx` | `:2105` `.rse-root`. `:2164` `.rse-ribbon`, about 30 controls, several of them text-labelled ("§ Ref", "Cite", "Table", "Caption", "Ask for a source", "Offer alternatives", "Comment", "Track changes"). `:2405` the `.rse-track` label. `:2415` `.rse-review`. `:2843` `.rse-body`. `:2878` `.rse-empty-cta`. | — |
| Other hosts of `RichSectionEditor` | `quality/ControlledTextEditor.tsx:13`, `surfaces/EctdCoauthor.tsx:54`, `surfaces/ProtocolDevSection.tsx:39` | Each mounts the editor outside `.ed`. (The "MDX drawer" that D4.md:1269 names no longer imports it.) | — |
| Other users of the `.ed` classes | `surfaces/BiopharmaProject.tsx:735–757` (`.ed`, `.ed-tree`, `.ed-tree-row`, `.ed-dot data-s={draft\|review\|complete}`); `quality/ControlledDocumentWorkbench.tsx` (hosts the workbench) | They take the same outline look. | — |
| `.ed-full-sec-body` hosts | `editor/DocumentWorkbench.tsx:5005` (document view), `editor/DocumentCanvas.tsx:492` (the card's section, with `dcv-sec-body`), `surfaces/ReviewDecisionDialog.tsx:73` | A section body read in the serif. | — |
| The page container | `V2App.tsx:1334` (`.page.page-full`), `styles/app-v2.css:615` (`.page-full { display: flex }`), `:1723` (`.page { overflow-y: auto }`); `surfaces/DocumentAuthoring.tsx:75–85` renders `.ed` directly inside `.page` | The Authoring route's full-bleed page. | Today `.page` scrolls whenever the outline's content overflows `.ed-tree`. |
| Tests that read these sheets | `__tests__/canvasDocumentsList.test.tsx`, `documentCanvasPolish.test.tsx`, `downloadWorkingCopy.test.tsx`, `reviewRoutePhoneWidth.test.ts`, `tests/ui/ana-rail-phone-drawer.test.ts` | The canvas's motion, the `.ed-doc-actions` scroller, `.dlm-menu` fixed, the phone stacking. | None pinned the page's type, the outline's dot, the active row or the outline's scroll. |

---

## What changed

### `client/src/concept2cure/v2/styles/rich-section-editor.css` (appended block, `:105–159`, all scoped to `.ed`)

The block is scoped to `.ed`, the workbench root. The three other hosts are outside `.ed`, so they keep the unscoped
rules above it.

- **Type (the defect fix), `:119–133`.**
  - `.ed .rse-root` is transparent. `.ed .rse-body` is `overflow: visible`.
  - `.ed .rse-body .tiptap` is the serif at `var(--fs-prose, 16px)` / 1.7, `--text-100`, min-height 360.
  - `.ed .rse-body .tiptap :is(p, li, blockquote)` inherits family, size, leading and colour (`:122`). This is the
    fix: the design system's `p` rule no longer sets the paragraph's size.
  - Prose has no 78ch cap. Headings are serif 600 at 22/18/16. Tables are in the sans at `--fs-small`, and cells
    inherit at 1.5. `th` sits on `--bg-050`.
  - Focus while writing shows as the ribbon's underline in `--border-focus` (`:132–133`).
- **Ribbon (one row), `:140–159`.**
  - `.ed .rse-ribbon` is `flex-wrap: nowrap; overflow-x: auto`, sticky at the top, with a hairline underneath.
  - `.ed .rse-ribbon > * { flex-shrink: 0 }` keeps each control at its own width.
  - Buttons are 28px, quiet `--text-300`, with a `--bg-100` hover and a `--bg-200` pressed state. The selects are
    borderless.
  - The Track changes label is 13px `--text-300` and does not wrap. Its checkbox is 16px with
    `accent-color: var(--text-100)`; it is dark in dark mode through D0's `color-scheme`.
  - Links (`.rse-link`) are 13px `--text-300` and underline on hover. Disabled links keep `--text-400`.
  - The review strip is a hairline card. The gate and find bars are 13px on `--bg-050` (they were on `--bg-50`, which
    is not a token the ramp sees).
  - Under a coarse pointer, buttons and selects are 44px. Transitions stop under `prefers-reduced-motion`.

### `client/src/concept2cure/v2/styles/authoring-v2.css` (in place, inside `.c2c-v2 { … }`)

- **The page-scroll fix, `:62–77`.** `.ed-tree` now scrolls inside itself (`overflow-y: auto`, `:76`).
  `.ed-tree-scroll` (`:164`) and `.ed-doc-scroll` (`:320`) now take `min-height: 0`. The cause, from D4.md §D4.A,
  is that the outline's header, filings and outline-basis paragraph are not scrollers. On a long rule pack they
  spilled out of `.ed-tree`, so `.page` had 82px to scroll (934 against 852), and the active row's
  `scrollIntoView` (`DocumentWorkbench.tsx:2660`) scrolled it 61px under the top bar. With the overflow kept inside
  the outline, `.page` has nothing to scroll.
- **Outline rows and type, `:71–242`.**
  - The outline sits on `--bg-000`. Its title is 14px. Its meta line, row codes and outline basis are 12px (they
    were 10–10.5px).
  - The basis tone is the word's colour, not a pill, and reads "Harmonised standard · outline basis".
  - Rows are 13px with a 32px minimum height. Hover is `--bg-100`.
  - **The current row is `--bg-200` / `--text-100` (`:199`), not orange.**
  - `.ed-lbl` gains `min-width: 0`.
  - **The drafted dot (`data-s="ok"`) is `--success` (`:232`)**, a 7px dot. Draft, and any other state, is the
    default `--idle`. Review stays `--warning`.
- **The page, `:320–332`.** `.ed-doc-inner` is a centred 816px page with 32/48/120 padding, so the text column is at
  most 720px.
- **Document view, `:355–465`.**
  - The mast has no rule.
  - Sections are divided by `--border-subtle`. The active section is a `--bg-050` band (`:367`), not an orange bar.
  - Section codes are 13px mono `--text-300`. Titles are serif 20/500.
  - `.ed-full-sec-body` (`:406`) is the serif at `var(--fs-prose, 16px)` / 1.7, and its `p, li, blockquote` inherit
    (`:412`).
  - The 78ch cap is gone. Paragraph spacing (`p { margin: 0 0 12px }`) stays.
  - The empty line is 14px upright `--text-300`.
- **Masthead, `:469–487`.** The code is 13px mono `--text-300`; it was orange 600. The title is the serif at
  `var(--fs-title, 26px)`, weight 500, −0.01em. The mast has no bottom rule.
- **Quiet notes and links, `:494–517`.**
  - `.ed .scaf-note` and `.dcv .scaf-note` are a dense, frameless `--bg-100` note at 13px.
  - With `[role='alert']`, the note is `--error` on `--error-muted`.
  - `.ed .nda-open:hover` and `.dcv .nda-open:hover` turn `--text-100`.
- **Provenance line, `:2325`.** `.ed-provline` is 13px `--text-300`; it was 11.5px `--text-400`.
- **Phone, `:2203–2212`** (in the existing `@media (max-width: 760px)` block). `.ed-doc-inner` keeps a 16px gutter
  (`20px 16px 80px`), and `.ed-mast-t` is 22px, as D0's page titles are at that width.

### `client/src/concept2cure/v2/styles/surface-text-ramp.css` (regenerated by its script, never hand-edited)

D4-1 moves these selectors between the surface tiers:
- added to `--bg-050`: `.ed .rse-body .tiptap th`, `.ed .rse-find`, `.ed .rse-gate`, `.ed-full-sec[data-active]`;
- removed from `--bg-050`: `.ed-tree`;
- added to `--bg-100`: `.ed .scaf-note`, `.dcv .scaf-note`, `.ed .rse-rb:hover`, `.ed .rse-sel:hover`;
- removed from `--bg-100`: `.ed-basis-chip[data-tone='idle']`;
- added to `--bg-200`: `.ed .rse-rb[data-active]`, `.ed-tree-row[data-active='true']`.

The mdx and pdev ramp sheets are unchanged.

**What was committed.** The working-tree `surface-text-ramp.css` is regenerated against the whole working tree, so
it also carries other sessions' uncommitted selectors (at the commit: `.c2c-v2 .pj-index .ct-row:hover` added and
`.c2c-v2 .ws-switch` removed, from the Projects lane's sheets). The committed ramp is instead the script's output for
`b854c54c2`'s stylesheets plus D4-1's two sheets only: produced in a scratch copy of every tracked
`client/src/**/*.css` at that commit, with `node scripts/design/generate-surface-text-ramp.mjs`, checked there with
`--check` (OK), and staged by blob so that the working tree's copy was left as it was.
`surface-text-ramp.d4-1-only.patch` is that ramp as a diff against `b854c54c2`'s ramp; applied to it, the result is
byte-identical to the regenerated file. The mdx and pdev sheets come out unchanged. (The builder's first patch was
made against `f9c6f5706`; `14dce5e38` changed the ramp after that, so it no longer applied.)

### `client/src/concept2cure/v2/__tests__/editorPageCss.test.ts` (new test)

The test parses both sheets with postcss. It resolves nesting and expands `:is()` lists, and it checks base rules
only. It pins five things:
1. the prose type, and paragraph inheritance in the editor and in document view;
2. that the prose type is scoped to `.ed`;
3. the drafted dot;
4. no orange on the current row, the masthead code, the section code or the editor's links;
5. the outline's own scroll, the reading measure, the one-row ribbon, the quiet notes, and the 12px floor on the
   outline's and the page's text.

**Red before D4-1:** `red/editorPageCss.txt`, 10 of 11 failing (the parser self-check passes). It was run with this
test against `b854c54c2`'s two sheets, in a scratch copy (hence the scratch path in its header).
**Green after:** `green/vitest-d0-guards-and-editorPageCss.txt`.

---

## Where D4-1 departs from the text of §D4.K, and why

1. **Side insets stay while the bordered box stays.** The spec's values assume D4-6's borderless `.ed-page`. Until
   then, `DocumentWorkbench.tsx:5441–5451` draws an inline-styled border around the editor, which CSS cannot remove
   without `!important`. With the spec's 0 side insets, the text, ribbon, empty-state call and review strip would sit
   on that border. D4-1 keeps a side inset on each; D4-6 sets them to 0 when it replaces the box.

   | Selector | D4-1 value | Spec value |
   |---|---|---|
   | `.tiptap` padding | `20px 20px 40px` | `20px 0 40px` |
   | `.rse-ribbon` padding | `6px 8px` | `6px 0` |
   | `.rse-empty-cta` padding | `16px 20px 0` | `16px 0 0` |
   | `.rse-review` margin | `12px 20px` | `12px 0` |
2. **The ribbon's scrollbar stays (`thin`, not `none`), and its controls do not shrink (`> * { flex-shrink: 0 }`).**
   In D4-1 the row still holds about 30 controls, several with text labels, which is about 1,390px against a column
   of about 718px.
   - Without `flex-shrink: 0`, the 28px `min-width` lets "Ask for a source" and the like shrink, and their labels
     wrap inside them.
   - With a hidden scrollbar, Track changes and AnA's three actions would sit past the right edge at 1440 with no cue
     for a pointer.

   Every control is still reachable by Tab and by scrolling the row. D4-6 makes the row fit with "More formatting"
   and icon buttons; it can then hide the scrollbar.
3. **`.rse-link:hover:not(:disabled)` plus `.rse-link:disabled`.** At equal specificity and later in the file, the
   spec's `.ed .rse-link` colour would override the base disabled colour, and its hover would underline a disabled
   link.
4. **The page-scroll fix is the cause, not the spec's selectors.**
   - The spec's selectors, `.page:has(> .dcv-expanded[data-placement='page'])` and
     `.dcv-expanded[data-placement='page']`, match no markup until D4-5, so they are not added.
   - D4-1 contains the outline's overflow instead (`.ed-tree { overflow-y: auto }`).
   - D4-1 also does not add `.page:has(> .ed) { overflow: hidden }`. A box with `overflow: hidden` is still a scroll
     container, so `scrollIntoView` can still scroll it. At 390 the rule would also clip, beyond reach, anything that
     overflowed.
5. **`.ed-full-sec-body :is(p, li, blockquote)` lives in `authoring-v2.css`, beside `.ed-full-sec-body`.** The spec
   lists it with the rich editor's rules. Here it applies wherever a section body is drawn (the card, the review
   decision), not only after the editor's chunk has loaded. The spec's third selector,
   `.dcv :is(.ed-full-sec-body) :is(p, li)`, is a strict subset of it and is not repeated.
6. **Kept where the spec's replacement omits them:**
   - `.ed-full-sec { scroll-margin-top: 24px }`: a jump to a section lands clear of the edge.
   - `.ed-full-sec-h { margin-bottom: 12px }`: the title does not sit on the body.
   - `.ed-full-sec-t { flex: 1; min-width: 0 }`: the "Edit" button keeps its place at the right.
   - `.ed-full-sec-body p { margin: 0 0 12px }`: the design system's `p` has `margin: 0`, so without it paragraphs
     lose their spacing.
7. **No `grid-area`.** `.ed-doc { grid-area: page }`, and `.ed-tree`'s `grid-area`, 260px width and dock
   animation, wait for the grid areas, which come with D4-2's bar and D4-5's shell. A `grid-area` that names a missing
   area places the item in an implicit track.
8. **The two `@container artifact` rules.** The container is D4-5's (`.dcv-expanded { container: artifact / … }`,
   §D4.K "Panel and grid"). D4-1 puts the ≤560 values (a 16px gutter, a 22px title) in the existing ≤760px block, so
   390 has them now. D4-5 converts them to the container query.
9. **`.ed-tree-h` keeps its padding and hairline.** The spec's values go with D4-4's collapsed `<details>` basis.

## Not added: §D4.K selectors that no markup uses yet (grep over the D4 paths, 0 files each)

| Selector | Step that adds it |
|---|---|
| `.ed-mast-tools` | D4-6 |
| `.ed-page` | D4-6 |
| `.ed-tools` | D4-6 |
| `.rse-ribbon-more`, `.rse-ribbon-end` | D4-6 |
| `.ed-spark` | D4-2 and D4-6 |
| `.ed-tree-p`, `.ed-req`, `.ed-tree-n`, `.ed-tree-key` | D4-4 |
| `[data-unstarted]`, `.ed-lbl[data-depth]` | D4-4 |
| `.ed-hold`, `[data-placement]` | D4-5 |
| `.ed-note`, `.ed-quiet` | — (no step names a user yet) |

The Panel and grid, Bar, Inspector, Tools, AnA panel, Chip and list, and Menus blocks belong to D4-2 to D4-6.

## Already delivered by D0, so not duplicated

- **Dark `color-scheme`.** `app-v2.css:68–70` sets it on `.c2c-v2.dark`, the shell root, and `.ed` and `.dcv`
  inherit it. The scoped `.c2c-v2.dark .ed, .c2c-v2.dark .dcv { color-scheme: dark }` would restate it.
- **`.scaf-note` and `.nda-open`, globally.** D0 changed both at `app-v2.css:2409` and `:2727–2729`. D4-1 adds only
  what D0 does not: the editor's denser, frameless note, the alert tone, and the hover colour.
- **§4.2.17's three corrections.** They are at `authoring-v2.css:1584` (`.dcv-bar .btn.ed-ico`) and `:1683`
  (`.ct-canvas-pane`, no `border-left`), and D4-1 does not touch them. `.dcv-expanded .ed-full-sec-body` (`:1704`) is
  now subsumed by `.ed-full-sec-body` (`:406`). It is left for D4-5, which rewrites that block.

## Capability kept

| Changed | Where it is now |
|---|---|
| The ribbon's second row (wrapped) | The same controls in one row. The row scrolls (thin scrollbar), every control is in the Tab order, and titles, shortcuts and handlers are unchanged. |
| Outline-basis pill | The same headline, in its tone colour, with the same paragraph under it (now 12px, readable). |
| Document view's 78ch cap | The page's 720px column, the same for section view and document view. |
| Orange active row, masthead code and active section | A soft fill (`--bg-200`), `--text-300`, a `--bg-050` band. The state reads the same; only the colour is quieter. |
| `.page` scrolling to show the outline's overflow | The outline scrolls inside itself, so every part of it stays reachable. |

## Tests and gates (outputs in `green/` and `red/`)

| Check | Result |
|---|---|
| `editorPageCss.test.ts`, new | Red before (`red/editorPageCss.txt`: 10 failed, 1 passed); green after (11/11). |
| D0 guards: `foundationsSentenceCase`, `foundationsOneDefinition`, `foundationsRetiredRatchet`, run with `editorPageCss` | 4 files, 64 tests passed (`green/vitest-d0-guards-and-editorPageCss.txt`). |
| Tests that read the two sheets: `canvasDocumentsList`, `documentCanvasPolish`, `downloadWorkingCopy`, `reviewRoutePhoneWidth`, `tests/ui/ana-rail-phone-drawer` | 5 files, 86 tests passed (`green/vitest-css-pinning-tests.txt`). |
| `tests/ui/one-shell.test.ts` | 8 passed. |
| `ci:undefined-css-classes` | OK. |
| `ci:canvas-path` | Green: all six links. |
| `ci:one-product` | 102 surfaces, 10 rail entries, none new. |
| `ci:check-css-selector-shadowing` | OK: 17 known, 0 new. |
| `ci:check-shell-css-collisions` | OK: baseline 22, no new. |
| `ci:token-contrast` | 131 pairs pass. |
| `ci:token-cascade` | PASS. |
| `ci:surface-text-ramp` | OK, after regeneration. |
| `ci:check-phantom-tokens` | **Fails at `b854c54c2` itself, with or without D4-1** (both runs in a scratch copy of `client/src`, `design-system` and `shared`). The new token is `--danger-000` at `project-home-v2.css:460`, from `bd144ed16` (D2, quality records); it is not D4's. The working-tree output is byte-identical before and after D4-1 (`green/ci-check-phantom-tokens.before-D4-1.txt`). |
| `npx eslint` on `editorPageCss.test.ts` | Clean (0 problems). The describe block was split in two so that neither callback exceeds `max-lines-per-function`. |

## Not done, and why

- **The running app was not opened.** This step was run with no dev server or browser (the session's constraint:
  four shared CPUs). D4.md §0 says each step is "shown working in the running app before the next". These §D4.D and
  §D4.O probes are still owed for D4-1, at 1440 and 390, light and dark:
  - `.rse-body .tiptap p` computes Lora 16px / 27.2px;
  - `.ed-doc-inner` is ≤ 816px wide;
  - `.page.page-full` keeps `scrollTop === 0` after 6s on "2.3 · Quality Overall Summary";
  - the active outline row has no orange;
  - `.ed-dot[data-s=ok]` computes `--success`;
  - the Track changes checkbox renders dark in dark mode;
  - at 390, `.page.scrollWidth <= clientWidth`;
  - the ribbon scrolls inside itself.
- **Before and after screenshots** are not filed, for the same reason.
- **Seen and left to their steps:**
  - When the outline's fixed parts fill the pane, the second `.ed-tree-scroll` (the document list) still gets 0px
    height, as it did before. D4-4's collapsed basis is what makes room.
  - The find bar's children are still 10–11px (`.rse-find-*`; D4-6).
  - The masthead meta line is 12px `--text-400` and reads "1 revisions" (D4-6 deletes it).
