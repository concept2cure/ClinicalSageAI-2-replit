# Loader operation cancellation — frozen fail-first proof

## What already exists

- `server/services/ana/draft-project-sources.ts` already issues frozen,
  identity-pinned selected-source contexts through its private WeakMap. It
  validates each source's metadata, current body, exact extraction and excerpt
  hashes, then revalidates actor and program scope. At this baseline, its inner
  awaited operations do not honor the loader's or current consumer's Stop signal.
- `server/services/ana/batch-draft-result.ts` already provides the native-signal
  filter and `DraftCancelledError`; these tests require that existing error.
- `server/services/ana/__tests__/draft-source-service-checkpoint.test.ts` already
  exercises genuine context identity and service entry/dispatch/response source
  checks. This suite extends direct loader and authority boundary coverage.
- The parent `CONTRACT.md` records the broader current-code and deleted-history
  search, optional per-call signal contract and scope limits.

## Frozen baseline

Production baseline supplied by root: `0793ee48ecee5dee014b266b2def014c38ea978e`.
Contract supplied by root: `6ec38926c`. Test execution: Node `v22.23.3`, canonical
`vitest.config.ts`, one worker, no parallel files, 4 GiB heap.

`baseline-command.json` retains exact argv, environment overrides, start/end
times, exit code and before/after production/test hashes. `baseline-red.txt`
retains unmodified combined output. The unchanged production hashes establish
that no implementation edit was included in this fail-first run.

Result: **15 failed, 13 passed, 28 total; exit 1**. All failures are expected
behavioral failures: stopped work fulfilled and issued a context, or continued
past the final permitted operation. No import, timeout or fixture failure occurs.

- Loader: pre-aborted signal starts no reads; Stop during scope, either
  document's metadata/body, either final current-body snapshot, actor or program
  revalidation must reject without a context or a later operation.
- Genuine context authority: each call takes its current consumer's signal;
  preabort and either current body/actor/program Stop must reject at that boundary.
- Passing controls: source operation rejections remain the identical real error
  even when Stop coincides; a fresh consumer does not inherit its issuer's later
  Stop; forged signal flags/methods are never read; exact two-document text,
  UTF-16 spans, SHA-256 identities, freezing and private actor/context identity
  remain intact with no signal or an unstopped native signal.

The suite uses the actual loader, issuer and exported authority function.
Catalog/scope operations are synthetic mocks with explicit operation traces.
It does not invoke a database or provider, run a compiler, or claim native SQL
cancellation. The erased test-only assertion allows the intended optional third
signal argument to compile against the old two-argument baseline signature.

## Retained fixture diagnostic

`fixture-import-diagnostic-*` retains the first run before replacing an imported
shared fixture helper with an equivalent local pure mock. The imported helper
transitively initialized the globally mocked database module, producing noisy
startup diagnostics. That first run also had 15 intended failures and 13 passing
controls. The final frozen run has no database bootstrap diagnostics. No live
database or provider was called in either run.

Tests and baseline evidence are frozen for root's production implementation and
final verification. `frozen-sha256.json` records the test and evidence hashes.
