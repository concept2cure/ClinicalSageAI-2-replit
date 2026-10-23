# Native agent and realtime host fail-first evidence

## What already exists

The approved [contract](../CONTRACT.md) and [inventory](../INVENTORY.md) name the
existing `onModelResponse` executor hook, shared `loopToolCollector`, canonical
`recordLoopTurn` writer, `TurnRecorder.addServed`, author reader and qualification.
The existing `server/services/ana/__tests__/turn-record-loop.test.ts` already
provides mounted agent and realtime runner seams backed by the actual PGlite
record/chained-audit writer. This file adapts those seams; it does not introduce
another collector, recorder, transport or persistence implementation.

## Observed baseline

The new `turn-record-loop-model-hosts.test.ts` is frozen at SHA-256
`3a8947e2200c2abbde23f891ea0948180c18d1cb80fd4ab581038496e128a9f1`.
Node 22 ran **15 cases: 10 intended semantic failures, five passing controls,
zero skips**. Every failure is an actual persisted `model.calls: []` where
returned gateway metadata was expected. The existing observer is invoked
optionally by the scripted executor, so absent wiring produces no missing-method
or missing-export failure. No fixture, import or lint failure is counted as red.

Both hosts are covered for mixed providers/models, repeated calls/request IDs,
an unknown author before a known author, earlier observations retained on late
failure and the first returned response when no tool was requested. Realtime
also covers cancellation followed by an executor throw or a returned response.
Controls preserve first-call failures without invented models, no-observer
legacy fallback with the exact warning, and the agent's request-connection
requirement. Assertions also retain actor/tenant identity, exact raw tool bytes,
record outcomes, final answer and existing model qualification behavior.

The included ESLint command passes **zero errors and zero warnings** before
freezing. All 26 selected initial inputs match before and after the run. The
test owner changed only the new test and this evidence directory. Root owns
production, Git and all execution or edits after this freeze.

## Exact artifacts and limits

- [Frozen path/hash and counts](frozen-tests.json).
- [Semantic failures and controls](baseline-summary.json).
- [Exact command, environment and 26 baseline hashes](baseline-1-command.json).
- [Raw combined transcript](baseline-1.txt), [JSON report](baseline-1-results.json)
  and [exit/hash result](baseline-1-exit.json).
- [Exact executed test bytes](baseline-1-test.ts.txt), plus
  [before](baseline-before.json) and [after](baseline-after.json) pin checks.
- [Included lint command/result/hash](lint-before.json),
  [raw lint JSON](lint-before.stdout.json) and [stderr](lint-before.stderr.txt).

The executor is scripted. No gateway, model provider or SDK is called; one
native executor invocation is not a provider-call count. The actual shared
collector, recorder, PGlite record SQL, chained audit SQL and canonical reader
remain real. The mounted agent middleware supplies synthetic authenticated
identity and its request client. Realtime calls the production turn runner,
not a socket handshake. As in the earlier fixture, the route's separate general
audit-service write is stubbed because its unrelated schema/connection is not
part of this single-session fixture; the record's chained-audit writer is real.
This establishes sequential host wiring/persistence behavior, not deployed
RLS/authorization, provider delivery, complete later-input traces, approval
policy changes, clinical validation or agency acceptance.
