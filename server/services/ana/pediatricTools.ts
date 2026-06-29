/**
 * Pediatric Development tools — exposes the deterministic pediatric knowledge
 * engines in `server/services/pediatric/pediatric-knowledge.ts` to AnA as
 * first-class, selectable tools.
 *
 * These engines encode the ICH E11(R1) pediatric age classification,
 * FDA PREA / EMA Paediatric Regulation requirements, the FDA/EMA
 * extrapolation decision framework, age-appropriate formulation selection
 * with excipient safety assessment, maturation-adjusted dose scaling,
 * and regulatory/ethical obligations for pediatric drug development.
 *
 * Every function is a closed-form lookup or rule-based computation over an
 * in-code regulatory corpus — no LLM, no network, no database. Identical
 * input always produces identical output, making results reproducible and
 * submission-defensible. Handlers live in AnaToolExecutor.ts
 * (registerToolHandler) and dynamic-import `../pediatric/pediatric-knowledge`.
 *
 * Tools:
 *   classify_pediatric_age           — ICH E11(R1) age-band classification + PK implications
 *   design_pediatric_investigation   — PIP/PSP structure + studies + deferral/waiver
 *   assess_pediatric_extrapolation   — extrapolation feasibility + study requirements
 *   select_pediatric_formulation     — age-appropriate formulation + excipient safety
 *   select_pediatric_dose            — dose scaling + method selection + safety
 *   assess_pediatric_requirements    — regulatory obligations + ethics + timeline
 *
 * @module server/services/ana/pediatricTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic — identical input always yields identical output. No LLM, no network.';

// ─────────────────────────────────────────────────────────────────────────────
// Tool 1: Classify Pediatric Age
// ─────────────────────────────────────────────────────────────────────────────

export const CLASSIFY_PEDIATRIC_AGE: AnaTool = {
  name: 'classify_pediatric_age',
  description:
    'Classify a patient into the correct ICH E11(R1) pediatric age band (preterm neonate, term neonate 0-27 days, infant 28 days-23 months, child 2-11 years, adolescent 12-17 years) and return comprehensive developmental pharmacology considerations for that age band. Returns: age band classification, developmental considerations (organ maturation, CNS development), pharmacokinetic implications (renal GFR maturation per Rhodin et al., hepatic CYP ontogeny — CYP3A4/CYP3A7/CYP1A2/CYP2D6/CYP2C9/CYP2C19/CYP2E1/UGT per Hines 2008, body composition water-to-fat ratios per Friis-Hansen), age-appropriate formulation preferences, and consent/assent requirements. Use this tool whenever a user asks about pediatric age classification, developmental pharmacology, or PK considerations for a specific pediatric age. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      ageValue: {
        type: 'number',
        description: 'Numeric age value. Interpretation depends on ageUnit.',
      },
      ageUnit: {
        type: 'string',
        enum: ['weeks_gestational', 'days', 'months', 'years'],
        description: "Unit of the age value. Use 'weeks_gestational' for gestational age in preterm assessment, 'days' for neonates (0-27), 'months' for infants (1-23), 'years' for children and adolescents.",
      },
      gestationalAge: {
        type: 'number',
        description: 'Gestational age in weeks at birth. Required for neonates (ageUnit = days) to distinguish preterm (<37 weeks) from term (≥37 weeks) neonates. Optional for other age units.',
      },
    },
    required: ['ageValue', 'ageUnit'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Tool 2: Design Pediatric Investigation Plan (PIP) / Pediatric Study Plan (PSP)
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_PEDIATRIC_INVESTIGATION: AnaTool = {
  name: 'design_pediatric_investigation',
  description:
    'Design a Pediatric Investigation Plan (PIP, EMA/PDCO) or Pediatric Study Plan (PSP, FDA) for a drug in development. Returns: complete regulatory framework (FDA PREA requirements per 21 USC §355c, EMA Paediatric Regulation EC No 1901/2006), PIP/PSP structure (quality/formulation, nonclinical/juvenile animal studies per ICH S11, clinical studies), list of required studies per age band with design recommendations (population PK, efficacy, safety), deferral/waiver assessment (full waiver, partial waiver, class waiver per EMA Commission Decision C(2015) 6600, deferral), and submission timing relative to adult development milestones. Use when planning pediatric development strategy, preparing a PIP/PSP submission, or assessing deferral/waiver eligibility. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      drugName: {
        type: 'string',
        description: 'Name of the drug or active substance.',
      },
      therapeuticArea: {
        type: 'string',
        enum: [
          'oncology', 'infectious_disease', 'neurology', 'cardiology',
          'endocrinology', 'respiratory', 'gastroenterology', 'dermatology',
          'immunology', 'rare_disease', 'hematology', 'nephrology',
          'psychiatry', 'other',
        ],
        description: 'Therapeutic area of the drug.',
      },
      indication: {
        type: 'string',
        description: 'Proposed indication (e.g., "treatment of moderate-to-severe atopic dermatitis").',
      },
      targetAgeBands: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['preterm_neonate', 'term_neonate', 'infant', 'child', 'adolescent'],
        },
        description: 'ICH E11(R1) age bands targeted for pediatric development.',
      },
      isOrphan: {
        type: 'boolean',
        description: 'Whether the drug has orphan designation (FDA or EMA). Affects deferral/waiver assessment and incentive calculations.',
      },
      adultApprovalStatus: {
        type: 'string',
        enum: ['pre_approval', 'approved', 'under_review'],
        description: "Current status of the adult indication: 'pre_approval' (still in clinical development), 'approved' (adult MA granted), 'under_review' (NDA/MAA under regulatory review).",
      },
      routeOfAdministration: {
        type: 'string',
        description: 'Route of administration (e.g., "oral", "intravenous", "subcutaneous", "inhaled").',
      },
      mechanismOfAction: {
        type: 'string',
        description: 'Brief description of the mechanism of action (e.g., "selective JAK1 inhibitor", "anti-PD-1 monoclonal antibody"). Helps determine nonclinical study requirements.',
      },
      condition: {
        type: 'string',
        description: 'Specific disease/condition name for class waiver check against the EMA class waiver list (e.g., "Alzheimer disease", "benign prostatic hyperplasia").',
      },
    },
    required: ['drugName', 'therapeuticArea', 'indication', 'targetAgeBands', 'adultApprovalStatus', 'routeOfAdministration'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Tool 3: Assess Pediatric Extrapolation
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_PEDIATRIC_EXTRAPOLATION: AnaTool = {
  name: 'assess_pediatric_extrapolation',
  description:
    'Assess the feasibility of extrapolating adult efficacy data to a pediatric population using the FDA/EMA extrapolation decision framework (FDA Guidance 2016, EMA Reflection Paper EMA/199678/2016). Evaluates two axes: (1) disease progression similarity between adults and children, and (2) drug response (exposure-response) similarity. Returns: extrapolation level (full extrapolation, partial with PK+PD, partial with PK+efficacy, or no extrapolation/full program), detailed rationale citing regulatory precedents, specific study requirements, Bayesian borrowing feasibility and approach (informative prior, commensurate prior, power prior per Gamalo-Siebers et al. 2017), evidence package needed, and precedent examples from FDA/EMA approvals. Use when planning a pediatric clinical program to determine the minimum necessary studies. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      indication: {
        type: 'string',
        description: 'Therapeutic indication being extrapolated (e.g., "moderate-to-severe asthma", "HIV-1 infection").',
      },
      therapeuticArea: {
        type: 'string',
        enum: [
          'oncology', 'infectious_disease', 'neurology', 'cardiology',
          'endocrinology', 'respiratory', 'gastroenterology', 'dermatology',
          'immunology', 'rare_disease', 'hematology', 'nephrology',
          'psychiatry', 'other',
        ],
        description: 'Therapeutic area.',
      },
      targetAgeBands: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['preterm_neonate', 'term_neonate', 'infant', 'child', 'adolescent'],
        },
        description: 'Target pediatric age bands. Neonates reduce extrapolation feasibility (disease pathophysiology often differs).',
      },
      diseaseProgressionSimilar: {
        type: ['boolean', 'null'],
        description: "Whether disease progression is similar between adults and the target pediatric population. true = similar, false = different, null = uncertain/unknown. The engine has built-in knowledge for common conditions; set null to use the internal assessment.",
      },
      drugResponseSimilar: {
        type: ['boolean', 'null'],
        description: "Whether the exposure-response relationship is similar. true = similar, false = different, null = uncertain/unknown. Set null to use the engine's internal assessment based on the condition and therapeutic area.",
      },
      mechanismOfAction: {
        type: 'string',
        description: 'Drug mechanism of action. Helps assess whether the molecular target is relevant across ages.',
      },
      adultEfficacyEstablished: {
        type: 'boolean',
        description: 'Whether adult efficacy has been established in adequate and well-controlled trials. Prerequisite for extrapolation.',
      },
      biomarkerAvailable: {
        type: 'boolean',
        description: 'Whether a validated biomarker or surrogate endpoint is available that could support PK/PD bridging instead of a full efficacy trial.',
      },
      condition: {
        type: 'string',
        description: 'Specific condition name for matching against the internal extrapolation knowledge base (e.g., "hypertension", "asthma", "crohn_disease", "hiv").',
      },
    },
    required: ['indication', 'therapeuticArea', 'targetAgeBands', 'adultEfficacyEstablished'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Tool 4: Select Pediatric Formulation
// ─────────────────────────────────────────────────────────────────────────────

export const SELECT_PEDIATRIC_FORMULATION: AnaTool = {
  name: 'select_pediatric_formulation',
  description:
    'Select age-appropriate formulations for a pediatric drug product per EMA Reflection Paper (EMA/CHMP/QWP/805880/2012 Rev. 2) and assess excipient safety. Returns: ranked formulation recommendations by age band (oral solution, oral suspension, mini-tablet, orodispersible tablet/film, granules/sprinkle, chewable tablet, conventional tablet, capsule, injectable, inhaled, etc.) with suitability rating and acceptability evidence (e.g., Klingmann 2015 mini-tablet swallowability data), excipient safety assessment against EMA/STEP database limits (ethanol, benzyl alcohol, propylene glycol, parabens, polysorbate 80, cyclodextrins, sorbitol, aspartame, saccharin), palatability requirements, and dosing device specifications. Use when developing a pediatric formulation strategy, assessing excipient safety, or preparing the quality/pharmaceutical section of a PIP. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      targetAgeBands: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['preterm_neonate', 'term_neonate', 'infant', 'child', 'adolescent'],
        },
        description: 'Target ICH E11(R1) age bands. Formulation recommendations are driven by the youngest age band.',
      },
      routeOfAdministration: {
        type: 'string',
        enum: ['oral', 'parenteral', 'topical', 'inhaled', 'rectal', 'nasal'],
        description: 'Intended route of administration.',
      },
      drugProperties: {
        type: 'object',
        description: 'Optional physicochemical and taste properties of the drug substance.',
        properties: {
          solubility: {
            type: 'string',
            enum: ['high', 'low'],
            description: "BCS-style solubility classification. 'low' favors suspension or solid dosage forms.",
          },
          stability: {
            type: 'string',
            enum: ['stable', 'unstable_solution'],
            description: "Solution stability. 'unstable_solution' favors suspension, powder for reconstitution, or solid forms.",
          },
          tasteProfile: {
            type: 'string',
            enum: ['neutral', 'bitter', 'unpleasant'],
            description: "Taste of the active ingredient. 'bitter' or 'unpleasant' triggers taste-masking recommendations (coating, complexation, flavor optimization).",
          },
          doseRange: {
            type: 'string',
            description: 'Expected pediatric dose range (e.g., "0.5-20 mg") to assess whether formulation allows accurate dosing across the range.',
          },
        },
      },
      proposedExcipients: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of proposed excipients to check against pediatric safety limits (e.g., ["ethanol", "propylene glycol", "benzyl alcohol", "polysorbate 80"]).',
      },
    },
    required: ['targetAgeBands', 'routeOfAdministration'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Tool 5: Select Pediatric Dose
// ─────────────────────────────────────────────────────────────────────────────

export const SELECT_PEDIATRIC_DOSE: AnaTool = {
  name: 'select_pediatric_dose',
  description:
    'Select an appropriate pediatric dose scaling method and provide dosing recommendations based on the drug characteristics, target age band, and elimination pathway. Evaluates: linear weight-based scaling, allometric scaling (exponent 0.75, West et al. 1997), maturation-adjusted allometric scaling (Anderson & Holford 2008 — MF from CYP ontogeny or GFR maturation), BSA-based scaling, PBPK-predicted dosing (FDA PBPK Guidance 2018), age-based dosing, and therapeutic drug monitoring (TDM). Returns: recommended scaling method with rationale, dose formula with adjustment factors (CYP maturation status, GFR percentage of adult, body composition effects), dose banding recommendations for practical administration, safety considerations (maximum dose caps, neonatal extended intervals, growth monitoring), and TDM guidance. Use when determining starting doses for pediatric PK studies, designing dose-finding studies, or preparing dosing sections of pediatric labeling. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      targetAgeBand: {
        type: 'string',
        enum: ['preterm_neonate', 'term_neonate', 'infant', 'child', 'adolescent'],
        description: 'Target ICH E11(R1) age band for dose selection.',
      },
      adultDose: {
        type: 'number',
        description: 'Approved or anticipated adult dose (numeric value).',
      },
      adultDoseUnit: {
        type: 'string',
        description: 'Unit of the adult dose (e.g., "mg", "mg/kg", "mg/m²", "mcg").',
      },
      adultWeight: {
        type: 'number',
        description: 'Reference adult weight in kg used for scaling (typically 70 kg).',
      },
      childWeight: {
        type: 'number',
        description: 'Target child weight in kg. Used for weight-based and allometric calculations.',
      },
      childAge: {
        type: 'number',
        description: 'Child age in years (or fraction of years). Used for maturation factor estimation.',
      },
      childBSA: {
        type: 'number',
        description: 'Child body surface area in m². Used for BSA-based scaling. Standard adult BSA = 1.73 m².',
      },
      primaryEliminationRoute: {
        type: 'string',
        enum: ['renal', 'hepatic', 'mixed', 'unchanged'],
        description: "Primary route of elimination. 'renal' uses GFR maturation data; 'hepatic' uses CYP ontogeny data; 'mixed' considers both; 'unchanged' (excreted unchanged) uses renal maturation.",
      },
      hepaticCYP: {
        type: 'string',
        description: 'Primary hepatic CYP isoform responsible for metabolism (e.g., "CYP3A4", "CYP2D6", "CYP1A2", "CYP2C9", "CYP2C19", "CYP2E1", "UGT1A1", "UGT2B7"). Used to look up age-specific maturation data.',
      },
      narrowTherapeuticIndex: {
        type: 'boolean',
        description: 'Whether the drug has a narrow therapeutic index (e.g., aminoglycosides, vancomycin, phenytoin, cyclosporine, tacrolimus, warfarin). Triggers TDM recommendation.',
      },
      pbpkAvailable: {
        type: 'boolean',
        description: 'Whether a qualified PBPK model is available for pediatric dose prediction. If true, PBPK is recommended as the primary method.',
      },
      scalingMethodPreference: {
        type: 'string',
        enum: [
          'linear_weight', 'allometric_0.75', 'allometric_maturation',
          'bsa_based', 'age_based', 'pbpk_predicted', 'therapeutic_drug_monitoring',
        ],
        description: 'Optional preference for a specific scaling method. If provided, the engine uses this method and provides its rationale.',
      },
    },
    required: ['targetAgeBand', 'adultDose', 'adultDoseUnit', 'adultWeight', 'primaryEliminationRoute', 'narrowTherapeuticIndex'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Tool 6: Assess Pediatric Regulatory & Ethical Requirements
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_PEDIATRIC_REQUIREMENTS: AnaTool = {
  name: 'assess_pediatric_requirements',
  description:
    'Assess comprehensive regulatory obligations, ethical requirements, and development timelines for a pediatric drug program. Returns: FDA PREA obligations (21 USC §355c — mandatory pediatric studies for NMEs/new indications) with Written Request and Pediatric Exclusivity details (6-month patent extension per 21 USC §355a), EMA PDCO obligations (EC No 1901/2006 — PIP requirement, PUMA rewards, SPC extension, orphan +2 years market exclusivity), ethical requirements (informed consent model by age per 21 CFR 50 Subpart D and EU CTR Article 32, assent age thresholds, minimal risk definitions, IRB/EC pediatric expertise requirements, blood volume limits, additional safeguards), orphan drug incentive calculations (FDA 7+0.5 years, EMA 10+2 years), and detailed timelines for PIP/PSP submission, study completion, and data submission. Use when planning regulatory strategy, preparing ethics submissions, or assessing incentive value for pediatric development. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      drugName: {
        type: 'string',
        description: 'Name of the drug or active substance.',
      },
      therapeuticArea: {
        type: 'string',
        enum: [
          'oncology', 'infectious_disease', 'neurology', 'cardiology',
          'endocrinology', 'respiratory', 'gastroenterology', 'dermatology',
          'immunology', 'rare_disease', 'hematology', 'nephrology',
          'psychiatry', 'other',
        ],
        description: 'Therapeutic area.',
      },
      indication: {
        type: 'string',
        description: 'Proposed indication for the pediatric population.',
      },
      targetAgeBands: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['preterm_neonate', 'term_neonate', 'infant', 'child', 'adolescent'],
        },
        description: 'Target ICH E11(R1) pediatric age bands.',
      },
      isOrphan: {
        type: 'boolean',
        description: 'Whether the drug has orphan designation. Affects incentive calculations: FDA orphan exclusivity 7 years + 6 months pediatric; EMA orphan 10 years + 2 years for completed PIP.',
      },
      isNewMolecularEntity: {
        type: 'boolean',
        description: 'Whether this is a new molecular entity / new active substance. Determines whether PREA is mandatory or Written Request is the mechanism.',
      },
      hasAdultApproval: {
        type: 'boolean',
        description: 'Whether the drug is already approved for an adult indication. Affects timeline recommendations and post-marketing requirement structure.',
      },
      targetJurisdictions: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['FDA', 'EMA', 'PMDA', 'NMPA', 'Health_Canada'],
        },
        description: 'Regulatory jurisdictions where pediatric approval will be sought. Determines which regulatory framework requirements to include.',
      },
    },
    required: ['drugName', 'therapeuticArea', 'indication', 'targetAgeBands', 'isNewMolecularEntity', 'hasAdultApproval', 'targetJurisdictions'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Aggregated export
// ─────────────────────────────────────────────────────────────────────────────

/** All pediatric-development tools, spread into ALL_ANA_TOOLS. */
export const PEDIATRIC_TOOLS: AnaTool[] = [
  CLASSIFY_PEDIATRIC_AGE,
  DESIGN_PEDIATRIC_INVESTIGATION,
  ASSESS_PEDIATRIC_EXTRAPOLATION,
  SELECT_PEDIATRIC_FORMULATION,
  SELECT_PEDIATRIC_DOSE,
  ASSESS_PEDIATRIC_REQUIREMENTS,
];
