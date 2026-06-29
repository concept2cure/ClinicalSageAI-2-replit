/**
 * Oncology Dose Optimization (Project Optimus) tools — exposes the deterministic
 * dose-optimization knowledge base to AnA as first-class, selectable tools.
 *
 * Each tool wraps a pure function grounded in FDA Project Optimus, the FDA draft
 * guidance "Optimizing the Dosage of Human Prescription Drugs and Biological
 * Products for the Treatment of Oncologic Diseases" (Jan 2023), FDA Project
 * FrontRunner, ICH E4 (dose-response), and ICH S9. NO LLM estimation, NO network
 * calls — results are deterministic and submission-defensible. The engines
 * encode the modern preference for dose optimization beyond the MTD: model-
 * assisted/model-based escalation, randomized multi-dose comparison, and RP2D
 * selection integrating PK/PD/safety/efficacy rather than MTD alone.
 *
 * Tools:
 *   select_dose_finding_design          — 3+3 vs CRM/BOIN/mTPI-2/Keyboard/TITE
 *   assess_project_optimus_alignment    — program gap analysis vs Optimus
 *   design_randomized_dose_comparison   — randomized ≥2-dose comparison design
 *   select_rp2d                         — RP2D integrating MTD/PK/PD/safety/efficacy
 *   design_backfill_strategy            — dose-expansion/backfill cohort plan
 *   assess_dose_exposure_response       — E-R for efficacy & safety; therapeutic window
 *
 * Handlers live in AnaToolExecutor.ts (registerToolHandler) and dynamic-import
 * the matching dose-optimization-knowledge module.
 *
 * @module server/services/ana/doseOptimizationTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned design recommendations and regulatory citations verbatim — do ' +
  'NOT recompute, re-rank designs, or substitute your own regulatory interpretation. ' +
  'If a parameter is missing or invalid, relay the validation error and ask the user for the correct value.';

const MODALITY_ENUM = [
  'cytotoxic',
  'small_molecule_targeted',
  'monoclonal_antibody',
  'antibody_drug_conjugate',
  'bispecific',
  'cell_therapy',
  'immune_checkpoint_inhibitor',
  'radioligand',
  'other',
];

const MECHANISM_CLASS_ENUM = [
  'classical_cytotoxic',
  'molecularly_targeted',
  'immunomodulatory',
  'other',
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. Select Dose-Finding Design
// ─────────────────────────────────────────────────────────────────────────────

export const SELECT_DOSE_FINDING_DESIGN: AnaTool = {
  name: 'select_dose_finding_design',
  description:
    'Select a dose-escalation design for an oncology first-in-human / dose-finding ' +
    'study. Encodes the Project Optimus-era preference for model-assisted (BOIN, ' +
    'mTPI-2, Keyboard) and model-based (CRM) designs over the rule-based 3+3, and ' +
    'routes to time-to-event variants (TITE-CRM/TITE-BOIN) when late-onset or ' +
    'cumulative toxicity is anticipated. Returns a recommended design with profile, ' +
    'design family, ranked alternatives, the applied target toxicity rate, an ' +
    'explicit statement on whether the 3+3 is discouraged for the context, ' +
    'operating-characteristic tradeoffs, and warnings. Cites the FDA dose-' +
    'optimization draft guidance (Jan 2023) and the model-assisted design ' +
    'literature. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      modality: { type: 'string', enum: MODALITY_ENUM, description: 'Drug modality.' },
      mechanismClass: { type: 'string', enum: MECHANISM_CLASS_ENUM, description: 'Mechanism class shaping the dose-toxicity relationship.' },
      numberOfDoseLevels: { type: 'number', description: 'Number of pre-specified dose levels to evaluate.' },
      targetToxicityRate: { type: 'number', description: 'Target toxicity rate (probability, 0–1). Default 0.25 if unspecified.' },
      dltWindowDays: { type: 'number', description: 'Expected DLT window in days. Long windows favor TITE designs.' },
      lateOnsetToxicityExpected: { type: 'boolean', description: 'Whether late-onset/cumulative toxicity is anticipated.' },
      realTimeStatisticianAvailable: { type: 'boolean', description: 'Whether a trial statistician can support real-time adaptation.' },
      optimalBiologicalDoseSought: { type: 'boolean', description: 'Whether the program intends to characterize an optimal biological dose (OBD).' },
      anticipatedEscalationSampleSize: { type: 'number', description: 'Anticipated maximum accrual for the dose-escalation portion.' },
    },
    required: ['modality'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Assess Project Optimus Alignment
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_PROJECT_OPTIMUS_ALIGNMENT: AnaTool = {
  name: 'assess_project_optimus_alignment',
  description:
    'Evaluate an oncology development program against FDA Project Optimus ' +
    'expectations and return alignment gaps with prioritized recommendations. ' +
    'Checks whether dose was selected by MTD/3+3 alone, whether ≥2 doses were ' +
    'studied in a randomized comparison, whether dose-/exposure-response was ' +
    'characterized for both efficacy and safety, whether PK and PD/target-' +
    'engagement data are adequate, whether longitudinal (multi-cycle) tolerability ' +
    'and patient-reported outcomes (e.g., PRO-CTCAE) were assessed, and whether ' +
    'optimization is planned before the marketing application. Accounts for the ' +
    'intended treatment setting (earlier-line/adjuvant raises the tolerability bar ' +
    'per Project FrontRunner). Cites the FDA dose-optimization draft guidance ' +
    '(Jan 2023). ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      modality: { type: 'string', enum: MODALITY_ENUM, description: 'Drug modality.' },
      developmentStage: {
        type: 'string',
        enum: ['preclinical', 'phase1', 'phase1_2', 'phase2', 'phase3', 'pre_nda_bla', 'post_marketing'],
        description: 'Stage of development.',
      },
      doseSelectedByMtdAlone: { type: 'boolean', description: 'Was dose selected solely by MTD / 3+3?' },
      randomizedDoseComparisonConducted: { type: 'boolean', description: 'Were ≥2 doses studied in a randomized fashion?' },
      dosesInRandomizedComparison: { type: 'number', description: 'Number of doses carried into the randomized comparison (if any).' },
      exposureResponseEfficacyCharacterized: { type: 'boolean', description: 'Was dose-/exposure-response for efficacy characterized?' },
      exposureResponseSafetyCharacterized: { type: 'boolean', description: 'Was dose-/exposure-response for safety characterized?' },
      pkCharacterized: { type: 'boolean', description: 'Were PK data adequate to characterize exposure?' },
      pdOrTargetEngagementCharacterized: { type: 'boolean', description: 'Were PD / target-engagement / biomarker data collected?' },
      longitudinalTolerabilityAssessed: { type: 'boolean', description: 'Was longitudinal (multi-cycle) tolerability assessed (low-grade/chronic/cumulative)?' },
      patientReportedOutcomesCollected: { type: 'boolean', description: 'Were patient-reported outcomes (e.g., PRO-CTCAE) collected?' },
      optimizationBeforeMarketingApplication: { type: 'boolean', description: 'Is dose optimization planned/completed before the marketing application?' },
      intendedSetting: {
        type: 'string',
        enum: ['advanced_refractory', 'earlier_line', 'adjuvant_or_curative'],
        description: 'Intended treatment setting (earlier-line raises the tolerability bar — FrontRunner).',
      },
    },
    required: [
      'modality',
      'developmentStage',
      'doseSelectedByMtdAlone',
      'randomizedDoseComparisonConducted',
      'exposureResponseEfficacyCharacterized',
      'exposureResponseSafetyCharacterized',
      'pkCharacterized',
      'pdOrTargetEngagementCharacterized',
      'longitudinalTolerabilityAssessed',
      'optimizationBeforeMarketingApplication',
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Design Randomized Dose Comparison
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_RANDOMIZED_DOSE_COMPARISON: AnaTool = {
  name: 'design_randomized_dose_comparison',
  description:
    'Design a randomized multi-dose comparison (≥2 doses) for oncology dose ' +
    'optimization, the centerpiece of the Project Optimus expectation. Returns the ' +
    'number of arms, recommended doses, allocation ratio, and an endpoint strategy ' +
    '(activity endpoint plus tolerability/PRO co-primary or key-secondary), with ' +
    'sample-size considerations framed for dose comparison rather than superiority ' +
    'to control, and guidance on timing relative to registration (pre-, within-, or ' +
    'post-registration). Handles the common goal of demonstrating non-inferior ' +
    'activity at a lower, better-tolerated dose. Cites the FDA dose-optimization ' +
    'draft guidance (Jan 2023). ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      candidateDoses: {
        type: 'array',
        items: { type: 'number' },
        description: 'Candidate doses to compare (label values). Must be ≥ 2 entries.',
      },
      doseUnit: { type: 'string', description: 'Unit label for the doses (e.g., "mg", "mg/kg", "mg QD").' },
      primaryActivityEndpoint: {
        type: 'string',
        enum: ['ORR', 'PFS', 'OS', 'pCR', 'DoR', 'biomarker_response', 'other'],
        description: 'Primary activity endpoint type.',
      },
      anticipatedResponseRateHighDose: { type: 'number', description: 'Anticipated response rate at the higher dose (0–1), for ORR-type endpoints.' },
      goalNonInferiorActivityLowerDose: { type: 'boolean', description: 'Whether the comparison is intended to demonstrate non-inferior activity at a lower dose.' },
      feasibleSampleSize: { type: 'number', description: 'Total feasible randomized sample size, if constrained.' },
      timing: {
        type: 'string',
        enum: ['pre_registration', 'within_registration', 'post_marketing'],
        description: 'Timing of the randomized comparison relative to registration.',
      },
      tolerabilityCoPrimary: { type: 'boolean', description: 'Whether the program also wants a tolerability/PRO primary or co-primary endpoint.' },
    },
    required: ['candidateDoses'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Select RP2D
// ─────────────────────────────────────────────────────────────────────────────

export const SELECT_RP2D: AnaTool = {
  name: 'select_rp2d',
  description:
    'Recommend a Phase 2 dose (RP2D) by integrating the MTD, PK exposure, target ' +
    'engagement/PD, longitudinal safety/tolerability, and efficacy across evaluated ' +
    'dose levels — explicitly NOT defaulting to the MTD. Returns a recommended ' +
    'RP2D, a per-dose evaluation (selected / viable / too toxic / sub-therapeutic / ' +
    'insufficient data), a selection rationale, and an explicit statement on the ' +
    'MTD-versus-RP2D relationship, plus warnings when activity plateaus below the ' +
    'MTD (favoring a lower dose). Cites the FDA dose-optimization draft guidance ' +
    '(Jan 2023) and ICH E4. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      doseUnit: { type: 'string', description: 'Dose unit label.' },
      doseLevels: {
        type: 'array',
        description: 'Evidence per dose level (≥ 1 entry).',
        items: {
          type: 'object',
          properties: {
            dose: { type: 'number', description: 'Dose value (label only).' },
            toxicityProbability: { type: 'number', description: 'Observed/estimated DLT or relevant toxicity probability at this dose (0–1).' },
            targetExposureAchieved: { type: 'boolean', description: 'Whether target steady-state exposure was achieved at/above this dose.' },
            targetEngagementSaturated: { type: 'boolean', description: 'Target engagement / PD effect saturated at/above this dose?' },
            activitySignal: { type: 'number', description: 'Observed response rate or activity signal (0–1) at this dose.' },
            longitudinalTolerabilityAcceptable: { type: 'boolean', description: 'Longitudinal tolerability acceptable at this dose (multi-cycle)?' },
          },
          required: ['dose'],
        },
      },
      mtd: { type: 'number', description: 'The MTD, if defined (label value).' },
      modality: { type: 'string', enum: MODALITY_ENUM, description: 'Drug modality.' },
      mechanismClass: { type: 'string', enum: MECHANISM_CLASS_ENUM, description: 'Mechanism class.' },
      activityPlateauObserved: { type: 'boolean', description: 'Whether efficacy/activity appears to plateau across the upper dose range.' },
    },
    required: ['doseLevels', 'modality'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. Design Backfill Strategy
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_BACKFILL_STRATEGY: AnaTool = {
  name: 'design_backfill_strategy',
  description:
    'Design a dose-expansion / backfill cohort strategy to enrich PK, PD, ' +
    'biomarker, target-engagement, preliminary-activity, and tolerability data at ' +
    'cleared lower dose levels while escalation continues. Returns a per-dose ' +
    'backfill cohort plan (recommended patients and data to collect), the total ' +
    'backfill sample size, the objectives addressed, operational considerations, ' +
    'and warnings — supporting the Project Optimus goal of characterizing the full ' +
    'dose-response rather than only the MTD. Cites the FDA dose-optimization draft ' +
    'guidance (Jan 2023). ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      clearedDoseLevels: {
        type: 'array',
        items: { type: 'number' },
        description: 'Cleared dose levels eligible for backfill (label values).',
      },
      doseUnit: { type: 'string', description: 'Dose unit label.' },
      objectives: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['pk', 'pd', 'biomarker', 'target_engagement', 'preliminary_activity', 'tolerability'],
        },
        description: 'Data objectives to enrich at lower doses.',
      },
      modality: { type: 'string', enum: MODALITY_ENUM, description: 'Modality (drives whether PD/target-engagement backfill is high value).' },
      biopsyFeasible: { type: 'boolean', description: 'Whether a tumor biopsy (paired/on-treatment) is feasible.' },
      maxBackfillPatients: { type: 'number', description: 'Maximum additional patients available for backfill.' },
      escalationOngoing: { type: 'boolean', description: 'Whether escalation is ongoing concurrently.' },
    },
    required: ['clearedDoseLevels'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Assess Dose Exposure-Response
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_DOSE_EXPOSURE_RESPONSE: AnaTool = {
  name: 'assess_dose_exposure_response',
  description:
    'Assess exposure-response (E-R) for both efficacy and safety to inform dose ' +
    'selection. Sorts E-R points by exposure and deterministically computes whether ' +
    'the efficacy relationship is effectively flat over the studied range, whether ' +
    'safety rises with exposure, and a qualitative therapeutic-window classification ' +
    '(wide / moderate / narrow / indeterminate), with the underlying metrics ' +
    '(absolute and relative response ranges, slope signs). Returns interpretation ' +
    'and dose implications — e.g., a flat efficacy curve with rising toxicity ' +
    'supports a lower dose. Cites ICH E4 and the FDA dose-optimization draft ' +
    'guidance (Jan 2023). ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      exposureMetric: {
        type: 'string',
        enum: ['AUC', 'Cmax', 'Cmin', 'Cavg', 'other'],
        description: 'Exposure metric used (label).',
      },
      efficacyExposureResponse: {
        type: 'array',
        description: 'Efficacy E-R points (engine sorts by exposure).',
        items: {
          type: 'object',
          properties: {
            exposure: { type: 'number', description: 'Exposure metric value (e.g., AUC or Cmin).' },
            response: { type: 'number', description: 'Response/probability (0–1) for the efficacy endpoint at this exposure.' },
          },
          required: ['exposure', 'response'],
        },
      },
      safetyExposureResponse: {
        type: 'array',
        description: 'Safety E-R points (response = probability of the safety event).',
        items: {
          type: 'object',
          properties: {
            exposure: { type: 'number', description: 'Exposure metric value.' },
            response: { type: 'number', description: 'Probability (0–1) of the safety event at this exposure.' },
          },
          required: ['exposure', 'response'],
        },
      },
      exposureAtProposedDose: { type: 'number', description: 'Optional: exposure at the proposed/registration dose, to locate it on the curves.' },
    },
    required: ['efficacyExposureResponse', 'safetyExposureResponse'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Exported Array
// ─────────────────────────────────────────────────────────────────────────────

/** Oncology dose-optimization (Project Optimus) tools, spread into ALL_ANA_TOOLS. */
export const DOSE_OPTIMIZATION_TOOLS: AnaTool[] = [
  SELECT_DOSE_FINDING_DESIGN,
  ASSESS_PROJECT_OPTIMUS_ALIGNMENT,
  DESIGN_RANDOMIZED_DOSE_COMPARISON,
  SELECT_RP2D,
  DESIGN_BACKFILL_STRATEGY,
  ASSESS_DOSE_EXPOSURE_RESPONSE,
];
