# CAPA and review action items are a table, and their moves are named by the act (C13, 2026-11-10)

Package **D7**. This is sweep item C13, finding records-8, plus the `.qcc-action` part of the sections finding and the
last use of `.qms-chip`.

Opening a CAPA, or a management review, showed its action items as a list of bordered cards. Each card's moves were
chips labelled with the state they lead to: "Done", "Blocked", "Cancelled". That reads as a status, not a choice.

## What already exists

- `CapaActions.tsx` and `ReviewActions.tsx`: the action items, their moves (`actionMoves`, from the server's
  `ACTION_TRANSITIONS`), the forms that record a move with its evidence or reason, and the review's closure note.
- D0's `.reg-tbl`, `.rd-chip` and `.btn ghost small`, and the `pill` helper (C11).
- The record's own row, which holds the detail since C11.

Nothing new: the components keep their reads, writes and forms; only their markup and labels change.

## What changed

| | Before | After |
|---|---|---|
| Action items | `ol.qcc-actions` of bordered cards (`.qcc-action`) | `table.reg-tbl`, named "Action items of CAPA-…" or "…of the H2-… management review", with columns #, Type (a chip), Action, Owner · due, State (a chip) and a hidden "Moves" |
| CAPA moves | `qms-chip` buttons named by the state reached: Done, Blocked, Cancelled | `btn ghost small`, named by the act: **Start**, **Resume** (from blocked), **Mark done**, **Mark blocked**, **Cancel action**. Each one's accessible name says which action it moves, for example "Mark done: action 1". The form's title keeps the state, for example "Action 1: Done". |
| Review moves | a "Close" chip | **Close**, named "Close action 1" |
| The review's heading | "Actions" | "Action items", as its register column has been since C11 |
| CSS | `.qcc-actions`, `.qcc-action`, `.qcc-action-desc`, `.qcc-action-meta` and Quality's own `.qms-chip` | deleted; the table takes three scoped rules |

`v2/__tests__/shellButtonResetYields.test.ts` pinned `.qms-chip` as a button Quality styles itself. It now names
`.qms-btn` alone, the last one, until C18.

## Tests

`QmsRecords.test.tsx`:

- A CAPA's action items are a table named "Action items of CAPA-007", with the six column headers.
- An in-progress action offers "Mark done", "Mark blocked" and "Cancel action", by its act and its number. No button
  is named by a state, and neither the card list nor `.qms-chip` remains.
- A review's actions are a table, and its open action is closed through "Close action 1".

`red.txt`: both cases fail against the code before C13. `green.txt`: Quality's suites, AnA's wave-4 suite and the
shell's button-reset suite, 29 files and 356 tests.

## Walked in the running app

`w19-action-items.cjs` (log: `shots/w19-action-items.log.json`) ran as the approver, with the walk project open, on
the CAPA and the management review raised in C11. It recorded no API or page errors.

1. CAPA: the walk used More, then Add action. The toast said "Action 2 was added to CAPA-2026-0001." Opening the CAPA
   showed a table with one header row and one body: action 2 "Planned", with **Start** and **Cancel action**. Start
   was recorded, and the toast said "Action 2 is in progress." The row then offered **Mark done**, **Mark blocked** and
   **Cancel action** (`shots/w19-capa-items-1440.png`).
2. The management review: the walk used Add action, the row's next step. The toast said "Action 1 was added to the
   H2-… review." Opening it showed a table, action 1 "Open", and its **Close**
   (`shots/w19-review-items-1440.png`).
3. No `.qcc-actions`, `.qcc-action` or `.qms-chip` remains on the page.

## A red outside this change

`v2/__tests__/projectCreationDoors.contract.test.ts`, the case "v2/surfaces/Vault.tsx lists the projects it can open in
place of a Projects door", fails on the branch head without this change too, so it is not Quality's. It belongs to the
Vault's lane (S6).

Run the walk from this folder with `NODE_PATH=$(npm root -g) node w19-action-items.cjs`. It needs `WALK_PASSWORD`, a
running server, and the walk project and records of `../2026-11-10-records-table/`.
