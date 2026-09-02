/**
 * Bioequivalence & Generic Drug tools — exposes the deterministic knowledge
 * engines in `server/services/bioequivalence/bioequivalence-knowledge` to AnA
 * as first-class, selectable tools.
 *
 * Every engine is pure, closed-form, and reproducible: no LLM, no network.
 * Handlers live in AnaToolExecutor.ts and dynamic-import the knowledge module.
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
  'Deterministic — identical input always yields identical output. No LLM, no network. ' +
  'Report the returned numbers and regulatory citations verbatim. Do NOT recompute, ' +
  'round differently, or substitute your own regulatory interpretation — a fabricated ' +
  'or misattributed regulatory citation in a generic drug submission is a critical defect.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. classify_bcs
// ─────────────────────────────────────────────────────────────────────────────

export const CLASSIFY_BCS: AnaTool = {
  name: 'classify_bcs',
  description:
    'Classify a drug substance according to the Biopharmaceutics Classification System ' +
    '(BCS Class I-IV) based on solubility and permeability data, and determine biowaiver ' +
    'eligibility under FDA, EMA, and ICH M9 frameworks. Returns the BCS class, dose-number ' +
    'volume, biowaiver eligibility with conditions, NTI drug check, required dissolution ' +
    'conditions for a biowaiver, and regulatory citations (21 CFR 320.22, FDA BCS Guidance ' +
    '2017, ICH M9 2019). Use when the user asks about BCS classification, biowaiver ' +
    'eligibility, or whether an in vivo BE study can be waived for an immediate-release ' +
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
          'Name of the drug substance (optional). Used to check against the narrow ' +
          'therapeutic index (NTI) drug list. NTI drugs are excluded from BCS-based biowaivers.',
      },
      dosageForm: {
        type: 'string',
        description:
          'Dosage form of the product (e.g., "tablet", "capsule", "immediate-release tablet"). ' +
          'BCS-based biowaivers apply only to immediate-release solid oral dosage forms.',
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
    'Recommend an optimal bioequivalence study design based on drug characteristics ' +
    'including within-subject variability, elimination half-life, NTI status, and number ' +
    'of formulations to compare. Returns the recommended design (2x2 crossover, replicate ' +
    '3-period or 4-period, partial replicate, parallel, 3x3/4x4 Williams), acceptance ' +
    'criteria (80-125% or tighter for NTI drugs, scaled for HVDs), closed-form sample ' +
    'size estimate, washout period guidance, study conditions, and regulatory citations ' +
    '(21 CFR 320.26, FDA Statistical Approaches Guidance 2001, EMA/CHMP/QWP/428693/2017). ' +
    'Use when the user needs to plan a BE study, determine sample size, select a study ' +
    'design for a highly variable drug, or understand acceptance criteria for an NTI drug. ' +
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
          'tighter acceptance criteria (90.00-111.11% instead of 80.00-125.00%). ' +
          'If not provided, the engine checks the drug name against a built-in NTI list.',
      },
      drugName: {
        type: 'string',
        description:
          'Name of the drug substance (optional). Used to auto-detect NTI status if isNTI is not specified.',
      },
      expectedGMR: {
        type: 'number',
        description:
          'Expected geometric mean ratio of test-to-reference (T/R) as a percentage. ' +
          'Default 100 (i.e., T and R are expected to be identical). Values far from 100 ' +
          'increase required sample size.',
      },
      targetPower: {
        type: 'number',
        description:
          'Target statistical power (0 to 1). Default 0.80. Common values: 0.80 (80%) or 0.90 (90%). ' +
          'Higher power requires larger sample sizes.',
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
          'Whether a fed-state BE study is required in addition to fasting. ' +
          'Default false. Set to true for products with food-effect labeling.',
      },
      formulationsToCompare: {
        type: 'number',
        description:
          'Number of formulations to compare in the study (default 2: test vs. reference). ' +
          'Set to 3 for a three-way comparison (e.g., T1 vs. T2 vs. R) or 4 for four-way.',
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
    'Compute the f2 similarity factor and f1 difference factor for two dissolution ' +
    'profiles (test vs. reference) and provide regulatory interpretation. The f2 factor ' +
    'is the primary FDA/EMA/ICH criterion for dissolution profile comparison: f2 >= 50 ' +
    'indicates similarity (equivalent to <= 10% mean difference at all time points). ' +
    'The engine applies the FDA rule that only one time point at or above 85% dissolved ' +
    'may be included. Also detects "very rapidly dissolving" products (>= 85% in 15 min) ' +
    'where f2 comparison is not required. Returns f2, f1, pass/fail for each, regulatory ' +
    'interpretation, warnings about methodology, and citations (FDA Dissolution Guidance ' +
    '1997, SUPAC-IR 1995, Moore & Flanner 1996, ICH M9). Use when the user has dissolution ' +
    'data and needs to determine if test and reference profiles are similar. ' +
    'REFUSES rather than computing a void number when the eligibility conditions are not met: ' +
    'profiles sampled at different times, fewer than three comparable timepoints after ' +
    'excluding t=0 and truncating above 85%, no recorded unit count (it is NEVER assumed to be ' +
    '12), no recorded SD or %RSD (without which the 20%/10% variability limits cannot be ' +
    'evaluated), or variability above those limits. Relay a refusal verbatim rather than ' +
    'restating the inputs as a conclusion. When the profiles are already ON FILE in the CMC ' +
    'dissolution register, use compare_recorded_dissolution instead, which reads them. ' + DETERMINISTIC_NOTE,
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
    'immediate-release solid oral dosage form based on BCS classification, dissolution ' +
    'behavior, excipient similarity, NTI status, and regulatory framework. Implements the ' +
    'complete decision tree from FDA BCS Guidance (2017), ICH M9 (2019), and EMA guidelines. ' +
    'Returns a three-level decision (GRANTED / CONDITIONAL / DENIED), detailed rationale, ' +
    'required dissolution conditions, outstanding data requirements, and regulatory citations. ' +
    'Handles BCS Class I (high sol/high perm — broadest eligibility), Class III (high sol/low ' +
    'perm — strict excipient and dissolution criteria), Class IIa weak acids (ICH M9 exception), ' +
    'and always denies for Class IV and NTI drugs. Use when the user asks whether a biowaiver ' +
    'is possible, what conditions must be met, or what data are still needed. ' + DETERMINISTIC_NOTE,
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
          'Name of the drug substance (optional). Used to auto-detect NTI status.',
      },
      isNTI: {
        type: 'boolean',
        description:
          'Whether the drug is a narrow therapeutic index drug. NTI drugs are always ' +
          'excluded from BCS-based biowaivers regardless of BCS class.',
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
          'Whether the drug substance is a weak acid (relevant for BCS Class IIa biowaiver ' +
          'under ICH M9). Weak acids with high solubility at pH 6.8 may qualify.',
      },
      doseSolubilityRatioAtPH6_8_mL: {
        type: 'number',
        description:
          'Dose/solubility ratio at pH 6.8 in mL (relevant for BCS Class IIa). ' +
          'If <= 250 mL, the drug qualifies as BCS Class IIa under ICH M9.',
      },
      veryRapidlyDissolving: {
        type: 'boolean',
        description:
          'Whether the TEST product dissolves >= 85% in 15 minutes in all three ' +
          'dissolution media (pH 1.2, 4.5, 6.8).',
      },
      rapidlyDissolving: {
        type: 'boolean',
        description:
          'Whether the TEST product dissolves >= 85% in 30 minutes in all three ' +
          'dissolution media (pH 1.2, 4.5, 6.8).',
      },
      referenceVeryRapidlyDissolving: {
        type: 'boolean',
        description:
          'Whether the REFERENCE product dissolves >= 85% in 15 minutes in all three ' +
          'media. Required for BCS Class III biowaiver.',
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
          'RLD. Critical for BCS Class III biowaivers.',
      },
      excipientsQuantitativelySimilar: {
        type: 'boolean',
        description:
          'Whether excipient quantities are within +/- 10% of the RLD amounts. ' +
          'Required for BCS Class III biowaivers per ICH M9.',
      },
      framework: {
        type: 'string',
        enum: ['fda', 'ema', 'ich_m9', 'who'],
        description:
          'Regulatory framework to apply (default "ich_m9"). Different frameworks have ' +
          'different biowaiver criteria, especially for BCS Class IIa and Class III.',
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
    'listed drug (RLD). Returns the recommended pathway with detailed requirements, ' +
    'BE strategy recommendations (PK endpoint study, clinical endpoint, BCS biowaiver), ' +
    'Orange Book considerations (patent certifications, exclusivity), and citations ' +
    '(FD&C Act Section 505, 21 CFR 314/320, FDA Orange Book). Handles special cases: ' +
    'topical/ophthalmic/inhalation products, modified-release formulations, combination ' +
    'products, NTI drugs. Use when the user is developing a generic drug and needs to ' +
    'determine the appropriate filing pathway and study requirements. ' + DETERMINISTIC_NOTE,
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
          '"inhalation", "intravenous").',
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
          'Must be true for a standard ANDA; if false, a suitability petition or 505(b)(2) is needed.',
      },
      sameRouteAsRLD: {
        type: 'boolean',
        description:
          'Whether the proposed product has the same route of administration as the RLD. ' +
          'A different route generally requires a 505(b)(2) NDA.',
      },
      sameStrengthAsRLD: {
        type: 'boolean',
        description:
          'Whether the proposed product has the same strength(s) as the RLD. ' +
          'A different strength may require a suitability petition.',
      },
      isCombinationProduct: {
        type: 'boolean',
        description:
          'Whether the product is a combination product with multiple active ingredients.',
      },
      bcsClass: {
        type: 'string',
        enum: ['I', 'II', 'III', 'IV'],
        description:
          'BCS classification of the drug, if known. Informs BE strategy recommendation.',
      },
      isNTI: {
        type: 'boolean',
        description:
          'Whether the drug is a narrow therapeutic index drug. Affects acceptance criteria.',
      },
    },
    required: [
      'activeIngredient',
      'dosageForm',
      'routeOfAdministration',
      'strengths',
      'sameDosageFormAsRLD',
      'sameRouteAsRLD',
      'sameStrengthAsRLD',
    ],
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
