# The quality records registers are the product's table (C11, 2026-11-10)

Package **D7**. Sweep item C11 (findings records-1, records-2 and records-7, and the records' parts of the table, chip,
button and accent findings) covers six registers: CAPA, deviations, nonconformances, suppliers, internal audits and
management reviews. Before this change they were one component (`QmsRecords.tsx`) that drew every row as a `div` on a
private grid, with a fixed 230px column holding every action. Each action was an arrow chip, and "Ask AnA" was a
sparkle. Each pill was amber for any state in progress. The grid was wider than the pane, so at 1440 the action column
was scrolled out of the box.

## What already exists

- `SopRegisterRow.tsx` `RegisterTable` and `RegisterBody` (C6 and C8): D0's `.reg-tbl` with its column headers and a
  hidden "Actions" header. One record is one `<tbody>`, holding its next step, its More and the row More reveals. The
  SOP register and the change log already render through them. The records now do too.
- `qmsRegisterKit.tsx`: the register configuration and the `pill` helper, which every register's states go through.
- D0's `.rd-chip` with its `tone-ok`, `tone-warn`, `tone-err` and `tone-dim` tones.

Nothing new: no component, route or table. `registerGrid.ts` and its test are deleted, because no caller is left
(`registerRowMinWidth` existed only to give the private grid a minimum width).

## What changed

| | Before | After |
|---|---|---|
| A register | `div.qms-table`, a `div.qms-thead` of labels, and `div.qms-row` rows on an inline grid with a computed minimum width | `<table class="reg-tbl qms-reg">` with column headers, and one `<tbody class="qms-rec">` per record |
| A row's actions | every applicable action as an arrow chip, plus a sparkle "Ask AnA" | the first applicable action is the row's next step, a `btn ghost small`. **More** holds the rest and "Ask AnA" as text. |
| A record's detail (CAPA action items, a review's actions) | a panel under the row | the record's own row, spanning every column |
| States | `qms-pill`, amber for every state in progress | `.rd-chip`, through `pill`. Effective is ok, a failure red, a warning amber, and an ended record dimmed; a state in flight is neutral. A new `warn` tone marks a major deviation and a conditionally approved supplier. |
| Sources, criticality, action types | `qms-tag` | `.rd-chip` |
| Phone | a date broke at its hyphen across two lines | prose columns (`text: true`) wrap at a readable width, and a row's facts stay on one line |
| Management reviews | a column named "Actions" (its decided actions) beside the row's own Actions column | "Action items": a screen reader hears each column name once |

Each register names its rows (`name`) for More's accessible names. Its `grid` is gone. These are deleted from
`quality/app.css`:

- `.qms-table`, `.qms-thead`, `.qms-row`, `.qms-cell`;
- `.qms-pill` and its tones, `.qms-tag`;
- the second declaration's comment on `.qms-rowacts`.

## Tests

`QmsRecords.test.tsx`:

- A register is a table. Its headers start with the number and end with Actions. There is one `tbody` per record,
  "Ask AnA" is under More, and none of the old classes remain.
- No register has a column named "Actions", and no register repeats a column name.
- Every row action the existing cases use is reached through `openMore()`. A state is found as an `.rd-chip`, and a
  row as its `tbody`.

`red.txt` has two runs:
- the new cases against the code before C11: three fail;
- the column-name guard with management reviews' column named "Actions" again: it fails.

`green.txt`: Quality's suites and AnA's wave-4 suite, 28 files and 351 tests. The six `registerGrid` cases went with
the file.

## Walked in the running app

The walk's organisation had no quality records. So one of each was raised through its own create form, as a person
would, in `w18-seed-records.cjs`. Each answered with its confirmation toast, for example "DEV-C11-76213 was recorded as
open." A CAPA belongs to a project. Its form said, honestly, "No project is open. A CAPA belongs to a project: open one
from Projects first; nothing here is recorded until then." So `w18-project.cjs` created one through the intake's own
calls, and `w18-capa.cjs` opened it the way a link does (`?program=`) and raised `CAPA-2026-0001` through the form.

`w18-records.cjs` (log: `shots/w18-records.log.json`) ran as the approver, with the project open, at 1440 and 390. It
recorded no API or page errors.

| Width | Result |
|---|---|
| 1440 | All six registers are tables. Rows are 49 to 58px, none of the table scrolls, and **the action column is in view in every register**. |
| 1440, next steps | CAPA: Advance (More: Add action, Ask AnA). Deviation: Investigate (More: Cancel deviation, Raise CAPA, Ask AnA). Nonconformance: Disposition. Supplier: Update (More: Approval, Raise CAPA, Ask AnA). Audit: Update. Review: Add action. |
| 1440, chips | A major deviation is amber ("Major"); open and planned states are neutral. |
| 390 | Each table scrolls inside its section, and the page does not scroll sideways. Rows are 49 to 77px, against up to 152px before the wrap fix. A date stays on one line (`shots/w18-capa-390.png`). |

Screenshots in `shots/`: CAPA at 1440 and 390, deviations at 1440 and 390, and suppliers at 1440, each with its More open.

## Files

The register walk is `w18-records.cjs`. Its setup is `w18-seed-records.cjs`, `w18-project.cjs` and `w18-capa.cjs`,
which write real records through the product's forms and routes. `lib.cjs` is beside them. Run them from this folder
with `NODE_PATH=$(npm root -g) node <walk>.cjs`. They need `WALK_PASSWORD` and a running server. `w18-capa.cjs` and
`w18-records.cjs` name the project `w18-project.cjs` created.
