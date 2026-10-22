# D2 / W2 — existing round-budget inventory

## What already exists

- `server/services/ana/agentic-loop.ts`: canonical `budgetToolResultsForModel`,
  classic 8,000-character cap and separate 24,000-character round target with
  a 1,500-character floor. It already supports whole-or-nothing deferred read
  receipts; ordinary results still undergo head/tail slicing under pressure.
- `server/services/ana/document-passage-tools.ts`: canonical passage handler
  already fits complete JSON at 7,500 UTF-16 units, retains whole locators and
  explicitly counts omitted matches. It does not protect the completed result
  against a later round squeeze. No replacement passage handler is needed.
- `server/services/ana/read-receipts.ts`: existing private deferred read receipt,
  current-source handoff guard and guarded settlement. Receipts are delivery
  candidates, never provider-delivery proof. Passage results do not gain read
  receipts or source authority through budget handling.
- `server/services/ana/AnaToolExecutor.ts` and
  `server/routes/ana-ri/stream.ts`: hosts already call the canonical budgeter,
  then read guards/settlement, record sent content, and pass budgeted strings to
  grounding before capping/framing for the next model turn.
- `server/services/ana/sub-agent-stream.ts`: reconstructs child evidence using
  the same budgeter over every call in each round before filtering successes.
  It deliberately excludes the child's report and documents the child/parent
  corpus distinction. Budget changes must stay reproducible here.
- `server/services/ana/sub-agent.ts` and `sub-agent-shape.ts`: existing child
  dispatch events retain full raw steps, then strip their record-only trace
  from the model/client view. Steps have no tool-use correlation or staged-body
  field. Raw replay lacks private read-map decisions and completion order can
  differ from call order. Extend this trace rather than inventing delivery proof.
  `turn-record.ts` already has `setSentToModel` for recorded streams; the classic
  `turn-record-loop.ts` collector records raw execution callbacks only. The
  classic child has no existing staged-body observer to reach.
- `server/services/ana/tool-outcome.ts`: existing strict all-omitted passage
  classification and truthful adaptation note; misses, omissions and explicit
  outages/refusals have different meanings. It has no round-withheld passage
  contract yet.
- `server/services/ana/tool-output-frame.ts`: existing untrusted-output framing
  after body budgeting. Framing overhead is separate from the raw-body budget.
- Existing budget/read-receipt, stream/executor delivery and child-grounding
  suites already pin these seams. The ordinary floor can exceed the round target
  for enough calls; this is a documented behavior, not a hard total-size bound.

Root searched budget/cap/truncation/whole-or-nothing/read-receipt/passage names,
all budget call sites and existing tests/designs; routes, services, client
surfaces, schemas and migrations have no second round-budget implementation.
`git log --all --diff-filter=D` for tool-budget/tool-output/agentic-loop/read-
receipt names returned no deleted replacement. The earlier passage-result
qualification explicitly left aggregate delivery open. This work will complete
the existing path without adding a tool, provider, model, schema or surface.

This inventory precedes read-only audits and interface design. Root owns all
production and Git; test work receives disjoint scope only after the interface
contract is reviewed.
