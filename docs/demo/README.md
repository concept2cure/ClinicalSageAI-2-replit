# Submission-readiness walkthroughs (mock walk-through pack)

Four runnable, end-to-end demos — one per regulatory pathway — that exercise the
real, deterministic regulatory services (no DB, no network) and end in the
submission-readiness capstone verdict. Each scenario is a fully-prepared
submission, so all four return **READY (100%)**.

| Demo | Scenario | Run | Verdict |
|---|---|---|---|
| IVD 510(k) | Cardiac-troponin immunoassay | `npx tsx scripts/demo/ivd-510k-walkthrough.ts` | **READY** (100%) |
| CDx | PD-L1 companion Dx + checkpoint inhibitor | `npx tsx scripts/demo/cdx-walkthrough.ts` | **READY** (100%) |
| PMA | Implantable CGM + connected app (Class III) | `npx tsx scripts/demo/pma-walkthrough.ts` | **READY** (100%) |
| EU IVDR | IVD CE marking (2017/746) | `npx tsx scripts/demo/eu-ivdr-walkthrough.ts` | **READY** (100%) |

> To demonstrate the capstone's gap-surfacing live, lower any domain input in a
> `scripts/demo/*.ts` file (e.g. set a domain score to 0.4) and re-run — the
> verdict drops to NEARLY-READY / NOT-READY with a prioritized gap list.

Detailed talking points and the verified IVD 510(k) output are in
[`IVD_510K_WALKTHROUGH.md`](./IVD_510K_WALKTHROUGH.md).

## The one-screen thesis

Each demo reduces a dozen standards-grounded checks (CLSI EP05/06/07/09/12/17/25/28,
2×2 + ROC/DeLong, FDA SE flowchart, IMDRF/IEC 62304, §524B/NTIA, IEC 62366-1,
GS1/LOINC, IVDR Annex XIII, FDA CDx) into **one weighted verdict and a prioritized
gap list** — `ready` / `nearly-ready` / `not-ready`.

## Defensibility (for the deposition)

Every number is closed-form and reproducible; the same code paths are unit-tested
against published reference values. Edit the scenario inputs in any
`scripts/demo/*.ts` file and re-run to show the result update live. The pathway →
required-domains map is also queryable: `GET /api/submission-readiness/pathways`.
