# Recorded CMC aggregate and Module 3 propagation results

Date: 2026-10-07. Workstream W3, launch row D4. Canonical branch
`concept2cure-v2`; initial source `40697292af6b813dcfcaba8881e12c250dab69ef`.
The approved contract and bounded scope are in [CMC-PLAN.md](CMC-PLAN.md).
This worker did not create a branch, commit or push.

## Behavior now enforced

| Existing boundary | Result |
| --- | --- |
| Single-study valid Assay plus unestimable recorded Water | `supportedShelfLife` and `limitingParameter` are null for the whole recorded study. Every independently estimable parameter/condition retains its exact engine output. Named `claimWithheldReasons` includes the study, attribute, condition and existing refusal reason for short data, no criterion or an engine refusal. |
| Present result without a parameter | The existing unassigned-observation inspector is exported and reused. Single-study hold reasons name the study/row; Module 3 conformance and trending name the source identity/row. Passing numeric point comparisons remain visible but cannot establish overall stability support. |
| Unnamed-only measured payload into Module 3 | The recorded result remains in the table and receives an explicit named trend refusal. It no longer disappears into the message “no recorded pull-point results.” |
| Valid neighboring evidence | Complete attributes, separate explicitly recorded conditions, valid Assay trend calculations and genuinely absent result controls retain their behavior. No expected unrecorded attribute is inferred. |

Production changes are confined to `server/services/cmc/recorded-stability.ts`
and `server/services/module3Composer.ts`. No engine arithmetic, raw record,
source hash, grammar, unit handling, table, migration, dependency, model,
route or surface was added or changed.

## Actual execution receipts

- [Current-source RED](CMC-RED.txt): **11 failed / 6 passed (17 cases),
  2.60 seconds, exit 1**, before production edits. Three incomplete aggregate
  cases and eight Module 3 propagation cases fail; all six valid/absence
  controls already pass.
- [Initial RED receipt](CMC-RED-INITIAL.txt): **13 failed / 4 passed,
  1.61 seconds, exit 1**. This also required the future empty
  `claimWithheldReasons` field on two otherwise valid controls. Those two
  nonfunctional control expectations were removed before the definitive RED;
  neither production nor input data changed between the runs. The initial
  output is retained rather than represented as a different defect.
- [Focused GREEN](CMC-GREEN.txt): **17/17 passed, 1.47 seconds, exit 0**.
  Tests compare the valid per-series output exactly with the same valid series
  assessed alone, preserve all raw rows/input and pass both material sides.
- [First neighboring run](CMC-REGRESSION-INITIAL.txt): **20 files passed /
  1 failed; 777 passed / 1 failed (778 total), 28.45 seconds, exit 1**.
  The sole failure is the explicitly approved contract correction below.
- [Complete neighboring GREEN](CMC-REGRESSION.txt): **21 files / 778 cases
  passed, 103.56 seconds, exit 0**. Includes all new cases plus existing
  recorded numeric/series qualification, criterion parsing, both shelf-life
  bounds, poolability/trending engines, Module 3 composer/compiler/QC and AnA
  tools and the poolability HTTP route. Runs use the repository's one-fork,
  no-parallel-files Vitest configuration with a 4-GiB heap.
  [Execution manifest](CMC-MANIFEST.txt) verifies that all 21 requested files
  actually executed, with no omitted or additional file.
- [Final scoped lint](CMC-LINT.txt): **0 errors / 24 production warnings**;
  both changed test files have zero warnings. No suppression or baseline
  change was introduced. [Exact original-source comparison](CMC-STATIC.txt)
  records before/after ESLint counts under the canonical filenames; this is
  static lint evidence, not whole-tree semantic TypeScript qualification.

## Neighboring test contract corrected with the original input intact

`server/services/ana/__tests__/deepening-tools.test.ts` previously expected
the programme's `limitingParameter` to be Assay and its shelf life to be a
number, while deliberately recording an unestimable one-point Aggregates
series. Those expectations contradict the approved complete-recorded-study
contract. Its actual failure is preserved in the first neighboring receipt.

After that failure, the control tower approved replacing the two aggregate
expectations with nulls and a named hold reason. The input is unchanged;
the valid per-series Assay estimate is explicitly asserted at **18.63 months**;
the existing Aggregates `estimable: false` and insufficient-points reason
assertions remain. This correction does not replace a failed observation with
valid data or relax the estimator.

## Limits

The source/row index is within each source's combined projection of its existing
`results`, `stabilityData` and `stabilityParameters` fields, matching the trend
reader. It is not an invented global raw-data identifier. Existing aliases,
scientific identity/units, duplicates, criteria grammar and missing-data
methodology are not comprehensively qualified here. These regressions validate
deterministic software behavior, not a customer's dataset, intended use or
scientific acceptance. AI narrative-refinement semantic preservation and live
deployment/SME qualification remain separately owed.

The control tower owns integrated builds, branch/release gates and canonical
whole-tree TypeScript on the exact GitHub publication; none is inferred from
the scoped GREEN. D4 and D1–D10 remain open.
