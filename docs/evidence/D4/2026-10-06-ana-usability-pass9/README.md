# W3 / D4 — Bound optional AnA context waits

Five optional route-context reads could stall the entire prefetch phase without a
deadline. Reproduced before the fix: prefetch-red.txt records eight failing tests.
The reads now start concurrently with a three-second wait budget per source.
Healthy feedback, project intelligence, regulatory snapshots, preferences and
external intelligence are retained. Session briefing/deadline radar and open
contradiction reads retain their existing 1.5-second budget.

Failure or timeout is distinguished from a healthy empty result. Both chat paths
include an explicit context-availability notice in model instructions: missing
context does not establish that decisions, deadlines or unresolved findings are
absent. Streaming also emits a warning to the person and retained turn recorder.
The notice uses fixed source names, not exception details, and is not evidence.
Tenant-scoped calls, mandatory execution/approval checks and regulatory gates
remain in place. Timers are cleared after settlement; underlying database work
is not cancelled, and a late result cannot replace the returned turn snapshot.

prefetch-green.txt records 48 passing tests across seven suites, including stalled
and rejected sources, concurrent waits, healthy context retention, late results,
absent tenant/project scope, actual stream warning/model wiring, source evidence,
turn recording and existing memory deadlines. All 26 repository guards passed
(repository-gates.json). Changed-file lint reports no errors; the stream route's
24 warnings and context builder's four warnings remain, with none in the tests.
Publication checks passed for tracked imports, changed-file lint errors and the
warning ratchet (publication-checks.json). Stale ratchet scratch files initially
blocked its run; these were preserved outside the checkout before a passing retry.

This bounds only optional route prefetch waits, not the full request or provider
response. No live latency or model-quality measurement was performed. D4 remains
open pending deployment/provider and launch evidence. The authorized local full
compiler memory exception continues; GitHub full TypeScript validation remains
required and pending. Existing dependency audit findings are not suppressed.
