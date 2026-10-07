# Recorded CMC aggregate and Module 3 propagation contract

Date: 2026-10-07. Workstream W3, launch row D4. Repository
`concept2cure/ClinicalSageAI-2-replit`, branch `concept2cure-v2`. Initial source
`40697292af6b813dcfcaba8881e12c250dab69ef`. The control tower approved this
scientific contract in [PLAN.md](PLAN.md) before production edits.

## Boundaries to repair

1. A single-study programme claim cannot come from a valid subset when another
   recorded parameter/condition series is unestimable. The existing engine may
   refuse a short series, missing criterion or nonvarying times. Preserve the
   valid series and all refusal rows; withhold `supportedShelfLife` and
   `limitingParameter` and name every reason in `claimWithheldReasons`.
2. A measured result without a recorded parameter cannot disappear from Module
   3 conformance qualification or trending narrative. Export/reuse the existing
   unassigned-observation inspection, carry source identity and the row within
   its combined recorded-results projection, and withhold overall stability
   support through the existing `unresolvedObservations` channel. Preserve raw
   tables, actual point comparisons and valid named-series trend calculations.

No expected but unrecorded parameters are inferred. Criteria, unit conversion,
engine arithmetic, condition grouping, source objects/hashes and register
records retain their existing interpretation. There is no new dependency,
table, migration, model, route, surface or statistical engine.

## Scope and sequence

Production scope: `server/services/cmc/recorded-stability.ts` and
`server/services/module3Composer.ts`. New regression:
`server/services/cmc/__tests__/recorded-aggregate-propagation.test.ts`.

First run the new current-source regression RED. Cover three incomplete
single-study aggregate cases, unassigned passing measurements on both material
sides and an unnamed-only measurement. Positive controls preserve complete
valid attributes, separate recorded conditions and genuinely absent results.
Then correct production and run the focused suite and neighboring deterministic
engines, compiler, Module 3 and AnA/route tests in one fork with a 4-GiB heap.

The first neighboring run exposed one existing test whose expectations treated
a valid Assay subset as the programme answer while explicitly recording an
unestimable one-point Aggregates series. After its actual failure was retained,
the control tower approved the narrow additional test scope
`server/services/ana/__tests__/deepening-tools.test.ts`: keep its recorded input
and Aggregates refusal, assert the unchanged 18.63-month per-series Assay
estimate, and replace only the incomplete programme claim expectations with
null aggregate fields and the exact named hold reason. This changes the
asserted contract; it does not relax data or engine eligibility.

## Review limits

These are deterministic software qualification regressions. They do not
validate a customer's scientific dataset, complete intended use, agency filing
or deployment. Local semantic whole-tree TypeScript is not run on the 8-GiB
host; the control tower owns the exact-source canonical GitHub gate and release
checks. The existing AI narrative-refinement semantic-preservation policy,
missing/ambiguous scientific identity, ordinary criterion/unit grammar and
complete dataset/SME qualification remain separately owed. D4 and D1–D10 stay
open.
