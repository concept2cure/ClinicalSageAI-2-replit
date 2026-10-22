# Complete existing passage round delivery — D2 / W2

Baseline `cb4065898efa6c1422ea5fb3b3a995de069e7569`, 2026-10-21.
Root owns production and Git. Test owners receive disjoint new files only after
review. No new provider, model, dependency, schema, tool or user surface.

## What already exists

[INVENTORY.md](INVENTORY.md) records code/name/route/schema/surface and deleted
history searches before design. Canonical pieces being completed:

- `server/services/ana/agentic-loop.ts`: existing per-result cap, round target,
  ordinary-result floor and private whole-or-nothing read placement.
- `document-passage-tools.ts`: already fits complete passage JSON and locators
  at 7,500 UTF-16 units; later round slicing still corrupts it.
- `read-receipts.ts`: existing private source snapshot, handoff and settlement.
  Protection must not manufacture a read receipt or provider-delivery claim.
- `AnaToolExecutor.ts` and `server/routes/ana-ri/stream.ts`: existing hosts,
  body/corpus/framing pipeline. Stream shortfall notes currently use raw output.
- `tool-outcome.ts`: existing misses/outages/known-match omissions and notes.
- `sub-agent.ts`, `sub-agent-shape.ts`, `sub-agent-stream.ts`: existing raw child
  trace, stripped public view and replayed evidence. Replay lacks private read
  placement and can reorder completed calls. Stream `turn-record.ts` already
  records staged bodies, but the classic child has no equivalent observer.

## Approved interface and behavior

1. Inside the same budgeter, exact server-authored tool name
   `search_document_passages` selects whole-body protection for every outcome.
   No parsing payload fields into authority. An explicit `wholeOrNothing` map
   entry takes precedence and retains exact `notDeliveredResult(offset)` bytes.
2. Keep existing private-read placement/admission and its floor reservation
   unchanged. Then reserve ordinary floors plus the fixed replacement cost for
   every non-read passage call. Admit eligible passage bodies in call order by
   their additional cost over the replacement. Always keep an eligible body no
   longer than its replacement. An over-per-result-cap passage is never eligible.
   Remaining ordinary shares use `min(perResultMax, share)` in this new branch,
   preventing later classic capping from changing the corpus again.
3. A passage goes byte-for-byte whole or becomes fixed complete JSON:
   `delivered: false`, `code: 'PASSAGE_RESULT_WITHHELD'`, fixed `message` saying
   the round withheld the result, no inference of matches/absence, narrow the
   query or read a known source. The envelope fits the classic cap's minimum
   200-character limit. It copies no payload text, citations, counts, scope,
   errors, offsets or receipt fields. No `ok`, `error` or result-list field.
4. With no named passage entries outside the private map, existing budgeting
   is byte-identical. Existing defaults, floors, read decisions, cancellation,
   current-source guards, settlement and untrusted framing stay unchanged.
   This is whole-or-withheld integrity, not a new hard aggregate bound: floors
   and irreducible replacements can exceed tiny custom totals or large rounds.
5. Existing `shortfallOf` gains strict kind `'withheld'` for exact code plus
   `delivered === false`, after refusal, declared status and nonempty records.
   Guidance never asserts known matches. Existing notes without withheld results
   remain byte-identical, including known-match omission guidance. Stream notes
   read the actual budgeted passage body by call id; other raw-note behavior
   stays unchanged. Classic replacement carries its own recovery guidance.
6. Extend existing `AgenticOptions` with optional observer
   `onToolResultsForModel(entries: readonly ToolResultEntry[], round: number)`.
   At classic `callModel`, after its early abort check, snapshot the exact
   classic-capped result bodies used to form that request. Invoke through
   existing `notifyObserver`, with detached array/entries after formatting so
   mutation/throws cannot alter handoff. This observes host staging, not service
   by a provider; an aborted pre-handoff round has no observation.
7. Extend existing record-only `AgentStep` with optional `toolUseId` and
   `modelContent` for historical compatibility. The child stores server event
   call id; the observer attaches staged content only to exactly one same-round
   step matching id and tool name. Duplicate ids/correlations fail closed. Raw
   result remains unchanged. Payload/input fields cannot supply these values.
   Existing public/model view continues stripping the entire trace.
8. Child evidence consumes the exact staged body for successful new steps with
   valid unique ids; missing/invalid staged content never falls back to raw
   replay. Presence of either new field marks a new-format round, even if its
   value is invalid; that round uses only its valid recorded bodies. Legacy
   rounds without ids retain replay over all calls before filtering successes,
   except rounds with `read_project_document` or `search_document_passages`:
   private receipt state, completion order and the historical passage slicing
   policy prevent reliable reconstruction, so they contribute no replayed
   evidence. Ordinary legacy replay retains its existing limitations, and is
   not proof of exact historical handoff. Trace remains available for inspection.
   No child's report, checks,
   or forged nested payload fields become source evidence.

## Proof and publication

Freeze meaningful fail-first tests before production: canonical admission and
legacy invariants; real stream body/corpus/note/framing; real classic staging
observer; real child recording and evidence; strict withheld outcome semantics.
Use existing seams and independent expected shapes/order, not the budgeter as
its own oracle. Native handlers/retrieval/provider/DB substitutions are stated
per owner. Preserve frozen hashes and raw logs. Root-only production edits.

Final canonical Node22 Vitest, one worker/4 GiB heap, targeted regressions and
scoped lint with no growth; independent source reviews; normal hooks including
full-project TypeScript zero; direct canonical push, ordinary merges/conflict
resolution, fresh remote Git-byte and retained-ancestry verification, clean and
local=remote. No PR, alternate branch, force push or hook bypass.

No live model/database, provider-delivery receipt, source-access admission,
multilingual relevance or agency acceptance is qualified by synthetic fixtures.
Framing overhead and general all-tool hard aggregate size remain separate.
