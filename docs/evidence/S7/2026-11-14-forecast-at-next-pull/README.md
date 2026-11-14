# Each upcoming pull says what the study's own results predict

Plan S7. Completes `server/services/cmc/stability-trending.ts` (the trend engine) and
`server/services/cmc/stability-source.ts` (`stabilityPullSchedule`), shown in the Stability register
(`client/src/concept2cure/v2/surfaces/CmcModule.tsx`).

Founder's ask, 2026-11-14: predicted results per study and test. Asked how to proceed given that the recorded
decisions exclude a digital twin (CLAUDE.md RULE 2; P-113 "Not approved … digital twins"), the founder chose
**predictions from the existing engines**. No engine, table, route or screen is added.

## What already exists

- `assessTrend` (`stability-trending.ts`): the least-squares line through a series, its slope and confidence
  interval, the prediction interval each pull is judged against, and when the line reaches the limit.
- `estimateShelfLife` (`shelf-life.ts`, ICH Q1E) and `assessRecordedPoolability`: the supported shelf life.
- `stabilityPullSchedule` (landed today): each pull's planned date and state.
- Nothing said what result to expect at the next pull.

## The change

- `forecastTrend(points, times, criterion)` in `stability-trending.ts`: the same regression read forward, giving the
  fitted value at a future time and the two-sided 95 % prediction interval for one new result there, and where that
  sits against the recorded criterion: within, interval crosses the limit, outside, or no criterion. It refuses in
  words on fewer than three results or one time point.
- `stabilityPullSchedule` attaches a forecast per recorded test to each pull still to come, read from that test's own
  results on that study; results at more than one condition, or conflicting criteria, are refused with the reason.
- The register's Next pull cell prints it: "predicted: Assay 98.73 (97.79 to 99.68) — interval crosses the limit".
  A test with no forecast says why in the line's title.

The figures are the engine's. The browser only rounds them to two decimals for display.

## Proof

Red first: 6 cases in `stability-pull-forecast.test.ts` and one client case in `cmcAuditCountsHonesty.test.tsx`.
Then green with the CMC server suites. Lint unchanged (`CmcModule.tsx` 14/14, `stability-trending.ts` 3/3,
`stability-source.ts` 0/0).

In the running app, C2C-201, 2026-11-14 (screenshot `stability-register-forecast.png`):

```
drug substance, long-term   18 mo · 2027-05-08   predicted: Assay 98.73 (97.79 to 99.68) — interval crosses the limit;
                                                 Total impurities 0.31 (0.21 to 0.40)
tablets, long-term          12 mo · 2027-02-08   predicted: Assay 98.05 (97.51 to 98.59)
tablets, accelerated        none to come
```

Checked by hand against the stored rows: the substance's assay is 99.8, 99.4, 99.1 at 0, 6, 12 months against
98.0 – 102.0 %. The line falls 0.058 a month, so 98.73 at 18 months; with three points the interval is wide and its
lower end (97.79) is below 98.0. That is a real early warning on the demo programme, and it was on no screen.

## What this is not

Not a simulation and not a digital twin: one straight line per test per study, no Arrhenius term, no pooling across
batches, no process model. Those need a founder decision recorded in `docs/LAUNCH_DEFINITION_OF_DONE.md`.
