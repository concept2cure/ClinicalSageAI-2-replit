# R1 reach: a milestone's status, on the timeline engine

**Package:** R1, with the F1 repair committed just before it. **Date:** 2026-11-05.

## What already exists

- `server/routes/protocol-milestones.ts`:
  - `PATCH /milestones/:id/status`: governed. It accepts planned, in progress, met, missed and cancelled. "Met"
    with no actual date stamps today.
  - `GET /documents/:id/timeline`: the timeline engine `summarizeTimeline` / `milestoneBucket`
    (`protocol-milestones-logic.ts`).

  Both are served in production, and neither had a client caller.
- The Milestones tab (`ProtocolDevPanes.tsx` `MilestonesTab`) could add a milestone, and nothing more.
- F1, fixed in the previous commit. The view assembler:
  - derived the status from the dates;
  - ran a second urgency rule beside the engine (now deleted, and the engine is used);
  - printed dates as `Date.toString()`.

## The change (no screen, route, service or table added)

- **Engine buckets.** The tab shows the engine's buckets: Overdue, Due ≤30d, Due ≤90d, Upcoming, No target date,
  Done. They are no longer the tab's own labels for a rule that is gone.
- **Recorded status and node style.** The recorded status shows as a badge. The timeline node takes the
  stylesheet's existing hooks: `done` for met, `active` for in progress. Before, the view emitted `complete` and
  `pending`, which matched no style.
- **The write.** Each milestone offers "Update status" (status, actual date, reason) through the existing route.
  An empty actual date is left out, so the server's rule applies.
- **The timeline route.** `GET /timeline` stays uncalled. Its engine is now the one the view uses, so the timeline
  is reached without a second read.

## Evidence in the running app

Protocol CDI02, Milestones tab:
1. Added "First patient in" (2026-11-20) and "Database lock" (2027-08-01), each 201. They read "Due ≤30d ·
   Planned" and "Upcoming · Planned".
2. Recorded "First patient in" as Met on 2026-11-04 (`PATCH …/milestones/1/status`, 201). It reads "✓ ·
   2026-11-04 · Done · Met".

The run had no failed request and no page error. Screenshots: `1-added.png`, `2-status-form.png`, `3-met.png`.

**Tests.** `protocolMilestoneWrites.test.tsx` has 5 cases: the buckets, the status and node hooks, the offer to a
writer only, the route and body, the empty date left out, and a short reason refused. Four fail without the
change.
