# A review returned for changes is said where the document opens (D4, 2026-11-09)

**The finding.** J3 human test, R2 (`docs/evidence/HUMAN-TEST/J3/README.md`): "After 'Request changes', opening the
document shows nothing about it; the reason is under ⋮ → Review tasks." The walk left it to D4, because showing the
review on open is a change to the editor's layout.

## What already exists (RULE 3)

**The route read and its words already exist.** `GET /api/authoring/documents/:id/review-route` (RR5) returns the
document's latest round.
- `editor/AuthoringReviewRound.tsx` reads it inside the Review tasks rail.
- `reviewRoute/routeRound.ts` `routeHeadline` already says a returned round as "Returned by <name>: <reason>". Every
  route uses that wording, Vault included.

**What was missing.**
- Nothing read the route when the document opened.
- So a returned review was visible only after opening More › Review tasks, or the status pill's rail.

## The change

`AuthoringReviewRound.tsx` exports `ReturnedReviewNote`. It uses the same read, the same guard and the same
`routeHeadline` words. `DocumentWorkbench.tsx` places it under the bar, beside the document's other read notes:
- **The latest round was returned:** one line, "Returned by Dana Chen: <reason>", and **Review tasks**, which opens the
  existing rail.
- **An open or completed round, or none:** nothing is added.
- **A route that could not be read:** it says so. It never claims nothing was returned.
- **Re-read** whenever the document's tasks change (`tasksEpoch`), so the line goes once a new round is sent.

There is no new screen, route, card or component file (RULE 4, RULE 6).

## Verified by making it fail

| File | What it shows |
|---|---|
| `red-at-head.txt` | `__tests__/authoringReturnedReviewOnOpen.test.tsx` before the change: 5 of 5 fail. The returned line is absent, and the route is never read on open. |
| `green.txt` | After the change: 5 of 5 pass. |

**Every client suite that renders the editor.** 59 files, 757 cases.
- One case was failing on trunk already: `anaDrivesWave4` "refuses to switch tabs under an open credential drawer".
  It fails the same way before this change.
- `editor/__tests__/workbenchRemedies.test.tsx` now answers the new read truthfully: "no review route". Its catch-all
  fake success had made the read fail.
- **Found, not caused here:** that suite's `insert-empty` case fails when run on its own, at HEAD too (2 of 2). It
  passes only after the earlier cases have run, so it depends on their order. My extra read shifted its timing in the
  full run. This is logged as a D4 test-health item.
