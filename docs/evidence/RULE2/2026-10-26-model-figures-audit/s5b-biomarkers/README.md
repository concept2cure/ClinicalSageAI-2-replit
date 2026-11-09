# Rule 2 · S5b biomarkers: the biomarker worksheets classify, choose and validate nothing from a fact nobody stated

**Rule:** CLAUDE.md Rule 2 and "fail closed, never fabricate".
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **F1** (a repair of shipped behaviour). The engine
(`server/services/biomarkers/`) is in no narrower package. The tool definitions and the diagnostics skill are S4
paths, which F1 covers. The coordinating session holds S5b under F1 (`.design/claude-convergence/COORDINATION.md`,
"Four commits, one per engine"); this is the first of the four.
**Audit:** `../design.md`, S5b, the biomarker family.
**Date:** 2026-11-08.

## The defect

Every boolean the six biomarker worksheets read was tested `=== true` or `!== false`, so an omitted fact was an
answer. The clinical-validation cutoff fact is the one S3 had reached: since its review (`dd60c6e12`, row [1])
validity required a stated true, so an omitted cutoff no longer established it, but `validityEstablished` was still
false, an answer. Only clinical validation refused a malformed value, through the 2×2
engine and without naming the field. Inputs below were run on the engine as it was before this change.

- **Classification** (`classify_biomarker`).
  - `classifyBiomarker({ biomarkerName: 'X' })` returned "prognostic", "Insufficient distinguishing features
    supplied; defaulted to prognostic".
  - `{ confirmsDisease: true }` returned "diagnostic", although a stated `predictsDifferentialTreatmentEffect: true`
    makes it predictive.
  - With all six features stated false, the intended use's first category was returned even when its own defining
    feature was stated false: `intendedUse: 'enrichment'` gave "predictive" with `predictsDifferentialTreatmentEffect:
    false`.
  - `assertedCategory: 'Predictive'` returned category "Predictive" with the diagnostic descriptor ("Diagnostic
    biomarker"), and `predictsDifferentialTreatmentEffect: 'true'` read as false ("prognostic").
  - A missing `biomarkerName` was not asked for.
- **Qualification** (`plan_biomarker_qualification`).
  - With the scope facts omitted, the pathway was "drug_specific_submission", "Use confined to a single drug
    program". `{ crossProgramUse: true }` alone gave "ddt_qualification", though `singleDrugOnly: true` gives the
    other answer.
  - An inferred moderate or low COU tier was not disclosed (only a high one was), and an omitted `isGenomic` read as
    false.
  - `category: 'Safety'` was inferred as a low tier.
- **CDx co-development** (`design_cdx_codevelopment`).
  - `{ therapeuticName, biomarkerName, assayModality: 'ihc' }` returned a companion diagnostic, contemporaneous
    approval required, Class III and PMA: `essentialForUse` was "Default true".
  - An omitted `usedClinicalTrialAssay` read as false ("No CTA-to-IVD bridging study indicated").
  - `{ usedClinicalTrialAssay: true, therapeuticPhase: 'filed' }` read the omitted `marketAssayDiffersFromCTA` as
    true: bridging required, and a critical finding that the market IVD "still diverges from the enrolling CTA".
  - `essentialForUse: 'false'` read as true.
- **Analytical validation** (`assess_biomarker_analytical_validation`).
  - An omitted `quantitative` read as true ("Default true"), so a qualitative assay was assessed by bias and
    linearity.
  - With neither `maxAcceptableCVPercent` nor `intendedUseStakes` stated, a CV of 12% passed "vs acceptance ≤ 15%",
    though a high-stakes use's 10% default fails it.
  - With `intendedUseStakes: 'high'` and `multiSiteReproducibility` omitted, the finding said multi-site
    reproducibility was "not demonstrated".
  - `precisionCVPercent: '8'` passed as a CV of 8%, and `interferenceTested: 'true'` read as not tested.
  - A call without `inputs` crashed: `Cannot read properties of undefined (reading 'precisionCVPercent')`, which the
    handler returns as an error.
  - An omitted evidence fact put its study in `outstandingRequirements` exactly as a stated false did: `{}` listed
    "Interference / cross-reactivity study (CLSI EP07)." for an interference test nobody described.
- **Clinical validation** (`assess_biomarker_clinical_validation`).
  - With `cutoffPrespecified: true` and `independentValidationSet` omitted, `validityEstablished` was false, with
    "Performance not confirmed on an independent validation set". An omitted `clinicalUtilityDemonstrated` read
    "Utility is not yet demonstrated".
  - With `cutoffPrespecified` omitted and the other facts stated true, `validityEstablished` was false.
  - `intendedUsePrevalence: '0.1'` was read as 0.1 (PPV re-projected to 0.5) and echoed as the string `"0.1"`.
  - `truePositives: '45'` was refused by the 2×2 engine under its own name ("tp must be a non-negative safe
    integer"), with no field.
- **Enrichment** (`plan_enrichment_strategy`).
  - A predictive marker with its design facts omitted was "stratified", "Predictive hypothesis not yet firmly
    established", though the answers can make it biomarker-positive-only or add a negative cohort.
  - With the effect concentrated in positives and `validatedAssayAvailable` omitted, the finding said "No validated
    assay reported".
  - The prevalence was clamped: 1.5 read as 1, "feasible"; 0 reported 0 screens per enrolled positive beside "(~∞)".
  - `category: 'Predictive'` read as an unknown category: no enrichment, all-comers.

## What already exists (RULE 3)

This is a completion: nothing was rebuilt.
- **The engine:** `server/services/biomarkers/biomarker-knowledge.ts` is the one engine for all six functions. It had
  no three-valued helpers of its own. S3 (2026-10-26, `5aa47407d`, `dd60c6e12`) made only the clinical-validation
  cutoff fact three-valued and converged its 2×2 onto `computeDiagnosticAccuracy`
  (`server/services/stats/clinical-performance.ts`); `biomarker-clinical-validation-refuses-an-empty-stratum.test.ts`
  pins that. This change extends the six functions and their result types.
- **The definitions and handlers:** `server/services/ana/biomarkerTools.ts`, spread into `ALL_ANA_TOOLS`. The six
  handlers in `AnaToolExecutor.ts` run through `runStatsTool`. It labels a success with `statedInputEnvelope`, and
  turns a `ComputationRefusal` into `needs_parameters` with `code` and `field`. `AnaToolExecutor.ts` is not touched.
- **The shared readers, reused:** `statedBoolean`, `booleanInputStates`, `statedNumber` and `statedOneOf`
  (`immunogenicity/immunogenicity-reference.ts`), `refuseUnlessStated` and `RequiredInputCheck`
  (`ana-biostats/computation-engine.ts`), and the US classes `DEVICE_CLASSES` (`shared/regulatory/device-class.ts`).
  The engine's exhaustive answer search (`everyAnswer`, `conclusions`, `decidingFacts`) is local: GCP's and GMP's
  `anyOf`/`allOf` bound a monotone status by its all-true and all-false answers, which a precedence (the BEST
  classification, the enrichment design) is not.
- **The skills:** `server/services/ana/skills/library/diagnostics.ts` (companion diagnostics step 5, biomarker
  validation step 2) and `clinical.ts` step 7, which stays true as written.
- **Other biomarker and companion-diagnostic code, not touched:**
  - `server/services/regulatory/cdx-pairing.ts` (behind `server/routes/ivd-lifecycle.ts`), which pairs a proposed
    biomarker with the IVD knowledge base's `scientific/biomarker-validity.ts` entries and does not import the
    engine;
  - `server/services/global-ri/companion-diagnostics.ts` (`global_ri_companion_diagnostic`), the EU and regional
    companion-diagnostic classification;
  - `server/routes/mdx-cdx.ts`;
  - `server/services/ana/intelligence-questions/flows/protocol-development-biomarker-selection.ts`, which imports
    only the `EnrichmentDesignOption` type (unchanged);
  - the IVD lifecycle's analytical and clinical performance records, which are S5b's later commit and the separate
    `study_id` item.
- **Readers of the changed result fields:** none outside the engine. The manifest's renderers are generic.
- **Searches run:** `git grep` for:
  - the six tool and function names, `BIOMARKER_TOOLS`, `biomarkerTools` and `biomarker-knowledge`;
  - `not_stated`, `unstated`, `anyOf` and `allOf` in the engine (none before this change);
  - "BEST categor", "enrichment strateg", "companion diagnostic", "codevelopment", "bridging stud", "analytical
    validation", "clinical validation" and "biomarker qualif" across server, shared and client;
  - the result fields `recommendedDesign`, `recommendedPathway`, `cdxVsComplementary`, `ctaBridgingRequired` and
    `validityEstablished`.
- **History:** `git log` on the engine and the tools file shows `182fed957`, `5aa47407d` and `dd60c6e12`.
  `git log --all --diff-filter=D --name-only`, filtered for
  `biomarker|enrichment|cdx|companion|analytical-valid|clinical-valid|qualification`, finds only unrelated
  `.claude/skills/gstack/` files. The clone is shallow, so this covers local history only.

## The change

- **Booleans.** Each of the 25 optional booleans the six functions read reports `true`, `false` or `not_stated`
  through `inputStates`, and is never scored, graded or classified as either. A malformed value (`'true'`, `0`) is
  refused by field.
- **Required inputs** are refused by name when missing or malformed: each function's names, categories and assay
  modality, the four counts, the prevalence, and `inputs`. `assess_biomarker_analytical_validation` now requires
  `quantitative`, which decides which parameters apply.
- **Enums and numbers** are refused by field when malformed: an asserted category, intended use, COU impact, risk
  class, phase or stakes outside its vocabulary; a CV, limit, LoD, level or agreement percentage out of range; a
  count that is not a non-negative whole number; a prevalence outside [0, 1] (above 0 for enrichment); a screening
  pool that is not a whole number of at least 1.
- **Classification.** An inferred category is given only when every answer to the unstated features gives the same
  one. Otherwise `category` is null, `candidateCategories` lists the possibilities, and `inferenceBasis` names only
  the features whose answer could change it. With all six features stated false the category is prognostic (the
  one BEST category they do not test), and an intended use whose categories were all stated false is flagged. An
  asserted predictive or prognostic category with no stated interaction says so.
- **Qualification.** The pathway is `not_assessed` while an answer to an unstated scope fact could change it, and the
  rationale names those facts. An omitted COU impact is still inferred from the category, and a finding now says so
  for every tier. An omitted `isGenomic` adds a finding.
- **CDx co-development.** An omitted `essentialForUse` leaves `isCompanionDiagnostic` and
  `contemporaneousApprovalRequired` null and companion versus complementary `not_assessed`. With no class stated
  either, the pathway is `not_assessed`; with `essentialForUse` stated, the class is still assumed (III or II) and a
  finding says so. `ctaBridgingRequired` is true when both CTA facts are true, false when either is false, else null.
  With `usedClinicalTrialAssay` unstated, the Phase 3 finding on a market IVD that differs from the CTA says the
  bridging study is mandatory if the CTA enrolled the pivotal trial, not that it is now mandatory.
- **Analytical validation.** With no limit stated, precision is decided only when the 10% and 15% defaults agree, or
  the stated stakes pick one; the detail says which. A CV between them leaves precision not evaluated and readiness
  `not_assessed`, unless another parameter fails. An omitted evidence fact is named in its parameter's detail and in its
  outstanding requirement ("interferenceTested not stated. Interference / cross-reactivity study (CLSI EP07)."), and
  an omitted multi-site fact for a high-stakes use is reported as not stated in the finding and the requirement.
- **Clinical validation.** `validityEstablished` is false when accuracy is inadequate or either fact is stated false,
  true when both are true, and otherwise null. An omitted independence or utility fact is reported as not stated.
  With the cutoff unstated and the rest stated true, validity is still not established, and is now null rather than
  false: a stated true cutoff would establish it.
- **Enrichment.** A predictive marker's design is given only when every answer to the unstated design facts gives the
  same one, otherwise `not_assessed`; when every answer gives it, its rationale names the design facts that were not
  stated. For a biomarker-positive-only design, an omitted validated-assay fact is reported as not stated.
- **Size.** The engine would have reached 115,874 bytes. The BEST category table, the intended-use mapping, the CLSI
  parameter table and the citation library move, unchanged, to the sibling
  `server/services/biomarkers/biomarker-reference.ts` (Rule 6 split). The engine is 96,703 bytes; the sibling
  21,708. The moved values were compared with the engine's before the move and are deep-equal.
- **The definitions** say what an omission leaves, fit within the gateway's 1,024 characters (971 to 1,022), and keep
  their manifest renderers. Inputs the engine never reads say so: `diseaseContext`, `framework` and
  `limitOfQuantitation`.
- **The diagnostics skill** no longer says the classification and the CDx pathway are always returned: companion
  diagnostics steps 1 and 5, and biomarker validation step 2.
- **The S3 pins** that read the old answers are updated in place: `validityEstablished` with the cutoff unstated is
  null, not false, and the prevalence refusal is matched as "intendedUsePrevalence must be in [0, 1]". The first pin
  is the founder's (`dd60c6e12`, S3 review row [1], "Validity requires `cutoffPrespecified === true`"). That row
  decided that an unstated cutoff does not establish validity, and null keeps it; the pin's own title, "does not
  establish validity or presume a cutoff when prespecification is unstated", still holds. It did not decide false
  over null, which S5's rule decides. The same review's row [2], on how an unstated cybersecurity artifact is graded,
  is a decision about an unstated input itself, and the digital-health slice keeps it (`../s5b-digital-health/`).
- **The design** records this family's "What already exists" and its result, and its status rows move on.

**Stated inputs whose result changes.** Fully stated, well-formed inputs were compared with the engine before this
change, ignoring the new `inputStates` and `candidateCategories`:
- `classify_biomarker`: 5,120 inputs (all six features stated, each intended use or none, each asserted category or
  none). 10 change, exactly those with all six features stated false and no asserted category:
  - 8 move to prognostic from the intended use's first category, whose defining feature was stated false:
    patient_selection and enrichment (predictive), dose_selection and efficacy_endpoint (pharmacodynamic/response),
    safety_monitoring (safety), screening and disease_detection (diagnostic), risk_assessment
    (susceptibility/risk). Six of them gain the "Reconcile the intended use" warning; enrichment and
    risk_assessment list prognostic among their categories and do not.
  - 2, stratification and no intended use, stay prognostic; only the basis changes, from "defaulted to prognostic"
    to "Every distinguishing feature was stated false".
- `plan_biomarker_qualification`: all 336 (every boolean, category and COU tier) are unchanged.
- `design_cdx_codevelopment`: all 1,440 (every boolean, class, phase and modality) are unchanged.
- `assess_biomarker_analytical_validation`: all 4,608 (every boolean, both assay types, each stakes level, and a grid
  of CVs, limits, LoDs and agreements) are unchanged.
- `assess_biomarker_clinical_validation`: all 128 (every boolean, four tables, three prevalences or none) are
  unchanged.
- `plan_enrichment_strategy`: all 448 (every boolean, category and four prevalences) are unchanged. With
  `screeningPoolSize` also stated (0, 1, 500 or 2,000; 2,688 inputs), the 672 with a pool of 0 are refused and the
  rest are unchanged.
- Refused now, though the schema admitted them: `biomarkerPositivePrevalence: 0`, which reported 0 screens per
  enrolled positive beside "(~∞)", `maxAcceptableCVPercent: 0`, under which any CV above 0 failed, and
  `screeningPoolSize: 0`, which was echoed as `estimatedScreensNeeded: 0`. Each is a value the computation cannot
  use. A blank name (`biomarkerName: '  '`) is asked for, as a missing one is.

**Results that change because an input was omitted or malformed** (the old result was a default or a misreading), for
example:
- `classifyBiomarker({ biomarkerName: 'X' })`: "prognostic", defaulted, becomes `category: null` with seven
  candidates.
- `designCDxCodevelopment({ therapeuticName: 'T', biomarkerName: 'B', assayModality: 'ihc' })`: companion, PMA,
  contemporaneous approval, no bridging, becomes `not_assessed`, `not_assessed`, null, null.
- `planEnrichmentStrategy({ biomarkerName: 'EGFR', category: 'predictive', biomarkerPositivePrevalence: 0.3 })`:
  "stratified" becomes `not_assessed`, naming the three design facts.
- With `couImpact` omitted, 80 of the 112 inputs (the moderate and low tiers) gain the inferred-tier finding; with
  `deviceRiskClass` omitted and `essentialForUse` stated, each gains the assumed-class finding; with
  `maxAcceptableCVPercent` omitted, the precision detail names the default it used.
- `biomarkerPositivePrevalence: 1.5`, which was clamped to 1, is refused, as are `'0.3'`,
  `intendedUsePrevalence: '0.1'` and `truePositives: '45'` (now by field).
- A call to `assess_biomarker_analytical_validation` without `inputs` or `quantitative` is asked for them instead of
  crashing or assuming a quantitative assay.

**Residuals, recorded rather than changed:**
- **Disclosed defaults kept.** An omitted COU impact is inferred from the category, an omitted risk class from the
  companion status, and an omitted CV limit from the stakes (10% or 15%); each is now said in the result.
- **A rationale stated inputs can contradict.** With `singleDrugOnly`, `crossProgramUse` and `consortiumSponsored`
  all stated false, the pathway is still a drug-specific submission whose rationale reads "Use confined to a single
  drug program".
- **A cross-labeling note for every determination.** `crossLabelingNote` describes a companion diagnostic's
  cross-labeling (the label restricted to the biomarker-defined subset) whether the test is companion,
  complementary or not assessed, as before.
- **Readiness is never "ready".** A quantitative assay's accuracy and a qualitative assay's precision have no input,
  so each is always not evaluated, before and after this change.
- **Not read, and not validated:** `diseaseContext`, `framework` (the plan follows the FDA pathway whatever is
  stated) and `limitOfQuantitation`.
- **An echo named as an estimate.** `estimatedScreensNeeded` is the stated `screeningPoolSize`, not computed from an
  enrollment target (there is no such input).
- **Small adapters.** Each of the two S5b engines keeps a two-line adapter from a vocabulary to
  `RequiredInputCheck` (`oneOfInput`); RWE writes the same check inline. A shared one would belong beside
  `refuseUnlessStated`, outside these files.
- **A cross-check left to a stated true.** For a category other than predictive, a stated
  `effectConcentratedInPositives: true` adds "implies a PREDICTIVE marker"; an unstated one adds nothing beyond its
  `inputStates` entry.
- **A Phase 3 finding stated inputs contradict.** With `usedClinicalTrialAssay: false`, `marketAssayDiffersFromCTA:
  true` and `therapeuticPhase: 'phase3'`, the warning still says a robust bridging study is now mandatory, beside
  `ctaBridgingRequired: false` and "No CTA-to-IVD bridging study indicated", as before this change.
- **Unused data.** `ANALYTICAL_PARAM_TABLE` is read by none of the engine's functions, before or after the move.
- **Size.** The engine is 96,703 bytes, 3,297 under the ceiling, and over the 1,500-line threshold; the remaining
  `COU_IMPACT_TABLE` and `QUALIFICATION_STAGE_TABLE` can follow the others into `biomarker-reference.ts` if a later
  change needs room.

**User-visible:** AnA's biomarker answers no longer classify a marker, choose a qualification pathway or trial design,
call a test a companion diagnostic, require or rule out a bridging study, pass a CV, or declare validity unproven
from facts it was not given. Each names what was not stated and asks for it. A malformed value is asked for again,
not read as another or crashed on.

## Proof

Run in this session on the working tree, apart from the red, which ran on a private `git archive` copy of trunk.
- `red/before.txt`: `biomarkers-unstated-inputs.test.ts` fails 81 of 91 cases on trunk `04fd70b23`, all
  on assertions. The 10 controls pass: the six stated-basis pins, "decides a category the stated features
  settle", "keeps a pathway the stated facts settle", "keeps a stated false, and inadequate accuracy no answer could
  repair" and "keeps a design every answer gives".
- `green/after.txt`: 104 of 104 pass: the 91, with the S3 clinical-validation suite (13).
- **The neighbourhood: 52 files, 2,914 tests, 2,913 pass.** It covers:
  - every S5 unstated-input suite, and the S6 record-document and nonclinical-draft suites;
  - the S3 clinical-validation, cybersecurity and device suites;
  - `ivd-lifecycle-tools`, `ivd-tools-report-an-engine-fault-as-an-error`, `submission-center-tools` and
    `deepening-tools` (the design's S5b pins);
  - `cdx-pairing`, `cdx-study-design`, `samd-classification` and both `cybersecurity-524b` suites;
  - the five skills suites, the six tool-selection suites, the tool registry, the three tool-authorization suites,
    both launch-scope suites and `flow-registry-consistency`.

  The one failure is `deepening-tools.test.ts`, "the OPEN program outranks a project id the model supplied". It
  fails identically on trunk without this change, and is not this slice's.
- **Gates:**
  - typecheck (`typecheck-no-regression --incremental`): 0 errors;
  - ESLint ratchet: net one warning fewer (`biomarkerTools.ts` 1 to 0);
  - `manifest:ana`: regenerated in the same commit, and only the six biomarker tools change: their descriptions and
    `quantitative`, which becomes a required input of `assess_biomarker_analytical_validation`. No renderer, scope or
    governed flag changes. The six descriptions are 971 to 1,022 characters.

## Not in this slice: reading a recorded IVD study (decided 2026-11-08)

The design's S5b note asked `assess_biomarker_clinical_validation` and `assess_biomarker_analytical_validation` to read
`ivd_clinical_performance` / `ivd_analytical_performance` through an optional `study_id`. The coordinating session
decided (2026-11-08): both tools keep computing from stated inputs only, made honest by this slice.

**What already exists (RULE 3).**
- **The records:** `migrations/20260508_ivd_diagnostic_surfaces.sql` creates `ivd_analytical_performance` and
  `ivd_clinical_performance`. Both are organization- and program-scoped, and each carries a free-text `study_id`, the
  sponsor's own id, which is neither unique nor a key.
- **Their writers:**
  - the AnA tools `record_analytical_performance_study` and `record_clinical_performance_study`
    (`AnaToolExecutor.ts`; register entries "INSERT ivd_*");
  - the routes in `server/routes/mdx-ivd-performance.ts`: GET, POST and PATCH on `/ivd/analytical` and
    `/ivd/clinical`, GET `/ivd/performance-summary/:programId` and GET `/ivd/:programId`, mounted in
    `server/bootstrap/register-inline-routes.ts`.
- **Their readers:** `server/routes/ivd-completeness-routes.ts` (per-study pass/fail and endpoint-met),
  `mdx-health.service.ts` and `regulatory-graph/standards-applicability.service.ts`.
- **Gaps:**
  - No AnA tool reads the records, and `tool-record-scope.ts` `RECORD_SCOPES` has no IVD entry.
  - Nothing in the client calls `/ivd/analytical`, `/ivd/clinical` or `/ivd/performance-summary`. That is an R1 reach
    item for the device lane, which the coordinating session has added to the R1 batches.

**Why the reach is not built.**
- **Clinical.** `assessBiomarkerClinicalValidation` computes from a 2×2 table (true and false positives and
  negatives). The record stores `sensitivity_pct`, `specificity_pct` with their confidence bounds, PPV/NPV,
  `positive_n`, `negative_n` and `auc_roc`, but not the four counts. Rebuilding them, for example as
  `sensitivity_pct × positive_n`, rounds a stored two-decimal percentage into an engine input: a figure made from a
  summary, which Rule 2 forbids.
- **Analytical.** `assessBiomarkerAnalyticalValidation` reads measured parameters. The record holds the study type,
  the acceptance criterion, a result summary in text and pass/fail, but not the measured values.
- **The key.** A free-text `study_id` can name several rows.

**Options kept for later, each a decision rather than a session's call.**
- **(b) Parked:** the tools take a record id and relay the sponsor's stated summary, labelled as such, computing
  nothing from it. It comes back only if the device lane asks for the records in AnA.
- **(a) A founder item, not raised now:** store the counts and measured parameters on the records, which is a schema
  change.

## Review before landing (2026-11-09)

An adversarial review of this commit's first draft, which was not pushed, applied the plan to a scratch copy of
`9a1ac9bca` (the files it changes were byte-identical to the draft), ran it through the real executor, and checked
every result field against every completion of the unstated booleans: 239,449 inputs with a fact omitted across the
six functions, and 66,640 fully stated inputs against the engine before the change. It found three remaining defects
and one sentence that was false; this commit includes the corrections.

**What already exists (RULE 3).** Each fix completes code the draft already changed: the analytical assessment's
`unstated()` prefix, the CDx Phase 3 finding, the enrichment design's `conclusions`/`listed`, the two analytical
property notes in `biomarkerTools.ts`, the diagnostics skill and `biomarkers-unstated-inputs.test.ts`. Nothing is
added beside them.

- **An omitted evidence fact's study was outstanding, as a stated false's.** The detail said "interferenceTested not
  stated", but `outstandingRequirements` listed "Interference / cross-reactivity study (CLSI EP07)." exactly as for a
  stated false, and the same for linearity, robustness, pre-analytical control and, for a high-stakes use, multi-site
  reproducibility. Each now carries the same prefix as its detail. The readiness is unchanged: it is `gaps` at best
  for every answer.
- **A Phase 3 finding called bridging mandatory while it was not assessed.** `{ essentialForUse: true,
  therapeuticPhase: 'phase3', marketAssayDiffersFromCTA: true }` returned `ctaBridgingRequired: null` and "a robust
  bridging study is now mandatory". With `usedClinicalTrialAssay` unstated, the finding now says it is mandatory if the
  CTA enrolled the pivotal trial. A stated `usedClinicalTrialAssay` keeps the old text (see the residual above).
- **A design every answer gives took one answer's rationale.** `{ category: 'predictive', characterizeNegatives:
  false, effectConcentratedInPositives: false }` is stratified whatever `negativesExpectedToBenefit` is, and the
  rationale was that of the answer false, with nothing said. It now ends "negativesExpectedToBenefit is not stated;
  every answer gives this design."
- **A skill sentence.** Companion diagnostics step 1 said `classify_biomarker` "places it in a BEST category"; it now
  says the tool lists the candidates when a feature that could change it is not stated.

**Results that change**, against the draft: only inputs that leave an evidence fact, `usedClinicalTrialAssay` (at
Phase 3, with the assays stated to differ) or a predictive design fact unstated. The 66,640 fully stated inputs give
the same results as the draft (10 classifications and the 672 pools of 0 differ from the engine before
the slice, as above). The completeness check finds no result field, finding or list entry that some but not all
completions give.

**Proof.** The review's figures, on its scratch copy, were confirmed on the working tree by this session: the red test
fails 81 of 91 on trunk and 4 on the draft (the two analytical outstanding-requirement checks, the Phase 3 finding
and the enrichment rationale), and the green, neighbourhood and gates are those under **Proof** above. The review
also said `manifest:ana` would change the five analytical evidence inputs' notes. It does not: the manifest carries no
input notes, and the regenerated file is the draft's.

## Process note: how S5b was planned, and an incident (2026-11-08)

S5b was planned by two read-only agents, one for biomarkers and digital health, the other for medical device and the
IVD, QMS and pathway tools. Each plan was then reviewed by an independent critic. This session applied the result
to the real tree and ran its own red, green, neighbourhood and gates; those counts above are from that run. The
input enumerations (the stated-input comparisons and the completeness check) are the planner's and the review's.

Two of the planning agents' actions reached outside their scratch copies. Nothing was committed or pushed.
- **Writes into the working tree.** Both agents used one scratch mirror whose `server/` was briefly a link to the real
  tree. Between about 23:37 and 23:44 UTC, patched copies of these files reached the working tree, together with 48
  self-pointing links such as `client/client`:
  - `server/services/medical-device/medical-device-knowledge.ts` and `medical-device-knowledge-data.ts`;
  - `server/services/ana/medicalDeviceTools.ts`;
  - three medical-device engine tests;
  - an untracked `medical-device-unstated-inputs.test.ts`.

  Each was removed within minutes. Before this commit, `git status` was clean and every medical-device, IVD,
  regulatory, stats and market-specs file matched origin. This commit carries only its own files. The critics worked
  on private `git archive` copies.
- **A database connection.** One agent imported `AnaToolDefinitions.ts` through tsx, which opened a pool to the
  configured database. The process environment had no `DATABASE_URL`. The repository's `.env` names `127.0.0.1:5432`,
  database `clinicalsage`. That address is a PostgreSQL 16 server running inside this session's own container
  (data directory `/var/lib/postgresql/c2c-local`). It is local and ephemeral, not a shared or hosted database. The
  agent logged a failed `audit.tamper_proof_log` initialisation against it and issued no writes of its own.

From here on, an agent planning AnA tools runs them through vitest only (which sets a throwaway `DATABASE_URL`), or
with `DATABASE_URL` pointed at an unreachable address.
