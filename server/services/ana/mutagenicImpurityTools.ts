/**
 * Mutagenic Impurity (ICH M7) tools — exposes the deterministic mutagenic
 * impurity knowledge base (server/services/mutagenic-impurity/mutagenic-impurity-knowledge)
 * to AnA as first-class, selectable tools.
 *
 * Each tool wraps a pure function that returns structured, citation-backed
 * output grounded in ICH M7(R2), ICH Q3A(R2), ICH Q3B(R2), FDA 2021
 * Nitrosamine Guidance, EMA 2023 Nitrosamine Guidance, and Teasdale (2019)
 * purge factor methodology. NO LLM estimation, NO network calls — the
 * results are deterministic and submission-defensible.
 *
 * Tools:
 *   classify_mutagenic_impurity   — ICH M7(R2) 5-class classification
 *   calculate_ttc                 — TTC / LTL-TTC acceptable intake calculation
 *   assess_structural_alerts      — (Q)SAR structural alert assessment per ICH M7
 *   design_purge_study            — purge factor estimation per Teasdale (2019)
 *   assess_nitrosamine_risk       — FDA/EMA nitrosamine risk assessment
 *   control_mutagenic_impurity    — control strategy design per ICH M7 Options 1-5
 *
 * Handlers live in AnaToolExecutor.ts (registerToolHandler) and dynamic-import
 * the matching `../mutagenic-impurity/mutagenic-impurity-knowledge` module.
 *
 * @module server/services/ana/mutagenicImpurityTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned data verbatim — do NOT reinterpret regulatory citations, ' +
  'invent additional guidance, or substitute your own classification/limit/control ' +
  'recommendations. If a parameter is missing or invalid, relay the validation ' +
  'error and ask the user for the correct value.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. ICH M7(R2) 5-Class Mutagenic Impurity Classification
// ─────────────────────────────────────────────────────────────────────────────

export const CLASSIFY_MUTAGENIC_IMPURITY: AnaTool = {
  name: 'classify_mutagenic_impurity',
  description:
    'Classify a mutagenic impurity per the ICH M7(R2) 5-class system. ' +
    'Returns the impurity class (1-5), class name and description, control ' +
    'approach, acceptable intake basis, a step-by-step decision tree, required ' +
    'testing to reclassify (e.g., Class 3 → Class 4 via negative Ames test), ' +
    'and Cohort of Concern assessment (aflatoxin-like, nitrosamine, alkyl-azoxy). ' +
    'Class 1: known mutagenic carcinogen (compound-specific limit). ' +
    'Class 2: known mutagen, unknown carcinogenic potential (TTC 1.5 μg/day). ' +
    'Class 3: alerting structure, no mutagenicity data (TTC applies until Ames tested). ' +
    'Class 4: alerting structure, Ames negative (non-mutagenic, ordinary impurity). ' +
    'Class 5: no alerting structure (non-mutagenic, ordinary impurity). ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      amesMutagenicity: {
        type: 'string',
        enum: ['positive', 'negative', 'not_tested'],
        description: 'Bacterial mutagenicity (Ames test) result: positive, negative, or not yet tested.',
      },
      structuralAlertsPresent: {
        type: 'string',
        enum: ['yes', 'no', 'unknown'],
        description: 'Whether structural alerts for mutagenicity are present based on (Q)SAR or known alerting structures.',
      },
      carcinogenicityData: {
        type: 'string',
        enum: ['positive', 'negative', 'not_tested'],
        description: 'Carcinogenicity bioassay data: positive (known carcinogen), negative, or not tested.',
      },
      impurityRelationship: {
        type: 'string',
        enum: ['process_related', 'degradation', 'starting_material', 'reagent', 'byproduct', 'solvent', 'catalyst'],
        description: 'Relationship of the impurity to the drug substance: process-related, degradation product, starting material, reagent, byproduct, solvent, or catalyst.',
      },
      cohortOfConcernStructure: {
        type: 'boolean',
        description: 'Whether the compound belongs to a Cohort of Concern structural class (aflatoxin-like, N-nitroso, alkyl-azoxy). Default false.',
      },
      specificStructuralAlerts: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of specific structural alerts or functional groups identified (e.g., "N-nitroso", "aromatic amine", "alkyl halide", "epoxide"). Used for Cohort of Concern evaluation.',
      },
    },
    required: ['amesMutagenicity', 'structuralAlertsPresent', 'carcinogenicityData', 'impurityRelationship'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. TTC / LTL-TTC Acceptable Intake Calculation
// ─────────────────────────────────────────────────────────────────────────────

export const CALCULATE_TTC: AnaTool = {
  name: 'calculate_ttc',
  description:
    'Calculate the Threshold of Toxicological Concern (TTC) acceptable intake ' +
    'and concentration limit for a mutagenic impurity per ICH M7(R2). Returns ' +
    'the acceptable intake (AI) in μg/day and ng/day, concentration limit in ' +
    'ppm (if MDD provided), LTL (less-than-lifetime) staged TTC adjustments ' +
    'for all treatment durations, Cohort of Concern limits (aflatoxin-like: ' +
    '0.15 μg/day; N-nitrosamines: compound-specific AI or default 18 ng/day; ' +
    'alkyl-azoxy: 1.5 μg/day), multiple impurity considerations, oncology ' +
    'indication flexibility, route-of-administration assessment, and analytical ' +
    'method sensitivity requirements. Lifetime TTC: 1.5 μg/day; LTL staged: ' +
    '10 μg/day (1-10 yr), 20 μg/day (1-12 mo), 120 μg/day (≤1 mo). ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      treatmentDuration: {
        type: 'string',
        enum: ['single_dose', 'up_to_1_month', '1_to_12_months', '1_to_10_years', 'lifetime'],
        description: 'Intended treatment duration category per ICH M7(R2) Table 2.',
      },
      route: {
        type: 'string',
        enum: ['oral', 'parenteral', 'dermal', 'inhalation'],
        description: 'Route of administration for the drug product.',
      },
      compoundClass: {
        type: 'string',
        enum: ['not_coc', 'CoC_aflatoxin_like', 'CoC_nitrosamine', 'CoC_alkyl_azoxy'],
        description: 'Compound class — whether the impurity belongs to a Cohort of Concern category. Use "not_coc" for standard mutagenic impurities.',
      },
      maxDailyDoseG: {
        type: 'number',
        description: 'Maximum daily dose of the drug product in grams per day. Used to calculate the concentration limit (ppm) in the drug substance.',
      },
      numberOfMutagenicImpurities: {
        type: 'number',
        description: 'Number of mutagenic impurities (Class 2 + Class 3) present in the drug substance. Default 1. If >1, guidance on TTC allocation is provided.',
      },
      isOncologyIndication: {
        type: 'boolean',
        description: 'Whether the drug is for an oncology / advanced cancer indication. Oncology indications may justify higher limits per ICH M7(R2) and ICH S9.',
      },
      nitrosamineIdentity: {
        type: 'string',
        description: 'Specific nitrosamine abbreviation (e.g., "NDMA", "NDEA", "NMBA", "NIPEA") for compound-specific AI lookup. Only relevant if compoundClass is "CoC_nitrosamine".',
      },
    },
    required: ['treatmentDuration', 'route', 'compoundClass'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. (Q)SAR Structural Alert Assessment
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_STRUCTURAL_ALERTS: AnaTool = {
  name: 'assess_structural_alerts',
  description:
    'Assess structural alerts for bacterial mutagenicity per ICH M7(R2) ' +
    'Section 6 (Q)SAR requirements. Returns identified alerting structures ' +
    'matched against ICH M7 Table 1 categories (alkyl halides, Michael reactive ' +
    'acceptors, epoxides, aldehydes, aromatic amines, aromatic nitro, N-nitroso, ' +
    'azide, hydrazine, acyl halides, boronic acids, sulfonates, etc.), the two ' +
    'complementary (Q)SAR system requirement (one expert rule-based + one ' +
    'statistical-based), possible outcomes (both negative → Class 5, both ' +
    'positive → Class 3, conflicting → expert review, inconclusive → testing), ' +
    'expert review requirements, documentation requirements for negative ' +
    'predictions, and triggers for experimental testing despite negative (Q)SAR. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      functionalGroupsPresent: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of functional groups present in the impurity structure (e.g., "aromatic amine", "alkyl chloride", "aldehyde", "N-nitroso", "epoxide", "hydrazine").',
      },
      knownStructuralAlerts: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of known structural alerts already identified by prior assessment (e.g., from a (Q)SAR system output).',
      },
      intendedQSARMethodology: {
        type: 'array',
        items: { type: 'string' },
        description: 'Intended (Q)SAR systems to be used (e.g., ["Derek Nexus", "Sarah Nexus"]). Guidance on system selection is provided regardless.',
      },
      expertReviewConducted: {
        type: 'boolean',
        description: 'Whether an expert review of the (Q)SAR results has been conducted. Affects documentation recommendations.',
      },
    },
    required: ['functionalGroupsPresent'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Purge Factor Study Design
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_PURGE_STUDY: AnaTool = {
  name: 'design_purge_study',
  description:
    'Design a purge factor assessment for a mutagenic impurity per the ' +
    'Teasdale (2019) semiquantitative scoring methodology. Returns the purge ' +
    'factor concept explanation, individual purge mechanism scores (reactivity: ' +
    '1-100, solubility: 1-10, volatility: 1-10, ionizability: 1-10), overall ' +
    'purge factor estimate (product of individual scores), cumulative purge ' +
    'across downstream steps, acceptable purge factor guidance, spiking study ' +
    'design recommendations (when recommended, spike levels, analytical ' +
    'requirements), documentation requirements, and process optimization ' +
    'suggestions for enhanced impurity removal. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      impurityBoilingPointC: {
        type: 'number',
        description: 'Boiling point of the impurity in degrees Celsius. Used to estimate volatility-based purge.',
      },
      impuritySolubility: {
        type: 'string',
        description: 'Solubility profile of the impurity (e.g., "water-soluble", "organic-soluble", "lipophilic", "polar"). Compared to API solubility.',
      },
      impurityPKa: {
        type: 'number',
        description: 'pKa of the impurity. Compared to API pKa for ionizability-based purge estimation.',
      },
      impurityReactivity: {
        type: 'string',
        description: 'Reactivity description (e.g., "highly reactive", "labile under acidic conditions", "stable", "unreactive"). Informs reactivity purge score.',
      },
      syntheticStep: {
        type: 'string',
        enum: ['early', 'intermediate', 'late', 'final'],
        description: 'At which synthetic step the impurity is introduced or formed. Earlier introduction = more downstream purge opportunities.',
      },
      reactionType: {
        type: 'string',
        description: 'Type of downstream reaction (e.g., "coupling", "reduction", "oxidation", "salt formation", "crystallization").',
      },
      temperatureC: {
        type: 'number',
        description: 'Process temperature in degrees Celsius for the relevant downstream step(s).',
      },
      pH: {
        type: 'number',
        description: 'Process pH for the relevant downstream step(s). Extreme pH may promote reactivity-based purge.',
      },
      solvent: {
        type: 'string',
        description: 'Solvent used in downstream processing (e.g., "ethanol", "water", "DCM", "MTBE", "toluene").',
      },
      workupType: {
        type: 'string',
        description: 'Workup procedure (e.g., "aqueous wash", "extraction", "crystallization", "filtration", "distillation", "chromatography").',
      },
      numberOfDownstreamSteps: {
        type: 'number',
        description: 'Number of synthetic/purification steps between the impurity introduction point and the final API. Default 0.',
      },
      apiBoilingPointC: {
        type: 'number',
        description: 'Boiling point of the API in degrees Celsius. Used for volatility comparison.',
      },
      apiSolubility: {
        type: 'string',
        description: 'Solubility profile of the API (e.g., "organic-soluble", "water-soluble"). Used for solubility comparison.',
      },
      apiPKa: {
        type: 'number',
        description: 'pKa of the API. Used for ionizability comparison.',
      },
    },
    required: ['syntheticStep'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. Nitrosamine Risk Assessment
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_NITROSAMINE_RISK: AnaTool = {
  name: 'assess_nitrosamine_risk',
  description:
    'Assess nitrosamine impurity risk per FDA 2021 and EMA 2023 nitrosamine ' +
    'guidances. Returns a three-step risk assessment (Step 1: identify root ' +
    'cause potential — vulnerable amines, nitrosating agents/conditions; ' +
    'Step 2: risk ranking — high/medium/low/no_risk; Step 3: confirmatory ' +
    'testing requirements), identified root causes (sodium nitrite in synthesis, ' +
    'cross-contamination from shared equipment, degradation of nitrosamide ' +
    'impurities, rubber gaskets/stoppers as NDMA source, excipient-drug ' +
    'interactions), compound-specific acceptable intakes for common ' +
    'nitrosamines (NDMA: 96 ng/day, NDEA: 26.5 ng/day, NMBA: 96 ng/day, ' +
    'NIPEA: 26.5 ng/day, default: 18 ng/day), analytical method requirements ' +
    '(GC-MS/MS, LC-MS/MS with LOQ ≤10% of AI), and regulatory timelines ' +
    'for FDA/EMA/Health Canada. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      drugSubstanceContainsAmines: {
        type: 'boolean',
        description: 'Whether the drug substance or process intermediates contain amine functional groups susceptible to nitrosation.',
      },
      amineType: {
        type: 'string',
        enum: ['primary', 'secondary', 'tertiary', 'none'],
        description: 'Type of amine present. Secondary amines are most susceptible to N-nitrosamine formation.',
      },
      nitriteReagentsUsed: {
        type: 'boolean',
        description: 'Whether nitrite reagents (e.g., sodium nitrite, nitrous acid, tert-butyl nitrite) are used in the API synthesis.',
      },
      specificNitriteReagents: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of specific nitrite/nitrosating reagents used (e.g., ["sodium nitrite", "NOBF4"]).',
      },
      synthesisUsesNitrosatingConditions: {
        type: 'boolean',
        description: 'Whether the synthesis involves conditions that could generate nitrosating species in situ (e.g., acidic conditions with trace nitrite).',
      },
      sharedEquipment: {
        type: 'boolean',
        description: 'Whether manufacturing equipment is shared with other products that may contain or generate nitrosamines.',
      },
      packagingContainsRubber: {
        type: 'boolean',
        description: 'Whether the drug product packaging contains rubber components (gaskets, stoppers, seals) that may leach NDMA.',
      },
      excipientsConcern: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of excipients of concern for nitrite content (e.g., ["sodium starch glycolate", "povidone", "croscarmellose sodium"]).',
      },
      drugSubstanceDegradationRisk: {
        type: 'boolean',
        description: 'Whether the drug substance has a degradation pathway that could form N-nitroso compounds.',
      },
      apiStructureDescription: {
        type: 'string',
        description: 'Brief description of the API structure highlighting relevant functional groups (for risk context).',
      },
      maxDailyDoseG: {
        type: 'number',
        description: 'Maximum daily dose in grams per day. Used to calculate analytical LOQ requirements.',
      },
    },
    required: ['drugSubstanceContainsAmines', 'nitriteReagentsUsed', 'synthesisUsesNitrosatingConditions', 'sharedEquipment', 'packagingContainsRubber'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Control Strategy Design
// ─────────────────────────────────────────────────────────────────────────────

export const CONTROL_MUTAGENIC_IMPURITY: AnaTool = {
  name: 'control_mutagenic_impurity',
  description:
    'Design a control strategy for a mutagenic impurity per ICH M7(R2) ' +
    'Section 8 control options. Returns the recommended control option ' +
    '(Option 1: test DS at TTC limit; Option 2: test intermediate at TTC limit; ' +
    'Option 3: test DS at higher limit with purge justification; Option 4: ' +
    'no test — validated purge; Option 5: no controls for Class 4/5), all ' +
    'five options with applicability assessment, specification limit (ppm ' +
    'and μg/day), phase-specific considerations (Phase 1 staging, Phase 2/3 ' +
    'LTL-TTC, commercial full compliance), analytical method requirements ' +
    '(LOQ ≤30% of spec limit, validation per ICH Q2(R2)), release vs. ' +
    'shelf-life testing requirements, and change control requirements for ' +
    'post-approval lifecycle management. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      impurityClass: {
        type: 'number',
        enum: [1, 2, 3, 4, 5],
        description: 'ICH M7(R2) impurity class (1-5). Determines which control options are applicable.',
      },
      drugProductType: {
        type: 'string',
        description: 'Type of drug product (e.g., "tablet", "capsule", "injection", "solution", "cream", "inhalation"). Affects shelf-life testing requirements.',
      },
      maxDailyDoseG: {
        type: 'number',
        description: 'Maximum daily dose of the drug product in grams per day. Used to calculate the concentration limit (ppm).',
      },
      treatmentDuration: {
        type: 'string',
        enum: ['single_dose', 'up_to_1_month', '1_to_12_months', '1_to_10_years', 'lifetime'],
        description: 'Intended treatment duration for the commercial product.',
      },
      developmentPhase: {
        type: 'string',
        enum: ['clinical_phase1', 'clinical_phase2', 'clinical_phase3', 'commercial'],
        description: 'Current development phase. Affects phase-appropriate limit considerations.',
      },
      purgeFactorAvailable: {
        type: 'boolean',
        description: 'Whether purge factor data (from spiking studies or theoretical assessment) is available.',
      },
      purgeFactorValue: {
        type: 'number',
        description: 'Demonstrated cumulative purge factor value (e.g., 10000 for 10,000× purge). Required for Options 3 and 4.',
      },
      numberOfDownstreamSteps: {
        type: 'number',
        description: 'Number of downstream synthetic/purification steps from the impurity introduction point to the final API.',
      },
      compoundClass: {
        type: 'string',
        enum: ['not_coc', 'CoC_aflatoxin_like', 'CoC_nitrosamine', 'CoC_alkyl_azoxy'],
        description: 'Whether the impurity belongs to a Cohort of Concern category. Affects AI and control stringency.',
      },
      nitrosamineIdentity: {
        type: 'string',
        description: 'Specific nitrosamine identity (e.g., "NDMA", "NDEA") for compound-specific AI lookup. Only relevant for CoC_nitrosamine.',
      },
      analyticalMethodValidated: {
        type: 'boolean',
        description: 'Whether the analytical method for this impurity has been validated per ICH Q2(R2).',
      },
    },
    required: ['impurityClass', 'drugProductType', 'maxDailyDoseG', 'treatmentDuration', 'developmentPhase'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Exported Array
// ─────────────────────────────────────────────────────────────────────────────

/** Mutagenic Impurity (ICH M7) tools, spread into ALL_ANA_TOOLS. */
export const MUTAGENIC_IMPURITY_TOOLS: AnaTool[] = [
  CLASSIFY_MUTAGENIC_IMPURITY,
  CALCULATE_TTC,
  ASSESS_STRUCTURAL_ALERTS,
  DESIGN_PURGE_STUDY,
  ASSESS_NITROSAMINE_RISK,
  CONTROL_MUTAGENIC_IMPURITY,
];
