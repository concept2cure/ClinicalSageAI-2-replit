# The editor's ribbon fits on one row: More formatting, and AnA's actions as icons (D4-6, 2026-11-09)

**The finding.** J3 human test R1 (`docs/evidence/HUMAN-TEST/J3/README.md`): "At 1440 px the ribbon's **Comment** and
**Track changes** sit past its right edge; the ribbon scrolls sideways." The walk left it to D4 as a layout decision.
D4's spec had already made that decision: §D4.D item 4, the ribbon of D4-6, which nobody holds and the founder has not
held.

## What already exists (RULE 3)

**The ribbon.** `editor/RichSectionEditor.tsx` has one scrolling row of about thirty controls. Its scoped CSS is in
`styles/rich-section-editor.css`. The CSS comment there names this step: "until D4-6 moves the second group under
'More formatting' and the AnA actions become icons, the end of the row is past the edge at 1440 px".

**The button.** `RB` already gives every control its accessible name from its title, plus any word label
(`visibleLabel`). So an icon-only control keeps the exact name its text gave it.

## The change, as D4.md §D4.D item 4 specifies

**Row 1.** Paragraph style · Bold, Italic, Underline · Bullet, Numbered · Link, Cite, Cross-reference, Table, with
the table operations while the cursor is in a table · Undo, Redo, Find & replace · **More formatting** ⌄.
- Pushed right (`.rse-ribbon-end`) are AnA's three actions as icons, then the suggestions chip and Track changes:
  - Ask for a source (book);
  - Offer alternatives (✻);
  - Comment (speech bubble).

**Row 2,** "More formatting" (`.rse-ribbon-more`, a second toolbar, shown only when asked):
- Superscript, Subscript, Highlight;
- Align left, centre and right;
- Image, Caption, Insert symbol.

**What stays the same.** Every control keeps its title, shortcut, handler and accessible name. No control is
removed.

**CSS.**
- `.rse-ribbon-more[hidden]` hides row 2. The base `.rse-ribbon` is `display: flex`, which would otherwise beat the
  attribute.
- `.rse-ribbon-end` pushes the group right.
- Inside `.ed` the row's side padding went from 8 to 4 px, so the row fits the page exactly.
- The scrollbar stays thin for narrower columns, where the row still scrolls inside itself. That is a deliberate
  deviation from the spec's `scrollbar-width: none`: a hidden scrollbar would hide the controls that remain past the
  edge.

**Tests that pin moved names** (§D4.L), updated in this commit:
- `richSectionEditorAuthoring` and `captionsInCanvas` now open More formatting before they use Superscript,
  Subscript, Insert symbol or Caption.
- `richSectionEditorAuthoring` also checks that Superscript is not shown until More formatting is opened.

## Measured on the real component

`measure-ribbon.cjs` drives Chromium (Playwright) against a throwaway page. The page mounted the real
`RichSectionEditor` with the props the workbench passes: AnA actions, track changes, comments, images,
cross-references and citations. It sat inside the editor's own `.c2c-v2 .ed` scope, with the design-system tokens,
`index.css`, `app-v2.css`, `authoring-v2.css` and `rich-section-editor.css`, at a set column width. The page was not
committed. It was the file `client/src/ribbonProbe.tsx`, served by Vite.

| Case | Before: row width / column | After: row width / column | Comment and Track changes in view |
|---|---|---|---|
| 1440, 816 px page (`.ed-doc-inner`'s maximum, §D4.D) | 1351 / 816, overflows | **813 / 816, fits** | before: no; **after: yes** |
| 1440, 816 px, dark | 1351 / 816 | **813 / 816** | before: no; **after: yes** |
| 1440, 720 px column | 1351 / 720 | 813 / 720, scrolls inside itself | after: Comment yes, Track changes past the edge |
| 390 | 1351 / 358 | 813 / 358, scrolls inside itself; the page does not scroll sideways | no (scrolls) |

- **Row height.** Row 1's `offsetHeight` is 41 px at 1440, within the acceptance's 44.
- **More formatting.** Opening it shows row 2 with Superscript (`after-1440-more-open.png`).
- **Files.** `before.json` and `after.json` hold the figures, with a screenshot for each case.

**What this is not.** It is not the running-app walk. The page measured the real component and its real CSS at the
spec's page width. The workbench at 1440 can make the column narrower than 816 when a side rail is open, and there the
row scrolls as it does at 720. The 1440/390 walk of the editor in the seeded app remains with the running-app
acceptance (D4.O).

## Gates

- **Client suites that render the editor or the ribbon:** 81 files, 1,075 cases. The one failure is
  `anaDrivesWave4`'s credential-drawer case, which fails the same way on trunk.
- **CSS:** `ci:undefined-css-classes`, `ci:phantom-tokens` and `css-shadowing` are OK.
- **ESLint:** no change in warnings on the touched files.
