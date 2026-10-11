# W3 / D4 — Bounded history loading and structured stream recovery

Saved conversation history now has one 15-second deadline covering response
headers and the JSON body. Abort is raced against both reads, so a transport
that ignores cancellation cannot keep the composer in loading state. The
existing Retry/New conversation flow preserves the unsent draft. Superseded,
reset and unmounted requests settle without restoring obsolete history. The
deadline and listener are removed on success, failure and cancellation.

Streaming error events now retain validated string codes and numeric status
values when passed to the existing refusal presentation. Previously they became
a bare Error and lost the reason for the refusal. THREAD_FORBIDDEN (emitted by
the live stream's thread ownership guard) now explains that the conversation
belongs to another user and offers selection of an owned or new conversation.
No server error details are displayed, and no request is retried automatically.
Execution, access, approval and regulatory controls remain unchanged.

The regression tests reproduce stalled headers/body reads and loss of structured
stream error details before the fixes. The complete client AnA hook/component
suite plus both interrupted-answer hosts pass: 30 files, 296 tests. The earlier
red log includes an additional temporary test subsequently removed because it
duplicated history-timeout coverage; the final broad log covers tracked tests.
Repository guards passed (repository-gates.json). Lint must gain no warnings.
The founder's existing approval allows publication for full GitHub compiler
validation despite this workspace's previously demonstrated local typecheck
memory exhaustion. Full TypeScript and live-provider performance are not claimed
by these client test results. D4 remains open pending complete launch evidence.
