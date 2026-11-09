/**
 * Regulatory Strategy tool definitions for AnA.
 *
 * Exposes six deterministic knowledge-base engines covering FDA expedited
 * program eligibility, FDA meeting planning, orphan drug designation,
 * 505 pathway selection, rolling submission assessment, and global
 * regulatory pathway comparison.
 *
 * Definitions only — handlers live in AnaToolExecutor.ts (registerToolHandler).
 * An omitted or null true/false input stays not_stated (inputStates in the
 * result) and is never read as true or false; a pathway or eligibility it could
 * change is null. A missing or malformed required value is refused by name or
 * field (Rule 2 S5d, 2026-11-09).
 *
 * @module server/services/ana/regulatoryStrategyTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE = 'Deterministic: no LLM, no network. Report the returned values verbatim; do not recompute or soften them.';

/** What an omitted or null true/false input means; a malformed one is refused by field. */
const UNDECIDED = ' Omitted or null stays not_stated, and a result it could change is null (see undecided).';
const NOT_READ = ' Not read: it does not change the result.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. ASSESS EXPEDITED PROGRAM
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_EXPEDITED_PROGRAM: AnaTool = {
  name: 'assess_expedited_program',
  description:
    'Assess FDA expedited program eligibility for a drug or biologic product. Evaluates all five ' +
    'FDA expedited programs: Fast Track Designation (FD&C Act §506(b), FDASIA 2012), Breakthrough ' +
    'Therapy Designation (FD&C Act §506(a), FDASIA 2012), Accelerated Approval (FD&C Act §506(c), ' +
    'FDORA 2022), Priority Review (PDUFA VII), and RMAT Designation (FD&C Act §506(g), 21st Century ' +
    'Cures Act 2016). Returns per-program eligibility with criteria, rationale, benefits, ' +
    'application timing and caveats (null, the criterion named, where one no input states decides ' +
    'it); a comparison matrix across all programs on 10 dimensions (statutory basis, condition ' +
    'requirement, evidence standard, product scope, key benefit, timing, FDA response timeline, ' +
    'rolling review, approval standard, historical approval rate); and strategic recommendations ' +
    'for selection and sequencing, with FDORA 2022 Accelerated Approval updates. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      indication: {
        type: 'string',
        enum: ['serious', 'life_threatening'],
        description:
          'Severity classification of the target condition. "serious": condition with substantial impact ' +
          'on day-to-day functioning. "life_threatening": condition where the likelihood of death is high ' +
          'unless the course of the disease is interrupted.',
      },
      unmetMedicalNeedDescription: {
        type: 'string',
        description:
          'Description of the unmet medical need. Explain why available therapies are inadequate ' +
          '(e.g., no approved therapy, available therapies have serious side effects, suboptimal efficacy).',
      },
      availableTherapyLandscape: {
        type: 'string',
        enum: ['no_approved_therapy', 'inadequate_existing_therapy', 'adequate_existing_therapy'],
        description:
          'Current therapy landscape. "no_approved_therapy": no FDA-approved treatment exists. ' +
          '"inadequate_existing_therapy": approved treatments exist but have significant limitations. ' +
          '"adequate_existing_therapy": satisfactory treatments are available.',
      },
      evidenceLevel: {
        type: 'string',
        enum: ['preclinical_only', 'early_clinical', 'phase2_data', 'phase3_data', 'post_marketing'],
        description:
          'Highest level of evidence available. Affects eligibility for Breakthrough Therapy (requires ' +
          'preliminary clinical evidence) and RMAT (requires preliminary clinical evidence).',
      },
      productType: {
        type: 'string',
        enum: [
          'small_molecule', 'biologic', 'cell_therapy', 'gene_therapy',
          'tissue_engineered', 'combination_product', 'vaccine', 'biosimilar', 'diagnostic',
        ],
        description:
          'Product type. Affects RMAT eligibility (limited to regenerative medicine therapies: ' +
          'cell_therapy, gene_therapy, tissue_engineered; a combination_product is null, since whether it uses one is ' +
          'not an input). A biosimilar is not eligible for Fast Track, Breakthrough Therapy, Accelerated Approval or ' +
          'Priority Review: it has no clinically meaningful difference from its approved reference product.',
      },
    },
    required: ['indication', 'unmetMedicalNeedDescription', 'availableTherapyLandscape', 'evidenceLevel', 'productType'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. PLAN FDA MEETING
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_FDA_MEETING: AnaTool = {
  name: 'plan_fda_meeting',
  description:
    'Plan an FDA meeting by selecting the correct meeting type, preparing the meeting request ' +
    'package, and structuring the briefing document. Classifies the meeting as Type A (immediately ' +
    'necessary — 30-day response), Type B (pre-IND, EOP1, EOP2, pre-NDA/BLA — 75-day response), ' +
    'Type C (other — 75-day response), Type D (formal dispute resolution), or Pre-Submission ' +
    '(505(b)(2)/ANDA-specific). Returns: (1) meeting type with description, timeline and regulatory ' +
    'basis; (2) request package components, submission timing and format requirements; (3) briefing ' +
    'document structure with 9 sections (objectives, product background, disease background, ' +
    'nonclinical summary, clinical summary, CMC summary, regulatory strategy, questions, ' +
    'appendices); (4) timing recommendations for the meeting purpose and development phase; (5) ' +
    'question framing tips; (6) PDUFA VII performance goals; (7) practical advice for meeting ' +
    'conduct. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      developmentPhase: {
        type: 'string',
        enum: ['pre_ind', 'phase1', 'phase2', 'phase3', 'pre_nda', 'post_approval'],
        description: 'Current development phase of the product.',
      },
      purpose: {
        type: 'string',
        enum: [
          'pre_ind', 'eop1', 'eop2', 'pre_phase3', 'pre_nda_bla',
          'type_a_urgent', 'dispute_resolution',
          'pre_submission_505b2', 'pre_submission_anda',
          'risk_evaluation', 'pediatric', 'other',
        ],
        description:
          'Meeting purpose. Determines the meeting type classification. ' +
          '"pre_ind": discuss IND content. "eop1": end of Phase 1. "eop2": end of Phase 2 / pre-Phase 3 (most important). ' +
          '"pre_nda_bla": discuss NDA/BLA submission. "type_a_urgent": clinical hold, SPA dispute, CRL follow-up. ' +
          '"dispute_resolution": formal scientific dispute. "pre_submission_505b2/anda": product-specific pre-submission.',
      },
      productType: {
        type: 'string',
        enum: [
          'small_molecule', 'biologic', 'cell_therapy', 'gene_therapy',
          'tissue_engineered', 'combination_product', 'vaccine', 'biosimilar', 'diagnostic',
        ],
        description: 'Product type. Affects practical advice (e.g., CBER vs. CDER meeting procedures).',
      },
      questionsToDiscuss: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of key questions or topics the sponsor intends to discuss at the meeting.' + NOT_READ,
      },
    },
    required: ['developmentPhase', 'purpose', 'productType'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. ASSESS ORPHAN DESIGNATION
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_ORPHAN_DESIGNATION: AnaTool = {
  name: 'assess_orphan_designation',
  description:
    'Assess FDA and EMA orphan drug designation eligibility based on disease prevalence, clinical ' +
    'rationale, and existing therapy landscape. Returns: (1) FDA eligibility assessment (Orphan ' +
    'Drug Act, 21 CFR 316; <200,000 US prevalence threshold); (2) EMA eligibility assessment ' +
    '(Regulation (EC) No 141/2000; not more than 5 per 10,000 EU prevalence + life-threatening or ' +
    'chronically debilitating + no satisfactory treatment OR significant benefit); (3) ' +
    'benefits comparison across 7 dimensions (market exclusivity, tax credits, fee waivers, ' +
    'protocol assistance, regulatory pathway, grants, pediatric requirements); (4) common pitfalls ' +
    'in orphan designation applications; (5) success factors; (6) prevalence calculation ' +
    'methodology including FDA orphan subset doctrine and acceptable data sources. A prevalence ' +
    'with no stated source, or a criterion no input states, leaves eligibility null. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      diseasePrevalenceUS: {
        type: ['number', 'null'],
        description:
          'Number of persons affected by the disease in the United States. Must be <200,000 for FDA ' +
          'orphan eligibility. Null if unknown.',
      },
      diseasePrevalenceUSSource: {
        type: 'string',
        description:
          'Where the US prevalence comes from, as the user stated it (a publication, registry or database). ' +
          'Without it the prevalence is not used and FDA eligibility is null. Do not supply one the user did not give.',
      },
      diseasePrevalenceEU: {
        type: ['number', 'null'],
        description:
          'Disease prevalence in the EU expressed as number per 10,000 persons. Must not exceed 5 per 10,000 ' +
          'for EMA orphan eligibility. Null if unknown.',
      },
      diseasePrevalenceEUSource: {
        type: 'string',
        description:
          'Where the EU prevalence comes from, as the user stated it. Without it the prevalence is not used ' +
          'and EMA eligibility is null. Do not supply one the user did not give.',
      },
      clinicalRationale: {
        type: 'string',
        description:
          'Clinical rationale for the product. For EMA: if existing treatments are available, explain the ' +
          '"significant benefit" the product would provide over existing therapy. Reported, not read as a finding of significant benefit.',
      },
      productType: {
        type: 'string',
        enum: [
          'small_molecule', 'biologic', 'cell_therapy', 'gene_therapy',
          'tissue_engineered', 'combination_product', 'vaccine', 'biosimilar', 'diagnostic',
        ],
        description:
          'Product type. For a vaccine or diagnostic the FDA count is persons dosed per year, which no input carries, ' +
          'so FDA eligibility is null.',
      },
      existingApprovedTherapies: {
        type: 'number',
        description:
          'Number of existing approved therapies for the target indication, a whole number. Affects EMA "significant benefit" requirement. ' +
          'Omitted or null: EMA eligibility is null.',
      },
      isSerious: {
        type: 'boolean',
        description: 'Is the disease serious?' + UNDECIDED,
      },
      isLifeThreatening: {
        type: 'boolean',
        description: 'Is the disease life-threatening?' + UNDECIDED,
      },
      isDebilitating: {
        type: 'boolean',
        description:
          'Is the disease chronically debilitating (the EU prevalence limb: life-threatening or chronically debilitating)?' + UNDECIDED,
      },
    },
    required: ['diseasePrevalenceUS', 'diseasePrevalenceEU', 'productType'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. SELECT 505 PATHWAY
// ─────────────────────────────────────────────────────────────────────────────

export const SELECT_505_PATHWAY: AnaTool = {
  name: 'select_505_pathway',
  description:
    'Select the optimal FDA regulatory pathway under FD&C Act Section 505: 505(b)(1) Full NDA, ' +
    '505(b)(2) NDA with reliance on prior findings, 505(j) ANDA (generic), or Suitability Petition ' +
    '(21 CFR 314.93). Applies a decision tree based on active ingredient novelty (NME vs. known), ' +
    'dosage form changes, route changes, indication changes, new combinations, formulation ' +
    'innovations, and availability of a reference listed drug (RLD); while an unstated fact could ' +
    'change the pathway, it is null and the facts are named. Returns: (1) recommended pathway with ' +
    'legal basis, required studies, advantages, disadvantages and typical timeline; (2) alternative ' +
    'pathways; (3) decision tree rationale; (4) patent and exclusivity considerations (NCE 5-year, ' +
    'new clinical investigation 3-year, OTC 3-year, pediatric 6-month add-on, orphan 7-year, ' +
    '180-day generic, patent term extension); (5) Paragraph I-IV certification types. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      activeIngredient: {
        type: 'string',
        enum: ['new_molecular_entity', 'known'],
        description:
          'Is the active ingredient a new molecular entity (NME) or a known drug substance with prior FDA approval?',
      },
      dosageFormChange: {
        type: 'boolean',
        description: 'Does the product involve a change in dosage form compared to the RLD (e.g., tablet to capsule, oral to injectable)?' + UNDECIDED,
      },
      routeChange: {
        type: 'boolean',
        description: 'Does the product involve a change in route of administration compared to the RLD?' + UNDECIDED,
      },
      indicationChange: {
        type: 'boolean',
        description: 'Does the product seek a new indication not covered by the RLD labeling?' + UNDECIDED,
      },
      newCombination: {
        type: 'boolean',
        description: 'Is the product a new fixed-dose combination of known active ingredients?' + UNDECIDED,
      },
      formulationInnovation: {
        type: 'boolean',
        description:
          'Does the product involve a formulation innovation (e.g., extended-release, novel delivery system, ' +
          'abuse-deterrent formulation)?' + UNDECIDED,
      },
      availableRLD: {
        type: 'boolean',
        description: 'Is a reference listed drug (RLD) available in the FDA Orange Book for the active ingredient?' + UNDECIDED,
      },
    },
    required: ['activeIngredient'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. ASSESS ROLLING SUBMISSION
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_ROLLING_SUBMISSION: AnaTool = {
  name: 'assess_rolling_submission',
  description:
    'Assess rolling submission eligibility and plan the submission schedule for an NDA/BLA ' +
    'application. Rolling review is available only to products with Fast Track, Breakthrough ' +
    'Therapy, or RMAT designation (FD&C Act §506(b)(2)). Returns: (1) eligibility assessment with ' +
    'rationale; (2) submission schedule template organized in 5 phases (nonclinical → CMC → ' +
    'clinical pharmacology → pivotal clinical → regional/administrative); (3) recommended CTD ' +
    'module submission order; (4) pre-submission checklist (12 items including eCTD preparation, ' +
    'FDA coordination, and pre-NDA/BLA meeting planning); (5) filing review clock considerations ' +
    '(PDUFA date calculation, refuse-to-file risk); (6) manufacturing site readiness requirements ' +
    'for pre-approval inspection; (7) practical tips for managing a rolling submission. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      expeditedDesignationStatus: {
        type: 'object',
        properties: {
          fastTrack: {
            type: 'boolean',
            description: 'Does the product have Fast Track designation?' + UNDECIDED,
          },
          breakthroughTherapy: {
            type: 'boolean',
            description: 'Does the product have Breakthrough Therapy designation?' + UNDECIDED,
          },
          rmat: {
            type: 'boolean',
            description: 'Does the product have RMAT designation?' + UNDECIDED,
          },
        },
        description: 'Current expedited designation status of the product. Eligible when one is true; null while none is true and one is not stated.',
      },
      productType: {
        type: 'string',
        enum: [
          'small_molecule', 'biologic', 'cell_therapy', 'gene_therapy',
          'tissue_engineered', 'combination_product', 'vaccine', 'biosimilar', 'diagnostic',
        ],
        description: 'Product type.' + NOT_READ,
      },
      estimatedModuleCompletionDates: {
        type: 'object',
        properties: {
          module1_regional: {
            type: 'string',
            description: 'Estimated completion date for Module 1 (Regional Administrative Information).',
          },
          module2_summaries: {
            type: 'string',
            description: 'Estimated completion date for Module 2 (Summaries and Overviews).',
          },
          module3_quality: {
            type: 'string',
            description: 'Estimated completion date for Module 3 (Quality/CMC Data).',
          },
          module4_nonclinical: {
            type: 'string',
            description: 'Estimated completion date for Module 4 (Nonclinical Study Reports).',
          },
          module5_clinical: {
            type: 'string',
            description: 'Estimated completion date for Module 5 (Clinical Study Reports).',
          },
        },
        description: 'Estimated completion dates for each CTD module (ISO 8601 format preferred). All fields optional.' + NOT_READ,
      },
    },
    required: ['expeditedDesignationStatus'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. COMPARE GLOBAL PATHWAYS
// ─────────────────────────────────────────────────────────────────────────────

export const COMPARE_GLOBAL_PATHWAYS: AnaTool = {
  name: 'compare_global_pathways',
  description:
    'Compare regulatory pathways across target markets for a drug or biologic product. 8 markets: ' +
    'US (FDA), EU (EMA), Japan (PMDA), China (NMPA), Canada (Health Canada), Australia (TGA), ' +
    'Brazil (ANVISA), and South Korea (MFDS). Returns per market: (1) authority and division; (2) ' +
    'application type (NDA/BLA/MAA/J-NDA/IDLA/NDS); (3) standard and expedited review timelines; ' +
    '(4) expedited pathway equivalents with cross-mapping (e.g., FDA Breakthrough ↔ EMA PRIME ↔ ' +
    'PMDA SAKIGAKE ↔ NMPA Breakthrough); (5) orphan designation, threshold and exclusivity; (6) ' +
    'conditional/provisional approval and post-approval requirements; (7) data requirement ' +
    'differences, including ethnic bridging per ICH E5 for Japan/China/Korea; (8) GMP inspection ' +
    'and PIC/S status; (9) HTA and reference pricing. Also harmonization notes (ICH, PIC/S, Project ' +
    'Orbis, ACCESS), simultaneous submission strategy and a 6-dimension comparison matrix. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      productType: {
        type: 'string',
        enum: [
          'small_molecule', 'biologic', 'cell_therapy', 'gene_therapy',
          'tissue_engineered', 'combination_product', 'vaccine', 'biosimilar', 'diagnostic',
        ],
        description: 'Product type.' + NOT_READ,
      },
      indication: {
        type: 'string',
        description: 'Target therapeutic indication (e.g., "non-small cell lung cancer", "type 2 diabetes", "spinal muscular atrophy").' + NOT_READ,
      },
      targetMarkets: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['us', 'eu', 'japan', 'china', 'canada', 'australia', 'brazil', 'south_korea'],
        },
        description: 'Target markets for regulatory submission. Select from: us, eu, japan, china, canada, australia, brazil, south_korea.',
      },
    },
    required: ['targetMarkets'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Exported Tool Array
// ─────────────────────────────────────────────────────────────────────────────

/** Regulatory Strategy tools, spread into ALL_ANA_TOOLS. */
export const REGULATORY_STRATEGY_TOOLS: AnaTool[] = [
  ASSESS_EXPEDITED_PROGRAM,
  PLAN_FDA_MEETING,
  ASSESS_ORPHAN_DESIGNATION,
  SELECT_505_PATHWAY,
  ASSESS_ROLLING_SUBMISSION,
  COMPARE_GLOBAL_PATHWAYS,
];
