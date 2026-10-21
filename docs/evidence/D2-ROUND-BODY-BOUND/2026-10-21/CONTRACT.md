# Complete the existing raw round-body bound — D2 / W2

Baseline: `8c6bd712ecbf0e8e6a62cd581d1b1f7186b98aaf` on
`concept2cure-v2`. Root owns production and Git. Tests are frozen against this
baseline before production changes. No new tools, providers, models,
dependencies, schemas, surfaces or filing authority.

## What already exists

- `server/services/ana/agentic-loop.ts` owns the current 8,000-character cap,
  24,000-character target and 1,500-character floor, private read placement and
  passage protection. Ordinary floors and minimum replacements can exceed the
  target. Extend this allocator, never create a parallel budget implementation.
- `server/services/ana/read-receipts.ts` owns deferred read identity, current
  source guards and receipt settlement. Guards and settlement withdrawal can
  enlarge bodies after allocation; receipts describe host admission, not
  provider delivery. The exact `notDeliveredResult(offset)` remains authoritative.
- `server/services/ana/AnaToolExecutor.ts` and
  `server/routes/ana-ri/stream.ts` already allocate, guard, settle, then stage
  results. The classic observer and stream recorder/corpus already expose the
  controlled staging seam. The stream shortfall note still reads raw ordinary
  bodies, which can contradict what was staged.
- `server/services/ana/tool-output-frame.ts` adds headers, a notice and escaping
  after budgeting. Framing is a separate cost; this increment does not claim a
  total request or token bound.
- `server/services/ana/sub-agent-stream.ts` replays legacy ordinary results
  through the existing default allocator. Modern child traces use actual
  staged bytes. Legacy replay must remain unchanged.
- `server/routes/chat/send-message.ts` labels executor exceptions as provider
  failures. Its existing failed-turn record is retained, with a narrow typed
  overflow response. The SSE catch already records failed partial turns.
- Existing budget/private-read/passage/host/child/outcome suites qualify these
  paths. `INVENTORY.md` records pre-design source and deleted-history searches.

## Approved interface and behavior

Add optional `strictTotal?: boolean` to `ToolResultBudgetOptions`. Omitted or
false preserves the existing allocator bytes and historical floor-over-target
behavior. Both actual hosts opt in; historical replay does not.

Strict mode reconciles the existing allocator's candidate array. If its raw
body character sum fits, return unchanged. Otherwise replace positive-size
contributions in this deterministic order: ordinary results, named passage
results, private-map reads; reverse call order within each class. Private-map
membership takes precedence over tool name. Replace only when smaller than
the current body. Never drop/reorder calls, change IDs/names, slice a retained
protected string, copy untrusted metadata into a replacement or mutate input.

Ordinary replacement is fixed JSON with `delivered: false`,
`code: 'TOOL_RESULT_WITHHELD'`, and guidance that the result was withheld, no
success/failure/absence can be inferred, work may already have completed, and
current state must be inspected before repeating an action. Passage replacement
is the existing exact `PASSAGE_RESULT_WITHHELD` JSON. Private reads use the
existing exact `notDeliveredResult(read.span.start)` bytes. A short original
is never enlarged merely to install a replacement.

Export `ToolResultBudgetExceededError` with fixed code
`ANA_TOOL_RESULT_BUDGET_EXCEEDED` and this fixed safe message:

> This tool round could not be passed to the assistant within its result limit. Some actions or source receipts may already exist; inspect the current state before repeating them.

If positive reductions cannot fit, throw this typed error. Invalid strict totals
(nonfinite or negative) also refuse deterministically. Export non-mutating
`assertToolResultBodyBudget(entries, totalBudget = 24000)` with the same refusal
for an aggregate above the limit or an invalid total. Sum UTF-16 string lengths,
the existing budget unit. A zero total admits an empty array/empty bodies only.

Both native hosts allocate with strict mode before source guards/settlement,
then assert the entire final array after settlement and before recorder, corpus,
observer, framing/staging or the next gateway call. Do not reallocate after
receipt settlement. Initial irreducible overflow creates no new receipt
settlement; late assertion refusal may follow receipt persistence. Neither
refusal rolls back tools, raw UI events or prior receipt outcomes. Cancellation
and existing source identity checks remain authoritative.

Assert again at each actual host staging boundary, before recording/framing or
observer notification. A checkpoint replan creates redirected results outside
`executeTools`; those must also fit or refuse the next call. Stage the accepted
bodies exactly, without recapping after recorder/corpus admission. Allocation
remains the canonical place for ordinary per-result capping. Redirected results
are already host-authored control messages; no tool ran in that replaced round.

SSE shortfall notes consume actual staged bodies for all tool names, with no raw
fallback. The fixed ordinary envelope is self-guiding and conveys no count or
operation verdict. No extra outcome taxonomy is needed. Existing passage
withheld guidance remains unchanged.

SSE exposes the typed code/message through its existing failed-turn error event
(and its pre-header error response if applicable). Classic chat returns a narrow
422 typed code/message plus its existing failed turn record, rather than calling
this a provider outage. Other error branches retain their behavior.

## Scope and verification

The guarantee is raw result bodies at the controlled host seam, not headers,
framing/escaping, adaptation/operator turns, history, tokens, total request size,
provider receipt/comprehension, rollback or agency acceptance. A pathological
call count can fail closed when minimum truthful per-call results do not fit.

Two read-only audits reviewed this interface before test delegation. Disjoint
workers freeze pure strict/legacy invariants, classic host ordering/receipt and
failure behavior, mounted SSE staging/notes/failed records, and classic chat
typed response. Root changes production only after hashes, meaningful red runs
and baseline pins are recorded. Native host tests use deterministic mocked
tools/providers; no live provider/database qualification is claimed.
