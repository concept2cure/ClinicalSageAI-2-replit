# AnA's Module 3 readiness is the final-export gate's verdict

Row **D2**. Found while preparing the GA switch.

## The defect

AnA's `/m3 readiness` (`module3_readiness`) and `/cmc` (`cmc_status`) decided
"Module 3 export: **READY**" from their own counts: every section approved,
none stale, no open critical contradiction. The final-export gate
(`server/services/cmc/final-export-gate.ts`) refuses on more than that:

- source drift;
- superseded or withdrawn Vault evidence (slice 08);
- sections with no lineage;
- incomplete or unplaceable approved sections;
- the governed-decision fabric.

So AnA could tell a CMC lead that Module 3 was ready to file, and the export
and placement that followed refused. The board's readiness route already used
the gate (slice 08). AnA was a second, looser answer to the same question.

## The fix

`server/services/ana-ri/module3-command-handlers.ts`: both commands call
`evaluateFinalExportGate` and report `exportReady = verdict.allowed`.

- The counts they show are the gate's own (`verdict.data`), not a second read.
- When the gate refuses, the first blocker is the gate's sentence. The `/m3`
  hints follow it.
- `data.blockedBecause` carries the sentence.
- `cmc_status` keeps its own reads for the source inventory and the
  high-severity count. The gate does not compute those.

## Red, then green

`server/services/ana-ri/__tests__/module3-readiness-gate.test.ts` has 4 tests.
In each case the old counts clear but the gate refuses.

- **Before** (`red-unit-before.txt`, the previous handlers): 3 of 4 fail.
  - `/m3 readiness` said READY over source drift.
  - `/cmc` said READY over superseded evidence.
  - The counts shown were a second read, not the gate's.
- **After** (`green-unit-after.txt`): all 4 pass.
- **Wider run.** The Module 3 lineage integration, the command RBAC suite and
  every CMC service suite pass: 41 files, 487 tests.
