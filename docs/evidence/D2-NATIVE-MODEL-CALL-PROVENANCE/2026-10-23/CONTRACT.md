# Complete native model-call provenance — D2 / W2

## What already exists

[INVENTORY.md](INVENTORY.md) records source, consumer and deleted-history
searches. The gateway adapter already emits `onModelResponse`; the shared native
collector/writer omits it; the canonical recorder, model reader and authoring
qualification already support the resulting per-call metadata. This completes
that existing path without a second recorder, policy or observer mechanism.

## Interface and behavior

Extend `loopToolCollector()` with `servedCalls` and `onModelResponse(response,
round)`, while preserving `calls` and `onToolExecution` behavior. A served-call
entry has only `round`, `provider`, `model` and `requestId`. Copy the primitive
metadata immediately, in callback order; preserve each call even when the same
model serves again. Empty/non-string metadata becomes null, using the helper's
existing non-empty-string rule. Unknown authors remain recorded. Do not retain
response objects, content, usage, tool arguments or other response fields in
this new list, and do not mutate any response.

`recordLoopTurn` accepts optional `servedCalls` (readonly list). Replay these
through existing `TurnRecorder.addServed` in order; its own numbering and the
supplied round (0 first, then 1+) are authoritative. `sent` remains null, because
this door did not report dispatch parameters. Preserve the final top-level
model/answer behavior. Existing omitted/empty observation lists preserve legacy
fallback and its exact existing warning. A nonempty list uses accurate warning
copy: model calls are recorded, while tool-step round assignments and later
model inputs remain unavailable. Do not imply those gaps have been closed.

All three current hosts pass the collector's existing-model observer into
`executeAgenticLoop` and its collected `servedCalls` into `recordLoopTurn`.
Returned gateway metadata is authoritative, never a requested alias, composite
display model or assumed provider. Existing `servedModelsOf` and qualified
`servedBy` consume it unchanged. Earlier unknown/unqualified models must not be
hidden by a later known model. Repeated calls remain distinct in the record;
the canonical author reader continues its own deduplication.

A gateway call that throws adds no invented served entry. Preserve earlier
successful responses on late failed/stopped turns, original error identity,
existing context413/raw-budget422/generic carriers, raw tool results, record
outcomes, tenant/actor binding, cancellation and SDK call counts. A first-call
failure with no returned response names no new model. Callback metadata is
host observation, not proof of provider delivery or new model approval.

No gateway/adapter/core-loop, schema, dependency, surface, tool, model, approval
policy, summary display-model, later-input trace or round-count change.
Root owns all production edits and Git on `concept2cure-v2`. Workers own disjoint
new tests/evidence only after this contract. No branches, PRs, force or hook bypass.

## Verification

Freeze semantic red tests against unchanged selected baseline inputs before
production edits. Do not count missing exports, thrown missing callback methods,
fixture faults or lint failures as useful red evidence. Call existing hook seams
optionally so absent wiring fails on the recorded facts instead. Include passing
legacy/no-observer/first-failure controls, exact chronology/request IDs, detached
metadata, repeated/unknown author handling, three-host answered and late failure
or stopped carry, and canonical author qualification. Reuse existing real adapter
chronology/observer-fault controls unchanged. Label scripted gateway/host/writer
boundaries and real PGlite/chained record persistence accurately.

Finish included lint with no warning growth, relevant regression suites, normal
direct push with whole-tree TypeScript zero errors, fresh remote Git-byte/ancestry
verification and all evidence committed to the canonical branch. Offline fixtures
do not claim a live provider, deployment, complete request trace or agency approval.
