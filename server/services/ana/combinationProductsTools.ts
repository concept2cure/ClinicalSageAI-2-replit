/**
 * Combination Products & Device-Constituent tools — exposes the deterministic
 * knowledge engines in
 * `server/services/combination-products/combination-products-knowledge` to AnA
 * as first-class, selectable tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
 *
 * Tools:
 *   determine_primary_mode_of_action     — PMOA → lead FDA Center (21 CFR 3.2(m)/3.4)
 *   classify_combination_product         — 21 CFR 3.2(e) category + framework
 *   plan_combination_cgmp                — 21 CFR Part 4 streamlined cGMP model
 *   design_human_factors_study           — HF/UE plan (FDA 2016, IEC 62366-1)
 *   assess_device_constituent_controls   — design controls (820.30 / QMSR)
 *   select_combination_submission_pathway— NDA/BLA vs 510(k)/PMA/De Novo + EU Art. 117
 *
 * @module server/services/ana/combinationProductsTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned numbers and regulatory citations verbatim. Do NOT recompute, ' +
  'round differently, or substitute your own regulatory interpretation — a fabricated ' +
  'or misattributed regulatory citation in a generic drug submission is a critical defect.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. determine_primary_mode_of_action
// ─────────────────────────────────────────────────────────────────────────────

export const DETERMINE_PRIMARY_MODE_OF_ACTION: AnaTool = {
  name: 'determine_primary_mode_of_action',
  description:
    'Determine the Primary Mode of Action (PMOA) of a combination product and the resulting ' +
    'assigned lead FDA Center (CDER / CBER / CDRH), implementing the 21 CFR 3.2(m) mode-of-action ' +
    'construct, the 21 CFR 3.4(a) PMOA rule, and the 21 CFR 3.4(b) two-step assignment algorithm ' +
    'used when the PMOA cannot be determined with reasonable certainty. Returns the PMOA ' +
    'constituent type, the lead Center, a flag indicating whether the assignment-algorithm ' +
    'fallback was used, a stepwise rationale, per-constituent modes of action, a recommendation ' +
    'on whether to file a Request for Designation (RFD, 21 CFR 3.5/3.7), and citations ' +
    '(21 CFR 3.2(m), 21 CFR 3.4, 21 USC 353(g), FDA OCP Guidance Jan 2017). Use when the user ' +
    'needs to know which FDA Center will lead review of a drug-device, biologic-device, or ' +
    'drug-biologic combination product, or how PMOA is determined. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      productDescription: {
        type: 'string',
        description: 'Plain-language description of the combination product (optional, recorded in the rationale).',
      },
      constituents: {
        type: 'array',
        description:
          'All constituent parts of the combination product. Each constituent must declare its ' +
          'regulated-article type, and ideally which one provides the primary therapeutic effect.',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['drug', 'device', 'biologic'],
              description: 'The underlying regulated-article type of this constituent.',
            },
            providesPrimaryTherapeuticEffect: {
              type: 'boolean',
              description:
                'Whether THIS constituent provides the product’s primary therapeutic action. ' +
                'Exactly one constituent should be flagged true; otherwise the 21 CFR 3.4(b) ' +
                'assignment algorithm is used.',
            },
            modeOfActionDescription: {
              type: 'string',
              description: 'Free-text description of the constituent’s mechanism (recorded, not parsed).',
            },
          },
          required: ['type'],
        },
      },
      assertedPmoaType: {
        type: 'string',
        enum: ['drug', 'device', 'biologic'],
        description:
          'Optional explicit assertion of which constituent type provides the PMOA. If provided, ' +
          'it is accepted as the basis for assignment (high confidence).',
      },
      centerForSimilarQuestions: {
        type: 'string',
        enum: ['CDER', 'CBER', 'CDRH'],
        description:
          'For the 21 CFR 3.4(b)(1) fallback: the Center that already regulates other combination ' +
          'products presenting similar safety/effectiveness questions, if known.',
      },
    },
    required: ['constituents'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. classify_combination_product
// ─────────────────────────────────────────────────────────────────────────────

export const CLASSIFY_COMBINATION_PRODUCT: AnaTool = {
  name: 'classify_combination_product',
  description:
    'Classify a product into one of the four 21 CFR 3.2(e) combination-product categories — ' +
    'single-entity (3.2(e)(1)), co-packaged (3.2(e)(2)), cross-labeled with an approved product ' +
    '(3.2(e)(3)), or cross-labeled with an investigational product (3.2(e)(4)) — or determine that ' +
    'it is not a combination product at all. Returns the category, the exact 21 CFR 3.2(e) ' +
    'subparagraph, whether it meets the combination-product definition, the resulting regulatory ' +
    'framework (single vs separate marketing applications; lead-Center review), worked examples, ' +
    'rationale, and citations (21 CFR 3.2(e), FDA OCP Guidance Jan 2017). Use when the user needs ' +
    'to know which combination-product category applies, whether their product is a combination ' +
    'product, or how the category affects the application structure. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      constituentTypes: {
        type: 'array',
        items: { type: 'string', enum: ['drug', 'device', 'biologic'] },
        description: 'The regulated-article types present in the product (e.g., ["drug", "device"]).',
      },
      relationship: {
        type: 'string',
        enum: ['physically-combined', 'co-packaged', 'separately-marketed'],
        description:
          'The physical/packaging relationship: "physically-combined" → single entity; ' +
          '"co-packaged" → separate products in one package/kit; "separately-marketed" → marketed ' +
          'separately but potentially cross-labeled.',
      },
      crossLabeled: {
        type: 'boolean',
        description:
          'For separately-marketed products: whether the labeling of one product specifically ' +
          'references and requires use with the other. Required to meet 21 CFR 3.2(e)(3)/(4).',
      },
      otherProductInvestigational: {
        type: 'boolean',
        description:
          'Whether the cross-referenced other product is investigational (selects 3.2(e)(4) over 3.2(e)(3)).',
      },
      productDescription: {
        type: 'string',
        description: 'Optional product description (recorded).',
      },
    },
    required: ['constituentTypes', 'relationship'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. plan_combination_cgmp
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_COMBINATION_CGMP: AnaTool = {
  name: 'plan_combination_cgmp',
  description:
    'Plan the cGMP operating model for a combination product under 21 CFR Part 4, using the ' +
    'streamlined approach (21 CFR 4.4): choose a single base quality system — drug cGMP ' +
    '(21 CFR 210/211) or device QS (21 CFR 820) — and additionally satisfy the specific ' +
    '"called-out" provisions of the other system. Returns whether Part 4 applies, the recommended ' +
    'base, the exact called-out provisions (for a drug base: 820.20, 820.30, 820.50, 820.100, ' +
    '820.170, 820.200; for a device base: 211.84, 211.103, 211.132, 211.137, 211.165, 211.166, ' +
    '211.167, 211.170), postmarketing safety-reporting requirements (Part 4 Subpart B), the QMSR ' +
    '(ISO 13485, effective 2026-02-02) mapping note, rationale, and citations. Use when the user ' +
    'needs to design the quality-system / cGMP compliance strategy for a combination product. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      constituentTypes: {
        type: 'array',
        items: { type: 'string', enum: ['drug', 'device', 'biologic'] },
        description: 'The regulated-article types present in the combination product.',
      },
      category: {
        type: 'string',
        enum: [
          'single-entity',
          'co-packaged',
          'cross-labeled',
          'cross-labeled-investigational',
          'not-a-combination-product',
        ],
        description: 'The 21 CFR 3.2(e) category (from classify_combination_product).',
      },
      singleSetOfOperations: {
        type: 'boolean',
        description:
          'Whether the constituents are manufactured under a single set of operations / single ' +
          'quality system. The streamlined approach is intended for co-located/single-system manufacture.',
      },
      preferredBase: {
        type: 'string',
        enum: ['drug-cGMP-base', 'device-QS-base'],
        description:
          'Preferred base quality system if the manufacturer already operates a mature drug or device ' +
          'system. Validated against the constituents present.',
      },
      hasSterileDrugConstituent: {
        type: 'boolean',
        description: 'Whether any drug constituent purports to be sterile (drives the 211.167 called-out provision).',
      },
      hasOtcDrugConstituent: {
        type: 'boolean',
        description: 'Whether any drug constituent is an OTC product (drives the 211.132 tamper-evident provision).',
      },
    },
    required: ['constituentTypes', 'category'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. design_human_factors_study
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_HUMAN_FACTORS_STUDY: AnaTool = {
  name: 'design_human_factors_study',
  description:
    'Design a human factors / usability engineering plan for the device constituent of a ' +
    'combination product per the FDA HF Guidance (Feb 2016), IEC 62366-1:2015, and ISO 14971:2019. ' +
    'Returns the minimum participants per distinct intended user group (≥ 15), the distinct user-group ' +
    'count, the total summative sample size, the ordered usability-engineering program steps, the ' +
    'required formative and summative (validation) studies with timing, critical-task handling, the ' +
    'use-related risk analysis (URRA) requirements, whether a full summative validation is required, ' +
    'rationale, and citations. Use when the user needs to plan usability/human-factors studies, ' +
    'determine HF sample size, identify critical tasks, or structure a summative validation study ' +
    'for a delivery device (autoinjector, prefilled syringe, on-body injector, inhaler, pump). ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      deviceConstituentDescription: {
        type: 'string',
        description: 'Description of the device constituent / delivery system (e.g., "autoinjector").',
      },
      userGroups: {
        type: 'array',
        description:
          'Distinct user groups. Each intended user group requires its own summative cohort of ≥ 15.',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the user group (e.g., "patient", "caregiver", "nurse").',
            },
            intendedUser: {
              type: 'boolean',
              description: 'Whether this group is an intended user of the product.',
            },
          },
          required: ['name', 'intendedUser'],
        },
      },
      useEnvironment: {
        type: 'string',
        enum: ['home', 'clinical', 'emergency', 'transit', 'mixed'],
        description:
          'Use environment, which affects use scenarios and the realism required of the validation environment.',
      },
      highRiskDelivery: {
        type: 'boolean',
        description:
          'Whether the product is a high-risk delivery system where use errors can cause serious harm ' +
          '(autoinjector, infusion pump, on-body injector). Drives critical-task emphasis.',
      },
      knownCriticalTasks: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Pre-identified critical tasks (tasks whose failure could cause serious harm). If omitted, ' +
          'the engine notes that the URRA must derive them.',
      },
      identicalToValidatedPredicate: {
        type: 'boolean',
        description:
          'Whether the user interface is identical to a previously validated predicate (may support ' +
          'leveraging prior HF data / a threshold analysis in lieu of a new summative study).',
      },
    },
    required: ['deviceConstituentDescription', 'userGroups'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. assess_device_constituent_controls
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_DEVICE_CONSTITUENT_CONTROLS: AnaTool = {
  name: 'assess_device_constituent_controls',
  description:
    'Lay out the device-constituent design controls required under 21 CFR 820.30 (and the equivalent ' +
    'ISO 13485:2016 §7.3 under the QMSR), tailored to the device-constituent characteristics. Returns ' +
    'the full 820.30 design-control program (planning, design inputs/outputs, review, verification, ' +
    'validation, transfer, changes, Design History File), representative design inputs and outputs, ' +
    'verification and validation activities, essential performance requirements, the DHF contents, ' +
    'rationale, and citations (21 CFR 820.30, 21 CFR 4.4, QMSR, ISO 13485:2016, ISO 14971:2019). ' +
    'Use when the user needs to structure the design-controls / DHF / V&V package for the device ' +
    'part of a drug-device or biologic-device combination product. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      deviceConstituentDescription: {
        type: 'string',
        description: 'Description of the device constituent (e.g., "prefilled syringe", "on-body injector").',
      },
      higherRisk: {
        type: 'boolean',
        description:
          'Whether the device constituent is higher-risk (Class II/III analog), increasing rigor and ' +
          'the likelihood that clinical/simulated-use data support validation.',
      },
      doseDelivering: {
        type: 'boolean',
        description: 'Whether the device delivers a defined dose (drives dose-accuracy essential performance and V&V).',
      },
      sterilePath: {
        type: 'boolean',
        description: 'Whether the device or its fluid path must be sterile (drives container-closure integrity / sterility V&V).',
      },
      containsSoftware: {
        type: 'boolean',
        description: 'Whether software is part of the device constituent (drives software V&V per IEC 62304 and cybersecurity).',
      },
      declaredEssentialPerformance: {
        type: 'array',
        items: { type: 'string' },
        description: 'Known/declared essential performance requirements (recorded and supplemented by the engine).',
      },
    },
    required: ['deviceConstituentDescription'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. select_combination_submission_pathway
// ─────────────────────────────────────────────────────────────────────────────

export const SELECT_COMBINATION_SUBMISSION_PATHWAY: AnaTool = {
  name: 'select_combination_submission_pathway',
  description:
    'Select the marketing submission pathway for a combination product: the US lead application ' +
    '(NDA or BLA when a drug/biologic leads; 510(k), PMA, or De Novo when a device leads), whether a ' +
    'single application or separate applications per constituent are used, the US pathway for the ' +
    'non-lead device constituent (intercenter consultation within the lead application), and EU MDR ' +
    'Article 117 handling (notified-body opinion on the device part of an integral drug-device ' +
    'combination authorised as a medicinal product, plus Rule 14 classification). Returns the lead ' +
    'application type, application structure, device-constituent US pathway, EU Article 117 steps, ' +
    'rationale, outstanding considerations, and citations (21 CFR 3.4, 21 CFR 3.2(e), FDA OCP Guidance ' +
    'Jan 2017, EU MDR Art. 117, EU MDR Rule 14). Use when the user needs to choose between NDA/BLA ' +
    'and device pathways, decide single vs separate applications, or plan EU MDR Article 117 ' +
    'compliance. Run determine_primary_mode_of_action and classify_combination_product first. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      leadCenter: {
        type: 'string',
        enum: ['CDER', 'CBER', 'CDRH'],
        description: 'The lead FDA Center (from determine_primary_mode_of_action).',
      },
      category: {
        type: 'string',
        enum: [
          'single-entity',
          'co-packaged',
          'cross-labeled',
          'cross-labeled-investigational',
          'not-a-combination-product',
        ],
        description: 'The 21 CFR 3.2(e) category (from classify_combination_product).',
      },
      constituentTypes: {
        type: 'array',
        items: { type: 'string', enum: ['drug', 'device', 'biologic'] },
        description: 'The regulated-article types present in the combination product.',
      },
      preferSingleApplication: {
        type: 'boolean',
        description:
          'Whether the sponsor prefers (or the structure requires) a single marketing application vs ' +
          'separate applications per constituent. Cross-labeled products commonly use separate applications.',
      },
      deviceRiskPathway: {
        type: 'string',
        enum: ['exempt', 'moderate', 'novel-low', 'high'],
        description:
          'When a device leads (CDRH): "exempt" → 510(k)-exempt; "moderate" → 510(k); "novel-low" → ' +
          'De Novo; "high" → PMA.',
      },
      euInScope: {
        type: 'boolean',
        description: 'Whether an EU marketing-authorisation route is in scope (drives EU MDR Article 117 assessment).',
      },
      euIntegralDrugDevice: {
        type: 'boolean',
        description:
          'For the EU: whether the drug-device combination is INTEGRAL (single integrated product, e.g. ' +
          'prefilled syringe). Integral DDCs with a medicinal principal action go through a medicinal MAA ' +
          'with an Article 117 notified-body opinion.',
      },
    },
    required: ['leadCenter', 'category', 'constituentTypes'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Collected array — spread into ALL_ANA_TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/** Combination-products & device-constituent tools, spread into ALL_ANA_TOOLS. */
export const COMBINATION_PRODUCTS_TOOLS: AnaTool[] = [
  DETERMINE_PRIMARY_MODE_OF_ACTION,
  CLASSIFY_COMBINATION_PRODUCT,
  PLAN_COMBINATION_CGMP,
  DESIGN_HUMAN_FACTORS_STUDY,
  ASSESS_DEVICE_CONSTITUENT_CONTROLS,
  SELECT_COMBINATION_SUBMISSION_PATHWAY,
];
