# Complete existing passage-result fitting — D2 / W2

The existing AnA passage-search handler now returns complete JSON within its
7,500 UTF-16-code-unit body budget, including oversized metadata and caught
errors. Known matches omitted for space remain distinct from genuine misses in
the existing adaptation guidance. This completes the existing fitter and its
consumer; it adds no tool, model, provider, dependency, schema or surface.

## What already exists

- `server/services/ana/document-passage-tools.ts` already registered the governed
  passage search and fitted results by removing context text, hit text and then
  lowest-ranked whole passages. It previously kept one passage even when its
  complete locator could not fit; query echoes, diagnostics and caught errors
  could also exceed the budget. This work completes that implementation.
- `server/services/vault/document-passage-search.ts` already provides canonical
  current-source retrieval, actor scope, ranked hits and coverage. Its query,
  references, ranking and coverage authority are unchanged. Diagnostic counts
  were bounded, but diagnostic string lengths were not.
- `server/services/vault/passage-context-span.ts` already verifies exact source
  context. `server/services/ana/catalog-scope.ts` and
  `server/services/ana/document-tools-shared.ts` already supply access and error
  handling. They remain the implementations used here.
- `server/services/ana/tool-outcome.ts` already classifies shortfalls and builds
  adaptation notes. It treated an empty passage list as no results even when
  the handler explicitly counted omitted matches. This work completes that
  interpretation in the same consumer.
- `server/services/ana/agentic-loop.ts` already provides an 8,000-character
  classic per-result cap and a separate 24,000-character round budget;
  `server/services/ana/tool-output-frame.ts` supplies framing. Their behavior
  is unchanged. Other budget consumers include `server/routes/ana-ri/stream.ts`,
  `server/services/ana/sub-agent-stream.ts` and
  `server/services/ana/read-receipts.ts`.
- Existing registered-handler budget tests and
  `tests/services/tool-outcome.test.ts` already cover ordinary fitting and
  shortfalls. One legacy expectation explicitly allowed the final locator to
  overflow; root updated that expectation and its stale header comment.

The [contract](CONTRACT.md) records the pre-design code/name/consumer and deleted
history searches, source baseline and approved completion. No parallel or
deleted implementation was substituted.

## Behavior and limits

The retrieval backend receives the full trimmed query unchanged. A query echo
whose serialized length exceeds 1,000 code units is omitted with explicit
`queryOmitted` and `queryChars` fields. An oversized serialized failure-reason
list is omitted whole, with `failureReasonsOmitted`; coverage counts and
unknown/more flags remain intact. Neither operation mutates retrieval data.

The same fitting order retains a rank prefix and exact complete locators. If
none can fit, a successful result explicitly counts omitted matches and says
that they existed. The consumer recognizes only a strict successful empty
passage list with a positive safe-integer omission count. Refusal, explicit
status/unavailability and returned records retain priority. Rounds without
omitted matches retain their prior adaptation-note bytes.

A final guard after the existing caught-error wrapper replaces any remaining
oversized envelope with small fixed JSON (`PASSAGE_RESULT_TOO_LARGE`), preserving
an explicit unavailable flag when present. It never slices serialized JSON or
a retained citation. Ordinary results below the explicit metadata thresholds
retain existing behavior and output.

This qualifies the registered handler's raw body and the classic single-result
cap being a no-op on it. Framing adds overhead; the separate aggregate round
budget can still cut a crowded round. That round-budget issue remains open.
Fixtures use synthetic catalog/retrieval data with actual registered handlers,
shared error handling and the cap/framing seams identified by each owner. No
live provider, database, multilingual relevance or agency acceptance is claimed.
The cap proof calls real budget/cap/frame helpers for one entry; it is not a
live model run or full executor/stream qualification.

## Verification

Four disjoint test owners froze 93 tests against unchanged production inputs:
36 meaningful failures and 57 passing controls. Their exact commands, raw logs,
input pins, hashes and scope boundaries are in [sizing](sizing/README.md),
[cap](cap/README.md), [references](references/README.md) and
[outcome](outcome/README.md). [frozen-tests.json](frozen-tests.json) binds the four
unchanged test files. Root then changed production and the one unsafe legacy
expectation.

The final canonical Node 22 run passed **178 tests across 11 suites** using one
worker and a 4 GiB heap. The seven changed TypeScript files have **zero ESLint
errors and warnings**. Three independent final source reviews found no issues;
[independent-review.json](independent-review.json) binds their reviewed hashes.
Normal publication hooks, including whole-project TypeScript, are recorded in
the publication supplement rather than inferred from the targeted suite.

The initial green run and an initial complexity warning are retained. Extracting
the existing coverage-note expression into a helper removed that warning with
no behavior change. A subsequent stale-comment correction in the legacy suite
was followed by the final byte-bound test/lint run; the preceding run is retained
as `pre-comment-*`. The outcome owner's earlier heuristic interpretation and
its corrected fail-first run are both retained. No failed attempt is relabeled
as the final result.

Raw `.txt` transcripts are byte-preserved, including terminal whitespace. ESLint
JSON files are explicitly labeled summaries that omit duplicated source fields;
they record the raw stdout hash. [source-input-pins.json](source-input-pins.json)
binds selected qualification inputs, not an exhaustive dependency graph.
[artifact-manifest.json](artifact-manifest.json) binds the implementation evidence;
the publication supplement adds actual commit/push and remote Git-byte checks.
