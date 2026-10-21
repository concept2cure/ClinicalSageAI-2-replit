# Complete existing passage round delivery — D2 / W2

This work completes the existing round budget and child trace so a passage
result is kept whole or explicitly withheld, and new child grounding uses the
exact bodies staged by its host. It adds no tool, provider, model, dependency,
schema, surface or filing authority. The [contract](CONTRACT.md) is committed
before production edits; test owners freeze meaningful failures first.

## What already exists

- `server/services/ana/agentic-loop.ts` already caps individual results and
  budgets a round, with private whole-or-nothing placement for deferred reads.
  Passage results still take the ordinary head/tail slicing path under pressure.
- `server/services/ana/document-passage-tools.ts` already fits complete passage
  JSON at 7,500 UTF-16 units with exact locators, coverage and omission guidance.
  This work protects that existing output after the handler; it does not repeat
  retrieval or add source admission.
- `server/services/ana/read-receipts.ts` and `source-read-receipt.ts` already own
  private receipt identity, current-source handoff and settlement. Their map
  priority and exact replacement bytes remain unchanged. A passage payload
  cannot create a receipt or a trusted read offset.
- `server/services/ana/AnaToolExecutor.ts` and `server/routes/ana-ri/stream.ts`
  already stage budgeted bodies, guard reads and frame tool output. The stream
  grounds against budgeted bodies, but its shortfall note reads raw output.
  The classic host has no staged-body observer for its child runner.
- `server/services/ana/tool-outcome.ts` already separates genuine misses,
  outages/refusals and known matches omitted by the handler. A whole result
  withheld by the round must not imply that any matches existed.
- `server/services/ana/sub-agent.ts` and `sub-agent-shape.ts` already retain raw
  dispatch steps in a record-only trace, stripped from the public/model view.
  `sub-agent-stream.ts` reconstructs grounding by replaying raw results. That
  replay lacks private receipt decisions and can use completion order instead
  of call order. The existing trace is extended to retain host-staged bytes.
- `server/services/ana/turn-record.ts` already records staged SSE bodies;
  `turn-record-loop.ts` collects raw classic execution events only. Its other
  callers are not upgraded by this child-specific observer wiring.
- `server/services/ana/tool-output-frame.ts` already neutralizes closing tags
  and restores original body bytes for inspection. It remains unchanged.

[INVENTORY.md](INVENTORY.md) records the pre-design searches, including deleted
history. These are completions of existing paths, without parallel replacements.

## Integrity contract and boundaries

The exact server-authored passage tool name selects protection. Existing private
reads retain their placement decisions and priority. The same budgeter then
reserves ordinary floors and fixed replacement costs before admitting passage
bodies in call order. Retained bodies and locators are byte-identical; withheld
ones become compact fixed `PASSAGE_RESULT_WITHHELD` JSON with no copied payload
facts, counts, source metadata or receipt fields. Ordinary shares in this branch
also honor the per-result ceiling. No-passage budgeting stays unchanged.

The strict withheld outcome and stream note describe the actual staged passage
body. Genuine misses, explicit outages/refusals, nonempty records and known-match
omissions keep their separate meanings and existing priority. Notes for rounds
without withheld results keep their existing bytes.

The classic host observer receives detached copies of the exact capped bodies
used to format its request. Observer failures or mutation cannot alter those
formatted messages. New child trace fields correlate by round, unique server
call id and tool name. Missing or ambiguous staged content fails closed; nested
tool/input fields cannot provide the correlation. Raw results remain recorded,
and the existing model/client view strips the whole trace.

Fully legacy ordinary rounds retain their prior replay behavior and limitations.
Historical passage/read rounds lack reliable staged bodies and contribute no
reconstructed grounding; raw records remain inspectable. A malformed new field
cannot cause a downgrade to legacy replay. Tool-returned provenance remains
separate from answer-grounding evidence.

The guarantee is whole-or-withheld integrity at the controlled host staging seam,
not a hard aggregate request bound or provider-delivery receipt. Ordinary floors,
tiny custom totals and irreducible envelopes can exceed the target; framing adds
overhead. Existing default limits do not increase. The current child toolset
offers passage search but excludes `read_project_document`; that toolset is not
widened. Pure trace fixtures cover private-read ambiguity separately from the
currently reachable child runner.

## Qualification

Five disjoint owners froze **118 tests: 55 intended failures and 63 passing
controls**, with all 26 root baseline inputs unchanged. Exact commands, raw
logs, hashes, selected input pins and seam boundaries are in [budget](budget/README.md),
[stream](stream/README.md), [outcome](outcome/README.md),
[executor](executor/README.md) and [child](child/README.md).
[frozen-tests.json](frozen-tests.json) binds those unchanged files.

The first full regression run passed 550 tests / 30 suites, but independent
review identified a custom-ceiling edge: shrinking a passage into a replacement
could change the decision to run private read placement. Two additional tests
first failed against that initial implementation, separately pinned in
[budget-review](budget-review/README.md) and
[review-frozen-tests.json](review-frozen-tests.json). The correction preserves
the legacy size calculation for read admission, including the opposite tiny-
ceiling case where a replacement grows. That proof is not misreported as a
failure against the original production baseline.

The final canonical Node 22 run passed **552 tests / 31 suites**, with one
worker and a 4 GiB heap. Scoped lint across 13 changed TypeScript files has
**zero errors and no warning growth**: the same 120 pre-existing warnings in
the two large hosts; all other changed files have zero warnings. Two new
warnings in the initial implementation were removed by extracting formatting
and classification helpers. Initial runs/findings remain retained. Three
independent final source reviews cleared the corrected implementation.

Raw `.txt` transcripts retain their exact bytes, including terminal whitespace.
ESLint JSON is explicitly a summary omitting duplicated source fields and
recording the raw stdout hash. Selected input pins are not an exhaustive
dependency graph. The publication supplement records actual normal hooks,
whole-project TypeScript and fresh remote Git-byte/ancestry/clean checks.

No live provider/database, multilingual relevance, source-access admission or
agency acceptance is claimed by synthetic fixtures. Fixture corrections before
freeze and the review-stage correction are retained as labeled earlier attempts.
