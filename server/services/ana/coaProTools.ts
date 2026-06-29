/**
 * Clinical Outcome Assessment (COA / PRO) tools — exposes the deterministic
 * COA knowledge base to AnA as first-class, selectable tools.
 *
 * Each tool wraps a pure function grounded in the FDA PRO Guidance (2009), the
 * FDA Patient-Focused Drug Development (PFDD) guidance series (Guidance 1–4),
 * the FDA COA qualification program, ISPOR good-research-practices, and ISOQOL.
 * NO LLM estimation, NO network calls — results are deterministic and
 * submission-defensible. The four COA types are PRO, ClinRO, ObsRO, PerfO.
 *
 * Tools:
 *   select_coa_type             — pick the appropriate COA type for a concept
 *   assess_coa_validation       — evaluate measurement properties / adequacy
 *   determine_meaningful_change — anchor + distribution responder threshold
 *   assess_coa_fit_for_purpose  — fit-for-purpose for a context of use
 *   position_coa_endpoint       — endpoint hierarchy & label-claim feasibility
 *   plan_coa_development        — COA development / selection roadmap
 *
 * Handlers live in AnaToolExecutor.ts (registerToolHandler) and dynamic-import
 * the matching coa-knowledge module.
 *
 * @module server/services/ana/coaProTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned data and regulatory citations verbatim — do NOT reinterpret ' +
  'citations, invent additional guidance, or substitute your own recommendations. ' +
  'If a parameter is missing or invalid, relay the validation error and ask the user for the correct value.';

const COA_TYPE_ENUM = ['PRO', 'ClinRO', 'ObsRO', 'PerfO'];

const POPULATION_ENUM = [
  'adult_cognitively_intact',
  'adult_cognitively_impaired',
  'elderly_frail',
  'adolescent',
  'child_school_age',
  'child_preschool',
  'infant_toddler',
  'critically_ill_unconscious',
  'severe_psychiatric',
];

const ENDPOINT_POSITION_ENUM = [
  'primary',
  'key_secondary',
  'secondary',
  'exploratory',
  'not_recommended',
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. Select COA Type
// ─────────────────────────────────────────────────────────────────────────────

export const SELECT_COA_TYPE: AnaTool = {
  name: 'select_coa_type',
  description:
    'Select the appropriate clinical outcome assessment (COA) type — PRO, ClinRO, ' +
    'ObsRO, or PerfO — for a given concept of interest, based on who can validly ' +
    'report the concept and the trial population. Drives the central FDA principle ' +
    'that the data source must match the concept: patient-experienced symptoms ' +
    '(pain, fatigue, nausea) call for a PRO when self-report is feasible; concepts ' +
    'in populations who cannot self-report (young children, cognitively impaired, ' +
    'unconscious) route to ObsRO/ClinRO; concepts requiring clinical interpretation ' +
    'route to ClinRO; capacities demonstrable through a standardized task route to ' +
    'PerfO. Returns a ranked set of COA-type recommendations with suitability, a ' +
    'primary recommendation, reporter guidance, and cautions. Cites the FDA PRO ' +
    'Guidance (2009) and PFDD Guidance 1–3. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      conceptOfInterest: {
        type: 'string',
        description: 'Plain-language concept being measured, e.g. "pain intensity", "vomiting frequency", "physical functioning".',
      },
      conceptObservability: {
        type: 'string',
        enum: ['patient_subjective', 'observable_sign', 'clinical_judgment', 'functional_capacity'],
        description: 'How observable the concept is — the primary driver of COA-type validity. patient_subjective = only the patient experiences it; observable_sign = an observer can see it without inference; clinical_judgment = requires trained interpretation; functional_capacity = demonstrable through a standardized task.',
      },
      population: {
        type: 'string',
        enum: POPULATION_ENUM,
        description: 'Target population — drives whether self-report is feasible.',
      },
      bestReporter: {
        type: 'string',
        enum: ['patient', 'clinician', 'caregiver', 'parent', 'teacher', 'trained_observer', 'patient_performing_task'],
        description: 'Optional: explicitly state who can best report the concept.',
      },
      disease: {
        type: 'string',
        description: 'Optional: disease / therapeutic area, used for context notes only.',
      },
    },
    required: ['conceptOfInterest', 'conceptObservability', 'population'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Assess COA Validation
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_COA_VALIDATION: AnaTool = {
  name: 'assess_coa_validation',
  description:
    'Evaluate the measurement properties of a COA against FDA / ISPOR / ISOQOL ' +
    'standards and return an overall validation adequacy grade with gaps. Assesses ' +
    'content validity (the most important property per FDA — established in the ' +
    'target population/context of use), construct validity, reliability ' +
    '(test-retest ICC, internal consistency via Cronbach\'s alpha for multi-item ' +
    'scales, inter-rater ICC for ClinRO/administered PerfO), and ability to detect ' +
    'change. Applies conventional acceptance benchmarks (e.g., ICC ≥ 0.70, ' +
    'Cronbach\'s alpha 0.70–0.95) and returns a per-property grade plus prioritized ' +
    'recommendations to close gaps. Cites the FDA PRO Guidance and PFDD Guidance 3. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      coaType: { type: 'string', enum: COA_TYPE_ENUM, description: 'COA type under evaluation.' },
      contentValidityEstablished: { type: 'boolean', description: 'Was content validity established (qualitative evidence the COA measures the concept)?' },
      contentValidityInTargetPopulation: { type: 'boolean', description: 'Was content validity established specifically in THIS context of use / population?' },
      constructValidityConfirmed: { type: 'boolean', description: 'Were construct-validity hypotheses (convergent/known-groups) largely confirmed?' },
      testRetestICC: { type: 'number', description: 'Test-retest reliability ICC, if available (0–1).' },
      cronbachAlpha: { type: 'number', description: "Cronbach's alpha for multi-item domains, if applicable (0–1)." },
      interRaterICC: { type: 'number', description: 'Inter-rater ICC/kappa for ClinRO / administered PerfO (0–1).' },
      isMultiItem: { type: 'boolean', description: 'Whether the instrument is multi-item (internal consistency applies).' },
      abilityToDetectChangeDemonstrated: { type: 'boolean', description: 'Ability-to-detect-change (responsiveness) evidence available and supportive?' },
    },
    required: ['coaType'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Determine Meaningful Within-Patient Change
// ─────────────────────────────────────────────────────────────────────────────

export const DETERMINE_MEANINGFUL_CHANGE: AnaTool = {
  name: 'determine_meaningful_change',
  description:
    'Determine the meaningful within-patient change threshold (responder ' +
    'definition) for a COA score using the FDA-preferred anchor-based method as ' +
    'primary, with distribution-based estimates as supportive only. Computes a ' +
    'recommended threshold from anchor-group mean change (requiring an anchor ' +
    'correlation of roughly ≥ 0.30–0.37 to be usable) and contextualizes it with ' +
    'distribution-based heuristics (0.5 SD, 1 SEM). Flags when evidence is ' +
    'insufficient and a single distribution-based value is being over-relied on. ' +
    'Cites FDA PFDD Guidance 3 and ISPOR responder-definition practice. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      improvementDirection: {
        type: 'string',
        enum: ['increase', 'decrease'],
        description: 'Direction of improvement on the score (does a higher or lower score mean the patient improved?).',
      },
      anchorEstimates: {
        type: 'array',
        description: 'Anchor-based estimates (PRIMARY method). At least one is strongly recommended.',
        items: {
          type: 'object',
          properties: {
            anchorLabel: { type: 'string', description: 'Label for the anchor, e.g. "PGIC minimally improved".' },
            meanChangeInImprovedGroup: { type: 'number', description: 'Mean within-patient change in COA score in the "meaningfully improved" anchor group.' },
            anchorCorrelation: { type: 'number', description: 'Correlation of the anchor with the COA change score (should be ≥ ~0.30–0.37 to be usable).' },
          },
          required: ['anchorLabel', 'meanChangeInImprovedGroup'],
        },
      },
      distributionEstimate: {
        type: 'object',
        description: 'Distribution-based estimates (SUPPORTIVE only).',
        properties: {
          baselineSD: { type: 'number', description: 'Standard deviation of baseline scores (for the 0.5 SD heuristic).' },
          sem: { type: 'number', description: 'Standard error of measurement (for the SEM-based estimate).' },
        },
      },
      scoreRange: {
        type: 'object',
        description: 'Score range, for context (optional).',
        properties: {
          min: { type: 'number' },
          max: { type: 'number' },
        },
      },
    },
    required: ['improvementDirection'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Assess COA Fit-for-Purpose
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_COA_FIT_FOR_PURPOSE: AnaTool = {
  name: 'assess_coa_fit_for_purpose',
  description:
    'Assess whether a COA is fit-for-purpose for a specific context of use — the ' +
    'combination of population, concept, endpoint position, and intended labeling ' +
    'claim. Evaluates whether content validity was established in this context of ' +
    'use, whether the measured concept matches the concept of interest for the ' +
    'claim, whether a meaningful within-patient change threshold is defined, ' +
    'whether the recall period suits the concept and treatment timing, and whether ' +
    'the data-collection mode (paper vs ePRO) has been validated/equated. Returns ' +
    'a fit-for-purpose determination with the specific deficiencies that would ' +
    'block a label claim. Cites the FDA COA / PFDD Guidance 3 roadmap. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      coaType: { type: 'string', enum: COA_TYPE_ENUM, description: 'COA type under evaluation.' },
      conceptOfInterest: { type: 'string', description: 'Concept of interest the COA targets.' },
      population: { type: 'string', enum: POPULATION_ENUM, description: 'Population in the planned trial (context of use).' },
      contentValidityInContextOfUse: { type: 'boolean', description: 'Was content validity established in THIS population/context of use?' },
      conceptMatchesClaim: { type: 'boolean', description: "Does the COA's measured concept match the concept of interest for the claim?" },
      intendedEndpointPosition: { type: 'string', enum: ENDPOINT_POSITION_ENUM, description: 'Intended endpoint position in the trial hierarchy.' },
      meaningfulChangeDefined: { type: 'boolean', description: 'Is a meaningful within-patient change threshold defined?' },
      recallPeriodAppropriate: { type: 'boolean', description: 'Is the recall period appropriate for the concept and treatment timing?' },
      modeOfAdministrationValidated: { type: 'boolean', description: 'Has the data-collection mode (paper/ePRO) been validated/equated?' },
      intendedClaim: { type: 'string', description: 'Intended labeling claim text (optional context).' },
    },
    required: ['coaType', 'conceptOfInterest', 'population'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. Position COA Endpoint
// ─────────────────────────────────────────────────────────────────────────────

export const POSITION_COA_ENDPOINT: AnaTool = {
  name: 'position_coa_endpoint',
  description:
    'Recommend where a COA-based endpoint should sit in a trial\'s endpoint ' +
    'hierarchy (primary, key secondary, secondary, exploratory, or not ' +
    'recommended) and whether a label claim is feasible. Integrates whether the ' +
    'concept is core to how the patient feels, functions, or survives; whether the ' +
    'COA is fully validated and fit-for-purpose; whether a meaningful change / ' +
    'responder definition is pre-specified; whether the trial is blinded ' +
    '(open-label designs weaken subjective endpoints); the number of other ' +
    'endpoints already in the hierarchy (multiplicity); and whether a label claim ' +
    'is sought. Returns a recommended position with rationale and the conditions ' +
    'required to elevate it. Cites the FDA PRO Guidance and multiple-endpoint ' +
    'guidance. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      coaType: { type: 'string', enum: COA_TYPE_ENUM, description: 'COA type under evaluation.' },
      conceptOfInterest: { type: 'string', description: 'Concept of interest.' },
      isCoreToFeelFunctionSurvive: { type: 'boolean', description: 'Is the concept central to how the patient feels, functions, or survives?' },
      fitForPurpose: { type: 'boolean', description: 'Is the COA fully validated and fit-for-purpose for this context of use?' },
      meaningfulChangeDefined: { type: 'boolean', description: 'Is a meaningful within-patient change / responder definition pre-specified?' },
      blinded: { type: 'boolean', description: 'Is the trial blinded? (Open-label weakens subjective endpoint interpretation.)' },
      otherKeyEndpointsCount: { type: 'number', description: 'Number of other primary/key-secondary endpoints already in the hierarchy.' },
      labelClaimSought: { type: 'boolean', description: 'Is a label claim the goal for this COA?' },
    },
    required: ['coaType', 'conceptOfInterest'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Plan COA Development
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_COA_DEVELOPMENT: AnaTool = {
  name: 'plan_coa_development',
  description:
    'Generate a COA development or selection roadmap for a concept of interest and ' +
    'context of use. Routes between selecting/adapting an existing validated ' +
    'instrument and de novo development, and lays out the required steps — concept ' +
    'elicitation and qualitative content-validity work, item generation, cognitive ' +
    'interviews/debriefing, psychometric validation, meaningful-change estimation, ' +
    'usability/mode equivalence, and FDA engagement (COA qualification or ' +
    'pre-submission) — scaled to the intended endpoint position and whether a label ' +
    'claim or formal COA qualification is sought. Flags when a planned instrument ' +
    'modification invalidates prior validation. Cites the FDA PFDD Guidance series ' +
    'and COA qualification program. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      conceptOfInterest: { type: 'string', description: 'Concept of interest.' },
      coaType: { type: 'string', enum: COA_TYPE_ENUM, description: 'COA type intended (from select_coa_type).' },
      population: { type: 'string', enum: POPULATION_ENUM, description: 'Population / context of use.' },
      existingInstrumentAvailable: { type: 'boolean', description: 'Does a candidate existing instrument exist?' },
      existingHasContentValidityInPopulation: { type: 'boolean', description: 'If existing, does it have documented content validity in this population?' },
      modificationPlanned: { type: 'boolean', description: 'Will the instrument be modified (items/recall/mode) from its validated form?' },
      intendedEndpointPosition: { type: 'string', enum: ENDPOINT_POSITION_ENUM, description: 'Intended endpoint position (drives rigor + FDA engagement).' },
      seekingQualificationOrClaim: { type: 'boolean', description: 'Is FDA COA qualification or a label claim the goal?' },
    },
    required: ['conceptOfInterest', 'coaType', 'population'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Exported Array
// ─────────────────────────────────────────────────────────────────────────────

/** Clinical outcome assessment (COA/PRO) tools, spread into ALL_ANA_TOOLS. */
export const COA_PRO_TOOLS: AnaTool[] = [
  SELECT_COA_TYPE,
  ASSESS_COA_VALIDATION,
  DETERMINE_MEANINGFUL_CHANGE,
  ASSESS_COA_FIT_FOR_PURPOSE,
  POSITION_COA_ENDPOINT,
  PLAN_COA_DEVELOPMENT,
];
