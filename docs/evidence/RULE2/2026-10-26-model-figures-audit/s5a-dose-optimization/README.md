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
- **The RP2D.** A dose that is not too toxic or sub-therapeutic on its stated evidence, and lacks stated toxicity (or
  an MTD it does not exceed) or stated longitudinal tolerability, is `insufficient_data`, naming what was not stated.
  No RP2D is chosen without stated exposure, engagement or activity evidence. Where the mechanism indicates no
  plateau and `activityPlateauObserved` is not stated, none is chosen between several effective doses, since the
  lowest and the highest would each be defensible.
  When none is viable, the warning says that no dose level is shown tolerable and plausibly therapeutic on the stated
  evidence.
- **Backfill.** With a PD, target-engagement or biomarker objective, an unstated `biopsyFeasible` writes no biopsy
  claim and sizes no cohort: `recommendedPatients` and `totalBackfillPatients` are `null`.
- **Exposure-response.** Below two distinct exposures, the flags and slope signs read `not_assessed` and the range
  metrics are `null`. Points at one exposure are read at their mean response (see the review follow-up below).
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
- Dose rows whose dose is not a finite number, and exposure-response points whose exposure or response is not a
  finite number, are dropped without a refusal. A finite dose at or below zero and a finite response outside 0–1 are
  refused (review follow-up).
- An enum value outside its schema list, other than a backfill objective, is not refused. An unknown `timing`, for
  one, takes the post-marketing branch. This was found during the review follow-up and not changed.
- An omitted or empty `clearedDoseLevels` plans no cohort and is not refused. Where the sizes are assessed,
  `totalBackfillPatients` is 0, with the warning "No cleared dose levels supplied". This was found during the review
  follow-up and not changed.
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

## Review follow-up (2026-11-02)

An adversarial review of `2cc9340e2` confirmed five defects and four nits. They are fixed in the files named above.

**What already exists (RULE 3).** Nothing was rebuilt, and no tool, input, route, service file or table was added:
- the engine, the six definitions, the skill and the test named above are the ones changed;
- `statedOneOf`, the shared enum reader in `immunogenicity/immunogenicity-reference.ts`, is reused beside
  `statedNumber`;
- no shared reader refuses a list entry by its index. The shared readers in
  `immunogenicity/immunogenicity-reference.ts` and `ana-biostats/computation-engine.ts` read named fields, not the
  entries of a list. Elsewhere in `server/services`, `statedSections` (`ind-lifecycle/ind-loa-service.ts`) drops
  blank entries. `listField` (`ind-lifecycle/ind-annual-report-service.ts`) does refuse an entry by its index, but it
  is private to that service and reads objects. So a private `statedList` inside the engine reads each entry with
  `statedNumber` or `statedOneOf`.

`AnaToolExecutor.ts` is not touched.

**The change:**
- **The anticipated response rate** is read once with `statedNumber`, before the size is chosen. A value that is not
  strictly between 0 and 1 (`'0.35'`, `35`, `1.5`, `0`, `NaN`) is refused as `invalid_input`, with field
  `anticipatedResponseRateHighDose`. Before, it was read as omitted: with the goal stated false, that meant 30 per arm
  and the sentence "No anticipated response rate supplied". Omitted or `null`, that disclosed 30 per arm still
  applies.
- **Candidate and cleared doses** are read by index:
  - An entry that is empty or not a positive number is refused by its index (`candidateDoses[0]`,
    `clearedDoseLevels[1]`). A value that is not a list is refused by its field. Before, such an entry was dropped.
  - Fewer than two distinct candidate doses is refused as `missing_input`, with field `candidateDoses`. A comparison
    of one dose has no arms, allocation or size to give. Nulling the size alone would have left the allocation, the
    arm count and the "randomization across arms" note describing a comparison that does not exist. Before,
    `Math.max(…, 2)` reported two arms, and the size was computed for them.
  - `numberOfArms` is now the number of distinct doses.
- **Backfill objectives** outside the six schema values are refused by index (`objectives[0]`). Before, `'PD'` matched
  no objective, so the biopsy wait was skipped: two doses were sized at 6 patients each with `biopsyFeasible`
  unstated.
- **A dose row's dose**, when finite and at or below zero, is refused by its row (`doseLevels[1].dose`). Before, `-10`
  could be selected as the RP2D.
- **Exposure-response responses are probabilities.** The engine's point type says "Response/probability (0-1)", and
  both input schemas say 0–1. The engine also applies absolute 0.05 and 0.10 thresholds and reports changes in
  percentage points. So a finite response outside 0–1 is refused by its index
  (`efficacyExposureResponse[0].response`). Before, the same curve given in percent changed the verdict from flat to
  rising.
- **Tied exposures.** Points at one exposure are read as one point at their mean response. A curve therefore needs two
  distinct exposures to be assessed, and the verdict does not depend on the input order.
  - Counting distinct exposures with a deterministic tie order was checked first, and rejected. Take responses 0.1
    and 0.3 at each of two exposures: ordering ties by ascending response still read safety as rising by 20
    percentage points in every input order, and descending order would read it as falling.
  - Inputs without tied exposures keep their results.
- **Texts that described a choice not made, or evidence not stated,** now depend on it:
  - the 3+3 "listed only as a fallback" sentence and the OBD "chosen … design" sentence appear only when a design is
    recommended;
  - the two RP2D recommendations appear only when an RP2D is selected;
  - a viable dose with no stated toxicity, bounded by the stated MTD, reads "Tolerable on the stated MTD and
    longitudinal-tolerability evidence".
- **Corrected texts:**
  - `insufficient_data` applies only to a dose that is not too toxic or sub-therapeutic on its stated evidence: the
    two RP2D input descriptions, skill step 7, this README and `../design.md`;
  - an unanswered pillar leaves the Optimus score `null` and its tier `not_assessed`: skill step 8 and `../design.md`;
  - an exposure-response curve below two distinct exposures has its slope signs `not_assessed` and its range metrics
    `null`: the tool description and this README;
  - `../design.md` no longer says that every malformed value is refused. It names what is.

**Stated inputs whose result changes.** Each old result was a default, read a trend the points do not show, or
described a choice or evidence that was not stated:
- `candidateDoses: [100]`, with `goalNonInferiorActivityLowerDose: false`, gave 2 arms, 30 per arm and 60 in total.
  It is now refused.
- Safety points (10, 0.1), (10, 0.3), (40, 0.1) and (40, 0.3) read as rising by 20 points in that order, and as
  falling in reverse order. Both now read flat.
- Efficacy points (20, 0.4) and (20, 0.41), against safety points (10, 0.1) and (40, 0.3), read as flat, with a
  narrow window. Efficacy is now `not_assessed`, and the window `indeterminate`.
- With no RP2D selected, `recommendations` is empty instead of "Confirm the selected RP2D …".
- Wording only: `mtd: 400` with the row `{ dose: 200, longitudinalTolerabilityAcceptable: true }` gives the note
  "Tolerable on the stated MTD …" instead of "Tolerable on the stated toxicity …", since no toxicity was stated.
- Wording only: below two distinct exposures, the warning reads "Fewer than 2 valid efficacy points at distinct
  exposures" (or safety).

**User-visible:** AnA asks for the value instead of sizing, choosing or reading a trend from a malformed dose list,
objective, rate or response. It does not call a curve flat or rising from points at one exposure.

**Proof:**
- `red/review-before.txt`: the extended `dose-optimization-unstated-inputs.test.ts` on the code before this
  follow-up. 29 of 128 cases fail, all of them new; the 97 earlier cases and two new controls pass.
- `green/review-after.txt`: 128 of 128 pass.
- The neighbourhood passes: 19 files, 1,997 tests. It covers the COA, pediatric, vaccine, pharmacovigilance, RWE and
  dose unstated-input suites, the skills suites, the tool-selection suites, the tool registry and the RWE engine's
  own test.
- **Gates:**
  - the six descriptions stay within 1,024 characters, the exposure-response one at its earlier 986;
  - `docs/ana-capability-manifest.json` carries the changed exposure-response description and the two changed
    top-level input descriptions (`candidateDoses`, `anticipatedResponseRateHighDose`). Regenerating it from the
    definitions gives the same file, and no renderer changes;
  - repo-health byte ceiling: held (the engine is 99,925 bytes, under 100,000);
  - ESLint reports 14 warnings on the engine, as before: the same rules on the same functions; the ratchet is
    unchanged;
  - typecheck: 0 errors.
