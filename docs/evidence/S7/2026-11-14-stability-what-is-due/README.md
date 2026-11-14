# The Stability register says what is due

Plan S7 (P-122 inventory row B2). Completes `server/services/cmc/stability-source.ts` and the Stability table in
`client/src/concept2cure/v2/surfaces/CmcModule.tsx`.

## What already exists

- `stability_studies` holds `start_date`, `time_points`, `test_parameters` and `stability_data`;
  `GET /api/cmc/stability-studies` already returns all four (`server/api/cmc/routes.ts`).
- `parseMonthTime` and `readRecordedStabilityResults` (`server/services/cmc/recorded-stability.ts`), the readers the
  trend and the Q1E fit use.
- The Stability table used the pull points only to fill the result form and never showed the start date.
- A second store's "due" views (`/api/stability/.../timepoints/due`) exist, are unmapped and refused in production;
  they are not claimed here.

## The change

- `stabilityPullSchedule(study, today)`, a pure function in `stability-source.ts`: each pull point's planned date
  (start plus its months), the parameters recorded and outstanding at it, and its state: recorded, overdue (date
  passed, nothing recorded), incomplete (date passed, some parameters without a result), due today, planned, or not
  scheduled with the reason. No grace window is invented; a point it cannot parse is reported, never dropped.
- The study list returns it per study (three lines in `routes.ts`, W4's file, said in COORDINATION.md).
- The register gains a "Next pull" column (the next pull to come and its date; how many are overdue or incomplete,
  with each gap named in the cell's title) and the counts line adds pulls overdue and incomplete.

## Proof

Red first: 7 engine cases (`stability-pull-schedule.test.ts`, the function did not exist) and one client case
(`cmcAuditCountsHonesty.test.tsx`, "what is due"; fails with the client change stashed). Then 18 passed. Lint
unchanged: `stability-source.ts` 0/0, `routes.ts` 18/18, `CmcModule.tsx` 14/14.

In the running app, C2C-201, 2026-11-14 (screenshot `stability-register-next-pull.png`):

```
3 active studies · 1 outside limits · 4 pulls overdue · 9 pulls incomplete
drug substance, long-term   18 mo · 2027-05-08 · 2 overdue · 3 incomplete
tablets, long-term          12 mo · 2027-02-08 · 1 overdue · 3 incomplete
tablets, accelerated        none to come · 1 overdue · 3 incomplete
```

Checked against the database rows: the substance study records assay and total impurities at 0, 6 and 12 months
and never water content; nothing at 3 or 9 months. The figures are the demo data's own gaps. The first version of
the cell called every gap "overdue" (13); a pull with some results is a gap in a pull, not a missed one, so the two
are counted apart.
