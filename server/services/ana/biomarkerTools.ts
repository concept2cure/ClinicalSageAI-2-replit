/**
 * Biomarkers & Companion Diagnostics tools — exposes the deterministic knowledge
 * engines in `server/services/biomarkers/biomarker-knowledge` to AnA as
 * first-class, selectable tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
 * An omitted or null boolean stays not_stated and decides nothing an answer could
 * change; a malformed value is refused by field (Rule 2 S5b, 2026-11-08).
 *
 * Tools:
 *   classify_biomarker                     — BEST 7-category classification + evidentiary implications
 *   plan_biomarker_qualification           — FDA DDT qualification: COU, evidentiary scaling, 3-stage process
 *   design_cdx_codevelopment               — drug + CDx contemporaneous co-development + CTA bridging
 *   assess_biomarker_analytical_validation — CLSI analytical validation (accuracy/precision/LoD/...)
 *   assess_biomarker_clinical_validation   — clinical sensitivity/specificity, PPV/NPV, validity vs utility
 *   plan_enrichment_strategy               — FDA prognostic vs predictive enrichment + trial design
 *
 * @module server/services/ana/biomarkerTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic, no LLM: report the returned numbers and citations verbatim; do not recompute them or substitute ' +
  'your own interpretation. If a parameter is missing or invalid, relay the validation error and ask the user ' +
  'for the correct value.';

const BEST_CATEGORY_ENUM = [
  'diagnostic',
  'prognostic',
  'predictive',
  'pharmacodynamic_response',
  'monitoring',
  'safety',
  'susceptibility_risk',
];

const ASSAY_MODALITY_ENUM = [
  'ihc',
  'pcr',
  'ngs',
  'fish',
  'elisa',
  'flow_cytometry',
  'mass_spectrometry',
  'sequencing_panel',
  'ctdna_liquid_biopsy',
  'imaging',
  'clinical_chemistry',
  'other',
];

/** What an omitted (or null) boolean means, per tool; a malformed one is refused by name. */
const UNDECIDED_CATEGORY = ' Omitted or null stays not_stated: an inferred category it could change is null (see candidateCategories).';
const NOT_STATED = ' Omitted or null stays not_stated, and the result says so.';
const NOT_READ = ' Not read: it does not change the result.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. classify_biomarker
// ─────────────────────────────────────────────────────────────────────────────

export const CLASSIFY_BIOMARKER: AnaTool = {
  name: 'classify_biomarker',
  description:
    'Classify a biomarker into one of the seven FDA-NIH BEST categories (diagnostic, prognostic, predictive, ' +
    'pharmacodynamic/response, monitoring, safety, susceptibility/risk) by a fixed precedence over six ' +
    'distinguishing features, or cross-check an asserted category. Returns the category, its BEST definition, ' +
    'clinical question, examples, evidentiary implications, usual regulatory pathway, supported uses, whether ' +
    'companion-diagnostic rigor is likely, cautions (e.g. predictive vs prognostic mislabeling) and citations ' +
    '(BEST 2016, FDA CDx Guidance 2014, 21st Century Cures Act §3011). An inferred category is null while an ' +
    'unstated feature could change it; candidateCategories then lists the possibilities. Use for a biomarker’s ' +
    'BEST category or the evidentiary burden a use implies. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      biomarkerName: {
        type: 'string',
        description: 'Name of the biomarker (e.g., "EGFR L858R", "HbA1c", "KIM-1", "BRCA1 germline").',
      },
      assertedCategory: {
        type: 'string',
        enum: BEST_CATEGORY_ENUM,
        description:
          'Optionally assert the BEST category. If omitted, the engine infers it from the six distinguishing ' +
          'features below. A supplied predictive or prognostic category is cross-checked against ' +
          'predictsDifferentialTreatmentEffect.',
      },
      intendedUse: {
        type: 'string',
        enum: [
          'patient_selection',
          'enrichment',
          'stratification',
          'dose_selection',
          'efficacy_endpoint',
          'safety_monitoring',
          'screening',
          'risk_assessment',
          'disease_detection',
        ],
        description:
          'Intended regulatory use of the biomarker in the development program. It adds cautions; it does not ' +
          'infer the category.',
      },
      predictsDifferentialTreatmentEffect: {
        type: 'boolean',
        description:
          'Whether the marker predicts a biomarker-by-treatment interaction (differential effect between ' +
          'biomarker-positive and biomarker-negative patients). This is the defining feature of a ' +
          'PREDICTIVE biomarker.' + UNDECIDED_CATEGORY,
      },
      measuredInUnaffectedIndividuals: {
        type: 'boolean',
        description:
          'Whether the marker is measured in individuals who do NOT yet have clinically apparent disease ' +
          '(susceptibility/risk biomarker).' + UNDECIDED_CATEGORY,
      },
      changesWithExposure: {
        type: 'boolean',
        description:
          'Whether the marker changes in response to product exposure (pharmacodynamic/response biomarker).' +
          UNDECIDED_CATEGORY,
      },
      measuredSerially: {
        type: 'boolean',
        description: 'Whether the marker is measured serially over time (monitoring biomarker).' + UNDECIDED_CATEGORY,
      },
      indicatesToxicity: {
        type: 'boolean',
        description:
          'Whether the marker indicates likelihood/presence/extent of toxicity (safety biomarker).' + UNDECIDED_CATEGORY,
      },
      confirmsDisease: {
        type: 'boolean',
        description:
          'Whether the marker detects or confirms presence/subtype of disease (diagnostic biomarker).' +
          UNDECIDED_CATEGORY,
      },
      diseaseContext: {
        type: 'string',
        description: 'Disease / therapeutic-area context (free text, optional).' + NOT_READ,
      },
    },
    required: ['biomarkerName'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. plan_biomarker_qualification
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_BIOMARKER_QUALIFICATION: AnaTool = {
  name: 'plan_biomarker_qualification',
  description:
    'Plan an FDA biomarker qualification under the Drug Development Tool (DDT) program: the Context of Use ' +
    '(COU), evidentiary criteria scaled to the COU impact tier (low/moderate/high), formal DDT qualification ' +
    '(cross-program reuse under FD&C Act §507) versus a drug-specific submission, and the three stages: Letter ' +
    'of Intent (LOI), Qualification Plan (QP) and Full Qualification Package (FQP). Returns the tier and its ' +
    'evidentiary expectation, the pathway and rationale, stages, criteria, clinical evidence level, findings and ' +
    'citations (21st Century Cures Act §3011, FDA Biomarker Qualification ' +
    'Evidentiary Framework 2018, ICH E16). The pathway is not_assessed while an unstated scope fact could change ' +
    'it. Use to plan a qualification and the evidence FDA will expect. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      biomarkerName: {
        type: 'string',
        description: 'Name of the biomarker to be qualified.',
      },
      category: {
        type: 'string',
        enum: BEST_CATEGORY_ENUM,
        description: 'BEST category of the biomarker (use classify_biomarker first if unknown).',
      },
      proposedContextOfUse: {
        type: 'string',
        description:
          'Plain-language statement of how and where the biomarker will be used (the COU). The COU ' +
          'defines the biomarker category and the evidentiary bar.',
      },
      couImpact: {
        type: 'string',
        enum: ['low', 'moderate', 'high'],
        description:
          'Consequence/impact tier of the COU. If omitted, inferred from category (predictive/diagnostic ' +
          '=> high; safety/monitoring => moderate; otherwise low), and a finding says so. Supplying it locks the ' +
          'evidentiary scaling.',
      },
      crossProgramUse: {
        type: 'boolean',
        description:
          'Whether the biomarker is intended for use across multiple drug-development programs (favors ' +
          'formal DDT qualification). Omitted or null stays not_stated: a pathway it could change is not_assessed.',
      },
      isGenomic: {
        type: 'boolean',
        description:
          'Whether the biomarker is genomic (engages the ICH E16 submission structure).' + NOT_STATED,
      },
      consortiumSponsored: {
        type: 'boolean',
        description:
          'Whether a consortium is sponsoring the qualification (typical for DDT qualification). Omitted or null ' +
          'stays not_stated: a pathway it could change is not_assessed.',
      },
      singleDrugOnly: {
        type: 'boolean',
        description:
          'Whether the marker is intended only for one specific drug program (favors a drug-specific ' +
          'submission over formal qualification). Omitted or null stays not_stated: a pathway it could change ' +
          'is not_assessed.',
      },
    },
    required: ['biomarkerName', 'category', 'proposedContextOfUse'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. design_cdx_codevelopment
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_CDX_CODEVELOPMENT: AnaTool = {
  name: 'design_cdx_codevelopment',
  description:
    'Design a contemporaneous drug + companion-diagnostic (CDx) co-development program. Determines whether the ' +
    'test is a companion diagnostic (essential for safe/effective use) or a complementary one, the device ' +
    'pathway (PMA per 21 CFR 814, 510(k) per 21 CFR 807 Subpart E, or De Novo), parallel therapeutic and ' +
    'diagnostic milestones through contemporaneous approval, and whether a clinical-trial-assay (CTA) to ' +
    'market-ready IVD bridging study is required. Returns these with rationale, the bridging plan, ' +
    'cross-labeling, findings and citations (FDA CDx 2014, FDA Codevelopment 2016, 21 CFR ' +
    '809.10/814/807). An unstated essentialForUse leaves companion vs complementary not_assessed (and, with no ' +
    'risk class, the pathway); bridging is null while an unstated CTA fact could change it. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      therapeuticName: {
        type: 'string',
        description: 'Name of the therapeutic product being co-developed.',
      },
      biomarkerName: {
        type: 'string',
        description: 'Name of the biomarker used for patient selection.',
      },
      assayModality: {
        type: 'string',
        enum: ASSAY_MODALITY_ENUM,
        description: 'Assay modality / platform class used for patient selection.',
      },
      essentialForUse: {
        type: 'boolean',
        description:
          'Whether the test is essential for safe/effective use of the therapeutic (true companion ' +
          'diagnostic); false for a complementary diagnostic that informs but does not gate use. Omitted or ' +
          'null stays not_stated: companion vs complementary is not_assessed.',
      },
      deviceRiskClass: {
        type: 'string',
        enum: ['I', 'II', 'III'],
        description:
          'Device risk class. Class III => PMA; Class II => 510(k); Class I (novel, no predicate) => De Novo. If ' +
          'omitted, Class III is assumed for a companion diagnostic and Class II for a complementary one, and a ' +
          'finding says so; with essentialForUse also omitted, the pathway is not_assessed.',
      },
      usedClinicalTrialAssay: {
        type: 'boolean',
        description:
          'Whether a clinical trial assay (CTA) was used to enroll the pivotal trial (rather than the ' +
          'market-ready IVD). Omitted or null stays not_stated: unless marketAssayDiffersFromCTA is false, ' +
          'ctaBridgingRequired is null.',
      },
      marketAssayDiffersFromCTA: {
        type: 'boolean',
        description:
          'Whether the market-ready IVD differs from the CTA. If true (and a CTA was used), a bridging study ' +
          'is required to link clinical outcomes to the marketed test. Omitted or null stays not_stated: unless ' +
          'usedClinicalTrialAssay is false, ctaBridgingRequired is null.',
      },
      therapeuticPhase: {
        type: 'string',
        enum: ['preclinical', 'phase1', 'phase2', 'phase3', 'filed'],
        description: 'Therapeutic development phase at planning time (affects bridging-timing findings).',
      },
      framework: {
        type: 'string',
        enum: ['fda', 'eu_ivdr', 'pmda', 'health_canada'],
        description: 'Regulatory framework / jurisdiction. Not read: the plan follows the FDA pathway.',
      },
    },
    required: ['therapeuticName', 'biomarkerName', 'assayModality'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. assess_biomarker_analytical_validation
// ─────────────────────────────────────────────────────────────────────────────

/** An omitted evidence fact is not evaluated, as a stated false is, but the detail names it as not stated. */
const EVIDENCE_NOT_STATED =
  ' Omitted or null stays not_stated: its parameter is not evaluated, and its detail and outstanding requirement say ' +
  'it was not stated.';

export const ASSESS_BIOMARKER_ANALYTICAL_VALIDATION: AnaTool = {
  name: 'assess_biomarker_analytical_validation',
  description:
    'Assess the analytical validation of a biomarker assay against CLSI-grounded parameters: accuracy/trueness ' +
    '(or qualitative PPA/NPA concordance), precision, analytical sensitivity (LoB/LoD/LoQ), analytical ' +
    'specificity (interference/cross-reactivity), reportable range/linearity, robustness and pre-analytical ' +
    'control. Pass/fail follows fixed rules over the supplied evidence (CV vs the acceptance limit, LoD vs the ' +
    'lowest clinically meaningful level, PPA and NPA >= 90%); a high-stakes (CDx) use also requires multi-site ' +
    'reproducibility. Returns per-parameter status with CLSI references, readiness (ready/gaps/not_ready, or ' +
    'not_assessed when unstated stakes decide precision), outstanding requirements, findings and citations (CLSI ' +
    'EP05/EP06/EP07/EP09/EP12/EP17/EP25). ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      biomarkerName: {
        type: 'string',
        description: 'Name of the biomarker / assay analyte.',
      },
      assayModality: {
        type: 'string',
        enum: ASSAY_MODALITY_ENUM,
        description: 'Assay modality / platform class.',
      },
      quantitative: {
        type: 'boolean',
        description:
          'Whether the assay is quantitative (vs qualitative/binary). Required: it decides which parameters ' +
          'apply. Qualitative assays are assessed via PPA/NPA concordance rather than bias/linearity.',
      },
      intendedUseStakes: {
        type: 'string',
        enum: ['low', 'moderate', 'high'],
        description:
          'Stakes of the intended use. "high" (CDx/patient selection) tightens the default precision limit to ' +
          '10% and requires multi-site reproducibility. If omitted, a CV between 10% and 15% with no stated ' +
          'limit is not evaluated.',
      },
      inputs: {
        type: 'object',
        description: 'Observed/claimed analytical performance evidence ({} if none).',
        properties: {
          precisionCVPercent: {
            type: 'number',
            description: 'Observed precision CV% at the medical decision level (quantitative assays), at least 0.',
          },
          maxAcceptableCVPercent: {
            type: 'number',
            description:
              'Maximum acceptable CV% for the COU, above 0. If omitted, the default is 10% for a high-stakes use ' +
              'and 15% for a low or moderate one (both apply while the stakes are unstated); the detail says which.',
          },
          limitOfDetection: {
            type: 'number',
            description: 'Established limit of detection (assay units), if claimed; at least 0.',
          },
          lowestClinicallyMeaningfulLevel: {
            type: 'number',
            description:
              'Lowest clinically meaningful concentration/level that the assay must reliably detect, at least 0. ' +
              'LoD must be at or below this value.',
          },
          limitOfQuantitation: {
            type: 'number',
            description: 'Established limit of quantitation, if claimed.' + NOT_READ,
          },
          interferenceTested: {
            type: 'boolean',
            description: 'Whether interference / cross-reactivity testing was completed (CLSI EP07).' + EVIDENCE_NOT_STATED,
          },
          reportableRangeEstablished: {
            type: 'boolean',
            description:
              'Whether linearity / reportable range was established (CLSI EP06); read for a quantitative assay.' +
              EVIDENCE_NOT_STATED,
          },
          robustnessDemonstrated: {
            type: 'boolean',
            description: 'Whether robustness across lots/operators/instruments was demonstrated.' + EVIDENCE_NOT_STATED,
          },
          preanalyticalDocumented: {
            type: 'boolean',
            description:
              'Whether pre-analytical / specimen-stability conditions are documented (CLSI EP25).' + EVIDENCE_NOT_STATED,
          },
          multiSiteReproducibility: {
            type: 'boolean',
            description:
              'Whether multi-site reproducibility was demonstrated (required for CDx-level assays). Omitted or ' +
              'null stays not_stated, and for a high-stakes use the finding and the outstanding requirement say it is ' +
              'not stated.',
          },
          positivePercentAgreement: {
            type: 'number',
            description: 'For qualitative assays: positive percent agreement with the reference (%), 0 to 100.',
          },
          negativePercentAgreement: {
            type: 'number',
            description: 'For qualitative assays: negative percent agreement with the reference (%), 0 to 100.',
          },
        },
      },
    },
    required: ['biomarkerName', 'assayModality', 'quantitative', 'inputs'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. assess_biomarker_clinical_validation
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_BIOMARKER_CLINICAL_VALIDATION: AnaTool = {
  name: 'assess_biomarker_clinical_validation',
  description:
    'Assess the clinical validation of a biomarker from a 2x2 confusion table: clinical sensitivity and ' +
    'specificity with exact 95% intervals, PPV and NPV at the table’s apparent prevalence and, when an ' +
    'intended-use prevalence is supplied, re-projected to it by Bayes’ theorem (the low-prevalence screening ' +
    'pitfall). Checks validity (sensitivity and specificity >= 80%, a ' +
    'pre-specified cutoff, an independent validation set) and keeps clinical validity apart from clinical ' +
    'utility. Returns the metrics, validityEstablished (null while an unstated cutoff or independence fact could ' +
    'make it true), cutoff and utility notes, findings and citations (FDA-NIH BEST Resource, FDA Biomarker ' +
    'Qualification Evidentiary Framework 2018, CLSI EP12). ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      biomarkerName: {
        type: 'string',
        description: 'Name of the biomarker under clinical validation.',
      },
      truePositives: {
        type: 'number',
        description: 'True positives: diseased / responders correctly classified positive.',
      },
      falseNegatives: {
        type: 'number',
        description: 'False negatives: diseased / responders classified negative.',
      },
      trueNegatives: {
        type: 'number',
        description: 'True negatives: non-diseased / non-responders correctly classified negative.',
      },
      falsePositives: {
        type: 'number',
        description: 'False positives: non-diseased / non-responders classified positive.',
      },
      intendedUsePrevalence: {
        type: 'number',
        description:
          'Optional disease/responder prevalence (0-1) in the intended-use population. If supplied, PPV/NPV ' +
          'are re-projected to this prevalence by Bayes; if omitted, PPV/NPV are reported at the table’s ' +
          'apparent prevalence.',
      },
      clinicalUtilityDemonstrated: {
        type: 'boolean',
        description:
          'Whether clinical utility (acting on the result improves measurable patient outcomes) is ' +
          'demonstrated. Distinct from clinical validity.' + NOT_STATED,
      },
      cutoffPrespecified: {
        type: 'boolean',
        description:
          'Whether the cutoff was pre-specified before the validation dataset was analyzed. A data-derived ' +
          'cutoff fitted on the reporting dataset overstates accuracy (optimism bias). Omitted or null stays ' +
          'not_stated: validityEstablished is null unless another fact settles it.',
      },
      independentValidationSet: {
        type: 'boolean',
        description:
          'Whether validation used an independent dataset (not the cutoff-derivation set). Required to ' +
          'establish clinical validity without overfitting. Omitted or null stays not_stated: ' +
          'validityEstablished is null unless another fact settles it.',
      },
    },
    required: ['biomarkerName', 'truePositives', 'falseNegatives', 'trueNegatives', 'falsePositives'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. plan_enrichment_strategy
// ─────────────────────────────────────────────────────────────────────────────

/** A predictive marker's design facts. */
const DESIGN_NOT_STATED =
  ' Omitted or null stays not_stated: for a predictive marker, a design it could change is not_assessed.';

export const PLAN_ENRICHMENT_STRATEGY: AnaTool = {
  name: 'plan_enrichment_strategy',
  description:
    'Plan an FDA enrichment strategy. Classifies the enrichment as PROGNOSTIC (higher-risk ' +
    'patients, raising event rates; no differential-benefit claim) or PREDICTIVE (likely responders) ' +
    'from the biomarker’s BEST category. Recommends all-comers, biomarker-positive-only, marker-stratified or ' +
    'enrichment-with-negative-cohort from whether negatives may benefit, the effect is concentrated in ' +
    'positives, or negatives must be characterized; a predictive marker’s design is not_assessed while ' +
    'an unstated fact could change it. Feasibility is screens per enrolled positive. ' +
    'Returns the type and design with rationales, design options and tradeoffs, feasibility, findings (e.g. no ' +
    'validated assay for positive-only enrollment) and citations (FDA Enrichment 2019, BEST, FDA CDx 2014). ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      biomarkerName: {
        type: 'string',
        description: 'Name of the enrichment biomarker.',
      },
      category: {
        type: 'string',
        enum: BEST_CATEGORY_ENUM,
        description:
          'BEST category of the enrichment biomarker. Predictive => predictive enrichment; prognostic / ' +
          'susceptibility-risk => prognostic enrichment.',
      },
      biomarkerPositivePrevalence: {
        type: 'number',
        description:
          'Prevalence (above 0, at most 1) of the biomarker-positive subgroup in the screened population. ' +
          'Drives feasibility (screens per enrolled positive).',
      },
      negativesExpectedToBenefit: {
        type: 'boolean',
        description:
          'Whether biomarker-negative patients are expected to derive any benefit. If true, favors a ' +
          'stratified all-comers design over positive-only enrollment.' + DESIGN_NOT_STATED,
      },
      effectConcentratedInPositives: {
        type: 'boolean',
        description:
          'Whether the treatment effect is plausibly large only in biomarker-positives (favors predictive ' +
          'enrichment via positive-only enrollment).' + DESIGN_NOT_STATED,
      },
      screeningPoolSize: {
        type: 'number',
        description:
          'Total screening pool size, if known: a whole number of at least 1, reported as estimatedScreensNeeded.',
      },
      characterizeNegatives: {
        type: 'boolean',
        description:
          'Whether the goal is also to characterize the biomarker-negative population (favors enrichment ' +
          'with a smaller negative cohort).' + DESIGN_NOT_STATED,
      },
      validatedAssayAvailable: {
        type: 'boolean',
        description:
          'Whether a validated assay exists to operationalize enrichment at screening. Required for ' +
          'biomarker-positive-only enrollment and the eventual CDx.' + NOT_STATED,
      },
    },
    required: ['biomarkerName', 'category', 'biomarkerPositivePrevalence'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Collected array — spread into ALL_ANA_TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/** Biomarker & companion-diagnostic tools, spread into ALL_ANA_TOOLS. */
export const BIOMARKER_TOOLS: AnaTool[] = [
  CLASSIFY_BIOMARKER,
  PLAN_BIOMARKER_QUALIFICATION,
  DESIGN_CDX_CODEVELOPMENT,
  ASSESS_BIOMARKER_ANALYTICAL_VALIDATION,
  ASSESS_BIOMARKER_CLINICAL_VALIDATION,
  PLAN_ENRICHMENT_STRATEGY,
];
