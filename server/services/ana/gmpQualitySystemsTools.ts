/**
 * GMP Quality Systems & Data Integrity tools — exposes the deterministic
 * knowledge engines in `server/services/gmp-quality-systems/gmp-quality-systems-knowledge`
 * to AnA as first-class, selectable tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
 *
 * Tools:
 *   assess_data_integrity            — ALCOA+ data-integrity assessment
 *   design_capa                      — CAPA plan (root cause + effectiveness)
 *   classify_gmp_deviation           — deviation classification + reporting triggers
 *   assess_api_gmp                   — ICH Q7 expectations by manufacturing step
 *   design_sterile_controls          — EU GMP Annex 1 contamination control strategy
 *   assess_computer_system_validation — GAMP 5 / CSA / 21 CFR Part 11 assessment
 *
 * @module server/services/ana/gmpQualitySystemsTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned numbers and regulatory citations verbatim. Do NOT recompute, ' +
  'round differently, or substitute your own regulatory interpretation — a fabricated ' +
  'or misattributed regulatory citation in a generic drug submission is a critical defect.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. assess_data_integrity
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_DATA_INTEGRITY: AnaTool = {
  name: 'assess_data_integrity',
  description:
    'Assess a GMP record or dataset against the ALCOA+ data-integrity principles ' +
    '(Attributable, Legible, Contemporaneous, Original, Accurate, plus Complete, Consistent, ' +
    'Enduring, Available), review audit-trail expectations, judge data criticality, and map ' +
    'inherent integrity risk across the data lifecycle (generation, processing, review, ' +
    'reporting, retention, retrieval, destruction). Returns per-attribute findings with gaps, ' +
    'an audit-trail review finding (required / enabled / reviewed, with risk-based review ' +
    'frequency), lifecycle-stage risk bands with key controls, an overall data-integrity risk ' +
    'rating, prioritized recommendations, and citations (FDA Data Integrity Guidance 2018, ' +
    'MHRA GxP Data Integrity 2018, PIC/S PI 041, 21 CFR Part 11 §11.10, EU GMP Annex 11). ' +
    'Use when the user asks whether a record/system meets ALCOA+, how often audit trails must ' +
    'be reviewed, or what the data-integrity risk of a paper/hybrid/electronic record is. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      dataDescription: {
        type: 'string',
        description:
          'Short name/description of the data or record being assessed (e.g., ' +
          '"HPLC assay results for batch release", "manual weighing logbook").',
      },
      recordFormat: {
        type: 'string',
        enum: ['paper', 'hybrid', 'electronic'],
        description:
          'How the record is captured and stored. "hybrid" means a mix of paper and ' +
          'electronic; hybrid and paper carry higher inherent integrity risk.',
      },
      recordType: {
        type: 'string',
        enum: ['static', 'dynamic'],
        description:
          'For electronic records only: whether the record is static (fixed, e.g. PDF/printout) ' +
          'or dynamic (user can interact/reprocess, e.g. chromatographic data). Dynamic records ' +
          'must be retained in dynamic form (FDA DI Guidance Q2).',
      },
      lifecycleStages: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'generation',
            'processing',
            'review',
            'reporting',
            'retention',
            'retrieval',
            'destruction',
          ],
        },
        description:
          'Data-lifecycle stages to include in the risk mapping. Omit to assess the full ' +
          'lifecycle.',
      },
      impactsBatchRelease: {
        type: 'boolean',
        description:
          'Whether the data directly supports a batch-release / disposition decision. ' +
          'Raises data criticality to at least high.',
      },
      impactsPatientSafety: {
        type: 'boolean',
        description:
          'Whether the data directly impacts patient safety. Raises data criticality to critical.',
      },
      controls: {
        type: 'object',
        description:
          'Control state per ALCOA+ attribute and the audit trail. Any omitted field is ' +
          'treated as "unknown" and flagged for verification (it is not assumed satisfied).',
        properties: {
          uniqueUserAttribution: {
            type: 'boolean',
            description: 'Each user has a unique attributable identity; no shared logins.',
          },
          legibleAndPermanent: {
            type: 'boolean',
            description: 'Records are readable and permanent for the retention period.',
          },
          contemporaneousEntry: {
            type: 'boolean',
            description: 'Data are recorded at the time the activity is performed.',
          },
          originalOrTrueCopyRetained: {
            type: 'boolean',
            description: 'The original record or a verified true copy is retained.',
          },
          accuracyControls: {
            type: 'boolean',
            description: 'Accuracy controls / second checks are in place; no unjustified edits.',
          },
          completeWithMetadata: {
            type: 'boolean',
            description: 'All data including repeats, reprocessing, and metadata are retained.',
          },
          consistentAndSequenced: {
            type: 'boolean',
            description: 'Data are consistent across systems and in expected chronological sequence.',
          },
          enduringMedia: {
            type: 'boolean',
            description: 'Records are on durable/enduring media for the full retention period.',
          },
          readilyAvailable: {
            type: 'boolean',
            description: 'Records are retrievable/available for review, audit, and inspection.',
          },
          auditTrailEnabled: {
            type: 'boolean',
            description: 'A secure, computer-generated, time-stamped audit trail exists.',
          },
          auditTrailReviewed: {
            type: 'boolean',
            description: 'The audit trail is reviewed at a frequency matching data criticality.',
          },
        },
      },
      gxpArea: {
        type: 'string',
        enum: ['gmp', 'glp', 'gcp', 'gdp', 'gvp'],
        description: 'GxP area of the data (default "gmp").',
      },
    },
    required: ['dataDescription', 'recordFormat'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. design_capa
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_CAPA: AnaTool = {
  name: 'design_capa',
  description:
    'Design a CAPA (Corrective and Preventive Action) plan per ICH Q10 §3.2.2. Produces an ' +
    'objective problem statement, selects an appropriate root-cause method by rule (5 Whys, ' +
    'Ishikawa/fishbone, FMEA/FMECA, Fault Tree Analysis, or Is/Is-Not) with its step-by-step ' +
    'procedure and alternative methods, distinguishes the three action types (correction = ' +
    'immediate fix; corrective = eliminate root cause; preventive = prevent occurrence ' +
    'elsewhere), defines effectiveness checks with metrics/timing/acceptance criteria, sets a ' +
    'risk-commensurate target timeline and closure conditions, and scales formality to risk ' +
    'per ICH Q9(R1). Returns the full plan with citations (ICH Q10, ICH Q9(R1), 21 CFR ' +
    '211.192). Use when the user needs to plan a CAPA, pick a root-cause analysis technique, ' +
    'or distinguish correction vs corrective vs preventive action. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      problemDescription: {
        type: 'string',
        description: 'Concise, objective description of the problem / event.',
      },
      source: {
        type: 'string',
        enum: [
          'deviation',
          'complaint',
          'oos',
          'recall',
          'audit_finding',
          'inspection_observation',
          'nonconformance',
          'trend',
          'change',
          'near_miss',
        ],
        description: 'Source / trigger of the CAPA.',
      },
      severity: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description:
          'Risk to product quality / patient. Drives CAPA formality and target timeline. ' +
          'If omitted, inferred from productImpact.',
      },
      recurring: {
        type: 'boolean',
        description:
          'Whether the issue is recurring. Recurrence escalates toward a systemic/preventive ' +
          'focus and may select FMEA.',
      },
      contributingFactorCount: {
        type: 'number',
        description:
          'Number of contributing factors believed to be involved. Higher counts steer method ' +
          'selection toward Ishikawa or FMEA.',
      },
      systemic: {
        type: 'boolean',
        description:
          'Whether the failure is systemic (process/system-wide) rather than an isolated single ' +
          'event. Systemic failures select FMEA and a formal CAPA.',
      },
      productImpact: {
        type: 'boolean',
        description: 'Whether distributed or in-process product is potentially affected.',
      },
      preferredRootCauseMethod: {
        type: 'string',
        enum: ['5-whys', 'ishikawa', 'fmea', 'fault-tree', 'is-is-not'],
        description:
          'Optional caller-specified root-cause method; overrides the rule-based selection.',
      },
    },
    required: ['problemDescription', 'source'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. classify_gmp_deviation
// ─────────────────────────────────────────────────────────────────────────────

export const CLASSIFY_GMP_DEVIATION: AnaTool = {
  name: 'classify_gmp_deviation',
  description:
    'Classify a GMP deviation as critical, major, or minor; assign a handling timeline ' +
    '(initial response hours and ~30-day investigation target per 21 CFR 211.192); produce a ' +
    'product-impact assessment with disposition guidance; and determine whether a Field Alert ' +
    'Report evaluation (21 CFR 314.81) and/or a recall (health-hazard) evaluation (21 CFR Part ' +
    '7) is triggered. Baseline class is derived from the deviation area (sterility assurance, ' +
    'cross-contamination, and mix-up/mislabeling are critical; specification/process/equipment ' +
    'are major; documentation/training are minor) and escalated by safety impact, confirmed ' +
    'OOS, sterile product, and recurrence. Returns classification with rationale, timeline, ' +
    'product impact, reporting triggers, whether a CAPA is required, and citations (21 CFR ' +
    '211.100/192/198/22, ICH Q10). Use when the user needs to triage/classify a deviation or ' +
    'decide if a field alert or recall evaluation is warranted. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Description of the deviation event.',
      },
      area: {
        type: 'string',
        enum: [
          'sterility_assurance',
          'cross_contamination',
          'mix_up_mislabeling',
          'specification_failure',
          'process_parameter',
          'documentation',
          'environmental_monitoring',
          'equipment',
          'utilities',
          'training',
          'other',
        ],
        description:
          'Functional area of the deviation; determines the baseline classification before ' +
          'escalation.',
      },
      batchDistributed: {
        type: 'boolean',
        description:
          'Whether the affected batch has already been distributed. Influences field-alert and ' +
          'recall triggers and disposition urgency.',
      },
      sterileProduct: {
        type: 'boolean',
        description:
          'Whether the product is sterile / parenteral. A safety-critical area on a sterile ' +
          'product escalates to critical.',
      },
      outOfSpecConfirmed: {
        type: 'boolean',
        description:
          'Whether a specification (CQA) was confirmed out of limits. Escalates to at least ' +
          'major and contributes to field-alert evaluation.',
      },
      patientSafetyImpact: {
        type: 'boolean',
        description: 'Whether there is potential patient-safety impact. Escalates to critical.',
      },
      recurring: {
        type: 'boolean',
        description: 'Whether the deviation is recurring. Escalates the classification one level.',
      },
      usMarketed: {
        type: 'boolean',
        description:
          'Whether the product is marketed in the US (for Field Alert Report relevance). ' +
          'Defaults to true (conservative) if omitted.',
      },
      batchesAffected: {
        type: 'number',
        description: 'Number of batches potentially affected (context for impact scope).',
      },
    },
    required: ['description', 'area'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. assess_api_gmp
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_API_GMP: AnaTool = {
  name: 'assess_api_gmp',
  description:
    'Assess ICH Q7 (API GMP) expectations for a specific API manufacturing step, applying the ' +
    'increasing-GMP-stringency principle: GMP is applied with increasing rigor from API ' +
    'starting-material production, through introduction of the starting material (where full ' +
    'GMP begins), intermediate production, isolation/purification, to final API and physical ' +
    'processing/packaging (highest stringency). Returns the step\'s GMP stringency profile and ' +
    'level (1–4), the relevant critical process controls (CPP/IPC identification, process ' +
    'validation, impurity control, release testing, stability — scaled to the step), a change-' +
    'control guidance block (significant vs minor, revalidation and regulatory-notification ' +
    'needs per ICH Q7 §13 / ICH Q10), the independent-quality-unit expectation, and citations ' +
    '(ICH Q7 Table 1 / §2.2 / §8 / §12 / §13, 21 CFR 211.165). Use when the user asks what GMP ' +
    'expectations apply to a given API/intermediate step or how to handle a change to it. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      step: {
        type: 'string',
        enum: [
          'starting_material_production',
          'starting_material_introduction',
          'intermediate_production',
          'isolation_purification',
          'final_api',
          'physical_processing_packaging',
        ],
        description: 'The API manufacturing step under assessment.',
      },
      apiName: {
        type: 'string',
        description: 'Name of the API / intermediate (optional, for context).',
      },
      isCriticalStep: {
        type: 'boolean',
        description:
          'Whether the step is identified as a critical process step. Raises stringency and ' +
          'classifies related changes as significant.',
      },
      sterileApi: {
        type: 'boolean',
        description:
          'Whether the API is sterile (adds ICH Q7 §18 / EU GMP Annex 1 contamination-control ' +
          'considerations).',
      },
      changeIsSignificant: {
        type: 'boolean',
        description:
          'Whether a change being evaluated is significant. Drives the change-control guidance ' +
          '(revalidation and regulatory notification).',
      },
    },
    required: ['step'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. design_sterile_controls
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_STERILE_CONTROLS: AnaTool = {
  name: 'design_sterile_controls',
  description:
    'Design an EU GMP Annex 1 (2022) contamination control strategy for a sterile product. ' +
    'Selects the sterilisation approach by rule — terminal moist heat (the method of choice, ' +
    'SAL ≤ 10⁻⁶) where the product is heat-stable, else sterilising-grade filtration plus ' +
    'aseptic processing where filterable, else full aseptic processing — and recommends a ' +
    'barrier technology (isolator favored for aseptic processing, RABS as alternative, open ' +
    'cleanroom for terminally sterilised). Returns the cleanroom grade table (A–D with at-rest ' +
    'and in-operation particulate and microbial expectations), a QRM-based environmental ' +
    'monitoring plan (including continuous Grade A viable/non-viable monitoring), an aseptic ' +
    'process simulation / media-fill plan (zero-contaminated-unit target, semi-annual ' +
    'requalification per line/shift/operator), a lyophilisation note where applicable, ' +
    'prioritized recommendations, and citations (EU GMP Annex 1 2022 §2/§4/§8/§9, Tables 1/5/6). ' +
    'Use when the user is planning sterile manufacturing controls, choosing a sterilisation ' +
    'method, or defining cleanroom grades / media-fill expectations. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      productDescription: {
        type: 'string',
        description: 'Description of the sterile product / process.',
      },
      heatStable: {
        type: 'boolean',
        description:
          'Whether the product and container can withstand terminal moist-heat sterilisation. ' +
          'If true, terminal sterilisation (the method of choice) is selected.',
      },
      filterable: {
        type: 'boolean',
        description:
          'Whether the product can be sterile filtered (0.22 µm). Used when not heat-stable to ' +
          'select filtration + aseptic processing.',
      },
      barrier: {
        type: 'string',
        enum: ['open_cleanroom', 'rabs', 'isolator'],
        description:
          'Barrier technology in use / planned. If omitted, recommended by rule (isolator for ' +
          'aseptic processing).',
      },
      lyophilised: {
        type: 'boolean',
        description:
          'Whether lyophilisation (freeze-drying) is part of the process. Adds Grade A ' +
          'transfer/loading and lyophiliser-control guidance.',
      },
      fillingLines: {
        type: 'number',
        description: 'Annual number of aseptic filling lines/shifts (context for APS scheduling).',
      },
      operatorCount: {
        type: 'number',
        description: 'Number of operators requiring aseptic qualification (context for APS).',
      },
    },
    required: ['productDescription'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. assess_computer_system_validation
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_COMPUTER_SYSTEM_VALIDATION: AnaTool = {
  name: 'assess_computer_system_validation',
  description:
    'Assess computer system validation per GAMP 5 (2nd ed). Determines the GAMP software ' +
    'category (1 = infrastructure, 3 = non-configured/off-the-shelf, 4 = configured, 5 = ' +
    'custom/bespoke), recommends a risk-based assurance approach across the CSV–CSA spectrum ' +
    '(CSA unscripted/exploratory with supplier leveraging for low-risk standard software; ' +
    'risk-based mixed scripted/unscripted for configured/direct-impact systems; full scripted ' +
    'lifecycle CSV for custom/critical systems), maps the applicable 21 CFR Part 11 controls ' +
    '(validation, secure time-stamped audit trail, access controls/authority checks, ' +
    'e-signature manifestation and uniqueness, signature/record linking, predicate-rule ' +
    'scoping), and lists the validation deliverables scaled to category and risk (URS, ' +
    'functional/config and design specs, supplier assessment, test evidence, data-integrity ' +
    'controls verification, traceability matrix, validation summary report). Returns all of the ' +
    'above with citations (GAMP 5 2nd ed Appendix M4 / CSA, 21 CFR Part 11 §11.10/§11.50/§11.70/' +
    '§11.200, EU GMP Annex 11). Use when the user needs a GAMP category, a CSV-vs-CSA decision, ' +
    'Part 11 controls, or a validation deliverables list. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      systemDescription: {
        type: 'string',
        description: 'Name / description of the computerised system.',
      },
      softwareType: {
        type: 'string',
        enum: ['infrastructure', 'non_configured', 'configured', 'custom'],
        description:
          'Type of software, mapping to GAMP category: infrastructure→Cat 1, ' +
          'non_configured→Cat 3, configured→Cat 4, custom→Cat 5.',
      },
      gxpImpact: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description:
          'GxP / patient-safety / product-quality impact of the system. Drives the assurance ' +
          'approach and rigor. If omitted, inferred from directImpact.',
      },
      electronicRecords: {
        type: 'boolean',
        description:
          'Whether the system creates/maintains electronic records subject to 21 CFR Part 11. ' +
          'Defaults to true if omitted.',
      },
      electronicSignatures: {
        type: 'boolean',
        description:
          'Whether the system applies electronic signatures (enables the e-signature Part 11 ' +
          'controls).',
      },
      directImpact: {
        type: 'boolean',
        description:
          'Whether the system directly impacts product quality or patient safety. Steers toward ' +
          'scripted/robust testing of direct-impact features.',
      },
      supplierAssessed: {
        type: 'boolean',
        description:
          'Whether a documented supplier assessment/audit exists, allowing supplier development ' +
          'and testing activities to be leveraged to reduce duplication.',
      },
    },
    required: ['systemDescription', 'softwareType'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Collected array — spread into ALL_ANA_TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/** GMP Quality Systems & Data Integrity tools, spread into ALL_ANA_TOOLS. */
export const GMP_QUALITY_SYSTEMS_TOOLS: AnaTool[] = [
  ASSESS_DATA_INTEGRITY,
  DESIGN_CAPA,
  CLASSIFY_GMP_DEVIATION,
  ASSESS_API_GMP,
  DESIGN_STERILE_CONTROLS,
  ASSESS_COMPUTER_SYSTEM_VALIDATION,
];
