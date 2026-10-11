# AnA steering receipt lifecycle — W3 / D4

Baseline: `117313b90e933b8e96d162e3f855ca08899ec9fc` on `concept2cure-v2`.
Scope: existing client steering acceptance and pending-state reconciliation.
Runtime: Node `v22.23.3`, canonical `vitest.config.ts`, real `useAnaChat` hook.

## Concrete defect and resulting behavior

`steerRun` previously appended a steer to `pendingSteers` only after its HTTP
control response returned. The separate SSE stream could announce `interjected`
first, consume an empty pending queue, and then have the delayed HTTP response
re-add an already-applied instruction. The transcript showed the steer as
applied while the work panel still said **Waiting for the next round**.
An unrelated SSE steer also blindly consumed the oldest local pending item.

This is a permitted server ordering: `queueSteer` updates the queue and awaits
`notifyAndDrive` before returning HTTP acceptance; the stream checkpoint emits
`interjected` on its independent connection.

The existing hook now records each local attempt before dispatch without
showing it as accepted. Each matching SSE receipt captures the set of matching
attempts already started when it arrived. The visible pending list is derived
only from successful HTTP acceptances that matching eligible receipts have not
confirmed. It therefore remains correct when either channel arrives first.

## Identity and scope boundaries

- Local attempt IDs identify their own HTTP outcomes only. The unchanged
  protocol has no shared HTTP/SSE request ID; the client does not invent one.
- Attempt matching keys follow the real service pipeline:
  `trim().slice(0, MAX_INTERJECTION_CHARS).trim()`, importing the existing shared
  2,000-character cap. The control endpoint trims and caps input; the queue
  drain trims again before emitting SSE. Already-canonical SSE text is compared
  exactly, without renormalizing it. Duplicate matching text is reconciled by
  aggregate count.
- Receipt eligibility is fixed at receipt arrival. An earlier receipt cannot
  confirm a later submission, including later identical text.
- Refused or timed-out attempts never appear in pending state and cannot
  consume a receipt as an accepted attempt.
- Unmatched echoes cannot consume unrelated work. They still appear in the
  transcript as the server's announced interjection.
- Abandonment, a fresh send, and owned-turn cleanup discard the ledger. Late
  responses may still acknowledge success for the old request, but cannot
  restore old pending state or mutate the replacement run's ledger.
- Receipt mutation happens once outside React's repeatable state updater.

Because the protocol has no request ID, identical normalized text from another
controller during an already-started matching local attempt is indistinguishable
from a local receipt. Exact duplicate provenance remains outside this repair;
the implemented guarantee is eligible aggregate matching, not unavailable exact
request correlation. No server fields were added.

## Actual verification

The initial fail-first hook suite contained 11 cases. Before the fix it reported
**7 failures and 4 passes**, including the echo-before-HTTP race, mixed duplicate
outcomes, temporal eligibility, unmatched external echo, and normalization.
The original output is in `red.txt`.

The initial receipt repair had **14 focused cases** and passed **82 tests across
8 files**. That complete green run is retained as `green-pre-boundary.txt`.
Final review then found a real cap boundary: for input consisting of 1,999
`a` characters followed by a space and `b`, the initial trim/cap leaves a
trailing space, while the actual queue drain trims it before SSE emission.
The attempt key and the re-normalized receipt did not match.

The actual path was verified through `applyControl` and `queueSteer` in
`server/services/ana/run-control.ts`, that module's `consumeInterjections`
queue drain, `spliceQueued` in `server/routes/ana-ri/stream.ts`, and
`interjected` emission in that route and `server/services/ana/turn-run-policy.ts`.
Two new hook cases for HTTP-first and SSE-first ordering were run before the
boundary repair against checkpoint `90a0d28d9f30c8a5de1ea539203dc0ecc6568bc4`.
The focused run reported **14 passes and 2 failures**; its actual JSON output
is in `boundary-red.json`, with runtime output in `boundary-red-stderr.txt`.
The repair mirrors the full queue/drain key once for attempts and treats the
server's emitted text as canonical. Sent and displayed text are untouched.

The final hook suite has **16 focused cases**. All pass alongside the existing
control, drive, abandonment, stale-stream, run-policy, and completion coverage:
**84 tests passed across 8 files**. The final successful output is in `green.txt`.

| Focused scenario | Verified result |
| --- | --- |
| SSE receipt before HTTP success | Applied steer is retained in the transcript and is not resurrected as pending. |
| HTTP success before SSE receipt | Accepted steer appears pending until confirmed. |
| Control refusal or 5-second timeout | Unaccepted text never appears pending; timeout aborts the control request. |
| Duplicate attempts with success and refusal in either response order | One receipt confirms the one accepted duplicate; no phantom pending item. |
| Duplicate successes received out of order | One receipt leaves exactly one accepted duplicate pending; the next receipt clears it. |
| Earlier same-text receipt followed by another submission | Receipt eligibility cannot consume the later request. |
| Earlier receipt whose eligible attempt is refused | It cannot be transferred to a later same-text accepted request. |
| Unmatched same-text receipt before any request | It cannot become confirmation of future work. |
| Unrelated external echo | Local pending instruction stays pending. |
| Leading/trailing whitespace and text beyond the shared cap | Matching works in either response order; existing submitted/pending text and the server-announced transcript text remain intact. |
| Character cap landing on interior whitespace | The real queue/drain echo matches in HTTP-first and SSE-first order; applied work is not left pending. |
| Reset and replacement run with the same text | Late old-run HTTP success remains acknowledged without changing new-run pending state. |

The regression files run were:

```text
client/src/concept2cure/components/ana/__tests__/useAnaChat-steering-receipts.test.ts
client/src/concept2cure/components/ana/__tests__/useAnaChat-abandoned-controls.test.ts
client/src/concept2cure/components/ana/__tests__/useAnaChat-network-waits.test.ts
client/src/concept2cure/components/ana/__tests__/useAnaChat-drive.test.ts
client/src/concept2cure/components/ana/__tests__/useAnaChat-drive-stop-owner.test.ts
client/src/concept2cure/components/ana/__tests__/useAnaChat-run-policy.test.ts
client/src/concept2cure/components/ana/__tests__/useAnaChat-stale-stream.test.ts
client/src/concept2cure/components/ana/__tests__/useAnaChat-completion.test.ts
```

ESLint was forced with `--no-ignore` so the existing broad client ignore could
not conceal findings. The source has **0 errors and 36 warnings**, the same
warning count and rule counts as the baseline source. The new regression file
has **0 errors and 0 warnings** and also passes `--max-warnings=0`. Results are
in `eslint-baseline.json`, `eslint-current.json`, `eslint-test.json`, and the
compact `eslint-summary.json`; corresponding stderr logs retain runtime output.
Scoped `git diff --check` passes (`diff-check.txt`).

## Delivery limits

Production edits are limited to `useAnaChat.ts`; one adjacent regression file
was added. There are no API, model, tool, dependency, markup, styling, layout,
width, or visual-design changes. No browser frame-rate or provider-latency
claim is made. These checks exercise the real hook with controlled HTTP and SSE
ordering under jsdom, including the actual cancellation deadline.

The lead session owns the full build, compiler, release gates, and publication.
No commits or pushes were performed by this implementation session.
