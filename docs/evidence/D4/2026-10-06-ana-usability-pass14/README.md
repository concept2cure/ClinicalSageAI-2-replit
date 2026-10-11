# W3 / D4 — Recovery guidance beside interrupted partial replies

When a stream returned text and then failed, AnA preserved the text but showed
only the generic interruption note. The structured sign-in, access, usage-limit
or provider recovery guidance was used only when no text had arrived. People
could see a draft and a Continue button without the prerequisite for recovery.

The client now adds safe recovery guidance to the partial reply's existing
warnings. Both the rail and conversation screen already render those warnings
beside the answer. Partial text, the interruption note, prior warnings and turn
record are preserved. The message uses the structured error code/status, never
raw server exception text. The copy does not describe a reply already started
as unsent. Duplicate warning text is deduplicated. No automatic retry or extra
provider request is introduced; existing Stop, timeout and empty-reply behavior
remain unchanged. Generic failures ask the person to review the partial text
before trying again.

red-tests.txt records 14 failing cases before the fix, seven failure classes
in each real chat host. green-tests.txt records 54 passing tests across five
suites, including both hosts, nested error envelopes, existing warning retention,
turn-record retention, no automatic resend, empty-reply refusals, idle/header
waits and stale-stream protection. All 26 repository guards passed. Explicit
--no-ignore lint checks the normally ignored legacy hook too: zero errors,
36 warnings in the existing hook. Publication checks are recorded separately.

The preceding pass13 CI passed lint/full and beta TypeScript, security contracts,
AnA readiness and production boot jobs. Test, Integration and Coverage jobs
failed, as did the dependency audit and Trivy filesystem scan. Job-log retrieval
failed with Transport closed; annotation retrieval was rejected by the connector.
The broader failures remain unresolved and their causes are not attributed here.
Full TypeScript validation for this change remains in GitHub CI under the user's
previously authorized local compiler-memory exception. Live deployment latency,
provider output quality and D4 launch evidence remain unverified.
