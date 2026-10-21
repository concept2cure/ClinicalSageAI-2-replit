# Private receipt composition — frozen fail-first proof

## What already exists

`server/services/ana/agentic-loop.ts` owns the ordinary floor, whole private
read replacement and passage whole-or-withheld policy. `read-receipts.ts`
already privately snapshots deferrals, guards unchanged bodies, settles exact
host admission and withdraws source context without claiming rollback.
`source-read-receipt.ts` already owns typed source refusal. Existing
`read-receipts.test.ts` and `read-receipt-snapshots.test.ts` exercise these
components. This disjoint suite composes those paths with opt-in strict totals;
it does not create another allocator, guard or receipt writer.

## Freeze

`server/services/ana/__tests__/strict-round-body-read-integrity.test.ts` is
frozen at SHA-256
`5199b253d644aafea12a76555e0a7232b297be9c99a366395892031f84d60821`.
[frozen.json](frozen.json) retains the exact command, selected input hashes,
test/log/report hashes and counts. Every root-selected baseline input remained
unchanged at the run and freeze.

The canonical Node 22 baseline run exited 1: **4 intended behavior failures,
3 passing controls, 2 explicitly skipped final-assertion cases**. Raw output is
[baseline-vitest.txt](baseline-vitest.txt), with the machine report in
[baseline-vitest.json](baseline-vitest.json). Failures are actual over-target
aggregate bodies (ordinary, private-read crowding and receipt-spoof fixtures)
and an irreducible round proceeding into settlement instead of refusing.
No missing export or import failure supplies a red result. The two assertion
cases use feature detection only to skip on the original baseline; they run
once the new assertion exists.

Passing controls preserve fitting private read bytes and exactly one host
admission callback, private-map precedence/trusted offsets, and cancellation
with no new receipt. The failing crowding and spoof cases also exercise the
existing guard/settlement path and no receipt authority from payload fields.

## Seam limits

The allocator, deferral snapshot, guard and settlement are real code. Explicit
verifier/writer callbacks replace actor/source checks and persistence. Final
assertion cases begin at a synthetic accepted-body seam (three 7,990-character
ordinary bodies plus tiny read bodies), then use real guard/settlement to grow
source-refusal envelopes. They qualify post-allocation growth and honest
retention of an earlier acknowledged outcome, not allocator selection of that
fixture. No live DB/provider, provider delivery, current-source admission or
rollback is claimed. The test file is not edited after freeze.

## Root layout qualification addendum

Root subsequently split only the long first `describe` callback to remove a lint
warning. Assertions and fixtures are unchanged. Original frozen source and exact
diff remain in `../layout-review/`; root repeated the revised suite against the
original production baseline with all 21 selected pins unchanged. The final
layout hash is in `../frozen-tests.json`. Production was restored byte-identically
after this replay. The original owner freeze remains historical evidence.
