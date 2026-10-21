# Context-window refusal through the mounted SSE route

## What already exists

`server/services/ai-gateway/context-budget.ts` already defines the canonical
`GatewayContextWindowError` and its size/ceiling/reduction sentence.
`gateway-error-map.ts` already classifies that instance as
`TOKEN_LIMIT_EXCEEDED` with HTTP 413. `server/routes/ana-ri/stream.ts` already
retains failed/stopped partial turns and a typed raw-body-budget refusal, but
flattens context refusals into a generic message. Its catch emits a timeline
end before checking `headersSent`, so an early thrown context error currently
opens an implicit 200 stream instead of reaching a JSON refusal.

`server/routes/ana-ri/__tests__/support/stream-route-harness.ts` already mounts
the actual route with scripted gateway/tool/context/database seams. The new
suite extends those existing seams without changing support or production.
Real tool dispatch, budgeting, framing, recorder, partial text and the stopped
record path run. The canonical class is imported directly, so no expected
failure depends on an absent export or a fabricated error identity.

## Frozen proof

The new file contains **10 tests: 4 intended failures and 6 passing controls**.
`freeze.json` pins its exact hash, command, results and baseline. The canonical
Node 22 Vitest run has one worker and no file parallelism. ESLint ran before
freeze with zero errors and zero warnings. The 24 selected root input hashes
are verified unchanged in `inputs-before.json` and `inputs-after.json`.
Raw `.txt`/`.json` transcripts retain the run without whitespace cleanup.

The four behavioral failures are the first gateway context refusal, refusal
after a tool plus partial streamed text, a Stop racing that refusal, and an
early pre-header context refusal. The existing generic message loses the
canonical guidance/code; the early path also returns implicit 200 rather than
413. Existing partial text, raw/staged tool bytes, controls and stopped outcome
assertions pass in those fixtures, identifying what must remain intact.

The six compatibility controls keep generic errors, copied class name, copied
token code, copied name plus code, a real provider-wrapped token failure, and
the existing typed raw-body-budget refusal unchanged. No branch may broaden
to name, message or classifier code in place of canonical `instanceof`.

## Boundaries

The scripted gateway throws a real canonical error at its route seam. This
qualifies the host carrier, not gateway size estimation, SDK dispatch or live
provider service. A recorder wrapper runs the actual in-memory seal; its writer
is substituted and proves no persisted database write. The partial refusal
fixture retains both streamed text and the raw tool result, together with the
exact capped body staged to the refused gateway invocation. It never claims
provider delivery or comprehension.

The Stop fixture substitutes stopped-answer persistence and checks the stopped
record, partial text and retained tool step. The pre-header fixture deliberately
throws from `ensureGateway` before `writeHead`/`openTurnRecorder`; it qualifies
the existing early catch only. Its record must remain honestly `not_recorded`
because none was opened. No recording status is manufactured by that fixture.
The actual gateway admission and receipt semantics are separate qualifications.

No normal answer post-processing or automatic resubmission occurs on these
failures. Synthetic fixtures do not qualify live provider/database behavior,
exact tokenization/payload size, multilingual retrieval, source receipt rollback
or agency acceptance.

## Earlier attempt retained

`earlier-attempt-vitest.txt` and `.json` retain the initial run with the same
four behavioral failures and six passing controls. Before freeze, the absent
pre-header content-type comparison was made explicitly string-safe, and the
compatibility table gained readonly tuple inference for TypeScript. No
production input changed between attempts.
