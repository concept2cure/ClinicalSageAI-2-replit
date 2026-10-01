# SECURITY-10: a report run and its chain row commit together

Review: `../../security.md`, SECURITY-10. Its provisional number there (DP-62) collides with the
register's DP-62, which is a different finding.

## The finding

`POST /api/report-os/runs` wrote the run, its first snapshot and its dependencies as three separate
inserts, and only then tried its `report_os.run_created` chain row. If that row was refused, the
caller got a 503 saying the run "was created but could not be recorded", yet the run remained:
- `GET /runs` listed it;
- it could be bundled, exported and finalized;
- a retry made a second run.

A record existed without its audit row, which 21 CFR 11.10(e) says should not happen.

## What changed

`routes/report-os.ts` `createRunOnChain` writes the run, the snapshot, the dependencies and the chain
row in one tenant-stamped transaction, using drizzle on the transaction's connection (`onTransaction`).
- If the row is refused, everything rolls back. The 503 says the run was not created and nothing was
  saved, and it carries no run id.
- If an insert fails before the row, the error propagates as a 500 and nothing is recorded.

## Shown failing first

- `red-route-cases-on-previous-route.txt`: three route cases fail on the previous route:
  - one transaction;
  - roll back with the row;
  - an insert failure is not "not recorded".
- `red-dbtest-on-previous-route.txt`: on a real database (app_service, RLS on), with
  `report_os.run_created` refused by a trigger, the previous route left a run and a snapshot behind.
  Now neither remains.
