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

Pending: disjoint fail-first suites, source pins, final regression, scoped lint,
normal push hooks/whole-project TypeScript, remote Git-byte/ancestry verification
and clean synchronized branch evidence. Raw result bodies are the only size
claim; framing, guidance, history and total provider request size remain outside
this bound. A refused handoff can follow completed tools or persisted receipts;
it does not roll them back.
