# The capped CAPA figures read as one line (D7, 2026-11-10)

Package **D7**. Found walking the CAPA register for the not-found repair (`../../../F1/2026-11-10-not-found-words/`):
at the read cap the figures line stacked two colons, "The 100 most recently updated CAPAs: Open CAPAs: 100 (0 closed)
· …".

## What already exists

- **The capped-read prefix**: `qms-record-partial`, `quality/QmsRecords.tsx` (C12). Each register's `readCap`
  (`qmsCapaRegister.tsx`: the 100 most recently updated) says that the figures are those rows'.
- **The figures**: each register's `kpis`, joined by " · ".

## What changed

The prefix is set off by a dash, not a colon: "The 100 most recently updated CAPAs — Open CAPAs: 100 (0 closed) · Past
target close: 0 · High or critical risk, open: 0 · Closed, not effective: 0". The words are C12's. Only the separator
changed.

## Tests

`quality/__tests__/QmsRecords.test.tsx`, "says a capped read is the most recent rows, and its figures are theirs",
now expects the dash. It fails before the change (`red.txt`). `green.txt`: Quality's 28 suites, 374 tests.

## Walked in the running app

`w33-capa-figures.cjs` (`shots/w33-capa-figures.log.json`, `shots/w33-capa-figures-1440.png`) ran as the approver,
with no page or API errors. It shows the line above, read from the CAPA tab.
