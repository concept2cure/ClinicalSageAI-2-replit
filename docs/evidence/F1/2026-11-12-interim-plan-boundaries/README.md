# F1: the interim analysis plan prints the boundaries the engine solves, or none

**Package:** F1 (a defect in shipped behaviour). **Rule:** RULE 2, "numbers, verdicts and governed content come from
deterministic engines".
**Completes:** `server/services/ana-biostats/document-generator.ts`.
**Found:** 2026-11-12 by this lane's survey of its in-flight work, then read and run here. **Fixed:** 2026-11-12.

## The defect

`generateInterimAnalysisPlan` wrote its "Alpha Spending" table like this, under the words "O'Brien–Fleming-type
alpha-spending function":

```ts
const z = (2.96 - 0.6 * frac).toFixed(2); // indicative, conservative-early → near-final
…
c += `| Final | 100% | ±${(1.97).toFixed(2)} |`
```

A straight line, and a constant. For the worked example the Biostatistics screen opens on (two interim looks):

| Look | It printed | Lan–DeMets O'Brien–Fleming is |
|---|---|---|
| 1, at 33% of information | ±2.76 | ±3.71 |
| 2, at 67% | ±2.56 | ±2.51 |
| Final | ±1.97 | ±1.99 |

The nominal one-sided p at ±2.76 is 0.0029; at ±3.71 it is 0.0001. The first look was crossed under the null about
thirty times as often as the design the text named. The final ±1.97 was printed whatever α was. The footnote called the
figures "indicative". They sat in a governed statistical document, offered on the Biostatistics screen and through
AnA's `generate_statistical_document`, of the kind a sponsor hands to a data monitoring committee.

Two smaller faults in the same function:

- A design that plans **no** interim analysis was told "This plan governs 1 planned interim analysis".
- The count of looks arrives unvalidated. A count of a million built a million-row table.

## What already exists (RULE 3)

Searched: `interim`, `spending`, `boundar`, `O'Brien`, `group-sequential`, `informationFraction`, `alphaSpent` across
`server/`, `shared/` and `client/`; `git log --all --diff-filter=D` for `*interim*`, `*group-sequential*`, `*spending*`
(nothing deleted under those names).

| Piece | Path | Does today | Does not |
|---|---|---|---|
| The exact engine | `server/services/stats/group-sequential-oc.ts` (`solveSpendingBoundaries`, `alphaSpent`, `computeOperatingCharacteristic`) | Solves the boundaries of a spending function by recursive integration; deterministic | Was not called by the document generator |
| The study-design spine's view | `server/services/study-design/interim-oc.ts` (`projectInterimOperatingCharacteristics`), shown in the protocol workspace's projections and through AnA | From a recorded design: its fractions, spending function and boundaries, with discrepancies and operating characteristics | Works over a `StudyDesign`; the document generator is handed the engine's input, not the design |
| The spine's SAP projection | `server/services/study-design/sap-projection.ts` §9 | States the recorded fractions, function and boundaries | Computes nothing |
| The document generator | `server/services/ana-biostats/document-generator.ts` | Writes 14 statistical documents from the engine's result | Wrote this one table from a formula of its own |
| A calculator route | `POST /api/biostat/adaptive/oc-exact` and siblings (`server/routes/biostat-design-stats.ts`) | The same engine as a calculator | — |

Nothing new was needed. The generator now asks the engine that was already there. No second boundary computation was
written: `interim-boundaries.ts` (split out of the generator, in its folder) decides whether the design is one the
boundaries are for, calls the engine, and prints the section.

## What changed

- **`server/services/ana-biostats/interim-boundaries.ts`** (split from `document-generator.ts`). `interimBoundaries`
  returns the engine's boundaries for the plan's looks, or `not_computed` with the reason.
  `interimAlphaSpendingSection` prints section 3 from that.
- **`document-generator.ts`.** Section 3 is that section. Section 1 tells a design with no interim analysis that it has
  none and that the plan is drawn for one. Section 2 lists timing only for a whole number of looks up to ten. "a
  equivalence study" reads "an equivalence study".

### What is solved

One comparison of two groups on one primary endpoint (a mean, a proportion or a time to event), tested for superiority
or non-inferiority. The engine states α two-sided, so the efficacy boundary is solved at one-sided α/2. A superiority
boundary is mirrored (±); a non-inferiority boundary is one-sided. Looks are equally spaced in information, which is
what the plan's Timing section says, and the section says in its own words that a look at another fraction has another
boundary.

The section also states what the boundaries cost: at the same maximum sample size, the probability of crossing a
boundary by the final analysis (89.7% against 90.0% for the worked example), from the same engine. The sample size is
computed for a single look; the plan used to print that power beside boundaries it was not computed for.

### What is refused, with the reason printed

| The design | Why no number is printed |
|---|---|
| Equivalence | Two one-sided tests; these boundaries control one test in one direction |
| Diagnostic accuracy, a single arm, a performance goal | Not a superiority or non-inferiority comparison of two groups |
| More than two groups | More than one comparison; the alpha each takes depends on the multiplicity procedure |
| More than one primary endpoint | The same |
| More than ten interim looks, or a fractional count | Not solved; not rounded into a design nobody recorded |
| The engine throws | Its own message |

An adaptive design gets the efficacy boundaries and one more sentence: they cover the efficacy looks only, and any other
adaptation needs its own control of the Type I error, which the plan does not compute.

## Red first

`server/services/ana-biostats/__tests__/interim-plan-boundaries-are-computed.test.ts`, 22 cases.

- Against trunk's generator: **18 fail, 4 pass** (`red.txt`). The first reads `expected [ '±2.76', '±2.56', '±1.97' ] to
  deeply equal [ '±3.71', '±2.51', '±1.99' ]`. The four that pass are the three that check the engine against the
  published tables, and the first line of a design that does record its looks, which must not change.
- With the change: **22 pass** (`green.txt`).

The engine is checked against the published Lan–DeMets O'Brien–Fleming tables (one-sided 0.025; two, three and four
equally spaced looks): every boundary within 0.001, and the type I error within 0.0001 of 0.025. The printed table is
checked against the engine's own solve for one to four interim looks, at α = 0.05 and 0.01.

## Neighbouring suites

`server/services/ana-biostats`, `biostatistics-bridge`, `stats`, the study-design `interim-oc` suite and AnA's tool handlers, on the final
content: Test Files  27 passed (27), Tests  417 passed (417). ESLint: no error; the generator's warning count is unchanged (11).

## In the running app (RULE 4)

Home, the rail, Biostatistics (no project open; the worked example has two interim looks), the document chooser,
"Interim Analysis Plan". Fresh browser context, Chromium at 1440 and 390.

| | Trunk (`screenshots/before-*.png`) | With the change (`screenshots/after-*.png`) |
|---|---|---|
| Table | Look, Information fraction, "Indicative two-sided boundary (Z)": ±2.76, ±2.56, ±1.97 | Look, Boundary (Z), Nominal p, α spent: 1 (33%) ±3.71 0.0001 0.0001; 2 (67%) ±2.51 0.0060 0.0060; Final (100%) ±1.99 0.0231 0.0250 |
| Says "indicative" | yes | no |
| Power under the boundaries | not stated | 89.7%, against 90.0% for the single-look test |

No response of 400 or above and no console error on either width.

**Phone width decided the table's shape.** The first version had five columns. At 390 px the document's tables scroll
inside themselves, and the last column lost its last digit: 0.0001 read "0.000". That is a different number. The look
and its information fraction now share a cell, the headings are short, and a sentence under the table says what they
mean. Measured at 390: the table is 324 px wide in a 324 px box, and no cell of the last column is clipped.

## Not done here, and why

- **A recorded design's own look timing does not reach this plan.** The study design records its information
  fractions and spending function (`statisticalPlan.interim`), and `biostatistics-bridge/design-adapter.ts` reduces
  them to a count before the engine sees them. So for a design whose looks are not equally spaced, this plan's timing
  and boundaries are for equally spaced looks. It says so; it is still not that design's plan. Carrying the recorded
  fractions through the engine's input is the next change in this lane.
- **The SAP has more than one source.** The spine's projection (`study-design/sap-projection.ts`) and this generator
  both write a SAP's interim section. Converging them is P-101's work (the SAP in the one editor), recorded in
  `docs/evidence/SPINE/S12/2026-11-09-core-work-convergence/`.
