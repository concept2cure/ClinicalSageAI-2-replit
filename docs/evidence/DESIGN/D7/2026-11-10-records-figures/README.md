# The records figures say when a read is capped, and keep the facts the tiles carried (C12, 2026-11-10)

Package **D7**. Sweep item C12 covers findings records-4, records-9 and records-11, and the Quality half of
product-project-counts-partly-read. The quality records registers had two flaws in what they claimed.

1. **A capped read was presented as the register.**
   - The CAPA list route returns the 100 most recently updated CAPAs (`capaMdr.service.ts`, ordered by `updated_at`,
     default limit 100).
   - The deviation and nonconformance routes return the 500 most recently detected.
   - At those caps the register's figures were of the rows read, but said nothing about the cap. AnA was told "The
     register holds 100 CAPAs".
   - The "CAPA" column of a nonconformance or a deviation reads the same capped CAPA list. A record whose CAPA was
     not among the 100 read showed "—", which is a claim of none.
2. **The figure line dropped what the tiles had said.**
   - When D7-B removed the figure tiles, the line kept each label and value, but not the fact beside it: "5 closed, 1
     cancelled", "3 approved", the most recent review's period.
   - It also dropped a qualifier: "High or critical risk" counted open CAPAs only.

## What already exists

- `QmsRecords.tsx`: the figure line, and what the register tells the shell for AnA (`onContext`).
- `qmsRegisterKit.tsx`: `KpiSpec`, `RegisterConfig`, `RecordRegisterContext`.
- `App.tsx recordTabContext`: AnA's summary of the tab.
- `capaSources.ts useCapasBySource`: the CAPAs raised from each record.
- `registerContext.ts documentLabel`: a supplier's quality agreement, and the picker's labels.
- `data.ts STATUS_LABEL`.

Nothing new: no route, table or screen.

## What changed

| | Before | After |
|---|---|---|
| A capped read | the figures, as if they were the register's | **"The 100 most recently updated CAPAs: …"** (or "the 500 most recently detected deviations / nonconformances") before the figures, from each register's `readCap`, which names the server's cap and its order |
| AnA at the cap | "The register holds 100 CAPAs" | "The register read stopped at the server's cap: it shows the 100 most recent CAPAs, and there may be more, so its figures are of those 100". The facts carry `partial: true`. |
| The CAPA column at the cap | "—" for a record with no CAPA among those read | **"not all read"**. A CAPA found is still shown, because a match is certain. Only "none" waits on the whole list. |
| Figures | label and value; tile captions dropped | label, value and, where the value does not already say it, the fact in brackets, e.g. "Open: 1 (0 closed)", "Suppliers: 3 (2 approved)", "Audits: 4 (1 closed)", "Most recent: … (H2-2026)". The same reaches AnA as `detail`. Captions that only restated the value ("None", "On record", "Open") are gone. "High or critical risk" is now "High or critical risk, open". |
| What AnA is told about the register | nothing | `about`: the register's own description |
| A supplier's quality agreement, missing | "document #31 (not in the register)", cut short in a narrow cell | "Not in the register" or "Not read", with "Controlled document 31" on hover. The picker names a status by its label (`STATUS_LABEL`), not by an underscore replaced. |

## Tests

- `QmsRecords.test.tsx`:
  - at 100 CAPAs the line begins "The 100 most recently updated CAPAs: Open CAPAs: 100 (0 closed)", and AnA is told
    `partial: true`;
  - a nonconformance's CAPA column then says "not all read";
  - below the cap there is no capped line, the facts are in brackets, AnA gets `detail` and `about`, and the
    qualifier "open" is in the label;
  - the unread agreement says "Not read", with the id on hover.
- `recordTabContext.test.tsx`: the summary carries the bracketed facts, and a capped read never says "holds 100".

`red.txt`: these five cases fail against the code before C12. `green.txt`: Quality's suites and AnA's wave-4 suite,
28 files and 354 tests.

## Walked in the running app

`w20-capa-cap.cjs` (log: `shots/w20-capa-cap.log.json`) ran as the approver in the walk project. It recorded no API or
page errors.

- **Setup.** It raised CAPAs through the CAPA route the register's own form posts to, until the project held 101. The
  register read then returned 100: the cap is real.
- **CAPA.** The line reads "The 100 most recently updated CAPAs: Open CAPAs: 100 (0 closed) · Past target close: 0 ·
  High or critical risk, open: 0 · Closed, not effective: 0" (`shots/w20-capa-1440.png`). It shows 100 rows.
- **Nonconformances and deviations.** The CAPA column reads "not all read" (`shots/w20-nonconformances-1440.png`). The
  deviation line reads "Open: 1 (0 closed) · …".

Run the walk from this folder with `NODE_PATH=$(npm root -g) node w20-capa-cap.cjs`. It needs `WALK_PASSWORD`, a
running server, and the walk project of `../2026-11-10-records-table/`.
