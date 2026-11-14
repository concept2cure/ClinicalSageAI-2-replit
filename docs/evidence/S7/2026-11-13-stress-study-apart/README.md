# A stress study is tabulated on its own and never decides the storage period

Plan F1. Completes `server/services/module3Composer.ts` (§3.2.S.7 and §3.2.P.8), with the predicate in
`server/services/cmc/ich-compliance-q1e.ts` and the Q1A rule in `server/services/cmc/ich-compliance-rules.ts`.

## What already exists

- The Stability register records a study's type; its "Stress — thermal, photostability or freeze-thaw" condition
  writes `stress` (`client/src/concept2cure/v2/surfaces/cmcRegisterForms.ts`), and the payload carries `studyType`
  (`server/services/cmc-write-through.ts`, `mapStabilityPayload`).
- `isLongTerm` / `isAccelerated` (`ich-compliance-q1e.ts`) decide a study's ICH condition by its type first.
- §3.2.S.7 and §3.2.P.8 (`module3Composer.ts`) read every stability source on their side into one results table, the
  conformance verdict (`stabilityConformance`), the trend (`stabilityTrending`) and the design table's first-match
  condition. `studyType` was read only by the extractables table.
- The ICH check's Q1A rule counted studies by substrings of the condition (`25`, `30`, `40`).

## The defect

Forced-degradation results are outside their limits by design. A programme with a passing long-term study and a
stress study filed "The stability conclusion and the proposed storage period are NOT established by this section";
a stress study listed first set the section's storage condition; the Q1A rule counted a 40 °C stress study as the
accelerated study.

## The change

- `isSupportingStabilityStudy` beside `isLongTerm` (type `stress` or `forced`).
- §3.2.S.7 and §3.2.P.8 read their storage-period conclusion, trend, condition and time points from every study but
  a stress study. Stress results go in their own "Stress Study Results — <side>" table with one sentence saying they
  characterise degradation and are not compared toward the storage period. A stress study alone establishes none.
- The Q1A rule counts long-term and accelerated studies with the Q1E predicates and never a stress study.

No column, no vocabulary: the register already records the type.

## Proof

Red first, 5 cases in `server/services/__tests__/module3Composer.stress-study-apart.test.ts` (4 composer, 1 Q1A):
`expected '…' not to contain 'NOT established'`, `… to not include 'DP-STR'`, `expected [ 'Q1A_BATCH_COUNT' ] to include
'Q1A_NO_ACCELERATED'`. Then green with the Module 3, CMC, ICH and mutagenic suites: 2144 passed. Lint unchanged on
every touched file (`module3Composer.ts` 19/19, `ich-compliance-q1e.ts` 0/0, `ich-compliance-rules.ts` 0/0).

`ich-compliance-rules.ts` now imports the predicates from `ich-compliance-q1e.ts`, which already imports from it. Both
modules were loaded first, each alone, without error: every value crossing the cycle is used at call time only.

In the running app (2026-11-13): a walk-only stress study recorded on C2C-201 through `POST /api/cmc/stability-studies`
(condition STR, 60 °C) with two results through `PUT …/:id` (assay 99.7 at 0, 81.2 at 1 month against
95.0 – 105.0 %); §3.2.P.8 composed from the project's source objects:

```
before: Stability Results — Drug Product (10 rows)
        2 of the 10 recorded result(s) compared here fall outside its recorded acceptance criterion
        (Total impurities at 6 = 0.61 against NMT 0.5 %; Assay at 1 = 81.2 against 95.0 – 105.0%).

after:  Stability Results — Drug Product (8) | Stress Study Results — Drug Product (2)
        DP-STR-WALK | STR, 60°C thermal stress | Assay | 1 | 81.2 | 95.0 – 105.0% | OUTSIDE
        1 of the 8 recorded result(s) compared here fall outside its recorded acceptance criterion
        (Total impurities at 6 = 0.61 against NMT 0.5 %). The stability conclusion and the proposed storage period are
        NOT established by this section. … 1 stress (forced-degradation) study is recorded and tabulated separately
        (2 result(s)); stress results characterise how the material degrades and are not compared toward the storage
        period.
```

The demo's own long-term finding still decides the section, as it should; only the stress result left the verdict.
The walk-only study and its source object were deleted afterwards.

Not done: the write-through still emits §3.2.S.7's completeness fields for a drug-substance stress study
(`cmc-write-through.ts`), so a stress study alone can mark §3.2.S.7 complete. That is a completeness change for the
section's readers and goes separately.
