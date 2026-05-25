# UI handoff — Real-World Evidence study execution (for Claude Design)

RWE study execution is now real. `POST /api/real-world-evidence/query` builds
exposure/comparator cohorts and outcome counts from the **connected FHIR data
source** and computes comparative statistics analytically from the real counts.
Nothing is fabricated (it replaces the prior `Math.random()` implementation,
which had been disabled to a 501). The client surface is the design system's to
build.

## Backend (shipped)

- Engine: `server/services/rwe-study-service.ts`
- Endpoint: `POST /api/real-world-evidence/query`
- The live source-data endpoints remain: `/faers`, `/fhir/patients`,
  `/clinical-trials`, `/signal-detection`.

## API contract

Request body:
```json
{
  "dataSource": "fhir",              // optional; defaults to "fhir".
  "exposureCode": "RxNorm-or-code",  // required — exposed cohort (medication)
  "comparatorCode": "RxNorm-or-code",// optional — comparator cohort
  "outcomeCode": "ICD10/SNOMED",     // required — outcome event (condition)
  "demographics": { "gender": "female", "ageMin": 18, "ageMax": 75 },
  "minCohortSize": 1,
  "observationDays": 365,        // optional — enables the incidence rate ratio
  "adjustForCovariates": true    // optional — enables IPTW propensity adjustment
}
```

Response (`200`):
```json
{
  "success": true,
  "data": {
    "status": "completed",            // or "insufficient_data"
    "dataSource": "fhir",
    "cohorts": {
      "exposed":   { "n": 100, "events": 20, "risk": 0.20 },
      "comparator":{ "n": 100, "events": 10, "risk": 0.10 }
    },
    "statistics": {
      "method": "two-proportion z-test",
      "riskRatio": 2.0,
      "riskRatioCI": [1.0, 4.0],
      "riskDifference": 0.10,
      "pValue": 0.04
    },
    "propensityAdjusted": {            // null unless adjustForCovariates + covariates available
      "method": "IPTW (logistic propensity)",
      "riskExposed": 0.18, "riskComparator": 0.11,
      "riskRatio": 1.6, "riskDifference": 0.07, "modeledPatients": 320
    },
    "timeToEvent": {                   // null unless observationDays supplied
      "method": "incidence rate ratio (constant-hazard approximation of hazard ratio)",
      "incidenceRateRatio": 2.0, "incidenceRateRatioCI": [1.0, 4.0],
      "personTimeExposedDays": 36500, "personTimeComparatorDays": 36500
    },
    "notes": [],
    "provenance": { "source": "FHIR R4", "endpoint": "...", "query": { ... }, "executedAt": "..." }
  }
}
```

- **`propensityAdjusted`** — an IPTW propensity-adjusted effect (logistic model over
  covariates). `null` when `adjustForCovariates` wasn't set or patient-level covariates
  couldn't be assembled (see `notes`). Present it alongside the crude `statistics` so
  reviewers can compare adjusted vs unadjusted.
- **`timeToEvent`** — incidence rate ratio over a fixed follow-up window (a constant-hazard
  approximation of the hazard ratio). `null` unless `observationDays` was supplied. `null`
  IRR/CI inside it when events/person-time don't support it. Label it honestly as an
  approximation, not a Cox hazard ratio.

### States to render honestly

- **`status: "completed"`** — show the cohort counts, risks, and the statistics.
  Any of `riskRatio` / `riskRatioCI` / `riskDifference` / `pValue` may be `null`
  when the counts don't support that measure (e.g. zero events in an arm) — show
  "not estimable", never a fabricated number. Always show provenance (source +
  executedAt) for a regulated audience.
- **`status: "insufficient_data"`** with `statistics: null` — the cohort was
  below `minCohortSize`. Show an explicit "insufficient cohort" state with the
  counts from `cohorts`, not an effect estimate.
- **`501` `source_not_configured`** — either no FHIR source is connected for the
  tenant, or a licensed vendor source (`aetion`/`flatiron`/`trinetx`) was
  requested but isn't wired yet. Show a "connect a data source" state; surface
  `error.dataSource`. These vendor connections are stubbed and will light up once
  credentials/a license are configured.
- **`400`** invalid study definition; **`502`** upstream FHIR execution error
  (offer retry).

## Notes

- Requires `FHIR_BASE_URL` (+ `FHIR_ACCESS_TOKEN`) configured for the
  environment/tenant. Cohort counts use FHIR `_has` reverse-chaining with
  `_summary=count`.
- Propensity-score adjustment and time-to-event (hazard ratios) are intentionally
  not reported yet — the engine reports only what the real counts support. Richer
  measures come with a licensed warehouse (vendor connections are wired but
  return 501 until configured).
