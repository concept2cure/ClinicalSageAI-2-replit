# The missing-data power is stated only where the engine computes it (2026-11-12)

Plan package F1, under RULE 2 ("Numbers, verdicts and governed content come from deterministic engines; the model
narrates"). Launch row D2. Found on 2026-11-11 while reading the uncalled `/api/ana-biostats` routes; the files were
released to this lane by `011Dpx…` on 2026-11-12.

## The defect

`computeMissingDataImpact` (`server/services/ana-biostats/computation-engine.ts`) stated an "adjusted power" for four
methods by multiplying the design's power by a fixed constant (r is the expected missing rate):

| Method | "Adjusted power" |
|---|---|
| LOCF | power × 0.95 |
| MMRM | power × (1 − 0.3 r) |
| multiple imputation | power × (1 − 0.25 r) |
| pattern mixture | power × (1 − 0.5 r) |

None follows from the design, the missingness mechanism or a simulation. The figures reached:

- the full Statistical Analysis Plan ("adjusted power 86.0%") and the SAP section draft ("Estimated power after
  missing data: 86.0%"), on the Biostatistics screen and in documents saved from it;
- the defensibility judgment, which docked 10 points for a "power reduction" over 10% computed from them;
- the specialist guidance ("MMRM reduces power by 4.0%");
- AnA's `analyze_missing_data_impact`, which told the model to report them verbatim.

For the survival worked example (90% power, MMRM, 15% missing) the SAP printed 86.0%, which is 0.90 × (1 − 0.3 × 0.15).

## What already exists (RULE 3)

Nothing new. `estimatePowerAtN` already recomputes the power of the design's own test at a given evaluable N, and
complete-case analysis already used it. No other method has an engine that computes its power.

## The change

- **Complete case**: unchanged. The power is the same test's at the effective sample size, recomputed, and the
  reduction from the design's power.
- **LOCF, MMRM, multiple imputation, pattern mixture** (and any other method name): `adjustedPower` and
  `powerReduction` are `null` (`types.ts` now types them `number | null`). The recommendation says: "The power under
  <method> is not computed here: it depends on the missingness mechanism and the correlation structure. Size the
  study so it keeps its power on the N subjects expected to complete, or simulate the power under the assumed
  mechanism."
- Kept: the effective sample size (subjects expected to complete) and the bias-risk statement.
- The SAP section: "Power after missing data: not computed for <method>; it depends on the missingness mechanism."
  The full SAP: "power under this method is not computed (it depends on the missingness mechanism)". For complete
  case both name the figure as the complete-case power recomputed at the effective sample size.
- The judgment docks for a power reduction only when one was computed. The specialist guidance and AnA's tool
  instruction say the same words and give no figure where there is none.

## Verified

| What | Where | Result |
|---|---|---|
| The engine, both documents and the judgment, for complete case and the four methods | `server/services/ana-biostats/__tests__/missing-data-power-not-invented.test.ts` (13 cases) | Before the change: 9 fail. After: pass. The complete-case power is checked against the engine itself: sizing the design for that power gives back the effective N |
| AnA's `analyze_missing_data_impact` | `server/services/ana/__tests__/new-tool-handlers.test.ts` | It asserted a numeric adjusted power for MMRM; it now asserts null and the instruction |
| Every biostatistics suite | `server/services/ana-biostats` and the tool suite (9 files) | 165 pass |

**In the running app**, as the Lumen lead on LMN-201, Biostatistics, the "Pivotal OS (survival)" worked example:

- Before (`sap-before-1440.png`): SAP §9 "effective N 285; adjusted power 86.0%; bias risk low"; SAP section §7
  "Estimated power after missing data: 86.0%".
- After (`sap-after-1440.png`): SAP §9 "effective N 285; power under this method is not computed (it depends on the
  missingness mechanism); bias risk low", followed by the recommendation above; SAP section §7 "Power after missing
  data: not computed for Mixed model for repeated measures (MMRM)". No failed request.

## Open

- **The bias-risk thresholds** for LOCF, MMRM, MI and pattern mixture (e.g. "moderate" above 30% missing for MMRM)
  are a judgment written into the engine, not a computation. They are kept as agreed, worded as a risk statement and
  not a figure. A biostatistician should confirm them.
- **A simulation engine** for power under a stated missingness mechanism would let the four methods carry a real
  figure. It is new capability, so it is the founder's to admit (RULE 6); not proposed here.
- **The worked example uses MMRM for an overall-survival endpoint.** MMRM is a repeated-measures method; for a
  time-to-event endpoint the usual handling is censoring. The example is the Biostatistics lane's to correct.
- HawkScan did not run: no `HAWK_API_KEY` in this environment.
