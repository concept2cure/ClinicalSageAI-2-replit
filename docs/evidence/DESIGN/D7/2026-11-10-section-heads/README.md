# A register's sentence is the line under its head, and its dates stay on one line (C18a, 2026-11-10)

Package **D7**. Found while walking C17. The shot behind the reassign sheet showed the SOP register's section head
crowded at 1440 (`shots/before-head-1440.png`):

- "Controlled documents" broke over two lines;
- the sentence ("8 controlled documents: 1 in force, 2 in review, 5 draft; none overdue for review.") broke over two;
- "New controlled document" fell under the status filter;
- the Effective date broke at its hyphen, "2026-" over "11-10".

## What already exists

- **D0's section lead** (`client/src/concept2cure/v2/styles/app-v2.css`, `[data-work-area] .pj-sec-h`). It holds the
  heading, a short count in `.sec-sub` beside it, and the actions on the right. Its own note says the standalone
  `p.sec-sub` is "the line a view puts under its lead".
- **The three registers' figure lines**, all inside the head as `<span className="sec-sub">`:
  - `SopRegister.tsx` (`qms-register-figures`), from C1;
  - `ChangeControl.tsx` (`change-figures`), from C8;
  - `QmsRecords.tsx` (`qms-record-figures`), from C12.

  Each is a full sentence, not a count.
- **`tbody.qms-rec td:not(.qms-title) { white-space: nowrap }`** (`quality/app.css`) keeps the records registers'
  cells on one line. The SOP register's date cells had no such rule, because they also hold lines that should wrap
  (the pending effective date, the last review).

Nothing new: no screen, route or table. The only addition is one CSS rule, `.qms-when`, on the two date texts.

## What changed

| | Before | After |
|---|---|---|
| The register's sentence | a `span.sec-sub` inside `.pj-sec-h`, beside the title and actions | a `p.sec-sub` directly under the head, D0's line. All three registers: SOP, Change control, and the records (CAPA, deviations, nonconformances, suppliers, audits, management reviews). Its words, test ids and arms are unchanged. |
| The SOP register's dates | the Effective and Next review dates broke at the hyphen | the date text is `.qms-when` (`white-space: nowrap`). The pending and last-review lines under it still wrap. |

## Tests

- `QualityWorkArea.test.tsx`:
  - the SOP sentence is a `P` directly after `.pj-sec-h`;
  - the row's dates are `.qms-when`.
- `ChangeControlProject.test.tsx`: the change sentence is a `P` directly after `.pj-sec-h`.
- `QmsRecords.test.tsx`: the CAPA sentence is a `P` directly after `.pj-sec-h`.

`red.txt`: the four assertions fail before the change. `green.txt`: Quality's suites, AnA's wave-4 and project home's
Quality, 30 files and 373 tests. The typecheck is clean.

## Walked in the running app

`w24-section-head.cjs` (`shots/w24-section-head.log.json`) ran as the approver, with no API or page errors.

| | Title | Actions | Sentence | Dates | Page scrolls sideways |
|---|---|---|---|---|---|
| 1440 (`shots/w24-sop-1440.png`) | one line, top 308 | filter and "New controlled document" on its row (303, 305) | under it (347) | one line (16px) | no |
| 1280 | one line | on its row | under it | one line | no |
| 390 (`shots/w24-sop-390.png`) | one line | wrapped below the title, by D0's phone rule (319, 351) | under them (391) | one line | no |

Change control and CAPA show the same at each width.

Run it from this folder with `NODE_PATH=$(npm root -g) node w24-section-head.cjs`. It needs `WALK_PASSWORD` and a
running server.
