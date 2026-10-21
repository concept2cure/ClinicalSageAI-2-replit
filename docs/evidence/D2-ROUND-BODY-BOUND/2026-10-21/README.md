# Complete the existing raw round-body bound — D2 / W2

This increment completes the existing allocator's hard raw-body limit in the
two actual hosts. [CONTRACT.md](CONTRACT.md) fixes the opt-in interface and honest
failure semantics before production changes. Work remains on `concept2cure-v2`.

## What already exists

- `server/services/ana/agentic-loop.ts` already owns per-result caps, the round
  target/floor, private whole reads and passage whole-or-withheld placement.
  Floors and irreducible replacement costs can exceed the target.
- `server/services/ana/read-receipts.ts` already guards source identity and
  settles host-admission receipts. Its late refusals can enlarge bodies.
- `server/services/ana/AnaToolExecutor.ts` and
  `server/routes/ana-ri/stream.ts` already allocate, guard, settle and stage;
  their observer/recorder/corpus are the verification seams. Ordinary stream
  shortfall notes still inspect raw bodies. Checkpoint replan results bypass
  execution; the actual staging boundary must also assert the aggregate and
  preserve the accepted bodies without recapping.
- `server/services/ana/tool-output-frame.ts` adds framing overhead separately.
  `server/services/ana/sub-agent-stream.ts` preserves legacy replay, while
  modern child evidence consumes staged bytes.
- `server/routes/chat/send-message.ts` and the stream catch already persist
  failed turn records; classic chat currently labels all executor failures as
  provider outages. Existing tests qualify these paths.

[INVENTORY.md](INVENTORY.md) records pre-design searches, including deleted
history. These existing implementations are extended in place. No tool,
provider, model, dependency, schema, surface or filing authority is added.

## Qualification

Five disjoint owners froze **53 tests: 36 intended failures, 12 passing controls
and five explicitly skipped new-export assertion cases**. The failures are actual
over-budget output, incorrect protected replacement, absent refusal or incorrect
host error behavior; missing exports do not supply red results. All 21 selected
baseline inputs were unchanged. Commands, exact raw logs, hashes and seam limits
are in [budget](budget/SUMMARY.md), [executor](executor/README.md),
[receipts](receipts/README.md), [stream](stream/README.md) and [chat](chat/README.md).

The first regression passed 613 tests / 37 suites. Scoped lint then identified
two long test-group callbacks. Root split only their `describe` wrappers,
retaining every assertion/fixture and the original frozen sources/transcripts.
The two revised suites were rerun against the byte-identical original production
baseline: **10 intended failures, four controls and two explicit skips**, with
all selected inputs unchanged before and after. Reviewed production bytes were
then restored exactly. [layout-review](layout-review/refrozen.json) records this
structural refreeze, original sources, diffs and baseline replay;
[frozen-tests.json](frozen-tests.json) pins the final layouts. Earlier flawed
fixture attempts remain separately labeled in each owner's evidence.

Final regression and publication results are recorded with their commands under
`root/` and in the publication supplement. Scoped lint across all nine changed
TypeScript files has **zero errors and no warning growth**: the same 138 existing
warnings in the large stream, executor and chat hosts, zero in every other file.
No suppressions or warning baselines changed. Three independent production
reviews cleared the strict allocator, native host ordering and narrow error
handling. Selected source pins are not an exhaustive dependency graph.

Both actual hosts opt into the existing allocator's strict post-pass. It reduces
ordinary, then passage, then private-read contributions in reverse call order,
using only smaller fixed truthful replacements; impossible per-call minima
refuse handoff. Final non-mutating checks after settlement and at staging cover
late source-refusal growth and redirected rounds. Accepted bodies are framed
exactly, without recapping after corpus/recorder admission. Stream shortfall
notes use actual staged bodies. Typed SSE/chat errors preserve failed records
and explain that earlier actions or source receipts may already exist.

Raw result bodies are the only size claim; framing/escaping, guidance, history,
tokens and total provider request size remain outside this bound. A refused
handoff can follow completed tools or persisted receipts; it does not roll them
back. The existing parent `run_agent` corpus exception still uses validated
child-host evidence; ordinary/passage equality fixtures do not qualify all
parent-tool corpus behavior. Legacy ordinary child replay retains its original
policy and bytes. No live provider/database, current-source admission,
multilingual relevance or agency acceptance is claimed by synthetic fixtures.

Raw `.txt` transcripts retain exact bytes, including terminal whitespace. ESLint
summaries omit duplicated source fields while recording raw stdout hashes.
