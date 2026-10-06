# W3 / D4 — Release the composer when AnA finishes the turn

The client marked a reply finished on post_done but kept reading until transport
EOF. A lingering connection kept the composer and run controls busy; an eventual
idle timeout or late error could turn the completed reply into an interrupted
one. red-tests.txt reproduces three failures: no-EOF completion, late frames in
the same chunk, and a stalled transport cancellation.

The stream reader now stops at post_done, preserves its final answer/actions/
record and all previously received grounding and warning metadata, and ignores
trailing frames. It cancels and releases the reader without waiting for transport
cleanup. A rejected cleanup promise is handled and cannot relabel the reply.
The existing finally releases composer/run/drive state. No run-control cancel is
sent to the server. The earlier done event still waits for finishing work; server
post-processing writes warnings, grounding and the turn record before post_done.
No finalization or authorization gate is skipped.

Four new tests cover immediate completion and another question while the first
connection remains open, same-chunk late text/error/navigation exclusion, stalled
cancellation and rejected cancellation. The Manual hold fixture now models reader
cancellation: an expired hold is retained through done, and clears at post_done,
with the stop reason and unrun steps retained in the transcript. It no longer
expects network EOF to clear a completed turn's controls.

All 184 tests across 21 chat-hook and interrupted-host suites pass. All 26
repository guards passed. Explicit --no-ignore lint has zero errors; existing
warnings are 36 in the legacy hook and one in the Manual hold test, with none in
the new suite. Final import/lint checks and an explicit legacy-hook warning
comparison are recorded in publication-checks.json.

This verifies client completion and recovery behavior under controlled transport
failures, not live latency or provider quality. Full TypeScript validation remains
in GitHub CI under the user's authorized local-memory exception. Pass14 CI was
still running at inspection (security contracts passed; Security Scan failed).
The earlier broad Test/Integration/Coverage failures remain unresolved; the
connector could not retrieve their logs. Dependency/security findings and D4
live-deployment/provider/launch evidence remain open.
