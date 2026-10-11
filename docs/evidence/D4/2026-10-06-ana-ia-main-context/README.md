# W3 / D4 — AnA Intelligent Awareness: reliable main-chat context

## Scope and result

This session fixes existing context handling in `server/routes/ana-ri/stream.ts`.
No new surface, dependency, integration, model, migration or governed write path.
Based on canonical branch `64012fae` (repository-health refresh following
`b7984438`). This evidence does not mark D4 or the launch complete.

A stored conversation must load before AnA routes or answers a follow-up. A
question, a scientific correction, or a previously stated uncertainty should
not disappear because the platform substituted browser state or removed the
wrong row from history.

## Defects reproduced

1. A failed history read silently became browser history, or an empty transcript.
2. A failed thread resolution or question write allowed the model and tools to
   proceed without a persisted conversation.
3. A successful empty stored transcript accepted a named thread's browser history,
   including stale assumptions absent from the authoritative transcript.
4. The route saved the current question, then dropped the last row of a later
   history read. An overlapping turn could become that last row: it was dropped
   while the current question appeared twice in the gateway context.
5. Even when the model used stored history, routing and session-start detection
   used browser history. A stale market assumption could influence routing while
   being excluded from the model's transcript.

## Implementation

- Resolve the thread through the canonical caller/organization access helper;
  snapshot the stored transcript; then save the current question. No history
  row is removed by position. This is a snapshot, not transaction-level
  serialization of overlapping turns.
- On preparation failure, return a static retryable error with the stage code:
  `THREAD_UNAVAILABLE`, `HISTORY_UNAVAILABLE`, or `CONVERSATION_UNAVAILABLE`.
  No model call, tool execution, approval request, or answer post-processing
  proceeds. The run closes as failed; the turn record receives static wording.
  Raw driver details remain in server logs.
- A named thread's successfully loaded history is authoritative even when empty.
  Starting without a named thread still accepts bounded browser user/assistant
  turns. Existing role filtering and the twenty-message window remain.
- Feed the same bounded transcript into orchestration, session-start detection,
  and gateway messages. Use stored metadata for tool traces and stopped-turn
  notes; browser history does not invent that provenance.
- Preserve existing model effort, tool approval, pause/resume, document proposals,
  signatures, and post-processing paths.

The reachable replacement for the unreliable fallback is the validated
conversation preparation and transcript construction in
`server/routes/ana-ri/stream.ts`, exercised over HTTP by
`server/routes/ana-ri/__tests__/stream-context-awareness.test.ts`.

## Verification

- `red-tests.txt`: **8 failing / 3 passing** regressions against the original route,
  including a synthetic overlapping-turn write.
- `red-orchestration-tests.txt`: **4 failing / 7 passing** after the first fix,
  exposing stale routing/session-start context and prefetch before failed history.
- `green-tests.txt`: **332 passing tests / 35 suites**. Includes the entire
  AnA RI route test directory, submission IA, shared IA policy, real-store
  thread access, and coded HTTP error containment.
- Four existing test files were adjusted to the new contract: failed preparation
  stops instead of entering a model/tool/approval path; saved-history fixtures
  represent the snapshot before the current question; the stopped-note source
  check follows the shared trace variable. Intermediate failures are retained
  in `intermediate-context-contracts.txt` for review.
- `repository-gates.json` / `.txt`: **all 26 gates passed**.
- `lint.json`: no errors; production stream warnings reduced from **24 to 23**;
  test files show no warnings. Final publication ratchets also check every
  changed test. `git diff --check` passed.
- Full local TypeScript compilation is not repeated under the previously
  authorized workspace memory exception; GitHub runs the full check.

## Published prior-change CI

`published-parent-ci.json` records the exact `b7984438` run/job identities.
Lint, full and beta TypeScript, AnA readiness, security contracts, CodeQL,
browser smoke, blank-database provisioning, and production boot checks passed.
Broad Test, Integration Tests, Coverage, Security Scan and Semgrep failed.
The Test job log service returned an Internal error; this session does not
attribute those broad failures or claim they are fixed. Build and release
assembly were skipped. Local scoped tests do not turn that release status green.

## Limits and next evidence

Controlled gateway scripts prove platform contracts, not real model judgment,
regulatory accuracy, latency or comprehensive market expertise. No live provider
credential variables were available in this workspace; no live evaluation was
performed. Keep live acceptance review pending.

The twenty-message window still omits older material; this change does not
promise full conversation recall. Optional memory and intelligence reads retain
their existing fault-tolerance behavior. Fast-path routing and other chat entry
points are outside this change; do not describe it as every AnA path being fixed.

Next validation should observe a live clarification → client correction →
evidence-based answer conversation, retaining actual model versions, full
transcripts, and retrieved passages. Separately investigate broad CI failures
once their logs are accessible.
