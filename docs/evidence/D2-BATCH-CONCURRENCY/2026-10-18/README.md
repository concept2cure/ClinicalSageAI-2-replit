# D2 / W2 — validated batch concurrency

Baseline: `e62320e0a9555188a08ce426d7c16c72d372d824`.
Contract: [CONTRACT.md](CONTRACT.md), committed before tests/implementation.

The existing HTTP endpoint upper-capped caller input, while the service advanced
its scheduling loop by an unchecked value. Negative concurrency could prevent
termination. One pure resolver now validates both entrances before work:
omission defaults to 3, finite positive integer numbers are capped at 5, and
other supplied values are refused. HTTP returns 400 /
`INVALID_BATCH_CONCURRENCY`; direct service calls reject with RangeError.

The canonical service cap of 5 is intentional and written in the contract;
previously only HTTP capped it. Current production callers supply 3 or 5, so
their behavior is preserved. Default, ordering, sibling outcomes, tenant/source
checks and finish metadata are unchanged. This does not implement cancellation,
editor cutoff refusal, server-owned completion receipts or filing automation.

## Fail-first and final checks

- `initial-red.txt`: frozen final fixtures, 24 intended failures and 9 passing
  controls across 33 tests. Thirteen service invalid cases safely throw from a
  request getter if validation is absent, rather than running the negative loop.
  Ten actual Express invalid cases use a downstream-service mock. The remaining
  failure is the service's previously uncapped positive concurrency control.
- `final-green.txt`: those same test bytes plus the existing source checkpoint,
  nested receipt/tool, per-section settlement, identity, reserved-source and
  actual provenance-outcome suites: **156 tests / 10 suites pass**. No provider
  or live agency call is part of this proof.
- `frozen-tests.json`: final test SHA256 pins. The real scheduler controls hold
  promises, measure active work, release waves in reverse order, and check
  original order and exactly-once completion across seven sections.
- `lint-comparison.json`: zero errors; 8 warnings before and after in the two
  existing production files, zero warnings in the new helper/tests. Baseline
  lint uses the Git baseline bytes through ESLint's actual stdin interface.
  No baseline or suppression is changed.
- `test-command.json`: exact final Vitest command using the repository config,
  Node 22, one worker and a 4 GiB heap.

The earlier `initial-red-pre-fixture-remedy.txt` and
`pre-fixture-remedy-tests.json` are retained honestly. Direct `it.each` array
rows spread their arguments, so the initial empty-array case became undefined
and some labels were ambiguous. Before implementation, object-table cases
fixed this and added explicit true/empty-string cases. The final frozen red
run and green run use identical corrected fixtures.

Independent read-only review found no blocker in the resolver, entrance order,
caller compatibility, or fail-first fixture logic. The reviewer inspected the
retained green transcript and did not independently rerun it. Root verification
binds final files and evidence; the publication record reports normal Git hook
outcomes and canonical synchronization separately.

## Canonical synchronization

Implementation is `4684ff1d490ae3b1c618d2565cbf36795160e9b1`. The initial
normal push passed every gate, including whole-project TypeScript with zero
errors, but the remote advanced during those checks. Its complete transcript
is retained as `code-push-initial-race.txt`; it was not a successful push.

The incoming `92928e3529e463d69ee4347e752f2308d401ef1e` changes only the two
generated repository-health reports. Normal merge
`0017c49fec308197816ccb0640895b12a21cafe4` preserves both histories and has no
unmerged files. Production and frozen-test SHA256 pins remain exact, so the
metadata merge does not require repeating the targeted tests. The normal push
is retried with all hooks; `code-push.txt` and `publication.json` record its
result and subsequent canonical verification. No force push or hook bypass.

The [remaining-needs assessment](../../../reports/data-room-research-2026-10-14/remaining-needs-2026-10-18.md)
and its 33-file source manifest distinguish delivered corrections, source-audited
defects, design work, qualification, and broader product scope. The pure
Japanese probe records passage start 37501 separately from query occurrence
37505. It demonstrates a selection limitation; it is not a multilingual
qualification suite.

## Scope limits

The direct-service getter is a safe boundary proof, not a load test of a live
hung application. HTTP tests exercise the real router with fixture identity,
not live authentication infrastructure. Existing source/gateway tests retain
their individual seams and limitations. Passing TypeScript/hooks is a release
check; it is not deployment, production PQ, scientific validation, or agency
acceptance. Remaining needs are assessed in the repository report.
