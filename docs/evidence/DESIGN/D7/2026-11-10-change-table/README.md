# The change log is the product's table, with one next step per change (C8, 2026-11-10)

Package **D7**. This is sweep item C8. The change-control log in Quality was a column of `div` rows laid out on a
private grid. Each row carried four controls:

- an "Advance" chip with an arrow icon;
- an "Approve" chip with a check icon;
- a sparkle-only button that asked AnA;
- a link-count button tinted in the accent colour on hover.

Its class, status and type were three private pill styles. The log is now D0's table, as the SOP register became in C6.

## What already exists

- `client/src/concept2cure/quality/SopRegisterRow.tsx` (C6): the SOP register's table and its row's next step and
  More. Its table and one record's body become two shared pieces in the same file, `RegisterTable` and
  `RegisterBody`. The SOP register and the change log both render through them. No new file.
- D0's `.reg-tbl`, `.rd-chip` and `.btn ghost small`, with the `.qms-reg` table rules C6 added in
  `quality/app.css`.
- The log's handlers (`openDrawer` advance and link, `setApproving`, `onAsk`), the linked-records detail and the stage
  filter are all unchanged.
- The two-person rule for a change's approval: `server/services/qms/change-approval-signature.ts` refuses the
  proposer.

Nothing new: no new component file, route, table or screen.

## What changed

| | Before | After |
|---|---|---|
| The log | `div.qms-table` with a `div.qms-thead` of labels, and `div.qms-row` rows on an inline grid with a minimum width | `<table class="reg-tbl qms-reg">` with eight column headers: Number, Title, Type, Class, Status, Target, Links, and a visually hidden Actions. Each change is one `<tbody class="qcc-change">`. |
| Next step | Advance and Approve side by side, with icons | One `btn ghost small`, with no icon. Approve while the change is under assessment, for anyone but its proposer. Otherwise Advance, when the server lists a move. |
| More | none; a sparkle-only "Ask AnA" | **More** reveals the rest as text buttons: Advance (when Approve is the step), Link a record, and Ask AnA. |
| Linked records | its own panel under the row, with its own "Link a record" | a row of the change's own body, spanning every column. "Link a record" is under More, so it is one door. |
| Chips | `qcc-class`, `qms-pill`, `qms-tag` | `.rd-chip`. The class is red when critical, amber when major, and neutral when minor; green would read as "fine". The status is green when closed, red when rejected, dimmed when cancelled, and neutral in flight, as in the SOP register. The type is plain text. |
| Link count | accent colour on hover | quiet, `--text-100` on hover |
| Phone | the grid scrolled inside a boxed table | the table scrolls inside its section. A change's More and its linked records stay pinned in view while it scrolls (walked). |

The chip tones live in `changeData.ts` (`STATE_TONE`, `CLASSIFICATION_TONE`), whose only reader is the log. They now
hold D0's tones, so there is no second map. `.qcc-class` and its three tones are deleted from `quality/app.css`.

### The proposer is not offered Approve

The walk showed the author "Approve" on a change they had raised. The server refuses that approval under the
two-person rule, so the button could only be refused. The SOP register already offers Approve to anyone but a
document's author (`approvableBy`). The change log now does the same, from the `proposed_by` the register read
already returns (`changeHooks.ts`, `changeData.ts proposedBy`).

## Tests

- `ChangeControl.test.tsx`:
  - the log is a table with the eight column headers, one body per change, and the shared chips; none of the old
    classes remain;
  - each change shows its one next step and More, and the rest are behind More (under assessment, proposed, closed).
- `qmsGovernedActions.test.tsx`: Advance and Link a record are reached through the row's More.
- `ChangeControlApproval.test.tsx`: Approve is offered to anyone but the proposer.
- `anaDrivesWave4.test.tsx`: AnA's open-change and filter actions still find the expanded change (unchanged and green).

`red.txt` has two runs:

- The new tests against the code before C8: four fail.
- The proposer case with only its check disabled: it fails, because the author is offered Approve.

`green.txt`: Quality's suites and AnA's wave-4 suite, 29 files and 348 tests.

## Walked in the running app

The server ran with `RLS_ENFORCE=on`. The walks signed in through the real login.

| Walk | Result |
|---|---|
| `w11-change.cjs`, 1440 light and dark | Rows are 49 px, cells 13 px. The table does not scroll, and neither does the page. No old classes. More shows "Link a record" and "Ask AnA". Opening a change shows its linked records as its own row. No API or page errors. |
| `w11-change.cjs`, 390 | The table scrolls inside its section (523 px). The page does not scroll sideways. |
| `w13-detail-390.cjs` | At 390, with the table scrolled 300 px, the change's More row and linked records stay inside the section (16 to 342 px of a 16 to 374 px section). Before the fix the hint ran past the right edge. |
| `w14-proposer.cjs` | The change under assessment: the author who raised it sees Advance and More. The approver sees Approve and More. |

Screenshots in `shots/`: an open change at 1440, at 390 and in dark, and at 390 with the table scrolled.

## Files

The walks are `w11-change.cjs`, `w13-detail-390.cjs` and `w14-proposer.cjs`, with `lib.cjs`, and their logs are in
`shots/`. Run them from this folder with `NODE_PATH=$(npm root -g) node <walk>.cjs`. They need `WALK_PASSWORD` and a
running server.
