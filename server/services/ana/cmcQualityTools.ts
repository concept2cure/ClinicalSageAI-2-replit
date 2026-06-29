/**
 * CMC Quality (ICH Q-series) tools — exposes the deterministic knowledge
 * engines in `server/services/cmc-quality/cmc-quality-knowledge` to AnA
 * as first-class, selectable tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
 *
 * Tools:
 *   design_stability_study          — ICH Q1A-Q1E stability study design
 *   validate_analytical_method      — ICH Q2(R2) method validation
 *   classify_impurity               — ICH Q3A-Q3D impurity classification
 *   set_specifications              — ICH Q6A/Q6B specification setting
 *   assess_process_validation       — FDA/ICH Q8-Q10 process validation
 *   assess_comparability_protocol   — ICH Q5E comparability assessment
 *
 * @module server/services/ana/cmcQualityTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned numbers and regulatory citations verbatim. Do NOT recompute, ' +
  'round differently, or substitute your own regulatory interpretation — a fabricated ' +
  'or misattributed regulatory citation in a CMC submission is a critical defect.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. design_stability_study
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_STABILITY_STUDY: AnaTool = {
  name: 'design_stability_study',
  description:
    'Design an ICH-compliant stability study per Q1A(R2)/Q1B/Q1C/Q1D/Q1E. Returns storage ' +
    'conditions (long-term/accelerated/intermediate) for the specified climatic zone, testing ' +
    'intervals, minimum batch requirements, matrixing/bracketing options, photostability ' +
    'protocol, statistical analysis approach, shelf-life estimation method, and required test ' +
    'attributes. Use when planning stability protocols, determining storage conditions for ' +
    'different markets, or designing photostability studies. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      dosageForm: {
        type: 'string',
        description:
          'Dosage form (e.g., "tablet", "capsule", "solution", "injection", "cream", ' +
          '"lyophilized", "inhaler", "suppository", "patch", "ophthalmic"). ' +
          'Determines dosage-form-specific stability attributes to test.',
      },
      climaticZone: {
        type: 'string',
        enum: ['I', 'II', 'III', 'IVa', 'IVb'],
        description:
          'ICH climatic zone for the intended market. Zone I: temperate, Zone II: ' +
          'subtropical/Mediterranean, Zone III: hot/dry, Zone IVa: hot/humid, ' +
          'Zone IVb: hot/very humid. Determines long-term storage conditions.',
      },
      packagingType: {
        type: 'string',
        description:
          'Primary packaging type (e.g., "HDPE_bottle", "glass_bottle", "blister_alu_alu", ' +
          '"blister_pvc_alu", "ampoule", "vial", "prefilled_syringe", "tube", "sachet"). ' +
          'Affects moisture permeation and photostability requirements.',
      },
      intendedMarkets: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Target regulatory markets (e.g., ["US", "EU", "Japan"]). The engine selects ' +
          'the most stringent storage conditions across all target markets.',
      },
      productType: {
        type: 'string',
        enum: ['new', 'generic', 'variation'],
        description:
          'Product type. New products require full stability data; generics may use ' +
          'abbreviated protocols; variations depend on change significance.',
      },
      photosensitive: {
        type: 'boolean',
        description:
          'Whether the drug substance or product is known or suspected to be photosensitive. ' +
          'Determines photostability testing requirements per ICH Q1B.',
      },
    },
    required: ['dosageForm', 'climaticZone', 'packagingType', 'productType', 'photosensitive'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. validate_analytical_method
// ─────────────────────────────────────────────────────────────────────────────

export const VALIDATE_ANALYTICAL_METHOD: AnaTool = {
  name: 'validate_analytical_method',
  description:
    'Determine required validation parameters for an analytical method per ICH Q2(R2). ' +
    'Returns the complete validation plan including which parameters are required (specificity, ' +
    'linearity, range, accuracy, precision, LOD, LOQ, robustness), acceptance criteria for ' +
    'each, number of determinations, precision levels (repeatability/intermediate/reproducibility), ' +
    'robustness factors to evaluate, and system suitability requirements. Use when planning ' +
    'method validation, reviewing validation protocols, or determining acceptance criteria. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      methodType: {
        type: 'string',
        enum: [
          'identification',
          'assay_potency',
          'impurities_quantitative',
          'impurities_limit',
          'dissolution',
          'content_uniformity',
          'biological_potency',
        ],
        description:
          'Category of analytical procedure per ICH Q2(R2). Determines which validation ' +
          'characteristics are required.',
      },
      technique: {
        type: 'string',
        enum: [
          'HPLC',
          'GC',
          'CE',
          'UV',
          'titration',
          'biological_assay',
          'LCMS',
          'ICP_MS',
          'Karl_Fischer',
          'NIR',
        ],
        description:
          'Analytical technique used. Affects system suitability requirements and ' +
          'technique-specific robustness factors.',
      },
    },
    required: ['methodType', 'technique'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. classify_impurity
// ─────────────────────────────────────────────────────────────────────────────

export const CLASSIFY_IMPURITY: AnaTool = {
  name: 'classify_impurity',
  description:
    'Classify an impurity and determine reporting/identification/qualification thresholds per ' +
    'ICH Q3A(R2) for drug substances, Q3B(R2) for drug products, Q3C(R8) for residual solvents, ' +
    'and Q3D(R2) for elemental impurities. Returns threshold values, qualification strategies, ' +
    'solvent/element classifications with PDE values, and mutagenic impurity considerations ' +
    '(ICH M7 reference). Use when setting impurity specifications, evaluating unknown impurities, ' +
    'or determining whether qualification studies are needed. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      impurityType: {
        type: 'string',
        enum: ['organic', 'inorganic', 'residual_solvent', 'elemental'],
        description:
          'Type of impurity. Organic/inorganic impurities follow Q3A/Q3B thresholds; ' +
          'residual solvents follow Q3C classification; elemental impurities follow Q3D.',
      },
      maximumDailyDose_mg: {
        type: 'number',
        description:
          'Maximum daily dose of the drug product in milligrams. Determines threshold ' +
          'levels for organic/inorganic impurities — lower doses have higher percentage thresholds.',
      },
      context: {
        type: 'string',
        enum: ['drug_substance', 'drug_product'],
        description:
          'Whether the impurity is being evaluated in a drug substance (Q3A) or drug ' +
          'product (Q3B). Drug product thresholds are generally different from drug ' +
          'substance thresholds.',
      },
      solventName: {
        type: 'string',
        description:
          'Name of the residual solvent (e.g., "methanol", "dichloromethane", "acetonitrile"). ' +
          'Required when impurityType is "residual_solvent". Used to look up Class 1/2/3 ' +
          'classification and PDE.',
      },
      elementName: {
        type: 'string',
        description:
          'Element symbol or name (e.g., "Pb", "Cd", "As", "Ni"). Required when impurityType ' +
          'is "elemental". Used to look up Class 1/2A/2B/3 and route-specific PDEs.',
      },
      route: {
        type: 'string',
        enum: ['oral', 'parenteral', 'inhalation', 'topical'],
        description:
          'Route of administration. Affects elemental impurity PDE values — parenteral and ' +
          'inhalation routes have stricter limits. Defaults to "oral" if not provided.',
      },
    },
    required: ['impurityType', 'maximumDailyDose_mg', 'context'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. set_specifications
// ─────────────────────────────────────────────────────────────────────────────

export const SET_SPECIFICATIONS: AnaTool = {
  name: 'set_specifications',
  description:
    'Determine required specification tests and acceptance criteria per ICH Q6A (chemical) ' +
    'or Q6B (biotechnological/biological). Returns universal tests, dosage-form-specific tests, ' +
    'applicable decision trees (dissolution vs disintegration, particle size, polymorphism, ' +
    'water content), biological product tests, specification limit setting approaches, and ' +
    'compendial requirements. Use when developing product specifications, reviewing specification ' +
    'adequacy, or determining which tests are needed for a new dosage form. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      productType: {
        type: 'string',
        enum: ['small_molecule', 'biological', 'herbal'],
        description:
          'Product category. Small molecules follow Q6A; biologicals additionally follow ' +
          'Q6B; herbals have specialized requirements.',
      },
      dosageForm: {
        type: 'string',
        description:
          'Dosage form (e.g., "tablet", "capsule", "injection", "cream", "suspension", ' +
          '"lyophilized_powder", "metered_dose_inhaler"). Determines dosage-form-specific tests.',
      },
      route: {
        type: 'string',
        enum: [
          'oral',
          'parenteral',
          'topical',
          'inhalation',
          'ophthalmic',
          'otic',
          'nasal',
          'rectal',
          'vaginal',
        ],
        description:
          'Route of administration. Parenteral and ophthalmic require sterility testing; ' +
          'inhalation requires particle size analysis.',
      },
      compendialStatus: {
        type: 'string',
        enum: ['compendial', 'non_compendial'],
        description:
          'Whether the product has a compendial monograph. Compendial products must meet ' +
          'pharmacopeial requirements as a minimum.',
      },
      developmentDataSummary: {
        type: 'string',
        description:
          'Brief description of development data available. Used to refine specification ' +
          'setting recommendations.',
      },
    },
    required: ['productType', 'dosageForm', 'route', 'compendialStatus'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. assess_process_validation
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_PROCESS_VALIDATION: AnaTool = {
  name: 'assess_process_validation',
  description:
    'Provide stage-specific process validation guidance per FDA 2011 Process Validation ' +
    'Guidance and ICH Q8(R2)/Q9/Q10. Returns activities, deliverables, and documentation ' +
    'requirements for the specified validation stage. Stage 1 covers process design (DoE, CQAs, ' +
    'CPPs, design space, risk assessment). Stage 2 covers process qualification (PPQ protocol, ' +
    'batch requirements, acceptance criteria, sampling plans). Stage 3 covers continued process ' +
    'verification (control strategy, trending, SPC tools). Also includes QbD elements and PAT ' +
    'opportunities specific to the manufacturing process. Use when planning process validation, ' +
    'developing PPQ protocols, or establishing continued verification programs. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      processType: {
        type: 'string',
        enum: [
          'chemical_synthesis',
          'fermentation',
          'formulation',
          'filling',
          'lyophilization',
          'coating',
          'granulation',
          'tableting',
          'encapsulation',
        ],
        description:
          'Type of manufacturing process. Determines process-specific CPPs, CQAs, and ' +
          'validation requirements.',
      },
      scale: {
        type: 'string',
        enum: ['lab', 'pilot', 'commercial'],
        description:
          'Manufacturing scale. Lab scale for Stage 1 development; pilot for bridging; ' +
          'commercial for Stage 2 PPQ and Stage 3 verification.',
      },
      validationStage: {
        type: 'string',
        enum: [
          'stage_1_process_design',
          'stage_2_process_qualification',
          'stage_3_continued_verification',
        ],
        description:
          'FDA Process Validation lifecycle stage. Stage 1: process design and development; ' +
          'Stage 2: process performance qualification; Stage 3: continued process verification.',
      },
    },
    required: ['processType', 'scale', 'validationStage'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. assess_comparability_protocol
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_COMPARABILITY_PROTOCOL: AnaTool = {
  name: 'assess_comparability_protocol',
  description:
    'Determine the comparability assessment requirements for post-approval changes to ' +
    'biotechnological/biological products per ICH Q5E. Returns the assessment tier needed ' +
    '(analytical only, analytical + functional, analytical + functional + clinical), analytical ' +
    'comparability plan, statistical approaches, functional assay requirements, clinical study ' +
    'requirements if needed, and regulatory reporting pathways (FDA CBE/PAS; EMA variation ' +
    'types). Use when planning manufacturing changes for biologics, evaluating change ' +
    'significance, or preparing comparability protocols. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      changeType: {
        type: 'string',
        enum: [
          'manufacturing_site',
          'scale_up',
          'process_change',
          'formulation_change',
          'cell_bank',
        ],
        description:
          'Type of manufacturing change. Determines the expected assessment tier and ' +
          'scope of comparability studies.',
      },
      productType: {
        type: 'string',
        enum: [
          'mAb',
          'vaccine',
          'blood_product',
          'gene_therapy',
          'biosimilar',
          'recombinant_protein',
        ],
        description:
          'Biological product type. Different product types have different critical quality ' +
          'attributes requiring assessment.',
      },
      significance: {
        type: 'string',
        enum: ['minor', 'moderate', 'major'],
        description:
          'Assessed significance of the manufacturing change. Minor changes may need only ' +
          'analytical comparability; major changes may require clinical bridging studies.',
      },
    },
    required: ['changeType', 'productType', 'significance'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Collected array — spread into ALL_ANA_TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/** CMC Quality (ICH Q-series) tools, spread into ALL_ANA_TOOLS. */
export const CMC_QUALITY_TOOLS: AnaTool[] = [
  DESIGN_STABILITY_STUDY,
  VALIDATE_ANALYTICAL_METHOD,
  CLASSIFY_IMPURITY,
  SET_SPECIFICATIONS,
  ASSESS_PROCESS_VALIDATION,
  ASSESS_COMPARABILITY_PROTOCOL,
];
