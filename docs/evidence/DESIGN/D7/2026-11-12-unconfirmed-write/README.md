# D7 · A Quality write the server did not confirm says so, and says to check (2026-11-12)

Package **D7**. A handoff to this lane from the P-122 reach-map lane in
`.design/claude-convergence/COORDINATION.md`: with the connection down, a Quality drawer read "Not recorded — Failed
to fetch", the browser's own words, at `CapaActions.tsx:63`, `QmsRecords.tsx:104` and `:120`, and
`ReviewActions.tsx:40`.

## What already exists

- **The drawers' refusal line**: each Quality drawer keeps itself open and shows `Not recorded — <the server's
  sentence>` when its write throws (`QmsRecords.tsx`, `CapaActions.tsx`, `ReviewActions.tsx`, `ChangeControl.tsx`).
- **The reach-map lane's wording in the change log** (`9b36f3eeb`): `ChangeControl.tsx`'s `errText` said, of a
  `TypeError`, "the server could not be reached, so nothing was sent. Check your connection and try again."
- **This lane's rule for a dropped connection**, from the periodic review's signature
  (`__tests__/SopRegisterPeriodicReview.test.tsx`, "a dropped connection is not 'nothing was signed': it says to
  check before signing again"). The acknowledgement, the controlled-text save and the document dialogs word it the
  same way ("could not be confirmed. Reload … before trying again").
- **The write doors**: `client/src/concept2cure/quality/qmsWrites.ts`.

Nothing new: no screen, route, mount or table.

## What changed

A `TypeError` is the browser's throw when a request did not complete. That is not proof that nothing was recorded: a
connection can drop after the server took the write. "Nothing was sent" invites a second CAPA move or a second
change on a record that already has one.

- `qmsWrites.ts`: `writeRefusal(err)` is the one line a drawer shows when its write threw.
  - A `TypeError`: "Not confirmed — the server could not be reached. Check your connection, then reload to see
    whether it was recorded before trying again."
  - Anything else: "Not recorded — " and the server's own sentence, as before.
- The five places use it: the records registers' two (`QmsRecords.tsx`), a CAPA action's move (`CapaActions.tsx`),
  a management-review action's closure (`ReviewActions.tsx`) and the change log (`ChangeControl.tsx`, whose
  `errText` is gone).

## Tests

- `__tests__/QmsRecords.test.tsx`, "a write the server did not confirm": a CAPA's move, a CAPA action's move and a
  management-review action's closure each show the sentence, and neither "Failed to fetch" nor "Not recorded"; a
  refusal keeps the server's own sentence.
- `__tests__/ChangeRegulatoryImpact.test.tsx`: the device determination's drawer shows the same sentence.

`red.txt`: the four cases fail before the change. `green.txt`: Quality's suite, 32 files and 435 tests.

## Walked in the running app

`w43-unconfirmed-write.cjs` (`shots/w43-unconfirmed-write.log.json`), as the approver at 1440. The walk aborts every
write's connection and lets reads answer.

1. **A CAPA's move** (`shots/w43-capa-move-1440.png`): Advance, a state and a reason, "Record the move". The drawer
   stays open with what was typed, and says "Not confirmed — the server could not be reached. …".
2. **A change's move** (`shots/w43-change-move-1440.png`): the same sentence.

Neither drawer holds the browser's words. No page error.

Run it from this folder with `NODE_PATH=$(npm root -g) node w43-unconfirmed-write.cjs`. It needs `WALK_PASSWORD` and a
running server.
