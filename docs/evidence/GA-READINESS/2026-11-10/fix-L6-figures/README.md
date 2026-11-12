# L6 Figures, counts and titles (plan package F1), 2026-11-10, repaired 2026-11-12

Items: GA-DEMO-05, GA-DEMO-06, GA-S2-04.

Result:
- GA-DEMO-05 is fixed, then repaired after an adversarial check (findings V2 to V6). It is proven at the engine and in
  the generated document. Seen in the running app: not yet (server code; listed to re-walk).
- GA-S2-04 is mostly already fixed at HEAD by another session (275b7e328, "R1"). This lane's own change to it was
  withdrawn at the 2026-11-10 merge and is not re-added. Three id fallbacks remain; they are listed under "Not fixed here".
- GA-DEMO-06 needs another file. The count the screen shows does not come from the file named in the ledger.

The lane's change is two files and one test file:
- `server/services/ana-biostats/judgment-engine.ts`
- `server/services/ana-biostats/document-generator.ts`
- `server/services/ana-biostats/__tests__/sensitivity-breakpoints-recompute-power.test.ts` (new)

## What already exists

- `server/services/ana-biostats/computation-engine.ts`: the deterministic sizing engine. `compute()` gives the evaluable N
  (`sampleSize.total`), the enrolled N (`adjustedTotal`) and the achieved power for every method. Each method reads the effect
  its own way: a rate difference, a hazard-ratio reduction, or the effect against a non-inferiority margin. It throws
  `ComputationRefusal` for a design it cannot size.
- `judgment-engine.ts` `assessFragility`: produces the sensitivity points and the fragility index and narrative.
  `document-generator.ts` prints them in the sample-size rationale ("Sensitivity Points") and the design assumption note
  ("Assumptions", "Fragility Analysis" and "Critical Parameters").
- `computation-engine.ts` `generateScenarios`: already scales a binary design's rates together with the effect. The
  breakpoint search uses the same rule.
- `server/services/ana-biostats/sme-router.ts:253` prints each point's margin in AnA's guidance. It reads the same fields
  and needed no change.
- The Biostatistics work area (`client/src/concept2cure/v2/surfaces/Biostatistics.tsx`) sizes a design through
  `/api/ana-biostats/compute` and opens the chosen document (for example "Sample Size Rationale") in the one editor.
- GA-S2-04, at HEAD: commit 275b7e328 (R1) already
  - orders the data room so the study's own current files come first and captured Quality records after them
    (`server/services/clinical-regulatory-evidence/data-room-search.ts:255`, `(s.metadata->>'nativeRecord' …)` before
    `s.created_at DESC`);
  - names child Quality records from the admitted parent's name (`server/services/qms/project-evidence.ts`
    `childRecordName`, `familyRecordName`).
- GA-DEMO-06: `server/services/report-os/orchestrator.ts:69-115` (`computeInitialRun`, `collectLifecycle`) counts
  `concept2cure_artifacts` only and writes "No governed artifacts discovered for this scope". Insights reaches it through
  `report-os/portfolio/fetch.ts:140`. `server/services/report-os/providers/db-providers.ts` is a second copy of that count;
  `registerCoreProviders` has no caller outside its own test, so nothing on screen reads it.
  `server/routes/c2c/projects.ts:2216` `PROJECT_HOLD_READS` already counts a project's Vault and sealed Authoring documents.

## What was wrong

- GA-DEMO-05. The effect-size point estimated power as 1 − Φ(z₁₋α/₂ − mult·z_power). That is already below 80% at the
  first step (0.95), so every design printed a 5% margin. The attrition point was min(1.5 × attrition, 0.5) with a fixed
  50% margin. For a 15% dropout rate it printed 0.22499999999999998.
- Found by the verifier in the first fix, and repaired here:
  - V2. A design sized at exactly 80% power (the most common target) has a margin that rounds to 0. The document then said
    "the design is already below 80% power at this value", which is false: the engine's power is 0.8001.
  - V3. When power stays above 80% as the effect shrinks (non-inferiority, margin 0.3, effect 0.1), the search's floor
    (1% of the effect) was reported as a computed breakpoint: "breakpoint 0.001, 99% margin".
  - V4. `assessFragility` reached complexity 25 and nesting depth 5: one new ESLint warning in `judgment-engine.ts`, which
    the pre-push gate refuses.
  - V5. The tests did not tell the "already below" sentence from the "change before" sentence, and no test covered a design
    under 80% power. Two mutations survived.
  - V6. Every error in the base recompute was swallowed. The points then vanished without a word, and the fragility index
    lost its penalty, so a design that was not assessed could read "robust".
  - V1, V7. The evidence claimed a GA-S2-04 change that is not in the tree, and an ordering that is no longer HEAD's.

## What changed

- `judgment-engine.ts`:
  - Each breakpoint is recomputed with the computation engine at a power target of 80%. The effect point is the smallest
    effect at which the design's evaluable N still gives 80% power, found by bisection. The attrition point is
    1 − (N needed for 80%) / (N enrolled), never below the current rate.
  - Breakpoints are rounded to 4 places, margins to 1 place. A margin is the relative change in the parameter.
  - The work is in named steps beside the class: `baseNeededAt80`, `effectSizePoint`, `smallestPoweredMultiple`,
    `attritionPoint`, `sensitivityPoints` (V4).
  - When power holds at 80% down to the search floor, no effect-size point is claimed. The narrative says: "Power stays at
    or above 80% for every effect size tested, down to 1% of the planned effect, so no effect-size breakpoint was found."
    (V3)
  - Only a `ComputationRefusal` means "not assessed". The narrative then says: "Sensitivity to the effect size and the
    dropout rate was not assessed: the design could not be recomputed at 80% power." The fragility index keeps its
    penalty, so missing points never make a design read less fragile. Any other error is not swallowed (V6).
  - The two private approximations the wrong formula used (`normCdf`, `normQuantile`) had no other caller and were removed.
- `document-generator.ts`:
  - Whether a design is below 80% is read from the engine's own power, never from a rounded margin (V2). The three
    sentences are:
    - "current 0.4, breakpoint 0.3448; 13.8% change before the design falls below 80% power"
    - "current 0.1, breakpoint 0.1; the design is at the 80% power threshold, with no margin"
    - "current 0.4; the design is already below 80% power at this value"
  - The sample-size rationale's "Sensitivity Points" also prints the engine's note when a point could not be claimed (V3,
    V6). The design assumption note already prints the whole narrative.
  - Every figure is rounded before it is printed.
- Test: `sensitivity-breakpoints-recompute-power.test.ts`, 14 tests (8 from the first fix, 6 added in the repair).

## Proof

Worked figures (engine, continuous superiority, α 0.05; `demo05-worked-figures.txt` and the repair probe):
- d 0.4, 90% power, 10% dropout: power 0.9015, evaluable N 266. Effect breakpoint 0.3448 (13.8%; was 0.38, 5%). Attrition
  breakpoint 0.3243 (224.3%; was 0.15, 50%).
- Same with 15% dropout: attrition breakpoint 0.3631 (was 0.22499999999999998).
- d 0.1, 80% power: power 0.8001, N 3142. Effect breakpoint 0.1, margin 0. The document says "at the 80% power threshold,
  with no margin", not "already below".
- d 0.4, 70% power: power 0.7049. Both margins 0, breakpoints equal the current values. The document says "already below".
- Non-inferiority, margin 0.3, effect 0.1: no effect-size point. The narrative says no breakpoint was found. The attrition
  point stays (0.3282).

Red, then green:
- First fix: `demo05-red.txt` (8 failures, each for the right reason), `demo05-green.txt` (8 of 8).
- Repair: `repair-red.txt` is the new test file run against the first fix's sources. 4 failures, each for the right
  reason: the 80% design says "already below" (V2); the NI design reports an effect point (V3); a refusal does not say
  "not assessed" (V6); a defect is swallowed (V6). The 70%-power and exact-sentence tests (V5) pass there too: they pin
  behaviour the mutations below prove they guard. `repair-green.txt`: 14 of 14 pass.

Mutations (`repair-mutations.txt`; one change, run, restore, sha256 checked): 11 of 11 killed. They include the
verifier's two survivors (the at-threshold branch widened to every margin; the attrition floor removed), the old
"below from a rounded margin" rule, the floor reported as a breakpoint, every error swallowed, missing points lowering the
index, the notes not printed, and the first fix's four mutations re-run on the repaired code.

Existing importers (`repair-importers.txt`): 36 files, 640 tests, all pass. They are every test under
`server/services/ana-biostats/__tests__/` (the PGlite authoring-basis file included), `biostatistics-bridge/__tests__/`,
`ana-ri` biostat-command-input, `tests/services/ana-biostats.test.ts`, `tests/biostat/`, the three biostats route tests, the
AnA refusal test and the statistical-defensibility test.

Lint (`repair-lint.txt`): `judgment-engine.ts` has 7 warnings (HEAD 8: the unused `maxAttrition` is gone and no new one
was added). `document-generator.ts` has 11 (HEAD 11). The test file has 0. Neither file is near 100,000 bytes (43 KB and
56 KB). No client file changed, so the CSS-class gate is not affected.

Typecheck (`repair-typecheck.txt`): 0 errors in the lane's files. The scope and the errors outside it are listed there.

The running app: the server does not reload, so this change cannot be seen on 5240 yet. To re-walk after the next restart:
1. Sign in as sam (biostatistician). Open Biostatistics from the side rail. Choose the document "Sample Size Rationale".
   Enter a continuous superiority design: effect size 0.4, alpha 0.05, power 90%, dropout 15%. Choose "Open in editor".
   Under "Sensitivity Points" expect: effect size "current 0.4, breakpoint 0.3448; 13.8% change before the design falls
   below 80% power"; attrition rate "current 0.15, breakpoint 0.3631; 142% change …". No figure has a long decimal tail.
2. Again with effect size 0.1 and power 80%. Expect "the design is at the 80% power threshold, with no margin" and never
   "already below".
3. Again with power 70%. Expect "the design is already below 80% power at this value" for both points.
4. A non-inferiority design (margin 0.3, effect 0.1): no effect-size line with a breakpoint; instead "Power stays at or
   above 80% for every effect size tested …".

## Not fixed here

- GA-S2-04. Already fixed for ordering and for most titles by 275b7e328 (R1); trunk's version stands. The residual id
  fallbacks are in `server/services/qms/project-evidence.ts`, not a file this repair may change:
  - line 248: "Retained Quality document N vX" when the parent document's name is not admitted;
  - line 280: "<document> (assignment N)"; line 281: "<document> vX (receipt N)";
  - line 286: "record N" for a record with no name of its own.
  A person should read the record's words, or "(no title recorded)", never a row id. Owner: whoever holds
  `qms/project-evidence.ts` (the R1 data-room session).
- GA-DEMO-06 needs another file: `server/services/report-os/orchestrator.ts:69-115`. The count should add the project's
  Vault documents (`vault.documents` joined through `projects.regulatory_program_id`) and its Authoring documents, using the
  reads in `server/routes/c2c/projects.ts:2216`. `db-providers.ts` is an unreached second copy: converge the two and delete
  one, rather than fixing both. Owner: the Reporting session (011HLkY…), which also holds the Insights header copy.

## Questions for the founder

- None that block this lane.
- A wording choice for review: the attrition margin is the relative change in the dropout rate (10% to 32.4% reads as
  224.3%). The alternative is percentage points (22.4 points).
