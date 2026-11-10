# D4-4: the outline, on demand (2026-11-09)

**The spec.** `.design/claude-convergence/D4.md` §D4.C. The outline is a quiet list that appears when asked for, like
Claude's sidebar: no badges, a soft fill for the current item, and the explanation one click away.

**Before.**
- The outline was always on, a 220 px column, and beside the conversation it took 220 of the panel's 776 px.
- Its basis was a paragraph above every row.
- Every required node that was not started carried a REQUIRED pill: 52 on C2C-101's IND.
- Unstarted rows were dimmed to opacity 0.62.

D4-4 comes before D4-5 in D4's build order. It is what lets D4-5 give the conversation its 420 px without squeezing
the page.

## What already exists (RULE 3)

- **`editor/DocumentWorkbench.tsx`, `aside.ed-tree`.** Its parts:
  - the header (project and module line, title, meta, status filter);
  - `FilingMarkets`;
  - the outline-basis band (`describeRulePackProvenance`);
  - the governed filing outline (`useFilingOutline`, `startOutlineSection`, `outlineReadState`);
  - `FilingGaps`;
  - the document and section list.

  D4-1 had already given the rows their type and the soft active fill, and coloured the drafted dot. D4-2 had moved
  the project line (`.ed-tree-p`) out of the crumbs.
- **The rail Escape effect** in the same file, and **`editor/canvasFocus.ts` `useCanvasEscape`**, which yields to a
  workbench rail.
- **`styles/authoring-v2.css`:** the `.ed` grid, the outline block, the phone block, and the `.dcv-workbench` rules
  for the panel.

Nothing new is added. No file, route or table. The changes are to state, markup and CSS in those files.

## The change

| Part | Now |
|---|---|
| **State** | The choice is remembered under `c2c.editor.outline` (`initialOutline`, `OUTLINE_KEY`). With nothing remembered, the outline opens on the page at 1280 px and wider, and stays closed beside the conversation. It is held open while no document is open, because then it is the list. |
| **Toggle** | First in the bar (`I.panelLeft`), with `aria-controls`, `aria-expanded` and "Show the outline" or "Hide the outline". It is disabled while the outline is held open. |
| **Outline** | `<aside id hidden aria-label="Outline">`, now 260 px (§D4.K). The root `.ed` carries `data-outline`; with the outline closed the grid drops its column, the phone layout included. |
| **Beside the conversation** | The panel (`.dcv-workbench`) is a size container, `artifact`. Under 900 px the outline floats over the page, 280 px, and an open rail floats too. Escape closes the floating outline first (`outlineOverlays`) and returns focus to the toggle, and the canvas yields that Escape. |
| **Basis** | `<details>`: "{headline} · About this outline", with the paragraph one click away. FilingMarkets keeps its band. |
| **Rows** | A ring with "required" for screen readers (`.ed-req`, `.sr-only`) in place of the pill. Unstarted rows carry `data-unstarted` and use `--text-300` at full opacity. A top-level label is weighted by `data-depth`. The drafted dot reads "drafted" to a screen reader. A document row's count is a quiet number (`.ed-tree-n`). |
| **Key** | "required, not started · drafted", at the foot of a filing outline. |
| **Focus** | After a market's editing copy is created, focus goes to the bar's title (`.dcv-bar-t`), which is always on screen; it used to go to the outline's title. |

**Kept, unchanged:**
- Every row's click, its start-on-click (F4) and its tooltip and accessible name ("…, required, not started").
- The filings band, the gaps, the status filter, and the unbound and unread notes.

## Red, then green

**Red at HEAD** (`red-at-head.txt`). Three new cases in `__tests__/outlineStartsSection.test.tsx` fail:

| Case | Failure |
|---|---|
| Open at 1280 and wider; the toggle hides and remembers | `data-outline` absent |
| Closed when narrower, held open with no document | the outline not hidden |
| A ring, not a pill; nothing dimmed | `'2.5Clinical overviewrequired'` matches /required/ |

**Tests updated, in this commit, because they pin names D4-4 changes:**
- `outlineProvenanceVisible` finds "About this outline", where it found "outline basis".
- `filingOutlinePerMarket` expects focus on the bar's title, and checks its text.
- `documentCanvas` opens the outline with its toggle beside the conversation, as a person would, and clears the
  remembered choice after each case.

**Green** (`green.txt`):
- The 117 suites that render the editor, the canvas or the thread, or read its stylesheet: 1,386 of 1,386.
- The ten suites this change touches directly, rerun on their own afterwards: 145 of 145.

In an earlier full run `workbenchRemedies` timed out once, on a 5-second `findBy` under the parallel load. It passes
alone, 12 of 12, and is not touched here.

**Gates:**
- `ci:check-css-selector-shadowing`, `ci:check-shell-css-collisions`, `ci:undefined-css-classes`,
  `ci:surface-text-ramp` and `ci:design-system` pass.
- ESLint warnings per file equal trunk's: DocumentWorkbench 12, canvasFocus 0.

## In the running app

The walk stack (`aba641b533`'s archive) ran with `client/src` and `shared/` copied from this tree. The scripts are
`d44-outline.cjs` and `d44-filing.cjs`; the measurements are in `d44-outline.json` and `d44-filing.json`. Visibility
is by `elementFromPoint`.

| Case | Default | After the toggle | After a reload |
|---|---|---|---|
| Page 1440 light | open, 260 px, page 916 px | hidden, page 1176 px, focus on the toggle | still hidden |
| Page 1440 dark | the same | the same | the same |
| Page 390 | closed | open (the phone layout's top row) | still open |
| Beside the conversation, 1440 | closed (panel 776 px) | open, floating, 280 px, `position: absolute` | Escape closes it, focus returns to the toggle, and the canvas stays open |

**C2C-101's IND filing copy** (`filing-1440-light.png`, `filing-1440-basis-open.png`). The copy was created by
"Create editing copy" in the walk database, which is local.
- 105 rows, 52 of them rings, and all 52 read "required" to a screen reader.
- No row shows "required" on screen, and none is dimmed by opacity.
- 92 rows are `data-unstarted`.
- The basis reads "Harmonised standard · About this outline", closed, and opens to the ICH M4 paragraph.
- The key is at the foot.
- The active row is `rgb(232, 230, 220)` in light and `rgb(61, 61, 58)` in dark, not orange.

**What this is not.**
- It is not D4-5. The canvas still draws its own bar above the workbench's, and the conversation is still 400 px at
  1440. With the outline closed beside the conversation, D4-5 can now take the conversation to
  `clamp(420px, 38%, 560px)`.
- The 260 px outline and the floating rail in a narrow panel are §D4.K's values.
