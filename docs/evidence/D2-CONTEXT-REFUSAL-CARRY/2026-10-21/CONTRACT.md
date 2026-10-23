# Reach existing context-window refusal through AnA — D2 / W2

Baseline `30afd3bd17a90c8de4a44098354d9de3a34cb4bc`, canonical
`concept2cure-v2`. Root owns all production/Git; workers own disjoint new test
and evidence files. No new budget/admission policy, tool, provider, model,
dependency, schema or surface.

## What already exists

`INVENTORY.md` records root source/deleted-history searches before design.
`server/services/ana/agentic-loop.ts` and the two native hosts already enforce
raw-body integrity/bounds; `tool-output-frame.ts` owns framing. The existing
`server/services/ai-gateway/context-budget.ts` estimates the full gateway
request, including framing, history, control turns, tools/schema and output
reserve. `gateway.ts` skips models that cannot fit before SDK dispatch and
throws canonical `GatewayContextWindowError` only when no candidate fits and
no provider attempt failed. This approximate gate is extended through its
consumers; it is not replaced or duplicated.

`server/services/ai-gateway/gateway-error-map.ts` already classifies this error
as `TOKEN_LIMIT_EXCEEDED`; `GATEWAY_ERROR_HTTP_STATUS` already maps it to 413.
Other consumers already use that classification. The two AnA catches in
`server/routes/chat/send-message.ts` and `server/routes/ana-ri/stream.ts` retain
failed/stopped records but flatten context refusal into generic errors. Their
existing raw-body-budget422 carrier is already qualified and remains intact.

`client/src/concept2cure/components/ana/useAnaChat.ts` already parses SSE
messages/codes and turn records. Its refusal/partial recovery helpers discard
context guidance; non-2xx parsing drops messages and records. Existing safe
`serverMessage`/`errorCodeOf` readers in `client/src/lib/queryClient.ts` and
`readTurnRecord` in `anaProgress.ts` remain canonical. Existing admission,
classification, native host, mounted chat/SSE and client-hook suites expose
all these seams.

## Interface and behavior

Extend `classifyGatewayError` with an optional second options argument
`{ priorToolWorkMayExist?: boolean }`. Default/false preserves all existing
outputs byte-identically. Only the `instanceof GatewayContextWindowError`
branch appends this fixed suffix when true:

>  Some actions or source receipts from earlier steps may already exist; inspect the current state before repeating them.

The leading space separates the unchanged canonical size/ceiling/reduction
sentence from the suffix. No duplication of that sentence, code/status table or
estimator. No mutation of errors/options/refusal arrays. Other classifications,
including provider-token failures that also classify as TOKEN_LIMIT_EXCEEDED,
remain byte-identical even with this option.

Both AnA catches narrow with `instanceof` the canonical context-budget class,
call the existing classifier with the option true and use the canonical HTTP
table. Do not branch on error name, text or classifier code alone. Classic JSON
returns 413 with `{ error: classified.message, code: classified.code,
turnRecord }`. SSE error events carry the same message/code and existing record;
pre-header refusal uses the existing `sendError` envelope at 413, with its record
in `error.details.turnRecord`. Existing budget422 and generic paths remain
unchanged. Preserve failed partial answer/control records; cancellation keeps
its stopped outcome. A refused gateway invocation did not dispatch a provider,
but earlier invocations, tool actions and host-admission receipts may exist.
Do not claim whole-turn rollback, empty results or safe blind repeat.

Qualification-stage clarification: closing the existing `TurnTimeline` can
write a frame before the catch checks headers. For a typed context refusal
that arrives before headers only, suppress the timeline sink's socket write
while retaining its existing recorder/mirror event. This keeps the JSON413
carrier reachable. Leave timeline emission for all other errors unchanged;
no new timeline API or record path.

Reach `TOKEN_LIMIT_EXCEEDED` in the existing client recovery helpers. Empty
replies display the existing sanitized server message for that whitelisted code;
partial replies preserve their text and add that recovery as a warning. Both
retain refusal code/record and stop the spinner, without automatic resubmission.
Use the existing `serverMessage` sanitizer; arbitrary generic error messages
must not become displayable. If a context message is missing, empty or rejected
as internal, use fixed fallback guidance:

> This conversation is too large for one AI request. Reduce the input or start a new conversation with a smaller selection. Some actions or source receipts from earlier steps may already exist; inspect the current state before repeating them.

For this code only, the non-2xx path retains the sanitized message and a valid
top-level or `error.details.turnRecord` record using `readTurnRecord`. A valid
record sets the existing server-stated-record flag. Missing/malformed records
remain unconfirmed under existing behavior; do not manufacture recording.
Existing generic/budget422/auth/run-limit recovery behavior and audit warnings
remain unchanged. Existing helpers/paths are extended in place.

## Qualification and boundaries

Read-only gateway and host audits reviewed the approach; the host audit found
the necessary client carry. Contract approval precedes test delegation. Freeze
meaningful red cases and exact hashes against unchanged baseline inputs before
production edits; lint test files before freeze to avoid structural refreezes.

Disjoint owners qualify classifier compatibility, mounted classic carrier,
mounted SSE/partial/stopped carrier, client empty/partial/non-2xx recovery, and
native executor/real gateway admission boundaries. The existing full-request
gate needs regression controls, not an invented new limit. Clearly label
scripted gateway/source/writer seams. No live provider/DB, exact tokenizer or
serialized provider payload size, multilingual relevance, receipt rollback or
agency acceptance is claimed. Finish normal direct pushes, full TypeScript,
remote Git-byte/ancestry checks and a clean synchronized branch.

## Integration amendment — 2026-10-23

Incoming canonical commit `55f75b72fac95a387d3b72e82a1998a08ff5ef96`
contains DT3 detachment and authoritative run-row stop handling. Its confirmed
stops close with `done` (the stop reason) and `post_done` (the stopped record),
including a concurrent context refusal. The SSE error carrier specified above
applies when the turn has not been authoritatively stopped. Retain context
error diagnostics in the existing record where the stop/error path records
them; preserve partial answers, exact tool results and record authority.
The pre-header 413 and non-stopped context refusal behavior are unchanged.

The original frozen test and 970-test qualification remain historical evidence
for `a8d76dcece377f6c347ead2f9185681fb832b40d`. The single outdated cancellation
carrier assertion failed after the merge; its exact bytes are retained in
[root/stream-context-window-refusal.pre-detach.ts.txt](root/stream-context-window-refusal.pre-detach.ts.txt),
with the original hash in `frozen-tests.json`. The live assertion now requires
stop framing, retained partial answer, raw result SHA-256 and a stopped record;
an additional administrator row-before-abort case verifies the new race.
Fresh merged-tree qualification is recorded separately under `root/resume-*`.
