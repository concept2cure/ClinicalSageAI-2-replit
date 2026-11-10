# F1: a device scorecard with a required piece not started is never "nearly ready"

The coordinator's F1 item of 2026-11-02, found by Reporting (`011HLkY…`), taken by the MDX journey lane
(`01P6GW…`). Plan: F1. Completes: `server/services/market-specs/device-readiness-scorecard.ts`.

## The defect

`levelFor` mapped the score alone: 100 or more was `ready`, 80 or more `nearly_ready`. The weights are classification
10, required documents 30, and evidence 60, split over the applicable modules. So:
- with six applicable modules, five ready and one **not started** scored 90, **`nearly_ready`**;
- the same held for one module **not assessed** (its required set turns on an unstated fact);
- the same held for the **risk class not determined** with everything else shown.

Red: `red/scorecard-before.txt`, three cases, each "expected 'nearly_ready' to be 'in_progress'". The level reaches
people unchanged through:
- AnA's `build_device_blueprint` (`server/services/ana/AnaToolExecutor.ts`), which returns `scorecard.level`;
- `POST /api/submissions/device/blueprint` (`server/routes/submissions.ts`).

## What already exists (RULE 3)

- **The rule to match**, `server/services/regulatory/readinessEvaluator.ts`. Its level is `not_ready` whenever a
  critical gap is open, and `nearly_ready` only when the gaps are non-critical. There, a missing required section or
  artifact is `critical`, and so is a requirement set that was not assessed.
- **The scorecard's own decisions** (`__tests__/device-readiness-scorecard.test.ts`, 2026-10-15). A dimension nothing
  assessed is scored 0 with its weight kept. Those cases read `in_progress` (70) and `early` (40), and the tests pin
  those levels.

## The change, and why `in_progress`

An applicable dimension with nothing shown (`not_started` or `not_assessed`: classification, required documents, or an
evidence module) caps the level at `in_progress`. That is below `nearly_ready`, and `ready` stays possible only at 100
with no gap. The score is unchanged: it is the share shown.

`in_progress`, not `not_ready`, because:
- The half of the evaluator's rule this scorecard lacked is "`nearly_ready` only when no gap is critical". The cap
  supplies that half.
- Below the cap, the scorecard's bands describe progress. Its 2026-10-15 tests already chose `in_progress` and `early`
  for a dimension nobody assessed. Collapsing every such case to `not_ready` would reverse those decisions, not just
  remove the overclaim.
- The gap list already names the missing piece ("PMS plan is not started.").

## What this does not change, said so

- A dimension that is **partial** (begun, not complete) does not cap. With every dimension begun and 80 or more shown,
  the level is still `nearly_ready`; the fourth new case pins it.
- Under the evaluator's terms, a partially present required set is also a critical gap. Whether "nearly ready" may be
  said while any required section is missing is a question for the founder. The coordinator scoped this repair to
  the not-started and not-assessed cases.

## Verified

| Check | Before | After |
|---|---|---|
| `device-readiness-scorecard.test.ts`, new block "a dimension with nothing shown is never nearly ready" (4 cases) | 3 failed (`red/scorecard-before.txt`) | 4 passed |
| Every suite naming the scorecard, `build_device_blueprint` or `/device/blueprint` (15 files) | — | 191 passed (`green/scorecard-and-callers-after.txt`) |

## Later the same day: P-114 widens the cap to a partly present required set

The founder delegated the open question above ("you are to be the SME to make those choices"), and P-114 decides it.
"Nearly ready" is never said while a required item is missing, including one only partly present: FDA's eSTAR
technical screening holds an incomplete submission, and the evaluator calls the gap critical. So any applicable
dimension short of ready now caps the level at `in_progress`. Every dimension in the scorecard is required, so it no
longer says `nearly_ready`. The fourth case above, which pinned `nearly_ready` for a partly present set, now pins
`in_progress`:
- red: `red/p114-partial-before.txt`, "expected 'nearly_ready' to be 'in_progress'";
- green: `green/p114-partial-after.txt`, 15 suites and 191 tests.

The 2026-10-15 cases (`early` at 40, `in_progress` at 70) are unchanged.
