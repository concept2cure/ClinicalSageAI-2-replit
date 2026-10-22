# D2 / W2 — existing aggregate result budget

## What already exists

- `server/services/ana/agentic-loop.ts`: canonical 8,000-character per-result
  cap, 24,000-character round target, 1,500-character ordinary floor, private
  whole-or-nothing read placement and named passage whole-or-withheld policy.
  Ordinary floors and irreducible replacements can exceed the target. The
  classic truncation marker itself is not sized to an exact requested limit.
- `server/services/ana/read-receipts.ts`: private deferred receipt identity,
  guarded handoff and settlement; replacements must retain exact
  `notDeliveredResult(offset)` bytes, never sliced read text or invented offsets.
- `server/services/ana/tool-output-frame.ts`: canonical untrusted-data framing
  adds a notice and closing-tag escapes after body budgeting. Headers, framing,
  adaptation guidance, prior history and operator turns are separate costs.
- `server/services/ana/AnaToolExecutor.ts` and
  `server/routes/ana-ri/stream.ts`: both already use the canonical budget before
  read guard/settlement, grounding and framing. The classic staging observer
  and SSE recorder already retain exact staged bodies.
- `server/services/ana/sub-agent.ts`, `sub-agent-shape.ts` and
  `sub-agent-stream.ts`: new traces retain staged bodies; ambiguous modern
  fields fail closed; legacy ordinary replay retains historical behavior and
  legacy passage/read rounds do not reconstruct evidence.
- Existing pure budget, private read, passage, native host, child and outcome
  suites qualify these paths. Some explicitly preserve the floor exceeding the
  target. This work must name any intentionally superseded expectation.

Root searched round/result budget, cap, truncation, whole-or-nothing, framing,
tool-call limits and every canonical budget consumer; routes, services, client
surfaces, schema/migrations and designs have no second aggregate implementation.
Deleted-history searches for budget/tool-output/agentic-loop/round-result names
returned no replacement. The previous passage-round delivery increment
explicitly left a hard aggregate bound and framing overhead open.

This inventory precedes read-only audits and interface design. Extend the
existing budget path without adding tools, providers, models, schemas or user
surfaces. Root owns production and Git; workers get disjoint test scope after
the interface contract is reviewed.
