# Submission-readiness walkthroughs (mock walk-through pack)

Four runnable, end-to-end demos — one per regulatory pathway — that exercise the
real, deterministic regulatory services (no DB, no network) and end in the
submission-readiness capstone. The capstone reports the **completeness of the
domains it assessed** — not readiness — and names the required domains it did
not assess. A domain the script computes no figure for is left out, so all four
currently end **not-assessed** (output of the runs on 2026-10-15):

| Demo | Scenario | Run | Capstone (as printed) |
|---|---|---|---|
| IVD 510(k) | Cardiac-troponin immunoassay | `npx tsx scripts/demo/ivd-510k-walkthrough.ts` | 100% of 2 of 5 required domains → **not-assessed** (not assessed: analyticalPerformance, clinicalPerformance, postMarketPlan) |
| CDx | PD-L1 companion Dx + checkpoint inhibitor | `npx tsx scripts/demo/cdx-walkthrough.ts` | 100% of 1 of 4 → **not-assessed** (not assessed: analyticalPerformance, clinicalPerformance, postMarketPlan) |
| PMA | Implantable CGM + connected app (Class III) | `npx tsx scripts/demo/pma-walkthrough.ts` | 100% of 3 of 6 → **not-assessed** (not assessed: clinicalPerformance, udiGudid, postMarketPlan) |
| EU IVDR | IVD CE marking (2017/746) | `npx tsx scripts/demo/eu-ivdr-walkthrough.ts` | 100% of 1 of 4 → **not-assessed** (not assessed: analyticalPerformance, clinicalPerformance, udiGudid) |

> The verdicts are `complete` (every required domain assessed and complete),
> `nearly-complete` (every one assessed, mean ≥ 80%), `incomplete` (an assessed
> domain is incomplete) and `not-assessed` (nothing assessed is incomplete, but a
> required domain was not assessed). Lower an assessed domain's input in a
> `scripts/demo/*.ts` file and re-run to show it reported incomplete.

Detailed talking points and the verified IVD 510(k) output are in
[`IVD_510K_WALKTHROUGH.md`](./IVD_510K_WALKTHROUGH.md).

## The one-screen thesis

Each demo reduces a dozen standards-grounded checks (CLSI EP05/06/07/09/12/17/25/28,
2×2 + ROC/DeLong, FDA SE flowchart, IMDRF/IEC 62304, §524B/NTIA, IEC 62366-1,
GS1/LOINC, IVDR Annex XIII, FDA CDx) into **one weighted verdict and a prioritized
gap list** — `complete` / `nearly-complete` / `incomplete` / `not-assessed`,
over the domains assessed.

## Defensibility (for the deposition)

Every number is closed-form and reproducible; the same code paths are unit-tested
against published reference values. Edit the scenario inputs in any
`scripts/demo/*.ts` file and re-run to show the result update live. The pathway →
required-domains map is also queryable: `GET /api/submission-readiness/pathways`.
