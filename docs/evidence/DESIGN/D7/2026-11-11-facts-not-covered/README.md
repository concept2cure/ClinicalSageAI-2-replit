# P-122 · Quality: a record's actions no longer cover its facts, and every register's tab is in view (D7, 2026-11-11)

Package **D7**. Found walking the merged Quality (w36). Two changes met in a merge on 2026-11-10:
- this lane's review repairs;
- the P-122 restoration (`docs/evidence/DESIGN/P-122/quality/`), which put each row's actions inline again, pinned
  at the register's right edge, and added the Complaints and MDR tab.

Nobody had opened the combined screen. P-122 rule 2 says nothing a screen showed is hidden, and the walk found two
places where it was.

## What the walk measured

1. **The pinned actions covered the last columns** (`shots/w37-covered-cells.before.log.json`).
   - The content column is 1040 px (D0's `.page-inner`). A register with its actions in the row is wider: the
     controlled documents 1083, the change log 1070, the suppliers 1209.
   - So the actions, pinned at the right edge, always sat on top of something:

     | Width | What was covered |
     |---|---|
     | 1440 | the "Next review" and "Links" headers; "not all read" in the suppliers' and deviations' CAPA column |
     | 1280 | every document's Effective and Next review dates; every change's Target and Links; on all rows |
     | 1024 | the Status of every document, change and deviation; the Disposition of every nonconformance |

   - Nothing said the table scrolled sideways (`shots/before-sop-register-1440.png`,
     `shots/before-change-control-1440.png`).
2. **A register's tab was cut off** (`shots/probe-tabs.before.log.json`). Nine tabs are 1072 px in a 1040 px column.
   - At 1440 and 1280 "Management reviews" was cut ("Management revie").
   - At 1024 four registers were out of sight.
   - The row scrolls, with its scrollbar hidden, so nothing said there was more.

## What already exists

- **The register table**: `RegisterTable` and `RegisterBody` (`client/src/concept2cure/quality/SopRegisterRow.tsx`).
  - C6, C8 and C11 made the registers D0's table.
  - P-122 (`177427772`) put two governed actions, Ask AnA and More inline in a last "Actions" column.
  - Its walk fix (`e1bcf105e`) wrapped the table in `.qms-reg-scroll` and pinned that column from 641 px up, so a wide
    register no longer clipped its actions.
- **The More line**: a record's other actions already open on a line of their own, under its facts, kept in view on a
  phone (`.qms-row-more`, C8).
- **The tabs**: D0's `.tabs` (`v2/styles/app-v2.css`), one scrolling row; Quality's nine (`quality/App.tsx`, `TABS`).

Nothing new: no screen, route or component. The inline actions, their order and their handlers are P-122's,
unchanged.

## What changed

| | Before | After |
|---|---|---|
| A record's actions | a last table column, pinned at the right edge over the facts | the line under the record's facts (`tr.qms-row-acts-tr`), left-aligned, wrapping where it must. The table has no actions column |
| A phone | the actions scrolled away with the row (x ≈ 700–1000 at 390, w35) | the line stays in view while the facts scroll sideways, as the More line does |
| A record's rows | a rule between the facts and More | one band: no rule inside a record, and the whole record takes the hover |
| The tabs, 641 px and up | one scrolling row, the last cut off | every register named: one line at 1440 (a 9 px inset, no gap), balanced rows where they do not fit (`text-wrap: balance`), never one tab alone |
| The tabs, a phone | one scrolling row | unchanged (D0's) |

## Tests

- `quality/__tests__/registerRowInline.test.tsx`, "puts a record's actions on their own line under its facts, so they
  cover none of them":
  - the headers are the register's columns, with no "Actions";
  - the facts row has one cell per column and no action in it;
  - the actions row and the More row each span every column.
- The three register contract tests (`ChangeControl`, `QmsRecords`, `QualityWorkArea`) expect no "Actions" header.
- The inline-action tests read a record's facts line and actions line together; their expectations are unchanged.

`red.txt`: the four cases fail before the change. `green.txt`: Quality's 31 suites, 405 tests. The CSS gates pass, and
the generated text ramp was regenerated.

## Walked in the running app

All ran as the approver, with no page error and no failed read.

- **`w38-facts-and-actions.cjs`** (`shots/w38-facts-and-actions.log.json`): every register, at 1440, 1280, 1024 and
  390; 32 tables measured.
  - At 1440 and 1280: no fact outside its box, no sideways scroll, in any register.
  - At 1024 and 390: the trailing columns scroll inside the register's own box (D0's rule). Nothing covers them, and
    the page does not scroll.
  - At every width: every record's actions are inside the viewport.
- **`probe-tabs.cjs`** (`shots/probe-tabs.after.log.json`): no tab cut off at 1440, 1280 or 1024
  (`shots/after-tabs-1440.png`, one line; `shots/after-tabs-1280.png`, two rows of five and four).
- **Shots**: `shots/after-sop-register-1440.png` (all seven columns, Next review included);
  `shots/after-change-control-1280.png` (Target and Links readable, the actions under each change);
  `shots/after-change-control-390.png` and `shots/after-sop-register-390.png` (the actions in view on a phone);
  `shots/after-suppliers-1280.png`.

Run them from this folder with `NODE_PATH=$(npm root -g) node w38-facts-and-actions.cjs` (and `probe-tabs.cjs`,
`w37-covered-cells.cjs`). They need `WALK_PASSWORD` and a running server. `w37` measures the pinned column, so on this
commit it reports nothing covered.

## Still open

- At 1024 the suppliers register's facts are 250 px wider than its box and scroll inside it. Its columns are the
  server's fields; narrowing them means wrapping dates or dropping a column, which hides a fact.
- A record now takes two lines. With 100 CAPAs the register is about twice as tall as with one line per record. The
  alternative was the covered columns above.
