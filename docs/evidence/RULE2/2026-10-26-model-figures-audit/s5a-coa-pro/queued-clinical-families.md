# S5a queued clinical families — read-only inventory

> Subsequent execution: pediatric and vaccine are completed in `../s5a-pediatric/`
> and `../s5a-vaccine/`. Dose optimization, RWE and pharmacovigilance remain queued.
> The inventory below records the initial read-only findings before those fixes.

Audited 2026-10-26 for the Rule 2 model-figures workstream. This increment fixes
only the COA/PRO family. **All five families below remain queued; none is fixed
or verified by this inventory.** R-2/F2 calculator availability remains open.

## What already exists

Each family already has six selectable definitions in `server/services/ana`, a
canonical pure knowledge engine, and six handlers in
`server/services/ana/AnaToolExecutor.ts`. The handlers call the existing functions
through `runStatsTool` with `input as any`. S5-0 supplies their stated-input basis;
it does not resolve missing deciding facts. Required schema fields do not provide
runtime boolean validation inside these engines.

| Queued family | Existing definitions | Existing canonical engine | Handler block | Boolean schema fields |
| --- | --- | --- | --- | --- |
| Pediatric | `server/services/ana/pediatricTools.ts` | `server/services/pediatric/pediatric-knowledge.ts` | `AnaToolExecutor.ts:19199` | 10: four required, six optional/nullable |
| Vaccine | `server/services/ana/vaccineTools.ts` | `server/services/vaccine/vaccine-knowledge.ts` | `AnaToolExecutor.ts:20299` | 13, all optional |
| Dose optimization | `server/services/ana/doseOptimizationTools.ts` | `server/services/dose-optimization/dose-optimization-knowledge.ts` | `AnaToolExecutor.ts:19815` | 20: eight required, twelve optional, including per-dose fields |
| RWE methodology | `server/services/ana/rweMethodologyTools.ts` | `server/services/rwe/rwe-methodology-knowledge.ts` | `AnaToolExecutor.ts:19287` | 21, all required |
| Pharmacovigilance | `server/services/ana/pharmacovigilanceTools.ts` | `server/services/pharmacovigilance/pharmacovigilance-knowledge.ts` | `AnaToolExecutor.ts:19719` | 14: required `serious`, thirteen optional |

No family has the S5a `not_stated` mechanism. Existing uncertainty handling is
identified below and should be extended rather than replaced. These are source
audit findings, not failing regression cases or completed corrections.

## Pediatric — smallest independent next family

Existing tool → function mapping in
`server/services/pediatric/pediatric-knowledge.ts`:

- `classify_pediatric_age` → `classifyPediatricAge:622`.
- `design_pediatric_investigation` → `designPIP:666`.
- `assess_pediatric_extrapolation` → `assessExtrapolation:843`.
- `select_pediatric_formulation` → `selectFormulation:1015`.
- `select_pediatric_dose` → `selectPediatricDose:1206`.
- `assess_pediatric_requirements` → `assessPediatricRequirements:1413`.

Four functions consume booleans; age classification and formulation selection
have no boolean inputs. `designPIP` treats omitted `isOrphan` as false and can
return “No waiver or deferral applicable.” `assessPediatricRequirements` explicitly
defaults `isOrphan` false and states that the product has no orphan designation;
omitted NME/adult-approval facts also change PREA conclusions and timelines.

`assessExtrapolation` already represents disease/response similarity as
`uncertain`, but a condition lookup fills omitted similarities from reference
data. The declared `adultEfficacyEstablished` and `biomarkerAvailable` inputs are
unused: even explicitly false adult efficacy does not prevent a
`full_extrapolation` result. Reference similarity must be distinguished from a
fact established for the stated product. `selectPediatricDose` treats omitted
PBPK availability and narrow therapeutic index as false when choosing the
scaling method and TDM recommendation.

This is the smallest next family by engine size (1,605 lines at audit), boolean
count and number of affected functions. The unused adult-efficacy prerequisite
is a material risk to cover explicitly. The engine has no other production
function consumers found beyond these AnA handlers.

## Vaccine

Existing tool → function mapping in
`server/services/vaccine/vaccine-knowledge.ts`:

- `design_vaccine_cmc` → `designVaccineCMC:667`.
- `assess_correlate_of_protection` → `assessCorrelateOfProtection:985`.
- `design_vaccine_clinical_program` → `designVaccineClinicalProgram:1175`.
- `assess_lot_consistency` → `assessLotConsistency:1371`.
- `assess_vaccine_platform` → `assessVaccinePlatform:1515`.
- `plan_vaccine_special_populations` → `planVaccineSpecialPopulations:1740`.

CMC defaults omitted multivalence false, infers adjuvant use from platform, and
infers lyophilization from platform cold-chain prose. Correlate assessment fills
omitted type, threshold and efficacy linkage from a pathogen lookup; supplying
only one mechanism/protection boolean fills the other false. Clinical-program
design defaults correlate availability false and **efficacy feasibility true**,
then chooses an evidentiary pathway and Phase 3 endpoints. Omitted novelty
suppresses its caution.

Platform assessment defaults prior licensing and same-backbone facts false;
special-population planning defaults adult data and correlate availability false.
`normalizePlatform:107` silently maps an unknown platform string to protein
subunit, and special-population planning uses that platform when omitted.
`assessLotConsistency` has numeric planning defaults but no boolean inputs.
This family spans clinical strategy and CMC, so its fact/default disclosures need
both skill consumers checked.

## Dose optimization

Existing tool → function mapping in
`server/services/dose-optimization/dose-optimization-knowledge.ts`:

- `select_dose_finding_design` → `selectDoseFindingDesign:517`.
- `assess_project_optimus_alignment` → `assessProjectOptimusAlignment:762`.
- `design_randomized_dose_comparison` → `designRandomizedDoseComparison:1168`.
- `select_rp2d` → `selectRP2D:1411`.
- `design_backfill_strategy` → `designBackfillStrategy:1674`.
- `assess_dose_exposure_response` → `assessDoseExposureResponse:1917`.

Dose-finding selection treats missing statistical support as unavailable and
chooses BOIN/TITE-BOIN; target toxicity defaults to 0.25 with an existing
disclosure. Optimus alignment grants **20 points and a `met` pillar for omitted
`doseSelectedByMtdAlone`**, while other omitted facts become `not_met`. A stated
randomized comparison with an omitted dose count is accepted as adequate.

Randomized-comparison planning uses the non-NI and secondary-tolerability branches
when their booleans are omitted. RP2D selection marks dose-only rows viable and
selects a dose despite missing toxicity, exposure, target engagement and
longitudinal tolerability evidence. An `insufficient_data` per-dose verdict is
declared but unused. Backfill planning turns missing biopsy feasibility into
“biopsy not feasible.” Exposure-response assessment already returns an
`indeterminate` therapeutic window for inadequate points, but also returns false
flatness/safety-rise booleans and zero metrics. Its existing indeterminate result
should be retained and propagated consistently.

## RWE methodology

Existing tool → function mapping in
`server/services/rwe/rwe-methodology-knowledge.ts`:

- `design_target_trial` → `designTargetTrial:184`.
- `score_rwe_data_source` → `scoreDataSource:478`.
- `design_propensity_analysis` → `designPropensityAnalysis:734`.
- `select_rwe_design` → `selectRWEDesign:1183`.
- `assess_rwe_bias_risk` → `assessBiasRisk:1365`.
- `assess_rwe_regulatory_acceptability` → `assessRegulatoryAcceptability:1607`.

All 21 booleans are schema-required, but the engine functions do not validate
them. Data-source scoring turns six omitted capture/validation facts into negative
assertions such as no validation study or death linkage. Propensity and RWE
design selection take ordinary matching/weighting or default active-comparator
cohort branches from missing facts. Missing time-varying exposure can also enable
an IV branch through negation.

Bias assessment asserts no comparator while suppressing unstated surveillance,
self-report and confounding risks. Regulatory acceptability grades omitted
preregistration/validation `not_met`. Target-trial design has no booleans, but
missing enum/numeric facts can yield undefined mapped content; missing numeric
facts elsewhere can produce non-finite intermediate results. This is a broader
validation audit than the optional-boolean families.

## Pharmacovigilance

Existing tool → function mapping in
`server/services/pharmacovigilance/pharmacovigilance-knowledge.ts`:

- `classify_expedited_reporting` → `classifyExpeditedReporting:263`.
- `assess_pv_causality` → `assessCausality:804`.
- `plan_aggregate_safety_report` → `planAggregateReport:1146`.
- `detect_safety_signal` → `detectSafetySignal:1335`.
- `assess_signal_priority` → `assessSignalPriority:1562`.
- `design_pv_system` → `designPVSystem:1777`.

Expedited-reporting omission can mean non-serious, non-EEA and nonfatal, changing
whether reporting is required and choosing **15 rather than 7 days**. An omitted
intervention flag selects postmarketing rules for stage `both`. Causality defaults
information sufficient unless explicitly false; its Naranjo answers,
dechallenge/rechallenge and temporal inputs already preserve omission as
`unknown`, which provides an existing mechanism to extend.

Aggregate-report planning defaults to early-US quarterly scheduling and bypasses
an unstated EURD override. Signal detection uses at least three rather than one
case when DME is omitted. Signal priority awards zero for unstated vulnerability
and DME, lowering priority; missing enums also fall into the lowest categories.
PV-system design defaults EU authorization true, but new-substance/important-risk
flags false, potentially concluding that routine PV is sufficient. This family
has the most direct reporting-clock and safety-obligation consequences.

## Consumers and existing test controls

The canonical functions are reached through the handler blocks above. Searches
found no additional production function consumers. RWE additionally has the direct
engine regression
`server/services/rwe/__tests__/e-value-of-a-ci-crossing-the-null-is-one.test.ts`.
No tests naming these 30 exact tool handlers were found in the searched source
and test trees; the design's general `submission-center-tools.test.ts` and
`deepening-tools.test.ts` pins do not cover these families by name.

Definitions are imported by `server/services/ana/AnaToolDefinitions.ts`. Clinical
skill text in `server/services/ana/skills/library/clinical.ts` and capability
fixtures in `client/src/concept2cure/v2/fixtures/intelligence.ts` refer to the
families. Vaccine CMC also appears in
`server/services/ana/skills/library/cmc.ts` and
`server/services/ana-ri/persona.ts`.

Similarly named services and their tests are separate controls, not coverage of
these knowledge engines:

- Pediatric: `server/services/global-ri/pediatric-requirements.ts` and
  `server/services/global-ri/__tests__/pediatric-requirements.test.ts` implement
  jurisdictional plan requirements; the exclusivity regression
  `server/services/global-ri/__tests__/exclusivity-periods-generic-pediatric-extension-not-assessed.test.ts`
  exercises that separate regulatory layer.
- Dose: `server/services/stats/dose-finding-boin.ts`,
  `server/services/study-design/dose-escalation.ts` and
  `server/services/preclinical/fih-dose-engine.ts` have their own tests. They do
  not test the six Optimus functions inventoried here.
- RWE: `server/services/rwe-study-service.ts` and
  `server/services/ana/rwe-design.ts` have separate tests. The RWE/FAERS route
  honesty contract is also a separate surface.
- PV: `server/services/ana/pharmacovigilance.ts`,
  `server/services/ana/pharmacovigilanceReportingTools.ts`,
  `server/services/compliance/pharmacovigilanceService.ts` and
  `server/services/global-ri/pharmacovigilance-obligations.ts` are different
  engines/adapters. The AnA pharmacovigilance/reporting tests, compliance clock
  tests and route fail-closed tests do not test these six knowledge functions.
- Vaccine product-class/service-selection tests cover capability selection,
  not the vaccine knowledge engine's defaulted facts.

## Search scope and history limitation

Read root `AGENTS.md` and `CLAUDE.md`. Searches covered definition, engine,
function and tool names across `server`, `client`, `shared`, `tests` and `scripts`,
including consumers and matching test filenames. Deletion searches used
`git log --all --diff-filter=D --name-only --format=` with dose/Optimus/RP2D,
pediatric, vaccine, RWE/propensity/target-trial, pharmacovigilance/causality/
expedited-report/aggregate-report/signal-priority names. No matching deleted paths
were found in the available local history.

`git rev-parse --is-shallow-repository` returned `true`. The deletion result is
limited to this shallow checkout's available history and refs; it does not prove
that matching files never existed in the complete repository history. No history
fetch, production edit or test execution was performed for this read-only audit.
