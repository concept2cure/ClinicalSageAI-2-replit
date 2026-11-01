# Rule 2 · S5a RWE: the real-world-evidence worksheets score, grade and choose nothing from a fact nobody stated

**Rule:** CLAUDE.md Rule 2 and "fail closed, never fabricate".
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **F1** (a repair of shipped behaviour). The engine
(`server/services/rwe/`) is in no narrower package; the tool definitions and the clinical skill are S4 paths, which F1
covers. The coordinating session approved S5a under F1, on the files this session holds.
**Audit:** `../design.md`, S5a, the RWE family.
**Date:** 2026-11-01.

## The defect

The six RWE worksheets in `server/services/rwe/rwe-methodology-knowledge.ts` read every boolean as a truthy test, so
an omitted fact behaved as a stated false. Enums and numbers were not validated. All 21 booleans were
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

- **Booleans.** The 12 booleans of data-source scoring, bias assessment and acceptability are optional. Each
  reports `true`, `false` or `not_stated` through `inputStates`. Each property description says what an omission
  means ("Omitted or null stays not_stated: …"), as the vaccine definitions do. A malformed answer is refused by
  field, never read.
- **Data-source scoring.** A dimension that reads an unstated fact is `null`, and names it in `notStated`. While any
  dimension is unassessed, the overall score is `null` and fitness is `not_assessed`. No finding is written for an
  unstated fact.
- **Bias assessment.** An unstated bias stays listed and ungraded (`not_assessed`). The overall grade, and whether
  quantitative bias analysis is required, are given only when no answer could change them.
- **Regulatory acceptability.** A requirement that reads an unstated fact is `not_assessed`. The overall grade is
  given only when no answer could change it. No advice is written from an unstated fact.
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
  providers (1,248 to 1,688). Four already exceeded it before this change. On that path the shared note is cut. The
  per-property descriptions still carry what an omission means, and the results still carry `not_stated` and
  `not_assessed`. Moving the note to the front of each description is a follow-up.
- **Unvalidated optional inputs.** `assessBiasRisk`'s optional `observedEffectEstimate` and `observedCILower`, and
  `designTargetTrial`'s optional `therapeuticArea`, are still not validated. A string `observedEffectEstimate` still
  ends in `{error: …}`.
- **Duplicated vocabularies.** The enum vocabularies are listed in both the tool schema and the engine. They are typed
  against the engine's own unions, but a future enum change must touch both files.
- **Strict selection.** The two selection tools could later read their facts three-valued, refusing only a fact the
  reached branch needs.

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
