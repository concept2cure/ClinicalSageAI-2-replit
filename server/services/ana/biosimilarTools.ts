/**
 * Biosimilar Development tools -- exposes the deterministic knowledge
 * engines in `server/services/biosimilar/biosimilar-knowledge` to AnA
 * as first-class, selectable tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
 *
 * Tools:
 *   assess_analytical_similarity_biosimilar — Analytical similarity tier classification per FDA 2017
 *   design_biosimilar_clinical              — Biosimilar clinical program design
 *   assess_indication_extrapolation         — Extrapolation of indications justification
 *   assess_interchangeability               — Interchangeability requirements & switching study
 *   plan_biosimilar_ip_strategy             — BPCIA patent dance & exclusivity analysis
 *   assess_biosimilar_cmc                   — CMC development strategy for biosimilars
 *
 * @module server/services/ana/biosimilarTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned data and regulatory citations verbatim. Do NOT recompute, ' +
  'round differently, or substitute your own regulatory interpretation — a fabricated ' +
  'or misattributed regulatory citation in a biosimilar submission is a critical defect.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. assess_analytical_similarity_biosimilar
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_ANALYTICAL_SIMILARITY_BIOSIMILAR: AnaTool = {
  name: 'assess_analytical_similarity_biosimilar',
  description:
    'Assess analytical similarity for a biosimilar product per the FDA 2017 Statistical ' +
    'Approaches to Evaluate Analytical Similarity guidance and EMA biosimilar quality ' +
    'guidelines. Returns tier classification (Tier 1 / Tier 2 / Tier 3) for each critical ' +
    'quality attribute (CQA) based on product type and clinical relevance, the statistical ' +
    'approach for each tier (equivalence test with quality range for Tier 1, quality range ' +
    'for Tier 2, raw data/graphical for Tier 3), reference product lot requirements ' +
    '(minimum 10 per FDA, 3 per EMA), recommended analytical methods per CQA, and ' +
    'product-specific guidance for mAbs, fusion proteins, insulin, EPO, filgrastim, ' +
    'pegfilgrastim, adalimumab biosimilars, and trastuzumab biosimilars. Use when the user ' +
    'asks about analytical similarity assessment, CQA tier classification, statistical ' +
    'approaches for biosimilar characterization, or reference lot requirements. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      productType: {
        type: 'string',
        enum: [
          'mAb',
          'fusion_protein',
          'insulin',
          'epo',
          'filgrastim',
          'pegfilgrastim',
          'adalimumab_biosimilar',
          'trastuzumab_biosimilar',
        ],
        description:
          'Type of biosimilar product. Determines the default CQA list and tier assignments.',
      },
      criticalQualityAttributes: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional list of specific CQAs to assess (e.g., "afucosylation", "ADCC", ' +
          '"charge variants"). If omitted, returns the full CQA panel for the product type.',
      },
      analyticalMethodsUsed: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional list of analytical methods available or planned (e.g., "SPR", "HILIC-UPLC", ' +
          '"SE-HPLC"). Used to filter recommended methods to those in the user\'s capability.',
      },
    },
    required: ['productType'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. design_biosimilar_clinical
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_BIOSIMILAR_CLINICAL: AnaTool = {
  name: 'design_biosimilar_clinical',
  description:
    'Design a biosimilar clinical development program including PK similarity study, ' +
    'comparative clinical efficacy study, and immunogenicity assessment strategy. Returns ' +
    'clinical pharmacology study design (population, PK endpoints, equivalence margins ' +
    '80-125%, single-dose vs. multi-dose), comparative clinical study design (most sensitive ' +
    'indication selection, primary endpoint [ACR20 for anti-TNF, ORR for oncology mAbs, ' +
    'DSN for G-CSF, HbA1c for insulin], equivalence margin derivation, sample size), ' +
    'immunogenicity assessment (tiered ADA assay strategy — screening, confirmatory, titer, ' +
    'neutralizing antibody, cross-reactivity), switching study requirements, and approved ' +
    'biosimilar precedents with endpoints used (Zarxio, Inflectra, Amjevita, Ogivri, ' +
    'Semglee, etc.). Use when the user asks about biosimilar clinical program design, ' +
    'clinical endpoints for biosimilars, immunogenicity comparison strategy, or PK ' +
    'similarity study design. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      productType: {
        type: 'string',
        enum: [
          'mAb',
          'fusion_protein',
          'insulin',
          'epo',
          'filgrastim',
          'pegfilgrastim',
          'adalimumab_biosimilar',
          'trastuzumab_biosimilar',
        ],
        description:
          'Type of biosimilar product. Determines clinical program design, endpoint selection, ' +
          'and applicable precedents.',
      },
      referenceProduct: {
        type: 'string',
        description:
          'Name of the reference (originator) product (e.g., "Humira", "Herceptin", "Neupogen", "Lantus").',
      },
      indications: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Approved indications of the reference product that the biosimilar targets ' +
          '(e.g., ["rheumatoid arthritis", "psoriasis", "Crohn\'s disease"]).',
      },
      mechanismOfAction: {
        type: 'string',
        enum: [
          'ADCC_dependent',
          'CDC_dependent',
          'neutralization',
          'receptor_blocking',
          'enzyme_replacement',
          'signaling_modulation',
          'growth_factor_stimulation',
          'anti_proliferative',
        ],
        description:
          'Primary mechanism of action of the reference product. Affects study design ' +
          'and analytical requirements (e.g., ADCC-dependent mAbs require afucosylation matching).',
      },
      pkComplexity: {
        type: 'string',
        enum: ['low', 'moderate', 'high'],
        description:
          'PK complexity level. Low: linear PK, predictable absorption. Moderate: non-linear PK ' +
          'or target-mediated disposition. High: complex PK with multiple elimination pathways.',
      },
      immunogenicityRisk: {
        type: 'string',
        enum: ['low', 'moderate', 'high'],
        description:
          'Expected immunogenicity risk. Low: well-tolerated protein with few ADA reports. ' +
          'Moderate: moderate ADA incidence reported for reference. High: significant ADA impact ' +
          'on PK/efficacy (e.g., anti-drug antibodies neutralize the product).',
      },
    },
    required: [
      'productType',
      'referenceProduct',
      'indications',
      'mechanismOfAction',
      'pkComplexity',
      'immunogenicityRisk',
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. assess_indication_extrapolation
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_INDICATION_EXTRAPOLATION: AnaTool = {
  name: 'assess_indication_extrapolation',
  description:
    'Assess the scientific justification for extrapolation of a biosimilar\'s approved ' +
    'indications from the studied indication to other reference product indications. ' +
    'Returns feasibility assessment for each unstudied indication (likely_extrapolable, ' +
    'conditional, additional_data_needed), scientific justification requirements (same MOA, ' +
    'PK similarity, safety applicability, immunogenicity considerations), conditions where ' +
    'extrapolation is typically accepted vs. requires additional data, and key regulatory ' +
    'precedents (infliximab biosimilars extrapolated from RA to IBD, adalimumab extrapolated ' +
    'to all indications, trastuzumab to gastric cancer). Use when the user asks about ' +
    'extrapolation of indications, whether additional clinical studies are needed for ' +
    'unstudied indications, or how to scientifically justify extrapolation. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      referenceProductIndications: {
        type: 'array',
        items: { type: 'string' },
        description:
          'All approved indications of the reference product ' +
          '(e.g., ["RA", "psoriasis", "Crohn\'s disease", "ulcerative colitis", "ankylosing spondylitis"]).',
      },
      mechanismOfActionPerIndication: {
        type: 'object',
        description:
          'Map of indication to mechanism of action (e.g., ' +
          '{"RA": "TNF-alpha neutralization", "Crohn\'s disease": "TNF-alpha neutralization + transmembrane TNF reverse signaling"}). ' +
          'Differences in MOA across indications affect extrapolation feasibility.',
      },
      clinicalStudyIndication: {
        type: 'string',
        description:
          'The indication in which the comparative clinical study was conducted ' +
          '(e.g., "rheumatoid arthritis"). This is the indication with direct clinical evidence.',
      },
      targetReceptorPerIndication: {
        type: 'object',
        description:
          'Optional map of indication to target/receptor ' +
          '(e.g., {"RA": "TNF-alpha", "psoriasis": "TNF-alpha"}). ' +
          'Helps assess whether the same molecular target is engaged across indications.',
      },
    },
    required: [
      'referenceProductIndications',
      'mechanismOfActionPerIndication',
      'clinicalStudyIndication',
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. assess_interchangeability
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_INTERCHANGEABILITY: AnaTool = {
  name: 'assess_interchangeability',
  description:
    'Assess FDA interchangeability requirements per BPCIA (42 USC 262(k)(4)) and the FDA ' +
    '2019 Guidance on Interchangeability. Returns: requirements assessment (biosimilarity ' +
    'established, expected same clinical result, switching safety demonstrated), switching ' +
    'study design (3-sequence crossover with >= 3 alternations, PK and immunogenicity ' +
    'endpoints), Purple Book reference, state pharmacy substitution law implications, ' +
    'current interchangeable products (Semglee as first, Cyltezo, Hadlima, Hyrimoz, ' +
    'Yuflyma), and EMA approach (no separate interchangeability pathway — member state ' +
    'decision). Use when the user asks about interchangeability vs. biosimilarity, switching ' +
    'study requirements, pharmacy substitution, Purple Book listing, or the regulatory ' +
    'pathway for interchangeable biosimilars. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      biosimilarityEstablished: {
        type: 'boolean',
        description:
          'Whether biosimilarity to the reference product has been established through ' +
          'analytical, PK, and clinical comparative data. Must be true for interchangeability.',
      },
      switchingStudyDataAvailable: {
        type: 'boolean',
        description:
          'Whether a dedicated switching study with multiple alternations between the ' +
          'biosimilar and reference product has been conducted.',
      },
      productType: {
        type: 'string',
        enum: [
          'mAb',
          'fusion_protein',
          'insulin',
          'epo',
          'filgrastim',
          'pegfilgrastim',
          'adalimumab_biosimilar',
          'trastuzumab_biosimilar',
        ],
        description: 'Type of biosimilar product.',
      },
      dosingFrequency: {
        type: 'string',
        description:
          'Dosing frequency of the product (e.g., "every 2 weeks", "daily", "monthly"). ' +
          'Affects switching study duration and design.',
      },
    },
    required: [
      'biosimilarityEstablished',
      'switchingStudyDataAvailable',
      'productType',
      'dosingFrequency',
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. plan_biosimilar_ip_strategy
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_BIOSIMILAR_IP_STRATEGY: AnaTool = {
  name: 'plan_biosimilar_ip_strategy',
  description:
    'Analyze the biosimilar IP landscape and exclusivity considerations for US (BPCIA ' +
    'patent dance per 42 USC 262(l)) and EU markets. Returns: BPCIA patent dance process ' +
    '(9-step timeline from aBLA filing through second-wave litigation), US exclusivity ' +
    '(4-year data + 12-year market + pediatric extension + first interchangeable exclusivity), ' +
    'EU exclusivity (8+2+1 formula), freedom-to-operate analysis framework (8-step process), ' +
    'design-around strategies for process/formulation/method-of-use patents, and risk-at-launch ' +
    'considerations. Use when the user asks about biosimilar patent strategy, BPCIA patent ' +
    'dance, biologics exclusivity, freedom-to-operate, or launch-at-risk scenarios. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      referenceProductName: {
        type: 'string',
        description:
          'Name of the reference (originator) product (e.g., "Humira", "Herceptin", "Remicade").',
      },
      patentExpiryDates: {
        type: 'object',
        description:
          'Known patent expiry dates for the reference product. Object with optional keys: ' +
          '"substance" (compound/composition patent), "formulation" (formulation patent), ' +
          '"methodOfUse" (method of treatment patent), "process" (manufacturing process patent). ' +
          'Values are date strings (e.g., "2025-12-31").',
        properties: {
          substance: {
            type: 'string',
            description: 'Expiry date of the substance/composition-of-matter patent.',
          },
          formulation: {
            type: 'string',
            description: 'Expiry date of the formulation patent.',
          },
          methodOfUse: {
            type: 'string',
            description: 'Expiry date of the method-of-use patent.',
          },
          process: {
            type: 'string',
            description: 'Expiry date of the manufacturing process patent.',
          },
        },
      },
      biosimilarExclusivityStatus: {
        type: 'string',
        description:
          'Current exclusivity status of any biosimilars already approved for the same reference ' +
          '(e.g., "first interchangeable approved", "multiple biosimilars on market"). ' +
          'Affects competitive landscape analysis.',
      },
      market: {
        type: 'string',
        enum: ['US', 'EU', 'both'],
        description:
          'Target market for the biosimilar. "US" returns BPCIA-specific analysis, ' +
          '"EU" returns EU-specific analysis, "both" returns comprehensive analysis.',
      },
    },
    required: ['referenceProductName', 'patentExpiryDates', 'market'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. assess_biosimilar_cmc
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_BIOSIMILAR_CMC: AnaTool = {
  name: 'assess_biosimilar_cmc',
  description:
    'Assess the CMC (Chemistry, Manufacturing, and Controls) development strategy for a ' +
    'biosimilar product. Returns: reverse-engineering strategy for reference product ' +
    'characterization (8-step process), expression system selection guidance (CHO, E. coli, ' +
    'yeast, insect, HEK293 with advantages, disadvantages, glycosylation capability), ' +
    'process development approach (cell line development, upstream optimization including ' +
    'glycosylation tuning, downstream purification, formulation matching), formulation ' +
    'matching strategy (same excipients preferred, different acceptable with justification), ' +
    'container closure considerations (vial vs. PFS vs. autoinjector), specification setting ' +
    'relative to reference product, manufacturing comparability strategy, and quality target ' +
    'product profile (QTPP) elements specific to biosimilars. Use when the user asks about ' +
    'biosimilar manufacturing, expression system selection, process development, formulation ' +
    'development, or quality target product profile for a biosimilar. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      referenceProduct: {
        type: 'string',
        description:
          'Name of the reference (originator) product to be reverse-engineered ' +
          '(e.g., "Herceptin", "Humira", "Enbrel").',
      },
      expressionSystem: {
        type: 'string',
        enum: ['CHO', 'E_coli', 'yeast', 'insect', 'HEK293'],
        description:
          'Proposed expression system for the biosimilar. CHO is the industry standard for ' +
          'glycosylated mAbs/fusion proteins. E. coli for non-glycosylated proteins (filgrastim, insulin). ' +
          'Yeast for insulin. HEK293 for products requiring human-type glycosylation.',
      },
      productionScale: {
        type: 'string',
        enum: ['bench', 'pilot', 'commercial'],
        description:
          'Current or planned production scale. Affects process development recommendations ' +
          'and scale-up guidance.',
      },
      analyticalCapability: {
        type: 'string',
        enum: ['basic', 'intermediate', 'advanced'],
        description:
          'Analytical capability level of the development organization. Basic: standard ' +
          'compendial methods. Intermediate: includes SPR, HILIC, CE. Advanced: includes ' +
          'HDX-MS, 2D-NMR, AUC, advanced MS-based methods.',
      },
    },
    required: ['referenceProduct', 'expressionSystem', 'productionScale', 'analyticalCapability'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Collected array — spread into ALL_ANA_TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/** Biosimilar development tools, spread into ALL_ANA_TOOLS. */
export const BIOSIMILAR_TOOLS: AnaTool[] = [
  ASSESS_ANALYTICAL_SIMILARITY_BIOSIMILAR,
  DESIGN_BIOSIMILAR_CLINICAL,
  ASSESS_INDICATION_EXTRAPOLATION,
  ASSESS_INTERCHANGEABILITY,
  PLAN_BIOSIMILAR_IP_STRATEGY,
  ASSESS_BIOSIMILAR_CMC,
];
