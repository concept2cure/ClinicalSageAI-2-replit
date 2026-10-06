# W3 / D4 — Continue from the partial answer the person actually saw

Continue previously sent only a fixed sentence and the ordinary history. The
stream route prefers persisted history, so a partial answer lost before message
persistence never reached the next model call, even though the person could see
it and click Continue. Reproduced on both real host components and the real stream
route with persisted history containing the prior question but no partial reply.

The explicit Continue request now carries the latest interrupted answer and its
question as a bounded client draft handoff. Normal messages, older replies,
refusals without generated text, live turns, manual Stop, and repeated-step stops
carry no handoff. The original question is capped at 4,000 characters and the
answer at its last 12,000 characters, with truncation labeled. These limits apply
again at the server boundary; malformed and oversized context is ignored.

The server adds the handoff as quoted USER context, not a system instruction or
trusted assistant/tool record. Claimed tool, approval and save metadata is dropped.
The model is told this draft does not prove tool execution or a saved document,
and to inspect actual state before repeating an action. Existing input inspection
covers the handoff and current request together. When input encapsulation is on,
only the guarded combined text is sent, never an unguarded duplicate. The retained
turn record captures the handoff through its normal complete model-input record.
No provider, model, permission, retry, automatic-resume or regulatory gate changes.

Evidence: continuation-red.txt records the three reproduced failures before the
fix. continuation-green.txt records 209 tests across 25 suites, including both
chat hosts, ordinary history and cancellation, the actual stream route, shared
bounds/trust parsing, input-guard encapsulation, and existing turn-record/stop tests.
shared-typecheck.txt records a passing TypeScript check scoped to the new shared
contract and its tests. lint-summary.json records no errors or new test/shared
warnings; the hook's 36 and stream route's 24 existing warnings are unchanged.
All 26 repository guards passed (repository-gates.json).

The founder-authorized local full-compiler memory exception continues to apply;
the unchanged GitHub compiler gate validates publication. D4 remains open pending
live deployment/provider and launch evidence. These tests verify handoff behavior,
not live response quality or response speed. Existing dependency-audit findings
remain unresolved and are not suppressed.
