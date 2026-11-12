# P-122 · Quality: a confirmed write re-reads what else it changed; the Complaints and MDR tab, used (D7, 2026-11-12)

Package **D7**. The Complaints and MDR tab (P-122 item 5, `d3db227c1`) had never been used in a running app: its
demo held no complaint, and its walk wrote nothing (`docs/evidence/DESIGN/P-122/quality/README.md`, "Not done here").
This walk used it as a person does, with a project open (w39).

## What the walk found

The flow itself works:
- A complaint is recorded in the open project and numbered by the server (CMP-2026-0001).
- The rules engine's preliminary reportability shows at once ("FDA: reportable · EU: not reportable").
- The move offers only the server's next states and takes its reason.
- The MDR decision is recorded from the complaint, with the narrative carried over. The server computes the
  reporting clock (FDA 30-day, due 2026-12-10).
- The complaint's vigilance timeline lists its events and reasons in the row.

Two things on the screen were wrong until the page was reloaded (`shots/before-reload-probe.log.json` is the same
screen after a reload):

1. **The MDR register stayed empty after the decision was recorded.** The decision is recorded from the complaints
   register, which re-read itself. The MDR register under it did not.
2. **The header's figure line was stale.** It said "0 open complaints" beside a register saying "Open: 1". It is
   read once when Quality opens, and no write re-read it. The same held for every other figure: a raised change, a
   dispositioned nonconformance.

## What already exists

- **The figure line**: `QualityFigures.tsx` (P-122 item 3), four server reads. It re-read only on "Read the figures
  again", after a failure.
- **A register's own re-read**: `QmsRecords.tsx` `runWrite` calls `read.refresh()` after its write.
- **The write doors**. Every Quality write goes through one of six functions, each of which already knows when the
  server confirmed:
  - `send` (`qmsWrites.ts`: `qmsWrite`, `capaWrite`);
  - the two signed acts (`qmsApproval.ts`);
  - `mutate` (`qmsDocuments.ts`);
  - the training acknowledgement (`qmsPersonalTraining.ts`);
  - the review route's request and signature (`qmsReviewRoute.ts`);
  - the controlled-text save (`ControlledTextEditor.tsx`).

Nothing new: no route, screen or file. The signal is three functions in `qmsWrites.ts` and one hook in
`registerContext.ts`.

## What changed

| | Before | After |
|---|---|---|
| A confirmed write | known only to the caller | each door calls `qualityWritten()` once the server has confirmed (`qmsWrites.ts`) |
| The figure line | read once | re-reads its four server reads when a write is confirmed (`useQualityWrites`) |
| A register | re-read after its own write only | re-reads once after any confirmed Quality write, its own or one made beside it. A write that did not announce itself still re-reads it |

## Tests

- `quality/__tests__/QualityFigures.test.tsx`: a confirmed write re-reads all four figure reads.
- `quality/__tests__/QualityComplaints.test.tsx`: recording the MDR decision from a complaint re-reads the MDR
  register, and re-reads each register once, not twice.

`red.txt`: both cases fail before the change. `green.txt`: Quality's 31 suites, 406 tests.

## Walked in the running app

`w39-complaint-to-mdr.cjs` (`shots/w39-complaint-to-mdr.log.json`) ran as the approver with C11 · Walk C11 gasket
programme open. No page error and no failed request.

1. **Record a complaint** (`shots/w39-record-complaint-1440.png`). The drawer says "Recorded in C11, the project you
   have open, as new." Recorded as CMP-2026-0003, "FDA: reportable · EU: not reportable", New.
2. **Move it.** Offered: Triaged, Escalated to CAPA, Escalated to MDR, Closed. Moved to Triaged with its reason.
3. **Record the MDR decision** (`shots/w39-record-mdr-1440.png`). The narrative is carried over.
   - Without a reload, the MDR register lists MDR-2026-0002: FDA, FDA 30-day, decided 2026-11-10, due 2026-12-10,
     Open.
   - The complaint no longer offers "Record MDR decision".
4. **Move the MDR report.** Offered: Preparing, Closed, with the FDA and EU report numbers "when filed". Moved to
   Preparing.
5. **The timeline** in the complaint's row: "Complaint triaged 2026-11-12" with its reason, then "Complaint received
   2026-11-10" (`shots/w39-complaints-1440.png`).
6. **The figures agree, without a reload.** The header says "3 open complaints". The registers say "Open: 3 (0
   closed)" and "Open: 2 (0 closed) · Overdue, not filed: 0 · Filed: 0".
7. **A phone** (`shots/w39-complaints-390.png`): the page does not scroll sideways.

Run it from this folder with `NODE_PATH=$(npm root -g) node w39-complaint-to-mdr.cjs`. It needs `WALK_PASSWORD`, a
running server, and a project of the walk organisation (`WALK_PROGRAM`). Each run records one complaint and one MDR
report in that organisation.

## Still open

- A complaint's row does not name the MDR report decided from it, and an MDR report's row does not name its
  complaint. The server returns each other's id (`linkedMdrEventId`, `sourceComplaintId`), not its number.
- The SOP register's own sections (periodic review, training) re-read through `SopRegister.tsx`'s existing calls.
  They were not changed here.
