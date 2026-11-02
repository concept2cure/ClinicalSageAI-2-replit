# Rule 2 · S5a RWE: the real-world-evidence worksheets score, grade and choose nothing from a fact nobody stated

**Rule:** CLAUDE.md Rule 2 and "fail closed, never fabricate".
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **F1** (a repair of shipped behaviour). The engine
(`server/services/rwe/`) is in no narrower package; the tool definitions and the clinical skill are S4 paths, which F1
covers. The coordinating session approved S5a under F1, on the files this session holds.
**Audit:** `../design.md`, S5a, the RWE family.
**Date:** 2026-11-01.

## The defect

The six RWE worksheets in `server/services/rwe/rwe-methodology-knowledge.ts` read every boolean as a truthy test, so
an omitted fact behaved as a stated false. Enums were not validated. Three worksheets range-checked their numbers
when present, and the bias confounder count and the acceptability sample size were not checked: an omitted number,
NaN or a string (unless it read as an out-of-range number) reached the engine, and a range refusal carried no `code`
or `field`. All 21 booleans were
schema-required, but the executor's required-key check only reports, so an omitted fact still reached the engine.
- **Data-source scoring.** Omitted capture facts scored as absent and were reported as findings:
  - "No validation study for key variable definitions";
  - "No death linkage";
  - "Pharmacy dispensing data not available";
  - "Lab results not captured".

  An overall score and band were always given. With only `hasValidationStudy` left out, a source scored 87,
  fitness "high", and carried the gap "No validation study". An omitted `studyQuestion` crashed into
  `{error: "… Cannot read properties of undefined …"}`.
- **Bias assessment.**
  - An omitted `hasActiveComparator` became "Confounding by indication (no active comparator)", a high risk.
  - Omitted surveillance and self-report facts silently dropped those biases.
  - An omitted confounder count dropped confounding.
  - A grade was always given, and quantitative bias analysis was marked required from it.
- **Regulatory acceptability.**
  - Omitted `preRegistered` and `validatedOutcomes` were graded not met, which lowered the overall grade.
  - The advice said to pre-register, and "When no prior randomized trial data exists…" for an omitted
    `existingTrialData`.
  - An omitted sample size was written up as "n=undefined".
  - Authority `'FDA'` crashed.
- **Selection.** `design_propensity_analysis` chose IPTW or matching, and `select_rwe_design` fell through to the
  new-user active-comparator design, from omitted facts.
- **Target trial.** An omitted follow-up rendered "up to undefined months"; an omitted causal contrast was written up
  as as-treated.

## What already exists (RULE 3)

This is a completion: nothing was rebuilt.
- **The engine:** `rwe-methodology-knowledge.ts` is the one engine for all six functions:
  - `designTargetTrial`;
  - `scoreDataSource`;
  - `designPropensityAnalysis`;
  - `selectRWEDesign`;
  - `assessBiasRisk`;
  - `assessRegulatoryAcceptability`.

  Its design vocabulary already existed in `DESIGN_CATALOG`; the validation derives the nine designs from it rather
  than copying the list.
- **The definitions and handlers:** the six definitions are in `server/services/ana/rweMethodologyTools.ts`, spread
  into `ALL_ANA_TOOLS`. The handlers go through `runStatsTool`, which labels a success with `statedInputEnvelope` and
  turns a `ComputationRefusal` into `needs_parameters` with `code` and `field`. No handler change was needed, and
  `AnaToolExecutor.ts` is not touched.
- **The shared readers, reused rather than copied:**
  - `statedBoolean` and `booleanInputStates` (`immunogenicity/immunogenicity-reference.ts`);
  - `refuseUnlessStated` and `ComputationRefusal` (`ana-biostats/computation-engine.ts`).

  The local context check, `requireRWEContext`, maps this engine's vocabularies onto `refuseUnlessStated`, as
  `requirePediatricContext`, `requireCOAContext` and the vaccine engine's `validateTextInputs` do for theirs.
- **Separate RWE code, not this engine and not touched:**
  - `server/services/ana/rwe-design.ts` (`advise_rwe_design`);
  - `server/services/rwe-study-service.ts` with `server/routes/real-world-evidence.ts`.
- **The engine's existing test:** `rwe/__tests__/e-value-of-a-ci-crossing-the-null-is-one.test.ts` states every
  input; it is unaffected and passes.
- **The skill:** `server/services/ana/skills/library/clinical.ts`, the RWE method.
- **The inventory:** `../s5a-coa-pro/queued-clinical-families.md` (this family), and the 2026-11-01 re-baseline
  (`docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-11-01-plan-alignment/rebaseline-2026-11-01.json`).
- **Readers of the changed result fields:** none in the client. `git grep` found no reader of `fitnessForPurpose`,
  `overallAcceptability`, `overallBiasRisk`, `evidenceRequirements` or `primaryDesign`. The manifest's generic
  renderers show the new values as data. No existing test pins the old behaviour.

**Searches run:**
- `git grep` across server, client, shared, scripts, tests and services for:
  - the six tool names and the six function names;
  - `RWE_METHODOLOGY_TOOLS` and `rwe-methodology-knowledge`;
  - `not_stated|not_assessed` in the RWE files (no hits before this change);
  - the `statedBoolean`, `booleanInputStates` and `refuseUnlessStated` call sites.
- `git log` on the engine and the tools file: only the `182fed957` merge.

**History:**
- `git log --all --diff-filter=D --name-only`, filtered for
  `rwe|real.?world|propensity|target.?trial|bias.?risk|acceptability|e-value`, finds one unrelated file.
- `git log --all --diff-filter=D -- '*rwe*' '*propensity*' '*target-trial*'` finds nothing.
- The clone is shallow, so this covers local history only.

## The change

- **Booleans.** The 12 booleans of data-source scoring, bias assessment and acceptability are optional (13 since
  the review follow-up below). Each
  reports `true`, `false` or `not_stated` through `inputStates`. Each property description says what an omission
  means ("Omitted or null stays not_stated: …"), as the vaccine definitions do. A malformed answer is refused by
  field, never read.
- **Data-source scoring.** A dimension that reads an unstated fact is `null`, and names it in `notStated`. While any
  dimension is unassessed, the overall score is `null` and fitness is `not_assessed`. No dimension gap,
  recommendation or reliability finding is written for an unstated fact. The per-source-type strengths and
  limitations are a reference profile; since the review follow-up below, its note says so.
- **Bias assessment.** An unstated bias stays listed and ungraded (`not_assessed`). The overall grade, and whether
  quantitative bias analysis is required, are given only when no answer could change them.
- **Regulatory acceptability.** A requirement that reads an unstated fact is `not_assessed`. The overall grade is
  given only when no answer could change it. No advice is written from an unstated fact. The second sentence holds
  only since the review follow-up below: until then the sensitivity-analysis requirement was fixed at
  `partially_met`, with no input behind it.
- **Selection.** `design_propensity_analysis` and `select_rwe_design` output nothing but the choice, so they refuse
  an unstated deciding fact by name. This is conservative: they refuse even a fact the branch they reach would not
  read.
- **Required context.** Every required enum, number and text is refused by name when it is missing or malformed,
  across all six tools: whitespace-only text, a non-finite or string number, a wrong-case or unknown enum such as
  `'FDA'`, and an out-of-range `continuousEnrollmentPct`. The old `Error('… must be …')` throws are removed rather
  than duplicated.
- **The definitions** say what an omitted flag means and claim no default. Their shared note ("dependent conclusions
  remain not_assessed or null") follows the pediatric and vaccine wording. It does not use the word "score", which
  would have moved two tools to the ranked-cards renderer in the generated manifest.
- **The clinical skill** says when a data-source score, a bias grade or a requirement is not assessed, and to ask for
  the missing fact.
- **The design** records this family's "What already exists" and its result. Its status table moves on and now also
  lists S6 and `start_war_game`, which had landed without rows.

**Residuals, recorded rather than changed:**
- **Description length.** All six descriptions exceed the 1,024 characters the gateway keeps for OpenAI-compatible
  providers (1,248 to 1,705 after the review follow-up). Four already exceeded it before this change. On that path
  the shared note is cut. The per-property descriptions still carry what an omission means, the three assessment
  descriptions name their `null` or `not_assessed` result within the first 1,024 characters, and the results still
  carry `not_stated` and `not_assessed`. Moving the note to the front of each description is a follow-up.
- **Unvalidated optional inputs.** `assessBiasRisk`'s optional `observedEffectEstimate` and `observedCILower` are
  still not validated. A string `observedEffectEstimate` still ends in `{error: …}`. `designTargetTrial`'s optional
  `therapeuticArea` is not read at all: the result is the same with or without it, and its description now says so.
- **Duplicated vocabularies.** The enum vocabularies are listed in both the tool schema and the engine. They are typed
  against the engine's own unions, but a future enum change must touch both files.
- **Strict selection.** The two selection tools could later read their facts three-valued, refusing only a fact the
  reached branch needs.
- **Source-type profile.** A trait that bears on a flag without asserting lab, clinical-notes or pharmacy capture
  stays, labelled by the note: EHR "Disease severity markers available", and claims "Standardized coding
  (ICD/CPT/NDC)", which no stated `hasProcedures` or `hasPharmacyDispensing` removes. So do traits about size,
  follow-up and geography, such as claims "Large, representative populations" or a registry's "Limited sample size
  relative to claims", which can disagree with a stated `estimatedSampleSize`, `longitudinalYears` or
  `geographicCoverage`.

**User-visible:** when a fact is not given, AnA's real-world-evidence tools report the affected score, bias or
requirement as not assessed and ask for it. Examples are whether a validation study exists, whether there is an
active comparator, and whether the protocol is registered. They no longer:
- report "no validation study" or a lower grade;
- choose a propensity method or a design from a guess;
- crash on a missing study question or an unknown authority.

## Proof

- `red/before.txt`: `rwe-unstated-inputs.test.ts` fails 55 of 64 cases on `2cc9340e2` (trunk `867a9b5bb` plus the
  dose-optimization commit). The 9 controls pass: the explicit-result pins (95/high, low, high, IPTW, new-user active
  comparator), the stated-false data source and comparator, and the stated acceptability answers.
- `green/after.txt`: 64 of 64 pass.
- **The neighbourhood passes: 19 files, 1,966 tests.** It covers:
  - every S5a unstated-input suite (COA, pediatric, vaccine, pharmacovigilance, dose optimization);
  - the RWE engine's E-value test;
  - the skills suites;
  - tool selection;
  - the tool registry.
- **Gates:**
  - typecheck: 0 errors;
  - ESLint ratchet: no file gains a warning;
  - `manifest:ana`: regenerated in the same commit. Six tools change their descriptions, and the three assessment
    tools their inputs and required inputs. None is added and no renderer changes.
  - repo-health ceilings: no new oversized file. The engine was already over both thresholds before this change.

**How it was made.** A read-only planner wrote the patch; an adversarial critic then checked it against the code,
through a shim and through the real executor, and corrected it. It:
- reworded the shared note so the manifest's renderers do not change;
- added the per-property omission text the vaccine precedent uses;
- corrected the design and skill text, which had said a score was `not_assessed` (it is `null`) and that a
  requirement reads `existingTrialData` (only a recommendation does);
- tightened two engine comments;
- added the definition cases to the red test.

The critic's corrected edits and red test were applied. Its three status-line edits were re-anchored, because the
pharmacovigilance and dose-optimization slices landed first.

## Review follow-up (2026-11-02)

An adversarial review of this commit confirmed two defects and three nits; this follow-up corrects all five. A third
claim, that the acceptability pathway text is FDA-framed whatever the authority, was refuted for this commit: that
text is unchanged from the parent, and the follow-up does not touch it.

**What already exists (RULE 3).** Each fix completes code named above: the acceptability grading in
`assessRegulatoryAcceptability` (`ACCEPTABILITY_FLAGS`, `statedBoolean`, `statusFrom`, `unresolved`, `gradeOf`), the
`sourceTraits` map that `scoreDataSource` returns as `strengthsAndLimitations`, the six definitions, the clinical
skill's RWE method and `rwe-unstated-inputs.test.ts`. Before this follow-up, `git grep strengthsAndLimitations`
found only its interface and its return, so adding a field breaks no reader. The executor's handler passes its
input to the engine whole, so the new input needs no handler change. One optional input is added to an existing
tool; no tool, route, service file or table is added.

- **The sensitivity-analysis requirement was a default.** "Sensitivity analyses for unmeasured confounding" was fixed
  at `partially_met`, with no input behind it, and its half credit counted toward the grade. A fully stated
  post-marketing-safety plan (FDA, nested case-control, claims, all three facts true, n = 5,000) graded `moderate` at
  5.5 of 7 credits, a grade no answer decided: with the analyses planned it is 6 of 7 (`high`), without them 5 of 7
  (`moderate`). The review's plan, the same with a new-user active-comparator design, graded `high` at 6 of 7: without
  the analyses it is 5.5 of 7 (`moderate`).
- **Decision: an input, read as the other facts are.** `assess_rwe_regulatory_acceptability` takes an optional
  `sensitivityAnalysesPlanned`, read through `statedBoolean` and `statusFrom` as `preRegistered` and
  `validatedOutcomes` are. Stated true, the requirement is `met`; stated false, it is `not_met`, with the existing
  advice on what to include. Omitted or null, it stays `not_stated` and the requirement is `not_assessed`: its credit,
  0 or 1, joins the unresolved ones, so the grade is given only when no answer could change it, and the `State …`
  recommendation names it. All seven requirements count, as before. Both plans above are now `not_assessed` with
  the input left out, `high` with it true and `moderate` with it false.
- **Why not the alternatives.** A first draft of this follow-up graded over the other six requirements. That scores
  the missing one at the mean of the six (for their credit c, c/6 = (c + c/6)/7), and it moved 720 fully stated plans
  from `moderate` to `high`, the favourable direction, with nothing stated. Holding the credit open with no input to
  resolve it would leave 6,672 of the 10,368 fully stated plans counted below with no way to be graded. Keeping the fixed half
  credit keeps a default deciding grades.
- **The data-source profile stated capture facts.** `strengthsAndLimitations` is a fixed profile per `sourceType`,
  and it was returned whatever the flags said. A claims source listed "Complete pharmacy dispensing capture" and "No
  lab results or clinical notes" when those facts were not stated, and also beside a stated
  `hasPharmacyDispensing: false` or `hasLabResults: true`. The profile now carries a `note`: it is typical of the
  source type and not established for the stated source, and the stated capture facts are in `inputStates` and
  `dimensions`. The nine traits that assert lab, clinical-notes or pharmacy capture are left out when a stated flag
  contradicts them. Biomarkers count as lab results and unstructured data as clinical notes, as the tool definitions
  describe `hasLabResults` and `hasClinicalNotes`: EHR "Treatment response data (biomarkers)" and "Unstructured data
  requires NLP extraction", and biobank "Genomic/biomarker data linked to clinical records", are among the nine.
- **Nits.** The three assessment descriptions name their `null` or `not_assessed` result inline, within the first
  1,024 characters, and no renderer changes. `therapeuticArea`'s description says it is not read. "The defect" no
  longer says numbers were not validated.

**Results that change for fully stated inputs**, against the code before this follow-up:
- **Acceptability.** Over the 10,368 plans that state the three existing facts (8 purposes, 9 designs, 6 sources,
  sample sizes 50, 200 and 5,000, every true/false answer):
  - `sensitivityAnalysesPlanned: true` raises 3,456 grades one step: 720 `moderate` to `high`, 1,728 `low` to
    `moderate` and 1,008 `insufficient` to `low`.
  - `sensitivityAnalysesPlanned: false` lowers 3,216 one step: 288 `high` to `moderate`, 1,488 `moderate` to `low`
    and 1,440 `low` to `insufficient`.
  - Left out, 6,672 become `not_assessed`: exactly the plans in the two lists above, whose grade the answer decides.
    The other 3,696 keep their grade.

  Each changed grade rested on the fixed half credit, and the grade does not read the authority. In every result
  the sensitivity requirement is `met`, `not_met` or `not_assessed` rather than `partially_met`, with its
  recommendation to match, `inputStates` carries `sensitivityAnalysesPlanned`, and the note's counts follow. Left
  out, the input is also named in the `State …` recommendation. Nothing else in the result changes.
- **Data source.** A trait is dropped only where a stated flag contradicts it: claims with `hasLabResults: true` no
  longer lists "No lab results or clinical notes". Every profile gains the note. Over all 384 true/false answers to
  the six flags for the six source types, with one set of stated numbers, nothing else in the result changes.

With another fact left out as well, the answer can also give a grade that was withheld, or withhold one that was
given. The test's label-expansion plan (FDA, new-user active comparator, linked claims-EHR, every fact true,
n = 5,000) with `validatedOutcomes` left out grades `high` with the analyses planned (6 or 7 of 7), where it was
`not_assessed` (5.5 or 6.5 of 7). With `dataSource: 'claims'` as well, it stays `not_assessed`.

**Proof:**
- `red/review-before.txt`: the follow-up's `rwe-unstated-inputs.test.ts` fails 15 of 77 cases against the engine
  and definitions as they were before it. The 15 are the 13 new cases, the acceptability definition case (no
  `sensitivityAnalysesPlanned` property) and the replaced "gives a grade the unstated fact cannot change"; the
  other 62 pass.
- `green/review-after.txt`: 77 of 77 pass.
- `manifest:ana` regenerated: three tool descriptions and the `therapeuticArea` input description change, and
  `assess_rwe_regulatory_acceptability` gains the optional `sensitivityAnalysesPlanned` input. No tool is added and
  no renderer changes; `design_target_trial` and `assess_rwe_bias_risk` stay `result-card`.
- **The neighbourhood passes: 23 files, 2,040 tests.** It covers every S5a unstated-input suite, the skills suites,
  the tool-selection suites, the tool registry, the RWE engine's own test, and the other RWE code's tests
  (`rwe-design`, `rwe-study-service`, the real-world-evidence route's 5xx containment and its FAERS honesty
  contract).
- **Gates:** typecheck 0; ESLint ratchet unchanged (the engine's warnings stay complexity and max-lines, as before);
  `ci:one-design-plan` with `Plan: F1`.
