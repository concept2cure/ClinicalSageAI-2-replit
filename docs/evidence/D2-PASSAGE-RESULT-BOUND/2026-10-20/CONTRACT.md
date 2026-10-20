# D2 / W2 — complete existing passage-result fitting

Baseline `4282257ac3da9b1c5d15b8e7db6c7599f2388f28`, 2026-10-20.
Root owns production, the one superseded legacy expectation and Git. Test owners
have disjoint new files. No new tool, route, provider, model, dependency or schema.

## What already exists

- `server/services/ana/document-passage-tools.ts`: canonical registered search,
  scope gate, 7,500-character serialized result budget, exact model passage
  references, ordered context-text / hit-text / whole-passage reductions, honest
  ranking, coverage and omission notes. Its fitter deliberately retains one
  oversized locator; query echoes and diagnostic/error strings are unbounded.
- `server/services/ana/__tests__/document-passage-tools-budget.test.ts`: actual
  registered-handler fixtures already qualify ordinary fitting priority and
  retained references. One case explicitly accepts an 8,000-character title.
  Replace that unsafe expectation as part of completing the same fitter.
- `server/services/vault/document-passage-search.ts`: canonical actor/current
  source retrieval and coverage. Failure-reason count is bounded to three, but
  each reason can be large. Retrieval error text can be large too. Preserve the
  retrieval query, scope, hits, references and authority; no backend rewrite.
- `server/services/ana/document-tools-shared.ts`: existing access and caught-error
  wrapper. Keep it and add a tool-specific final size guard after it so early,
  success and error branches all have the same serialized bound.
- `server/services/ana/tool-outcome.ts`: existing deterministic shortfall reader
  and adaptation note currently call every empty passage list an empty result.
  Complete its interpretation of a successful all-omitted passage response so
  the next model turn cannot relabel known matches as no results. Existing
  `tests/services/tool-outcome.test.ts` covers genuine misses and other tools.
- `server/services/ana/agentic-loop.ts`: classic per-result 8,000-character
  head/tail cap plus a separate 24,000-character aggregate-round budget.
  `tool-output-frame.ts` frames after budgeting. No global budget change here.
- Japanese source windows and exact neighboring passage contexts already exist.
  This completes response fitting, not retrieval quality or source authority.

Root and auditors searched passage/fitting/budget/truncation/tool names, current
handlers/schema/consumers/tests and deleted history. Targeted deleted searches
for document-passage-tools and passage-budget replacements returned none.
Targeted deleted searches for tool-outcome/shortfall replacements returned none.

## Approved behavior

1. Every result of the registered `search_document_passages` handler is valid
   complete JSON of at most existing `PASSAGE_RESULT_BUDGET = 7500` UTF-16 code
   units, measured after JSON serialization, including escaping. Never slice a
   serialized JSON body or a retained title, locator, source identity or span.
2. Ordinary responses below the metadata thresholds that already fit retain
   exact existing behavior/output. Larger echoes may be omitted even when the
   previous response happened to fit the overall budget.
   The query sent to canonical retrieval remains the full trimmed original.
   If `JSON.stringify(query).length > 1000`, omit its response echo, add
   `queryOmitted: true` and `queryChars: query.length`, and do not repeat it in
   a miss message. Otherwise preserve the existing query field and miss wording.
3. If `JSON.stringify(coverage.failureReasons).length > 1000`, omit diagnostic
   reason text as a whole: `failureReasons: []`, `failureReasonsOmitted: true`,
   and an explanatory note. Preserve every coverage count and unfiled-upload
   unknown/more flag. Keep normal reasons unchanged. Do not mutate source data.
4. Extend the same fitting passes in the same order and rank-prefix priority.
   If even the highest-ranked locator cannot fit, allow all passages to be
   omitted. Return `ok: true`, `passages: []`, exact existing `omittedPassages`
   count and a message explicitly saying matches existed but could not be shown
   intact. Never use the genuine-miss wording for this outcome. Later small
   passages are not re-ranked around an oversized highest-ranked source.
5. After the existing caught-error wrapper, any still-oversized envelope becomes
   small fixed JSON: `ok: false`, `code: 'PASSAGE_RESULT_TOO_LARGE'`,
   `resultOmitted: true`, no `passages` field and guidance that it is not evidence
   absence; narrow the query or use `search_project_documents` and
   `read_project_document`. Preserve `unavailable: true` if the original response
   said unavailable. Do not copy an oversized raw error, fabricate zero matches,
   pretend the index was available or assert nothing was searched generically.
6. Original hits, source/context identities, locators, ranks, numeric spans,
   counts and trusted scope are not mutated. Kept fields remain exact; missing
   text keeps existing explicit omission flags. No persistence or approval path.
7. Complete the existing `shortfallOf` consumer with kind `'omitted'` for an
   otherwise-successful `ok: true`, empty `passages` list and positive safe-integer
   `omittedPassages`, after existing refusal/declared-status/nonempty-result
   priorities. It is not `'empty'`. The existing adaptation note names omitted
   matches and guides narrowing/reading, explicitly not evidence absence. Keep
   the prior note byte-identical for rounds without an omitted shortfall. All
   real misses, outages/refusals, returned records and other tools retain their
   classification. Invalid omission counts do not manufacture matches.

## Proof and publication

Freeze four meaningful baseline suites and exact hashes before production edits:
query/diagnostic/last-hit overflows, real catch/cap/frame behavior and retained
source/rank/coverage invariants under mixed serialization pressure, plus the
existing consumer's all-omitted classification/adaptation guidance. Use existing
exports/registration; no missing-module false failures. Raw logs and unchanged
baseline input pins are retained. Root updates only the one legacy expectation
that deliberately allowed overflow after the new tests freeze.

Final canonical Node22 Vitest, one worker, 4 GiB heap; scoped lint with no warning
growth; independent source/error-contract reviews; normal hooks and full-project
TypeScript 0. Direct incremental canonical pushes, ordinary merge/conflict
resolution, exact Git-byte source/artifact checks, clean/local=remote. No PR,
force push or hook bypass.

This bound is the registered handler body. It proves the classic single-result
8,000-character cap is a no-op on it; it does not guarantee a crowded aggregate
tool round remains intact or bound the framing overhead. That existing separate
round-budget limitation remains open. No live provider/database or language
relevance/agency qualification is claimed.
