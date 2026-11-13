# F1: what the statistics engine tells a reader is true — six defects

**Package:** F1 (defects in shipped behaviour; no screen, mount, table, route file, service or AnA tool).
**Fixed:** 2026-11-12. Three are the sales rehearsal's findings left for this lane in
`.design/claude-convergence/COORDINATION.md` (T2-F8, T2-F9, T2-F10). Three were found walking the Biostatistics screen
while proving those.

## What already exists (RULE 3)

Nothing was written that existed. Each repair uses what was already there:

| Used | Path |
|---|---|
| The reader's word for a parameter | `shared/biostat-vocabulary.ts` (`PARAMETER_LABELS`, `vocabPhrase`, `parameterLabel`), already used by the governed documents |
| The judgment's dimensions, fragility and verdict | `server/services/ana-biostats/judgment-engine.ts` |
| The design's own missing-data strategy | `StudyDesign.statisticalPlan.missingDataStrategy`; the adapter's gap list (`design-adapter.ts`) |
| The engine's own refusals for an AUC design | `computation-engine.ts` `computeAUCComparison` |
| The worked examples and the suite that sizes them | `surfaces/biostatWorkedExamples.ts`, `__tests__/biostatWorkedExamplesSize.test.ts` |

Searched: `sensitive to`, `Key concerns`, `No method specified`, `should be pre-specified`, `must be positive`,
`especially`, `.parameter` printed raw, across `server/services/ana-biostats`, `biostatistics-bridge` and the
Biostatistics surfaces.

## 1. Two of the six worked examples were refused in the running app

Clicking **Non-inferiority** or **ROC / AUC** on the Biostatistics screen answered a red "The statistical engine did not
size this design": "Effect size must be positive", and for ROC also "At least sensitivity or specificity target is
required for diagnostic accuracy studies" (`screenshots/before-roc-example-1440.png`: the Expected AUC is filled in, and
the refusal asks for something else).

The engine sizes both (N = 312, N = 24). The refusal came from the request validator in front of it
(`input-normalizer.ts`), which refused every design whose effect size is not positive. A non-inferiority design is
sized on (δ − Δ_NI) and usually assumes a true difference of 0. An equivalence design is sized on its margin with the
true difference taken as 0. An ROC design is sized on its AUC and never reads the effect size. An equivalence design
with a true difference of 0 was refused the same way.

The suite that "sizes every worked example on the real engine" called the computation engine directly and never met
the validator, so it passed while the screen failed. It now sends each example the way the screen does.

Still refused, and tested: superiority with an effect size of 0 or none; non-inferiority with no margin; a
sensitivity/specificity study that gives neither; an ROC design with no expected AUC (now by name: `aucTarget`).

Red: `validator-red.txt` (8 fail). In the running app: `walk.txt` — trunk refuses 2 of 6 chips at both widths; with the
change all 6 size.

## 2. T2-F9: a design that states its missing-data strategy was told it stated none

The design records its strategy in its own words. The adapter mapped them onto the engine's five modelled methods and,
when none matched, passed nothing. So non-responder imputation — the seeded LMN-201's "Participants with a missing
week-12 assessment counted as not cured" — reached the engine with no method. The judgment read "No method specified"
with a score penalty; the SAP read "Missing data handling method should be pre-specified"; AnA's guidance said the
same; and the design's own review table read "Missing data · Low · A pre-specified … strategy".

The strategy is now carried as stated (`StatisticalInput.missingDataStrategyStated`, set only when no modelled method
matches). The judgment quotes it and takes no "not specified" penalty. The SAP section, the full SAP and the CSR
methods section quote it. The engine still has no model of it and says so: it computes no power for it. A design that
states nothing is still told so.

Red: `t2-f9-red.txt` (8 fail, 4 pass).

Not closed here: the rehearsal also saw "No sensitivity analysis" beside a Scenario Analysis table on LMN-201. That
wording is not in these engine files, and this container has no seeded LMN-201 to walk. Left on the coordination
list, named.

## 3. T2-F10: "Revision recommended before proceeding. Key concerns:" — and nothing

The engine recommends "revise" for a marginal verdict or a fragile design. The list printed under "Key concerns:" was
`escalationReasons`, which collects only an inadequate dimension, a very fragile design or very low confidence. So the
commonest "revise" gave no reason. The first test case is the engine's own output for the worked survival design at
80% power, not a hand-built judgment.

The note now names what the recommendation rests on, each once: the escalation reasons; every dimension judged short
of adequate; the fragility when that raised the risk; and, when the verdict is marginal on the average alone, the
average, the mark it missed and the lowest dimensions. With nothing recorded it says so and prints no heading over an
empty list.

Red: `t2-f10-red.txt` (5 fail).

## 4. "Small changes in assumptions (especially ) could undermine study conclusions"

Found reading item 3's output in the running app. A design can be fragile with no sensitivity point computed, and the
sentence kept its parenthesis. The clause is now left out when there is nothing to name; the "moderate" sentence no
longer leaves a doubled space for the same reason. Red: appended to `t2-f10-red.txt`.

## 5. T2-F8: parameter names as stored

The review's finding read "sensitive to effect_size, attrition_rate"; a raised task was titled "Run sensitivity
scenarios on effect_size"; AnA's specialist guidance listed `effect_size: 12% margin`. All three now use the
vocabulary the governed documents use. An existing test asserted the stored name in the task title; it now asserts
the reader's word.

Red: `t2-f8-red.txt` (3 fail).

## 6. A test left red on trunk

`tests/services/ana-biostats.test.ts` "MMRM preserves more power than complete case" compared two "adjusted powers".
`03291d0335` (2026-11-12) correctly stopped the engine inventing MMRM's, and left this case asserting the invented
figure. It now holds that change's contract: a power for complete case, none for MMRM.

## Also, on the screen

With no project open the empty documents list said "persisted for this project" under the heading "Statistical
documents for this organization". It now says the organization. Red shown by restoring the old sentence.

## Green

`green.txt`: every new and changed suite. All suites that touch the changed paths: 49 files, 1,094 tests pass. ESLint:
no error, and no file gained a warning (counted per file against trunk).

## In the running app (RULE 4)

`walk.txt`, screenshots at 1440 and 390. Home, the rail, Biostatistics, each chip; then ROC / AUC, Power 0.9, Design
Assumption Note. No console error at either width.

## Not done here

- **The engine's default for an unmodelled strategy.** `computeMissingDataImpact` falls back to complete case when no
  modelled method is given. The documents print that impact only for a modelled method, so nothing complete-case is
  shown for a stated strategy; the judgment can still read a complete-case bias flag. Recorded for this lane.
- **A missing-data control on the form.** The design form has no control for the method; it comes from the example or
  the recorded design.
