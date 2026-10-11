# W3 / D4 — Isolate aborted replies from the next conversation

Late response headers or queued stream reads could apply events after reset,
conversation switch, or Stop. Reproduced: old thread_id replaced the selected
conversation; old run_started and drive events could address the replacement
turn. Check the turn abort signal after headers, after each read, and before
processing each frame (a drive callback may synchronously reset mid-chunk).
The interrupted-record lookup now uses the turn-local run id rather than the
replacement run currently in shared state.

Message ids used Date.now alone. Two turns in one millisecond collided, so the
second reply could overwrite the first and delayed cleanup could mark a new
message stopped. A hook-local monotonic sequence makes those identities unique
while keeping the original timestamps. It is not reset when conversation history
is reset or switched.

Evidence: stale-stream-red.txt records three reproduced failures before the fix.
chat-green.txt records 147 passing tests across 19 suites, including six new
regressions for late headers, queued reads after reset/switch, synchronous reset
mid-chunk, clock collisions, and run-local audit lookup. lint-summary.json records
zero errors, zero new test warnings, and the hook's unchanged 36 warnings.
All 26 repository guards in repository-gates.json passed. Pushed-import and lint
checks are recorded separately. The founder-authorized local full-compiler memory
exception continues to apply; the unchanged full GitHub compiler gate must validate
this publication. No local full typecheck success is claimed.

No models, automatic retries, execution permissions, or regulatory gates changed.
D4 remains open pending live deployment/provider and launch evidence. Live response
time is not measured by these regressions. Existing dependency-audit findings are
not addressed or suppressed by this batch.
