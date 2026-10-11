# W3 / D4 — Keep recovery notices out of follow-up model context

The fallback conversation_history included every visible assistant bubble,
including client-generated sign-in, usage-limit and connection-failure copy.
Those notices were forwarded as assistant answers even though no model wrote
them. red-tests.txt records six failures with two real-answer controls passing.

Fallback history now omits blank text and interrupted assistant turns that
received no model response text. User questions, completed answers, actual
interrupted drafts and manually stopped drafts retain their existing roles and
text. Filtering happens before the existing ten-message cap, so recovery
notices do not displace useful context. The notices remain in the visible chat.
Explicit Continue still uses the original transcript and its bounded partial
handoff. Server-owned history, thread permissions and trust/approval gates are
unchanged; this is the client fallback history path only.

Eight new cases inspect actual follow-up request bodies after HTTP/stream/
connection failures, genuine partial/complete replies and repeated failed turns.
All 229 client tests across 27 suites pass. A further 36 server tests across
three suites pass for memory failure/deadline handling and stream behavior.
All 26 repository guards passed. Explicit --no-ignore lint has zero errors and
60 existing warnings (36 legacy-hook, 24 stream), none in the new test or memory
assembler. Final import/lint checks and warning comparison are recorded separately.

The Semgrep job log for pass18 was retrieved this time. Its blocking scan reports
six findings; semgrep-anA-findings.txt retains the relevant excerpt. Two touch
previous AnA work. Memory-layer logging now uses a fixed first argument, with
label and error as data. The stream warning's direct-write finding is a reviewed
false positive, annotated with its exact rule and reason: the route sets
text/event-stream, JSON encodes warning fields, and the client renders warnings
as React text. No HTML is served or executed there. The workflow explicitly
permits reviewed inline false-positive annotations. Semgrep is unavailable
locally; CI must verify these two changes. Four other findings remain outside
this pass (dynamic regexes in device labeling and STF tests); no claim is made
that Semgrep is green.

Pass18 browser smoke, CodeQL and agent validation passed. Semgrep and Security
Scan failed; CI Lint was still running at inspection. Full TypeScript remains in
GitHub CI under the user's authorized local compiler-memory exception. Earlier
Test/Integration/Coverage failures and dependency/security findings remain open,
as do live latency/provider quality and D4 deployment/launch evidence.
