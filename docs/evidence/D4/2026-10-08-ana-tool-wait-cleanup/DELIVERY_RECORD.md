# AnA tool wait cleanup — W3 / D4

Canonical branch: `concept2cure-v2`, repository
`concept2cure/ClinicalSageAI-2-replit`. Reproduction base:
`b0b1694aa00ee991b6792edab530f9fa59f1df93`. Publication base:
`4536fe4c2a4ad16a9722c9bfe61bc1a403426c06`. The intervening remote changes were documentation and filing-path
tests; all six qualified production/regression blobs stayed identical when
those changes were fast-forwarded. Earlier other-session context and UI work
is preserved and outside this batch.

## Delivered behavior

A successful or failed tool removes its cancellation-wait listener immediately
after the race settles. Previously, each completed wait left a listener attached
to a live run until Stop. Twelve completed tools retained twelve inactive
listeners in both real adapters. The existing `abortRace` helper now returns
the same native Promise contract with an idempotent `dispose()` method. The
stream and non-stream callers dispose their own wait in `finally`. Disposal
does not settle the promise, abort the run, or remove another wait's listener.

Work is evaluated before its wait is constructed, preserving synchronous
handler behavior. Real abort still rejects with `ToolRunCancelled`; genuine
handler errors keep their original error/adaptation path; late handler rejection
after Stop remains observed. Existing run scope and generation capture nesting
are unchanged.

The reached SSE Stop path also halts at the existing post-tool loop boundary.
Before this guard, Stop during a tool attempted another gateway invocation;
the production gateway's pre-call abort check prevented provider contact, but
the stream then emitted a generic SSE error. The existing `halt` directive now
finishes the turn as `cancelled`, with completed and canceled tool results
retained, before that extra gateway invocation. Live turns still delegate to
the existing TurnPolicy stop directive. No new protocol field or error class
is introduced.

The delivery changes three existing backend files and adds three regression
files. Client files, markup, styles and layout are untouched, proven by equal
client directory Git hashes in `ui-scope.json`. No tool, model, integration, dependency,
authorization rule, writer, shared harness or publication gate is added or
changed.

## Evidence and qualification

| Phase | Actual result |
| --- | --- |
| Initial direct fail-first | 4 failed / 5 passed; retained settled listeners and missing disposal reproduced |
| Initial actual-caller fail-first | 6 failed across 2 files; success retained 12 listeners, failure 1, completed-plus-pending pair 2 instead of 1 |
| SSE mid-tool Stop fail-first | Extra gateway entry; separately, real `GatewayAbortedError('pre_call')` reproduces the generic SSE error |
| Final new regressions | 16 passed / 0 failed across 3 files: helper 9, non-stream 3, stream 4 |
| Final broader qualification | 262 passed / 1 pre-existing failure across 20 files; actual process exit 1 preserved |
| Unchanged baseline comparison | Same existing tool-selection test fails with the original production blobs: 11 passed / 1 failed |
| Final forced ESLint | Zero errors, zero warning growth; helper 0, executor 100 existing, stream 23 existing; all new tests 0 warnings |
| Final production build | Exit 0, 16.684 seconds; existing large-chunk and experimental runtime notices remain |

The first full-gate attempt stopped at TypeScript's heap limit after 198.104
seconds; it established no compiler verdict. `typecheck-memory/initial-*`
preserves its actual exit 1. The existing TypeScript 5.6.3 native-cache helper
then prepared incremental diagnostics in 10 bounded processes,
with unchecked entries retained by the compiler until checked. The helper,
arguments and native batch results are pinned in `typecheck-memory/`. No
compiler options, source roots, gate or baseline changed. Cache preparation
is not qualification: the full unchanged pre-push hook was subsequently rerun
and its completed verdict below is the publication gate.

The broader failure is the unchanged `stream-tool-carry-over.test.ts` expectation
that a declined CMC step not be offered. The synchronized CMC policy always
offers `get_cmc_requirements` when it is in the governed pool, independently of
carry-over. Original production blobs reproduce the exact failure, already
recorded in prior merge `748b9bace`. The test, selector and policy remain
unchanged. `BASELINE_TEST_FAILURE.md`, `carry-over-baseline.*` and
`baseline-comparison.json` preserve this disagreement; it is neither skipped
nor reported as green. All 16 new cases pass in the full 20-file run.

`helper/` and `callers/` contain fail-first and final transcripts and independent
read-only review. The earlier non-aborting mock's `no_more_tools` label is
explicitly separated from the real gateway abort-contract failure; neither
claims an extra provider call. `qualification-command.json`,
`qualification.json`, `qualification.txt` and `qualification-verdict.json`
capture the final broader run, including prior queued-cancellation, hold,
disconnect, round-control, project-anchor, run-scope and generation-capture
contracts. Sub-report hashes pin their own phases; `source-files.json` pins
the six final blobs used by broader qualification and the full publication gate.

The local source checkpoint `a8f59c24c74f1870d7590bb06424f42f0dbcbcae` passed the
**full unchanged `.husky/pre-push`** against the publication base: process exit
0, completion banner observed, **TypeScript zero errors (tsc exit 0)**, elapsed
67.617 seconds. See `prepush-qualification.txt` and
`prepush-qualification.json`. The final local evidence commit is documentation
only; the published commit contains both qualified source and final evidence.
No lint rule, compiler diagnostic, suppression, baseline, hook or CI configuration
was weakened.

## Verification boundaries and publication

The direct regression counts native listeners on the actual signal while it
remains live. Actual mounted-route and non-stream adapter tests execute loop,
capture, result and recorder logic. Model responses, probe tool handlers,
context and persistence/post-processing use existing test seams. These tests
establish listener lifetime and Stop ordering, not production latency, browser
performance, live-provider or external-database behavior. The canceled SSE
path passes `stopped: true` and `stoppedReason: cancelled` to normal
post-processing; its tool trace keeps a truthful canceled result. The failing
gateway-catch fixture explicitly reports `not_recorded` because its database
harness lacks a dedicated persistence client; it does not establish a live
database recording failure.

Stopping waiting does not undo handler side effects or interrupt work that
ignores its signal. Removing a settled listener does not abort the shared run
or interfere with a still-pending sibling.

Publication uses the connected GitHub Git-data API on the sole canonical
branch after the unchanged local gates. Every uploaded file must match local Git,
and the published files are also checked together. The non-force ref update requires the expected
remote SHA. The resulting branch contents and exact remote workflow snapshot are
verified after publication and reported separately. Source publication is not
a production deployment; queued or pending CI is not reported as successful.

Root lint JSON retains all diagnostics/counts and omits duplicate source echoes
only, with hashes retained. Text transcripts trim trailing whitespace only,
preserving commands and verdicts.
