# Rule 2 · S5a dose optimization: the Project Optimus worksheets score, choose and size nothing from a fact nobody stated

**Rule:** CLAUDE.md Rule 2 and "fail closed, never fabricate".
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **F1** (a repair of shipped behaviour). The engine
(`server/services/dose-optimization/`) is in no narrower package; the tool definitions and the clinical skill are S4
paths, which F1 covers. The coordinating session approved S5a under F1, on the files this session holds.
**Audit:** `../design.md`, S5a, the dose-optimization family.
**Date:** 2026-11-01.

## The defect

The six Project Optimus worksheets in `server/services/dose-optimization/dose-optimization-knowledge.ts` read an
omitted fact as an answer:
- **The Optimus score.** An omitted `doseSelectedByMtdAlone` earned +20 points, a met pillar and the strength "Dose was
  not selected by MTD alone". With the other seven pillars true and that one omitted, the result was score 100,
  `strong`. Each other omitted pillar became a not-met pillar with a gap asserting a fact nobody stated, such as
  "No randomized dose comparison was conducted".
- **The escalation design.** An omitted statistician or late-onset fact was read as false, so BOIN was chosen, or
  TITE-BOIN for an ADC, checkpoint inhibitor or cell therapy.
- **The randomized comparison.** An omitted non-inferiority goal sized 30 per arm; an omitted tolerability role made
  tolerability a key secondary endpoint.
- **The RP2D.** A dose row with nothing but its dose passed every check and was `viable`. With no row carrying effect
  evidence, the middle viable dose was chosen anyway: a dose with no toxicity, exposure, engagement or tolerability
  evidence. `insufficient_data` was declared and never assigned.
- **Backfill.** An omitted `biopsyFeasible` was read as false: "Peripheral PD / target-engagement markers (biopsy not
  feasible)", and 8 patients per dose.
- **Exposure-response.** A one-point curve was reported as flat, with slope ranges of 0.
- **The target toxicity rate.** `null`, `'0.3'`, `0`, `1`, `1.5` and `NaN` all silently became 0.25, without saying so;
  `null` also produced "Target toxicity rate null is outside the usual 0.10-0.40 range".
- **Malformed values were accepted.** A dose count of `'3'`, `2.5` or `-1`, a probability of `'0.2'`, `1.5` or `NaN`,
  and `'true'` for a flag all went through JavaScript coercion.

## What already exists (RULE 3)

This is a completion: nothing was rebuilt.
- **The engine:** `dose-optimization-knowledge.ts` is the one engine for all six functions:
  - `selectDoseFindingDesign`;
  - `assessProjectOptimusAlignment`;
  - `designRandomizedDoseComparison`;
  - `selectRP2D`;
  - `designBackfillStrategy`;
  - `assessDoseExposureResponse`.

  It already had the per-dose `insufficient_data` verdict (declared, unused), the `indeterminate` therapeutic window
  for fewer than two points, and the disclosed 0.25 target-toxicity default. All are reused.
- **The definitions and handlers:** the six definitions are in `server/services/ana/doseOptimizationTools.ts`, spread
  into `ALL_ANA_TOOLS`. The handlers go through `runStatsTool`, which labels a success with `statedInputEnvelope` and
  turns a `ComputationRefusal` into `needs_parameters` with `code` and `field`. No handler change was needed, and
  `AnaToolExecutor.ts` is not touched.
- **The shared readers, reused rather than copied:**
  - `statedBoolean`, `booleanInputStates` and `statedNumber` (`immunogenicity/immunogenicity-reference.ts`);
  - `ComputationRefusal` (`ana-biostats/computation-engine.ts`).

  These are the S5a precedents' readers: COA `49211250d`, pediatric `23eb03578`, vaccine `955d1b4c3`, and
  pharmacovigilance (`../s5a-pharmacovigilance/`).
- **Separate engines, not this family and not touched:**
  - `stats/dose-finding-boin.ts` (`design_dose_finding`);
  - `study-design/dose-escalation.ts`;
  - `preclinical/fih-dose-engine.ts`;
  - `clinical-pharmacology/exposure-response-engine.ts` (`select_exposure_response_dose`).
- **The skill:** `server/services/ana/skills/library/clinical.ts`, oncology dose optimization, steps 7 and 8.
- **The inventory:** `../s5a-coa-pro/queued-clinical-families.md` (this family), and the 2026-11-01 re-baseline
  (`docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-11-01-plan-alignment/rebaseline-2026-11-01.json`).
- **Readers of the changed result fields:** none outside the engine. `git grep` found no reader of `alignmentScore`,
  `alignmentTier`, `recommendedRP2D`, `totalBackfillPatients`, `efficacyResponseFlat`, `safetyRisesWithExposure`,
  `illustrativePerArmSize`, `recommendedDesignProfile`, `pillarStatus` or `cohortPlans`. Results render through the
  generic document-canvas renderer. No existing test pins the old behaviour.

**Searches run** (`git grep` across server, client, shared, services, scripts and tests):
- the six tool names and the six function names;
- `dose-optimization`, `doseOptimization`, `Optimus`, `rp2d`, `backfill`;
- `not_stated|statedBoolean|booleanInputStates`: no hits in the engine or the tools file before this change;
- the result field names above.

**History:** `git log --all --diff-filter=D --name-only`, filtered for
`dose|optimus|rp2d|backfill|exposure.?response|dose.?finding`, finds nothing. The clone is shallow, so this covers
local history only.

## The change

- **Booleans.** Each boolean reports `true`, `false` or `not_stated` through `inputStates`, and each RP2D dose row
  carries its own. A malformed answer (`'true'`, `0`) is refused by field, never read.
- **The Optimus score.** An unanswered pillar is `not_stated`, with no gap asserted. The score is `null` and the tier
  `not_assessed` while any pillar is unanswered.
- **The escalation design.** An unstated statistician fact leaves `recommendedDesign` at `not_assessed`, with a null
  profile and family and **no ranked alternatives**. So does an unstated late-onset fact, unless a DLT window over 28
  days or an ADC, checkpoint-inhibitor or cell-therapy modality already indicates late onset. Those still override a
  stated false late-onset flag, as before.
- **The randomized comparison.** An unstated goal leaves the illustrative arm size `null`; an unstated tolerability
  role leaves that endpoint role not assessed.
- **The RP2D.** A dose without stated toxicity (or an MTD it does not exceed) or without stated longitudinal
  tolerability is `insufficient_data`, naming what was not stated. No RP2D is chosen without stated exposure,
  engagement or activity evidence. Where the mechanism indicates no plateau and `activityPlateauObserved` is not
  stated, none is chosen between several effective doses, since the lowest and the highest would each be defensible.
  When none is viable, the warning says that no dose level is shown tolerable and plausibly therapeutic on the stated
  evidence.
- **Backfill.** With a PD, target-engagement or biomarker objective, an unstated `biopsyFeasible` writes no biopsy
  claim and sizes no cohort: `recommendedPatients` and `totalBackfillPatients` are `null`.
- **Exposure-response.** Below two points, the flags read `not_assessed` and the metrics are `null`.
- **The target toxicity rate** is read with the shared `statedNumber`. Omitted or `null` takes the disclosed 0.25; a
  malformed value is refused as `invalid_input` with field `targetToxicityRate`.
- **Numbers.** The Optimus dose count must be a whole number, and a dose row's toxicity and activity a probability
  from 0 to 1.
- **The definitions** say what an omitted flag means and claim no default. All six stay within the 1,024-character
  limit the gateway applies (`gateway.ts`), which two of them exceeded before.
- **The clinical skill** (steps 7 and 8) says when a dose is `insufficient_data` and when the Optimus score is not
  assessed, and to ask for the missing fact.
- **The design** records this family's "What already exists" and its result, and its status row moves on.

**Residuals, recorded rather than changed** (string, enum and numeric defaults outside the boolean mechanism):
- The disclosed defaults: `targetToxicityRate` 0.25, `primaryActivityEndpoint` `ORR`, `timing` `pre_registration`,
  `doseUnit` `mg`, `exposureMetric` `AUC`, and the default backfill objectives.
- The 30-per-arm illustrative size when `anticipatedResponseRateHighDose` is omitted, and the fixed 60-per-arm
  non-inferiority heuristic.
- A relative exposure-response gain of 1 or 0 from a zero baseline.
- Numeric inputs that are still ignored when malformed: `dltWindowDays`, `numberOfDoseLevels`,
  `anticipatedEscalationSampleSize`, `feasibleSampleSize`, `maxBackfillPatients`, `mtd` and `exposureAtProposedDose`.
- Dose rows with a non-finite dose, and exposure-response points with a non-finite exposure or response, are dropped
  without a refusal.
- An unselected `recommendedRP2D` is absent from the JSON rather than `null`.
- The Optimus input schema still lists all eight pillar booleans as required, which presses the model to supply an
  answer it may not have. The pediatric precedent kept its required booleans too, so this change leaves that as is.
- Two judgement calls, kept and named:
  - `randomizedDoseComparisonConducted` true with no dose count stays met, because the input's own question reads
    "Were ≥2 doses studied in a randomized fashion?".
  - A stated MTD bounds acute toxicity for doses at or below it, so `toxicityProbability` is not required for them.

**User-visible:** when a dose-optimization fact is left unstated, AnA says so and asks for it. It no longer:
- scores the missing fact as a met Optimus pillar;
- picks BOIN, or ranks the alternatives;
- sizes the arms or the backfill cohorts;
- chooses an RP2D;
- writes "biopsy not feasible";
- calls an unmeasured exposure-response curve flat.

## Proof

- `red/before.txt`: `dose-optimization-unstated-inputs.test.ts` fails 79 of 97 cases on `867a9b5bb`; the 18
  controls pass.
- `green/after.txt`: 97 of 97 pass.
- The neighbourhood passes: 17 files, 1,899 tests. It covers the COA, pediatric, vaccine and
  pharmacovigilance unstated-input suites, the skills suites, tool selection and the tool registry.
- **Gates:**
  - typecheck: 0 errors;
  - ESLint ratchet: one warning fewer (a `let` that became `const`);
  - `manifest:ana`: regenerated in the same commit. The six tools change their descriptions and five their inputs;
    none is added and no renderer changes;
  - repo-health byte ceiling: held (the engine is 98,626 bytes, under 100,000).

**How it was made.** A read-only planner wrote the patch; an adversarial critic then checked it against the code and
corrected it. It:
- removed two untrue comments ("an unanswered fact is not_stated, never a default");
- added the target-toxicity-rate refusal the plan missed;
- emptied the ranked alternatives when no design is recommended;
- corrected the no-viable-RP2D warning;
- tightened two comments;
- added the cases that catch each of these to the red test.

The critic's corrected edits and red test were applied. Its two status-line edits were re-anchored, because the
pharmacovigilance slice landed first.
