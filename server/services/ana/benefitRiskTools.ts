/**
 * Structured Benefit-Risk Assessment tools — exposes the deterministic
 * knowledge engines in `server/services/benefit-risk/benefit-risk-knowledge`
 * to AnA as first-class, selectable tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
 * An omitted or null true/false input stays not_stated (inputStates in the
 * result) and is never read as true or false; a result it could change is null
 * or not assessed and is listed in undecided. A malformed value is refused by
 * field (Rule 2 S5d, 2026-11-09).
 *
 * Tools:
 *   structure_benefit_risk_framework — FDA Benefit-Risk Assessment Framework grid
 *   build_effects_table              — EMA-style favourable/unfavourable effects table
 *   assess_benefit_risk_balance      — deterministic integrated balance + drivers
 *   design_value_tree                — PrOACT-URL / BRAT value tree + weighting
 *   assess_br_uncertainty            — uncertainty sources, robustness, what-would-change
 *   plan_br_communication            — multi-audience BR communication + visuals
 *
 * @module server/services/ana/benefitRiskTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic: no LLM, no network. Report the returned values and regulatory citations verbatim; do not ' +
  'substitute your own regulatory interpretation.';

/** What an omitted or null input means; a malformed one is refused by field. */
const NOT_STATED_UNDECIDED =
  ' Omitted or null stays not_stated, and a conclusion it could change is not assessed (see undecided).';
const MIDDLE_VALUE = ' Omitted or null: scored at the middle value, named in methodNotes.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. structure_benefit_risk_framework
// ─────────────────────────────────────────────────────────────────────────────

export const STRUCTURE_BENEFIT_RISK_FRAMEWORK: AnaTool = {
  name: 'structure_benefit_risk_framework',
  description:
    'Build the FDA Benefit-Risk Assessment Framework grid for a product and indication: the four ' +
    'rows (Analysis of Condition, Current Treatment Options, Benefit, and Risk and Risk ' +
    'Management), each with its evidence and uncertainties and a conclusions-and-reasons cell, and ' +
    'an integrated assessment narrative. Acceptable risk and uncertainty rise with disease severity ' +
    'and unmet medical need, and a benefit\'s clinical importance follows its endpoint (mortality > ' +
    'irreversible morbidity > function > symptom > surrogate > biomarker). Grounded in FDA ' +
    '"Benefit-Risk Assessment for New Drug and Biological Products" (2023), PDUFA VI and VII, and ' +
    'the FDA benefit-risk framework grid. A row an unstated fact decides is not assessed. Use to ' +
    'organize a marketing-application benefit-risk story into the FDA framework, or structure ' +
    'Module 2.5.6 reasoning around the FDA grid. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      productName: { type: 'string', description: 'Name of the product or investigational drug/biologic under review.' },
      indication: { type: 'string', description: 'The proposed indication / condition being treated (e.g., "moderate-to-severe plaque psoriasis").' },
      conditionSeverity: {
        type: 'string',
        enum: ['mild', 'moderate', 'serious', 'severe', 'life_threatening'],
        description:
          'Seriousness of the condition. Higher severity raises acceptable risk and uncertainty in the ' +
          'Analysis-of-Condition row and the integrated assessment. Omitted or null: that row\'s conclusion is not assessed.',
      },
      conditionCourse: {
        type: 'string',
        enum: ['acute', 'chronic', 'progressive', 'relapsing', 'episodic'],
        description:
          'Disease course. Affects the relevant time-horizon for benefit and risk (e.g., chronic exposure ' +
          'weights long-term risks; progressive disease makes denial of therapy itself a risk).',
      },
      populationDescriptor: { type: 'string', description: 'Free-text description of the affected population (size, demographics, baseline risk).' },
      unmetMedicalNeed: {
        type: 'boolean',
        description:
          'Whether an unmet medical need exists. When true (or when the options supplied are none, or all none or ' +
          'supportive care), an incremental benefit can justify a higher level of risk.' + NOT_STATED_UNDECIDED,
      },
      currentTreatments: {
        type: 'array',
        description: 'Current treatment options in the therapeutic landscape (Current Treatment Options row). An empty list states that there are none.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the treatment option.' },
            status: { type: 'string', enum: ['approved', 'off_label', 'supportive_care', 'none'], description: 'Regulatory/clinical status of the option. Omitted or null is reported as not stated, and is not read as approved.' },
            limitations: { type: 'string', description: 'Brief characterization of the option\'s limitations (efficacy gaps, toxicity, burden).' },
          },
          required: ['name'],
        },
      },
      keyBenefits: {
        type: 'array',
        description: 'Key benefits supporting the Benefit row.',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'Description of the benefit.' },
            endpointType: { type: 'string', enum: ['mortality', 'irreversible_morbidity', 'symptom', 'function', 'surrogate', 'biomarker'], description: 'Endpoint type supporting the benefit; determines its position in the clinical-importance hierarchy.' },
            magnitude: { type: 'string', enum: ['negligible', 'low', 'moderate', 'high', 'very_high'], description: 'Ordinal magnitude of the benefit.' + MIDDLE_VALUE },
            uncertainty: { type: 'string', enum: ['low', 'moderate', 'high'], description: 'Uncertainty in the benefit estimate.' + MIDDLE_VALUE },
          },
          required: ['description'],
        },
      },
      keyRisks: {
        type: 'array',
        description: 'Key risks supporting the Risk and Risk Management row.',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'Description of the risk/adverse effect.' },
            severity: { type: 'string', enum: ['mild', 'moderate', 'severe', 'life_threatening', 'fatal'], description: 'Severity of the harm.' + MIDDLE_VALUE },
            reversibility: { type: 'string', enum: ['fully_reversible', 'partially_reversible', 'irreversible'], description: 'Reversibility of the harm.' + MIDDLE_VALUE },
            frequency: { type: 'string', enum: ['very_common', 'common', 'uncommon', 'rare', 'very_rare'], description: 'Frequency band (CIOMS frequency convention).' },
            uncertainty: { type: 'string', enum: ['low', 'moderate', 'high'], description: 'Uncertainty in the risk estimate.' },
            manageable: { type: 'boolean', description: 'Whether the risk is readily manageable/preventable with stated measures.' + NOT_STATED_UNDECIDED },
          },
          required: ['description'],
        },
      },
      riskManagementTools: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Proposed risk-management tools (label warnings, REMS, monitoring, controlled distribution, PASS). ' +
          'If omitted, routine pharmacovigilance and labeling are assumed.',
      },
    },
    required: ['productName', 'indication'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. build_effects_table
// ─────────────────────────────────────────────────────────────────────────────

export const BUILD_EFFECTS_TABLE: AnaTool = {
  name: 'build_effects_table',
  description:
    'Build an EMA-style effects table: the standardized tabulation of favourable and unfavourable ' +
    'effects in the benefit-risk section of every EMA assessment report / EPAR. Each effect is a ' +
    'row with its direction, unit, treatment vs comparator values, absolute difference, confidence ' +
    'interval, ordinal magnitude, uncertainty grade, evidence source and strength of evidence. ' +
    'Magnitude is the supplied ordinal judgment or is derived from the relative ' +
    'treatment-vs-comparator difference; overall evidence quality is the worst uncertainty present. ' +
    'Confidence intervals that include the null are flagged as not statistically established. ' +
    'Grounded in the EMA Benefit-Risk Methodology Project, the EMA effects-table convention and IMI ' +
    'PROTECT visualization recommendations. Use to organize favourable/unfavourable effect ' +
    'estimates into the canonical EMA effects table. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      productName: { type: 'string', description: 'Name of the product.' },
      indication: { type: 'string', description: 'Indication / condition for the effects table.' },
      comparator: { type: 'string', description: 'Comparator or control arm (e.g., "placebo", "standard of care"). Default "comparator / placebo".' },
      effects: {
        type: 'array',
        description: 'The favourable and unfavourable effects to tabulate.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the effect (endpoint or adverse effect).' },
            direction: { type: 'string', enum: ['favourable', 'unfavourable'], description: 'Whether the effect is favourable (benefit) or unfavourable (risk).' },
            treatmentValue: { type: 'number', description: 'Point estimate of the effect in the treatment arm.' },
            controlValue: { type: 'number', description: 'Point estimate of the effect in the comparator/control arm.' },
            unit: { type: 'string', description: 'Unit of the effect measure (e.g., "%", "mmHg", "events/100 PY").' },
            ciLow: { type: 'number', description: 'Lower confidence bound on the treatment-vs-control difference.' },
            ciHigh: { type: 'number', description: 'Upper confidence bound on the treatment-vs-control difference.' },
            magnitude: { type: 'string', enum: ['negligible', 'low', 'moderate', 'high', 'very_high'], description: 'Ordinal magnitude judgment; if omitted, derived from the relative difference, or moderate (named in methodNotes) without both values.' },
            uncertainty: { type: 'string', enum: ['low', 'moderate', 'high'], description: 'Declared uncertainty; the table uses the worse of this and the evidence-source floor.' + MIDDLE_VALUE },
            evidenceSource: { type: 'string', enum: ['pivotal_rct', 'supportive_rct', 'meta_analysis', 'observational', 'indirect', 'modeling'], description: 'Source/strength of evidence; sets a minimum uncertainty floor. Omitted or null: a moderate floor, named in methodNotes.' },
            reference: { type: 'string', description: 'Reference string (study identifier or citation) for the effect estimate.' },
          },
          required: ['name', 'direction'],
        },
      },
    },
    required: ['productName', 'indication', 'effects'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. assess_benefit_risk_balance
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_BENEFIT_RISK_BALANCE: AnaTool = {
  name: 'assess_benefit_risk_balance',
  description:
    'Produce an integrated benefit-risk balance assessment with its principal drivers. Integrates ' +
    'key benefits (importance-weighted by clinical-endpoint hierarchy, discounted for uncertainty) ' +
    'and key risks (severity × reversibility × frequency, credited for mitigation) into a benefit ' +
    'weight, risk weight, net balance and confidence score, and returns one of four verdicts: ' +
    'favourable, favourable_with_conditions, indeterminate or unfavourable, or none, naming the ' +
    'facts, while an unstated one could change it. Adds a bounded credit for disease severity and ' +
    'unmet need. Returns the drivers, key-benefit and key-risk summaries, mitigation impact, ' +
    'subgroup considerations, conditions for a favourable conclusion and a structured conclusion ' +
    'narrative. Grounded in ICH M4E(R2) §2.5.6, CIOMS IV, the FDA framework and EMA methodology. ' +
    'Use for an integrated benefit-risk judgment. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      productName: { type: 'string', description: 'Name of the product.' },
      indication: { type: 'string', description: 'Indication / condition under assessment.' },
      conditionSeverity: { type: 'string', enum: ['mild', 'moderate', 'serious', 'severe', 'life_threatening'], description: 'Seriousness of the condition; raises risk tolerance via a bounded additive credit to the net balance. Omitted or null: no credit, named in methodNotes.' },
      unmetMedicalNeed: { type: 'boolean', description: 'Whether an unmet medical need exists; adds a bounded credit to the net balance when true.' + NOT_STATED_UNDECIDED },
      benefits: {
        type: 'array',
        description: 'Key benefits with magnitude and (optionally) endpoint type, uncertainty, weight, and population.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the benefit.' },
            magnitude: { type: 'string', enum: ['negligible', 'low', 'moderate', 'high', 'very_high'], description: 'Ordinal magnitude of the benefit.' },
            uncertainty: { type: 'string', enum: ['low', 'moderate', 'high'], description: 'Uncertainty in the benefit; discounts its contribution.' + MIDDLE_VALUE },
            endpointType: { type: 'string', enum: ['mortality', 'irreversible_morbidity', 'symptom', 'function', 'surrogate', 'biomarker'], description: 'Endpoint type; sets a default importance weight (mortality highest, biomarker lowest). Omitted with no weight: 0.6, named in methodNotes.' },
            weight: { type: 'number', description: 'Optional explicit importance weight from 0 to 1 (outside it is refused); overrides the endpoint-derived default.' },
            population: { type: 'string', description: 'Population/subgroup in which the benefit applies.' },
          },
          required: ['name', 'magnitude'],
        },
      },
      risks: {
        type: 'array',
        description: 'Key risks with severity and (optionally) reversibility, frequency, uncertainty, mitigation, weight, and population.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the risk.' },
            severity: { type: 'string', enum: ['mild', 'moderate', 'severe', 'life_threatening', 'fatal'], description: 'Severity of the harm.' },
            reversibility: { type: 'string', enum: ['fully_reversible', 'partially_reversible', 'irreversible'], description: 'Reversibility of the harm. Omitted or null: partially_reversible, named in methodNotes.' },
            frequency: { type: 'string', enum: ['very_common', 'common', 'uncommon', 'rare', 'very_rare'], description: 'Frequency band; sets a default importance weight. Omitted with no weight: 0.6, named in methodNotes.' },
            uncertainty: { type: 'string', enum: ['low', 'moderate', 'high'], description: 'Uncertainty in the risk estimate; affects overall confidence.' + MIDDLE_VALUE },
            mitigated: { type: 'boolean', description: 'Whether a risk-mitigation measure meaningfully reduces this risk (~30% credit).' + NOT_STATED_UNDECIDED },
            weight: { type: 'number', description: 'Optional explicit importance weight from 0 to 1 (outside it is refused); overrides the frequency-derived default.' },
            population: { type: 'string', description: 'Population/subgroup in which the risk concentrates.' },
          },
          required: ['name', 'severity'],
        },
      },
      riskMitigations: { type: 'array', items: { type: 'string' }, description: 'Risk-mitigation measures in place (label warnings, REMS, monitoring, controlled distribution).' },
      specialPopulations: { type: 'array', items: { type: 'string' }, description: 'Populations of special interest (subgroups) for which heterogeneity of the balance should be checked.' },
    },
    required: ['productName', 'indication', 'benefits', 'risks'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. design_value_tree
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_VALUE_TREE: AnaTool = {
  name: 'design_value_tree',
  description:
    'Design a PrOACT-URL / IMI PROTECT BRAT value tree for a benefit-risk decision: the decision ' +
    'objective decomposes into benefit and risk branches, each criterion operationalized by an ' +
    'outcome measure and unit. Returns the benefit and risk criteria, the decision alternatives, ' +
    'the recommended weighting approach (qualitative, swing weighting or full MCDA) with guidance, ' +
    'the PrOACT-URL element mapping (Problem, Objectives, Alternatives, Consequences, Trade-offs, ' +
    'Uncertainty, Risk attitude, Linked decisions) and a tree narrative. With swing weighting or ' +
    'MCDA and importance ranks, it computes normalized swing weights (rank 1 → 100 points, ' +
    'inverse-linear, summing to 1). Grounded in the PrOACT-URL framework, IMI PROTECT WP5 / BRAT ' +
    'and MCDA swing-weighting methodology. Use to structure a benefit-risk decision into a value ' +
    'tree, or choose and apply a weighting approach. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      productName: { type: 'string', description: 'Name of the product.' },
      indication: { type: 'string', description: 'Indication / condition for the decision.' },
      decisionObjective: { type: 'string', description: 'The overall decision objective (root of the tree). Defaults to determining the benefit-risk balance.' },
      criteria: {
        type: 'array',
        description: 'Benefit and risk criteria (the branches and leaves of the value tree).',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the criterion.' },
            type: { type: 'string', enum: ['benefit', 'risk'], description: 'Whether the criterion is a benefit or a risk attribute.' },
            outcomeMeasure: { type: 'string', description: 'Outcome measure / endpoint operationalizing the criterion.' },
            unit: { type: 'string', description: 'Unit of the outcome measure.' },
            importanceRank: { type: 'number', description: 'Importance ranking, a whole number (1 = most important); used to derive normalized swing weights.' },
            subCriteria: { type: 'array', items: { type: 'string' }, description: 'Sub-criteria if the criterion decomposes further.' },
          },
          required: ['name', 'type'],
        },
      },
      weightingApproach: {
        type: 'string',
        enum: ['qualitative', 'swing_weighting', 'mcda'],
        description:
          'Weighting approach to recommend/apply. Omitted or null: swing_weighting, said in methodNotes. Qualitative ' +
          'yields no numeric weights; swing_weighting and mcda compute normalized swing weights when ranks are supplied.',
      },
      alternatives: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Decision alternatives being compared (e.g., product vs comparator vs no treatment). ' +
          'Defaults to [product, comparator/standard of care, no treatment].',
      },
    },
    required: ['productName', 'indication', 'criteria'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. assess_br_uncertainty
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_BR_UNCERTAINTY: AnaTool = {
  name: 'assess_br_uncertainty',
  description:
    'Assess the uncertainty around a benefit-risk conclusion. Takes the declared uncertainty ' +
    'sources (data quality/bias, extrapolation, rare serious events, indirect evidence, ' +
    'surrogate-endpoint translation, missing data, external validity, subgroup heterogeneity, ' +
    'long-term efficacy/safety, comparator relevance), grades each source\'s impact on the balance, ' +
    'and judges how robust the conclusion is (robust / sensitive / fragile) from their count and ' +
    'severity and the net benefit-risk margin. Returns what would change the conclusion, ' +
    'recommended sensitivity analyses (including a tornado diagram) and the residual uncertainty to ' +
    'carry into the label / risk management plan as missing information. Grounded in EMA ' +
    'benefit-risk methodology, IMI PROTECT, the FDA framework, PrOACT-URL and ICH E2C(R2). Use to ' +
    'stress-test a benefit-risk conclusion or document its uncertainties. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      productName: { type: 'string', description: 'Name of the product.' },
      indication: { type: 'string', description: 'Indication / condition under assessment.' },
      currentVerdict: { type: 'string', enum: ['favourable', 'favourable_with_conditions', 'indeterminate', 'unfavourable'], description: 'The current best-estimate benefit-risk verdict to stress-test. Not read: it does not change the result.' },
      netBalanceEstimate: {
        type: 'number',
        description:
          'Net benefit-risk margin from the balance assessment (e.g., from assess_benefit_risk_balance). ' +
          'A smaller absolute margin makes the conclusion more sensitive/fragile. ' +
          'Without it, robustness is not assessed; no margin is assumed.',
      },
      sources: {
        type: 'array',
        description: 'The uncertainty sources to assess.',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: [
                'data_quality',
                'extrapolation',
                'rare_events',
                'indirect_evidence',
                'surrogate_endpoint',
                'missing_data',
                'external_validity',
                'subgroup',
                'long_term',
                'comparator',
              ],
              description: 'Category of the uncertainty source.',
            },
            description: { type: 'string', description: 'Optional free-text description; a category-specific default is used if omitted.' },
            affects: { type: 'string', enum: ['benefit', 'risk', 'both'], description: 'Which side of the balance the uncertainty mainly affects. If omitted, it is not stated; no affected side is assumed.' },
            level: {
              type: 'string',
              enum: ['low', 'moderate', 'high'],
              description:
                'Magnitude of the uncertainty. If omitted, the source is reported with no stated level and the ' +
                'overall grade and robustness it would decide are not assessed; no level is assumed.',
            },
          },
          required: ['type'],
        },
      },
    },
    required: ['productName', 'indication', 'sources'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. plan_br_communication
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_BR_COMMUNICATION: AnaTool = {
  name: 'plan_br_communication',
  description:
    'Build a benefit-risk communication plan across audiences. For each audience (product label, ' +
    'advisory committee, prescribers, patients/caregivers, payers/HTA, internal regulatory review) ' +
    'returns the framing, format, must-include content and cautions: e.g. ' +
    'natural-frequency/icon-array framing and no relative-risk-only presentation for patients, and ' +
    'even-handed presentation with explicit uncertainties for advisory committees. Recommends a ' +
    'visual-summary approach (EMA effects table, forest plot, value-tree/MCDA diagram, icon array, ' +
    'tornado diagram), and one core benefit-risk message every artifact restates without ' +
    'overstating benefit. Grounded in the FDA framework and Patient-Focused Drug Development ' +
    'guidance, EPAR communication, IMI PROTECT visualization recommendations and CIOMS VI. Use to ' +
    'plan how to communicate a benefit-risk conclusion to its audiences. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      productName: { type: 'string', description: 'Name of the product.' },
      indication: { type: 'string', description: 'Indication / condition for the communication.' },
      verdict: {
        type: 'string',
        enum: ['favourable', 'favourable_with_conditions', 'indeterminate', 'unfavourable'],
        description:
          'The benefit-risk conclusion to communicate. It is the sponsor\'s: pass only the conclusion the user ' +
          'has stated; do not choose or infer one. Without it the tool returns needs_parameters.',
      },
      keyBenefitMessages: { type: 'array', items: { type: 'string' }, description: 'The key benefit messages to frame in the core benefit-risk message.' },
      keyRiskMessages: { type: 'array', items: { type: 'string' }, description: 'The key risk messages to frame in the core benefit-risk message.' },
      audiences: {
        type: 'array',
        items: { type: 'string', enum: ['label', 'advisory_committee', 'prescriber', 'patient', 'payer', 'regulator_internal'] },
        description:
          'Audiences to plan communication for. Defaults to the full set ' +
          '(label, advisory_committee, prescriber, patient, payer, regulator_internal).',
      },
      includeVisualSummary: { type: 'boolean', description: 'Whether to include visual-summary recommendations. Omitted or null stays not_stated, and they are included (said in methodNotes).' },
      patientExperienceDataAvailable: {
        type: 'boolean',
        description:
          'Whether patient-experience / PFDD data are available to inform patient framing (which outcomes patients value most). ' +
          'Omitted or null stays not_stated, and the patient framing says so.',
      },
    },
    required: ['productName', 'indication'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Collected array — spread into ALL_ANA_TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/** Structured benefit-risk assessment tools, spread into ALL_ANA_TOOLS. */
export const BENEFIT_RISK_TOOLS: AnaTool[] = [
  STRUCTURE_BENEFIT_RISK_FRAMEWORK,
  BUILD_EFFECTS_TABLE,
  ASSESS_BENEFIT_RISK_BALANCE,
  DESIGN_VALUE_TREE,
  ASSESS_BR_UNCERTAINTY,
  PLAN_BR_COMMUNICATION,
];
