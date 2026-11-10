/**
 * Bioequivalence & Generic Drug tools — exposes the deterministic knowledge
 * engines in `server/services/bioequivalence/bioequivalence-knowledge` to AnA
 * as first-class, selectable tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
 * A true/false input reads true, false or not_stated (inputStates) and decides
 * nothing an answer could change; a malformed value is refused by field
 * (Rule 2 S5d, 2026-11-09).
 *
 * Tools:
 *   classify_bcs                  — BCS classification + biowaiver eligibility
 *   design_be_study               — BE study design recommendation + sample size
 *   assess_dissolution_similarity — f2/f1 similarity factor calculation
 *   assess_biowaiver              — Biowaiver eligibility decision engine
 *   guidance_for_anda             — ANDA/505(b)(2) pathway guidance
 *
 * @module server/services/ana/bioequivalenceTools
 */

import type { AnaTool } from '../ai-gateway/types';

const DETERMINISTIC_NOTE =
  'Deterministic, no LLM: report the returned numbers and citations verbatim. If a parameter is missing or ' +
  'invalid, relay the validation error and ask the user for the correct value.';

/** What an omitted (or null) boolean means; a malformed one is refused by field. */
const NOT_STATED = ' Omitted or null stays not_stated, and the result names it where it applies.';
const NTI_LIST = 'the platform\'s NTI list, which is not exhaustive';

// ─────────────────────────────────────────────────────────────────────────────
// 1. classify_bcs
// ─────────────────────────────────────────────────────────────────────────────

export const CLASSIFY_BCS: AnaTool = {
  name: 'classify_bcs',
  description:
    'Classify a drug substance according to the Biopharmaceutics Classification System ' +
    '(BCS Class I-IV) based on solubility and permeability data, and determine biowaiver ' +
    'eligibility under FDA, EMA, and ICH M9 frameworks. Returns the BCS class, dose-number ' +
    'volume, biowaiver eligibility with conditions, the NTI check and its basis (the drug name on ' +
    NTI_LIST + '), required dissolution conditions for a biowaiver, and regulatory citations ' +
    '(21 CFR 320.22, FDA BCS Guidance 2017, ICH M9 2019). Eligibility is null while the drug name ' +
    'or dosage form it turns on is not stated. Use when the user asks about BCS classification, ' +
    'biowaiver eligibility, or whether an in vivo BE study can be waived for an immediate-release ' +
    'solid oral dosage form. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      highestDoseStrength_mg: {
        type: 'number',
        description:
          'Highest single dose strength of the drug product in milligrams (mg). ' +
          'This is the highest marketed or proposed strength, not the maximum daily dose.',
      },
      solubility_mg_per_mL: {
        type: 'number',
        description:
          'Solubility of the drug substance at the LEAST favorable pH across the ' +
          'physiological range (pH 1.2, 4.5, 6.8) at 37 +/- 1 C, in mg/mL. ' +
          'Use the minimum solubility value across the three pH conditions.',
      },
      fractionAbsorbed: {
        type: 'number',
        description:
          'Fraction of the oral dose absorbed in humans (0 to 1). A value >= 0.85 ' +
          'classifies the drug as high permeability. Can be determined from absolute ' +
          'bioavailability, mass balance, or validated in vitro permeability models (Caco-2, MDCK).',
      },
      drugName: {
        type: 'string',
        description:
          'Name of the drug substance (optional). Checked against ' + NTI_LIST + '; NTI drugs are ' +
          'excluded from BCS-based biowaivers. Without it, NTI status and so eligibility are not assessed.',
      },
      dosageForm: {
        type: 'string',
        description:
          'Dosage form of the product (e.g., "tablet", "capsule", "immediate-release tablet"). ' +
          'BCS-based biowaivers apply only to immediate-release solid oral dosage forms; a modified-release ' +
          'form is not one. Without it, eligibility is not assessed.',
      },
    },
    required: ['highestDoseStrength_mg', 'solubility_mg_per_mL', 'fractionAbsorbed'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. design_be_study
// ─────────────────────────────────────────────────────────────────────────────

export const DESIGN_BE_STUDY: AnaTool = {
  name: 'design_be_study',
  description:
    'Recommend a bioequivalence study design based on within-subject variability, ' +
    'elimination half-life, NTI status, and number of formulations to compare. Returns the design ' +
    '(2x2 crossover, replicate 3-period or 4-period, partial replicate, parallel, 3x3/4x4 Williams), ' +
    'acceptance criteria (80-125% or tighter for NTI drugs, scaled for HVDs), a closed-form sample ' +
    'size estimate, washout, study conditions, inputStates, the defaults applied ' +
    'and citations (21 CFR 320.26, FDA Statistical Approaches 2001, EMA/CHMP/QWP/428693/2017). ' +
    'NTI status is stated, or taken from the drug name on ' + NTI_LIST + '; with neither, the ' +
    'acceptance criteria and sample size are null. Use to plan a BE study, determine sample size, ' +
    'select a design for a highly variable drug, or understand acceptance criteria for an NTI drug. ' +
    DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      withinSubjectCV: {
        type: 'number',
        description:
          'Expected within-subject coefficient of variation (CVw) as a percentage (e.g., 25 for 25%). ' +
          'Drugs with CVw > 30% are classified as highly variable drugs (HVDs) and may qualify for ' +
          'reference-scaled average bioequivalence (RSABE) with a replicate design.',
      },
      halfLife_hours: {
        type: 'number',
        description:
          'Elimination half-life of the drug in hours. Determines washout period ' +
          '(minimum 5 half-lives) and whether a parallel design is needed (half-life > 72 hours).',
      },
      isNTI: {
        type: 'boolean',
        description:
          'Whether the drug is a narrow therapeutic index (NTI) drug. NTI drugs have ' +
          'tighter acceptance criteria (90.00-111.11% instead of 80.00-125.00%). Omitted or null ' +
          'stays not_stated: NTI status is then taken from drugName on ' + NTI_LIST + ', and with no ' +
          'drugName the acceptance criteria and sample size are null.',
      },
      drugName: {
        type: 'string',
        description:
          'Name of the drug substance (optional). Looked up on ' + NTI_LIST + ' when isNTI is not stated.',
      },
      expectedGMR: {
        type: 'number',
        description:
          'Expected geometric mean ratio of test-to-reference (T/R) as a percentage. If omitted, ' +
          '100 is used and defaultsApplied says so. Values far from 100 increase required sample size; ' +
          'outside the acceptance limits none is computed.',
      },
      targetPower: {
        type: 'number',
        description:
          'Target statistical power, between 0 and 1 (e.g., 0.80 or 0.90). If omitted, 0.80 is used and ' +
          'defaultsApplied says so. Higher power requires larger sample sizes.',
      },
      dosageForm: {
        type: 'string',
        description:
          'Dosage form type (e.g., "immediate-release tablet", "extended-release capsule"). ' +
          'Modified-release products typically require both fasting and fed BE studies.',
      },
      fedStudyRequired: {
        type: 'boolean',
        description:
          'Whether a fed-state BE study is required in addition to fasting (e.g., products with ' +
          'food-effect labeling).' + NOT_STATED,
      },
      formulationsToCompare: {
        type: 'number',
        description:
          'Number of formulations to compare (2 or more: 3 for T1 vs. T2 vs. R, 4 for four-way). If ' +
          'omitted, 2 (test vs. reference) is used and defaultsApplied says so.',
      },
    },
    required: ['withinSubjectCV', 'halfLife_hours'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. assess_dissolution_similarity
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_DISSOLUTION_SIMILARITY: AnaTool = {
  name: 'assess_dissolution_similarity',
  description:
    'Compute the f2 similarity factor and f1 difference factor for two dissolution profiles (test ' +
    'vs. reference) the user supplies, with the regulatory reading: f2 >= 50 means similar (<= 10% ' +
    'mean difference). At most one time point at or above 85% dissolved is ' +
    'included; very rapidly dissolving products (>= 85% in 15 min) need no f2. Returns f2, f1, ' +
    'pass/fail (null when f2 is not computed), the interpretation and citations (FDA 1997, ' +
    'SUPAC-IR 1995, Moore & Flanner 1996, ICH M9). It REFUSES rather than computing a void number ' +
    'for profiles sampled at different times, fewer than three comparable time points, no unit count (never ' +
    'assumed to be 12), no SD or %RSD, or variability above the 20%/10% limits; relay the refusal ' +
    'verbatim. For recorded profiles use compare_recorded_dissolution, which reads the CMC ' +
    'dissolution register. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      reference: {
        type: 'object',
        description: 'Reference product dissolution profile.',
        properties: {
          timePoints_min: {
            type: 'array',
            items: { type: 'number' },
            description:
              'Dissolution sampling time points in minutes (e.g., [5, 10, 15, 20, 30, 45, 60]). ' +
              'Must match the time points used for the test product.',
          },
          meanDissolved: {
            type: 'array',
            items: { type: 'number' },
            description:
              'Mean percent dissolved at each time point (0-100). Must be the same length as timePoints_min.',
          },
          rsdPercent: {
            type: 'array',
            items: { type: 'number' },
            description:
              'Coefficient of variation (%RSD) at each time point. Without it (or sdPercent) the ' +
              '20% early / 10% later variability limits cannot be evaluated and f2 is REFUSED.',
          },
          sdPercent: {
            type: 'array',
            items: { type: 'number' },
            description: 'Absolute standard deviation at each time point, as an alternative to rsdPercent.',
          },
        },
        required: ['timePoints_min', 'meanDissolved'],
      },
      test: {
        type: 'object',
        description: 'Test product dissolution profile.',
        properties: {
          timePoints_min: {
            type: 'array',
            items: { type: 'number' },
            description:
              'Dissolution sampling time points in minutes. Must match the reference product time points.',
          },
          meanDissolved: {
            type: 'array',
            items: { type: 'number' },
            description:
              'Mean percent dissolved at each time point (0-100). Must be the same length as timePoints_min.',
          },
          rsdPercent: {
            type: 'array',
            items: { type: 'number' },
            description:
              'Coefficient of variation (%RSD) at each time point. Without it (or sdPercent) the ' +
              '20% early / 10% later variability limits cannot be evaluated and f2 is REFUSED.',
          },
          sdPercent: {
            type: 'array',
            items: { type: 'number' },
            description: 'Absolute standard deviation at each time point, as an alternative to rsdPercent.',
          },
        },
        required: ['timePoints_min', 'meanDissolved'],
      },
      unitsPerProduct: {
        type: 'number',
        description:
          'Number of individual dosage units tested per product. REQUIRED unless each ' +
          'timepoint carries its own count: it is never assumed to be 12, and f2 is refused ' +
          'without it. FDA recommends >= 12 units per product.',
      },
    },
    required: ['reference', 'test'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. assess_biowaiver
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESS_BIOWAIVER: AnaTool = {
  name: 'assess_biowaiver',
  description:
    'Evaluate whether an in vivo bioequivalence study can be waived (biowaiver) for an ' +
    'immediate-release solid oral form from the BCS class, dissolution, excipients and NTI status, ' +
    'per ICH M9 (which FDA and EMA apply). Returns GRANTED, CONDITIONAL, DENIED or NOT_ASSESSED, the ' +
    'rationale, required dissolution conditions, outstanding data, inputStates and citations. Handles ' +
    'Class I and III (strict excipient and very rapid dissolution criteria); denies Class II and IV, ' +
    'modified-release forms and NTI drugs. While an unstated true/false fact could change the decision it ' +
    'is NOT_ASSESSED, with the facts named. NTI status is stated or taken from the drug name on ' + NTI_LIST +
    ' (a stated false for a listed drug is a conflict). Use when the user asks whether a biowaiver is ' +
    'possible or what data are still needed. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      bcsClass: {
        type: 'string',
        enum: ['I', 'II', 'III', 'IV'],
        description: 'BCS classification of the drug substance (I, II, III, or IV).',
      },
      drugName: {
        type: 'string',
        description:
          'Name of the drug substance (optional). Looked up on ' + NTI_LIST + ' when isNTI is not stated.',
      },
      isNTI: {
        type: 'boolean',
        description:
          'Whether the drug is a narrow therapeutic index drug. NTI drugs are always ' +
          'excluded from BCS-based biowaivers regardless of BCS class. Omitted or null stays ' +
          'not_stated: NTI status is then taken from drugName, and with no drugName a decision it ' +
          'could change is NOT_ASSESSED, as it is when a stated false conflicts with the list.',
      },
      dosageForm: {
        type: 'string',
        description:
          'Dosage form (e.g., "tablet", "capsule", "immediate-release tablet"). ' +
          'Must be an IR solid oral dosage form for biowaiver eligibility.',
      },
      isWeakAcid: {
        type: 'boolean',
        description:
          'Whether the drug substance is a weak acid. Reported in inputStates but not read: ICH M9 has no ' +
          'BCS Class II weak-acid exception.' + NOT_STATED,
      },
      doseSolubilityRatioAtPH6_8_mL: {
        type: 'number',
        description:
          'Dose/solubility ratio at pH 6.8 in mL. Not read: ICH M9 has no BCS Class II weak-acid exception.',
      },
      veryRapidlyDissolving: {
        type: 'boolean',
        description:
          'Whether the TEST product dissolves >= 85% in 15 minutes in all three ' +
          'dissolution media (pH 1.2, 4.5, 6.8).' + NOT_STATED,
      },
      rapidlyDissolving: {
        type: 'boolean',
        description:
          'Whether the TEST product dissolves >= 85% in 30 minutes in all three ' +
          'dissolution media (pH 1.2, 4.5, 6.8).' + NOT_STATED,
      },
      referenceVeryRapidlyDissolving: {
        type: 'boolean',
        description:
          'Whether the REFERENCE product dissolves >= 85% in 15 minutes in all three ' +
          'media. Required for BCS Class III biowaiver.' + NOT_STATED,
      },
      f2: {
        type: 'number',
        description:
          'f2 similarity factor (0-100) from dissolution profile comparison, if available. ' +
          'f2 >= 50 indicates similarity. Use the assess_dissolution_similarity tool to compute.',
      },
      excipientsQualitativelySame: {
        type: 'boolean',
        description:
          'Whether the test product contains the same excipients (by type/function) as the ' +
          'RLD. Critical for BCS Class III biowaivers.' + NOT_STATED,
      },
      excipientsQuantitativelySimilar: {
        type: 'boolean',
        description:
          'Whether excipient quantities are within +/- 10% of the RLD amounts. ' +
          'Required for BCS Class III biowaivers per ICH M9.' + NOT_STATED,
      },
      framework: {
        type: 'string',
        enum: ['fda', 'ema', 'ich_m9', 'who'],
        description:
          'Regulatory framework the result is labelled with; the criteria are ICH M9\'s, which the FDA and ' +
          'the EMA apply (WHO criteria are not modelled). If omitted, ich_m9 is used and defaultsApplied says so.',
      },
    },
    required: ['bcsClass', 'dosageForm'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. guidance_for_anda
// ─────────────────────────────────────────────────────────────────────────────

export const GUIDANCE_FOR_ANDA: AnaTool = {
  name: 'guidance_for_anda',
  description:
    'Provide regulatory pathway guidance for a generic drug application. Determines ' +
    'whether to file an ANDA under 505(j), a 505(b)(2) NDA, or whether a suitability ' +
    'petition is needed, based on how the proposed product compares to the reference ' +
    'listed drug (RLD). Returns the pathway with its requirements, ' +
    'BE strategy recommendations (PK endpoint study, clinical endpoint, BCS biowaiver), ' +
    'Orange Book considerations (patent certifications, exclusivity), inputStates and citations ' +
    '(FD&C Act Section 505, 21 CFR 314/320, FDA Orange Book). Handles topical, ophthalmic, ' +
    'inhalation, modified-release and combination products and NTI drugs. While an unstated ' +
    'sameness fact could change the pathway it is not_assessed and the facts are named. Use when ' +
    'developing a generic drug to determine the filing pathway and study requirements. ' + DETERMINISTIC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      activeIngredient: {
        type: 'string',
        description: 'Name of the active pharmaceutical ingredient (API).',
      },
      dosageForm: {
        type: 'string',
        description:
          'Proposed dosage form (e.g., "tablet", "capsule", "cream", "ophthalmic solution", ' +
          '"metered-dose inhaler", "extended-release tablet").',
      },
      routeOfAdministration: {
        type: 'string',
        description:
          'Proposed route of administration (e.g., "oral", "topical", "ophthalmic", ' +
          '"inhalation", "intravenous"). Not read: the pathway reads sameRouteAsRLD.',
      },
      strengths: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Proposed strength(s) of the product (e.g., ["10 mg", "20 mg", "40 mg"]).',
      },
      sameDosageFormAsRLD: {
        type: 'boolean',
        description:
          'Whether the proposed product has the same dosage form as the RLD. ' +
          'Must be true for a standard ANDA; if false, a suitability petition or 505(b)(2) is needed. ' +
          'Omitted or null stays not_stated: a pathway it could change is not_assessed.',
      },
      sameRouteAsRLD: {
        type: 'boolean',
        description:
          'Whether the proposed product has the same route of administration as the RLD. ' +
          'A different route generally requires a 505(b)(2) NDA. Omitted or null stays not_stated: a ' +
          'pathway it could change is not_assessed.',
      },
      sameStrengthAsRLD: {
        type: 'boolean',
        description:
          'Whether the proposed product has the same strength(s) as the RLD. ' +
          'A different strength may require a suitability petition. Omitted or null stays not_stated: a ' +
          'pathway it could change is not_assessed.',
      },
      isCombinationProduct: {
        type: 'boolean',
        description:
          'Whether the product is a combination product with multiple active ingredients.' + NOT_STATED,
      },
      bcsClass: {
        type: 'string',
        enum: ['I', 'II', 'III', 'IV'],
        description:
          'BCS classification of the drug, if known. Informs BE strategy recommendation; if omitted, ' +
          'the strategy names both routes.',
      },
      isNTI: {
        type: 'boolean',
        description:
          'Whether the drug is a narrow therapeutic index drug. Affects acceptance criteria. Omitted or null ' +
          'stays not_stated: NTI status is then taken from activeIngredient on ' + NTI_LIST + '.',
      },
    },
    required: ['activeIngredient', 'dosageForm', 'strengths'],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Collected array — spread into ALL_ANA_TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/** Bioequivalence & generic drug tools, spread into ALL_ANA_TOOLS. */
export const BIOEQUIVALENCE_TOOLS: AnaTool[] = [
  CLASSIFY_BCS,
  DESIGN_BE_STUDY,
  ASSESS_DISSOLUTION_SIMILARITY,
  ASSESS_BIOWAIVER,
  GUIDANCE_FOR_ANDA,
];
