# The export gate finds a contradiction even when nobody swept for it

Row **D2**. GA plan item 5 (decision 2026-10-05).

## The defect

The final-export gate counted only the contradictions recorded in
`cmc_contradictions`, and only the manual sweep records them. So:

- a program **never swept**, or whose data changed since its last sweep,
  reached `exportReady: true` and placement over a rejected batch or a
  critical comparability risk;
- the board then said "No open contradictions", and its header said "0 open —
  across specifications, methods, stability, batch and comparability" for a
  program nobody had swept;
- a sweep over **empty** registers said "nothing found across specifications,
  methods, stability, batches and comparability", exactly as a sweep over a
  full file does.

## The fix

**Gate.** `evaluateModule3GovernedState` runs the same deterministic detector
the sweep runs (`readContradictionRegisters` then `detectContradictions`) and
compares the result with the record (`unrecordedCriticalFindings` in
`contradiction-lifecycle.ts`, keyed as the sweep keys a finding: type plus
details):

- a critical finding the record **does not hold** refuses export: "N critical
  contradiction(s) in the program's current records are not recorded: run the
  contradiction sweep, then resolve or correct them before final export";
- a recorded **open** finding refuses as before, counted once by its status;
- a recorded **resolved** finding over the same data does not refuse;
- a register read that **fails** throws, and the gate's caller refuses. It is
  never an empty sweep.

`verdict.data.unrecordedCriticalFindings` names them. AnA's `/m3 readiness`
and `/cmc` carry the gate's sentence (slice 13).

**Sweep.**

- `POST …/contradictions/:projectId` returns `examined`: the number of
  specifications, methods, stability studies, batches and comparability
  assessments it compared.
- It records the sweep as a provenance event (`contradiction_sweep`: when, by
  whom, over what) in the same transaction as the reconcile.
- `GET …/contradictions/:projectId` returns `meta.lastSweep`, which is null for
  a program never swept.

**Board.**

- A program never swept reads **"Not swept yet — no count is claimed"**. It
  says no finding is recorded and none is claimed absent, and that the gate
  refuses a critical finding either way.
- A swept program reads "N open — last swept <time>", and when there are none,
  "No open contradictions at the last sweep" with what was compared.
- The zero-finding toast says what was compared.

## Red, then green

- **Gate** (`final-export-gate.test.ts`). On HEAD (`red-gate-before.txt`) a
  never-swept rejected batch was **allowed**, and the new field did not exist:
  4 of 9 fail. After, all 9 pass.
- **Sweep route** (`contradiction-sweep-scope.test.ts`). On HEAD
  (`red-sweep-route-before.txt`) there were no `examined` counts, no sweep
  record and no `lastSweep`: 3 of 3 fail. After, 3 pass.
- **Board** (`cmcContradictionsHeader.test.tsx`). On HEAD
  (`red-board-before.txt`) the never-swept program read "0 open" and "No open
  contradictions": 2 fail. After, all 4 pass (`green-after.txt`).
- **Wider runs.** Every CMC route, service and client suite passes, with the AnA
  readiness and enrichment suites: 69 files, 806 tests.
