# BS-M1 (D4): re-applying a sample size no longer moves the governed N

**Row:** D4. Protocol development is a launch app. Its study design's statistical
plan is what the protocol, SAP and registration projections render from.
**Lineage plan:** LX-16 (`docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md`).
**Found by:** the lineage verification (`wf_dbeffd2b-a8b`, BS-M1, missed by the
first tracer and caught by its verifier).

## The defect

`apply-sample-size` wrote the engine's **achieved** power into
`statisticalPlan.power`. That field is the plan's **target** power: the type calls
it "Target power for the primary endpoint", the adapter reads it back as
`powerTarget`, and the SAP projection prints it as "Target power". So every
re-apply sized against a target nobody chose, and the governed N moved each time.
Superiority ratcheted up (N grows by a couple of subjects per apply, because the
achieved power sits just above the target). Before BS8 (`64a1d5c7`), a
non-inferiority design fell to single digits: the verifier measured 384 → 12 → 6.
The audit row recorded each write as a reasoned, governed change.

The existing test pinned `power === result.power`, and its "second application"
reused the original input instead of re-deriving it from the patched design, so the
loop was never exercised.

## The fix

`computationToPlanPatch` writes `power: input.powerTarget`, the target this N was
sized for. `apply-sample-size` records both figures, each under its own name: the
audit payload and the response carry `power` (the target written to the plan) and
`achievedPower` (the engine's figure for this N).

## Evidence

- `01-red-before-fix.txt`: the re-apply loop over three applies gives three
  different Ns, and the write-back test sees 0.9014 written as the "target" 0.9.
- `02-green-after-fix.txt`: 16/16 in `design-adapter.test.ts`. The N and the target
  power are identical across three re-applies.
- The biostatistics-bridge, study-design and ana-biostats suites, plus every suite
  that exercises apply-sample-size, are 506/506. `tsc` is clean on the changed
  files.
