# W3 / D4 — Honest saved-history failures and recovery instructions

AnA treated a successful HTTP response without an array of messages as an empty
conversation. A partial/error body could silently select the thread with no
history and re-enable follow-up sends. HTTP history failures also all displayed
the same retry instruction, including failures requiring sign-in or access repair.
red-tests.txt records eight failing regressions before the change.

Saved history now requires an explicit messages array. Missing, null, scalar or
error-only payloads enter the existing failed-history state, keep the selected
thread unset and prevent send until retry or reset. An explicitly empty array
still loads normally; retry clears the failure once a valid payload arrives.
The server's successful history route returns that array and its error paths
omit it (server/routes/chat/threads.ts). Existing row hydration is unchanged.

HTTP 401, 403, 404 and 429 provide specific sign-in, access, unavailable-thread
or rate-limit recovery guidance. Unknown HTTP errors, transport/JSON failures
and deadlines retain the existing generic/timeout instructions. Only status
selects the copy; raw service error text is not shown. Guidance says the question
has not been sent. There is no automatic retry, no new provider call and no
change to server authorization, thread ownership or policy/approval checks.
The rail and conversation screen already consume threadLoadError.message.

Nine new cases cover malformed response rejection, sending blocked after failure,
explicitly empty history, successful retry and four status-specific instructions.
All 211 tests across 24 suites pass: all chat-hook suites plus interrupted hosts,
rail history and conversation-shell integration. They cover selection races,
header/body deadlines, Stop, continuation and previous completion changes.
All 26 repository guards passed. Explicit --no-ignore lint has zero errors and
36 existing hook warnings, none in the new test. Publication checks and a hook
warning comparison are recorded separately.

Full TypeScript validation remains in GitHub CI under the user's authorized
local-memory exception. Pass15 CI was still running when inspected: security
contracts passed and Security Scan failed. Earlier broad Test/Integration/Coverage
failures remain unresolved; their logs were unavailable through the connector.
Dependency/security findings, live latency/provider quality and D4 deployment/
launch evidence remain open. This pass verifies client behavior with controlled
responses, not a new production readiness or regulatory qualification claim.
