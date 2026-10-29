# D5: Module 2 never calls a planned size enrolled (2026-10-29)

Session `…01E8btkB`. Found by the truthfulness reviewer in the CSR path review
for the LMN-201 / RePreve prospect.

## What already exists

Searched `sampleSize`, `sampleSizeText`, `ittPopulation`, `enrolled`,
`planned` and `csrInputs` in `server/` and `shared/`.

| Exists | Path | What it does | What was wrong |
|---|---|---|---|
| The Module 2 input | `server/services/m2-summary-builders.ts` `CSRSummaryInput.sampleSize` | Documented as "Enrolled subjects"; printed as `n=` and summed into "subjects enrolled" and the safety database | — |
| Its one producer | `server/services/csr/load-csr-inputs-for-project.ts` | Builds the inputs from each study's latest completed CSR job | Filled `sampleSize` from the job's `studyInfoSnapshot`, which is the build request's study information: the planned size. The Clinical Overview wrote "The safety database comprises 600 subjects enrolled" from a plan, and counted it as exposure |
| The CSR narrative step | `server/services/submission-package-orchestrator.ts` | Rebuilds a CSR request from the inputs | Passes the size back as the request's (planned) `sampleSize` |

## What changed

- **The input.** `CSRSummaryInput` carries `plannedSampleSize` beside
  `sampleSize`. The loader sets the plan there and leaves enrolled unknown
  (`null`). Nothing it reads records an enrolled count.
- **Module 2.** It prints `n=[enrolled not recorded; planned 600]` and counts
  no exposure from a plan. The Clinical Overview then names its gap, "safety
  database (no exposure data)". A recorded enrolled size reads exactly as
  before.
- **The orchestrator.** It passes the enrolled count when recorded, else the
  plan, so a rebuilt CSR request keeps its planned size.
- **`csr-latest-completed-generation.pglite.test.ts`** asserted the plan as
  `sampleSize`. It now asserts `plannedSampleSize: 20` and `sampleSize: null`.

## Evidence: seen failing first

| Check | Red | Green |
|---|---|---|
| `server/services/__tests__/m2-planned-is-not-enrolled.test.ts` (new), and the loader's PGlite case | `red.txt`: 3 of 5 fail at HEAD. "600 subjects" is printed, no plan is named, and the loader passes the plan as enrolled. The controls pass both ways | `green.txt`: 23 files, 327/327 |
| The orchestrator suites | — | `green.txt`: 19 of 20 files. `csr-job-runner.placeholder-gate` fails identically at HEAD (handed on) |
