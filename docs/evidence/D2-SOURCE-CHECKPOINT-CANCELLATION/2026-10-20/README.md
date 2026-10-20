# Complete existing cancellation between selected-source operations

Workstream D2 / W2, 2026-10-20. Baseline
`0793ee48ecee5dee014b266b2def014c38ea978e`; approved contract `6ec38926c`.
This completes an existing AnA cancellation path for source-grounded drafting.
No new route, model, provider, dependency, schema or cancellation system.

## What already exists

`AnaToolExecutor.ts` already stops between section loads and discards late
successful loads. `AnaDocumentDraftingService.ts` already snapshots trusted
signals, forwards them to the gateway, stops later batch waves, retains completed
siblings and refuses late successful content. `batch-draft-result.ts` already
defines native-signal trust, cancellation errors and cancelled receipts without
prose or automatic retry. The gateway already cancels queued requests, releases
permits, normalizes terminal cancellation and suppresses retries/fallbacks.
The delivered outer propagation is recorded in
[D2-BATCH-CANCELLATION](../../D2-BATCH-CANCELLATION/2026-10-18/README.md).

`draft-project-sources.ts` already issues genuine frozen, actor/project-pinned
contexts through a private WeakMap, binds original/extraction/excerpt identity
and exact UTF-16 spans, and rechecks source bodies and actor/program access.
The remaining gap was inside one active loader or source checkpoint: Stop did
not prevent its later selected-document or scope operations. The service also
did not pass its current signal into that checkpoint. The tool classified all
loader throws as source failures, including typed cancellation.

The [contract](CONTRACT.md) records current-code, synonym and deleted-history
searches. No replacement implementation was found. This is completion of the
existing path, not a claim that batch cancellation or source authority was absent.

## Change and preserved behavior

- The loader captures only the existing trusted AbortSignal and checks it
  before work, between catalog/scope operations and before issuing a context.
  A fulfilled operation that settles after Stop cannot start the next operation.
- Genuine source authority accepts an optional **per-call** signal. The service
  passes its current sanitized request signal at entry, dispatch and response
  checks. A later consumer does not inherit its loader's stopped lifetime.
- The tool recognizes a cancellation only when its trusted signal is aborted
  and the existing cancellation predicate matches. Genuine rejected catalog
  operations retain their failure and retry classification even during Stop.
- WeakMap authority, actor/project pins, exact text/hash/span/window/budget
  checks, no-signal behavior, completed siblings and existing receipt semantics
  remain intact. No generated draft is persisted by this path.

## Qualification

Four file-scoped agents froze meaningful tests before root changed production.
`frozen-tests.json` binds their bytes: **28 expected failures and 25 passing
controls, 53 total** on unchanged baseline production. The loader, registered
tool, actual service and native gateway/semaphore are exercised. Each owner
retains exact commands, raw baseline output, input pins and stated boundaries in
`loader/`, `tool/`, `service/` and `gateway/`.

Final Node 22.23.3, canonical Vitest configuration, one worker, 4 GiB heap:

| Check | Result | Evidence |
| --- | --- | --- |
| Four frozen suites plus adjacent authority/service/tool/receipt/concurrency/gateway/HTTP suites | 276 tests, 18 suites passed | `green-command.json`, `green-tests.txt` |
| Existing loader qualification, including invalid sources, budgets and exact extraction identity | 42 tests, 1 suite passed | `loader-regression-command.json`, `loader-regression.txt` |
| Scoped ESLint, compared by file path | 0 errors; unchanged existing 101 warnings; four new suites 0 warnings | `lint-comparison.json`, `lint-final-summary.json` |
| Independent source/authority and tool/receipt reviews | No findings; final source hashes bound | `independent-review.json` |

Total final qualification: **318 tests, 19 suites passed**. The first combined
implementation run also passed 261 tests. Its raw output is retained. An inline
failure mapper initially added one complexity warning; moving the same expression
to a local mapper removed the warning, followed by the final combined run above.
No suppression or warning baseline was increased. ESLint JSON summaries omit its
duplicated full-source fields and explicitly identify themselves as summaries.
Raw `.txt` output is byte-preserved, including existing mocked startup diagnostics.

`source-input-pins.json` binds selected source, test and configuration inputs.
`artifact-manifest.json` binds the authored evidence at implementation commit
time. Normal Git hooks and whole-project TypeScript run during direct publication;
the publication supplement records the actual result and canonical Git checks.

## Boundary

This is cooperative cancellation **between existing catalog operations**. An
already-started operation and its internal SQL may finish. Tests use synthetic
catalog/scope I/O and provider stand-ins; the gateway suite uses native routing,
semaphore and terminal handling while mocking outbound provider dispatch.
This does not establish native SQL/socket cancellation, provider spend reversal,
HTTP disconnect wiring, live deployment, scientific validity or agency acceptance.
No live provider, external database or government endpoint was called.
