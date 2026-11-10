# The SOP register is the product's table (C6, 2026-11-10)

Package **D7**. Sweep item C6 (`sweep-plan`, finding `rows-1`): the controlled-documents register in Quality was a
column of hand-laid `div` rows under a `div` "header". The product's registers are D0's `.reg-tbl`, a real table with
column headers. This commit renders the register as that table, keeping each row's one next step and its More.

## What already exists

- `client/src/concept2cure/v2/styles/**`: D0's `.reg-tbl`, including the phone rule
  `[data-work-area] .pj-sec > .reg-tbl { display:block; overflow-x:auto }` at max-width 640. It is reused, not copied.
- `client/src/concept2cure/quality/SopRegisterRow.tsx` (split from `SopRegister.tsx` earlier today, same folder): the
  row's next step (`nextStepOf`), its actions (`actionsOf`), who may approve (`approvableBy`) and overdue
  (`canBeDue`). Unchanged. Only its markup moved from `div` cells to table cells.
- `client/src/concept2cure/quality/SopRegister.tsx`: the register section, its filter `.seg`, its figure line, its
  empty and failed states. Unchanged except that the list is now `<table>`.
- `.rd-chip`: the shared status chip, used for "In force" and the status.

Nothing new: no new component, route, table or screen.

## What changed

| | Before | After |
|---|---|---|
| Register | `div.qms-table` with a `div.qms-thead` of labels and `div.qms-row` rows | `<table class="reg-tbl qms-reg">` with eight `<th scope="col">`: Number, Title, Type, Version, Status, Effective, Next review, and a visually hidden "Actions" |
| A document | one `div.qms-row` | one `<tbody class="qms-doc">` per document: its row, and when More is open a second row spanning all columns that holds the other actions (`role="group"`, named "Actions for …") |
| Status | "In force v1.0" and the status as private pills | `.rd-chip` (`tone-ok` for "In force: v1.0"; the status's tone from one `STATUS_CHIP` map) |
| Row styling | `.qms-row` rules, including one that faded a retired or superseded row to 60% | the table's own rules (`.reg-tbl.qms-reg`). The fade and the More band are deleted; a retired or superseded document says so in a `tone-dim` chip. The base `.qms-row` rules stay until the change log (C8) and the records (C11) become tables. |

## Walked in the running app

The server ran against a migrated local database (`deploy-migrate`) with `RLS_ENFORCE=on` and
`LAUNCH_SCOPE_ENFORCE=on`. The walk signed in as the author and as the approver, through the real login.

| Walk | Width | Result |
|---|---|---|
| `w4-rows.cjs` (light) | 1440 | Row height 61, closed, and 62 with More open. The table does not scroll. The document does not scroll sideways. No API or page errors. |
| `w4-rows.cjs` (light) | 390 | The table scrolls inside its section (513 px for the author, 485 for the approver), as D0's phone rule intends. **The document does not scroll sideways (0).** |
| `w10-dark.cjs` | 1440 and 390 | `body[data-theme=dark]`. Cells `rgb(232,230,220)`, headers `rgb(176,174,165)`, More band `rgb(43,43,41)`. The document does not scroll sideways at either width. |

### A defect the walk found, and its fix

The first walk at 390 had the whole page scrolling sideways by **323 px** (`w9-overflow.cjs`): the document's
scroll width was 713 against a body of 390. The cause was the visually hidden "Actions" header. `.sr-only` is
absolutely positioned. The table was not positioned, so the header's containing block was an ancestor outside the
table's own scroller, and the header, placed at the table's far right edge, widened the page. `quality/app.css` now
makes the table its containing block (`.reg-tbl.qms-reg { position: relative }`). After that change,
`w9-overflow.cjs` reports a document scroll width of 390 against 390.

## Tests

- `QualityWorkArea.test.tsx`: the register is a `table` whose column headers are exactly the eight above, with one
  `tbody` per document. Seen red before the change (`red.txt`: "Unable to find an accessible element with the role
  'table'").
- The register's existing cases now find a document by its `tbody` instead of the deleted `.qms-row`, and the
  in-force chip by its words "In force: v1.0". `SopRegisterApproval`, `SopRegisterInForce`,
  `SopRegisterPersonalTraining`, `qmsReviewRoute` and `qmsReviewRouteRR2` are updated this way.
- `green.txt`: the Quality suites, 28 files and 337 tests, pass.

## Files

- `w4-rows.cjs`, `w9-overflow.cjs`, `w10-dark.cjs`, `lib.cjs`: the walks. Run them from this folder with
  `NODE_PATH=$(npm root -g) node <walk>.cjs`. They need `WALK_PASSWORD` and a running server.
- `shots/`: the walks' logs (`*.log.json`) and screenshots, 1440 with More open, 390 closed and open, and dark at
  both widths.
