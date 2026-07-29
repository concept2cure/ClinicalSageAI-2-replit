/**
 * Biomarkers & Companion Diagnostics tools — exposes the deterministic knowledge
 * engines in `server/services/biomarkers/biomarker-knowledge` to AnA as
 * first-class, selectable tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
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
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned numbers and regulatory citations verbatim. Do NOT recompute, ' +
  'round differently, or substitute your own regulatory interpretation — a fabricated ' +
  'or misattributed regulatory citation in a generic drug submission is a critical defect.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. classify_biomarker
// ─────────────────────────────────────────────────────────────────────────────

export const CLASSIFY_BIOMARKER: AnaTool = {
  name: 'classify_biomarker',
  description:
    'Classify a biomarker according to the FDA-NIH BEST Resource into one of the seven ' +
    'categories (diagnostic, prognostic, predictive, pharmacodynamic/response, monitoring, ' +
    'safety, susceptibility/risk) and return the regulatory/evidentiary implications of that ' +
    'category. Classification follows a fixed precedence over the supplied distinguishing ' +
    'features (predicts differential treatment effect, confirms disease, changes with exposure, ' +
    'indicates toxicity, measured in unaffected individuals, measured serially) or an asserted ' +
    'category. Returns the category, BEST definition, the clinical question it answers, examples, ' +
    'evidentiary implications, typical regulatory pathway, supported uses, whether companion-' +
    'diagnostic-level rigor is likely, cross-check cautions (e.g. predictive vs prognostic ' +
    'mislabeling), and citations (FDA-NIH BEST Resource 2016, FDA CDx Guidance 2014, 21st Century ' +
    'Cures Act §3011). Use when the user needs to determine a biomarker’s BEST category or the ' +
    'evidentiary burden a given use implies. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      biomarkerName: {
        type: 'string',
        description: 'Name of the biomarker (e.g., "EGFR L858R", "HbA1c", "KIM-1", "BRCA1 germline").',
      },
      assertedCategory: {
        type: 'string',
        enum: [
          'diagnostic',
          'prognostic',
          'predictive',
          'pharmacodynamic_response',
          'monitoring',
          'safety',
          'susceptibility_risk',
        ],
        description:
          'Optionally assert the BEST category. If omitted, the engine infers it from the ' +
          'distinguishing features below. If supplied, the engine cross-checks it against those features.',
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
        description: 'Intended regulatory use of the biomarker in the development program.',
      },
      predictsDifferentialTreatmentEffect: {
        type: 'boolean',
        description:
          'Whether the marker predicts a biomarker-by-treatment interaction (differential effect between ' +
          'biomarker-positive and biomarker-negative patients). This is the defining feature of a ' +
          'PREDICTIVE biomarker.',
      },
      measuredInUnaffectedIndividuals: {
        type: 'boolean',
        description:
          'Whether the marker is measured in individuals who do NOT yet have clinically apparent disease ' +
          '(susceptibility/risk biomarker).',
      },
      changesWithExposure: {
        type: 'boolean',
        description:
          'Whether the marker changes in response to product exposure (pharmacodynamic/response biomarker).',
      },
      measuredSerially: {
        type: 'boolean',
        description: 'Whether the marker is measured serially over time (monitoring biomarker).',
      },
      indicatesToxicity: {
        type: 'boolean',
        description: 'Whether the marker indicates likelihood/presence/extent of toxicity (safety biomarker).',
      },
      confirmsDisease: {
        type: 'boolean',
        description: 'Whether the marker detects or confirms presence/subtype of disease (diagnostic biomarker).',
      },
      diseaseContext: {
        type: 'string',
        description: 'Disease / therapeutic-area context (free text, optional).',
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
    'Plan an FDA biomarker qualification under the Drug Development Tool (DDT) program. Defines the ' +
    'Context of Use (COU), scales evidentiary criteria to the COU impact tier (low/moderate/high), ' +
    'chooses between formal DDT qualification (cross-program reuse under FD&C Act §507) and a ' +
    'drug-specific submission (single program), and lays out the three-stage process: Letter of ' +
    'Intent (LOI), Qualification Plan (QP), and Full Qualification Package (FQP). Returns the COU, ' +
    'impact tier with its evidentiary expectation, recommended pathway with rationale, the three ' +
    'stages with FDA submissions and key deliverables, scaled evidentiary criteria, the clinical ' +
    'evidence level required, findings, and citations (21st Century Cures Act §3011 / FD&C Act §507, ' +
    'FDA Biomarker Qualification Evidentiary Framework 2018, ICH E16 for genomic markers). Use when ' +
    'the user needs to plan how to qualify a biomarker and what evidence FDA will expect. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      biomarkerName: {
        type: 'string',
        description: 'Name of the biomarker to be qualified.',
      },
      category: {
        type: 'string',
        enum: [
          'diagnostic',
          'prognostic',
          'predictive',
          'pharmacodynamic_response',
          'monitoring',
          'safety',
          'susceptibility_risk',
        ],
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
          '=> high; safety/monitoring => moderate; otherwise low). Supplying it locks the evidentiary scaling.',
      },
      crossProgramUse: {
        type: 'boolean',
        description:
          'Whether the biomarker is intended for use across multiple drug-development programs (favors ' +
          'formal DDT qualification).',
      },
      isGenomic: {
        type: 'boolean',
        description: 'Whether the biomarker is genomic (engages the ICH E16 submission structure).',
      },
      consortiumSponsored: {
        type: 'boolean',
        description: 'Whether a consortium is sponsoring the qualification (typical for DDT qualification).',
      },
      singleDrugOnly: {
        type: 'boolean',
        description:
          'Whether the marker is intended only for one specific drug program (favors a drug-specific ' +
          'submission over formal qualification).',
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
    'Design a contemporaneous drug + companion-diagnostic (CDx) co-development program. Determines ' +
    'whether the test is a true companion diagnostic (essential for safe/effective use) versus a ' +
    'complementary diagnostic, selects the device pathway (PMA per 21 CFR 814, 510(k) per 21 CFR 807 ' +
    'Subpart E, or De Novo), lays out parallel therapeutic/diagnostic milestones from discovery ' +
    'through contemporaneous approval, and determines whether a clinical-trial-assay (CTA) to ' +
    'market-ready IVD bridging study is required (with a bridging plan). Returns CDx vs complementary ' +
    'determination, device pathway with rationale, the parallel timeline, bridging requirement and ' +
    'plan, cross-labeling guidance, findings, and citations (FDA IVD Companion Diagnostic Devices ' +
    '2014, FDA CDx Codevelopment Principles 2016, 21 CFR 809.10/814/807). Use when the user is ' +
    'co-developing a drug and a patient-selection test and needs the device pathway, timeline ' +
    'alignment, and bridging strategy. ' + DETERMINISTIC_NOTE,
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
        enum: [
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
        ],
        description: 'Assay modality / platform class used for patient selection.',
      },
      essentialForUse: {
        type: 'boolean',
        description:
          'Whether the test is essential for safe/effective use of the therapeutic (true companion ' +
          'diagnostic). Default true; set false for a complementary diagnostic that informs but does not ' +
          'gate use.',
      },
      deviceRiskClass: {
        type: 'string',
        enum: ['I', 'II', 'III'],
        description:
          'Device risk class. If omitted, defaults to Class III for a companion diagnostic (PMA). Class III ' +
          '=> PMA; Class II => 510(k); Class I (novel, no predicate) => De Novo.',
      },
      usedClinicalTrialAssay: {
        type: 'boolean',
        description:
          'Whether a clinical trial assay (CTA) was used to enroll the pivotal trial (rather than the ' +
          'market-ready IVD).',
      },
      marketAssayDiffersFromCTA: {
        type: 'boolean',
        description:
          'Whether the market-ready IVD differs from the CTA. If true (and a CTA was used), a bridging study ' +
          'is required to link clinical outcomes to the marketed test.',
      },
      therapeuticPhase: {
        type: 'string',
        enum: ['preclinical', 'phase1', 'phase2', 'phase3', 'filed'],
        description: 'Therapeutic development phase at planning time (affects bridging-timing findings).',
      },
      framework: {
        type: 'string',
        enum: ['fda', 'eu_ivdr', 'pmda', 'health_canada'],
        description: 'Regulatory framework / jurisdiction (default fda).',
      },
    },
    required: ['therapeuticName', 'biomarkerName', 'assayModality'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. assess_biomarker_analytical_validation
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_BIOMARKER_ANALYTICAL_VALIDATION: AnaTool = {
  name: 'assess_biomarker_analytical_validation',
  description:
    'Assess the analytical validation of a biomarker assay against CLSI-grounded parameters: ' +
    'accuracy/trueness (or qualitative PPA/NPA concordance), precision (repeatability/reproducibility), ' +
    'analytical sensitivity (LoB/LoD/LoQ), analytical specificity (interference/cross-reactivity), ' +
    'reportable range/linearity, robustness/ruggedness, and pre-analytical/specimen-stability control. ' +
    'Pass/fail follows fixed rules over the supplied evidence (e.g. precision CV vs acceptance limit, ' +
    'LoD vs lowest clinically meaningful level, PPA/NPA >= prespecified threshold). For high-stakes ' +
    '(CDx) use it additionally requires multi-site reproducibility. Returns per-parameter assessments ' +
    'with CLSI references, an overall readiness rating (ready/gaps/not_ready), outstanding requirements, ' +
    'findings, and citations (CLSI EP05/EP06/EP07/EP09/EP12/EP17/EP25). Use when the user has assay ' +
    'performance data and needs to know whether the assay is analytically validated for its intended ' +
    'use. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      biomarkerName: {
        type: 'string',
        description: 'Name of the biomarker / assay analyte.',
      },
      assayModality: {
        type: 'string',
        enum: [
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
        ],
        description: 'Assay modality / platform class.',
      },
      quantitative: {
        type: 'boolean',
        description:
          'Whether the assay is quantitative (vs qualitative/binary). Default true. Qualitative assays are ' +
          'assessed via PPA/NPA concordance rather than bias/linearity.',
      },
      intendedUseStakes: {
        type: 'string',
        enum: ['low', 'moderate', 'high'],
        description:
          'Stakes of the intended use. "high" (CDx/patient selection) tightens default precision acceptance ' +
          'and requires multi-site reproducibility.',
      },
      inputs: {
        type: 'object',
        description: 'Observed/claimed analytical performance evidence.',
        properties: {
          precisionCVPercent: {
            type: 'number',
            description: 'Observed precision CV% at the medical decision level (quantitative assays).',
          },
          maxAcceptableCVPercent: {
            type: 'number',
            description:
              'Maximum acceptable CV% for the COU. If omitted, defaults to 10% for high-stakes use, else 15%.',
          },
          limitOfDetection: {
            type: 'number',
            description: 'Established limit of detection (assay units), if claimed.',
          },
          lowestClinicallyMeaningfulLevel: {
            type: 'number',
            description:
              'Lowest clinically meaningful concentration/level that the assay must reliably detect. LoD must ' +
              'be at or below this value.',
          },
          limitOfQuantitation: {
            type: 'number',
            description: 'Established limit of quantitation, if claimed.',
          },
          interferenceTested: {
            type: 'boolean',
            description: 'Whether interference / cross-reactivity testing was completed (CLSI EP07).',
          },
          reportableRangeEstablished: {
            type: 'boolean',
            description: 'Whether linearity / reportable range was established (CLSI EP06).',
          },
          robustnessDemonstrated: {
            type: 'boolean',
            description: 'Whether robustness across lots/operators/instruments was demonstrated.',
          },
          preanalyticalDocumented: {
            type: 'boolean',
            description: 'Whether pre-analytical / specimen-stability conditions are documented (CLSI EP25).',
          },
          multiSiteReproducibility: {
            type: 'boolean',
            description: 'Whether multi-site reproducibility was demonstrated (required for CDx-level assays).',
          },
          positivePercentAgreement: {
            type: 'number',
            description: 'For qualitative assays: positive percent agreement with the reference (%).',
          },
          negativePercentAgreement: {
            type: 'number',
            description: 'For qualitative assays: negative percent agreement with the reference (%).',
          },
        },
      },
    },
    required: ['biomarkerName', 'assayModality', 'inputs'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. assess_biomarker_clinical_validation
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_BIOMARKER_CLINICAL_VALIDATION: AnaTool = {
  name: 'assess_biomarker_clinical_validation',
  description:
    'Assess the clinical validation of a biomarker from a 2x2 confusion table. Computes clinical ' +
    'sensitivity and specificity, positive and negative predictive value (PPV/NPV) at the apparent ' +
    'prevalence of the table, and — when an intended-use prevalence is supplied — re-projects PPV/NPV ' +
    'to that prevalence by Bayes’ theorem (exposing the low-prevalence screening pitfall where most ' +
    'positives are false positives). Evaluates clinical-validity integrity (adequate accuracy, ' +
    'pre-specified cutoff, independent validation set) and articulates the clinical-VALIDITY vs ' +
    'clinical-UTILITY distinction. Returns all metrics, whether validity is established, cutoff and ' +
    'utility notes, findings (e.g. data-derived cutoff optimism bias), and citations (FDA-NIH BEST ' +
    'Resource, FDA Biomarker Qualification Evidentiary Framework 2018, CLSI EP12). Use when the user ' +
    'has biomarker classification-vs-outcome counts and needs clinical performance and its ' +
    'interpretation. ' + DETERMINISTIC_NOTE,
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
          'demonstrated. Distinct from clinical validity.',
      },
      cutoffPrespecified: {
        type: 'boolean',
        description:
          'Whether the cutoff was pre-specified before the validation dataset was analyzed. A data-derived ' +
          'cutoff fitted on the reporting dataset overstates accuracy (optimism bias).',
      },
      independentValidationSet: {
        type: 'boolean',
        description:
          'Whether validation used an independent dataset (not the cutoff-derivation set). Required to ' +
          'establish clinical validity without overfitting.',
      },
    },
    required: ['biomarkerName', 'truePositives', 'falseNegatives', 'trueNegatives', 'falsePositives'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. plan_enrichment_strategy
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_ENRICHMENT_STRATEGY: AnaTool = {
  name: 'plan_enrichment_strategy',
  description:
    'Plan an FDA enrichment strategy for a clinical trial. Classifies the enrichment as PROGNOSTIC ' +
    '(selecting higher-risk/higher-event-rate patients to raise power, no differential-benefit claim) ' +
    'or PREDICTIVE (selecting patients more likely to respond to the specific mechanism), based on the ' +
    'biomarker’s BEST category. Recommends a trial design — all-comers, biomarker-positive-only, ' +
    'marker-stratified, or enrichment-with-negative-cohort — from whether negatives may benefit, whether ' +
    'effect is concentrated in positives, and whether negatives must be characterized. Computes ' +
    'prevalence-driven feasibility (screens per enrolled positive) and flags low-prevalence challenges. ' +
    'Returns enrichment type with rationale, recommended design with rationale, all design options with ' +
    'tradeoffs, feasibility metrics, findings (e.g. missing validated assay for positive-only enrollment), ' +
    'and citations (FDA Enrichment Strategies Guidance 2019, FDA-NIH BEST Resource, FDA CDx Guidance 2014). ' +
    'Use when the user needs to choose an enrichment approach and trial design for a biomarker-defined ' +
    'population. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      biomarkerName: {
        type: 'string',
        description: 'Name of the enrichment biomarker.',
      },
      category: {
        type: 'string',
        enum: [
          'diagnostic',
          'prognostic',
          'predictive',
          'pharmacodynamic_response',
          'monitoring',
          'safety',
          'susceptibility_risk',
        ],
        description:
          'BEST category of the enrichment biomarker. Predictive => predictive enrichment; prognostic / ' +
          'susceptibility-risk => prognostic enrichment.',
      },
      biomarkerPositivePrevalence: {
        type: 'number',
        description:
          'Prevalence (0-1) of the biomarker-positive subgroup in the screened population. Drives ' +
          'feasibility (screens per enrolled positive).',
      },
      negativesExpectedToBenefit: {
        type: 'boolean',
        description:
          'Whether biomarker-negative patients are expected to derive any benefit. If true, favors a ' +
          'stratified all-comers design over positive-only enrollment.',
      },
      effectConcentratedInPositives: {
        type: 'boolean',
        description:
          'Whether the treatment effect is plausibly large only in biomarker-positives (favors predictive ' +
          'enrichment via positive-only enrollment).',
      },
      screeningPoolSize: {
        type: 'number',
        description: 'Total screening pool size, if known (used to estimate screens needed).',
      },
      characterizeNegatives: {
        type: 'boolean',
        description:
          'Whether the goal is also to characterize the biomarker-negative population (favors enrichment ' +
          'with a smaller negative cohort).',
      },
      validatedAssayAvailable: {
        type: 'boolean',
        description:
          'Whether a validated assay exists to operationalize enrichment at screening. Required for ' +
          'biomarker-positive-only enrollment and the eventual CDx.',
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
