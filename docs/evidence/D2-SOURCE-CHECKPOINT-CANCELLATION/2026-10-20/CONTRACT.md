# D2 / W2 — complete cancellation between source operations

Baseline: `0793ee48ecee5dee014b266b2def014c38ea978e`. Date: 2026-10-20.
This completes existing selected-source cancellation inside existing AnA drafting.
Root owns all production code and Git. Workers own distinct test files only.
No new surface, route, model, provider, dependency, schema or cancellation system.

## What already exists

- `server/services/ana/AnaToolExecutor.ts` — `prepareBatchSections` already
  honors trusted Stop before each section load, discards a late successful load,
  forwards the signal to batch drafting and retains genuine source failures.
  It treats one source load as indivisible and catches every loader throw as a
  failure today. Extend that catch to preserve typed cancellation correctly.
- `server/services/ana/AnaDocumentDraftingService.ts` — trusted signal snapshots,
  gateway forwarding, pre/post-call guards, stopped waves, combined section/batch
  signals and completed siblings already exist. Its private source checkpoint
  does not pass the current signal into source authority; complete that bridge.
- `server/services/ana/draft-project-sources.ts` — genuine WeakMap issuer,
  frozen actor identity/excerpts and original/extraction/span hashes, current
  document bodies, actor and program revalidation already exist. Its load and
  private revalidation loops have no cooperative cancellation checks.
- `server/services/ana/batch-draft-result.ts` — reuse `trustedSignal`,
  `throwIfDraftCancelled`, `DraftCancelledError`, `isDraftCancellation`,
  `cancelledDraft` and existing no-prose / no-auto-retry cancellation receipts.
- `server/services/ai-gateway/gateway.ts` and `concurrency.ts` — queued removal,
  terminal cancellation, permit ownership and normalization after a dispatch
  checkpoint abort already exist. No gateway implementation change is planned.
- Existing `batch-draft-cancellation*.test.ts`, source-context/checkpoint suites
  and gateway abort/queued-abort/source-checkpoint tests cover adjacent behavior.
  `docs/evidence/D2-BATCH-CANCELLATION/2026-10-18/` records the delivered outer
  propagation and its explicit in-flight-load limit. Do not describe it absent.

Root searched signal/abort/cancel/Stop, request/receipt/tool/service names,
current code/test/evidence filenames and routes. `git log --all --diff-filter=D`
on draft-project-sources, batch-draft-result, draft-source-window and batch*cancel
returned no deleted replacement implementation. The broader cancel/abort history
contains deleted gstack tests and review probes, not a replacement runtime.

## Contract

1. Capture and honor only a real existing AbortSignal; caller-owned JSON signal
   objects remain ignored. Stop checks precede/ follow awaited loader-level
   catalog/scope operations and each selected-document/body/revalidation step.
   Do not start the next operation after Stop, or issue a context from a load
   whose final operation settled after Stop. Pre-aborted work starts no reads.
2. Extend exported `assertDraftSourceContextCurrent` and private authority
   `assertCurrent` with optional per-call signal. The service passes its already
   sanitized current request signal for entry, dispatch and post-call checks.
   Do not permanently bind a stopped loader signal into the issued context;
   a fresh legitimate consumer revalidates with its own current signal.
3. Reuse existing cancellation helpers. In the tool catch, classify loader
   cancellation only when the trusted signal is actually aborted AND
   `isDraftCancellation(error)` holds. A rejected catalog/source operation keeps
   its genuine error even if Stop coincides. Cancelled slots contain no prose,
   are outside retryIndices and are not automatically retried.
4. Preserve WeakMap identity, actor/project pinning, exact hashes/spans/budgets,
   current-source checks, no-signal behavior, sibling outcomes and existing
   terminal gateway behavior. No new write/persistence path or authority token.
5. This is cooperative cancellation BETWEEN existing catalog operations. An
   already-started operation and its internal SQL may finish. Do not claim
   native SQL/socket cancellation, provider cost reversal or a live deployment.

## Fail-first proof and release

Before production edits, freeze real-loader multi-document tests: preabort,
scope/metadata/body/current-read/actor/program interruption, no later operation,
no issued context, forged/no-signal controls, and genuine rejected-source errors.
Exercise actual service entry/dispatch/post-response checkpoints and the actual
registered tool/receipt. Retain prior completed siblings and no-retry semantics.
Use existing gateway fixtures for terminal abort/no-provider-dispatch controls.

Record raw baseline logs and frozen file hashes. Final canonical Vitest with
Node22, one worker and 4GiB heap; per-file lint/no-warning-growth; normal Git
hooks including whole-project TypeScript0. No baseline/suppression growth.
Fetch and inspect incoming changes, merge/resolve conflicts, rerun affected
checks, directly push code/evidence to `concept2cure-v2`, and verify clean tree,
no unmerged files, retained ancestry and local=remote. No PR/force/hook bypass.
