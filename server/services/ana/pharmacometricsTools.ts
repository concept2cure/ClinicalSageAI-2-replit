/**
 * Pharmacometrics & Quantitative Pharmacology tools — exposes knowledge-base
 * engines for PopPK study design, PBPK model evaluation, exposure-response
 * analysis, MIDD strategy, and dose selection to AnA as first-class tools.
 *
 * Each tool returns a structured advisory plan grounded in FDA/EMA/ICH guidance
 * and current pharmacometrics best practice. The outputs are deterministic for
 * identical inputs (no LLM, no network calls) and are suitable for inclusion in
 * regulatory submissions, clinical pharmacology sections, or sponsor/agency
 * meeting briefing documents.
 *
 * Tools:
 *   design_popk_study         — PopPK analysis plan (sampling, covariates, software, regulatory)
 *   evaluate_pbpk_model       — PBPK model qualification & regulatory acceptability
 *   analyze_exposure_response — E-R analysis framework for dose justification
 *   advise_midd               — MIDD strategy aligned with FDA MIDD Pilot Program
 *   select_dose               — Dose selection framework from FIH to therapeutic optimization
 *
 * @module server/services/ana/pharmacometricsTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network.';

// ─────────────────────────────────────────────────────────────────────────────
// Tool 1 — PopPK Study Design
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_POPK_STUDY: AnaTool = {
  name: 'design_popk_study',
  description:
    'Designs a comprehensive population pharmacokinetic (PopPK) analysis plan tailored to the drug modality, route, elimination pathway, and target population. Returns a complete study design including optimal PK sampling strategy (rich, sparse, or D-optimal), covariate analysis plan with a priori and data-driven covariate selection, structural and stochastic model evaluation criteria (OFV, GOF, VPCs, bootstrap), recommended software (NONMEM, Monolix, nlmixr2) with run settings, and regulatory-specific requirements for NDA/BLA/MAA clinical pharmacology sections per FDA Guidance on PopPK (2022) and EMA Guideline on Reporting of PopPK Analyses. Use this tool when designing a PopPK analysis to support dose justification, labeling recommendations, or intrinsic/extrinsic factor assessment in regulatory submissions. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      drugClass: {
        type: 'string',
        enum: [
          'small_molecule',
          'monoclonal_antibody',
          'adc',
          'peptide',
          'oligonucleotide',
          'bispecific_antibody',
          'fusion_protein',
          'gene_therapy',
        ],
        description: 'Drug modality class.',
      },
      route: {
        type: 'string',
        enum: ['iv', 'oral', 'sc', 'im', 'topical', 'inhaled', 'intrathecal', 'intravitreal'],
        description: 'Route of administration.',
      },
      eliminationPathway: {
        type: 'string',
        enum: ['renal', 'hepatic', 'mixed', 'target_mediated', 'proteolytic'],
        description: 'Primary elimination pathway.',
      },
      targetPopulation: {
        type: 'string',
        enum: [
          'adult_healthy',
          'adult_patient',
          'pediatric',
          'geriatric',
          'renal_impairment',
          'hepatic_impairment',
          'oncology',
          'rare_disease',
        ],
        description: 'Target study population.',
      },
      studyPhase: {
        type: 'string',
        enum: ['phase1', 'phase2', 'phase3', 'phase1_3_integrated'],
        description: 'Development phase for the PopPK analysis.',
      },
      samplingApproach: {
        type: 'string',
        enum: ['rich', 'sparse', 'optimal_design'],
        description: 'PK sampling strategy.',
      },
      covariatesOfInterest: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Specific covariates to evaluate (e.g. weight, age, eGFR, genotype, ADA status).',
      },
    },
    required: ['drugClass', 'route', 'eliminationPathway', 'targetPopulation', 'studyPhase'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Tool 2 — PBPK Model Evaluation
// ─────────────────────────────────────────────────────────────────────────────

export const EVALUATE_PBPK_MODEL: AnaTool = {
  name: 'evaluate_pbpk_model',
  description:
    'Evaluates the qualification status and regulatory acceptability of a physiologically based pharmacokinetic (PBPK) model for a specified application. Assesses model credibility per FDA Guidance on PBPK Analysis (2018/2020) and EMA Guideline on Qualification and Reporting of PBPK Modelling, including system-dependent vs drug-dependent parameter verification, model performance criteria (observed-to-predicted ratios within 2-fold for AUC and Cmax), and application-specific validation requirements for DDI prediction (perpetrator/victim scenarios), pediatric extrapolation (ontogeny of CYP/UGT enzymes), organ impairment (hepatic/renal adjustments to intrinsic clearance), and food effect (GI physiology modifications). Provides platform comparison across Simcyp, GastroPlus, and PK-Sim with required documentation checklists for regulatory submission. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      application: {
        type: 'string',
        enum: [
          'ddi_prediction',
          'pediatric_extrapolation',
          'organ_impairment',
          'food_effect',
          'formulation_bridging',
          'dose_selection',
          'labeling_recommendation',
        ],
        description: 'Intended PBPK application.',
      },
      drugProperties: {
        type: 'object',
        properties: {
          bcsClass: {
            type: 'string',
            enum: ['I', 'II', 'III', 'IV'],
          },
          clearanceMechanism: { type: 'string' },
          cyp_enzymes: {
            type: 'array',
            items: { type: 'string' },
          },
          transporters: {
            type: 'array',
            items: { type: 'string' },
          },
          proteinBinding: {
            type: 'string',
            enum: ['low', 'moderate', 'high'],
          },
        },
        description: 'Drug physicochemical and ADME properties.',
      },
      platform: {
        type: 'string',
        enum: ['simcyp', 'gastroplus', 'pk_sim', 'other'],
        description: 'PBPK modeling platform.',
      },
      regulatoryContext: {
        type: 'string',
        enum: ['fda_nda', 'fda_anda', 'ema_maa', 'pediatric_plan', 'ddi_guidance'],
        description: 'Regulatory filing context.',
      },
    },
    required: ['application', 'drugProperties'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Tool 3 — Exposure-Response Analysis
// ─────────────────────────────────────────────────────────────────────────────

export const ANALYZE_EXPOSURE_RESPONSE: AnaTool = {
  name: 'analyze_exposure_response',
  description:
    'Generates a comprehensive exposure-response (E-R) analysis framework for dose justification and benefit-risk assessment. Covers both graphical exploration (spaghetti plots, loess/spline fits, forest plots by exposure quartile, Kaplan-Meier by exposure category) and model-based approaches (logistic regression, Emax/sigmoidal-Emax, Cox proportional hazards, MBMA) with model selection criteria (AIC/BIC, GOF, prediction-corrected VPC). Addresses regulatory expectations per FDA Guidance on Exposure-Response Relationships (2003) and ICH E4 for dose-response information, including efficacy E-R for therapeutic window characterization, safety E-R for concentration-QTc and hepatotoxicity risk, and immunogenicity E-R for ADA impact on PK and efficacy in biologics. Returns the recommended analysis strategy, statistical methodology, key covariates for subgroup E-R, and presentation format for the clinical pharmacology section of regulatory submissions. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      analysisType: {
        type: 'string',
        enum: ['efficacy', 'safety', 'immunogenicity', 'dose_selection', 'benefit_risk'],
        description: 'Type of E-R analysis.',
      },
      endpointType: {
        type: 'string',
        enum: ['continuous', 'binary', 'time_to_event', 'count', 'categorical_ordered'],
        description: 'Primary endpoint data type.',
      },
      exposureMetric: {
        type: 'string',
        enum: ['auc', 'cmax', 'ctrough', 'cavg', 'cumulative_auc', 'time_above_target'],
        description: 'Exposure metric for analysis.',
      },
      studyDesign: {
        type: 'string',
        enum: ['parallel', 'crossover', 'dose_escalation', 'adaptive', 'platform_trial'],
        description: 'Clinical study design.',
      },
      specialConsiderations: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Special E-R considerations (e.g. flat_er, steep_er, ceiling_effect, time_varying, delayed_response, hysteresis).',
      },
    },
    required: ['analysisType', 'endpointType'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Tool 4 — MIDD Strategy Advisory
// ─────────────────────────────────────────────────────────────────────────────

export const ADVISE_MIDD: AnaTool = {
  name: 'advise_midd',
  description:
    'Provides a model-informed drug development (MIDD) strategy aligned with the FDA MIDD Pilot Program and ICH M15 initiative, identifying which clinical studies can be supported, optimized, or waived through quantitative pharmacology modeling and simulation. Recommends specific M&S approaches — PopPK, PBPK, exposure-response, QSP, disease progression modeling, clinical trial simulation — matched to the development question and available data maturity. Covers precedent-based guidance from successful MIDD submissions (e.g., pembrolizumab pediatric extrapolation, rivaroxaban renal impairment PBPK waiver, baricitinib dose selection via E-R), regulatory interaction strategy (pre-IND, EOP2, pre-NDA meeting requests with M&S content), and documentation requirements for the Modeling & Simulation section of NDA/BLA Module 2.7.2. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      developmentQuestion: {
        type: 'string',
        enum: [
          'dose_selection',
          'study_design',
          'clinical_trial_waiver',
          'labeling',
          'pediatric_extrapolation',
          'organ_impairment_waiver',
          'food_effect_waiver',
          'ddi_labeling',
          'biosimilar_assessment',
          'formulation_bridging',
        ],
        description: 'The drug development question to address with MIDD.',
      },
      developmentPhase: {
        type: 'string',
        enum: ['preclinical', 'phase1', 'phase2', 'phase3', 'nda_bla', 'post_marketing'],
        description: 'Current development phase.',
      },
      availableData: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Available data and models (e.g. in_vitro, preclinical_pk, phase1_pk, popPK_model, pbpk_model, er_analysis).',
      },
      drugClass: {
        type: 'string',
        description: 'Drug modality class for context-specific advice.',
      },
    },
    required: ['developmentQuestion', 'developmentPhase'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Tool 5 — Dose Selection Framework
// ─────────────────────────────────────────────────────────────────────────────

export const SELECT_DOSE: AnaTool = {
  name: 'select_dose',
  description:
    'Generates a dose selection framework spanning first-in-human (FIH) starting dose through therapeutic dose optimization and special population adjustments. For FIH, applies NOAEL-based (FDA Guidance for Industry: Estimating the Maximum Safe Starting Dose, 2005), MABEL-based (EMA CHMP/SWP/28367, applicable for high-risk biologics and immunomodulators), and pharmacologically active dose (PAD)-based approaches with allometric scaling, human equivalent dose (HED) calculation, and safety margin assessment. For therapeutic dose selection, integrates PK/PD modeling, exposure-response relationships, and benefit-risk evaluation per ICH E4 dose-response guidance. Provides special population dose adjustment recommendations using organ impairment classification (Child-Pugh, eGFR-based renal categories), body-weight-based or BSA-based dosing rationale for pediatric populations, and physiological considerations for geriatric and obese patients, all consistent with FDA and ICH S6(R1)/S9 safety guidance. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      context: {
        type: 'string',
        enum: ['first_in_human', 'therapeutic_dose', 'dose_optimization', 'special_population'],
        description: 'Dose selection context.',
      },
      drugClass: {
        type: 'string',
        enum: [
          'small_molecule',
          'monoclonal_antibody',
          'adc',
          'peptide',
          'oligonucleotide',
          'bispecific_antibody',
          'cell_therapy',
          'gene_therapy',
        ],
        description: 'Drug modality.',
      },
      route: {
        type: 'string',
        enum: ['iv', 'oral', 'sc', 'im', 'topical', 'inhaled'],
        description: 'Route of administration.',
      },
      indication: {
        type: 'string',
        description: 'Therapeutic indication (e.g. oncology, autoimmune, infectious_disease).',
      },
      preclinicalData: {
        type: 'object',
        properties: {
          noael: { type: 'number', description: 'NOAEL in mg/kg.' },
          noael_species: {
            type: 'string',
            description: 'Species for NOAEL (e.g. rat, dog, cynomolgus).',
          },
          mabel: { type: 'number', description: 'MABEL in mg/kg.' },
          pad: { type: 'number', description: 'Pharmacologically active dose in mg/kg.' },
          ld50: { type: 'number', description: 'LD50 in mg/kg.' },
          therapeutic_index: { type: 'number', description: 'Therapeutic index (LD50/ED50).' },
        },
        description: 'Preclinical PK/tox data.',
      },
      clinicalData: {
        type: 'object',
        properties: {
          mtd: { type: 'number', description: 'Maximum tolerated dose from Phase 1.' },
          ed50: { type: 'number', description: 'Estimated ED50.' },
          ed90: { type: 'number', description: 'Estimated ED90.' },
          therapeutic_window: {
            type: 'array',
            items: { type: 'number' },
            description: '[lower_bound, upper_bound] of therapeutic exposure range.',
          },
        },
        description: 'Available clinical dose-response data.',
      },
      specialPopulation: {
        type: 'string',
        enum: [
          'renal_mild',
          'renal_moderate',
          'renal_severe',
          'renal_esrd',
          'hepatic_mild',
          'hepatic_moderate',
          'hepatic_severe',
          'pediatric_neonate',
          'pediatric_infant',
          'pediatric_child',
          'pediatric_adolescent',
          'geriatric',
          'obese',
        ],
        description: 'Special population for dose adjustment.',
      },
    },
    required: ['context', 'drugClass', 'route'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Aggregated export — spread into ALL_ANA_TOOLS by the tool registry
// ─────────────────────────────────────────────────────────────────────────────

export const PHARMACOMETRICS_TOOLS: AnaTool[] = [
  DESIGN_POPK_STUDY,
  EVALUATE_PBPK_MODEL,
  ANALYZE_EXPOSURE_RESPONSE,
  ADVISE_MIDD,
  SELECT_DOSE,
];
