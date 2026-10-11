# ANA-SUMMARY S1 — reads deliver what they record (2026-10-08)

Design: `docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md` §1b ("Read many documents"), §5 S1, "Decisions taken".
Product decision: P-24 in `docs/LAUNCH_DEFINITION_OF_DONE.md` — `RESULT_BUDGET = 5000` is the one read window for
every windowed read. Lane: ANA-SUMMARY (founder-directed, moves no D-row).

## Defect

`read_project_document` served a 30,000-character window by default (80,000 at most) and wrote a read receipt for the
whole window before returning. The model is sent at most 8,000 characters of any tool result — head and tail, middle
cut (`capToolResultForModel`) — and less when a round's results exceed 24,000 (`budgetToolResultsForModel`).

So:
- a receipt said the model had read text it never received;
- `catalog_project_document`'s full-coverage gate passed on that receipt;
- the next offset the read reported skipped the cut middle, so even a model that kept reading never saw it.

## Cause

The receipt was written by the handler, which cannot know what the round's budget will do to its result. The budget
treated a read like any other result: cut to fit.

## Fix

| Piece | File |
|---|---|
| `RESULT_BUDGET = 5000` lives beside `capToolResultForModel`; authoring reads, the regulatory and CMC knowledge tools and the tool definition import it (no other copy remains) | `server/services/ana/agentic-loop.ts` |
| `budgetToolResultsForModel` takes `wholeOrNothing` (tool-use id → read start). Such a result is never head/tail cut: it is delivered whole, or replaced by `{"delivered":false,"reason":"This round returned more than can be read at once.","readAgainFrom":<offset>}`. Over the round budget, these are placed first in call order, each while it fits beside a 1,500 floor for every cuttable result; cuttable results share what is left exactly as before. With none, behaviour is byte-identical to before. | `server/services/ana/agentic-loop.ts` |
| New module: deferred receipts keyed by tool-use id (holding the exact result string issued), `coverageAfter`, `fitReadWindow` (bisects the window so the serialized result fits `RESULT_BUDGET`; shared with the authoring read), and `settleReadReceipts(original, budgeted, deferred)`, which writes a receipt only when the handler's result and the budgeted result are both byte-identical to the string the receipt was issued with | `server/services/ana/read-receipts.ts` |
| The read handler sizes its window to fit `RESULT_BUDGET` (default and max 5,000 characters of text, shrunk further for escapes and metadata), registers a deferred receipt instead of writing one, and reports coverage "after this window" — true exactly when the result is delivered. Outside a settling host it records nothing and says so. A comprehension record too large to leave 1,000 characters of text gives way, and the result says so. | `server/services/ana/document-catalog-tools.ts` |
| Both loop hosts make a per-round receipt map, pass `toolUseId` + `readReceipts` in each call's context, budget with `wholeOrNothing`, then settle | `server/routes/ana-ri/stream.ts` (executeTools), `server/services/ana/AnaToolExecutor.ts` (`executeAgenticLoop`) |
| `ToolContext` gains `toolUseId` and `readReceipts` (set by hosts only, never from input) | `server/services/ana/AnaToolExecutor.ts` |
| The model-facing description and `max_chars` say what the tool now does, including the not-delivered shape | `server/services/ana/document-catalog-tool-defs.ts`, `docs/ana-capability-manifest.json` (that entry only, computed from the live definition) |

## Red → green

The four tests the design names, run through **both** loop hosts with the real read and catalog handlers and the real
round budget; only the model (a scripted gateway that reads as each result tells it to) and the database (an in-memory
Vault applying the real `computeCoverage` / `assertCatalogWriteAllowed`, `server/services/ana/__tests__/support/read-delivery-vault.ts`)
are stood in for. "What the model received" is the gateway's own copy of each request.

The suites also stand in at `requireDocumentAccess` / `requireCatalog`, which hand over the in-memory service directly.
Reason, reproduced with four parallel `requireDocumentAccess` calls: under vitest, concurrent first `import()`s of a
mocked module hand the unmocked one to all but one caller (a mocker artifact; ESM gives production one namespace), and a
round of parallel reads is exactly the case under test.

- `server/services/ana/__tests__/read-delivery-executor.test.ts` (host: `executeAgenticLoop`)
- `server/routes/ana-ri/__tests__/stream-read-delivery.test.ts` (host: the SSE route)

| # | Case | Red before the fix (`red-before-fix.txt`) | Green after |
|---|---|---|---|
| 1 | 60,000-char document, default read | stream: the model received 7,999 characters, not JSON (cut); receipt `0–30000` | result ≤ 5,000; receipt = the window in that result |
| 2 | Six ~5,000-char reads in one round | every read cut ("truncated to fit the model context"); receipts for all six, e.g. `3000–20000` | reads 1–4 whole with receipts; 5–6 are `{"delivered":false,…,"readAgainFrom":2000/3000}` with no receipt |
| 3 | `catalog_project_document` after a read that never reached the model whole | catalog accepted (`ok: true`) after one 30,000-char read | refused: "only N of 30000 characters" |
| 3b | Control (executor host): reads that each continue where the last left off let the catalog through | only one read happened (the cut result could not be followed) | several contiguous reads to 12,000; catalog `ok` |
| 4 | Sentence planted at 6,000–7,000 of 40,000 | a receipt covered it; the model received none of it (it fell in the cut middle) | every receipt covers only text the model received, and the sentence is in it |

Counts: **red 9 failed / 9** (`red-before-fix.txt`) → **green 9 passed / 9** (`green-after-fix.txt`).
Unit suite for the new pieces, `server/services/ana/__tests__/read-receipts.test.ts`: 13 / 13.

### The fix itself, made to fail (`mutations.txt`)

Run in a scratch export of HEAD plus these changes only (not the shared tree). Each mutation turns tests red:

| Mutation | Red |
|---|---|
| M1 stream host does not settle | stream 1, 2, 4 |
| M2 stream host budgets reads as cuttable | stream 2 |
| M3 executor host does not settle | executor 1, 2, 3b, 4 |
| M4 executor host budgets reads as cuttable | executor 2 |
| M5 settle ignores what the budget sent | executor 2, stream 2, unit settle |
| M6 handler serves a 30,000 window again | stream 1, 2, 4; executor 1, 2, 3b, 4; two unit cases |

## Existing tests kept green

- 202 related files (every test naming agentic-loop, document-catalog, authoring-read-tools, the read/catalog tools,
  the budget functions, read receipts or coverage, the knowledge-tool budgets, `executeAgenticLoop`, tool
  definitions/authorization, plus every `server/routes/ana-ri/__tests__` suite): **199 passed, 1 skipped, 2 failed**
  (`related-suites-after.txt`). Both failing files fail identically on an untouched export of HEAD
  (`preexisting-at-HEAD.txt`): `stream-tool-carry-over.test.ts` (1 test, which tools a follow-up turn is offered) and
  `tests/lineage/founder-path-lineage.pglite.test.ts` (9 tests, from the seal hop on). Neither involves reads.
- Real database (`dbtests-after.txt`): a freshly provisioned database (`scripts/db/provision-test-db.sh`,
  `RLS_ENFORCE=on`): `document-catalog`, `document-catalog-recall`, `ana-vault-search-no-key`, `vault-chunking-off` —
  **34 / 34**. Receipts are written by `settleReadReceipts` under the tenant scope with RLS enforced.

### Tests changed, and why

- `server/services/ana/__tests__/document-catalog-tools-project-scope.test.ts`, "the open project's own document is
  read": asserted the read handler wrote a receipt itself. S1 removes exactly that; the test now asserts the read
  defers a receipt for the exact window and writes nothing.
- `tests/db/document-catalog.dbtest.ts`, `tests/db/document-catalog-recall.dbtest.ts`: `callTool` called the handler
  bare, outside any loop host. Under S1 a bare read records nothing (fail closed), so HEAD's suite turns red on
  "after reading ALL of it" (`head-dbtest-against-fix.txt`). `callTool` now goes through the new shared helper
  `tests/db/ana-tool-call.ts` (`callToolAsTurn`): the read defers its receipt and is settled as delivered unchanged,
  as a turn whose round fits its budget does. One comment ("max_chars floor is 1000") corrected.
- No test asserted only the old 30,000 window.

## Static checks

- ESLint, per changed file against HEAD: no file gained a warning (`lint.md`). `executeAgenticLoop` briefly crossed
  the 100-line function limit (103) and was brought back under it.
- Scoped type check (no whole-project `tsc`): a program rooted at the 16 changed files (1,554 project files reached).
  No diagnostic on any line this change touched. The two diagnostics inside changed files are pre-existing `.js`
  client imports in `AnaToolExecutor.ts` (lines 48, 168, TS7016) that lack declarations only because a scoped program
  skips the project's global includes. Shown able to fail: a deliberate `toolUseId: 42` in `read-receipts.ts` is
  reported (TS2322).

## Browser acceptance — not run

Not feasible as specified, so not claimed:
- the QA model stand-in (`docs/evidence/W1/2026-09-28-ana-drive/harness/stand-in-model.mjs`) scripts only the
  self-drive tools; it never calls `read_project_document` or `catalog_project_document`, and the criterion ("the
  planted heading is in the answer") needs a real model composing an answer;
- `catalog_project_document` is gated on `ana.document_catalog`, which this slice was told not to turn on.

The route-level suite above drives the same path through the real SSE route.

## Not covered here

- Settlement happens after budgeting, as designed. If the turn ends before the next model call (a stop, a run whose
  hold expired — `halt` — or a failed model call), receipts are written for results no model call carried.
- `read_uploaded_document` (chat uploads) still defaults to a 30,000 window and is still head/tail cut. It keeps no
  receipts, but its next offset skips the cut middle. P-24 names it; S1's file list does not.
- The step row in the transcript shows the read's own result even when the model was sent `delivered:false`; the
  turn record's `sentToModel` has the truth. S3/S4 territory.

## Files here

- `red-before-fix.txt` — both host suites on the unchanged code (9 failed / 9).
- `green-after-fix.txt` — the host suites, the unit suite and the updated project-scope suite after the fix (36 / 36).
- `mutations.txt` — the six mutations of the fix and what each turned red.
- `related-suites-after.txt` — the 202 related files, totals and the failing tests.
- `preexisting-at-HEAD.txt` — those failures on an untouched export of HEAD.
- `dbtests-after.txt` — the four database suites on a fresh database, RLS enforced (34 / 34).
- `head-dbtest-against-fix.txt` — HEAD's catalog database suite against the fix (why its `callTool` changed).
- `lint.md` — ESLint per changed file, HEAD vs now.
