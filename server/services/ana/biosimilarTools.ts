/**
 * Biosimilar Development tools -- exposes the deterministic knowledge
 * engines in `server/services/biosimilar/biosimilar-knowledge` to AnA
 * as first-class, selectable tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
 * A required or malformed input is refused by field, and a conclusion an
 * unstated fact could change is null or not_assessed (Rule 2 S5d, 2026-11-09).
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
  'Deterministic, no LLM: report the returned data and citations verbatim. If a parameter is missing or ' +
  'invalid, relay the validation error and ask the user for the correct value.';
const NOT_READ = ' Not read: it does not change the result.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. assess_analytical_similarity_biosimilar
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_ANALYTICAL_SIMILARITY_BIOSIMILAR: AnaTool = {
  name: 'assess_analytical_similarity_biosimilar',
  description:
    'Assess analytical similarity for a biosimilar product per the FDA 2017 Statistical Approaches to ' +
    'Evaluate Analytical Similarity guidance and EMA biosimilar quality guidelines. Returns the tier (1, 2 ' +
    'or 3) of each critical quality attribute (CQA) for the product type, the statistical approach per tier ' +
    '(equivalence test, quality range, or raw data/graphical), reference product lot requirements (minimum ' +
    '10 per FDA, 3 per EMA), recommended analytical methods per CQA, product-specific guidance (mAbs, fusion ' +
    'proteins, insulin, EPO, filgrastim, pegfilgrastim, adalimumab and trastuzumab biosimilars) and ' +
    'selectionNotes, which say when a requested CQA or method list matched nothing and the full list is ' +
    'returned. Use for analytical similarity assessment, CQA tier classification, or reference lot ' +
    'requirements. ' + DETERMINISTIC_NOTE,
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
          '"charge variants"). If omitted, returns the full CQA panel for the product type; if none ' +
          'matches, the full panel is returned and selectionNotes says so.',
      },
      analyticalMethodsUsed: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional list of analytical methods available or planned (e.g., "SPR", "HILIC-UPLC", ' +
          '"SE-HPLC"). Used to filter recommended methods to those in the user\'s capability; where none ' +
          'matches an attribute, its full list is returned and selectionNotes says so.',
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
    'Design a biosimilar clinical development program: PK similarity study, comparative clinical efficacy ' +
    'study and immunogenicity assessment strategy. Returns the PK study design (population, PK endpoints, ' +
    '80-125% margins, single vs. multi-dose), the comparative clinical study design (most sensitive ' +
    'indication, primary endpoint [ACR20 for anti-TNF, ORR for oncology mAbs, DSN for G-CSF, HbA1c for ' +
    'insulin], equivalence margin derivation, sample size), the tiered ADA strategy, switching study ' +
    'requirements and approved biosimilar precedents (Zarxio, Inflectra, Amjevita, Ogivri, Semglee, etc.). ' +
    'A missing or malformed productType, referenceProduct, ' +
    'pkComplexity or immunogenicityRisk is refused. Use for biosimilar clinical program design, clinical ' +
    'endpoints for biosimilars, immunogenicity comparison strategy, or PK similarity study design. ' +
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
          '(e.g., ["rheumatoid arthritis", "psoriasis", "Crohn\'s disease"]).' + NOT_READ,
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
        description: 'Primary mechanism of action of the reference product.' + NOT_READ,
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
    required: ['productType', 'referenceProduct', 'pkComplexity', 'immunogenicityRisk'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. assess_indication_extrapolation
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_INDICATION_EXTRAPOLATION: AnaTool = {
  name: 'assess_indication_extrapolation',
  description:
    'Assess the scientific justification for extrapolation of a biosimilar\'s approved indications from the ' +
    'studied indication to other reference product indications. Returns, for each unstudied indication, the ' +
    'feasibility (likely_extrapolable, conditional, additional_data_needed, or not_assessed while the ' +
    'mechanism of action or target of it or of the studied indication is not stated), justification ' +
    'requirements (same MOA, PK similarity, safety, immunogenicity), risk factors and key regulatory ' +
    'precedents (infliximab biosimilars extrapolated from RA to IBD, adalimumab to all indications, ' +
    'trastuzumab to gastric cancer). Give targetReceptorPerIndication too: feasibility compares both. Use ' +
    'for extrapolation of indications, whether unstudied indications need additional clinical studies, or ' +
    'how to scientifically justify extrapolation. ' + DETERMINISTIC_NOTE,
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
          'Differences in MOA across indications affect extrapolation feasibility; an indication whose ' +
          'mechanism, or the studied indication\'s, is not stated is not_assessed.',
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
          'Map of indication to target/receptor ' +
          '(e.g., {"RA": "TNF-alpha", "psoriasis": "TNF-alpha"}). ' +
          'Feasibility compares it with the mechanism: an indication whose target, or the studied ' +
          'indication\'s, is not stated is not_assessed.',
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
    'Assess FDA interchangeability requirements per BPCIA (42 USC 262(k)(4)) and the FDA 2019 Guidance on ' +
    'Interchangeability. Returns the requirements (biosimilarity established, expected same clinical result, ' +
    'switching safety demonstrated; each null when not stated, and overallEligible null until both inputs ' +
    'are stated or one is false), inputStates, the switching study design (3-sequence crossover with >= 3 ' +
    'alternations, PK and immunogenicity endpoints), Purple Book reference, state pharmacy substitution ' +
    'law implications, current interchangeable products (Semglee as first, Cyltezo, Hadlima, Hyrimoz, ' +
    'Yuflyma), and EMA approach (a member state decision). Use when ' +
    'the user asks about interchangeability vs. biosimilarity, switching study requirements, pharmacy ' +
    'substitution, Purple Book listing, or the pathway for interchangeable biosimilars. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      biosimilarityEstablished: {
        type: 'boolean',
        description:
          'Whether biosimilarity to the reference product has been established through ' +
          'analytical, PK, and clinical comparative data. Must be true for interchangeability. ' +
          'Omitted or null stays not_stated, and overallEligible is then null unless the other is false.',
      },
      switchingStudyDataAvailable: {
        type: 'boolean',
        description:
          'Whether a dedicated switching study with multiple alternations between the ' +
          'biosimilar and reference product has been conducted. Omitted or null stays not_stated, and ' +
          'overallEligible is then null unless the other is false.',
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
        description: 'Type of biosimilar product.' + NOT_READ,
      },
      dosingFrequency: {
        type: 'string',
        description:
          'Dosing frequency of the product (e.g., "every 2 weeks", "daily", "monthly"). ' +
          'Affects switching study duration and design.',
      },
    },
    required: ['dosingFrequency'],
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
    'considerations. A missing or unknown market is refused; patent dates are not read. Use when the user ' +
    'asks about biosimilar patent strategy, BPCIA patent dance, biologics exclusivity, freedom-to-operate, ' +
    'or launch-at-risk scenarios. ' + DETERMINISTIC_NOTE,
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
          'Known patent expiry dates for the reference product.' + NOT_READ + ' Object with optional keys: ' +
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
          '(e.g., "first interchangeable approved", "multiple biosimilars on market").' + NOT_READ,
      },
      market: {
        type: 'string',
        enum: ['US', 'EU', 'both'],
        description:
          'Target market for the biosimilar. "US" returns BPCIA-specific analysis, ' +
          '"EU" returns EU-specific analysis, "both" returns comprehensive analysis.',
      },
    },
    required: ['referenceProductName', 'market'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. assess_biosimilar_cmc
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_BIOSIMILAR_CMC: AnaTool = {
  name: 'assess_biosimilar_cmc',
  description:
    'Assess the CMC (Chemistry, Manufacturing, and Controls) development strategy for a biosimilar ' +
    'product. Returns: reverse-engineering strategy for reference product characterization (8 steps), ' +
    'expression system guidance (CHO, E. coli, yeast, insect, HEK293), process development (cell line, upstream with glycosylation tuning, ' +
    'downstream purification, formulation), formulation matching (same excipients preferred, different ' +
    'acceptable with justification), container closure (vial vs. PFS vs. autoinjector), specifications ' +
    'relative to the reference product, manufacturing comparability, and biosimilar quality target ' +
    'product profile (QTPP) elements. A missing or unknown input is refused. Use for biosimilar ' +
    'manufacturing, expression system selection, process or formulation development, or the quality target ' +
    'product profile for a biosimilar. ' + DETERMINISTIC_NOTE,
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
