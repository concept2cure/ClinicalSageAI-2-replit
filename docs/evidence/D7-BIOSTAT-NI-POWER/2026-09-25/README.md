# BS8 (D7): the biostatistics engine reports the power of the test it sized

**Row:** D7 (what is filed into a sequence). The engine's figures reach governed
documents through AnA's `compute_sample_size` and `generate_statistical_document`
tools, and through `apply-sample-size`, which writes power onto the study design
the SAP generators print from. RULE 2: numbers come from deterministic engines, so
the engine's numbers have to be right.
**Found by:** the lineage trace (`wf_dbeffd2b-a8b`, finding BS8, verified
independently).

## The defect

`server/services/ana-biostats/computation-engine.ts` sized a non-inferiority design
on (δ − Δ_NI), then computed "achieved power" from δ alone, using the two-sided
superiority formula. Equivalence had the same defect. So a design sized correctly
for 90% reported about 5%. The judgment then called it `inadequate` and
recommended `escalate`, and `computeMissingDataImpact` measured power loss from
that same 5%.

## The fix

The engine now has one function, `continuousPower`, for "the power of the test this
N was sized for":

- superiority: two-sided on δ;
- non-inferiority: |δ − Δ_NI|;
- equivalence: the margin the TOST was sized on.

It uses the sizing's own critical value. The design's achieved power and
`estimatePowerAtN` both use it, so the design and every re-estimate agree. The
formula for superiority is unchanged.

## Evidence

- `01-red-before-fix.txt`: the new tests against the old engine. A 90% NI design
  reports 0.050 (0.075 with δ=0.05 and 2:1 allocation). An 80% equivalence design
  reports 0.050. The judgment says `inadequate`. Missing-data power is 0.050.
- `02-green-after-fix.txt`: 7/7 BS8 cases. The engine suites are 160/160
  (`tests/services/ana-biostats.test.ts`, `server/services/biostatistics-bridge`,
  `server/services/ana-biostats`).

The judgment still flags a non-inferiority trial against a **placebo** comparator
(Comparator Appropriateness: inadequate). That is correct: the test pins it
separately, and the power verdict is now `adequate`.

## Not done here (next in the lineage plan)

- **BS3.** `client/src/concept2cure/v2/surfaces/Biostatistics.tsx` is a second,
  in-browser engine with the same power formula, and it reports different verdicts
  from the server on all four presets. It is locked in production by launch scope.
  The fix is to move the surface onto the server engine and delete the port, not
  to patch a duplicate.
- **Scenarios.** `generateScenarios` is a third copy of the sizing formulas, and it
  is always superiority. For a non-inferiority design with δ=0, its "Base case"
  N is null (a division by zero). It should size through the design's own path.
- **Binary non-inferiority** reports the target power, not a computed one.
- **α sidedness.** The engine uses z at 1 − α/2 for every hypothesis. What α means
  for a one-sided non-inferiority test is an input-convention question for the
  biostatistics owner. It is unchanged here, and the fix is consistent with it.
