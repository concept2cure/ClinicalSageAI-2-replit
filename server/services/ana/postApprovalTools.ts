/**
 * Post-Approval Lifecycle Management (ICH Q12) tools — exposes the deterministic
 * post-approval knowledge base to AnA as first-class, selectable tools.
 *
 * Each tool wraps a pure function grounded in ICH Q12 (established conditions,
 * PACMP, PLCM), 21 CFR 314.70, the FDA "Changes to an Approved NDA or ANDA"
 * guidance (PAS / CBE-30 / CBE-0 / Annual Report), FDA comparability protocols,
 * and the EU variations framework (Type IA/IB/II). NO LLM estimation, NO network
 * calls — results are deterministic and submission-defensible.
 *
 * Tools:
 *   classify_post_approval_change     — US reporting category + EU variation type
 *   assess_established_conditions     — ICH Q12 ECs vs supportive information
 *   design_pacmp                      — Post-Approval Change Management Protocol
 *   plan_annual_report                — annual report / PLCM content
 *   assess_postapproval_comparability — comparability for a manufacturing change
 *   plan_lifecycle_management         — integrated ICH Q12 lifecycle plan
 *
 * Handlers live in AnaToolExecutor.ts (registerToolHandler) and dynamic-import
 * the matching post-approval-knowledge module.
 *
 * @module server/services/ana/postApprovalTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned reporting categories and regulatory citations verbatim — do NOT ' +
  'reinterpret citations, re-grade the change category, or substitute your own regulatory ' +
  'judgment. If a parameter is missing or invalid, relay the validation error and ask the user for the correct value.';

const CHANGE_AREA_ENUM = [
  'manufacturing_site', 'manufacturing_process', 'scale', 'equipment',
  'composition_excipient', 'specification', 'analytical_method', 'container_closure',
  'stability_shelf_life', 'drug_substance_source', 'drug_substance_process',
  'starting_material', 'labeling_cmc', 'facility_administrative',
];

const MODALITY_ENUM = ['small_molecule', 'biologic', 'vaccine', 'cell_gene_therapy', 'peptide_oligonucleotide'];
const MAGNITUDE_ENUM = ['minor', 'moderate', 'major'];
const US_CATEGORY_ENUM = ['PAS', 'CBE-30', 'CBE-0', 'Annual Report'];
const DEV_APPROACH_ENUM = ['minimal', 'enhanced'];
const DOSSIER_ELEMENT_TYPE_ENUM = [
  'drug_substance_synthesis_step', 'drug_substance_specification', 'manufacturing_process_step',
  'process_parameter', 'in_process_control', 'drug_product_composition', 'drug_product_specification',
  'analytical_procedure', 'container_closure', 'control_strategy_element', 'shelf_life', 'facility_site',
];

const CHANGE_RISK_SCHEMA = {
  type: 'object',
  description: 'Optional risk qualifiers that refine the change classification.',
  properties: {
    affectsCqa: { type: 'boolean', description: 'Does the change affect a critical quality attribute?' },
    affectsControlStrategy: { type: 'boolean', description: 'Does the change affect the control strategy?' },
    sterileProcess: { type: 'boolean', description: 'Does the change touch a sterile process?' },
    withinDesignSpace: { type: 'boolean', description: 'Is the change within an approved design space (ICH Q8)?' },
    priorKnowledge: { type: 'boolean', description: 'Is there substantial prior knowledge supporting the change?' },
    magnitude: { type: 'string', enum: MAGNITUDE_ENUM, description: 'Caller-supplied change magnitude.' },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Classify Post-Approval Change
// ─────────────────────────────────────────────────────────────────────────────

export const CLASSIFY_POST_APPROVAL_CHANGE: AnaTool = {
  name: 'classify_post_approval_change',
  description:
    'Classify a CMC post-approval change into its US reporting category (Prior ' +
    'Approval Supplement / CBE-30 / CBE-0 / Annual Report per 21 CFR 314.70) and ' +
    'its EU variation type (IA / IAIN / IB / II / Extension), with the applicable ' +
    'SUPAC level where relevant and an assessment of change risk to product ' +
    'quality. Returns the reporting category for each region with the governing ' +
    'regulation and distribution rule, whether comparability is likely required, ' +
    'recommended ICH Q12 tools, and citations. Cites 21 CFR 314.70, the FDA ' +
    '"Changes to an Approved NDA or ANDA" guidance, SUPAC guidances, and the EU ' +
    'Variations Regulation (EC) No 1234/2008. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      changeArea: { type: 'string', enum: CHANGE_AREA_ENUM, description: 'The area of manufacturing/quality the change affects.' },
      description: { type: 'string', description: 'Free-text description of the change (context).' },
      modality: { type: 'string', enum: MODALITY_ENUM, description: 'Product modality — affects the default reporting category.' },
      magnitude: { type: 'string', enum: MAGNITUDE_ENUM, description: 'Magnitude qualifier for the change.' },
      solidOralProduct: { type: 'boolean', description: 'Whether this is a solid oral dosage form (drives SUPAC applicability).' },
      modifiedRelease: { type: 'boolean', description: 'Whether the product is modified-release (SUPAC-MR).' },
      risk: CHANGE_RISK_SCHEMA,
      biologicLicense: { type: 'boolean', description: 'Whether the product is licensed under a BLA (affects reporting rules).' },
    },
    required: ['changeArea'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Assess Established Conditions
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_ESTABLISHED_CONDITIONS: AnaTool = {
  name: 'assess_established_conditions',
  description:
    'Apply ICH Q12 established conditions (ECs) to a set of dossier elements: ' +
    'determine which elements are legally binding ECs (changes require a ' +
    'regulatory submission) versus supportive information, and the reporting ' +
    'category for changes to each. Accounts for the development approach (a ' +
    'minimal approach yields broader, parameter-level ECs; an enhanced/QbD ' +
    'approach with design space and robust control strategy yields fewer, ' +
    'performance-based ECs and reduced reporting). Returns a per-element ' +
    'classification with rationale and the EC-reduction benefit of the enhanced ' +
    'approach. Cites ICH Q12 (Sections on ECs) and ICH Q8/Q11. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      developmentApproach: { type: 'string', enum: DEV_APPROACH_ENUM, description: 'Development approach — "enhanced" = QbD (design space, enhanced control strategy).' },
      modality: { type: 'string', enum: MODALITY_ENUM, description: 'Product modality.' },
      elements: {
        type: 'array',
        description: 'Dossier elements to classify as established conditions vs supportive information.',
        items: {
          type: 'object',
          properties: {
            elementType: { type: 'string', enum: DOSSIER_ELEMENT_TYPE_ENUM, description: 'Type of dossier element.' },
            name: { type: 'string', description: 'Name/label of the element.' },
            parameterRange: { type: 'boolean', description: 'Is the element expressed as a parameter range rather than a fixed value?' },
            cqaImpact: { type: 'boolean', description: 'Does the element impact a critical quality attribute?' },
            controlledDownstream: { type: 'boolean', description: 'Is the element otherwise controlled by a downstream test?' },
            withinDesignSpace: { type: 'boolean', description: 'Is the element governed within an approved design space?' },
          },
          required: ['elementType', 'name'],
        },
      },
    },
    required: ['elements'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Design PACMP
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_PACMP: AnaTool = {
  name: 'design_pacmp',
  description:
    'Design a Post-Approval Change Management Protocol (PACMP, ICH Q12) — or the ' +
    'FDA Comparability Protocol equivalent — for a planned manufacturing change. ' +
    'Returns the two-step structure (the protocol describing the planned change, ' +
    'tests/studies, and acceptance criteria, submitted and approved first; then ' +
    'execution and a reduced-category notification), a test plan with attributes / ' +
    'tests / acceptance criteria / CQA flags, a stability commitment where ' +
    'applicable, and the proposed reduced reporting category after successful ' +
    'execution. Cites ICH Q12 (PACMP) and the FDA Comparability Protocols ' +
    'guidance. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      plannedChangeArea: { type: 'string', enum: CHANGE_AREA_ENUM, description: 'The area of the planned change.' },
      plannedChangeDescription: { type: 'string', description: 'Description of the planned change.' },
      modality: { type: 'string', enum: MODALITY_ENUM, description: 'Product modality.' },
      currentCategoryIfNoProtocol: { type: 'string', enum: US_CATEGORY_ENUM, description: 'The US reporting category that would apply WITHOUT a protocol.' },
      proposedReducedCategory: { type: 'string', enum: US_CATEGORY_ENUM, description: 'The proposed reduced US reporting category after protocol execution.' },
      tests: {
        type: 'array',
        description: 'Planned tests / studies and acceptance criteria.',
        items: {
          type: 'object',
          properties: {
            attribute: { type: 'string', description: 'Quality attribute being tested.' },
            test: { type: 'string', description: 'Test method.' },
            acceptanceCriterion: { type: 'string', description: 'Acceptance criterion.' },
            cqa: { type: 'boolean', description: 'Is this attribute a CQA?' },
          },
          required: ['attribute', 'test', 'acceptanceCriterion'],
        },
      },
      includeStability: { type: 'boolean', description: 'Whether a stability commitment should be included.' },
      risk: CHANGE_RISK_SCHEMA,
    },
    required: ['plannedChangeArea', 'plannedChangeDescription'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Plan Annual Report
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_ANNUAL_REPORT: AnaTool = {
  name: 'plan_annual_report',
  description:
    'Plan the CMC content of an annual report and, optionally, the ICH Q12 Product ' +
    'Lifecycle Management (PLCM) document. Classifies a set of implemented changes ' +
    'to determine which are annual-reportable (vs requiring a supplement), lays out ' +
    'the required annual-report sections (including stability protocol/commitment ' +
    'updates), and structures the PLCM document (established conditions, reporting ' +
    'categories, PACMPs, post-approval CMC commitments). Cites 21 CFR 314.70(d) ' +
    'and ICH Q12 (PLCM). ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      productName: { type: 'string', description: 'Product name (context).' },
      reportingPeriod: { type: 'string', description: 'Annual report reporting period (context).' },
      modality: { type: 'string', enum: MODALITY_ENUM, description: 'Product modality.' },
      changes: {
        type: 'array',
        description: 'Implemented changes to classify for annual-report inclusion.',
        items: {
          type: 'object',
          properties: {
            changeArea: { type: 'string', enum: CHANGE_AREA_ENUM, description: 'Area of the change.' },
            description: { type: 'string', description: 'Description of the change.' },
            assertedCategory: { type: 'string', enum: US_CATEGORY_ENUM, description: 'Category the sponsor asserts for the change.' },
            modality: { type: 'string', enum: MODALITY_ENUM, description: 'Modality for this change, if different.' },
            magnitude: { type: 'string', enum: MAGNITUDE_ENUM, description: 'Magnitude qualifier.' },
          },
          required: ['changeArea', 'description'],
        },
      },
      stabilityProtocolOngoing: { type: 'boolean', description: 'Whether a stability protocol/commitment is ongoing.' },
      includePlcmDocument: { type: 'boolean', description: 'Whether to include the ICH Q12 PLCM document structure.' },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. Assess Post-Approval Comparability
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_POSTAPPROVAL_COMPARABILITY: AnaTool = {
  name: 'assess_postapproval_comparability',
  description:
    'Assess the comparability exercise required for a post-approval manufacturing ' +
    'change. Determines whether comparability applies, the framework (ICH Q5E for ' +
    'biologics), and the extent — analytical only, analytical plus nonclinical, or ' +
    'analytical plus clinical — based on modality, change stage (upstream / ' +
    'downstream / formulation / analytical / fill-finish), CQA impact, analytical ' +
    'coverage, and available clinical data. Returns the recommended analytical and ' +
    'functional/biological comparability attributes and whether clinical bridging ' +
    'is needed. Cites ICH Q5E and the FDA comparability guidances. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      changeArea: { type: 'string', enum: CHANGE_AREA_ENUM, description: 'Area of the change.' },
      modality: { type: 'string', enum: MODALITY_ENUM, description: 'Product modality (biologics drive ICH Q5E comparability).' },
      changeDescription: { type: 'string', description: 'Description of the change.' },
      changeStage: { type: 'string', enum: ['upstream', 'downstream', 'formulation', 'analytical', 'fill_finish'], description: 'Stage of manufacturing the change affects.' },
      affectsCqa: { type: 'boolean', description: 'Does the change affect a critical quality attribute?' },
      analyticalCoverageComplete: { type: 'boolean', description: 'Is analytical characterization coverage complete?' },
      clinicalDataAvailable: { type: 'boolean', description: 'Is clinical data available to support comparability?' },
      risk: CHANGE_RISK_SCHEMA,
    },
    required: ['changeArea'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Plan Lifecycle Management
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_LIFECYCLE_MANAGEMENT: AnaTool = {
  name: 'plan_lifecycle_management',
  description:
    'Produce an integrated ICH Q12 lifecycle-management plan for a product: maps ' +
    'planned and historical changes to the appropriate ICH Q12 tool (established ' +
    'conditions, PACMP / comparability protocol, PLCM document, design space, ' +
    'annual-report category, or standard supplement/variation), recommends an ' +
    'established-conditions strategy by development approach, and frames the ' +
    'regulatory relationship across marketed regions (US / EU / global). Returns ' +
    'per-change tool recommendations with default US category and EU variation ' +
    'type. Cites ICH Q12 and ICH Q8-Q11. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      productName: { type: 'string', description: 'Product name (context).' },
      modality: { type: 'string', enum: MODALITY_ENUM, description: 'Product modality.' },
      developmentApproach: { type: 'string', enum: DEV_APPROACH_ENUM, description: 'Development approach (minimal vs enhanced/QbD).' },
      marketedRegions: {
        type: 'array',
        items: { type: 'string', enum: ['US', 'EU', 'global'] },
        description: 'Regions where the product is marketed.',
      },
      plannedChanges: {
        type: 'array',
        description: 'Planned future changes to map to ICH Q12 tools.',
        items: {
          type: 'object',
          properties: {
            changeArea: { type: 'string', enum: CHANGE_AREA_ENUM, description: 'Area of the planned change.' },
            description: { type: 'string', description: 'Description of the planned change.' },
            expectedFrequency: { type: 'string', enum: ['one_time', 'recurring', 'multiple_sites'], description: 'Expected frequency of the change.' },
            magnitude: { type: 'string', enum: MAGNITUDE_ENUM, description: 'Magnitude qualifier.' },
            risk: CHANGE_RISK_SCHEMA,
          },
          required: ['changeArea'],
        },
      },
      changeHistory: {
        type: 'array',
        description: 'Historical changes already implemented (context for the plan).',
        items: {
          type: 'object',
          properties: {
            changeArea: { type: 'string', enum: CHANGE_AREA_ENUM, description: 'Area of the historical change.' },
            description: { type: 'string', description: 'Description.' },
            reportedCategory: { type: 'string', enum: US_CATEGORY_ENUM, description: 'Category under which it was reported.' },
            yearImplemented: { type: 'number', description: 'Year implemented.' },
          },
          required: ['changeArea'],
        },
      },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Exported Array
// ─────────────────────────────────────────────────────────────────────────────

/** Post-approval lifecycle (ICH Q12) tools, spread into ALL_ANA_TOOLS. */
export const POST_APPROVAL_TOOLS: AnaTool[] = [
  CLASSIFY_POST_APPROVAL_CHANGE,
  ASSESS_ESTABLISHED_CONDITIONS,
  DESIGN_PACMP,
  PLAN_ANNUAL_REPORT,
  ASSESS_POSTAPPROVAL_COMPARABILITY,
  PLAN_LIFECYCLE_MANAGEMENT,
];
